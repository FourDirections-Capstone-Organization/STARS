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
                className="modal-card dms-style-task-modal"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: 680,
                    width: '95%',
                    margin: 'auto',
                    background: '#ffffff',
                    borderRadius: 16,
                    boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '92vh',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                }}
                role="dialog"
                aria-modal="true"
            >
                {/* Modern DMS-style Header */}
                <div style={{
                    padding: '1.25rem 1.6rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#ffffff',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            background: 'rgba(0, 169, 157, 0.2)',
                            border: '1px solid rgba(0, 169, 157, 0.4)',
                            color: '#00D1C1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <PlusCircle size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    color: '#00D1C1',
                                    background: 'rgba(0, 209, 193, 0.12)',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                }}>
                                    STARS Operational Dispatch
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>•</span>
                                <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>DMS Task Creation</span>
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>Create Client Operational Task</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                Link task to FOMS client reference record and configure operational parameters
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: 8,
                            color: '#94a3b8',
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }}
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
