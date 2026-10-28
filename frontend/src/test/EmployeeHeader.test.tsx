import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmployeeHeader, {
    getInitials,
    isTopLevelManagement,
} from '../Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeHeader';
import { EmployeeDashboardData } from '../services/employeeDashboardService';

describe('EmployeeHeader Component', () => {
    const mockStaffData: EmployeeDashboardData = {
        employeeId: 'emp-101',
        employeeNumber: 'EMP-00101',
        fullName: 'Jane Doe',
        email: 'jane.doe@speedex.com',
        role: 'Dispatcher',
        departmentName: 'Dispatch Team',
        jobPositionName: 'Senior Dispatcher',
        availabilityStatus: 'Available',
        presenceStatus: 'Online',
        isActive: true,

        // Supervisor: Coordinator
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

        // KPI Counts
        totalAssignedTasks: 14,
        totalCreatedTasks: 2,
        completedCount: 9,
        inProgressCount: 4,
        pendingCount: 1,
        overdueCount: 1,

        statusBreakdown: [],
        priorityDistribution: [],
        completionTrend: [],
    };

    const mockManagerData: EmployeeDashboardData = {
        employeeId: 'emp-001',
        employeeNumber: 'EMP-00001',
        fullName: 'Eleanor Vance',
        email: 'eleanor.vance@speedex.com',
        role: 'Manager',
        departmentName: 'Executive Department',
        jobPositionName: 'Operations General Manager',
        availabilityStatus: 'Busy',
        presenceStatus: 'Offline',
        isActive: true,

        // Supervisor: Executive Board / None
        reportsTo: {
            supervisorId: null,
            supervisorName: 'Executive Board',
            supervisorRole: 'Executive Management',
            supervisorEmployeeNumber: null,
            reportingRelation: 'Executive Board',
        },
        supervisorName: 'Executive Board',
        supervisorRole: 'Executive Management',
        supervisorEmployeeNumber: null,
        reportingRelation: 'Executive Board',

        totalAssignedTasks: 5,
        totalCreatedTasks: 35,
        completedCount: 4,
        inProgressCount: 1,
        pendingCount: 0,
        overdueCount: 0,

        statusBreakdown: [],
        priorityDistribution: [],
        completionTrend: [],
    };

    // ── Helper Unit Tests ─────────────────────────────────────────────────────

    describe('Helper Functions', () => {
        it('computes initials correctly across various name patterns', () => {
            expect(getInitials('John Doe')).toBe('JD');
            expect(getInitials('Jane Alice Doe')).toBe('JD');
            expect(getInitials('Alice')).toBe('AL');
            expect(getInitials('')).toBe('—');
            expect(getInitials(null)).toBe('—');
            expect(getInitials(undefined)).toBe('—');
        });

        it('detects top-level management based on role or reporting relationship', () => {
            expect(isTopLevelManagement('Manager', 'Executive Board', 'Executive Board')).toBe(true);
            expect(isTopLevelManagement('manager', 'Manager', 'Manager')).toBe(true);
            expect(isTopLevelManagement('Coordinator', 'Executive Board', 'Executive Board')).toBe(true);
            expect(isTopLevelManagement('Dispatcher', 'Team Leader', 'Robert Vance')).toBe(false);
            expect(isTopLevelManagement('Courier', 'Department Coordinator', 'Sarah Connor')).toBe(false);
            expect(isTopLevelManagement('', '', '')).toBe(true); // Fallback to top-level if no supervisor specified
        });
    });

    // ── Profile Rendering ─────────────────────────────────────────────────────

    describe('Profile Hero Rendering', () => {
        it('renders full employee profile with name, employee number, and role badge', () => {
            render(<EmployeeHeader data={mockStaffData} />);

            expect(screen.getByTestId('eh-full-name')).toHaveTextContent('Jane Doe');
            expect(screen.getByTestId('eh-emp-number')).toHaveTextContent('EMP-00101');
            expect(screen.getByTestId('eh-role-badge')).toHaveTextContent(/dispatcher/i);
            expect(screen.getByTestId('eh-avatar')).toHaveTextContent('JD');
            expect(screen.getByTestId('eh-department')).toHaveTextContent('Dispatch Team');
            expect(screen.getByTestId('eh-position')).toHaveTextContent('Senior Dispatcher');
            expect(screen.getByTestId('eh-email')).toHaveTextContent('jane.doe@speedex.com');
            expect(screen.getByTestId('eh-availability')).toHaveTextContent('Available');
        });

        it('renders online presence badge and dot when employee is online', () => {
            render(<EmployeeHeader data={mockStaffData} />);

            const badge = screen.getByTestId('eh-presence-badge');
            expect(badge).toHaveTextContent('Online');
            expect(badge).toHaveClass('eh-presence-online');

            const dot = screen.getByTestId('eh-presence-dot');
            expect(dot).toHaveClass('eh-online');
        });

        it('renders offline presence badge when employee is offline', () => {
            render(<EmployeeHeader data={mockManagerData} />);

            const badge = screen.getByTestId('eh-presence-badge');
            expect(badge).toHaveTextContent('Offline');
            expect(badge).toHaveClass('eh-presence-offline');

            const dot = screen.getByTestId('eh-presence-dot');
            expect(dot).toHaveClass('eh-offline');
        });

        it('displays active account badge when isActive is true', () => {
            render(<EmployeeHeader data={mockStaffData} />);

            const status = screen.getByTestId('eh-account-status');
            expect(status).toHaveTextContent('Active Account');
            expect(status).toHaveClass('eh-status-active');
        });

        it('displays deactivated badge when isActive is false', () => {
            const deactivatedData = {
                ...mockStaffData,
                isActive: false,
            };

            render(<EmployeeHeader data={deactivatedData} />);

            const status = screen.getByTestId('eh-account-status');
            expect(status).toHaveTextContent('Deactivated');
            expect(status).toHaveClass('eh-status-inactive');
        });
    });

    // ── Navigation & Actions ──────────────────────────────────────────────────

    describe('Navigation and Quick Actions', () => {
        it('calls onBack callback when clicking Back to Org Structure button', () => {
            const handleBack = vi.fn();
            render(<EmployeeHeader data={mockStaffData} onBack={handleBack} />);

            const backBtn = screen.getByTestId('eh-back-btn');
            fireEvent.click(backBtn);

            expect(handleBack).toHaveBeenCalledTimes(1);
        });

        it('calls onRefresh callback when clicking Refresh button', () => {
            const handleRefresh = vi.fn();
            render(<EmployeeHeader data={mockStaffData} onRefresh={handleRefresh} />);

            const refreshBtn = screen.getByTestId('eh-refresh-btn');
            fireEvent.click(refreshBtn);

            expect(handleRefresh).toHaveBeenCalledTimes(1);
        });

        it('disables refresh button and applies spinner class when isLoading is true', () => {
            render(<EmployeeHeader data={mockStaffData} onRefresh={() => { }} isLoading={true} />);

            const refreshBtn = screen.getByTestId('eh-refresh-btn');
            expect(refreshBtn).toBeDisabled();
        });
    });

    // ── Supervisor Reports-To Card ────────────────────────────────────────────

    describe('Supervisor "Reports To" Card', () => {
        it('renders standard supervisor details for execution staff', () => {
            render(<EmployeeHeader data={mockStaffData} />);

            expect(screen.getByTestId('eh-supervisor-card')).toBeInTheDocument();
            expect(screen.getByTestId('eh-supervisor-name')).toHaveTextContent('Robert Vance');
            expect(screen.getByTestId('eh-supervisor-role')).toHaveTextContent('Coordinator');
            expect(screen.getByTestId('eh-supervisor-emp-no')).toHaveTextContent('#EMP-00042');
            expect(screen.getByTestId('eh-reporting-relation')).toHaveTextContent('Team Leader');
            expect(screen.getByTestId('eh-supervisor-avatar')).toHaveTextContent('RV');
            expect(screen.getByText(/Direct supervisor assigned via organizational hierarchy/i)).toBeInTheDocument();
        });

        it('renders executive board fallback text for top-level managers', () => {
            render(<EmployeeHeader data={mockManagerData} />);

            expect(screen.getByTestId('eh-supervisor-card')).toBeInTheDocument();
            expect(screen.getByTestId('eh-exec-fallback')).toBeInTheDocument();
            expect(screen.getByTestId('eh-supervisor-name')).toHaveTextContent('Executive Board');
            expect(screen.getByTestId('eh-supervisor-role')).toHaveTextContent('Executive Management · Top Level');
            expect(screen.getByText(/Reports directly to the Executive Board as Level 1 Executive Leadership/i)).toBeInTheDocument();
            expect(screen.getByTestId('eh-reporting-relation')).toHaveTextContent('Executive Board');
        });
    });

    // ── KPI Summary Cards ─────────────────────────────────────────────────────

    describe('KPI Summary Status Cards', () => {
        it('renders all 4 KPI status cards with exact counts and subtext', () => {
            render(<EmployeeHeader data={mockStaffData} />);

            const kpiGrid = screen.getByTestId('eh-kpi-grid');
            expect(kpiGrid).toBeInTheDocument();

            // Total Workload: 14 assigned + 2 created = 16
            expect(screen.getByText('TOTAL WORKLOAD')).toBeInTheDocument();
            expect(screen.getByText('16')).toBeInTheDocument();
            expect(screen.getByText('14 assigned · 2 created')).toBeInTheDocument();

            // Completed: 9
            expect(screen.getByText('COMPLETED')).toBeInTheDocument();
            expect(screen.getByText('9')).toBeInTheDocument();
            // 9 / 14 = 64% completion rate
            expect(screen.getByText('64% completion rate')).toBeInTheDocument();

            // In Progress: 4
            expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
            expect(screen.getByText('4')).toBeInTheDocument();

            // Overdue: 1
            expect(screen.getByText('OVERDUE')).toBeInTheDocument();
            expect(screen.getByText('1')).toBeInTheDocument();
            expect(screen.getByText('Action required immediately')).toBeInTheDocument();
        });

        it('handles zero task counts cleanly without NaN or errors', () => {
            const zeroData: EmployeeDashboardData = {
                ...mockStaffData,
                totalAssignedTasks: 0,
                totalCreatedTasks: 0,
                completedCount: 0,
                inProgressCount: 0,
                pendingCount: 0,
                overdueCount: 0,
            };

            render(<EmployeeHeader data={zeroData} />);

            expect(screen.getByText('TOTAL WORKLOAD')).toBeInTheDocument();
            expect(screen.getByText('0 assigned · 0 created')).toBeInTheDocument();
            expect(screen.getByText('No tasks assigned')).toBeInTheDocument();
            expect(screen.getByText('No overdue tasks')).toBeInTheDocument();
        });

        it('supports standalone props instead of a single data object', () => {
            render(
                <EmployeeHeader
                    employee={{
                        fullName: 'Samuel Green',
                        employeeNumber: 'EMP-00777',
                        role: 'Courier',
                        departmentName: 'Forwarding Team',
                        jobPositionName: 'Field Courier',
                        availabilityStatus: 'On Duty',
                        presenceStatus: 'Online',
                    }}
                    reportsTo={{
                        supervisorName: 'Alice Springs',
                        supervisorRole: 'Coordinator',
                        supervisorEmployeeNumber: 'EMP-00010',
                        reportingRelation: 'Department Coordinator',
                    }}
                    kpis={{
                        totalAssignedTasks: 8,
                        totalCreatedTasks: 0,
                        completedCount: 6,
                        inProgressCount: 2,
                        overdueCount: 0,
                    }}
                />
            );

            expect(screen.getByTestId('eh-full-name')).toHaveTextContent('Samuel Green');
            expect(screen.getByTestId('eh-emp-number')).toHaveTextContent('EMP-00777');
            expect(screen.getByTestId('eh-role-badge')).toHaveTextContent(/courier/i);
            expect(screen.getByTestId('eh-supervisor-name')).toHaveTextContent('Alice Springs');
            expect(screen.getByTestId('eh-reporting-relation')).toHaveTextContent('Department Coordinator');
            expect(screen.getByText('8 assigned · 0 created')).toBeInTheDocument();
        });

        it('renders gracefully when data is null or empty', () => {
            render(<EmployeeHeader data={null} />);

            expect(screen.getByTestId('eh-full-name')).toHaveTextContent('Unknown Employee');
            expect(screen.getByTestId('eh-emp-number')).toHaveTextContent('—');
            expect(screen.getByTestId('eh-supervisor-name')).toHaveTextContent('Executive Board');
        });
    });
});
