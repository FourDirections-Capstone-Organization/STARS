import React from 'react';
import { X, PlusCircle } from 'lucide-react';
import TaskForm from './TaskForm';
import { TaskCreateModalProps } from './types';
import './ClientManagement.css';

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
    isOpen,
    initialClient,
    availableClients,
    onClose,
    onSubmit,
}) => {
    if (!isOpen) return null;

    return (
        <div className="drawer-backdrop" onClick={onClose} data-testid="task-create-modal-backdrop">
            <div
                className="modal-card"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: 580,
                    width: '95%',
                    margin: 'auto',
                    background: '#ffffff',
                    borderRadius: 14,
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh',
                }}
                role="dialog"
                aria-modal="true"
            >
                <div style={{
                    padding: '1.15rem 1.4rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: '#00A99D',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <PlusCircle size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Create Client Operational Task</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                Link task to FOMS client reference record (FR-010 / FR-019)
                            </p>
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

                <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                    <TaskForm
                        initialClient={initialClient}
                        availableClients={availableClients}
                        onCancel={onClose}
                        onSubmit={async (data) => {
                            if (onSubmit) {
                                await onSubmit(data);
                            }
                            onClose();
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default TaskCreateModal;
