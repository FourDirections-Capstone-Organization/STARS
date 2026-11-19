import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientManagementView from '../components/ClientManagement/ClientManagementView';
import ClientAccountsList from '../components/ClientManagement/ClientAccountsList';
import ClientDetailModal from '../components/ClientManagement/ClientDetailModal';
import ManagerCoordinatorAssignmentDrawer from '../components/ClientManagement/ManagerCoordinatorAssignmentDrawer';
import TaskCreateModal from '../components/ClientManagement/TaskCreateModal';
import TaskForm from '../components/ClientManagement/TaskForm';
import FomsFinancialMetricsView from '../components/FomsFinancialMetrics/FomsFinancialMetricsView';
import NotificationsTab from '../components/NotificationsTab/NotificationsTab';
import { FomsClientAccount } from '../components/ClientManagement/types';
import api from '../api';

// Mock Recharts
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock API
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
    },
}));

// Mock Toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: mockToastSuccess,
        error: mockToastError,
        info: vi.fn(),
    }),
}));

describe('Integration 4: Client Account Sync → STARS Reference Data (STARS Frontend)', () => {
    const mockClients: FomsClientAccount[] = [
        {
            id: 'c1010000-0000-0000-0000-000000000001',
            clientAccountId: 'CLI-TRANSPAC-01',
            clientName: 'Trans-Pacific Express Cargo',
            contactPerson: 'Victor Ramos',
            contactNumber: '09201234567',
            email: 'victor.ramos@transpacific.com',
            address: 'Km 18, West Service Road, Parañaque City',
            accountHandlerEmployeeNumber: 'EMP-7701',
            accountHandlerUserId: 'u1010000-0000-0000-0000-000000000001',
            accountHandlerName: 'Carlos Finance',
            status: 'Active',
            assignedCoordinatorId: 'coord-guid-001',
            assignedCoordinatorName: 'Jane Coordinator',
            lastSyncedAt: new Date().toISOString(),
        },
        {
            id: 'c1010000-0000-0000-0000-000000000002',
            clientAccountId: 'CLI-HORIZON-02',
            clientName: 'Horizon Retail Holdings Inc.',
            contactPerson: 'Atty. Fernando Gomez',
            contactNumber: '09181234567',
            email: 'fgomez@horizonretail.ph',
            address: 'Commerce Tower, Ortigas Center, Pasig City',
            accountHandlerEmployeeNumber: 'EMP-9999', // Unmatched handler in STARS
            accountHandlerUserId: null,
            accountHandlerName: null,
            status: 'Active',
            assignedCoordinatorId: null, // Unassigned
            assignedCoordinatorName: 'Unassigned',
            lastSyncedAt: new Date().toISOString(),
        },
        {
            id: 'c1010000-0000-0000-0000-000000000003',
            clientAccountId: 'CLI-DEFUNCT-03',
            clientName: 'Defunct Logistics Trading Co.',
            contactPerson: 'Former Manager',
            contactNumber: '09179998888',
            email: 'info@defunctlogistics.com',
            address: 'Port Area, Manila',
            accountHandlerEmployeeNumber: 'EMP-7701',
            accountHandlerUserId: 'u1010000-0000-0000-0000-000000000001',
            accountHandlerName: 'Carlos Finance',
            status: 'Inactive', // Inactive Account
            assignedCoordinatorId: 'coord-guid-001',
            assignedCoordinatorName: 'Jane Coordinator',
            lastSyncedAt: new Date().toISOString(),
        },
    ];

    const mockCoordinators = [
        {
            id: 'coord-guid-001',
            fullName: 'Jane Coordinator',
            employeeNumber: 'EMP-COORD-01',
            workload: 2,
        },
        {
            id: 'coord-guid-002',
            fullName: 'Mark Delgado',
            employeeNumber: 'EMP-COORD-02',
            workload: 1,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('userRole', 'Manager');
        localStorage.setItem('userId', 'mgr-guid-001');

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/foms-integration/clients/CLI-HORIZON-02')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockClients[1] } });
            }
            if (url.includes('/api/foms-integration/clients/CLI-TRANSPAC-01')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockClients[0] } });
            }
            if (url.includes('/api/foms-integration/clients/CLI-DEFUNCT-03')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockClients[2] } });
            }
            if (url.includes('/api/foms-integration/clients')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockClients } });
            }
            if (url.includes('/api/Task/assignable-users')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockCoordinators } });
            }
            if (url.includes('/api/integration/foms/dashboard-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalOutstandingBalance: 500000,
                            totalOverdueBalance: 120000,
                            totalInvoicesTracked: 15,
                            overdueInvoicesCount: 3,
                            paidInvoicesCount: 10,
                            pendingInvoicesCount: 2,
                            topOutstandingClients: [],
                            lastUpdatedAt: new Date().toISOString(),
                        },
                    },
                });
            }
            if (url.includes('/api/Notification')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        (api.put as any).mockImplementation((url: string, body: any) => {
            if (url.includes('/assign-coordinator')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        message: 'Coordinator assigned successfully.',
                        data: {
                            ...mockClients[1],
                            assignedCoordinatorId: body.coordinatorId,
                            assignedCoordinatorName: 'Mark Delgado',
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true } });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Role-Scoped Client Accounts & Scoping Banner (FR-011, FR-012)
    // ─────────────────────────────────────────────────────────────
    describe('1. Role-Scoped Client Accounts & Visibility (FR-011 / FR-012)', () => {
        it('Manager view has global visibility across all client accounts (FR-012)', async () => {
            render(<ClientManagementView userRole="Manager" currentUserId="mgr-001" />);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith('/api/foms-integration/clients', expect.objectContaining({
                    params: expect.objectContaining({ role: 'Manager' }),
                }));
            });

            // Manager Oversight banner is visible
            expect(screen.getByTestId('role-scoping-banner')).toHaveTextContent(/Manager Oversight/i);
            expect(screen.getByTestId('role-scoping-banner')).toHaveTextContent(/FR-012/i);

            // Sees all 3 clients
            await waitFor(() => {
                expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
                expect(screen.getByText('Horizon Retail Holdings Inc.')).toBeInTheDocument();
                expect(screen.getByText('Defunct Logistics Trading Co.')).toBeInTheDocument();
            });

            // KPI Counts
            expect(screen.getByTestId('kpi-total-clients')).toHaveTextContent('3');
            expect(screen.getByTestId('kpi-active-clients')).toHaveTextContent('2');
            expect(screen.getByTestId('kpi-inactive-clients')).toHaveTextContent('1');
            expect(screen.getByTestId('kpi-unassigned-clients')).toHaveTextContent('1');
        });

        it('Coordinator view scopes to assigned client accounts only (FR-011, FR-010)', async () => {
            render(<ClientManagementView userRole="Coordinator" currentUserId="coord-guid-001" />);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith('/api/foms-integration/clients', expect.objectContaining({
                    params: expect.objectContaining({ role: 'Coordinator', coordinatorId: 'coord-guid-001' }),
                }));
            });

            // Scoping banner displays Coordinator Scope
            expect(screen.getByTestId('role-scoping-banner')).toHaveTextContent(/Coordinator Scope/i);
            expect(screen.getByTestId('role-scoping-banner')).toHaveTextContent(/FR-011/i);

            // Sees assigned clients (Jane Coordinator: CLI-TRANSPAC-01 and CLI-DEFUNCT-03)
            expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
            // Does not see unassigned client CLI-HORIZON-02
            expect(screen.queryByText('Horizon Retail Holdings Inc.')).not.toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Read-Only Master Data & FOMS Master Notice
    // ─────────────────────────────────────────────────────────────
    describe('2. Read-Only Master Data Display & Notice', () => {
        it('renders master data notice explaining FOMS source of record', async () => {
            render(<ClientAccountsList clients={mockClients} userRole="Manager" />);

            const notices = screen.getAllByTestId('foms-master-notice');
            expect(notices.length).toBeGreaterThan(0);
            expect(notices[0]).toHaveTextContent(/Client account master data is managed in FOMS/i);
        });

        it('displays full read-only master profile in ClientDetailModal with master data notice', async () => {
            render(
                <ClientDetailModal
                    isOpen={true}
                    client={mockClients[0]}
                    userRole="Manager"
                    onClose={vi.fn()}
                />
            );

            // Helper notice
            expect(screen.getByTestId('foms-master-notice')).toHaveTextContent(/Client account master data is managed in FOMS/i);

            // Read-only corporate attributes
            expect(screen.getAllByText('CLI-TRANSPAC-01').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('Trans-Pacific Express Cargo').length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('Victor Ramos')).toBeInTheDocument();

            expect(screen.getByText('09201234567')).toBeInTheDocument();
            expect(screen.getByText('victor.ramos@transpacific.com')).toBeInTheDocument();
            expect(screen.getByText('Km 18, West Service Road, Parañaque City')).toBeInTheDocument();

        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Status Pills (Green for Active, Gray for Inactive)
    // ─────────────────────────────────────────────────────────────
    describe('3. Status Pill Enforcement', () => {
        it('displays green badge for Active and gray badge for Inactive clients', async () => {
            render(<ClientAccountsList clients={mockClients} userRole="Manager" />);

            const activePill = screen.getByTestId('status-pill-CLI-TRANSPAC-01');
            expect(activePill).toHaveClass('active');
            expect(activePill).toHaveTextContent(/Active/i);

            const inactivePill = screen.getByTestId('status-pill-CLI-DEFUNCT-03');
            expect(inactivePill).toHaveClass('inactive');
            expect(inactivePill).toHaveTextContent(/Inactive/i);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Assignment Status & 1-Click Assignment Action (FR-011)
    // ─────────────────────────────────────────────────────────────
    describe('4. Manager Coordinator Assignment Workflow (FR-011)', () => {
        it('highlights unassigned clients with amber badge and 1-click "Assign Coordinator" button', async () => {
            render(<ClientAccountsList clients={mockClients} userRole="Manager" onAssignCoordinator={vi.fn()} />);

            // Unassigned client CLI-HORIZON-02 has amber badge
            const unassignedBadge = screen.getByTestId('unassigned-badge-CLI-HORIZON-02');
            expect(unassignedBadge).toHaveClass('unassigned');
            expect(unassignedBadge).toHaveTextContent(/Unassigned/i);

            // Manager has 1-click Assign Coordinator button
            const assignBtn = screen.getByTestId('assign-coordinator-btn');
            expect(assignBtn).toBeInTheDocument();
            expect(assignBtn).toHaveTextContent(/Assign Coordinator/i);
        });

        it('assigns coordinator via ManagerCoordinatorAssignmentDrawer and calls PUT /api/foms-integration/clients/{id}/assign-coordinator', async () => {
            const handleSuccess = vi.fn();
            render(
                <ManagerCoordinatorAssignmentDrawer
                    isOpen={true}
                    client={mockClients[1]} // CLI-HORIZON-02 (unassigned)
                    coordinators={mockCoordinators}
                    onClose={vi.fn()}
                    onSuccess={handleSuccess}
                />
            );

            // Displays target client info
            expect(screen.getByText('CLI-HORIZON-02')).toBeInTheDocument();
            expect(screen.getByText('Horizon Retail Holdings Inc.')).toBeInTheDocument();

            // Select coordinator 'Mark Delgado'
            const coordOption = screen.getByTestId('coordinator-option-coord-guid-002');
            fireEvent.click(coordOption);

            // Click Confirm Assign Coordinator
            const confirmBtn = screen.getByTestId('confirm-assign-btn');
            fireEvent.click(confirmBtn);

            await waitFor(() => {
                expect(api.put).toHaveBeenCalledWith(
                    '/api/foms-integration/clients/CLI-HORIZON-02/assign-coordinator',
                    { coordinatorId: 'coord-guid-002' }
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith('Coordinator assigned successfully.');
            expect(handleSuccess).toHaveBeenCalledWith(expect.objectContaining({
                assignedCoordinatorId: 'coord-guid-002',
                assignedCoordinatorName: 'Mark Delgado',
            }));
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Inactive Account Prevention in Task Creation (Gate Enforcement)
    // ─────────────────────────────────────────────────────────────
    describe('5. Inactive Account Prevention in Task Creation', () => {
        it('greys out inactive clients in TaskForm dropdown selector', async () => {
            render(<TaskForm availableClients={mockClients} />);

            const inactiveOption = screen.getByTestId('client-option-CLI-DEFUNCT-03');
            expect(inactiveOption).toHaveTextContent(/Inactive - FOMS/i);
            expect(inactiveOption).toHaveClass('client-option-inactive');
        });

        it('disables task submission and displays error banner when an inactive client is selected', async () => {
            const handleSubmit = vi.fn();
            render(<TaskForm availableClients={mockClients} onSubmit={handleSubmit} />);

            const selector = screen.getByTestId('client-selector');
            const submitBtn = screen.getByTestId('task-form-submit-btn');

            // Select inactive client
            fireEvent.change(selector, { target: { value: 'CLI-DEFUNCT-03' } });

            // Error banner must appear
            const banner = screen.getByTestId('client-inactive-error');
            expect(banner).toHaveTextContent(
                'Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.'
            );

            // Submit button must be disabled
            expect(submitBtn).toBeDisabled();

            // Attempting to submit does not fire onSubmit
            fireEvent.click(submitBtn);
            expect(handleSubmit).not.toHaveBeenCalled();
        });

        it('allows task creation when an Active client is selected', async () => {
            const handleSubmit = vi.fn();
            render(<TaskForm availableClients={mockClients} onSubmit={handleSubmit} />);

            const selector = screen.getByTestId('client-selector');
            const titleInput = screen.getByTestId('task-title-input');
            const submitBtn = screen.getByTestId('task-form-submit-btn');

            // Select active client
            fireEvent.change(selector, { target: { value: 'CLI-TRANSPAC-01' } });

            // Error banner is NOT present
            expect(screen.queryByTestId('client-inactive-error')).not.toBeInTheDocument();

            // Enter task title
            fireEvent.change(titleInput, { target: { value: 'Deliver corporate documents' } });

            // Submit button is enabled
            expect(submitBtn).not.toBeDisabled();

            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
                    clientAccountId: 'CLI-TRANSPAC-01',
                    clientName: 'Trans-Pacific Express Cargo',
                    title: 'Deliver corporate documents',
                }));
            });
        });

        it('disables Create Task button in ClientDetailModal if client is Inactive', async () => {
            const handleCreateTask = vi.fn();
            render(
                <ClientDetailModal
                    isOpen={true}
                    client={mockClients[2]} // CLI-DEFUNCT-03 (Inactive)
                    onClose={vi.fn()}
                    onCreateTask={handleCreateTask}
                />
            );

            // Inactive banner is shown
            expect(screen.getByTestId('inactive-account-banner')).toHaveTextContent(
                'Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.'
            );

            // Create Task button is disabled
            const createBtn = screen.getByTestId('detail-create-task-btn');
            expect(createBtn).toBeDisabled();
            expect(createBtn).toHaveClass('disabled');

            fireEvent.click(createBtn);
            expect(handleCreateTask).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Missing Account Handler Notifications & Shortcut
    // ─────────────────────────────────────────────────────────────
    describe('6. Missing Account Handler Notifications & View Shortcut', () => {
        it('renders notification and provides shortcut to view client details when unrecognized account handler alert arrives', async () => {
            const handleViewClientDetails = vi.fn();
            const mockNotifs = [
                {
                    id: 'notif-handler-01',
                    title: 'Unmatched FOMS Account Handler',
                    message: "Client account 'CLI-HORIZON-02' (Horizon Retail Holdings Inc.) was synchronized with Account Handler 'EMP-9999', but no matching employee was found in STARS.",
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    type: 'TaskUpdated',
                },
            ];

            render(
                <NotificationsTab
                    extraNotifications={mockNotifs}
                    onViewClientDetails={handleViewClientDetails}
                />
            );

            // Notification text is present
            await waitFor(() => {
                expect(screen.getByText(/Unmatched FOMS Account Handler/i)).toBeInTheDocument();
                expect(screen.getByText(/was synchronized with Account Handler 'EMP-9999'/i)).toBeInTheDocument();
            });

            // Shortcut button "View Client Details" is present
            const shortcutBtn = await screen.findByTestId('view-client-details-shortcut');
            expect(shortcutBtn).toBeInTheDocument();
            expect(shortcutBtn).toHaveTextContent(/View Client Details/i);

            // Clicking shortcut calls handler with parsed client account id 'CLI-HORIZON-02'
            fireEvent.click(shortcutBtn);
            expect(handleViewClientDetails).toHaveBeenCalledWith('CLI-HORIZON-02');

        });
    });

    // ─────────────────────────────────────────────────────────────
    // 7. Tab Integration in FomsFinancialMetricsView
    // ─────────────────────────────────────────────────────────────
    describe('7. FomsFinancialMetricsView Client Accounts Tab Navigation', () => {
        it('allows navigating to "Client Accounts" tab in FOMS Hub and displays client reference records', async () => {
            render(<FomsFinancialMetricsView initialTab="clients" />);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith('/api/foms-integration/clients', expect.anything());
            });

            // Client Management view is rendered
            expect(screen.getByTestId('client-management-view')).toBeInTheDocument();
            expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();

            // Can switch back to balances
            const balancesTab = screen.getByText(/Client Financial Balances/i);
            fireEvent.click(balancesTab);

            expect(screen.getByText(/Total Outstanding/i)).toBeInTheDocument();
        });
    });
});
