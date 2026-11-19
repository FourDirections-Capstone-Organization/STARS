import React, { useState, useEffect } from 'react';
import {
    X,
    Building2,
    Shield,
    Lock,
    User,
    Mail,
    Phone,
    MapPin,
    AlertTriangle,
    CheckCircle2,
    Clock,
    PlusCircle,
    UserPlus,
    Loader2
} from 'lucide-react';
import api from '../../api';
import { FomsClientAccount, ClientDetailModalProps } from './types';
import './ClientManagement.css';

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
    isOpen,
    client: initialClient,
    userRole,
    onClose,
    onAssignCoordinator,
    onCreateTask,
}) => {
    const [client, setClient] = useState<FomsClientAccount | null>(initialClient);
    const [loading, setLoading] = useState<boolean>(false);

    const currentUserRole = userRole || localStorage.getItem('userRole') || localStorage.getItem('role') || 'Manager';
    const isManager = currentUserRole.toLowerCase() === 'manager' ||
        currentUserRole.toLowerCase() === 'systemadmin' ||
        currentUserRole.toLowerCase() === 'opadmin' ||
        currentUserRole.toLowerCase() === 'director';

    useEffect(() => {
        setClient(initialClient);
        if (isOpen && initialClient?.clientAccountId) {
            // Fetch latest profile from backend
            const fetchDetail = async () => {
                setLoading(true);
                try {
                    const res = await api.get(`/api/foms-integration/clients/${initialClient.clientAccountId}`);
                    if (res.data?.data) {
                        setClient(res.data.data);
                    }
                } catch {
                    // Fall back to initial client record
                } finally {
                    setLoading(false);
                }
            };
            fetchDetail();
        }
    }, [isOpen, initialClient]);

    if (!isOpen || !client) return null;

    const isActive = String(client.status).toLowerCase() === 'active';
    const isUnassigned = !client.assignedCoordinatorId || !client.assignedCoordinatorName || client.assignedCoordinatorName === 'Unassigned';
    const hasUnrecognizedHandler = Boolean(client.accountHandlerEmployeeNumber && !client.accountHandlerUserId);

    return (
        <div className="drawer-backdrop" onClick={onClose} data-testid="client-detail-backdrop">
            <div
                className="modal-card"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: 640,
                    width: '95%',
                    margin: 'auto',
                    background: '#ffffff',
                    borderRadius: 14,
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh',
                }}
                role="dialog"
                aria-modal="true"
            >
                {/* Modal Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            background: '#00A99D',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Building2 size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{client.clientName}</h3>
                                <span className={`status-pill ${isActive ? 'active' : 'inactive'}`} data-testid="detail-status-pill">
                                    <span className="status-pill-dot" />
                                    {isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 3 }}>
                                <span className="client-id-badge">{client.clientAccountId}</span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>STARS Reference Master</span>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="btn-client-action"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Modal Content */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
                    {/* Read-Only Helper Tooltip / Notice */}
                    <div
                        className="foms-master-notice"
                        data-testid="foms-master-notice"
                        title="Client account master data is managed in FOMS."
                        style={{ width: '100%' }}
                    >
                        <Lock size={15} className="foms-master-notice-icon" />
                        <div>
                            <strong>Read-Only Master Data:</strong> Client account master data is managed in FOMS. Changes made in FOMS are automatically synchronized via M2M webhooks.
                        </div>
                    </div>

                    {/* Inactive Alert Banner if Inactive */}
                    {!isActive && (
                        <div className="client-inactive-error-banner" data-testid="inactive-account-banner" style={{ width: '100%', margin: 0 }}>
                            <AlertTriangle size={16} />
                            <span>Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.</span>
                        </div>
                    )}

                    {/* Unrecognized Handler Alert */}
                    {hasUnrecognizedHandler && (
                        <div style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1rem',
                            background: '#fffbeb',
                            border: '1px solid #fef3c7',
                            borderRadius: '8px',
                            color: '#b45309',
                            fontSize: '0.8rem',
                        }}>
                            <AlertTriangle size={16} color="#d97706" />
                            <span>
                                Client {client.clientAccountId} was synchronized with unrecognized account handler &apos;{client.accountHandlerEmployeeNumber}&apos;. Employee number was not resolved in STARS registry.
                            </span>
                        </div>
                    )}

                    {/* 1. Corporate Master Information (Read-Only) */}
                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#0f172a', fontWeight: 700, fontSize: '0.88rem' }}>
                            <Shield size={16} color="#00A99D" />
                            <span>Corporate Master Record (FOMS)</span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '0.85rem',
                            background: '#f8fafc',
                            padding: '1rem',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                        }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Client Account ID
                                </label>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{client.clientAccountId}</span>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Corporate Client Name
                                </label>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{client.clientName}</span>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Contact Person
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 2 }}>
                                    <User size={13} color="#64748b" />
                                    <span style={{ fontSize: '0.85rem', color: '#334155' }}>{client.contactPerson || '—'}</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Contact Number
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 2 }}>
                                    <Phone size={13} color="#64748b" />
                                    <span style={{ fontSize: '0.85rem', color: '#334155' }}>{client.contactNumber || '—'}</span>
                                </div>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Official Email Address
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 2 }}>
                                    <Mail size={13} color="#64748b" />
                                    <span style={{ fontSize: '0.85rem', color: '#334155' }}>{client.email || '—'}</span>
                                </div>
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Registered Corporate Address
                                </label>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', marginTop: 2 }}>
                                    <MapPin size={13} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>{client.address || '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. STARS Operational Scoping */}
                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', color: '#0f172a', fontWeight: 700, fontSize: '0.88rem' }}>
                            <Building2 size={16} color="#0284c7" />
                            <span>STARS Operational Scoping</span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '0.85rem',
                            background: '#f8fafc',
                            padding: '1rem',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                        }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    FOMS Account Handler
                                </label>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                                    {client.accountHandlerName || (client.accountHandlerEmployeeNumber ? `EMP: ${client.accountHandlerEmployeeNumber}` : 'None Assigned')}
                                </span>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Assigned Coordinator (FR-011)
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4 }}>
                                    {isUnassigned ? (
                                        <span className="assignment-badge unassigned" data-testid="detail-unassigned-badge">
                                            Unassigned
                                        </span>
                                    ) : (
                                        <span className="assignment-badge assigned" data-testid="detail-assigned-badge">
                                            <CheckCircle2 size={13} />
                                            {client.assignedCoordinatorName}
                                        </span>
                                    )}

                                    {isManager && onAssignCoordinator && (
                                        <button
                                            type="button"
                                            className="btn-reassign"
                                            onClick={() => onAssignCoordinator(client)}
                                            data-testid="detail-assign-coordinator-btn"
                                        >
                                            {isUnassigned ? 'Assign Now' : 'Change'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Last Synced with FOMS
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 2 }}>
                                    <Clock size={13} color="#64748b" />
                                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                        {client.lastSyncedAt ? new Date(client.lastSyncedAt).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }) : 'Just now'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        {loading && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Updating profile...</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <button
                            type="button"
                            className="btn-client-action"
                            onClick={onClose}
                        >
                            Close
                        </button>

                        {isManager && isUnassigned && onAssignCoordinator && (
                            <button
                                type="button"
                                className="btn-assign-coordinator"
                                onClick={() => onAssignCoordinator(client)}
                            >
                                <UserPlus size={14} />
                                Assign Coordinator
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
                                title={!isActive ? 'Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.' : undefined}
                                data-testid="detail-create-task-btn"
                            >
                                <PlusCircle size={14} />
                                Create Task
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientDetailModal;
