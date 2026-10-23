import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
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

describe('TaskView - 7-Stage DMS Delivery Stepper', () => {
    const baseTask: TaskViewTask = {
        taskId: 'task-delivery-01',
        taskTitle: 'Deliver Express Package',
        taskDescription: 'Delivery of contract documents',
        priority: 'High',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'In Progress',
        assignedEmployee: 'Courier Alpha',
        createdByEmployee: 'Operations Dispatch',
        assignedTo: 'Courier Alpha',
        createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders all 7 DMS delivery stages when order is in Out for Delivery status', async () => {
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/delivery-details')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'del-101',
                            taskId: 'task-delivery-01',
                            recipientName: 'Maria Santos',
                            recipientContact: '09171234567',
                            deliveryAddress: 'High Street South, BGC',
                            dmsWaybillNo: 'WB-2026-990011',
                            dmsStatus: 'In Transit',
                            dmsRawStatus: 'Out for Delivery',
                            syncStatus: 'Synced',
                            dmsLastSyncedAt: new Date().toISOString(),
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        render(<TaskView task={baseTask} onClose={vi.fn()} />);

        // Wait for delivery detail to load
        await waitFor(() => {
            expect(screen.getByText('WB-2026-990011')).toBeInTheDocument();
        });

        // Verify all 7 stages exist in the document
        expect(screen.getByText('PENDING')).toBeInTheDocument();
        expect(screen.getByText('PROCESSING')).toBeInTheDocument();
        expect(screen.getByText('ASSIGNED')).toBeInTheDocument();
        expect(screen.getByText('PICKED UP')).toBeInTheDocument();
        expect(screen.getByText('IN TRANSIT')).toBeInTheDocument();
        expect(screen.getByText('OUT FOR DELIVERY')).toBeInTheDocument();
        expect(screen.getByText('DELIVERED')).toBeInTheDocument();
    });

    it('marks all stages as completed when status is Delivered', async () => {
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/delivery-details')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'del-102',
                            taskId: 'task-delivery-01',
                            recipientName: 'Roberto Cruz',
                            recipientContact: '09187654321',
                            deliveryAddress: 'Makati CBD',
                            dmsWaybillNo: 'WB-2026-990022',
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

        const { container } = render(<TaskView task={baseTask} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('WB-2026-990022')).toBeInTheDocument();
        });

        // All 7 steps should have the 'done' class
        const doneSteps = container.querySelectorAll('.tv-dms-step.done');
        expect(doneSteps.length).toBe(7);
    });
});
