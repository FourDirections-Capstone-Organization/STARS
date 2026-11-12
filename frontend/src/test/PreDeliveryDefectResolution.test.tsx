import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PreDeliveryTab, { DmsPendingOrder } from '../components/PreDeliveryTab/PreDeliveryTab';
import DmsDeliveryTab from '../components/DmsDeliveryTab/DmsDeliveryTab';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
    },
}));

vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

describe('Defect Resolution: Pre-Delivery Validation & Delivery Tracker Sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    const sampleOrder: DmsPendingOrder = {
        orderId: 1001,
        waybillNo: 'WB-2026-001001',
        clientName: 'Global Logistics',
        clientType: 'Corporate',
        contactNumber: '09170001111',
        senderAddress: 'Makati Logistics Hub',
        recipientName: 'Juanita Gomez',
        recipientContact: '09180001111',
        recipientAddress: '123 Ayala Ave, Makati',
        area: 'Makati',
        route: 'Route 1',
        status: 'Pending Approval',
        taskType: 'Delivery',
        packageType: 'Box',
        packageDescription: 'Urgent Spare Parts',
        itemCount: 1,
        weight: '2.0 kg',
        priority: 'High',
        orderDate: '2026-11-10T08:00:00Z',
        expectedDelivery: '2026-11-12T18:00:00Z',
    };

    it('Step 3 & 4: removes order from Awaiting STARS Task and shows it in Active Validation Tasks once task is created', async () => {
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/dms-integration/pending-orders')) {
                return Promise.resolve({ data: { isSuccess: true, data: [sampleOrder] } });
            }
            if (url.includes('/api/Task')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: [] });
        });

        const handleCreate = vi.fn();
        const { rerender } = render(
            <PreDeliveryTab tasks={[]} onCreateTaskForOrder={handleCreate} />
        );

        // Initially in "Awaiting STARS Task"
        await waitFor(() => {
            expect(screen.getByText('Juanita Gomez')).toBeInTheDocument();
            expect(screen.getByText('WB-2026-001001')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        fireEvent.click(createBtn);

        expect(handleCreate).toHaveBeenCalledTimes(1);

        // Now simulate that the task has been created in STARS with status "Assigned" / "In Progress"
        const createdTask = {
            taskId: 'task-1001',
            taskNumber: 'TSK-2026-001001',
            taskTitle: '[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001',
            taskDescription: 'Pre-delivery operational validation for DMS Waybill WB-2026-001001.',
            taskCategory: 'Delivery Operations',
            priority: 'High',
            status: 'Assigned',
            taskStatus: 'Assigned',
            deliveryDetails: {
                dmsOrderId: 1001,
                dmsWaybillNo: 'WB-2026-001001',
                recipientName: 'Juanita Gomez',
                dmsStatus: 'Pending Approval',
            },
        };

        rerender(
            <PreDeliveryTab tasks={[createdTask]} onCreateTaskForOrder={handleCreate} />
        );

        // 1. Order must be REMOVED from "Awaiting STARS Task"
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Create STARS Task/i })).not.toBeInTheDocument();
        });
        expect(screen.getByText('No Pending Pre-Delivery Orders')).toBeInTheDocument();

        // 2. Click "Active Validation Tasks" tab: task must be VISIBLE
        const activeSubTabBtn = screen.getByRole('button', { name: /Active Validation Tasks/i });
        fireEvent.click(activeSubTabBtn);

        await waitFor(() => {
            expect(screen.getByText('[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001')).toBeInTheDocument();
        });
        expect(screen.getByText('TSK-2026-001001')).toBeInTheDocument();
    });

    it('Step 5, 6 & 7: removes completed task from Active Validation Tasks and places it in Completed Tasks', async () => {
        const completedTask = {
            taskId: 'task-1001',
            taskNumber: 'TSK-2026-001001',
            taskTitle: '[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001',
            taskDescription: 'Pre-delivery operational validation for DMS Waybill WB-2026-001001.',
            taskCategory: 'Delivery Operations',
            priority: 'High',
            status: 'Completed',
            taskStatus: 'Completed',
            dueAt: '2026-11-12T18:00:00Z',
            deliveryDetails: {
                dmsOrderId: 1001,
                dmsWaybillNo: 'WB-2026-001001',
                recipientName: 'Juanita Gomez',
                dmsStatus: 'Delivered',
            },
        };

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/dms-integration/pending-orders')) {
                return Promise.resolve({ data: { isSuccess: true, data: [sampleOrder] } });
            }
            if (url.includes('/api/Task')) {
                return Promise.resolve({ data: { isSuccess: true, data: [completedTask] } });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: [] });
        });

        const onNavigateTracker = vi.fn();
        render(
            <PreDeliveryTab
                tasks={[completedTask]}
                onCreateTaskForOrder={vi.fn()}
                onNavigateToDeliveryTracker={onNavigateTracker}
            />
        );

        // In "Awaiting STARS Task": Order is NOT present because task exists
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Create STARS Task/i })).not.toBeInTheDocument();
        });

        // Switch to "Active Validation Tasks": Completed task must NOT be present
        const activeSubTabBtn = screen.getByRole('button', { name: /Active Validation Tasks/i });
        fireEvent.click(activeSubTabBtn);

        await waitFor(() => {
            expect(screen.getByText('No Active Validation Tasks')).toBeInTheDocument();
        });
        expect(screen.queryByText('[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001')).not.toBeInTheDocument();

        // Switch to "Completed Tasks" tab: Completed task MUST be present with action to track delivery
        const completedSubTabBtn = screen.getByRole('button', { name: /Completed Tasks/i });
        fireEvent.click(completedSubTabBtn);

        await waitFor(() => {
            expect(screen.getByText('[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001')).toBeInTheDocument();
            expect(screen.getByText('Validation Completed')).toBeInTheDocument();
        });

        const trackBtn = screen.getByRole('button', { name: /Track Delivery/i });
        fireEvent.click(trackBtn);
        expect(onNavigateTracker).toHaveBeenCalledTimes(1);
    });

    it('Step 8: completed task is in Delivery Tracker tab with Delivered (POD) status in sync with STARS', async () => {
        const completedTask = {
            taskId: 'task-1001',
            taskNumber: 'TSK-2026-001001',
            taskTitle: '[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001',
            taskStatus: 'Completed',
            status: 'Completed',
        };

        const deliveryRecord = {
            taskId: 'task-1001',
            taskTitle: '[Pre-Delivery] Delivery to Juanita Gomez - Waybill WB-2026-001001',
            taskNumber: 'TSK-2026-001001',
            recipientName: 'Juanita Gomez',
            recipientContact: '09180001111',
            deliveryAddress: '123 Ayala Ave, Makati',
            area: 'Makati',
            dmsWaybillNo: 'WB-2026-001001',
            dmsOrderId: 1001,
            dmsStatus: 'Pending Approval', // Initially stale on DMS side
            syncStatus: 'Synced',
            createdAt: '2026-11-10T08:00:00Z',
        };

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/integration/dms/performance-summary')) {
                return Promise.resolve({ data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({ data: { isSuccess: true, data: [deliveryRecord] } });
            }
            if (url.includes('/api/Task')) {
                return Promise.resolve({ data: { isSuccess: true, data: [completedTask] } });
            }
            return Promise.resolve({ data: [] });
        });

        render(
            <DmsDeliveryTab
                tasks={[completedTask]}
                onViewTask={vi.fn()}
            />
        );

        // The completed task MUST appear in the Delivery Tracker tab
        await waitFor(() => {
            expect(screen.getByText('Juanita Gomez')).toBeInTheDocument();
            expect(screen.getByText('WB-2026-001001')).toBeInTheDocument();
        });

        // The status must be reconciled from stale "Pending Approval" to "Delivered (POD)"
        const deliveredPill = document.querySelector('.dms-status-pill.dms-status-delivered');
        expect(deliveredPill).toBeInTheDocument();
        expect(deliveredPill).toHaveTextContent(/Delivered \(POD\)/i);
        expect(screen.queryByText(/Ready \/ Dispatched/i)).not.toBeInTheDocument();
    });
});

