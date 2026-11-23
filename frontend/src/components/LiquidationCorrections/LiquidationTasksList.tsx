import React, { useState, useMemo } from 'react';
import {
    Search,
    AlertTriangle,
    CheckCircle2,
    Clock,
    RefreshCw,
    ExternalLink,
    Paperclip,
    Send,
    AlertOctagon,
    FileText,
    Truck,
    User,
    Calendar,
    DollarSign,
    Loader2
} from 'lucide-react';
import { LiquidationTaskItem, LiquidationTasksListProps } from './types';
import SubmitCorrectionModal from './SubmitCorrectionModal';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import './LiquidationCorrections.css';

export const LiquidationTasksList: React.FC<LiquidationTasksListProps> = ({
    tasks = [],
    loading = false,
    onRefresh,
    onOpenTask,
    userRole = 'Coordinator',
    currentUserId,
    onAttachReceipts,
    onAuthorizeCompletion,
    onRetrySync,
}) => {
    const { success: toastSuccess, error: toastError } = useToast();

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [syncFilter, setSyncFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');

    // Modal state for attaching receipts
    const [modalTask, setModalTask] = useState<LiquidationTaskItem | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    // In-flight action loading states
    const [authorizingTaskId, setAuthorizingTaskId] = useState<string | null>(null);
    const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);

    // Role check: Only Coordinator or Manager can authorize completion (FR-024)
    const normalizedRole = (userRole || '').toLowerCase();
    const canAuthorize = normalizedRole === 'coordinator' || normalizedRole === 'manager' || normalizedRole === 'admin';

    // Helper: is SLA overdue?
    const isOverdue = (dueDate?: string | null): boolean => {
        if (!dueDate) return false;
        try {
            return new Date(dueDate).getTime() < Date.now();
        } catch {
            return false;
        }
    };

    // Filtered tasks
    const filteredTasks = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return tasks.filter(task => {
            // Search query filter
            if (query) {
                const matchReq = (task.requestId || '').toLowerCase().includes(query);
                const matchName = (task.requester || '').toLowerCase().includes(query);
                const matchEmp = (task.requesterEmployeeId || '').toLowerCase().includes(query);
                const matchDel = (task.deliveryReference || '').toLowerCase().includes(query);
                const matchTk = (task.taskNumber || '').toLowerCase().includes(query);
                const matchReason = (task.correctionReason || '').toLowerCase().includes(query);
                if (!matchReq && !matchName && !matchEmp && !matchDel && !matchTk && !matchReason) {
                    return false;
                }
            }

            // Liquidation status filter
            if (statusFilter !== 'all') {
                const s = (task.liquidationStatus || '').toLowerCase();
                if (statusFilter === 'for_correction' && !s.includes('correction')) return false;
                if (statusFilter === 'rejected' && !s.includes('reject')) return false;
            }

            // Sync status filter
            if (syncFilter !== 'all') {
                const sync = (task.fomsSyncStatus || '').toLowerCase();
                if (syncFilter === 'success' && sync !== 'callbacksuccess') return false;
                if (syncFilter === 'failed' && sync !== 'failed') return false;
                if (syncFilter === 'pending' && sync !== 'pending') return false;
            }

            // Priority filter
            if (priorityFilter !== 'all') {
                const isRejected = (task.liquidationStatus || '').toLowerCase().includes('reject');
                const overdue = isOverdue(task.dueDate);
                const isUrgent = isRejected || overdue || task.priorityLevel === 'Urgent';

                if (priorityFilter === 'urgent' && !isUrgent) return false;
                if (priorityFilter === 'high' && isUrgent) return false;
            }

            return true;
        });
    }, [tasks, searchQuery, statusFilter, syncFilter, priorityFilter]);

    // Handle Open Attach Receipts
    const handleOpenAttachModal = (task: LiquidationTaskItem) => {
        if (onAttachReceipts) {
            onAttachReceipts(task);
        } else {
            setModalTask(task);
            setIsModalOpen(true);
        }
    };

    // Handle Authorize Completion (STARS → FOMS Callback per FR-024)
    const handleAuthorize = async (task: LiquidationTaskItem) => {
        if (onAuthorizeCompletion) {
            onAuthorizeCompletion(task);
            return;
        }

        const taskId = task.taskId || task.id;
        setAuthorizingTaskId(taskId);

        try {
            const res = await api.post(`/api/foms-integration/liquidation-tasks/${taskId}/callback`, {});
            const data = res.data;
            if (data && (data.isSuccess === false || data.success === false)) {
                throw new Error(data.message || 'Callback failed.');
            }
            toastSuccess(`Liquidation task for ${task.requestId} authorized and synced to FOMS.`);
            if (onRefresh) onRefresh();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to authorize completion and dispatch callback.';
            toastError(msg);
        } finally {
            setAuthorizingTaskId(null);
        }
    };

    // Handle Manual Retry Sync
    const handleRetry = async (task: LiquidationTaskItem) => {
        if (onRetrySync) {
            onRetrySync(task);
            return;
        }

        const taskId = task.taskId || task.id;
        setRetryingTaskId(taskId);

        try {
            const res = await api.post(`/api/foms-integration/liquidation-tasks/${taskId}/retry`, {});
            const data = res.data;
            if (data && (data.isSuccess === false || data.success === false)) {
                throw new Error(data.message || 'Retry failed.');
            }
            toastSuccess(`FOMS sync retry succeeded for ${task.requestId}.`);
            if (onRefresh) onRefresh();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Sync retry failed.';
            toastError(msg);
        } finally {
            setRetryingTaskId(null);
        }
    };

    return (
        <div className="liquidation-tasks-list-container" data-testid="liquidation-tasks-list">
            {/* Filter and Search Bar */}
            <div className="liquidation-filter-bar">
                <div className="liquidation-search-input-wrap">
                    <Search size={15} className="liquidation-search-icon" />
                    <input
                        type="text"
                        className="liquidation-search-input"
                        placeholder="Search Request ID, Courier, Delivery Ref, Task..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        data-testid="liquidation-search-input"
                    />
                </div>

                <div className="liquidation-filters-right">
                    <select
                        className="liquidation-select"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        data-testid="liquidation-status-filter"
                    >
                        <option value="all">All Liquidation Statuses</option>
                        <option value="for_correction">For Correction</option>
                        <option value="rejected">Rejected</option>
                    </select>

                    <select
                        className="liquidation-select"
                        value={syncFilter}
                        onChange={e => setSyncFilter(e.target.value)}
                        data-testid="sync-status-filter"
                    >
                        <option value="all">All FOMS Sync States</option>
                        <option value="success">Callback Success</option>
                        <option value="failed">Sync Failed</option>
                        <option value="pending">Pending</option>
                    </select>

                    <select
                        className="liquidation-select"
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value)}
                        data-testid="priority-filter"
                    >
                        <option value="all">All Priorities</option>
                        <option value="urgent">Urgent Only</option>
                        <option value="high">High Only</option>
                    </select>

                    {onRefresh && (
                        <button
                            type="button"
                            className="liq-btn liq-btn-outline"
                            onClick={onRefresh}
                            title="Refresh List"
                            data-testid="refresh-tasks-btn"
                        >
                            <RefreshCw size={13} className={loading ? 'spin' : ''} />
                            <span>Refresh</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            {loading ? (
                <div className="liquidation-loading" data-testid="liquidation-loading">
                    <Loader2 size={24} className="spin" color="#2563eb" />
                    <span>Loading liquidation correction tasks...</span>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="liquidation-empty" data-testid="liquidation-empty">
                    <FileText className="liquidation-empty-icon" />
                    <div style={{ fontWeight: 600, color: '#334155' }}>No liquidation correction tasks found</div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {tasks.length === 0
                            ? 'There are currently no active or pending liquidation corrections routed from FOMS.'
                            : 'No tasks match your selected search or filter criteria.'}
                    </div>
                </div>
            ) : (
                <div className="liquidation-table-wrap">
                    <table className="liquidation-table">
                        <thead>
                            <tr>
                                <th>Request &amp; Priority</th>
                                <th>Liquidation Status</th>
                                <th>Requester &amp; Delivery</th>
                                <th>Correction Reason</th>
                                <th>Amount &amp; Due Date</th>
                                <th>FOMS Sync</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map(item => {
                                const isItemOverdue = isOverdue(item.dueDate);
                                const isItemRejected = (item.liquidationStatus || '').toLowerCase().includes('reject');
                                const isUrgent = isItemRejected || isItemOverdue || item.priorityLevel === 'Urgent';

                                const isCompleted = item.taskStatus === 'Completed' || item.correctionStatus === 'Completed';
                                const isPendingReview = item.taskStatus === 'DonePendingReview' || item.taskStatus === 'PendingReview' || item.taskStatus === 'Done/Pending Review' || item.correctionStatus === 'Corrected';
                                const isInProgress = !isCompleted && !isPendingReview;

                                const syncStatus = item.fomsSyncStatus || 'Pending';
                                const isSyncFailed = syncStatus === 'Failed';
                                const isSyncSuccess = syncStatus === 'CallbackSuccess';

                                const taskId = item.taskId || item.id;

                                return (
                                    <tr
                                        key={item.id || item.requestId}
                                        className={isUrgent ? 'urgent-row' : ''}
                                        data-testid="liquidation-task-row"
                                        data-task-id={taskId}
                                    >
                                        {/* Request & Priority */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <div className="liq-req-primary">
                                                    <span>{item.requestId}</span>
                                                    {isUrgent ? (
                                                        <span className="liq-badge liq-badge-urgent" data-testid="priority-badge">
                                                            Urgent
                                                        </span>
                                                    ) : (
                                                        <span className="liq-badge liq-badge-high" data-testid="priority-badge">
                                                            High
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="liq-task-number">
                                                    Task #{item.taskNumber || 'TASK'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Liquidation Status Badge */}
                                        <td>
                                            {isItemRejected ? (
                                                <span className="liq-badge liq-badge-rejected" data-testid="liquidation-status-badge">
                                                    <AlertOctagon size={11} />
                                                    <span>Rejected</span>
                                                </span>
                                            ) : (
                                                <span className="liq-badge liq-badge-for-correction" data-testid="liquidation-status-badge">
                                                    <AlertTriangle size={11} />
                                                    <span>For Correction</span>
                                                </span>
                                            )}
                                        </td>

                                        {/* Requester & Delivery Metadata Drawer / Cells */}
                                        <td>
                                            <div className="liq-requester-info" data-testid="requester-metadata-cell">
                                                <div className="liq-requester-name">
                                                    <User size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                                    {item.requester}
                                                </div>
                                                {item.requesterEmployeeId && (
                                                    <div className="liq-emp-id">
                                                        ID: <strong>{item.requesterEmployeeId}</strong>
                                                    </div>
                                                )}
                                                {item.deliveryReference && (
                                                    <div className="liq-delivery-ref">
                                                        <Truck size={12} />
                                                        <span>{item.deliveryReference}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Correction Reason Callout */}
                                        <td style={{ maxWidth: 280 }}>
                                            <div className="liq-reason-callout" data-testid="table-correction-reason-callout">
                                                <div className="liq-reason-header">
                                                    <AlertTriangle size={11} />
                                                    <span>Reason for Correction</span>
                                                </div>
                                                <div className="liq-reason-body">
                                                    {item.correctionReason}
                                                </div>
                                            </div>
                                            {item.correctedReceiptsUrl && (
                                                <a
                                                    href={item.correctedReceiptsUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ fontSize: '0.74rem', color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}
                                                >
                                                    <Paperclip size={11} />
                                                    <span>Attached Proof</span>
                                                    <ExternalLink size={10} />
                                                </a>
                                            )}
                                        </td>

                                        {/* Amount & Due Date */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                {item.amount != null ? (
                                                    <span className="liq-amount">
                                                        ₱{Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8' }}>-</span>
                                                )}
                                                <span style={{ fontSize: '0.75rem', color: isItemOverdue ? '#dc2626' : '#64748b' }}>
                                                    <Calendar size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                                                    {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No Due Date'}
                                                    {isItemOverdue && ' (Overdue)'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Sync Status Pill */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                {isSyncSuccess ? (
                                                    <span className="liq-sync-pill liq-sync-success" data-testid="sync-success-pill">
                                                        <CheckCircle2 size={12} />
                                                        <span>CallbackSuccess</span>
                                                    </span>
                                                ) : isSyncFailed ? (
                                                    <span className="liq-sync-pill liq-sync-failed" data-testid="sync-failed-pill">
                                                        <AlertTriangle size={12} />
                                                        <span>Failed</span>
                                                    </span>
                                                ) : (
                                                    <span className="liq-sync-pill liq-sync-pending" data-testid="sync-pending-pill">
                                                        <Clock size={12} />
                                                        <span>Pending</span>
                                                    </span>
                                                )}

                                                {/* Retry Sync Button if Sync Failed */}
                                                {isSyncFailed && (
                                                    <button
                                                        type="button"
                                                        className="liq-btn liq-btn-danger-outline"
                                                        onClick={() => handleRetry(item)}
                                                        disabled={retryingTaskId === taskId}
                                                        data-testid="retry-sync-btn"
                                                    >
                                                        <RefreshCw size={11} className={retryingTaskId === taskId ? 'spin' : ''} />
                                                        <span>{retryingTaskId === taskId ? 'Retrying...' : 'Retry Sync'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        {/* FSM Action Buttons */}
                                        <td>
                                            <div className="liq-actions-cell">
                                                {/* If InProgress: Show Attach Corrected Receipts */}
                                                {isInProgress && (
                                                    <button
                                                        type="button"
                                                        className="liq-btn liq-btn-primary"
                                                        onClick={() => handleOpenAttachModal(item)}
                                                        data-testid="attach-receipts-btn"
                                                    >
                                                        <Paperclip size={12} />
                                                        <span>Attach Corrected Receipts</span>
                                                    </button>
                                                )}

                                                {/* If PendingReview: Show Authorize Completion & Return to FOMS */}
                                                {isPendingReview && canAuthorize && (
                                                    <button
                                                        type="button"
                                                        className="liq-btn liq-btn-success"
                                                        onClick={() => handleAuthorize(item)}
                                                        disabled={authorizingTaskId === taskId}
                                                        data-testid="authorize-completion-btn"
                                                    >
                                                        {authorizingTaskId === taskId ? (
                                                            <Loader2 size={12} className="spin" />
                                                        ) : (
                                                            <Send size={12} />
                                                        )}
                                                        <span>Authorize Completion &amp; Return to FOMS</span>
                                                    </button>
                                                )}

                                                {/* If Completed */}
                                                {isCompleted && (
                                                    <span className="liq-badge liq-badge-normal">
                                                        <CheckCircle2 size={11} color="#16a34a" />
                                                        <span>Completed</span>
                                                    </span>
                                                )}

                                                {/* View Task in Modal / Details */}
                                                {onOpenTask && (
                                                    <button
                                                        type="button"
                                                        className="liq-btn liq-btn-outline"
                                                        onClick={() => onOpenTask(taskId)}
                                                        data-testid="view-task-btn"
                                                    >
                                                        <ExternalLink size={12} />
                                                        <span>View Details</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Internal Modal when not handled by parent */}
            {isModalOpen && modalTask && (
                <SubmitCorrectionModal
                    isOpen={isModalOpen}
                    task={modalTask}
                    onClose={() => {
                        setIsModalOpen(false);
                        setModalTask(null);
                    }}
                    onSubmitSuccess={updated => {
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
};

export default LiquidationTasksList;
