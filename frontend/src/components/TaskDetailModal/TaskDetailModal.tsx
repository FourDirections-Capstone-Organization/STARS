import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import TaskView, { TaskViewTask } from '../TaskView/TaskView';
import api from '../../api';
import './TaskDetailModal.css';

export interface TaskDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    taskId?: string;
    task?: TaskViewTask | null;
    onUpdate?: (updated: TaskViewTask) => void;
    onEdit?: () => void;
    onReopen?: () => void;
    onApprove?: (id: string) => void;
    onReject?: (id: string, reason: string) => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
    isOpen,
    onClose,
    taskId,
    task: propTask,
    onUpdate,
    onEdit,
    onReopen,
    onApprove,
    onReject,
}) => {
    const [fetchedTask, setFetchedTask] = useState<TaskViewTask | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setFetchedTask(null);
            setError(null);
            return;
        }

        if (propTask) {
            setFetchedTask(null);
            return;
        }

        if (taskId) {
            setLoading(true);
            setError(null);
            api.get(`/api/Task/${taskId}`)
                .then(res => {
                    const d = res.data?.data;
                    if (d) {
                        const mapped: TaskViewTask = {
                            taskId: d.id || taskId,
                            taskTitle: d.title || 'Untitled Task',
                            taskDescription: d.description || '',
                            priority: d.priorityLevel === 3 ? 'Urgent' : d.priorityLevel === 2 ? 'High' : d.priorityLevel === 1 ? 'Medium' : 'Low',
                            dueAt: d.deadline || null,
                            taskStatus: d.status === 3 ? 'Completed' : d.status === 2 ? 'Done/Pending Review' : d.status === 1 ? 'In Progress' : 'Not Started',
                            assignedEmployee: d.assignments?.[0]?.assignedUser ? `${d.assignments[0].assignedUser.firstName} ${d.assignments[0].assignedUser.lastName}` : 'Unassigned',
                            createdByEmployee: d.createdByUser ? `${d.createdByUser.firstName} ${d.createdByUser.lastName}` : 'System',
                            assignedTo: d.assignments?.[0]?.assignedUser ? `${d.assignments[0].assignedUser.firstName} ${d.assignments[0].assignedUser.lastName}` : undefined,
                            createdAt: d.createdAt || new Date().toISOString(),
                            assignees: d.assignments?.map((a: any) => ({
                                fullName: a.assignedUser ? `${a.assignedUser.firstName} ${a.assignedUser.lastName}` : 'Assignee',
                                completionPercentage: a.completionPercentage || 0,
                            })),
                        };
                        setFetchedTask(mapped);
                    } else {
                        setError('Task details not found.');
                    }
                })
                .catch(err => {
                    setError(err?.response?.data?.message || err?.message || 'Failed to fetch task details.');
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [isOpen, taskId, propTask]);

    if (!isOpen) return null;

    const currentTask = propTask || fetchedTask;

    return (
        <div className="task-detail-modal-overlay" onClick={onClose} data-testid="task-detail-modal">
            <div className="task-detail-modal-dialog" onClick={e => e.stopPropagation()}>
                <button
                    type="button"
                    className="task-detail-modal-close-btn"
                    onClick={onClose}
                    aria-label="Close modal"
                >
                    <X size={18} />
                </button>

                <div className="task-detail-modal-body">
                    {loading ? (
                        <div className="task-detail-modal-loading">
                            <Loader2 size={32} className="spin" />
                            <span>Loading task details...</span>
                        </div>
                    ) : error ? (
                        <div className="task-detail-modal-error">
                            <AlertCircle size={24} color="#dc2626" />
                            <span>{error}</span>
                        </div>
                    ) : currentTask ? (
                        <TaskView
                            task={currentTask}
                            onClose={onClose}
                            onUpdate={updated => {
                                if (onUpdate) onUpdate(updated);
                                setFetchedTask(updated);
                            }}
                            onEdit={onEdit}
                            onReopen={onReopen}
                            onApprove={onApprove}
                            onReject={onReject}
                        />
                    ) : (
                        <div className="task-detail-modal-empty">
                            <span>No task selected.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TaskDetailModal;
