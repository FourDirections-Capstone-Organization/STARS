import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskManager, { TMTask } from '../components/TaskManager/TaskManager';
import { ReportsTab } from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
import api from '../api';

// Mock Recharts ResponsiveContainer to render children in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock KpiDrillDownView
vi.mock('../Pages/OpAdmin_Dashboard/KpiDrillDown', () => ({
    KpiDrillDownView: () => <div data-testid="mock-kpi-drilldown">KPI Drilldown View</div>,
}));

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

describe('Defect Fix Verification: Completed Tab Status & Delivery Analytics Fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Task Tab -> Completed status display', () => {
        it('displays "Completed" (badge-green) and never "Pending Review" for completed tasks', () => {
            const completedTasks: TMTask[] = [
                {
                    id: 'task-comp-1',
                    name: 'Deliver Medical Supplies to Makati Medical',
                    taskNumber: 'TSK-2026-001',
                    status: 'Completed',
                    priority: 'Urgent',
                    progress: 100,
                    assignee: { id: 'emp-1', name: 'Carlos Courier' },
                    dueDate: '2026-11-10T12:00:00Z',
                },
                {
                    id: 'task-comp-2',
                    name: 'Dispatch Urgent Logistics Document Batch',
                    taskNumber: 'TSK-2026-002',
                    status: 'Done',
                    priority: 'High',
                    progress: 100,
                    assignee: { id: 'emp-2', name: 'Maria Santos' },
                    dueDate: '2026-11-10T14:00:00Z',
                },
            ];

            render(
                <TaskManager
                    tasks={completedTasks}
                    activeTab="completed"
                    onTabChange={vi.fn()}
                    filterPrio=""
                    onFilterPrioChange={vi.fn()}
                    filterStatus=""
                    onFilterStatusChange={vi.fn()}
                    filterClassification=""
                    onFilterClassificationChange={vi.fn()}
                    filterAssignee=""
                    onFilterAssigneeChange={vi.fn()}
                    teamMembers={[{ accountId: 'emp-1', employeeName: 'Carlos Courier' }]}
                    onNewTask={vi.fn()}
                    onEdit={vi.fn()}
                    onView={vi.fn()}
                    onArchive={vi.fn()}
                    onRestore={vi.fn()}
                    onDelete={vi.fn()}
                    onMarkDone={vi.fn()}
                />
            );

            // In the Completed tab, both tasks should display "Completed"
            const completedBadges = screen.getAllByText('Completed');
            expect(completedBadges.length).toBeGreaterThanOrEqual(2);

            // Verify badge-green class is applied
            const badgeElements = screen.getAllByText('Completed').filter(el => el.classList.contains('badge'));
            expect(badgeElements.length).toBe(2);
            badgeElements.forEach(badge => {
                expect(badge).toHaveClass('badge-green');
                expect(badge).not.toHaveClass('badge-purple');
            });

            // Absolutely NO "Pending Review" badges should be displayed in the Completed tab!
            expect(screen.queryByText('Pending Review')).not.toBeInTheDocument();
            expect(screen.queryByText('Pending Admin Review')).not.toBeInTheDocument();
        });
    });

    describe('Report Tab -> Delivery Analytics empty fallback', () => {
        it('populates Delivery Analytics using fallback when /performance-summary returns empty records', async () => {
            // Mock performance-summary returning empty records
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                totalDeliveries: 0,
                                onTimeCount: 0,
                                lateCount: 0,
                                onTimePercentage: 100,
                                driverFilter: null,
                                records: [],
                            },
                        },
                    });
                }
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                {
                                    taskId: '11111111-1111-1111-1111-111111111111',
                                    taskTitle: 'Urgent Vaccine Delivery to Manila Hospital',
                                    recipientName: 'Dr. Rizal',
                                    dmsWaybillNo: 'WB-MANILA-001',
                                    dmsStatus: 'Delivered',
                                    courierEmployeeId: 'DRV-001',
                                    courierFullName: 'Juan Dela Cruz',
                                    courierIsActive: true,
                                    createdAt: '2026-11-01T08:00:00Z',
                                    dmsLastSyncedAt: '2026-11-01T10:00:00Z',
                                    expectedDelivery: '2026-11-01T12:00:00Z',
                                    isOnTime: true,
                                },
                                {
                                    taskId: '22222222-2222-2222-2222-222222222222',
                                    taskTitle: 'Standard Parcel Delivery to Makati Hub',
                                    recipientName: 'Maria Santos',
                                    dmsWaybillNo: 'WB-MAKATI-002',
                                    dmsStatus: 'Delivered',
                                    courierEmployeeId: 'DRV-002',
                                    courierFullName: 'Pedro Penduko',
                                    courierIsActive: true,
                                    createdAt: '2026-11-01T09:00:00Z',
                                    dmsLastSyncedAt: '2026-11-01T16:00:00Z',
                                    expectedDelivery: '2026-11-01T14:00:00Z',
                                    isOnTime: false,
                                },
                            ],
                        },
                    });
                }
                if (url.includes('/api/dms-integration/pending-orders')) {
                    return Promise.resolve({ data: { isSuccess: true, data: [] } });
                }
                if (url.includes('/api/reports/kpi')) {
                    return Promise.resolve({ data: { isSuccess: true, data: { cards: [] } } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <MemoryRouter>
                    <ReportsTab
                        teamMembers={[{ accountId: 'emp-1', employeeName: 'Juan Dela Cruz' }]}
                    />
                </MemoryRouter>
            );

            // Switch to Delivery Analytics subtab
            const deliveryAnalyticsBtn = screen.getByText('Delivery Analytics');
            fireEvent.click(deliveryAnalyticsBtn);

            // Verify that fallback data was loaded and Delivery Analytics is NOT empty!
            await waitFor(() => {
                expect(screen.getByText('DMS Delivery Completion & SLA Performance Analytics')).toBeInTheDocument();
            });

            // Total deliveries stat card should display "2" (not 0!)
            await waitFor(() => {
                expect(screen.getByText('WB-MANILA-001')).toBeInTheDocument();
                expect(screen.getByText('WB-MAKATI-002')).toBeInTheDocument();
            });

            // Couriers should be listed in the breakdown table and select filter
            expect(screen.getAllByText(/Juan Dela Cruz/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Pedro Penduko/).length).toBeGreaterThan(0);

            // "No DMS Delivery Records Found" empty state should NOT be present!
            expect(screen.queryByText('No DMS Delivery Records Found')).not.toBeInTheDocument();
        });

        it('populates Delivery Analytics using fallback when /performance-summary returns 401 Unauthorized', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.reject(new Error('Request failed with status code 401'));
                }
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                {
                                    taskId: '33333333-3333-3333-3333-333333333333',
                                    taskTitle: 'Express Logistics Dispatch',
                                    recipientName: 'Apex Logistics',
                                    dmsWaybillNo: 'WB-EXPRESS-999',
                                    dmsStatus: 'Delivered',
                                    courierEmployeeId: 'DRV-003',
                                    courierFullName: 'Carlos Courier',
                                    courierIsActive: true,
                                    createdAt: '2026-11-02T08:00:00Z',
                                    expectedDelivery: '2026-11-02T12:00:00Z',
                                    isOnTime: true,
                                },
                            ],
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <MemoryRouter>
                    <ReportsTab
                        teamMembers={[{ accountId: 'emp-3', employeeName: 'Carlos Courier' }]}
                    />
                </MemoryRouter>
            );

            // Switch to Delivery Analytics subtab
            fireEvent.click(screen.getByText('Delivery Analytics'));

            // Verify fallback gracefully recovered from 401 and rendered the record
            await waitFor(() => {
                expect(screen.getByText('WB-EXPRESS-999')).toBeInTheDocument();
            });
            expect(screen.getAllByText(/Carlos Courier/).length).toBeGreaterThan(0);
            expect(screen.queryByText('No DMS Delivery Records Found')).not.toBeInTheDocument();
        });
    });
});
