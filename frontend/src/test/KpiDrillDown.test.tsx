import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
    KpiBreadcrumbs,
    KpiScopeControls,
    KpiMetricCards,
    KpiDrillDownTable,
    KpiDrillDownView,
    KpiHierarchyScopeResultDTO,
    DepartmentOption,
    BreadcrumbItem,
    ScopeFilterState
} from '../Pages/OpAdmin_Dashboard/KpiDrillDown';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';
import { ReportsTab } from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';

vi.mock('../api');

const mockCompanyData: KpiHierarchyScopeResultDTO = {
    scopeLevel: 'Company',
    scopeName: 'All Departments',
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-01-31T00:00:00Z',
    totalDepartments: 2,
    totalTeams: 3,
    totalEmployees: 12,
    totalAssignedTasks: 150,
    completedTasksCount: 140,
    onTimeTasksCount: 135,
    inFullTasksCount: 138,
    otifTasksCount: 132,
    reworkTasksCount: 4,
    accurateTasksCount: 136,
    totalHandlingHours: 320.5,
    overallScore: 92.4,
    averageEmployeeScore: 91.8,
    overallRating: 'Green',
    metrics: [
        {
            metricCode: 'OTIF',
            name: 'On-Time In-Full',
            actualValue: 94.3,
            unit: '%',
            targetValue: 100,
            weight: 35,
            greenThreshold: 90,
            amberThreshold: 75,
            redThreshold: 60,
            isLowerBetter: false,
            rating: 'Green',
            weightedScore: 33.0
        },
        {
            metricCode: 'ORDER_ACCURACY',
            name: 'Order Accuracy Rate',
            actualValue: 97.1,
            unit: '%',
            targetValue: 100,
            weight: 25,
            greenThreshold: 90,
            amberThreshold: 80,
            redThreshold: 70,
            isLowerBetter: false,
            rating: 'Green',
            weightedScore: 24.3
        },
        {
            metricCode: 'TASK_COMPLETION_RATE',
            name: 'Task Completion Rate',
            actualValue: 93.3,
            unit: '%',
            targetValue: 100,
            weight: 20,
            greenThreshold: 85,
            amberThreshold: 70,
            redThreshold: 55,
            isLowerBetter: false,
            rating: 'Green',
            weightedScore: 18.7
        },
        {
            metricCode: 'AVERAGE_HANDLING_TIME',
            name: 'Average Handling Time',
            actualValue: 2.29,
            unit: 'hrs',
            targetValue: 2.5,
            weight: 20,
            greenThreshold: 2.5,
            amberThreshold: 3.5,
            redThreshold: 5.0,
            isLowerBetter: true,
            rating: 'Green',
            weightedScore: 16.4
        }
    ],
    departments: [
        {
            departmentId: '11111111-1111-1111-1111-111111111111',
            departmentName: 'Logistics Operations',
            totalEmployees: 8,
            totalTeams: 2,
            totalAssignedTasks: 100,
            completedTasksCount: 95,
            overallScore: 94.1,
            overallRating: 'Green'
        },
        {
            departmentId: '22222222-2222-2222-2222-222222222222',
            departmentName: 'Sorting Hub',
            totalEmployees: 4,
            totalTeams: 1,
            totalAssignedTasks: 50,
            completedTasksCount: 45,
            overallScore: 78.5,
            overallRating: 'Amber'
        }
    ],
    teams: [],
    employees: []
};

const mockDepartmentData: KpiHierarchyScopeResultDTO = {
    scopeLevel: 'Department',
    scopeId: '11111111-1111-1111-1111-111111111111',
    scopeName: 'Logistics Operations',
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-01-31T00:00:00Z',
    totalDepartments: 1,
    totalTeams: 2,
    totalEmployees: 8,
    totalAssignedTasks: 100,
    completedTasksCount: 95,
    onTimeTasksCount: 92,
    inFullTasksCount: 94,
    otifTasksCount: 90,
    reworkTasksCount: 2,
    accurateTasksCount: 93,
    totalHandlingHours: 210.0,
    overallScore: 94.1,
    averageEmployeeScore: 93.5,
    overallRating: 'Green',
    metrics: mockCompanyData.metrics,
    departments: [],
    teams: [
        {
            teamId: '33333333-3333-3333-3333-333333333333',
            teamName: 'Express Fleet Alpha',
            departmentId: '11111111-1111-1111-1111-111111111111',
            departmentName: 'Logistics Operations',
            teamLeaderName: 'Sarah Leader',
            memberCount: 5,
            totalAssignedTasks: 60,
            completedTasksCount: 58,
            overallScore: 95.0,
            overallRating: 'Green'
        },
        {
            teamId: '44444444-4444-4444-4444-444444444444',
            teamName: 'Bulk Delivery Beta',
            departmentId: '11111111-1111-1111-1111-111111111111',
            departmentName: 'Logistics Operations',
            teamLeaderName: 'Bob Leader',
            memberCount: 3,
            totalAssignedTasks: 40,
            completedTasksCount: 37,
            overallScore: 92.5,
            overallRating: 'Green'
        }
    ],
    employees: [
        {
            employeeId: '55555555-5555-5555-5555-555555555555',
            employeeName: 'Carlos Courier',
            employeeNumber: 'EMP-001',
            departmentId: '11111111-1111-1111-1111-111111111111',
            departmentName: 'Logistics Operations',
            role: 'Courier',
            jobPositionTitle: 'Senior Courier',
            periodStart: '2026-01-01T00:00:00Z',
            periodEnd: '2026-01-31T00:00:00Z',
            totalAssignedTasks: 25,
            completedTasksCount: 25,
            onTimeTasksCount: 24,
            inFullTasksCount: 25,
            otifTasksCount: 24,
            reworkTasksCount: 0,
            accurateTasksCount: 25,
            totalHandlingHours: 50.0,
            overallScore: 98.0,
            overallRating: 'Green',
            metrics: mockCompanyData.metrics
        }
    ]
};

const mockTeamData: KpiHierarchyScopeResultDTO = {
    scopeLevel: 'Team',
    scopeId: '33333333-3333-3333-3333-333333333333',
    scopeName: 'Express Fleet Alpha',
    parentScopeId: '11111111-1111-1111-1111-111111111111',
    parentScopeName: 'Logistics Operations',
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-01-31T00:00:00Z',
    totalDepartments: 1,
    totalTeams: 1,
    totalEmployees: 5,
    totalAssignedTasks: 60,
    completedTasksCount: 58,
    onTimeTasksCount: 56,
    inFullTasksCount: 57,
    otifTasksCount: 55,
    reworkTasksCount: 1,
    accurateTasksCount: 57,
    totalHandlingHours: 120.0,
    overallScore: 95.0,
    averageEmployeeScore: 94.8,
    overallRating: 'Green',
    metrics: mockCompanyData.metrics,
    departments: [],
    teams: [],
    employees: [
        {
            employeeId: '55555555-5555-5555-5555-555555555555',
            employeeName: 'Carlos Courier',
            employeeNumber: 'EMP-001',
            departmentId: '11111111-1111-1111-1111-111111111111',
            departmentName: 'Logistics Operations',
            role: 'Courier',
            jobPositionTitle: 'Senior Courier',
            periodStart: '2026-01-01T00:00:00Z',
            periodEnd: '2026-01-31T00:00:00Z',
            totalAssignedTasks: 25,
            completedTasksCount: 25,
            onTimeTasksCount: 24,
            inFullTasksCount: 25,
            otifTasksCount: 24,
            reworkTasksCount: 0,
            accurateTasksCount: 25,
            totalHandlingHours: 50.0,
            overallScore: 98.0,
            overallRating: 'Green',
            metrics: mockCompanyData.metrics
        }
    ]
};

const mockEmployeeData: KpiHierarchyScopeResultDTO = {
    scopeLevel: 'Employee',
    scopeId: '55555555-5555-5555-5555-555555555555',
    scopeName: 'Carlos Courier',
    parentScopeId: '11111111-1111-1111-1111-111111111111',
    parentScopeName: 'Logistics Operations',
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-01-31T00:00:00Z',
    roleFilter: 'Courier',
    totalDepartments: 1,
    totalTeams: 0,
    totalEmployees: 1,
    totalAssignedTasks: 25,
    completedTasksCount: 25,
    onTimeTasksCount: 24,
    inFullTasksCount: 25,
    otifTasksCount: 24,
    reworkTasksCount: 0,
    accurateTasksCount: 25,
    totalHandlingHours: 50.0,
    overallScore: 98.0,
    averageEmployeeScore: 98.0,
    overallRating: 'Green',
    metrics: mockCompanyData.metrics,
    departments: [],
    teams: [],
    employees: [
        {
            employeeId: '55555555-5555-5555-5555-555555555555',
            employeeName: 'Carlos Courier',
            employeeNumber: 'EMP-001',
            departmentId: '11111111-1111-1111-1111-111111111111',
            departmentName: 'Logistics Operations',
            role: 'Courier',
            jobPositionTitle: 'Senior Courier',
            periodStart: '2026-01-01T00:00:00Z',
            periodEnd: '2026-01-31T00:00:00Z',
            totalAssignedTasks: 25,
            completedTasksCount: 25,
            onTimeTasksCount: 24,
            inFullTasksCount: 25,
            otifTasksCount: 24,
            reworkTasksCount: 0,
            accurateTasksCount: 25,
            totalHandlingHours: 50.0,
            overallScore: 98.0,
            overallRating: 'Green',
            metrics: mockCompanyData.metrics
        }
    ]
};

const mockDepartmentOptions: DepartmentOption[] = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Logistics Operations' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Sorting Hub' }
];

describe('Hierarchical KPI Drill-Down UI Components', () => {
    beforeEach(() => {
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
        vi.clearAllMocks();
    });

    describe('KpiBreadcrumbs', () => {
        it('renders single root breadcrumb without back button', () => {
            const crumbs: BreadcrumbItem[] = [{ level: 'Company', name: 'All Departments' }];
            const onNavigate = vi.fn();
            const onBack = vi.fn();

            render(
                <KpiBreadcrumbs breadcrumbs={crumbs} onNavigate={onNavigate} onBack={onBack} />
            );

            expect(screen.getByText('All Departments')).toBeInTheDocument();
            expect(screen.queryByLabelText('Back to parent scope')).not.toBeInTheDocument();
        });

        it('renders multi-level breadcrumbs and triggers navigation callbacks', () => {
            const crumbs: BreadcrumbItem[] = [
                { level: 'Company', name: 'All Departments' },
                { level: 'Department', id: 'dept-1', name: 'Logistics' },
                { level: 'Team', id: 'team-1', name: 'Alpha Fleet' }
            ];
            const onNavigate = vi.fn();
            const onBack = vi.fn();

            render(
                <KpiBreadcrumbs breadcrumbs={crumbs} onNavigate={onNavigate} onBack={onBack} />
            );

            expect(screen.getByLabelText('Back to parent scope')).toBeInTheDocument();
            expect(screen.getByTestId('breadcrumb-link-company')).toBeInTheDocument();
            expect(screen.getByTestId('breadcrumb-link-department')).toBeInTheDocument();
            expect(screen.getByTestId('breadcrumb-current-team')).toBeInTheDocument();

            // Click back button
            fireEvent.click(screen.getByLabelText('Back to parent scope'));
            expect(onBack).toHaveBeenCalledTimes(1);

            // Click ancestor link
            fireEvent.click(screen.getByTestId('breadcrumb-link-department'));
            expect(onNavigate).toHaveBeenCalledWith(crumbs[1], 1);
        });
    });

    describe('KpiScopeControls', () => {
        it('handles timeframe preset button clicks', () => {
            const filters: ScopeFilterState = {
                timeframe: '30d',
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                role: ''
            };
            const onFilterChange = vi.fn();

            render(
                <KpiScopeControls
                    filters={filters}
                    searchQuery=""
                    isLoading={false}
                    onFilterChange={onFilterChange}
                    onSearchChange={vi.fn()}
                    onRefresh={vi.fn()}
                />
            );

            const sevenDaysBtn = screen.getByText('Last 7 Days');
            fireEvent.click(sevenDaysBtn);

            expect(onFilterChange).toHaveBeenCalledWith(
                expect.objectContaining({ timeframe: '7d' })
            );
        });

        it('handles role filter selection', () => {
            const filters: ScopeFilterState = {
                timeframe: '30d',
                startDate: '2026-01-01',
                endDate: '2026-01-31',
                role: ''
            };
            const onFilterChange = vi.fn();

            render(
                <KpiScopeControls
                    filters={filters}
                    searchQuery=""
                    isLoading={false}
                    onFilterChange={onFilterChange}
                    onSearchChange={vi.fn()}
                    onRefresh={vi.fn()}
                />
            );

            const roleSelect = screen.getByLabelText('Filter by role');
            fireEvent.change(roleSelect, { target: { value: 'Courier' } });

            expect(onFilterChange).toHaveBeenCalledWith({ role: 'Courier' });
        });
    });

    describe('KpiMetricCards', () => {
        it('renders summary score and individual KPI cards', () => {
            render(<KpiMetricCards data={mockCompanyData} />);

            expect(screen.getByText('92.4%')).toBeInTheDocument();
            expect(screen.getByTestId('kpi-overall-rating-badge')).toHaveTextContent('Green');
            expect(screen.getByText('140 / 150')).toBeInTheDocument();

            // Check metric cards
            expect(screen.getByTestId('kpi-metric-card-otif')).toBeInTheDocument();
            expect(screen.getByTestId('kpi-metric-card-order_accuracy')).toBeInTheDocument();
            expect(screen.getByTestId('kpi-metric-card-task_completion_rate')).toBeInTheDocument();
            expect(screen.getByTestId('kpi-metric-card-average_handling_time')).toBeInTheDocument();
        });
    });

    describe('KpiDrillDownTable', () => {
        it('renders company view with department rows and drill-down action', () => {
            const onDrillToDepartment = vi.fn();

            render(
                <KpiDrillDownTable
                    data={mockCompanyData}
                    searchQuery=""
                    onDrillToDepartment={onDrillToDepartment}
                    onDrillToTeam={vi.fn()}
                    onDrillToEmployee={vi.fn()}
                />
            );

            expect(screen.getByTestId('kpi-company-view')).toBeInTheDocument();
            expect(screen.getByText('Logistics Operations')).toBeInTheDocument();
            expect(screen.getByText('Sorting Hub')).toBeInTheDocument();

            const drillBtn = screen.getByLabelText('Drill down into Logistics Operations');
            fireEvent.click(drillBtn);

            expect(onDrillToDepartment).toHaveBeenCalledWith(mockCompanyData.departments[0]);
        });

        it('renders department view with tabs for teams and employees', () => {
            const onDrillToTeam = vi.fn();
            const onDrillToEmployee = vi.fn();

            render(
                <KpiDrillDownTable
                    data={mockDepartmentData}
                    searchQuery=""
                    onDrillToDepartment={vi.fn()}
                    onDrillToTeam={onDrillToTeam}
                    onDrillToEmployee={onDrillToEmployee}
                />
            );

            expect(screen.getByTestId('kpi-department-view')).toBeInTheDocument();
            expect(screen.getByText('Express Fleet Alpha')).toBeInTheDocument();

            // Drill down into team
            const drillTeamBtn = screen.getByLabelText('Drill down into Express Fleet Alpha');
            fireEvent.click(drillTeamBtn);
            expect(onDrillToTeam).toHaveBeenCalledWith(mockDepartmentData.teams[0]);

            // Switch to employees tab
            fireEvent.click(screen.getByTestId('tab-employees'));
            expect(screen.getByText('Carlos Courier')).toBeInTheDocument();

            // Drill down into employee
            const drillEmpBtn = screen.getByLabelText('View scorecard for Carlos Courier');
            fireEvent.click(drillEmpBtn);
            expect(onDrillToEmployee).toHaveBeenCalledWith(mockDepartmentData.employees[0]);
        });

        it('renders team view with team members', () => {
            const onDrillToEmployee = vi.fn();

            render(
                <KpiDrillDownTable
                    data={mockTeamData}
                    searchQuery=""
                    onDrillToDepartment={vi.fn()}
                    onDrillToTeam={vi.fn()}
                    onDrillToEmployee={onDrillToEmployee}
                />
            );

            expect(screen.getByTestId('kpi-team-view')).toBeInTheDocument();
            expect(screen.getByText('Carlos Courier')).toBeInTheDocument();

            fireEvent.click(screen.getByLabelText('View scorecard for Carlos Courier'));
            expect(onDrillToEmployee).toHaveBeenCalledWith(mockTeamData.employees[0]);
        });

        it('renders employee scorecard view with metric breakdown and task volume', () => {
            render(
                <KpiDrillDownTable
                    data={mockEmployeeData}
                    searchQuery=""
                    onDrillToDepartment={vi.fn()}
                    onDrillToTeam={vi.fn()}
                    onDrillToEmployee={vi.fn()}
                />
            );

            expect(screen.getByTestId('kpi-employee-view')).toBeInTheDocument();
            expect(screen.getByText('Employee Performance Scorecard')).toBeInTheDocument();
            expect(screen.getByText('ID: #EMP-001')).toBeInTheDocument();
            expect(screen.getByTestId('emp-metric-row-otif')).toBeInTheDocument();
            expect(screen.getByText('On-Time Deliveries')).toBeInTheDocument();
        });
    });

    describe('KpiDrillDownView Integration', () => {
        it('loads company scope by default and handles drill-down from Department to Team to Employee', async () => {
            (api.get as any).mockImplementation((url: string, params: any) => {
                if (params?.employeeId) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockEmployeeData } });
                }
                if (params?.teamId) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockTeamData } });
                }
                if (params?.departmentId) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDepartmentData } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: mockCompanyData } });
            });

            render(
                <ToastProvider>
                    <KpiDrillDownView departments={mockDepartmentOptions} />
                </ToastProvider>
            );

            // Wait for initial Company view
            await waitFor(() => {
                expect(screen.getByTestId('kpi-company-view')).toBeInTheDocument();
            });
            expect(screen.getByTestId('dept-row-11111111-1111-1111-1111-111111111111')).toHaveTextContent('Logistics Operations');

            // 1. Drill down into Department
            const deptDrillBtn = screen.getByLabelText('Drill down into Logistics Operations');
            fireEvent.click(deptDrillBtn);

            await waitFor(() => {
                expect(screen.getByTestId('kpi-department-view')).toBeInTheDocument();
            });
            expect(screen.getByTestId('team-row-33333333-3333-3333-3333-333333333333')).toHaveTextContent('Express Fleet Alpha');
            expect(screen.getByTestId('breadcrumb-current-department')).toBeInTheDocument();

            // 2. Drill down into Team
            const teamDrillBtn = screen.getByLabelText('Drill down into Express Fleet Alpha');
            fireEvent.click(teamDrillBtn);

            await waitFor(() => {
                expect(screen.getByTestId('kpi-team-view')).toBeInTheDocument();
            });
            expect(screen.getByText('Carlos Courier')).toBeInTheDocument();
            expect(screen.getByTestId('breadcrumb-current-team')).toBeInTheDocument();

            // 3. Drill down into Employee
            const empDrillBtn = screen.getByLabelText('View scorecard for Carlos Courier');
            fireEvent.click(empDrillBtn);

            await waitFor(() => {
                expect(screen.getByTestId('kpi-employee-view')).toBeInTheDocument();
            });
            expect(screen.getByText('Employee Performance Scorecard')).toBeInTheDocument();
            expect(screen.getByTestId('breadcrumb-current-employee')).toBeInTheDocument();

            // 4. Navigate back using breadcrumbs to Company
            const companyBreadcrumb = screen.getByTestId('breadcrumb-link-company');
            fireEvent.click(companyBreadcrumb);

            await waitFor(() => {
                expect(screen.getByTestId('kpi-company-view')).toBeInTheDocument();
            });
        });

        it('filters by role (Courier) and updates API query', async () => {
            (api.get as any).mockResolvedValue({
                data: {
                    isSuccess: true,
                    data: {
                        ...mockCompanyData,
                        roleFilter: 'Courier'
                    }
                }
            });

            render(
                <ToastProvider>
                    <KpiDrillDownView departments={mockDepartmentOptions} />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('kpi-company-view')).toBeInTheDocument();
            });

            const roleSelect = screen.getByLabelText('Filter by role');
            fireEvent.change(roleSelect, { target: { value: 'Courier' } });

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    '/api/kpi/scope',
                    expect.objectContaining({ role: 'Courier' })
                );
            });
        });

        it('displays error banner when API returns error', async () => {
            (api.get as any).mockRejectedValue(new Error('Network error loading scope data'));

            render(
                <ToastProvider>
                    <KpiDrillDownView departments={mockDepartmentOptions} />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('kpi-error-banner')).toBeInTheDocument();
            });
            expect(screen.getByTestId('kpi-error-banner')).toHaveTextContent('Network error loading scope data');
        });

        it('renders header and handles navigation to KPI configuration when clicked', async () => {
            const onNavigate = vi.fn();
            (api.get as any).mockResolvedValue({
                data: {
                    isSuccess: true,
                    data: mockCompanyData
                }
            });

            render(
                <ToastProvider>
                    <KpiDrillDownView
                        departments={mockDepartmentOptions}
                        onNavigateToConfig={onNavigate}
                    />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('kpi-nav-to-config-btn')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('kpi-nav-to-config-btn'));
            expect(onNavigate).toHaveBeenCalledTimes(1);
        });
    });

    describe('Manager Dashboard ReportsTab Integration', () => {
        beforeEach(() => {
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
            (api.get as any).mockImplementation((url: string) => {
                if (url === '/api/reports/filter-options') {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                departments: [{ id: 'dept-1', name: 'Logistics Operations' }],
                                employees: [{ id: 'emp-1', name: 'Carlos Courier' }]
                            }
                        }
                    });
                }
                if (url === '/api/kpi/scope') {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: mockCompanyData
                        }
                    });
                }
                if (url.startsWith('/api/kpi/configurations')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: []
                        }
                    });
                }
                if (url.startsWith('/api/reports/kpi')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                totalCompletedTasks: 12,
                                totalOnTimeTasks: 10,
                                totalLateTasks: 2,
                                overallOnTimeRate: 83,
                                overallLateRate: 17,
                                employeeKpis: []
                            }
                        }
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: {} } });
            });
        });

        it('renders hierarchical drill-down view by default under KPI tracking', async () => {
            render(
                <ToastProvider>
                    <ReportsTab teamMembers={[{ accountId: 'emp-1', employeeName: 'Carlos Courier' }]} />
                </ToastProvider>
            );

            // Verify the view mode toggle is present and set to drilldown
            expect(screen.getByTestId('kpi-view-mode-drilldown')).toHaveClass('active');
            expect(screen.getByTestId('kpi-view-mode-legacy')).not.toHaveClass('active');

            // Verify KpiDrillDownView is mounted and active
            await waitFor(() => {
                expect(screen.getByTestId('kpi-hierarchical-view')).toBeInTheDocument();
            });
            expect(screen.getByTestId('kpi-company-view')).toBeInTheDocument();
            expect(screen.getByText('Hierarchical KPI & Performance Drill-Down')).toBeInTheDocument();
        });

        it('allows toggling between hierarchical drill-down and legacy SLA overview', async () => {
            render(
                <ToastProvider>
                    <ReportsTab teamMembers={[{ accountId: 'emp-1', employeeName: 'Carlos Courier' }]} />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('kpi-hierarchical-view')).toBeInTheDocument();
            });

            // Switch to Legacy SLA Overview
            const legacyBtn = screen.getByTestId('kpi-view-mode-legacy');
            fireEvent.click(legacyBtn);

            expect(screen.getByTestId('kpi-view-mode-legacy')).toHaveClass('active');
            expect(screen.getByTestId('kpi-view-mode-drilldown')).not.toHaveClass('active');
            expect(screen.getByText('📊 KPI Tracking & SLA Performance')).toBeInTheDocument();

            // Switch back to Hierarchical Drill-Down
            const drilldownBtn = screen.getByTestId('kpi-view-mode-drilldown');
            fireEvent.click(drilldownBtn);

            expect(screen.getByTestId('kpi-view-mode-drilldown')).toHaveClass('active');
            expect(screen.getByTestId('kpi-hierarchical-view')).toBeInTheDocument();
        });

        it('navigates to KPI configuration tab from header action button', async () => {
            const onNavigateToTab = vi.fn();
            render(
                <ToastProvider>
                    <ReportsTab
                        teamMembers={[{ accountId: 'emp-1', employeeName: 'Carlos Courier' }]}
                        onNavigateToTab={onNavigateToTab}
                    />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('kpi-nav-to-config-btn')).toBeInTheDocument();
            });

            // Click Configure KPIs
            fireEvent.click(screen.getByTestId('kpi-nav-to-config-btn'));

            // Verify KPI Configuration navigation to General tab is triggered
            expect(onNavigateToTab).toHaveBeenCalledWith('kpi_configuration');
        });

        it('renders scope export PDF and Excel buttons and triggers scope export file download', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url === '/api/kpi/scope') {
                    return Promise.resolve({ data: { isSuccess: true, data: mockCompanyData } });
                }
                if (url === '/api/kpi/export/scope') {
                    return Promise.resolve({ data: new Blob(['pdf-data'], { type: 'application/pdf' }) });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <ToastProvider>
                    <KpiDrillDownView />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('kpi-export-pdf-btn')).toBeInTheDocument();
                expect(screen.getByTestId('kpi-export-excel-btn')).toBeInTheDocument();
            });

            // Click Export PDF
            fireEvent.click(screen.getByTestId('kpi-export-pdf-btn'));

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    '/api/kpi/export/scope',
                    expect.objectContaining({
                        level: 'Company',
                        format: 'pdf'
                    }),
                    expect.objectContaining({
                        responseType: 'blob'
                    })
                );
            });

            // Click Export Excel
            fireEvent.click(screen.getByTestId('kpi-export-excel-btn'));

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    '/api/kpi/export/scope',
                    expect.objectContaining({
                        level: 'Company',
                        format: 'excel'
                    }),
                    expect.objectContaining({
                        responseType: 'blob'
                    })
                );
            });
        });

        it('renders individual employee scorecard export buttons in employee view and triggers export', async () => {
            const employeeScopeData: KpiHierarchyScopeResultDTO = {
                ...mockCompanyData,
                scopeLevel: 'Employee',
                scopeId: 'emp-101',
                scopeName: 'Carlos Courier',
                employees: [
                    {
                        employeeId: 'emp-101',
                        employeeName: 'Carlos Courier',
                        employeeNumber: 'EMP001',
                        periodStart: '2026-01-01',
                        periodEnd: '2026-01-31',
                        totalAssignedTasks: 10,
                        completedTasksCount: 10,
                        onTimeTasksCount: 10,
                        inFullTasksCount: 10,
                        otifTasksCount: 10,
                        reworkTasksCount: 0,
                        accurateTasksCount: 10,
                        totalHandlingHours: 20,
                        overallScore: 100,
                        overallRating: 'Green',
                        metrics: []
                    }
                ]
            };

            (api.get as any).mockImplementation((url: string) => {
                if (url === '/api/kpi/scope') {
                    return Promise.resolve({ data: { isSuccess: true, data: employeeScopeData } });
                }
                if (url.startsWith('/api/kpi/export/scorecard')) {
                    return Promise.resolve({ data: new Blob(['pdf-data'], { type: 'application/pdf' }) });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <ToastProvider>
                    <KpiDrillDownView initialDepartmentId="dept-1" />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('emp-export-pdf-btn')).toBeInTheDocument();
                expect(screen.getByTestId('emp-export-excel-btn')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('emp-export-pdf-btn'));

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    '/api/kpi/export/scorecard',
                    expect.objectContaining({
                        employeeId: 'emp-101',
                        format: 'pdf'
                    }),
                    expect.objectContaining({
                        responseType: 'blob'
                    })
                );
            });
        });

    });
});
