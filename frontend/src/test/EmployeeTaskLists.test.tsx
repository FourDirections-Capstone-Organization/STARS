import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeTaskLists, {
    formatStatus,
    formatPriority,
    formatScope,
    formatDate,
    isTaskOverdue,
    getCompletionPercentage,
} from '../Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeTaskLists';
import employeeDashboardService, {
    EmployeeTaskItem,
    PaginatedTasksResponse,
} from '../services/employeeDashboardService';

// Mock the employeeDashboardService
vi.mock('../services/employeeDashboardService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/employeeDashboardService')>();
    return {
        ...actual,
        default: {
            ...actual.default,
            getEmployeeAssignedTasks: vi.fn(),
            getEmployeeCreatedTasks: vi.fn(),
        },
        getEmployeeAssignedTasks: vi.fn(),
        getEmployeeCreatedTasks: vi.fn(),
    };
});

describe('EmployeeTaskLists Component', () => {
    // ── Sample Mock Data ──────────────────────────────────────────────────────

    const mockAssignedTasks: EmployeeTaskItem[] = [
        {
            id: 'task-001',
            taskNumber: 'TSK-1001',
            title: 'Audit Cold Chain Temperature Logs',
            description: 'Inspect refrigerator logs for zone B and report variances.',
            priorityLevel: 2, // High
            status: 1, // In Progress
            deadline: '2026-11-15T18:00:00Z',
            myCompletionPercentage: 65,
            assignees: [
                {
                    userId: 'emp-101',
                    fullName: 'Jane Doe',
                    employeeNumber: 'EMP-00101',
                    completionPercentage: 65,
                },
            ],
            createdAt: '2026-10-20T08:00:00Z',
        },
        {
            id: 'task-002',
            taskNumber: 'TSK-1002',
            title: 'Emergency Medical Supply Dispatch',
            description: 'Urgent delivery to General Hospital emergency ward.',
            priorityLevel: 3, // Urgent
            status: 0, // Not Started
            deadline: '2026-10-25T12:00:00Z', // Past deadline -> Overdue
            myCompletionPercentage: 0,
            createdAt: '2026-10-24T09:00:00Z',
        },
        {
            id: 'task-003',
            taskNumber: 'TSK-1003',
            title: 'Warehouse Standard Safety Review',
            description: 'Quarterly warehouse fire and hazardous material check.',
            priorityLevel: 0, // Low
            status: 3, // Completed
            deadline: '2026-10-22T17:00:00Z',
            myCompletionPercentage: 100,
            createdAt: '2026-10-15T10:00:00Z',
        },
    ];

    const mockCreatedTasks: EmployeeTaskItem[] = [
        {
            id: 'task-201',
            taskNumber: 'TSK-2001',
            title: 'Schedule Zone 4 Maintenance',
            description: 'Coordinate routine vehicle checks for fleet 4.',
            priorityLevel: 1, // Medium
            status: 1, // In Progress
            deadline: '2026-11-20T17:00:00Z',
            createdById: 'emp-101',
            createdByName: 'Jane Doe',
            assignees: [
                {
                    userId: 'emp-501',
                    fullName: 'Alex Vance',
                    employeeNumber: 'EMP-00501',
                    completionPercentage: 40,
                },
                {
                    userId: 'emp-502',
                    fullName: 'Sarah Connor',
                    employeeNumber: 'EMP-00502',
                    completionPercentage: 60,
                },
            ],
            createdAt: '2026-10-26T14:30:00Z',
        },
        {
            id: 'task-202',
            taskNumber: 'TSK-2002',
            title: 'Inter-department Forwarding Memo',
            description: 'Departmental alignment for customs clearance protocols.',
            priorityLevel: 2, // High
            status: 0, // Not Started
            assignedDepartmentName: 'Logistics Operations',
            deadline: '2026-12-01T12:00:00Z',
            createdById: 'emp-101',
            createdByName: 'Jane Doe',
            createdAt: '2026-10-27T11:00:00Z',
        },
    ];

    const mockAssignedData: PaginatedTasksResponse = {
        items: mockAssignedTasks,
        totalCount: 3,
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
    };

    const mockCreatedData: PaginatedTasksResponse = {
        items: mockCreatedTasks,
        totalCount: 2,
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── 1. Pure Helper Unit Tests ─────────────────────────────────────────────

    describe('Helper Functions', () => {
        it('formatStatus correctly converts numeric status codes and string values', () => {
            expect(formatStatus(0)).toBe('Not Started');
            expect(formatStatus(1)).toBe('In Progress');
            expect(formatStatus(2)).toBe('Done');
            expect(formatStatus(3)).toBe('Completed');
            expect(formatStatus(4)).toBe('On Hold');
            expect(formatStatus(5)).toBe('Cancelled');
            expect(formatStatus('Overdue')).toBe('Overdue');
            expect(formatStatus(null)).toBe('Not Started');
            expect(formatStatus(undefined)).toBe('Not Started');
        });

        it('formatPriority correctly converts numeric priority levels and string values', () => {
            expect(formatPriority(0)).toBe('Low');
            expect(formatPriority(1)).toBe('Medium');
            expect(formatPriority(2)).toBe('High');
            expect(formatPriority(3)).toBe('Urgent');
            expect(formatPriority('Urgent')).toBe('Urgent');
            expect(formatPriority(null)).toBe('Medium');
            expect(formatPriority(undefined)).toBe('Medium');
        });

        it('formatScope maps numeric assignment scope codes to readable names', () => {
            expect(formatScope(0)).toBe('Individual');
            expect(formatScope(1)).toBe('Team');
            expect(formatScope(2)).toBe('Department');
            expect(formatScope(3)).toBe('Broadcast');
            expect(formatScope('Team')).toBe('Team');
            expect(formatScope(null)).toBe('Individual');
        });

        it('formatDate formats ISO dates cleanly and gracefully handles invalid dates', () => {
            const formatted = formatDate('2026-11-15T18:00:00Z');
            expect(formatted).toContain('2026');
            expect(formatted).toContain('Nov');
            expect(formatDate(null)).toBe('—');
            expect(formatDate(undefined)).toBe('—');
            expect(formatDate('')).toBe('—');
            expect(formatDate('invalid-date')).toBe('invalid-date');
        });

        it('isTaskOverdue detects overdue tasks while respecting completed status', () => {
            // Task with past deadline and Not Started status -> overdue
            const overdueTask: EmployeeTaskItem = {
                id: '1',
                title: 'Past Task',
                priorityLevel: 1,
                status: 0, // Not started
                deadline: '2020-01-01T00:00:00Z',
            };
            expect(isTaskOverdue(overdueTask)).toBe(true);

            // Completed task with past deadline -> NOT overdue
            const completedTask: EmployeeTaskItem = {
                id: '2',
                title: 'Done Task',
                priorityLevel: 1,
                status: 3, // Completed
                deadline: '2020-01-01T00:00:00Z',
            };
            expect(isTaskOverdue(completedTask)).toBe(false);

            // Task with future deadline -> NOT overdue
            const futureTask: EmployeeTaskItem = {
                id: '3',
                title: 'Future Task',
                priorityLevel: 1,
                status: 1, // In Progress
                deadline: '2099-01-01T00:00:00Z',
            };
            expect(isTaskOverdue(futureTask)).toBe(false);
        });

        it('getCompletionPercentage computes progress accurately across various input forms', () => {
            // Explicit myCompletionPercentage
            expect(getCompletionPercentage({ id: '1', title: 'T', priorityLevel: 1, status: 1, myCompletionPercentage: 75 })).toBe(75);

            // Average across assignees
            const teamTask: EmployeeTaskItem = {
                id: '2',
                title: 'Team Task',
                priorityLevel: 1,
                status: 1,
                assignees: [
                    { userId: 'u1', fullName: 'U1', employeeNumber: 'E1', completionPercentage: 80 },
                    { userId: 'u2', fullName: 'U2', employeeNumber: 'E2', completionPercentage: 40 },
                ],
            };
            expect(getCompletionPercentage(teamTask)).toBe(60);

            // Fallback by status
            expect(getCompletionPercentage({ id: '3', title: 'T', priorityLevel: 1, status: 3 })).toBe(100);
            expect(getCompletionPercentage({ id: '4', title: 'T', priorityLevel: 1, status: 1 })).toBe(50);
            expect(getCompletionPercentage({ id: '5', title: 'T', priorityLevel: 1, status: 0 })).toBe(0);
        });
    });

    // ── 2. Tab Switching & Headers ────────────────────────────────────────────

    describe('Tab Switching & Navigation', () => {
        it('renders tab buttons for Assigned and Created tasks with badge counts', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                    createdTasksData={mockCreatedData}
                />
            );

            const assignedTab = screen.getByTestId('tab-assigned');
            const createdTab = screen.getByTestId('tab-created');

            expect(assignedTab).toBeInTheDocument();
            expect(createdTab).toBeInTheDocument();
            expect(assignedTab).toHaveClass('active');
            expect(createdTab).not.toHaveClass('active');

            expect(screen.getByTestId('assigned-count-badge')).toHaveTextContent('3');
            expect(screen.getByTestId('created-count-badge')).toHaveTextContent('2');
        });

        it('switches to Created Tasks tab on click and updates active styling', () => {
            const handleTabChange = vi.fn();
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                    createdTasksData={mockCreatedData}
                    onTabChange={handleTabChange}
                />
            );

            // Initially on Assigned tab: check an assigned task title is visible
            expect(screen.getByText('Audit Cold Chain Temperature Logs')).toBeInTheDocument();
            expect(screen.queryByText('Schedule Zone 4 Maintenance')).not.toBeInTheDocument();

            // Click Created tab
            const createdTab = screen.getByTestId('tab-created');
            fireEvent.click(createdTab);

            expect(handleTabChange).toHaveBeenCalledWith('created');
            expect(createdTab).toHaveClass('active');
            expect(screen.getByTestId('tab-assigned')).not.toHaveClass('active');

            // Now created task is visible, assigned task is not
            expect(screen.getByText('Schedule Zone 4 Maintenance')).toBeInTheDocument();
            expect(screen.queryByText('Audit Cold Chain Temperature Logs')).not.toBeInTheDocument();
        });

        it('supports controlled activeTab prop', () => {
            const { rerender } = render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    activeTab="assigned"
                    assignedTasksData={mockAssignedData}
                    createdTasksData={mockCreatedData}
                />
            );

            expect(screen.getByText('Audit Cold Chain Temperature Logs')).toBeInTheDocument();

            rerender(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    activeTab="created"
                    assignedTasksData={mockAssignedData}
                    createdTasksData={mockCreatedData}
                />
            );

            expect(screen.getByText('Schedule Zone 4 Maintenance')).toBeInTheDocument();
        });
    });

    // ── 3. Assigned Tasks Columns ─────────────────────────────────────────────

    describe('Assigned Tasks Table Columns', () => {
        it('renders all required columns for assigned tasks', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                />
            );

            // Headers
            expect(screen.getByText('Task Number')).toBeInTheDocument();
            expect(screen.getByText('Title')).toBeInTheDocument();
            expect(screen.getByText('Priority')).toBeInTheDocument();
            expect(screen.getByText('Status')).toBeInTheDocument();
            expect(screen.getByText('Deadline / Due Date')).toBeInTheDocument();
            expect(screen.getByText('Assignee Progress %')).toBeInTheDocument();

            // Row 1 values
            expect(screen.getByText('TSK-1001')).toBeInTheDocument();
            expect(screen.getByText('Audit Cold Chain Temperature Logs')).toBeInTheDocument();
            expect(screen.getByText('Inspect refrigerator logs for zone B and report variances.')).toBeInTheDocument();
            expect(screen.getByText('High')).toBeInTheDocument();
            // "In Progress" exists both in the status filter dropdown option and as the badge in the table
            const inProgressElements = screen.getAllByText('In Progress');
            expect(inProgressElements.length).toBeGreaterThanOrEqual(2);
            expect(screen.getByText('65%')).toBeInTheDocument();

            // Row 2: Overdue detection
            expect(screen.getByText('TSK-1002')).toBeInTheDocument();
            expect(screen.getByText('Emergency Medical Supply Dispatch')).toBeInTheDocument();
            expect(screen.getByText('Urgent')).toBeInTheDocument();
            const overdueElements = screen.getAllByText('Overdue');
            expect(overdueElements.length).toBeGreaterThanOrEqual(2);
            expect(screen.getByText('0%')).toBeInTheDocument();

            // Row 3: Completed
            expect(screen.getByText('TSK-1003')).toBeInTheDocument();
            expect(screen.getByText('Warehouse Standard Safety Review')).toBeInTheDocument();
            expect(screen.getByText('Low')).toBeInTheDocument();
            const completedElements = screen.getAllByText('Completed');
            expect(completedElements.length).toBeGreaterThanOrEqual(2);
            expect(screen.getByText('100%')).toBeInTheDocument();
        });
    });

    // ── 4. Created Tasks Columns ──────────────────────────────────────────────

    describe('Created Tasks Table Columns', () => {
        it('renders all required columns for created tasks with assignee and scope details', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    defaultTab="created"
                    createdTasksData={mockCreatedData}
                />
            );

            // Headers
            expect(screen.getByText('Task Number')).toBeInTheDocument();
            expect(screen.getByText('Title')).toBeInTheDocument();
            expect(screen.getByText('Assignee / Scope')).toBeInTheDocument();
            expect(screen.getByText('Priority')).toBeInTheDocument();
            expect(screen.getByText('Status')).toBeInTheDocument();
            expect(screen.getByText('Deadline')).toBeInTheDocument();
            expect(screen.getByText('Created At')).toBeInTheDocument();

            // Row 1: Assignee with +1 count
            expect(screen.getByText('TSK-2001')).toBeInTheDocument();
            expect(screen.getByText('Schedule Zone 4 Maintenance')).toBeInTheDocument();
            expect(screen.getByText('Alex Vance')).toBeInTheDocument();
            expect(screen.getByText('+1')).toBeInTheDocument();
            expect(screen.getByText('Medium')).toBeInTheDocument();

            // Row 2: Department Scope
            expect(screen.getByText('TSK-2002')).toBeInTheDocument();
            expect(screen.getByText('Inter-department Forwarding Memo')).toBeInTheDocument();
            expect(screen.getByText('Logistics Operations')).toBeInTheDocument();
        });
    });

    // ── 5. Search & Status Filtering ──────────────────────────────────────────

    describe('Search and Status Sub-Filters', () => {
        it('filters tasks client-side when search query is entered', () => {
            const handleSearchChange = vi.fn();
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                    onSearchChange={handleSearchChange}
                />
            );

            const searchInput = screen.getByPlaceholderText('Search by title or description...');
            fireEvent.change(searchInput, { target: { value: 'Emergency' } });

            expect(handleSearchChange).toHaveBeenCalledWith('Emergency');

            // Only the matching emergency task is shown
            expect(screen.getByText('Emergency Medical Supply Dispatch')).toBeInTheDocument();
            expect(screen.queryByText('Audit Cold Chain Temperature Logs')).not.toBeInTheDocument();
            expect(screen.queryByText('Warehouse Standard Safety Review')).not.toBeInTheDocument();
        });

        it('filters tasks by status dropdown', () => {
            const handleStatusChange = vi.fn();
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                    onStatusChange={handleStatusChange}
                />
            );

            const statusSelect = screen.getByTestId('task-status-filter');
            fireEvent.change(statusSelect, { target: { value: 'Completed' } });

            expect(handleStatusChange).toHaveBeenCalledWith('Completed');

            // Only completed task shown
            expect(screen.getByText('Warehouse Standard Safety Review')).toBeInTheDocument();
            expect(screen.queryByText('Audit Cold Chain Temperature Logs')).not.toBeInTheDocument();
        });

        it('filters overdue tasks via the Overdue status option', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                />
            );

            const statusSelect = screen.getByTestId('task-status-filter');
            fireEvent.change(statusSelect, { target: { value: 'Overdue' } });

            expect(screen.getByText('Emergency Medical Supply Dispatch')).toBeInTheDocument();
            expect(screen.queryByText('Audit Cold Chain Temperature Logs')).not.toBeInTheDocument();
            expect(screen.queryByText('Warehouse Standard Safety Review')).not.toBeInTheDocument();
        });

        it('resets search and status filter when clicking Reset button', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                />
            );

            const searchInput = screen.getByPlaceholderText('Search by title or description...');
            fireEvent.change(searchInput, { target: { value: 'Emergency' } });

            expect(screen.getByTestId('reset-filters-btn')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('reset-filters-btn'));

            // All tasks restored
            expect(screen.getByText('Audit Cold Chain Temperature Logs')).toBeInTheDocument();
            expect(screen.getByText('Emergency Medical Supply Dispatch')).toBeInTheDocument();
            expect(screen.getByText('Warehouse Standard Safety Review')).toBeInTheDocument();
        });
    });

    // ── 6. Pagination & Rows Per Page ─────────────────────────────────────────

    describe('Pagination Controls', () => {
        it('renders page info count and page size selector', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                />
            );

            expect(screen.getByTestId('task-lists-count-info')).toHaveTextContent('Showing 1–3 of 3 tasks');
            expect(screen.getByTestId('pagesize-select')).toHaveValue('10');
        });

        it('handles page size changes and triggers onPageSizeChange callback', () => {
            const handlePageSizeChange = vi.fn();
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                    onPageSizeChange={handlePageSizeChange}
                />
            );

            const pageSizeSelect = screen.getByTestId('pagesize-select');
            fireEvent.change(pageSizeSelect, { target: { value: '25' } });

            expect(handlePageSizeChange).toHaveBeenCalledWith(25);
            expect(pageSizeSelect).toHaveValue('25');
        });

        it('renders pagination buttons when totalPages > 1 and handles page clicks', () => {
            const multiPageData: PaginatedTasksResponse = {
                items: mockAssignedTasks,
                totalCount: 25,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 3,
                hasPreviousPage: false,
                hasNextPage: true,
            };

            const handlePageChange = vi.fn();
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={multiPageData}
                    onPageChange={handlePageChange}
                />
            );

            // Pagination component buttons (1, 2, 3)
            const page2Btn = screen.getByRole('button', { name: '2' });
            expect(page2Btn).toBeInTheDocument();

            fireEvent.click(page2Btn);
            expect(handlePageChange).toHaveBeenCalledWith(2);
        });
    });

    // ── 7. Edge Case Empty States ─────────────────────────────────────────────

    describe('Edge Cases & Empty State Messages', () => {
        it('displays exact specified message for empty assigned tasks', () => {
            const emptyAssignedData: PaginatedTasksResponse = {
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            };

            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    activeTab="assigned"
                    assignedTasksData={emptyAssignedData}
                />
            );

            expect(screen.getByText('No tasks assigned to this employee')).toBeInTheDocument();
            expect(screen.getByTestId('task-lists-count-info')).toHaveTextContent('No tasks found');
        });

        it('displays exact specified message and staff note for empty created tasks', () => {
            const emptyCreatedData: PaginatedTasksResponse = {
                items: [],
                totalCount: 0,
                pageNumber: 1,
                pageSize: 10,
                totalPages: 0,
                hasPreviousPage: false,
                hasNextPage: false,
            };

            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    activeTab="created"
                    createdTasksData={emptyCreatedData}
                />
            );

            // Exact message from docs/PLAN.md
            expect(
                screen.getByText('No tasks created by this employee (Staff members typically execute assigned tasks)')
            ).toBeInTheDocument();

            // Staff note banner
            expect(screen.getByTestId('staff-created-note')).toBeInTheDocument();
            expect(
                screen.getByText(/Staff members typically execute assigned tasks rather than create them/i)
            ).toBeInTheDocument();
        });

        it('displays filter mismatch message when search yields no matches', () => {
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                />
            );

            const searchInput = screen.getByPlaceholderText('Search by title or description...');
            fireEvent.change(searchInput, { target: { value: 'NonExistentTaskXYZ' } });

            expect(
                screen.getByText('No tasks assigned to this employee matching your filter')
            ).toBeInTheDocument();
        });
    });

    // ── 8. Asynchronous Fetching & Callbacks ───────────────────────────────────

    describe('Asynchronous Data Fetching & Callbacks', () => {
        it('fetches assigned tasks on initial mount when external data is not provided', async () => {
            const mockGetAssigned = vi.mocked(employeeDashboardService.getEmployeeAssignedTasks);
            mockGetAssigned.mockResolvedValueOnce(mockAssignedData);

            render(<EmployeeTaskLists employeeId="emp-999" />);

            await waitFor(() => {
                expect(mockGetAssigned).toHaveBeenCalledWith(
                    'emp-999',
                    1,
                    10,
                    '',
                    'All'
                );
            });

            await waitFor(() => {
                expect(screen.getByText('Audit Cold Chain Temperature Logs')).toBeInTheDocument();
            });
        });

        it('calls onTaskClick when a row is clicked', () => {
            const handleTaskClick = vi.fn();
            render(
                <EmployeeTaskLists
                    employeeId="emp-101"
                    assignedTasksData={mockAssignedData}
                    onTaskClick={handleTaskClick}
                />
            );

            const taskRowTitle = screen.getByText('Audit Cold Chain Temperature Logs');
            fireEvent.click(taskRowTitle);

            expect(handleTaskClick).toHaveBeenCalledWith(mockAssignedTasks[0]);
        });

        it('displays error banner and retry button when fetching fails', async () => {
            const mockGetAssigned = vi.mocked(employeeDashboardService.getEmployeeAssignedTasks);
            mockGetAssigned.mockRejectedValueOnce(new Error('Network timeout'));

            render(<EmployeeTaskLists employeeId="emp-fail" />);

            await waitFor(() => {
                expect(screen.getByTestId('task-lists-error')).toBeInTheDocument();
                expect(screen.getByText('Network timeout')).toBeInTheDocument();
            });
        });
    });
});
