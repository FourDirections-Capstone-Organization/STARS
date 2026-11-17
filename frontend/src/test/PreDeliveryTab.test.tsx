import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PreDeliveryTab, { DmsPendingOrder } from '../components/PreDeliveryTab/PreDeliveryTab';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
    },
}));

vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

describe('PreDeliveryTab Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('filters out mock and dummy orders and sorts newly created DMS orders to the top', async () => {
        const dmsOrders: DmsPendingOrder[] = [
            {
                orderId: 101,
                waybillNo: 'WB-2026-000101',
                clientName: 'Alpha Logistics',
                clientType: 'Corporate',
                contactNumber: '09171112222',
                senderAddress: 'Makati City',
                recipientName: 'Recipient Older Order',
                recipientContact: '09181112222',
                recipientAddress: 'Ortigas, Pasig',
                area: 'Pasig',
                route: 'Route A',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Box',
                packageDescription: 'Office Supplies',
                itemCount: 1,
                weight: '2.5 kg',
                priority: 'Medium',
                orderDate: '2026-10-20T10:00:00Z',
                expectedDelivery: '2026-10-22T18:00:00Z',
            },
            {
                orderId: 999,
                waybillNo: 'WB-MOCK-999',
                clientName: 'Mock Client Inc',
                clientType: 'Corporate',
                contactNumber: '09170000000',
                senderAddress: 'Mock Address',
                recipientName: 'Dummy Test Recipient',
                recipientContact: '09180000000',
                recipientAddress: 'Mock Street',
                area: 'Test Area',
                route: 'Route Mock',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Box',
                packageDescription: 'Sample dummy parcel',
                itemCount: 1,
                weight: '1.0 kg',
                priority: 'Low',
                orderDate: '2026-10-23T12:00:00Z',
                expectedDelivery: '2026-10-24T18:00:00Z',
            },
            {
                orderId: 105,
                waybillNo: 'WB-2026-000105',
                clientName: 'Beta Enterprises',
                clientType: 'Retail',
                contactNumber: '09173334444',
                senderAddress: 'Taguig City',
                recipientName: 'Brand New DMS Order',
                recipientContact: '09183334444',
                recipientAddress: 'BGC, Taguig',
                area: 'Taguig',
                route: 'Route B',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Parcel',
                packageDescription: 'Computer Parts',
                itemCount: 2,
                weight: '4.0 kg',
                priority: 'High',
                orderDate: '2026-10-23T15:30:00Z',
                expectedDelivery: '2026-10-24T18:00:00Z',
            },
        ];

        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: dmsOrders },
        });

        const handleCreateTask = vi.fn();

        render(
            <PreDeliveryTab
                tasks={[]}
                onCreateTaskForOrder={handleCreateTask}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Brand New DMS Order')).toBeInTheDocument();
            expect(screen.getByText('Recipient Older Order')).toBeInTheDocument();
        });

        // Verify mock data was removed
        expect(screen.queryByText('Dummy Test Recipient')).not.toBeInTheDocument();
        expect(screen.queryByText('WB-MOCK-999')).not.toBeInTheDocument();
        expect(screen.queryByText('Sample dummy parcel')).not.toBeInTheDocument();

        // Verify the newly created DMS order is displayed at the top of the table rows
        const rows = screen.getAllByRole('row');
        // Row 0 is the header, Row 1 should be the newest order
        expect(rows[1]).toHaveTextContent('Brand New DMS Order');
        expect(rows[1]).toHaveTextContent('WB-2026-000105');
        expect(rows[2]).toHaveTextContent('Recipient Older Order');
        expect(rows[2]).toHaveTextContent('WB-2026-000101');
    });

    it('filters out mock tasks in active validation tab', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [] },
        });

        const tasks = [
            {
                taskId: 't-1',
                taskNumber: 'TSK-001',
                taskTitle: '[Pre-Delivery] Delivery to Real Client - Waybill WB-101',
                taskDescription: 'Real delivery description',
                taskCategory: 'Delivery Operations',
                priority: 'High',
                status: 'InProgress',
                createdAt: '2026-10-23T14:00:00Z',
            },
            {
                taskId: 't-2',
                taskNumber: 'TSK-MOCK',
                taskTitle: 'Sample Dummy Mock Task',
                taskDescription: 'Dummy pre-delivery mock',
                taskCategory: 'Delivery Operations',
                priority: 'Low',
                status: 'InProgress',
                createdAt: '2026-10-23T16:00:00Z',
            },
        ];

        render(
            <PreDeliveryTab
                tasks={tasks}
                onCreateTaskForOrder={vi.fn()}
            />
        );

        // Click on "Active Validation Tasks" tab
        const activeTabBtn = screen.getByRole('button', { name: /Active Validation Tasks/i });
        activeTabBtn.click();

        await waitFor(() => {
            expect(screen.getByText('[Pre-Delivery] Delivery to Real Client - Waybill WB-101')).toBeInTheDocument();
        });

        expect(screen.queryByText('Sample Dummy Mock Task')).not.toBeInTheDocument();
    });

    it('passes driverEmployeeId and driverName when clicking Create Operational Task', async () => {
        const dmsOrders: DmsPendingOrder[] = [
            {
                orderId: 501,
                waybillNo: 'WB-2026-000501',
                clientName: 'Speedex VIP',
                clientType: 'Enterprise',
                contactNumber: '09171234567',
                senderAddress: 'Makati Hub',
                recipientName: 'Luisa Reyes',
                recipientContact: '09181234567',
                recipientAddress: 'BGC, Taguig',
                area: 'Taguig',
                route: 'BGC Loop',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Parcel',
                packageDescription: 'Legal Documents',
                itemCount: 1,
                weight: '1.0 kg',
                priority: 'High',
                orderDate: '2026-11-11T09:00:00Z',
                expectedDelivery: '2026-11-15T00:00:00Z',
                driverEmployeeId: 'EMP-008',
                driverName: 'Ricardo Bautista',
            },
        ];

        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: dmsOrders },
        });

        const handleCreateTask = vi.fn();

        render(
            <PreDeliveryTab
                tasks={[]}
                onCreateTaskForOrder={handleCreateTask}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Luisa Reyes')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        createBtn.click();

        expect(handleCreateTask).toHaveBeenCalledTimes(1);
        expect(handleCreateTask).toHaveBeenCalledWith(
            expect.objectContaining({
                orderId: 501,
                waybillNo: 'WB-2026-000501',
                driverEmployeeId: 'EMP-008',
                driverName: 'Ricardo Bautista',
            })
        );
    });

    it('REG-01 & REG-02: excludes orders already in tasks from Awaiting STARS Task (cross-tab exclusion and status consistency)', async () => {
        const dmsOrders: DmsPendingOrder[] = [
            {
                orderId: 201,
                waybillNo: 'WB-2026-000201',
                clientName: 'Active Client Corp',
                clientType: 'Corporate',
                contactNumber: '09170001111',
                senderAddress: 'Makati',
                recipientName: 'Order Already In Task',
                recipientContact: '09180001111',
                recipientAddress: 'Manila',
                area: 'Manila',
                route: 'Route A',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Box',
                packageDescription: 'Office Gear',
                itemCount: 1,
                weight: '1.5 kg',
                priority: 'Medium',
                orderDate: '2026-11-01T10:00:00Z',
                expectedDelivery: '2026-11-05T00:00:00Z',
            },
            {
                orderId: 202,
                waybillNo: 'WB-2026-000202',
                clientName: 'New Client Corp',
                clientType: 'Corporate',
                contactNumber: '09170002222',
                senderAddress: 'Pasig',
                recipientName: 'Awaiting Order Unassigned',
                recipientContact: '09180002222',
                recipientAddress: 'Quezon City',
                area: 'Quezon City',
                route: 'Route B',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Parcel',
                packageDescription: 'Documents',
                itemCount: 1,
                weight: '0.5 kg',
                priority: 'High',
                orderDate: '2026-11-02T10:00:00Z',
                expectedDelivery: '2026-11-06T00:00:00Z',
            },
        ];

        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: dmsOrders },
        });

        const activeTasks = [
            {
                taskId: 'task-active-1',
                taskNumber: 'TSK-2026-00201',
                taskTitle: '[Pre-Delivery] Delivery to Order Already In Task - Waybill WB-2026-000201',
                taskCategory: 'Delivery Operations',
                priority: 'Medium',
                status: 'InProgress',
                deliveryDetails: {
                    dmsOrderId: 201,
                    dmsWaybillNo: 'WB-2026-000201',
                },
            },
        ];

        render(
            <PreDeliveryTab
                tasks={activeTasks}
                onCreateTaskForOrder={vi.fn()}
            />
        );

        // Under "Awaiting STARS Task": Order 201 must be excluded, only Order 202 is shown
        await waitFor(() => {
            expect(screen.getByText('Awaiting Order Unassigned')).toBeInTheDocument();
        });
        expect(screen.queryByText('Order Already In Task')).not.toBeInTheDocument();

        // Switch to "Active Validation Tasks" sub-tab
        const activeTabBtn = screen.getByRole('button', { name: /Active Validation Tasks/i });
        activeTabBtn.click();

        await waitFor(() => {
            expect(screen.getByText('[Pre-Delivery] Delivery to Order Already In Task - Waybill WB-2026-000201')).toBeInTheDocument();
        });
        // Confirms uniform status and single-tab presence
        expect(screen.queryByText('Awaiting Order Unassigned')).not.toBeInTheDocument();
    });

    it('REG-05: excludes completed, done, and cancelled tasks from Active Validation Tasks sub-tab', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [] },
        });

        const mixedTasks = [
            {
                taskId: 't-in-progress',
                taskNumber: 'TSK-IN-PROGRESS',
                taskTitle: 'Active Validation Task In Progress',
                taskCategory: 'Delivery Operations',
                priority: 'High',
                status: 'InProgress',
                createdAt: '2026-11-03T10:00:00Z',
            },
            {
                taskId: 't-completed',
                taskNumber: 'TSK-COMPLETED',
                taskTitle: 'Validation Task Completed',
                taskCategory: 'Delivery Operations',
                priority: 'Medium',
                status: 'Completed',
                createdAt: '2026-11-03T11:00:00Z',
            },
            {
                taskId: 't-done',
                taskNumber: 'TSK-DONE',
                taskTitle: 'Validation Task Done',
                taskCategory: 'Delivery Operations',
                priority: 'Low',
                status: 'Done',
                createdAt: '2026-11-03T12:00:00Z',
            },
            {
                taskId: 't-cancelled',
                taskNumber: 'TSK-CANCELLED',
                taskTitle: 'Validation Task Cancelled',
                taskCategory: 'Delivery Operations',
                priority: 'Low',
                status: 'Cancelled',
                createdAt: '2026-11-03T13:00:00Z',
            },
        ];

        render(
            <PreDeliveryTab
                tasks={mixedTasks}
                onCreateTaskForOrder={vi.fn()}
            />
        );

        const activeTabBtn = screen.getByRole('button', { name: /Active Validation Tasks/i });
        activeTabBtn.click();

        await waitFor(() => {
            expect(screen.getByText('Active Validation Task In Progress')).toBeInTheDocument();
        });

        // Completed, Done, and Cancelled tasks must have exited the tab
        expect(screen.queryByText('Validation Task Completed')).not.toBeInTheDocument();
        expect(screen.queryByText('Validation Task Done')).not.toBeInTheDocument();
        expect(screen.queryByText('Validation Task Cancelled')).not.toBeInTheDocument();
    });

    it('refetches pending orders when refreshPendingTrigger updates', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [] },
        });

        const { rerender } = render(
            <PreDeliveryTab
                tasks={[]}
                onCreateTaskForOrder={vi.fn()}
                refreshPendingTrigger={0}
            />
        );

        expect(api.get).toHaveBeenCalledTimes(1);

        rerender(
            <PreDeliveryTab
                tasks={[]}
                onCreateTaskForOrder={vi.fn()}
                refreshPendingTrigger={1}
            />
        );

        expect(api.get).toHaveBeenCalledTimes(2);
    });
});
