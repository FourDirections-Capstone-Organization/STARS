import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import DmsDeliveryTab, { DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
    },
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: mockToastSuccess,
        error: mockToastError,
        info: vi.fn(),
    }),
}));

describe('Defect 2 Fix: Live Auto-Sync and Instant UI Reflection Without Page Refresh', () => {
    const baseTask: TaskViewTask = {
        taskId: 'task-live-sync-01',
        taskTitle: 'Critical Equipment Delivery',
        taskDescription: 'Courier delivery of field gear',
        priority: 'High',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'In Progress',
        assignedEmployee: 'Driver Juan',
        createdByEmployee: 'Operations Dispatch',
        assignedTo: 'Driver Juan',
        createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('auto-syncs task to Completed when delivery reaches Delivered status and calls onUpdate without reload', async () => {
        let callCount = 0;
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/delivery-details')) {
                callCount++;
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'del-sync-1',
                            taskId: 'task-live-sync-01',
                            recipientName: 'Alice Green',
                            recipientContact: '0917-000-1111',
                            deliveryAddress: 'Ortigas Center, Pasig',
                            dmsWaybillNo: 'WB-SYNC-001',
                            dmsStatus: 'Delivered',
                            dmsRawStatus: 'Delivered',
                            syncStatus: 'Synced',
                            dmsLastSyncedAt: new Date().toISOString(),
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        const onUpdateMock = vi.fn();
        render(<TaskView task={baseTask} onUpdate={onUpdateMock} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('WB-SYNC-001')).toBeInTheDocument();
        });

        // Verify onUpdate was automatically called with Completed task status
        await waitFor(() => {
            expect(onUpdateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskId: 'task-live-sync-01',
                    taskStatus: 'Completed',
                })
            );
        });

        // The Status badge reflects Delivered
        expect(screen.getByTestId('tv-dms-status-badge')).toHaveTextContent(/Delivered/i);
    });

    it('provides an instant one-click Re-sync button in waybill banner that triggers DMS sync and reflects immediately', async () => {
        let isDelivered = false;
        (api.post as any).mockImplementation((url: string) => {
            if (url.includes('/api/dms-integration/tasks/task-live-sync-01/sync')) {
                isDelivered = true;
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'del-sync-2',
                            taskId: 'task-live-sync-01',
                            recipientName: 'Alice Green',
                            dmsWaybillNo: 'WB-SYNC-002',
                            dmsStatus: 'Delivered',
                            dmsRawStatus: 'Delivered',
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true } });
        });

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/delivery-details')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'del-sync-2',
                            taskId: 'task-live-sync-01',
                            recipientName: 'Alice Green',
                            recipientContact: '0917-000-1111',
                            deliveryAddress: 'Ortigas Center, Pasig',
                            dmsWaybillNo: 'WB-SYNC-002',
                            dmsStatus: isDelivered ? 'Delivered' : 'In Transit',
                            dmsRawStatus: isDelivered ? 'Delivered' : 'In Transit',
                            syncStatus: 'Synced',
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        render(<TaskView task={baseTask} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('WB-SYNC-002')).toBeInTheDocument();
        });

        // Initially In Transit
        expect(screen.getByTestId('tv-dms-status-badge')).toHaveTextContent(/In Transit/i);

        // Click Re-sync button
        const syncBtn = screen.getByTestId('tv-dms-sync-btn');
        fireEvent.click(syncBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                '/api/dms-integration/tasks/task-live-sync-01/sync',
                {}
            );
        });

        // Immediately reflects Delivered without requiring a full page refresh
        await waitFor(() => {
            expect(screen.getByTestId('tv-dms-status-badge')).toHaveTextContent(/Delivered/i);
        });
    });
});
