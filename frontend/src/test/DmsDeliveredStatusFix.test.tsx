import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DmsDeliveryTab, { DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
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

describe('Defect 1 Fix: Delivered delivery status never fails or displays as FAILED', () => {
    const mockTasks = [
        {
            taskId: 'task-del-001',
            taskTitle: 'Important Contract Dispatch',
            taskNumber: '2001',
            taskReferenceNumber: 'REF-2001',
            taskStatus: 'Completed',
        },
    ];

    const mockDeliveredWithFailedSync: DmsDeliveryItem = {
        taskId: 'task-del-001',
        taskTitle: 'Important Contract Dispatch',
        taskNumber: '2001',
        taskReferenceNumber: 'REF-2001',
        recipientName: 'Elena Rostova',
        recipientContact: '0917-123-4567',
        deliveryAddress: 'Ayala Ave, Makati City',
        area: 'Makati',
        dmsWaybillNo: 'WB-DEL-2026-001',
        dmsOrderId: 9001,
        dmsStatus: 'Delivered',
        dmsRawStatus: 'Delivered',
        syncStatus: 'Failed', // Simulates historical API sync glitch
        courierFullName: 'Juan Dela Cruz',
        courierEmployeeId: 'EMP-001',
        dmsFailureReason: 'Attempt #1 failed: recipient temporarily unavailable.', // Historical failure reason
        dmsLastSyncedAt: '2026-11-26T12:00:00Z',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/integration/dms/performance-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalDeliveries: 1,
                            onTimeCount: 1,
                            lateCount: 0,
                            onTimePercentage: 100,
                        },
                    },
                });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: [mockDeliveredWithFailedSync],
                    },
                });
            }
            if (url.includes('/api/dms-integration/pending-orders')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/delivery-details')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            ...mockDeliveredWithFailedSync,
                            id: 'del-9001',
                        },
                    },
                });
            }
            if (url.includes('/pod')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            taskId: 'task-del-001',
                            waybillNo: 'WB-DEL-2026-001',
                            hasPod: true,
                            podUrl: 'https://example.com/pod.jpg',
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
    });

    it('renders Delivered (POD) status pill and complete view even when syncStatus is Failed', async () => {
        render(<DmsDeliveryTab tasks={mockTasks as any} />);

        await waitFor(() => {
            expect(screen.getByText('WB-DEL-2026-001')).toBeInTheDocument();
        });

        // Verify status pill in table renders Delivered (POD), NOT Delivery Failed
        expect(screen.getAllByText('Delivered (POD)').length).toBeGreaterThan(0);
        expect(screen.queryByText('Delivery Failed')).not.toBeInTheDocument();

        // Verify stats: delivered is 1, failed is 0
        expect(screen.getByText('Delivered (1)')).toBeInTheDocument();
        expect(screen.getByText('Exceptions (0)')).toBeInTheDocument();

        // Click on the row to open detail tracking view
        const trackerBtn = screen.getByRole('button', { name: /Track/i });
        fireEvent.click(trackerBtn);

        await waitFor(() => {
            expect(screen.getByText('Delivery Journey & Milestone Progression')).toBeInTheDocument();
        });

        // Ensure failure view and failure banners are NOT rendered
        expect(screen.queryByTestId('dms-terminal-failed-view')).not.toBeInTheDocument();
        expect(screen.queryByTestId('dms-detail-failed-pill')).not.toBeInTheDocument();
        expect(screen.queryByText('Delivery Attempt Failed')).not.toBeInTheDocument();
        expect(screen.queryByText('Delivery Status: Failed')).not.toBeInTheDocument();

        // Historical failure alert should be suppressed because the delivery is completed
        expect(screen.queryByText(/Attempt #1 failed: recipient temporarily unavailable/i)).not.toBeInTheDocument();
    });

    it('suppresses historical failure warning box in TaskView when order is Delivered', async () => {
        const task: TaskViewTask = {
            taskId: 'task-del-001',
            taskTitle: 'Important Contract Dispatch',
            taskDescription: 'Delivery of contract documents',
            priority: 'High',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            taskStatus: 'In Progress',
            assignedEmployee: 'Juan Dela Cruz',
            createdByEmployee: 'Operations Dispatch',
            assignedTo: 'Juan Dela Cruz',
            createdAt: new Date().toISOString(),
        };

        render(<TaskView task={task} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('WB-DEL-2026-001')).toBeInTheDocument();
        });

        // The historical failure box should NOT be displayed when delivered
        expect(screen.queryByTestId('tv-dms-failure-box')).not.toBeInTheDocument();
        expect(screen.queryByText(/Delivery Issue Reported/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/DMS Transmission Failed/i)).not.toBeInTheDocument();
    });
});
