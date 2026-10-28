import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrgStructureTab from '../Pages/SystemAdmin_Dashboard/OrgStructureTab/OrgStructureTab';
import api from '../api';
import { ToastProvider } from '../components/Toast/Toast';
import employeeDashboardService, {
    EmployeeDashboardData,
    PaginatedTasksResponse
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

// Mock the backend api module
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

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

describe('OrgStructureNavigation Integration Tests', () => {
    const mockDepartments = [
        { id: 'dept-1', name: 'Coordinator & Customer Service Team', isActive: true, createdAt: '2026-01-01', userCount: 2, positionCount: 2 },
        { id: 'dept-2', name: 'Dispatch Team', isActive: true, createdAt: '2026-01-01', userCount: 1, positionCount: 1 }
    ];

    const mockPositions = [
        { id: 'pos-1', name: 'General Manager', departmentId: 'dept-1', departmentName: 'Coordinator & Customer Service Team', isActive: true, createdAt: '2026-01-01', userCount: 1 },
        { id: 'pos-2', name: 'Operations Lead', departmentId: 'dept-1', departmentName: 'Coordinator & Customer Service Team', isActive: true, createdAt: '2026-01-01', userCount: 1 },
        { id: 'pos-3', name: 'Field Dispatcher', departmentId: 'dept-2', departmentName: 'Dispatch Team', isActive: true, createdAt: '2026-01-01', userCount: 1 }
    ];

    const mockEmployees = [
        {
            id: 'mgr-001',
            employeeNumber: 'MGR-001',
            firstName: 'Alice',
            lastName: 'Manager',
            email: 'alice@speedex.com',
            role: 'Manager',
            departmentId: 'dept-1',
            departmentName: 'Coordinator & Customer Service Team',
            jobPositionId: 'pos-1',
            jobPositionName: 'General Manager',
            isActive: true,
            isDeactivated: false
        },
        {
            id: 'coord-002',
            employeeNumber: 'CRD-002',
            firstName: 'Bob',
            lastName: 'Coordinator',
            email: 'bob@speedex.com',
            role: 'Coordinator',
            departmentId: 'dept-1',
            departmentName: 'Coordinator & Customer Service Team',
            jobPositionId: 'pos-2',
            jobPositionName: 'Operations Lead',
            isActive: true,
            isDeactivated: false
        },
        {
            id: 'staff-003',
            employeeNumber: 'DSP-003',
            firstName: 'Charlie',
            lastName: 'Dispatcher',
            email: 'charlie@speedex.com',
            role: 'Dispatcher',
            departmentId: 'dept-2',
            departmentName: 'Dispatch Team',
            jobPositionId: 'pos-3',
            jobPositionName: 'Field Dispatcher',
            isActive: true,
            isDeactivated: false
        }
    ];

    const mockTeams = {
        data: {
            items: []
        }
    };

    const emptyTasksResponse: PaginatedTasksResponse = {
        items: [],
        totalCount: 0,
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
    };

    const createDashboardResponse = (id: string, name: string, role: string): EmployeeDashboardData => ({
        employeeId: id,
        employeeNumber: `EMP-${id}`,
        fullName: name,
        email: `${id}@speedex.com`,
        role,
        departmentName: 'Test Department',
        jobPositionName: 'Test Position',
        availabilityStatus: 'Available',
        presenceStatus: 'Online',
        isActive: true,
        reportsTo: {
            supervisorName: 'Supervisor Test',
            supervisorRole: 'Manager',
            supervisorEmployeeNumber: 'MGR-001',
            reportingRelation: 'Direct Manager'
        },
        totalAssignedTasks: 3,
        totalCreatedTasks: 1,
        completedCount: 2,
        inProgressCount: 1,
        pendingCount: 0,
        overdueCount: 0,
        statusBreakdown: [
            { status: 'Completed', count: 2, percentage: 67 },
            { status: 'In Progress', count: 1, percentage: 33 }
        ],
        priorityDistribution: [
            { priority: 'Medium', count: 3 }
        ],
        completionTrend: [
            { period: 'Week 1', completedCount: 2 }
        ]
    });

    const renderOrgStructureTab = (props: { initialEmployeeId?: string | null } = {}) => {
        return render(
            <ToastProvider>
                <OrgStructureTab {...props} />
            </ToastProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Default API mocks for OrgStructureTab initial fetch
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: mockDepartments });
            }
            if (url.includes('/api/job-positions')) {
                return Promise.resolve({ data: mockPositions });
            }
            if (url.includes('/api/user')) {
                return Promise.resolve({ data: mockEmployees });
            }
            if (url.includes('/api/Team')) {
                return Promise.resolve({ data: mockTeams });
            }
            return Promise.resolve({ data: [] });
        });

        // Default employeeDashboardService mocks
        vi.mocked(employeeDashboardService.getEmployeeDashboard).mockImplementation((id: string) => {
            const emp = mockEmployees.find(e => e.id === id);
            const name = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
            const role = emp ? String(emp.role) : 'Staff';
            return Promise.resolve(createDashboardResponse(id, name, role));
        });

        vi.mocked(employeeDashboardService.getEmployeeAssignedTasks).mockResolvedValue(emptyTasksResponse);
        vi.mocked(employeeDashboardService.getEmployeeCreatedTasks).mockResolvedValue(emptyTasksResponse);

        // Reset history state and window location search
        window.history.pushState({}, '', '/');
    });

    it('renders the 3-tier organizational chart with dashboard tooltips on cards', async () => {
        renderOrgStructureTab();

        // Wait for initial fetch to finish
        await waitFor(() => {
            expect(screen.getByText('Corporate Organizational Chart')).toBeInTheDocument();
        });

        // Verify tier headers
        expect(screen.getAllByText(/Level 1: Manager/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Level 2: Coordinator/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Level 3: Dispatcher \/ Encoder \/ Courier/i).length).toBeGreaterThanOrEqual(1);

        // Verify cards rendered with title="Click to view employee dashboard"
        const dashboardNodes = screen.getAllByTitle('Click to view employee dashboard');
        expect(dashboardNodes.length).toBeGreaterThanOrEqual(3);

        // Verify employee names rendered in the chart
        expect(screen.getByText('Alice Manager')).toBeInTheDocument();
        expect(screen.getByText('Bob Coordinator')).toBeInTheDocument();
        expect(screen.getByText('Charlie Dispatcher')).toBeInTheDocument();
    });

    it('navigates to EmployeeDashboard when Manager card is clicked and returns back on "← Back to Org Structure"', async () => {
        renderOrgStructureTab();

        await waitFor(() => {
            expect(screen.getByText('Alice Manager')).toBeInTheDocument();
        });

        // Click the Manager card
        const managerCard = screen.getByText('Alice Manager').closest('.org-chart-node');
        expect(managerCard).not.toBeNull();
        fireEvent.click(managerCard!);

        // Verify EmployeeDashboard renders
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Back to Org Structure/i })).toBeInTheDocument();
            expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledWith('mgr-001');
        });

        // Verify URL was updated with ?tab=org-structure&employeeId=mgr-001
        expect(window.location.search).toContain('employeeId=mgr-001');

        // Click "← Back to Org Structure"
        const backBtn = screen.getByRole('button', { name: /Back to Org Structure/i });
        fireEvent.click(backBtn);

        // Verify EmployeeDashboard is unmounted and Org Chart is restored
        await waitFor(() => {
            expect(screen.getByText('Corporate Organizational Chart')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Back to Org Structure/i })).not.toBeInTheDocument();
        });

        // Verify employeeId is removed from search params
        expect(window.location.search).not.toContain('employeeId=mgr-001');
    });

    it('navigates to EmployeeDashboard when Coordinator card is clicked', async () => {
        renderOrgStructureTab();

        await waitFor(() => {
            expect(screen.getByText('Bob Coordinator')).toBeInTheDocument();
        });

        // Click the Coordinator card
        const coordCard = screen.getByText('Bob Coordinator').closest('.org-chart-node');
        expect(coordCard).not.toBeNull();
        fireEvent.click(coordCard!);

        // Verify EmployeeDashboard was requested for Bob Coordinator
        await waitFor(() => {
            expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledWith('coord-002');
            expect(screen.getByRole('button', { name: /Back to Org Structure/i })).toBeInTheDocument();
        });

        // Click back
        fireEvent.click(screen.getByRole('button', { name: /Back to Org Structure/i }));

        await waitFor(() => {
            expect(screen.getByText('Corporate Organizational Chart')).toBeInTheDocument();
        });
    });

    it('navigates to EmployeeDashboard when Execution Staff member card is clicked', async () => {
        renderOrgStructureTab();

        await waitFor(() => {
            expect(screen.getByText('Charlie Dispatcher')).toBeInTheDocument();
        });

        // Click the Dispatcher card (.dept-member)
        const staffCard = screen.getByText('Charlie Dispatcher').closest('.dept-member');
        expect(staffCard).not.toBeNull();
        fireEvent.click(staffCard!);

        // Verify EmployeeDashboard was requested for Charlie Dispatcher
        await waitFor(() => {
            expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledWith('staff-003');
            expect(screen.getByRole('button', { name: /Back to Org Structure/i })).toBeInTheDocument();
        });

        // Click back
        fireEvent.click(screen.getByRole('button', { name: /Back to Org Structure/i }));

        await waitFor(() => {
            expect(screen.getByText('Corporate Organizational Chart')).toBeInTheDocument();
        });
    });

    it('immediately renders EmployeeDashboard if initialEmployeeId prop is provided (deep linking)', async () => {
        renderOrgStructureTab({ initialEmployeeId: 'staff-003' });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Back to Org Structure/i })).toBeInTheDocument();
            expect(employeeDashboardService.getEmployeeDashboard).toHaveBeenCalledWith('staff-003');
        });

        // Click back returns to org chart
        fireEvent.click(screen.getByRole('button', { name: /Back to Org Structure/i }));

        await waitFor(() => {
            expect(screen.getByText('Corporate Organizational Chart')).toBeInTheDocument();
        });
    });

    it('preserves the Map Hierarchy action via the header button and banner', async () => {
        renderOrgStructureTab();

        await waitFor(() => {
            expect(screen.getByText('Corporate Organizational Chart')).toBeInTheDocument();
        });

        // Find the "Map Hierarchy" button in the org chart view
        const mapButtons = screen.getAllByRole('button', { name: /Map Hierarchy/i });
        expect(mapButtons.length).toBeGreaterThanOrEqual(1);

        // Click Map Hierarchy
        fireEvent.click(mapButtons[0]);

        // Verify navigation to hierarchy mapping sub-tab
        await waitFor(() => {
            expect(screen.getByText('Hierarchy Mapping Form')).toBeInTheDocument();
        });
    });

    it('clears selectedEmployeeId when user switches subtabs', async () => {
        renderOrgStructureTab({ initialEmployeeId: 'mgr-001' });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Back to Org Structure/i })).toBeInTheDocument();
        });

        // Switch to "Departments" subtab
        const deptTabBtn = screen.getByRole('button', { name: 'Departments' });
        fireEvent.click(deptTabBtn);

        // Verify department subtab is active and dashboard is unmounted
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Back to Org Structure/i })).not.toBeInTheDocument();
        });
    });
});
