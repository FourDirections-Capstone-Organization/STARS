import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeDashboard, {
    EmployeeDashboardSkeleton,
} from '../Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeDashboard';
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

// Mock the employeeDashboardService
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

describe('EmployeeDashboard Master Component', () => {
    // ── Sample Mock Data ──────────────────────────────────────────────────────
    const mockDashboardData: EmployeeDashboardData = {
        employeeId: 'emp-101',
        employeeNumber: 'EMP-00101',
        fullName: 'Jane Doe',
        email: 'jane.doe@speedex.com',
        role: 'Dispatcher',
        departmentName: 'Dispatch Logistics',
        jobPositionName: 'Senior Logistics Specialist',
        availabilityStatus: 'Available',
        presenceStatus: 'Online',
        isActive: true,

        reportsTo: {
            supervisorId: 'sup-202',
            supervisorName: 'Robert Vance',
            supervisorRole: 'Coordinator',
            supervisorEmployeeNumber: 'EMP-00042',
            reportingRelation: 'Team Leader',
        },
        supervisorName: 'Robert Vance',
        supervisorRole: 'Coordinator',
        supervisorEmployeeNumber: 'EMP-00042',
        reportingRelation: 'Team Leader',

        totalAssignedTasks: 12,
        totalCreatedTasks: 4,
        completedCount: 7,
        inProgressCount: 3,
        pendingCount: 1,
        overdueCount: 1,

        statusBreakdown: [
            { status: 'Completed', count: 7, percentage: 58.3 },
            { status: 'In Progress', count: 3, percentage: 25.0 },
            { status: 'Pending', count: 1, percentage: 8.3 },
            { status: 'Overdue', count: 1, percentage: 8.3 },
        ],
        priorityDistribution: [
            { priority: 'Urgent', count: 2 },
            { priority: 'High', count: 4 },
            { priority: 'Medium', count: 5 },
            { priority: 'Low', count: 1 },
        ],
        completionTrend: [
            { period: 'Aug 2026', completedCount: 2 },
            { period: 'Sep 2026', completedCount: 3 },
            { period: 'Oct 2026', completedCount: 7 },
        ],
    };

    const mockAssignedTasksResponse: PaginatedTasksResponse = {
        items: [
            {
                id: 'task-001',
                taskNumber: 'TSK-1001',
                title: 'Cold Chain Delivery Route 4',
                description: 'Ensure temperature log maintenance.',
                priorityLevel: 2, // High
                status: 1, // In Progress
                deadline: '2026-11-15T18:00:00Z',
                myCompletionPercentage: 50,
                createdAt: '2026-10-20T08:00:00Z',
            },
        ],
        totalCount: 1,
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
    };

    const mockCreatedTasksResponse: PaginatedTasksResponse = {
        items: [
            {
                id: 'task-002',
                taskNumber: 'TSK-1002',
                title: 'Fleet Inspection Checklist',
                description: 'Pre-flight equipment check.',
                priorityLevel: 1, // Medium
                status: 2, // Completed
                deadline: '2026-10-25T17:00:00Z',
                createdAt: '2026-10-18T09:00:00Z',
            },
        ],
        totalCount: 1,
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset window search
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/');
        }
    });

    // ── 1. Loading Skeleton State ─────────────────────────────────────────────
    it('renders the loading skeleton initially while fetching dashboard data', () => {
        // Return unresolved promise to simulate in-flight loading
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockReturnValue(
            new Promise(() => {})
        );

        render(<EmployeeDashboard employeeId="emp-101" />);

        expect(screen.getByTestId('employee-dashboard-loading')).toBeInTheDocument();
        expect(screen.getByText(/loading employee profile & metrics/i)).toBeInTheDocument();
    });

    it('renders the standalone EmployeeDashboardSkeleton with Back button', () => {
        const handleBack = vi.fn();
        render(<EmployeeDashboardSkeleton onBack={handleBack} />);

        const backBtn = screen.getByRole('button', { name: /back to org structure/i });
        expect(backBtn).toBeInTheDocument();
        fireEvent.click(backBtn);
        expect(handleBack).toHaveBeenCalledTimes(1);
    });

    // ── 2. Successful Lifecycle & Full Page Assembly ──────────────────────────
    it('successfully loads and renders the full assembled dashboard (Header, Charts, TaskLists)', async () => {
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(mockDashboardData);
        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);
        vi.mocked(employeeDashboardService.getEmployeeCreatedTasks).mockResolvedValue(mockCreatedTasksResponse);

        render(<EmployeeDashboard employeeId="emp-101" />);

        // Await loaded state
        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
        });

        // 1. Employee Header assertions
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('EMP-00101')).toBeInTheDocument();
        expect(screen.getByText('Dispatcher')).toBeInTheDocument();
        expect(screen.getByText('Dispatch Logistics')).toBeInTheDocument();
        expect(screen.getByText('Senior Logistics Specialist')).toBeInTheDocument();

        // Supervisor Reports To Card
        expect(screen.getByText('Robert Vance')).toBeInTheDocument();
        expect(screen.getByText(/team leader/i)).toBeInTheDocument();

        // KPI Summary Cards
        expect(screen.getByText('TOTAL WORKLOAD')).toBeInTheDocument();
        expect(screen.getByText('16')).toBeInTheDocument(); // 12 + 4
        expect(screen.getByText('COMPLETED')).toBeInTheDocument();
        expect(screen.getByText('7')).toBeInTheDocument();

        // 2. Visual Analytics Section & Charts
        expect(screen.getByTestId('employee-dashboard-analytics-section')).toBeInTheDocument();
        expect(screen.getByText('Performance & Workload Analytics')).toBeInTheDocument();
        expect(screen.getByText('Task Status Breakdown')).toBeInTheDocument();
        expect(screen.getByText('Priority Distribution')).toBeInTheDocument();
        expect(screen.getByText('Created vs. Assigned')).toBeInTheDocument();
        expect(screen.getByText('Completion Trend Over Time')).toBeInTheDocument();

        // 3. Task Registry Section & Initial Assigned Tab
        expect(screen.getByTestId('employee-dashboard-tasks-section')).toBeInTheDocument();
        expect(screen.getByText('Tasks Assigned to Them')).toBeInTheDocument();
        expect(screen.getByText('Tasks Created by Them')).toBeInTheDocument();

        // Assigned task item appears in DataTable
        await waitFor(() => {
            expect(screen.getByText('Cold Chain Delivery Route 4')).toBeInTheDocument();
        });
    });

    // ── 3. Tab Switching Between Assigned and Created Tasks ────────────────────
    it('supports tab switching between "Tasks Assigned to Them" and "Tasks Created by Them"', async () => {
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(mockDashboardData);
        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);
        vi.mocked(employeeDashboardService.getEmployeeCreatedTasks).mockResolvedValue(mockCreatedTasksResponse);

        render(<EmployeeDashboard employeeId="emp-101" />);

        await waitFor(() => {
            expect(screen.getByText('Cold Chain Delivery Route 4')).toBeInTheDocument();
        });

        // Switch to "Tasks Created by Them"
        const createdTabBtn = screen.getByRole('tab', { name: /tasks created by them/i });
        fireEvent.click(createdTabBtn);

        // Created task item should appear
        await waitFor(() => {
            expect(screen.getByText('Fleet Inspection Checklist')).toBeInTheDocument();
        });
        expect(employeeDashboardService.getEmployeeCreatedTasks).toHaveBeenCalledWith(
            'emp-101',
            1,
            10,
            '',
            'All'
        );
    });

    // ── 4. Error State and Retry Flow ─────────────────────────────────────────
    it('renders error state when the API request fails and recovers on retry', async () => {
        vi.mocked(employeeDashboardService.getEmployeeDashboard)
            .mockRejectedValueOnce(new Error('Network connection timeout'))
            .mockResolvedValueOnce(mockDashboardData);

        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);

        const handleBack = vi.fn();
        render(<EmployeeDashboard employeeId="emp-101" onBack={handleBack} />);

        // Await error state
        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard-error')).toBeInTheDocument();
        });

        expect(screen.getByText('Unable to Load Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Network connection timeout')).toBeInTheDocument();

        // Check error back button
        const backBtn = screen.getByTestId('employee-dashboard-error-back-btn');
        fireEvent.click(backBtn);
        expect(handleBack).toHaveBeenCalledTimes(1);

        // Click Retry Request
        const retryBtn = screen.getByTestId('employee-dashboard-retry-btn');
        fireEvent.click(retryBtn);

        // Should now successfully render dashboard
        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });
    });

    // ── 5. Not Found State ────────────────────────────────────────────────────
    it('renders not found state when API returns 404', async () => {
        const notFoundError: any = new Error('Employee with ID non-existent-id was not found.');
        notFoundError.response = { status: 404, data: { message: 'Employee with ID non-existent-id was not found.' } };
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockRejectedValue(notFoundError);

        const handleBack = vi.fn();
        render(<EmployeeDashboard employeeId="non-existent-id" onBack={handleBack} />);

        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard-not-found')).toBeInTheDocument();
        });

        expect(screen.getByText('Employee Not Found')).toBeInTheDocument();
        expect(screen.getByText(/employee with id non-existent-id was not found/i)).toBeInTheDocument();

        // Return button triggers onBack
        const returnBtn = screen.getByTestId('employee-dashboard-not-found-back-btn');
        fireEvent.click(returnBtn);
        expect(handleBack).toHaveBeenCalledTimes(1);
    });

    it('renders not found state immediately if employeeId is missing or empty', async () => {
        render(<EmployeeDashboard employeeId="" />);

        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard-not-found')).toBeInTheDocument();
        });
        expect(screen.getByText(/no employee identifier provided/i)).toBeInTheDocument();
    });

    // ── 6. Fallback to Window Search Query Parameter ───────────────────────────
    it('extracts employeeId from window.location.search when not passed via props', async () => {
        window.history.replaceState({}, '', '/?tab=org-structure&employeeId=emp-from-url');
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue({
            ...mockDashboardData,
            employeeId: 'emp-from-url',
            fullName: 'URL Employee',
        });
        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);

        render(<EmployeeDashboard />);

        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
        });

        expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledWith('emp-from-url');
        expect(screen.getByText('URL Employee')).toBeInTheDocument();
    });

    // ── 7. Header Controls & Refresh Interaction ──────────────────────────────
    it('invokes onBack when clicking "Back to Org Structure" in the loaded header', async () => {
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(mockDashboardData);
        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);

        const handleBack = vi.fn();
        render(<EmployeeDashboard employeeId="emp-101" onBack={handleBack} />);

        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
        });

        const backBtn = screen.getByRole('button', { name: /back to org structure/i });
        fireEvent.click(backBtn);
        expect(handleBack).toHaveBeenCalledTimes(1);
    });

    it('refetches dashboard data when clicking Refresh in the header', async () => {
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(mockDashboardData);
        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);

        render(<EmployeeDashboard employeeId="emp-101" />);

        await waitFor(() => {
            expect(screen.getByTestId('employee-dashboard')).toBeInTheDocument();
        });
        expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledTimes(1);

        const refreshBtn = screen.getByTestId('eh-refresh-btn');
        fireEvent.click(refreshBtn);

        await waitFor(() => {
            expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledTimes(2);
        });
    });

    // ── 8. Task Row Click Propagation ─────────────────────────────────────────
    it('propagates task row clicks to onTaskClick callback', async () => {
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockResolvedValue(mockDashboardData);
        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(mockAssignedTasksResponse);

        const handleTaskClick = vi.fn();
        render(<EmployeeDashboard employeeId="emp-101" onTaskClick={handleTaskClick} />);

        await waitFor(() => {
            expect(screen.getByText('Cold Chain Delivery Route 4')).toBeInTheDocument();
        });

        const taskRow = screen.getByText('Cold Chain Delivery Route 4').closest('tr');
        if (taskRow) {
            fireEvent.click(taskRow);
            expect(handleTaskClick).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'task-001',
                    taskNumber: 'TSK-1001',
                })
            );
        }
    });
});
