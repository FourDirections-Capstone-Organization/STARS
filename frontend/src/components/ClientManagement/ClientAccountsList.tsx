import React, { useState, useMemo } from 'react';
import {
    Search,
    RefreshCw,
    UserPlus,
    UserCheck,
    Eye,
    PlusCircle,
    Building2,
    Lock,
    AlertTriangle,
    Shield,
    X,
} from 'lucide-react';
import { FomsClientAccount, ClientAccountsListProps } from './types';
import './ClientManagement.css';

export const ClientAccountsList: React.FC<ClientAccountsListProps> = ({
    clients = [],
    loading = false,
    userRole,
    currentUserId,
    onRefresh,
    onViewClientDetails,
    onAssignCoordinator,
    onCreateTask,
    showFilters = true,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'unassigned'>('all');

    const currentUserRole = userRole || localStorage.getItem('userRole') || localStorage.getItem('role') || 'Manager';
    const isManager = currentUserRole.toLowerCase() === 'manager' ||
        currentUserRole.toLowerCase() === 'systemadmin' ||
        currentUserRole.toLowerCase() === 'opadmin' ||
        currentUserRole.toLowerCase() === 'director';
    const isCoordinator = currentUserRole.toLowerCase() === 'coordinator';

    // Filter clients
    const filteredClients = useMemo(() => {
        let list = [...clients];

        // Coordinator Scoping safety check (FR-011): if current user is Coordinator and coordinator ID provided,
        // ensure client list is restricted to their assigned accounts if not already scoped by backend
        if (isCoordinator && currentUserId) {
            list = list.filter(c => c.assignedCoordinatorId === currentUserId);
        }

        if (statusFilter === 'active') {
            list = list.filter(c => String(c.status).toLowerCase() === 'active');
        } else if (statusFilter === 'inactive') {
            list = list.filter(c => String(c.status).toLowerCase() === 'inactive');
        } else if (statusFilter === 'unassigned') {
            list = list.filter(c => !c.assignedCoordinatorId || !c.assignedCoordinatorName || c.assignedCoordinatorName === 'Unassigned');
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(c =>
                c.clientAccountId?.toLowerCase().includes(q) ||
                c.clientName?.toLowerCase().includes(q) ||
                c.contactPerson?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                c.address?.toLowerCase().includes(q) ||
                c.accountHandlerEmployeeNumber?.toLowerCase().includes(q) ||
                c.accountHandlerName?.toLowerCase().includes(q) ||
                c.assignedCoordinatorName?.toLowerCase().includes(q)
            );
        }

        return list;
    }, [clients, isCoordinator, currentUserId, statusFilter, searchQuery]);

    return (
        <div className="client-accounts-list-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
            {/* Filter and Search Bar */}
            {showFilters && (
                <div className="client-controls-bar">
                    <div className="client-search-wrapper">
                        <Search size={15} className="client-search-icon" />
                        <input
                            type="text"
                            className="client-search-input"
                            data-testid="client-search-input"
                            placeholder="Search client ID, name, contact, or address..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: 8,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94a3b8',
                                }}
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="client-filter-group">
                        <button
                            type="button"
                            className={`client-filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('all')}
                            data-testid="filter-all"
                        >
                            All ({clients.length})
                        </button>
                        <button
                            type="button"
                            className={`client-filter-chip ${statusFilter === 'active' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('active')}
                            data-testid="filter-active"
                        >
                            Active ({clients.filter(c => String(c.status).toLowerCase() === 'active').length})
                        </button>
                        <button
                            type="button"
                            className={`client-filter-chip ${statusFilter === 'inactive' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('inactive')}
                            data-testid="filter-inactive"
                        >
                            Inactive ({clients.filter(c => String(c.status).toLowerCase() === 'inactive').length})
                        </button>
                        {isManager && (
                            <button
                                type="button"
                                className={`client-filter-chip ${statusFilter === 'unassigned' ? 'active' : ''}`}
                                onClick={() => setStatusFilter('unassigned')}
                                data-testid="filter-unassigned"
                            >
                                Unassigned ({clients.filter(c => !c.assignedCoordinatorId || !c.assignedCoordinatorName || c.assignedCoordinatorName === 'Unassigned').length})
                            </button>
                        )}

                        {onRefresh && (
                            <button
                                type="button"
                                className="btn-client-action"
                                onClick={onRefresh}
                                disabled={loading}
                                data-testid="refresh-clients-btn"
                                title="Refresh from STARS Reference Store"
                            >
                                <RefreshCw size={13} className={loading ? 'spin' : ''} />
                                Refresh
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Read-Only Helper Tooltip / Notice */}
            <div
                className="foms-master-notice"
                data-testid="foms-master-notice"
                title="Client account master data is managed in FOMS."
            >
                <Lock size={15} className="foms-master-notice-icon" />
                <span>
                    <strong>Master Data Notice:</strong> Client account master data is managed in FOMS. All profile attributes (name, address, contacts) are read-only reference data in STARS.
                </span>
            </div>

            {/* Client Accounts Table */}
            <div className="client-table-container">
                <table className="client-table" data-testid="client-accounts-table">
                    <thead>
                        <tr>
                            <th>Client ID</th>
                            <th>Client Name</th>
                            <th>Contact Person</th>
                            <th>FOMS Handler</th>
                            <th>Status</th>
                            <th>Managing Coordinator</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && clients.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                                    <div>Loading synchronized client reference records...</div>
                                </td>
                            </tr>
                        ) : filteredClients.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                                    <Building2 size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                    <div>No client accounts found matching your query.</div>
                                </td>
                            </tr>
                        ) : (
                            filteredClients.map(client => {
                                const isActive = String(client.status).toLowerCase() === 'active';
                                const isUnassigned = !client.assignedCoordinatorId ||
                                    !client.assignedCoordinatorName ||
                                    client.assignedCoordinatorName === 'Unassigned';
                                const hasUnrecognizedHandler = Boolean(
                                    client.accountHandlerEmployeeNumber && !client.accountHandlerUserId
                                );

                                return (
                                    <tr key={client.clientAccountId} data-testid={`client-row-${client.clientAccountId}`}>
                                        {/* Client Account ID */}
                                        <td>
                                            <span className="client-id-badge" title="Master Unique Key">
                                                {client.clientAccountId}
                                            </span>
                                        </td>

                                        {/* Client Name */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span
                                                    style={{ fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}
                                                    onClick={() => onViewClientDetails && onViewClientDetails(client)}
                                                    title="Click to view read-only master profile"
                                                >
                                                    {client.clientName}
                                                </span>
                                                {client.address && (
                                                    <span style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={client.address}>
                                                        {client.address}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Contact Person */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.82rem', color: '#1e293b' }}>
                                                    {client.contactPerson || '—'}
                                                </span>
                                                {(client.contactNumber || client.email) && (
                                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                        {client.contactNumber || client.email}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* FOMS Account Handler */}
                                        <td>
                                            <div className="account-handler-info">
                                                {client.accountHandlerName ? (
                                                    <span className="handler-name">{client.accountHandlerName}</span>
                                                ) : client.accountHandlerEmployeeNumber ? (
                                                    hasUnrecognizedHandler ? (
                                                        <span className="handler-unrecognized" title="Employee not found in STARS registry">
                                                            <AlertTriangle size={11} />
                                                            Unrecognized ({client.accountHandlerEmployeeNumber})
                                                        </span>
                                                    ) : (
                                                        <span className="handler-emp">EMP: {client.accountHandlerEmployeeNumber}</span>
                                                    )
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Status Pill: Green for Active, Gray for Inactive */}
                                        <td>
                                            <span
                                                className={`status-pill ${isActive ? 'active' : 'inactive'}`}
                                                data-testid={`status-pill-${client.clientAccountId}`}
                                            >
                                                <span className="status-pill-dot" />
                                                {isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>

                                        {/* Managing Coordinator */}
                                        <td>
                                            {isUnassigned ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                    <span
                                                        className="assignment-badge unassigned"
                                                        data-testid={`unassigned-badge-${client.clientAccountId}`}
                                                    >
                                                        Unassigned
                                                    </span>

                                                    {/* 1-click Assign Coordinator Action Button for Managers */}
                                                    {isManager && onAssignCoordinator && (
                                                        <button
                                                            type="button"
                                                            className="btn-assign-coordinator"
                                                            onClick={() => onAssignCoordinator(client)}
                                                            data-testid="assign-coordinator-btn"
                                                            title="Assign Managing Coordinator (FR-011)"
                                                        >
                                                            <UserPlus size={12} />
                                                            Assign Coordinator
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span
                                                        className="assignment-badge assigned"
                                                        data-testid={`assigned-badge-${client.clientAccountId}`}
                                                    >
                                                        <UserCheck size={12} />
                                                        {client.assignedCoordinatorName}
                                                    </span>

                                                    {isManager && onAssignCoordinator && (
                                                        <button
                                                            type="button"
                                                            className="btn-reassign"
                                                            onClick={() => onAssignCoordinator(client)}
                                                            data-testid="reassign-coordinator-btn"
                                                            title="Reassign Coordinator"
                                                        >
                                                            Reassign
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="client-actions" style={{ justifyContent: 'flex-end' }}>
                                                {onViewClientDetails && (
                                                    <button
                                                        type="button"
                                                        className="btn-client-action"
                                                        onClick={() => onViewClientDetails(client)}
                                                        data-testid={`view-details-${client.clientAccountId}`}
                                                        title="View full read-only master profile"
                                                    >
                                                        <Eye size={12} />
                                                        Details
                                                    </button>
                                                )}

                                                {onCreateTask && (
                                                    <button
                                                        type="button"
                                                        className={`btn-client-action primary ${!isActive ? 'disabled' : ''}`}
                                                        onClick={() => {
                                                            if (isActive) {
                                                                onCreateTask(client);
                                                            }
                                                        }}
                                                        disabled={!isActive}
                                                        title={!isActive ? 'Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.' : 'Create Operational Task for Client'}
                                                        data-testid={`create-task-btn-${client.clientAccountId}`}
                                                    >
                                                        <PlusCircle size={12} />
                                                        New Task
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClientAccountsList;
