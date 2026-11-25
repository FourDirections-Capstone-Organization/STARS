import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Calendar, FileText, CheckCircle2, Loader2, Building2, PlusCircle } from 'lucide-react';
import api from '../../api';
import { FomsClientAccount, TaskFormProps } from './types';
import './ClientManagement.css';

export const TaskForm: React.FC<TaskFormProps> = ({
    initialClient,
    availableClients: propClients,
    onCancel,
    onSubmit,
    isSubmitting = false,
}) => {
    const [clients, setClients] = useState<FomsClientAccount[]>(propClients || []);
    const [selectedClientId, setSelectedClientId] = useState<string>(initialClient?.clientAccountId || '');
    const [title, setTitle] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [category, setCategory] = useState<string>('Invoice Endorsement');
    const [priority, setPriority] = useState<string>('Medium');
    const [dueAt, setDueAt] = useState<string>('');
    const [localSubmitting, setLocalSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch clients if not provided
    useEffect(() => {
        if (propClients && propClients.length > 0) {
            setClients(propClients);
            return;
        }

        const fetchClients = async () => {
            try {
                const res = await api.get('/api/foms-integration/clients');
                const data = res.data?.data || res.data || [];
                if (Array.isArray(data)) {
                    setClients(data);
                }
            } catch (err) {
                console.warn('[FOMS] Failed to fetch client accounts for TaskForm:', err);
            }
        };

        fetchClients();
    }, [propClients]);

    useEffect(() => {
        if (initialClient) {
            setSelectedClientId(initialClient.clientAccountId);
            if (!title) {
                setTitle(`[${category}] ${initialClient.clientName}`);
            }
        }
    }, [initialClient, category, title]);

    // Active client selection object
    const selectedClient = useMemo(() => {
        return clients.find(c => c.clientAccountId === selectedClientId) ||
            (initialClient?.clientAccountId === selectedClientId ? initialClient : null);
    }, [clients, selectedClientId, initialClient]);

    // Inactive check per requirement
    const isClientInactive = useMemo(() => {
        if (!selectedClient) return false;
        return String(selectedClient.status).toLowerCase() === 'inactive';
    }, [selectedClient]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Inactive Account Gate Enforcement: Block task creation if client is Inactive
        if (isClientInactive) {
            setError('Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.');
            return;
        }

        if (!title.trim()) {
            setError('Task title is required.');
            return;
        }

        setLocalSubmitting(true);
        try {
            const taskData = {
                title: title.trim(),
                description: description.trim(),
                category,
                priority,
                dueAt: dueAt || undefined,
                clientAccountId: selectedClientId || undefined,
                clientName: selectedClient?.clientName,
            };

            if (onSubmit) {
                await onSubmit(taskData);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to create task.');
        } finally {
            setLocalSubmitting(false);
        }
    };

    const isBusy = isSubmitting || localSubmitting;

    return (
        <form onSubmit={handleSubmit} className="task-form-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Inactive Account Error Banner */}
            {isClientInactive && (
                <div className="client-inactive-error-banner" data-testid="client-inactive-error" role="alert">
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span>Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.</span>
                </div>
            )}

            {error && !isClientInactive && (
                <div className="client-inactive-error-banner" role="alert">
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                </div>
            )}

            {/* Section 1: Linked Client Enterprise (DMS style) */}
            <div style={{
                background: '#f8fafc',
                border: isClientInactive ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem 1.25rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    <Building2 size={16} color="#00A99D" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Linked Client Account (FOMS Reference)
                    </span>
                </div>

                <div style={{ position: 'relative' }}>
                    <select
                        className="client-select-input"
                        data-testid="client-selector"
                        value={selectedClientId}
                        onChange={e => {
                            setSelectedClientId(e.target.value);
                            setError(null);
                            const matched = clients.find(c => c.clientAccountId === e.target.value);
                            if (matched && !title) {
                                setTitle(`[${category}] ${matched.clientName}`);
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: isClientInactive ? '2px solid #ef4444' : '1px solid #cbd5e1',
                            fontSize: '0.85rem',
                            outline: 'none',
                            background: '#ffffff',
                            color: '#0f172a',
                        }}
                    >
                        <option value="">-- None / General Operational Task --</option>
                        {clients.map(c => {
                            const inactive = String(c.status).toLowerCase() === 'inactive';
                            return (
                                <option
                                    key={c.clientAccountId}
                                    value={c.clientAccountId}
                                    style={inactive ? { color: '#94a3b8', fontStyle: 'italic', background: '#f8fafc' } : {}}
                                    className={inactive ? 'client-option-inactive' : ''}
                                    data-testid={`client-option-${c.clientAccountId}`}
                                >
                                    {c.clientAccountId} - {c.clientName} {inactive ? '[Inactive - FOMS]' : '(Active)'}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {selectedClient && (
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: 10, fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ color: '#64748b' }}>Status:</span>
                            <span className={`status-pill ${!isClientInactive ? 'active' : 'inactive'}`}>
                                <span className="status-pill-dot" />
                                {selectedClient.status}
                            </span>
                        </div>
                        {selectedClient.assignedCoordinatorName && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#0284c7' }}>
                                <span>Managing Coordinator:</span>
                                <strong>{selectedClient.assignedCoordinatorName}</strong>
                            </div>
                        )}
                        {selectedClient.contactPerson && (
                            <div style={{ color: '#64748b' }}>
                                Attn: {selectedClient.contactPerson} {selectedClient.contactNumber ? `(${selectedClient.contactNumber})` : ''}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Section 2: Task Information & Instructions */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={16} color="#00A99D" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Task Information
                    </span>
                </div>

                {/* Task Title */}
                <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                        Task Title <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="text"
                        data-testid="task-title-input"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Endorse invoice for client receiving"
                        disabled={isBusy}
                        required
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.85rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Description */}
                <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                        Operational Instructions / Description
                    </label>
                    <textarea
                        rows={3}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Enter specific instructions, required documents, or routing notes..."
                        disabled={isBusy}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.85rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                            resize: 'vertical',
                        }}
                    />
                </div>
            </div>

            {/* Section 3: Classification & Schedule */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                            Category
                        </label>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            disabled={isBusy}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                                background: '#ffffff',
                            }}
                        >
                            <option value="Invoice Endorsement">Invoice Endorsement</option>
                            <option value="Delivery">Delivery & Logistics</option>
                            <option value="Collection Follow-up">Collection Follow-up</option>
                            <option value="Operations">Operations General</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                            Priority
                        </label>
                        <select
                            value={priority}
                            onChange={e => setPriority(e.target.value)}
                            disabled={isBusy}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                                background: '#ffffff',
                            }}
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                        </select>
                    </div>
                </div>

                {/* Due Date */}
                <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        <Calendar size={14} color="#00A99D" />
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                            Target Completion / Due Date
                        </label>
                    </div>
                    <input
                        type="datetime-local"
                        value={dueAt}
                        onChange={e => setDueAt(e.target.value)}
                        disabled={isBusy}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.85rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>
            </div>

            {/* Action Buttons (DMS style) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.85rem', marginTop: '0.25rem' }}>
                {onCancel && (
                    <button
                        type="button"
                        className="btn-client-action"
                        onClick={onCancel}
                        disabled={isBusy}
                        style={{ padding: '0.65rem 1.25rem' }}
                    >
                        Cancel
                    </button>
                )}

                <button
                    type="submit"
                    className="btn-client-action primary"
                    disabled={isClientInactive || isBusy || !title.trim()}
                    data-testid="task-form-submit-btn"
                    title={isClientInactive ? 'Client account is inactive in FOMS. Tasks cannot be created for inactive accounts.' : undefined}
                    style={{
                        padding: '0.65rem 1.5rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        opacity: isClientInactive ? 0.45 : 1,
                        cursor: isClientInactive ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}
                >
                    {isBusy ? (
                        <>
                            <Loader2 size={15} className="spin" />
                            Creating Task...
                        </>
                    ) : (
                        <>
                            <PlusCircle size={15} />
                            Create Task
                        </>
                    )}
                </button>
            </div>
        </form>
    );
};

export default TaskForm;
