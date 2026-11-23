import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Building2,
    Users,
    CheckCircle2,
    AlertCircle,
    UserPlus,
    RefreshCw,
    Shield,
    Globe,
    UserCheck,
    Lock,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import ClientAccountsList from './ClientAccountsList';
import ClientDetailModal from './ClientDetailModal';
import ManagerCoordinatorAssignmentDrawer from './ManagerCoordinatorAssignmentDrawer';
import TaskCreateModal from './TaskCreateModal';
import { FomsClientAccount, ClientManagementViewProps } from './types';
import './ClientManagement.css';

export const ClientManagementView: React.FC<ClientManagementViewProps> = ({
    initialClientAccountId,
    userRole,
    currentUserId,
    onOpenTask,
    showHeader = true,
}) => {
    const [clients, setClients] = useState<FomsClientAccount[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Modal & Drawer States
    const [selectedDetailClient, setSelectedDetailClient] = useState<FomsClientAccount | null>(null);
    const [assigningClient, setAssigningClient] = useState<FomsClientAccount | null>(null);
    const [taskCreateClient, setTaskCreateClient] = useState<FomsClientAccount | null>(null);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState<boolean>(false);

    const { success: toastSuccess, error: toastError } = useToast();

    // Determine Role
    const effectiveRole = userRole || localStorage.getItem('userRole') || localStorage.getItem('role') || 'Manager';
    const effectiveUserId = currentUserId || localStorage.getItem('userId') || '';
    const isManager = effectiveRole.toLowerCase() === 'manager' ||
        effectiveRole.toLowerCase() === 'systemadmin' ||
        effectiveRole.toLowerCase() === 'opadmin' ||
        effectiveRole.toLowerCase() === 'director';
    const isCoordinator = effectiveRole.toLowerCase() === 'coordinator';

    // Fetch Role-Scoped Clients from Backend (GET /api/foms-integration/clients)
    const fetchClients = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        try {
            const queryParams: Record<string, string> = {};
            if (effectiveRole) queryParams.role = effectiveRole;
            if (effectiveUserId) queryParams.coordinatorId = effectiveUserId;

            const res = await api.get('/api/foms-integration/clients', {
                params: queryParams,
            });

            const data = res.data?.data || res.data || [];
            if (Array.isArray(data)) {
                setClients(data);
                setError(null);

                // If initialClientAccountId was passed (e.g. from notification click), auto-select it
                if (initialClientAccountId) {
                    const match = data.find(c => c.clientAccountId === initialClientAccountId);
                    if (match) {
                        setSelectedDetailClient(match);
                    }
                }
            }
        } catch (err: any) {
            console.warn('[FOMS] Failed to fetch client accounts:', err);
            setError(err.response?.data?.message || 'Failed to load client accounts from FOMS integration.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [effectiveRole, effectiveUserId, initialClientAccountId]);

    useEffect(() => {
        fetchClients(false);
    }, [fetchClients]);

    // Handle coordinator assignment success
    const handleAssignmentSuccess = (updatedClient: FomsClientAccount) => {
        setClients(prev => prev.map(c => c.clientAccountId === updatedClient.clientAccountId ? updatedClient : c));
        if (selectedDetailClient?.clientAccountId === updatedClient.clientAccountId) {
            setSelectedDetailClient(updatedClient);
        }
    };

    // KPI Metrics calculation
    const kpiMetrics = useMemo(() => {
        const total = clients.length;
        const active = clients.filter(c => String(c.status).toLowerCase() === 'active').length;
        const inactive = clients.filter(c => String(c.status).toLowerCase() === 'inactive').length;
        const unassigned = clients.filter(c => !c.assignedCoordinatorId || !c.assignedCoordinatorName || c.assignedCoordinatorName === 'Unassigned').length;

        return { total, active, inactive, unassigned };
    }, [clients]);

    return (
        <div className="client-mgmt-container" data-testid="client-management-view">
            {/* Header Bar */}
            {showHeader && (
                <div className="foms-header-bar" style={{ marginBottom: 0 }}>
                    <div className="foms-header-title-group">
                        <div className="foms-title-row">
                            <h2 className="foms-title">FOMS Client Reference Data & Management</h2>
                            <span className="foms-badge-m2m">M2M Inbound Sync</span>
                        </div>
                        <p className="foms-subtitle">
                            Automated synchronization pipeline between FOMS corporate master records and STARS operational reference data.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <button
                            type="button"
                            className="btn-client-action"
                            onClick={() => fetchClients(false)}
                            disabled={loading || refreshing}
                            title="Refresh from STARS reference database"
                        >
                            <RefreshCw size={13} className={loading || refreshing ? 'spin' : ''} />
                            Sync Refresh
                        </button>
                    </div>
                </div>
            )}

            {/* Role-Based Scoping Banner */}
            <div
                className={`role-scoping-banner ${isCoordinator ? 'coordinator' : 'manager'}`}
                data-testid="role-scoping-banner"
            >
                <div className="role-scoping-content">
                    {isCoordinator ? (
                        <>
                            <UserCheck size={18} style={{ flexShrink: 0 }} />
                            <div>
                                <span className="role-scoping-badge">Coordinator Scope (FR-011 / FR-010)</span>
                                <span style={{ marginLeft: 6 }}>
                                    Viewing operational client accounts assigned to you. Task creation and operational monitoring are restricted to your managed portfolio.
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <Globe size={18} style={{ flexShrink: 0 }} />
                            <div>
                                <span className="role-scoping-badge">Manager Oversight (FR-012)</span>
                                <span style={{ marginLeft: 6 }}>
                                    Global enterprise visibility across all corporate client accounts. You can allocate or reassign managing Coordinators to unassigned records.
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="client-kpi-grid">
                <div className="client-kpi-card">
                    <div className="client-kpi-info">
                        <span className="client-kpi-label">Total Synced Clients</span>
                        <span className="client-kpi-value" data-testid="kpi-total-clients">{kpiMetrics.total}</span>
                        <span className="client-kpi-sub">Reference master records</span>
                    </div>
                    <div className="client-kpi-icon teal">
                        <Building2 size={20} />
                    </div>
                </div>

                <div className="client-kpi-card">
                    <div className="client-kpi-info">
                        <span className="client-kpi-label">Active Clients</span>
                        <span className="client-kpi-value" style={{ color: '#16a34a' }} data-testid="kpi-active-clients">{kpiMetrics.active}</span>
                        <span className="client-kpi-sub">Eligible for task creation</span>
                    </div>
                    <div className="client-kpi-icon green">
                        <CheckCircle2 size={20} />
                    </div>
                </div>

                <div className="client-kpi-card">
                    <div className="client-kpi-info">
                        <span className="client-kpi-label">Inactive Accounts</span>
                        <span className="client-kpi-value" style={{ color: '#64748b' }} data-testid="kpi-inactive-clients">{kpiMetrics.inactive}</span>
                        <span className="client-kpi-sub">Task creation blocked (Gate)</span>
                    </div>
                    <div className="client-kpi-icon gray">
                        <AlertCircle size={20} />
                    </div>
                </div>

                {isManager && (
                    <div className="client-kpi-card">
                        <div className="client-kpi-info">
                            <span className="client-kpi-label">Unassigned Accounts</span>
                            <span className="client-kpi-value" style={{ color: '#d97706' }} data-testid="kpi-unassigned-clients">{kpiMetrics.unassigned}</span>
                            <span className="client-kpi-sub">Require coordinator assignment</span>
                        </div>
                        <div className="client-kpi-icon amber">
                            <UserPlus size={20} />
                        </div>
                    </div>
                )}
            </div>

            {/* Client Accounts Table */}
            <ClientAccountsList
                clients={clients}
                loading={loading}
                userRole={effectiveRole}
                currentUserId={effectiveUserId}
                onRefresh={() => fetchClients(false)}
                onViewClientDetails={client => setSelectedDetailClient(client)}
                onAssignCoordinator={client => setAssigningClient(client)}
                onCreateTask={client => {
                    setTaskCreateClient(client);
                    setIsTaskModalOpen(true);
                }}
            />

            {/* Client Detail Modal */}
            <ClientDetailModal
                isOpen={Boolean(selectedDetailClient)}
                client={selectedDetailClient}
                userRole={effectiveRole}
                onClose={() => setSelectedDetailClient(null)}
                onAssignCoordinator={client => {
                    setAssigningClient(client);
                }}
                onCreateTask={client => {
                    setSelectedDetailClient(null);
                    setTaskCreateClient(client);
                    setIsTaskModalOpen(true);
                }}
            />

            {/* Manager Coordinator Assignment Drawer */}
            <ManagerCoordinatorAssignmentDrawer
                isOpen={Boolean(assigningClient)}
                client={assigningClient}
                onClose={() => setAssigningClient(null)}
                onSuccess={handleAssignmentSuccess}
            />

            {/* Task Creation Modal with Inactive Check */}
            <TaskCreateModal
                isOpen={isTaskModalOpen}
                initialClient={taskCreateClient}
                availableClients={clients}
                onClose={() => {
                    setIsTaskModalOpen(false);
                    setTaskCreateClient(null);
                }}
                onSubmit={async (taskData) => {
                    toastSuccess(`Task "${taskData.title}" created successfully.`);
                    if (onOpenTask && taskData.clientAccountId) {
                        onOpenTask(taskData.clientAccountId);
                    }
                }}
            />
        </div>
    );
};

export default ClientManagementView;
