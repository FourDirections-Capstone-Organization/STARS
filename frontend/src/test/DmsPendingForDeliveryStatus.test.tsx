import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { formatDeliveryStatus } from '../utils/statusUtils';
import { syncDmsTaskCompleted } from '../utils/dmsSyncUtils';
import { DmsDeliveryTab, DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import api from '../api';

// Mock Recharts
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock api
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

// Mock Toast
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

describe('STARS-DMS Integ 2: "Pending for Delivery" Status Display Fix', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('authToken', 'test-token');
    });

    describe('formatDeliveryStatus helper', () => {
        it('normalizes "Pending", "pending", and "Pending Approval" to "Pending for Delivery"', () => {
            expect(formatDeliveryStatus('Pending')).toBe('Pending for Delivery');
            expect(formatDeliveryStatus('pending')).toBe('Pending for Delivery');
            expect(formatDeliveryStatus('pending approval')).toBe('Pending for Delivery');
            expect(formatDeliveryStatus('Pending for Delivery')).toBe('Pending for Delivery');
            expect(formatDeliveryStatus(null)).toBe('Pending for Delivery');
            expect(formatDeliveryStatus(undefined)).toBe('Pending for Delivery');
            expect(formatDeliveryStatus('')).toBe('Pending for Delivery');
        });

        it('preserves other legitimate statuses like Delivered, In Transit, Cancelled', () => {
            expect(formatDeliveryStatus('Delivered')).toBe('Delivered');
            expect(formatDeliveryStatus('In Transit')).toBe('In Transit');
            expect(formatDeliveryStatus('Cancelled')).toBe('Cancelled');
            expect(formatDeliveryStatus('Out for Delivery')).toBe('Out for Delivery');
        });
    });

    describe('syncDmsTaskCompleted utility', () => {
        it('sets dmsStatus to "Pending for Delivery" instead of "Delivered" when task is completed', async () => {
            const taskId = 'task-test-sync-1';
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        taskId,
                        recipientName: 'Acme Logistics',
                        recipientContact: '09123456789',
                        deliveryAddress: '456 Manila Ave',
                        dmsOrderId: 101,
                        dmsWaybillNo: 'WB-2026-9999',
                        dmsStatus: 'Pending',
                        itemCount: 3,
                    },
                },
            });
            vi.mocked(api.post).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        dmsStatus: 'Pending',
                    },
                },
            });
            vi.mocked(api.put).mockResolvedValueOnce({
                data: { isSuccess: true },
            });

            await syncDmsTaskCompleted(taskId);

            expect(api.put).toHaveBeenCalledWith(
                `/api/dms-integration/tasks/${taskId}/delivery-details`,
                expect.objectContaining({
                    dmsStatus: 'Pending for Delivery',
                    itemCount: 3,
                })
            );
            // Must NOT have sent 'Delivered'
            expect(api.put).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    dmsStatus: 'Delivered',
                })
            );
        });
    });

    describe('DmsDeliveryTab status display', () => {
        it('displays "Pending for Delivery" and does NOT override to "Delivered" when STARS task is completed', async () => {
            const mockDelivery: DmsDeliveryItem = {
                taskId: 'completed-task-01',
                taskTitle: 'Deliver Medical Supplies',
                recipientName: 'Hospital Pharmacy',
                recipientContact: '09181234567',
                deliveryAddress: 'Manila Medical Center',
                dmsWaybillNo: 'WB-2026-PND-01',
                dmsStatus: 'Pending',
                dmsRawStatus: 'Pending',
                syncStatus: 'Synced',
                itemCount: 3,
            };

            const completedTasks = [
                {
                    taskId: 'completed-task-01',
                    taskTitle: 'Deliver Medical Supplies',
                    taskStatus: 'Completed',
                },
            ];

            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [mockDelivery] } };
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { isSuccess: true, data: { totalDeliveries: 1, onTimeCount: 0, lateCount: 0, onTimePercentage: 100 } } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab tasks={completedTasks} onViewTask={vi.fn()} />);

            await waitFor(() => {
                // Table should display "Pending for Delivery", NOT "Delivered"
                const pendingPills = screen.getAllByText(/Pending for Delivery/i);
                expect(pendingPills.length).toBeGreaterThan(0);
                expect(document.querySelector('.dms-status-delivered')).not.toBeInTheDocument();
            });
        });

        it('renders "Pending for Delivery" in detail view stepper summary and does NOT mark stage 7 (Delivered)', async () => {
            const mockDelivery: DmsDeliveryItem = {
                taskId: 'completed-task-02',
                taskTitle: 'Deliver Medical Supplies',
                recipientName: 'Hospital Pharmacy',
                recipientContact: '09181234567',
                deliveryAddress: 'Manila Medical Center',
                dmsWaybillNo: 'WB-2026-PND-02',
                dmsStatus: 'Pending',
                dmsRawStatus: 'Pending',
                syncStatus: 'Synced',
                itemCount: 3,
            };

            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [mockDelivery] } };
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { isSuccess: true, data: { totalDeliveries: 1, onTimeCount: 0, lateCount: 0, onTimePercentage: 100 } } };
                }
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: null } };
                }
                if (url.includes('/delivery-details')) {
                    return { data: { isSuccess: true, data: mockDelivery } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab tasks={[]} onViewTask={vi.fn()} initialWaybillNo="WB-2026-PND-02" />);

            await waitFor(() => {
                // Stepper summary must show Stage 1 of 7: Pending for Delivery
                expect(screen.getByText(/Stage 1 of 7/i)).toBeInTheDocument();
                expect(screen.getAllByText(/Pending for Delivery/i).length).toBeGreaterThan(0);
                // Must not claim Stage 7
                expect(screen.queryByText(/Stage 7 of 7/i)).not.toBeInTheDocument();
            });
        });
        it('single click on "Sync with DMS" updates delivery status and POD immediately without multiple refreshes', async () => {
            const initialMockDelivery: DmsDeliveryItem = {
                taskId: 'task-sync-single-01',
                taskTitle: 'Express Logistics Parcel',
                recipientName: 'Apex Health',
                recipientContact: '09191112222',
                deliveryAddress: 'Quezon City Hospital',
                dmsWaybillNo: 'WB-2026-SYNC-01',
                dmsStatus: 'Pending',
                dmsRawStatus: 'Pending',
                syncStatus: 'Synced',
            };

            const updatedMockDelivery: DmsDeliveryItem = {
                ...initialMockDelivery,
                dmsStatus: 'In Transit',
                dmsRawStatus: 'In Transit',
            };

            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [initialMockDelivery] } };
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { isSuccess: true, data: { totalDeliveries: 1, onTimeCount: 0, lateCount: 0, onTimePercentage: 100 } } };
                }
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: null } };
                }
                if (url.includes('/delivery-details')) {
                    return { data: { isSuccess: true, data: initialMockDelivery } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            vi.mocked(api.post).mockImplementation(async (url: string) => {
                if (url.includes('/sync')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: updatedMockDelivery,
                        },
                    };
                }
                return { data: { isSuccess: true } };
            });

            const { fireEvent } = await import('@testing-library/react');
            render(<DmsDeliveryTab tasks={[]} onViewTask={vi.fn()} initialWaybillNo="WB-2026-SYNC-01" />);

            await waitFor(() => {
                expect(screen.getByText(/Stage 1 of 7/i)).toBeInTheDocument();
            });

            // Mock subsequent GET returns updated delivery after sync
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/dms-integration/deliveries') || url.includes('/delivery-details')) {
                    return { data: { isSuccess: true, data: [updatedMockDelivery] } };
                }
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: null } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            const syncBtn = screen.getByRole('button', { name: /Sync with DMS/i });
            fireEvent.click(syncBtn);

            // After a single sync click, status must immediately advance to In Transit
            await waitFor(() => {
                expect(screen.getByText(/In Transit/i)).toBeInTheDocument();
            });
            expect(api.post).toHaveBeenCalledWith(
                expect.stringContaining('/tasks/task-sync-single-01/sync'),
                expect.anything()
            );
        });
    });

    describe('TaskView delivery status tag', () => {
        it('renders Status: Pending for Delivery on TaskView when dmsStatus is Pending', async () => {
            const mockTask: TaskViewTask = {
                taskId: 'task-tv-pending-01',
                taskTitle: 'Pre-Delivery Operational Validation',
                priority: 'High',
                taskStatus: 'Completed',
                assignedEmployee: 'Jane Coordinator',
            };

            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/delivery-details')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                recipientName: 'Acme Logistics',
                                deliveryAddress: '123 Harbor Rd',
                                dmsWaybillNo: 'WB-2026-449612',
                                dmsStatus: 'Pending',
                                itemCount: 3,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const statusBadge = screen.getByTestId('tv-dms-status-badge');
                expect(statusBadge).toBeInTheDocument();
                expect(statusBadge).toHaveTextContent('Status: Pending for Delivery');
                expect(statusBadge).not.toHaveTextContent('Status: Delivered');
            });
        });
    });
});
