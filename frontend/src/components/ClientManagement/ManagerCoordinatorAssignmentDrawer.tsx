import React, { useState, useEffect, useCallback } from 'react';
import { X, UserCheck, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import { FomsClientAccount, CoordinatorOption, ManagerCoordinatorAssignmentDrawerProps } from './types';
import './ClientManagement.css';

export const ManagerCoordinatorAssignmentDrawer: React.FC<ManagerCoordinatorAssignmentDrawerProps> = ({
    isOpen,
    client,
    coordinators: propCoordinators,
    onClose,
    onSuccess,
}) => {
    const [coordinators, setCoordinators] = useState<CoordinatorOption[]>(propCoordinators || []);
    const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<string>('');
    const [loadingCoordinators, setLoadingCoordinators] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const { success: toastSuccess, error: toastError } = useToast();

    // Fetch assignable coordinators if not passed via props
    const fetchCoordinators = useCallback(async () => {
        if (propCoordinators && propCoordinators.length > 0) {
            setCoordinators(propCoordinators);
            return;
        }

        setLoadingCoordinators(true);
        try {
            const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=100');
            const data = res.data?.data?.items || res.data?.data || res.data?.items || res.data || [];
            if (Array.isArray(data)) {
                // Filter users to Coordinator role where possible, or include all operational coordinators
                const coordList: CoordinatorOption[] = data
                    .filter((u: any) => {
                        const r = String(u.role || u.Role || '').toLowerCase();
                        return r.includes('coordinator') || r === 'coordinator' || !u.role;
                    })
                    .map((u: any) => ({
                        id: u.id || u.accountId || u.userId || u.Id || '',
                        fullName: u.fullName || u.employeeName || u.name || 'Coordinator',
                        employeeNumber: u.employeeNumber || u.EmployeeNumber || '',
                        workload: typeof u.workload === 'number' ? u.workload : (u.activeTaskCount ?? 0),
                        departmentName: u.departmentName || u.department || '',
                        isAvailable: u.isAvailable !== false,
                    }))
                    .filter((c: CoordinatorOption) => Boolean(c.id));

                setCoordinators(coordList.length > 0 ? coordList : data.map((u: any) => ({
                    id: u.id || u.accountId || '',
                    fullName: u.fullName || u.employeeName || 'Coordinator',
                    employeeNumber: u.employeeNumber || '',
                    workload: 0,
                })));
            }
        } catch (err: any) {
            console.warn('[FOMS] Failed to fetch coordinators for assignment:', err);
        } finally {
            setLoadingCoordinators(false);
        }
    }, [propCoordinators]);

    useEffect(() => {
        if (isOpen) {
            fetchCoordinators();
            setSelectedCoordinatorId(client?.assignedCoordinatorId || '');
            setError(null);
        }
    }, [isOpen, client, fetchCoordinators]);

    if (!isOpen || !client) return null;

    const handleAssign = async () => {
        if (!selectedCoordinatorId) {
            setError('Please select a Coordinator to assign.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await api.put(`/api/foms-integration/clients/${client.clientAccountId}/assign-coordinator`, {
                coordinatorId: selectedCoordinatorId,
            });

            if (res.data?.isSuccess || res.status === 200) {
                const updated = res.data?.data || {
                    ...client,
                    assignedCoordinatorId: selectedCoordinatorId,
                    assignedCoordinatorName: coordinators.find(c => c.id === selectedCoordinatorId)?.fullName || 'Assigned Coordinator',
                };

                toastSuccess('Coordinator assigned successfully.');
                if (onSuccess) onSuccess(updated);
                onClose();
            } else {
                const msg = res.data?.message || 'Failed to assign coordinator.';
                setError(msg);
                toastError(msg);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Error occurred while assigning coordinator.';
            setError(msg);
            toastError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="drawer-backdrop" onClick={onClose} data-testid="assignment-drawer-backdrop">
            <div className="drawer-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="drawer-header">
                    <div>
                        <h3>Assign Managing Coordinator</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            FR-011: Assign internal coordinator scoping for FOMS client account
                        </p>
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

                <div className="drawer-body">
                    {/* Client Info Card */}
                    <div style={{
                        padding: '1rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                    }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            Target Client Account
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="client-id-badge">{client.clientAccountId}</span>
                            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{client.clientName}</span>
                        </div>
                        {client.assignedCoordinatorName && client.assignedCoordinatorName !== 'Unassigned' ? (
                            <span style={{ fontSize: '0.75rem', color: '#0284c7' }}>
                                Currently Assigned: <strong>{client.assignedCoordinatorName}</strong>
                            </span>
                        ) : (
                            <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>
                                Currently Unassigned (Requires Manager Assignment)
                            </span>
                        )}
                    </div>

                    {error && (
                        <div className="client-inactive-error-banner" role="alert">
                            <AlertCircle size={15} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Coordinator Selection */}
                    <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '0.4rem' }}>
                            Select Coordinator <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.75rem' }}>
                            The chosen Coordinator will receive management and visibility scoping for this client&apos;s tasks and follow-ups.
                        </p>

                        {loadingCoordinators ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                                <span style={{ fontSize: '0.82rem' }}>Loading active coordinators...</span>
                            </div>
                        ) : coordinators.length === 0 ? (
                            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                                No active coordinators found.
                            </div>
                        ) : (
                            <div className="coordinator-card-selector" data-testid="coordinator-list">
                                {coordinators.map(coord => {
                                    const isSelected = selectedCoordinatorId === coord.id;
                                    return (
                                        <div
                                            key={coord.id}
                                            className={`coordinator-radio-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => {
                                                setSelectedCoordinatorId(coord.id);
                                                setError(null);
                                            }}
                                            data-testid={`coordinator-option-${coord.id}`}
                                        >
                                            <div className="coordinator-item-details">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span className="coordinator-item-name">{coord.fullName}</span>
                                                    {isSelected && <CheckCircle2 size={15} color="#00A99D" />}
                                                </div>
                                                {coord.employeeNumber && (
                                                    <span className="coordinator-item-emp">EMP: {coord.employeeNumber}</span>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {typeof coord.workload === 'number' && (
                                                    <span className="coordinator-workload-badge">
                                                        {coord.workload} active task{coord.workload === 1 ? '' : 's'}
                                                    </span>
                                                )}
                                                <input
                                                    type="radio"
                                                    name="assignedCoordinator"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        setSelectedCoordinatorId(coord.id);
                                                        setError(null);
                                                    }}
                                                    style={{ accentColor: '#00A99D', cursor: 'pointer' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="drawer-footer">
                    <button
                        type="button"
                        className="btn-client-action"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn-assign-coordinator"
                        onClick={handleAssign}
                        disabled={submitting || !selectedCoordinatorId}
                        data-testid="confirm-assign-btn"
                        style={{ padding: '0.5rem 1.1rem', fontSize: '0.82rem' }}
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={14} className="spin" />
                                Assigning...
                            </>
                        ) : (
                            <>
                                <UserCheck size={14} />
                                Assign Coordinator
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManagerCoordinatorAssignmentDrawer;
