import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeDashboard from '../Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeDashboard';
import employeeDashboardService, {
    EmployeeDashboardData,
    PaginatedTasksResponse,
} from '../services/employeeDashboardService';

// Mock Recharts ResponsiveContainer for happy-dom / jsdom testing
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => (
            <div className="recharts-responsive-container" style={{ width: '100%', height: 230 }}>
                {children}
            </div>
        ),
    };
});

// Mock employeeDashboardService
vi.mock('../services/employeeDashboardService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/employeeDashboardService')>();
    return {
        ...actual,
        default: {
            ...actual.default,
            getEmployeeDashboard: vi.fn(),
            getEmployeeAssignedTasks: vi.fn(),
            getEmployeeCreatedTasks: vi.fn(),
        },
        getEmployeeDashboard: vi.fn(),
        getEmployeeAssignedTasks: vi.fn(),
        getEmployeeCreatedTasks: vi.fn(),
    };
});

describe('EmployeeDashboard Edge Cases & Access Guards (Step 9)', () => {
    // ── Baseline Mock Profile ─────────────────────────────────────────────────
    const baseEmployee: EmployeeDashboardData = {
        employeeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        employeeNumber: 'EMP-00109',
        fullName: 'Marcus Vance',
        email: 'marcus.vance@speedex.com',
        role: 'Courier',
        departmentName: 'Dispatch Logistics',
        jobPositionName: 'Fleet Courier',
        availabilityStatus: 'Available',
        presenceStatus: 'Offline',
        isActive: true,

        reportsTo: {
            supervisorId: 'a12bc34d-56ef-7890-abcd-ef1234567890',
            supervisorName: 'Sarah Jenkins',
            supervisorRole: 'Coordinator',
            supervisorEmployeeNumber: 'EMP-00018',
            reportingRelation: 'Team Leader',
        },
        supervisorName: 'Sarah Jenkins',
        supervisorRole: 'Coordinator',
        supervisorEmployeeNumber: 'EMP-00018',
        reportingRelation: 'Team Leader',

        totalAssignedTasks: 0,
        totalCreatedTasks: 0,
        completedCount: 0,
        inProgressCount: 0,
        pendingCount: 0,
        overdueCount: 0,

        statusBreakdown: [],
        priorityDistribution: [],
        completionTrend: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/');
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Employee with 0 Tasks (Assigned and Created)
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Employee with 0 Tasks (Assigned & Created)', () => {
        it('cleanly renders zero KPI metrics without null or division by zero exceptions', async () => {
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(baseEmployee);
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });
            vi.mocked(employeeDashboardService.getEmployeeCreatedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
            });

            // Check KPI grid displays 0 counts cleanly
            const kpiGrid = screen.getByTestId('eh-kpi-grid');
            expect(kpiGrid).toBeInTheDocument();

            // Total Workload: 0 (subtext: 0 assigned · 0 created)
            expect(screen.getByText('TOTAL WORKLOAD')).toBeInTheDocument();
            expect(screen.getByText('0 assigned · 0 created')).toBeInTheDocument();

            // Completed: 0 (subtext: No tasks assigned)
            expect(screen.getByText('COMPLETED')).toBeInTheDocument();
            expect(screen.getByText('No tasks assigned')).toBeInTheDocument();

            // Overdue: 0 (subtext: No overdue tasks)
            expect(screen.getByText('OVERDUE')).toBeInTheDocument();
            expect(screen.getByText('No overdue tasks')).toBeInTheDocument();

            // Verify all 4 empty state charts render without crashing
            expect(screen.getByTestId('ec-status-empty')).toBeInTheDocument();
            expect(screen.getByText('No task status data recorded')).toBeInTheDocument();

            expect(screen.getByTestId('ec-workload-empty')).toBeInTheDocument();
            expect(screen.getByText('No task activity recorded')).toBeInTheDocument();

            expect(screen.getByTestId('ec-priority-empty')).toBeInTheDocument();
            expect(screen.getByText('No priority distribution data available')).toBeInTheDocument();

            expect(screen.getByTestId('ec-trend-empty')).toBeInTheDocument();
            expect(screen.getByText('No completion history recorded yet')).toBeInTheDocument();
        });

        it('shows appropriate empty states and advisory note for staff on the created tasks tab', async () => {
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(baseEmployee);
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });
            vi.mocked(employeeDashboardService.getEmployeeCreatedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} />);

            await waitFor(() => {
                expect(screen.getByText('No tasks assigned to this employee')).toBeInTheDocument();
            });

            // Switch to "Tasks Created by Them"
            const createdTab = screen.getByRole('tab', { name: /tasks created by them/i });
            fireEvent.click(createdTab);

            // Verify staff advisory note
            await waitFor(() => {
                expect(screen.getByTestId('staff-created-note')).toBeInTheDocument();
            });
            expect(
                screen.getByText(/staff members typically execute assigned tasks rather than create them/i)
            ).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. High Task Volume (Thousands of Tasks & Server-Side Pagination)
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. High Task Volume & Server Pagination', () => {
        const largeTaskList: PaginatedTasksResponse = {
            items: Array.from({ length: 10 }, (_, i) => ({
                id: `tsk-large-${i + 1}`,
                taskNumber: `TSK-${3000 + i}`,
                title: `High Volume Logistics Task ${i + 1}`,
                description: `Bulk parcel routing inspection item ${i + 1}`,
                priorityLevel: 2,
                status: 1,
                deadline: '2026-12-01T12:00:00Z',
                myCompletionPercentage: 40,
                createdAt: '2026-10-15T09:00:00Z',
            })),
            totalCount: 3850,
            pageNumber: 1,
            pageSize: 10,
            totalPages: 385,
            hasPreviousPage: false,
            hasNextPage: true,
        };

        it('smoothly renders formatted thousand counts and supports 10, 25, 50 rows per page selection', async () => {
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue({
                ...baseEmployee,
                totalAssignedTasks: 3850,
                inProgressCount: 2100,
                completedCount: 1750,
            });
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(largeTaskList);

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} />);

            // Await table loaded
            await waitFor(() => {
                expect(screen.getByText('High Volume Logistics Task 1')).toBeInTheDocument();
            });

            // Verify formatted total count (e.g. 3,850)
            const countInfo = screen.getByTestId('task-lists-count-info');
            expect(countInfo.textContent).toContain('3,850 tasks');
            expect(countInfo.textContent).toContain('Showing 1–10 of 3,850 tasks');

            // Find Page Size Select
            const pageSizeSelect = screen.getByTestId('pagesize-select') as HTMLSelectElement;
            expect(pageSizeSelect).toBeInTheDocument();
            expect(pageSizeSelect.value).toBe('10');

            // Change page size to 25
            fireEvent.change(pageSizeSelect, { target: { value: '25' } });

            await waitFor(() => {
                expect(employeeDashboardService.getEmployeeAssignedTasks).toHaveBeenCalledWith(
                    baseEmployee.employeeId,
                    1,
                    25,
                    '',
                    'All'
                );
            });

            // Change page size to 50
            fireEvent.change(pageSizeSelect, { target: { value: '50' } });

            await waitFor(() => {
                expect(employeeDashboardService.getEmployeeAssignedTasks).toHaveBeenCalledWith(
                    baseEmployee.employeeId,
                    1,
                    50,
                    '',
                    'All'
                );
            });
        });

        it('supports navigating across high page numbers', async () => {
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue({
                ...baseEmployee,
                totalAssignedTasks: 3850,
            });
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(largeTaskList);

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} />);

            await waitFor(() => {
                expect(screen.getByText('High Volume Logistics Task 1')).toBeInTheDocument();
            });

            // Click Page 2
            const page2Btn = screen.getByRole('button', { name: '2' });
            expect(page2Btn).toBeInTheDocument();
            fireEvent.click(page2Btn);

            await waitFor(() => {
                expect(employeeDashboardService.getEmployeeAssignedTasks).toHaveBeenCalledWith(
                    baseEmployee.employeeId,
                    2,
                    10,
                    '',
                    'All'
                );
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Deactivated / Inactive Employee Profile
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Deactivated Employee Profile', () => {
        it('displays "Deactivated" account status pill in header and prominent warning banner', async () => {
            const deactivatedEmployee: EmployeeDashboardData = {
                ...baseEmployee,
                isActive: false,
                fullName: 'Arthur Pendelton',
            };

            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(deactivatedEmployee);
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });

            render(<EmployeeDashboard employeeId={deactivatedEmployee.employeeId} />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
            });

            // 1. Header status pill must show Deactivated
            const statusPill = screen.getByTestId('eh-account-status');
            expect(statusPill).toBeInTheDocument();
            expect(statusPill.textContent).toContain('Deactivated');
            expect(statusPill).toHaveClass('eh-status-inactive');

            // 2. Prominent banner must be displayed
            const deactivatedBanner = screen.getByTestId('ed-deactivated-banner');
            expect(deactivatedBanner).toBeInTheDocument();
            expect(screen.getByText('Deactivated Personnel Account')).toBeInTheDocument();
            expect(
                screen.getByText(/this employee account is deactivated/i)
            ).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Unauthorized Access (401 / 403 Forbidden)
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Unauthorized Access (401 / 403)', () => {
        it('renders Access Restricted state when receiving 403 Forbidden', async () => {
            const forbiddenError: any = new Error('Access denied. Manager role required.');
            forbiddenError.response = {
                status: 403,
                data: { message: 'Access denied. Manager role required.' },
            };
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockRejectedValue(forbiddenError);

            const handleBack = vi.fn();
            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} onBack={handleBack} />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard-unauthorized')).toBeInTheDocument();
            });

            expect(screen.getByText('Access Restricted')).toBeInTheDocument();
            expect(screen.getByText(/only managers can access this organizational overview/i)).toBeInTheDocument();

            // Clicking Return to Org Structure button calls onBack
            const backBtn = screen.getByTestId('employee-dashboard-unauthorized-back-btn');
            fireEvent.click(backBtn);
            expect(handleBack).toHaveBeenCalledTimes(1);
        });

        it('renders session expired message when receiving 401 Unauthorized', async () => {
            const unauthorizedError: any = new Error('JWT token expired.');
            unauthorizedError.response = {
                status: 401,
                data: { message: 'JWT token expired.' },
            };
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockRejectedValue(unauthorizedError);

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard-unauthorized')).toBeInTheDocument();
            });

            expect(screen.getByText(/your session has expired or you are unauthorized/i)).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Invalid GUID in URL / 400 Bad Request
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Invalid Employee GUID in URL', () => {
        it('renders Invalid Employee Identifier state when receiving 400 Bad Request for malformed GUID', async () => {
            const badRequestError: any = new Error('Invalid GUID format: "not-a-real-guid".');
            badRequestError.response = {
                status: 400,
                data: { message: 'The provided employee identifier is invalid.' },
            };
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockRejectedValue(badRequestError);

            const handleBack = vi.fn();
            render(<EmployeeDashboard employeeId="not-a-real-guid" onBack={handleBack} />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard-invalid-id')).toBeInTheDocument();
            });

            expect(screen.getByText('Invalid Employee Identifier')).toBeInTheDocument();
            expect(screen.getByText(/the provided employee identifier is invalid/i)).toBeInTheDocument();

            // Back button invokes onBack
            const backBtn = screen.getByTestId('employee-dashboard-invalid-back-btn');
            fireEvent.click(backBtn);
            expect(handleBack).toHaveBeenCalledTimes(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Network Failure Recovery
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Network Failure & Retry Recovery', () => {
        it('renders unable to load dashboard on 500 error and recovers after clicking Retry Request', async () => {
            vi.mocked(employeeDashboardService.getEmployeeDashboard)
                .mockRejectedValueOnce(new Error('Internal Server Error (500)'))
                .mockResolvedValueOnce(baseEmployee);
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard-error')).toBeInTheDocument();
            });

            expect(screen.getByText('Unable to Load Dashboard')).toBeInTheDocument();
            expect(screen.getByText('Internal Server Error (500)')).toBeInTheDocument();

            // Click retry
            const retryBtn = screen.getByTestId('employee-dashboard-retry-btn');
            fireEvent.click(retryBtn);

            // Successfully renders dashboard
            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
                expect(screen.getByText('Marcus Vance')).toBeInTheDocument();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Mobile & Responsive Layout Structure
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. Mobile and Tablet Layout Elements', () => {
        it('renders with appropriate container hierarchy and layout classes', async () => {
            vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(baseEmployee);
            vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue({
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            });

            render(<EmployeeDashboard employeeId={baseEmployee.employeeId} className="custom-responsive-wrap" />);

            await waitFor(() => {
                expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
            });

            const dashboardContainer = screen.getByTestId('employee-dashboard');
            expect(dashboardContainer).toHaveClass('ed-dashboard-container');
            expect(dashboardContainer).toHaveClass('custom-responsive-wrap');

            // Analytics and tasks section landmarks
            expect(screen.getByTestId('employee-dashboard-analytics-section')).toBeInTheDocument();
            expect(screen.getByTestId('employee-dashboard-tasks-section')).toBeInTheDocument();
            expect(screen.getByTestId('employee-task-lists')).toBeInTheDocument();
        });
    });
});
