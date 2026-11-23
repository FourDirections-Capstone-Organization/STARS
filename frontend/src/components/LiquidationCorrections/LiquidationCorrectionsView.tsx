import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Receipt,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    AlertTriangle,
    Layers,
    FileSpreadsheet,
    Zap
} from 'lucide-react';
import { LiquidationTaskItem, LiquidationCorrectionsViewProps } from './types';
import LiquidationTasksList from './LiquidationTasksList';
import SubmitCorrectionModal from './SubmitCorrectionModal';
import TaskDetailModal from '../TaskDetailModal/TaskDetailModal';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import './LiquidationCorrections.css';

export const LiquidationCorrectionsView: React.FC<LiquidationCorrectionsViewProps> = ({
    showHeader = true,
    initialRequestId,
    userRole = 'Coordinator',
    currentUserId,
    onOpenTask: propOnOpenTask,
}) => {
    const { success: toastSuccess, error: toastError } = useToast();

    const [tasks, setTasks] = useState<LiquidationTaskItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Selected task for task detail modal
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

    // Selected task for submitting correction modal
    const [selectedTaskForCorrection, setSelectedTaskForCorrection] = useState<LiquidationTaskItem | null>(null);
    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);

    // Fetch liquidation correction tasks
    const fetchTasks = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        setError(null);

        try {
            // 1. First attempt primary endpoint
            let fetchedList: LiquidationTaskItem[] = [];
            try {
                const res = await api.get('/api/foms-integration/liquidation-tasks');
                const data = res.data;
                if (data && data.isSuccess && Array.isArray(data.data)) {
                    fetchedList = data.data;
                } else if (Array.isArray(data)) {
                    fetchedList = data;
                }
            } catch (primaryErr: any) {
                // If 404 or not implemented on this host, gracefully fallback to general task query
                console.warn('[LiquidationCorrectionsView] Primary query endpoint returned error, checking /api/Task fallback...', primaryErr?.message);
                try {
                    const fallbackRes = await api.get('/api/Task');
                    const taskList = fallbackRes.data?.data || fallbackRes.data || [];
                    if (Array.isArray(taskList)) {
                        const liqTasks = taskList.filter((t: any) =>
                            (t.title || '').includes('[Liquidation Correction]') ||
                            (t.title || '').toLowerCase().includes('liquidation correction') ||
                            (t.description || '').toLowerCase().includes('automated liquidation correction routed from foms')
                        );

                        // Try fetching detailed metadata for each task
                        const enriched = await Promise.all(
                            liqTasks.map(async (t: any) => {
                                try {
                                    const dRes = await api.get(`/api/foms-integration/liquidation-tasks/${t.id}`);
                                    const detail = dRes.data?.data || dRes.data;
                                    if (detail) {
                                        return {
                                            id: detail.id || `liq-${t.id}`,
                                            taskId: t.id,
                                            taskNumber: t.taskNumber || 'TASK',
                                            requestId: detail.requestId || `LIQ-${t.id.substring(0, 8)}`,
                                            liquidationId: detail.liquidationId,
                                            requester: detail.requester || 'Courier Staff',
                                            requesterEmployeeId: detail.requesterEmployeeId,
                                            deliveryReference: detail.deliveryReference,
                                            liquidationStatus: detail.liquidationStatus || 'For Correction',
                                            correctionReason: detail.correctionReason || 'Receipt verification discrepancy',
                                            dueDate: detail.dueDate || t.deadline,
                                            amount: detail.amount,
                                            correctionStatus: detail.correctionStatus || 'InProgress',
                                            correctedReceiptsUrl: detail.correctedReceiptsUrl,
                                            resolutionRemarks: detail.resolutionRemarks,
                                            fomsSyncStatus: detail.fomsSyncStatus || 'Pending',
                                            lastSyncedAt: detail.lastSyncedAt,
                                            lastSyncError: detail.lastSyncError,
                                            createdAt: detail.createdAt || t.createdAt,
                                            updatedAt: detail.updatedAt || t.updatedAt,
                                            taskStatus: t.status === 3 ? 'Completed' : t.status === 2 ? 'DonePendingReview' : 'InProgress',
                                            priorityLevel: t.priorityLevel === 3 ? 'Urgent' : 'High',
                                        } as LiquidationTaskItem;
                                    }
                                } catch {
                                    // Parse fallback from task title and description
                                }

                                const desc = t.description || '';
                                const reqMatch = desc.match(/Request ID:\s*([^\n]+)/i);
                                const courierMatch = desc.match(/Requester:\s*([^\n]+)/i);
                                const reasonMatch = desc.match(/Correction Reason:\s*([^\n]+)/i);
                                const amountMatch = desc.match(/Amount:\s*₱?([^\n]+)/i);
                                const refMatch = desc.match(/Delivery\/Trip Reference:\s*([^\n]+)/i);
                                const statusMatch = desc.match(/Status:\s*([^\n]+)/i);

                                return {
                                    id: `liq-${t.id}`,
                                    taskId: t.id,
                                    taskNumber: t.taskNumber || 'TASK',
                                    requestId: reqMatch ? reqMatch[1].trim() : (t.title.match(/\[Liquidation Correction\]\s*([^\s-]+)/i)?.[1] || 'LIQ-TASK'),
                                    requester: courierMatch ? courierMatch[1].trim() : 'Assigned Personnel',
                                    deliveryReference: refMatch ? refMatch[1].trim() : null,
                                    liquidationStatus: statusMatch ? statusMatch[1].trim() : 'For Correction',
                                    correctionReason: reasonMatch ? reasonMatch[1].trim() : 'Receipt discrepancy noted by Finance',
                                    dueDate: t.deadline,
                                    amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null,
                                    correctionStatus: t.status === 3 ? 'Completed' : t.status === 2 ? 'Corrected' : 'InProgress',
                                    fomsSyncStatus: t.status === 3 ? 'CallbackSuccess' : 'Pending',
                                    taskStatus: t.status === 3 ? 'Completed' : t.status === 2 ? 'DonePendingReview' : 'InProgress',
                                    priorityLevel: t.priorityLevel === 3 ? 'Urgent' : 'High',
                                    createdAt: t.createdAt,
                                    updatedAt: t.updatedAt,
                                } as LiquidationTaskItem;
                            })
                        );
                        fetchedList = enriched;
                    }
                } catch (fallbackErr) {
                    console.error('[LiquidationCorrectionsView] Fallback task query error:', fallbackErr);
                }
            }

            setTasks(fetchedList);
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Failed to fetch liquidation correction tasks.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // KPI Metrics calculation
    const metrics = useMemo(() => {
        const total = tasks.length;
        let forCorrection = 0;
        let rejected = 0;
        let syncSuccess = 0;
        let syncFailed = 0;

        tasks.forEach(t => {
            const status = (t.liquidationStatus || '').toLowerCase();
            if (status.includes('reject')) rejected++;
            else forCorrection++;

            const sync = (t.fomsSyncStatus || '').toLowerCase();
            if (sync === 'callbacksuccess') syncSuccess++;
            else if (sync === 'failed') syncFailed++;
        });

        return { total, forCorrection, rejected, syncSuccess, syncFailed };
    }, [tasks]);

    // Task Selection Handler
    const handleOpenTask = (taskId: string) => {
        if (propOnOpenTask) {
            propOnOpenTask(taskId);
        } else {
            setSelectedTaskId(taskId);
            setIsDetailModalOpen(true);
        }
    };

    // Open attach receipts modal
    const handleAttachReceipts = (task: LiquidationTaskItem) => {
        setSelectedTaskForCorrection(task);
        setIsCorrectionModalOpen(true);
    };

    return (
        <div className="liquidation-view-container" data-testid="liquidation-corrections-view">
            {showHeader && (
                <div className="liquidation-header">
                    <div className="liquidation-header-left">
                        <div className="liquidation-title">
                            <Receipt size={22} color="#2563eb" />
                            <span>Expense Liquidation Corrections (FOMS Integration)</span>
                        </div>
                        <div className="liquidation-subtitle">
                            Automated operational remediation workflow for late, rejected, or incomplete courier expense liquidations.
                        </div>
                    </div>
                    <div className="liquidation-header-actions">
                        <button
                            type="button"
                            className="liq-btn liq-btn-outline"
                            onClick={() => fetchTasks(true)}
                            disabled={refreshing || loading}
                            data-testid="header-sync-btn"
                        >
                            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
                            <span>{refreshing ? 'Refreshing...' : 'Sync with FOMS'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* KPI Summary Cards Grid */}
            <div className="liquidation-kpi-grid">
                {/* Total Requests */}
                <div className="liquidation-kpi-card variant-total" data-testid="kpi-total-requests">
                    <div className="liquidation-kpi-top">
                        <span className="liquidation-kpi-label">Total Corrections</span>
                        <div className="liquidation-kpi-icon">
                            <Layers size={18} />
                        </div>
                    </div>
                    <div className="liquidation-kpi-val">{metrics.total}</div>
                    <div className="liquidation-kpi-sub">M2M Tasks Ingested</div>
                </div>

                {/* For Correction */}
                <div className="liquidation-kpi-card variant-for-correction" data-testid="kpi-for-correction">
                    <div className="liquidation-kpi-top">
                        <span className="liquidation-kpi-label">For Correction</span>
                        <div className="liquidation-kpi-icon">
                            <AlertTriangle size={18} />
                        </div>
                    </div>
                    <div className="liquidation-kpi-val">{metrics.forCorrection}</div>
                    <div className="liquidation-kpi-sub">Missing/Invalid Proofs</div>
                </div>

                {/* Rejected (Urgent) */}
                <div className="liquidation-kpi-card variant-rejected" data-testid="kpi-rejected">
                    <div className="liquidation-kpi-top">
                        <span className="liquidation-kpi-label">Rejected / Overdue</span>
                        <div className="liquidation-kpi-icon">
                            <AlertCircle size={18} />
                        </div>
                    </div>
                    <div className="liquidation-kpi-val">{metrics.rejected}</div>
                    <div className="liquidation-kpi-sub">Urgent Priority Flag</div>
                </div>

                {/* Callback Success */}
                <div className="liquidation-kpi-card variant-synced" data-testid="kpi-callback-success">
                    <div className="liquidation-kpi-top">
                        <span className="liquidation-kpi-label">FOMS Revalidation</span>
                        <div className="liquidation-kpi-icon">
                            <CheckCircle2 size={18} />
                        </div>
                    </div>
                    <div className="liquidation-kpi-val">{metrics.syncSuccess}</div>
                    <div className="liquidation-kpi-sub">Callback Acknowledged</div>
                </div>

                {/* Sync Failed */}
                {metrics.syncFailed > 0 && (
                    <div className="liquidation-kpi-card variant-failed" data-testid="kpi-sync-failed">
                        <div className="liquidation-kpi-top">
                            <span className="liquidation-kpi-label">Sync Failed</span>
                            <div className="liquidation-kpi-icon">
                                <Zap size={18} />
                            </div>
                        </div>
                        <div className="liquidation-kpi-val" style={{ color: '#be123c' }}>{metrics.syncFailed}</div>
                        <div className="liquidation-kpi-sub">Requires Manual Retry</div>
                    </div>
                )}
            </div>

            {/* Error Banner */}
            {error && (
                <div className="task-detail-modal-error" style={{ marginBottom: '1rem' }}>
                    <AlertCircle size={18} color="#dc2626" />
                    <span>{error}</span>
                </div>
            )}

            {/* Tasks List */}
            <LiquidationTasksList
                tasks={tasks}
                loading={loading}
                onRefresh={() => fetchTasks(true)}
                onOpenTask={handleOpenTask}
                userRole={userRole}
                currentUserId={currentUserId}
                onAttachReceipts={handleAttachReceipts}
            />

            {/* Submit Correction Modal */}
            {isCorrectionModalOpen && selectedTaskForCorrection && (
                <SubmitCorrectionModal
                    isOpen={isCorrectionModalOpen}
                    task={selectedTaskForCorrection}
                    onClose={() => {
                        setIsCorrectionModalOpen(false);
                        setSelectedTaskForCorrection(null);
                    }}
                    onSubmitSuccess={updated => {
                        fetchTasks(true);
                    }}
                />
            )}

            {/* Task Detail Modal */}
            {isDetailModalOpen && selectedTaskId && (
                <TaskDetailModal
                    isOpen={isDetailModalOpen}
                    taskId={selectedTaskId}
                    onClose={() => {
                        setIsDetailModalOpen(false);
                        setSelectedTaskId(null);
                    }}
                    onUpdate={() => {
                        fetchTasks(true);
                    }}
                />
            )}
        </div>
    );
};

export default LiquidationCorrectionsView;
