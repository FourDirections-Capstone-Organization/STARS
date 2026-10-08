import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Pencil, X, Package, CheckCircle2,
    XCircle, Clock, AlertTriangle, ThumbsUp, RotateCcw, Lock, ArrowLeft,
    FileText, Download, Trash2, Paperclip, MessageSquare, Lightbulb, Loader2, AlertCircle, Upload,
    Truck, MapPin, Copy, Check, Send, ExternalLink, RefreshCw,
} from 'lucide-react';
import TaskComments from '../TaskComments/TaskComments';
import TaskRecommendations from '../TaskRecommendations/TaskRecommendations';
import StatusBadge from '../ui/StatusBadge';
import ConfirmationModal from '../ConfirmationModal/ConfirmationModal';
import { useToast } from '../Toast/Toast';
import api from '../../api';
import axios from 'axios';
import './TaskView.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskDeliveryDetailData {
    id?: string;
    taskId: string;
    recipientName: string;
    recipientContact: string;
    deliveryAddress: string;
    area?: string;
    packageDescription?: string;
    courierEmployeeId?: string;
    dmsWaybillNo?: string;
    dmsOrderId?: number;
    dmsStatus?: string;
    dmsRawStatus?: string;
    dmsLastSyncedAt?: string;
    dmsFailureReason?: string;
    dmsLatitude?: number;
    dmsLongitude?: number;
    syncStatus: string;
    syncError?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface UpsertDeliveryDetailPayload {
    recipientName: string;
    recipientContact: string;
    deliveryAddress: string;
    area?: string;
    packageDescription?: string;
    courierEmployeeId?: string;
}

type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Done/Pending Review' | 'Completed' | 'On Hold' | 'Cancelled' | 'Overdue';
type ReviewState = 'none' | 'pending_review' | 'approved' | 'rejected';

export interface TaskAttachment {
    id: string;
    fileName: string;
    fileSize: number;
    fileType?: string;
    description?: string;
    uploadedByName?: string;
    createdAt: string;
}

export interface TaskViewAssignee {
    fullName: string;
    completionPercentage?: number;
}

export interface TaskViewTask {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    priority: Priority;
    dueAt: string | null;
    taskStatus: TaskStatus;
    taskRemarks?: string;
    assignedEmployee: string;
    createdByEmployee: string;
    assignedTo: string;
    createdAt: string;
    isConfidential?: boolean;
    classification?: string;
    isSLALocked?: boolean;
    attachmentCount?: number;
    assignmentScope?: number;
    assignedDepartmentId?: string;
    assignedDepartmentName?: string;
    /** Non-primary-key display reference (e.g. "ABC12345"); falls back to a short id. */
    taskReferenceNumber?: string;
    /** Each assignee plus the completion percentage the employee reported. */
    assignees?: TaskViewAssignee[];
}

export interface Comment {
    id: string;
    author: string;
    role: 'admin' | 'employee';
    text: string;
    timestamp: string;
    type?: 'message' | 'system';
}

interface ReviewHistoryEntry {
    action: 'submitted' | 'approved' | 'rejected' | 'reopened';
    by: string;
    at: string;
    note?: string;
}

interface TaskViewProps {
    task: TaskViewTask;
    onEdit: () => void;
    onReopen: () => void;
    onClose: () => void;
    onApprove?: (taskId: string) => void;
    onReject?: (taskId: string, reason: string) => void;
    onDeleteAttachment?: (attachmentId: string) => void | Promise<void>;
    onUpdate?: (updatedTask: TaskViewTask) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isEffectivelyOverdue = (t: TaskViewTask): boolean =>
    t.taskStatus !== 'Completed' && t.taskStatus !== 'Cancelled' && t.taskStatus !== 'On Hold' && !!t.dueAt && new Date(t.dueAt) < new Date();

const fmtDate = (d: string): string => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
};

const fmtDateTime = (d: string): string => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
};

const PrioBadge: React.FC<{ p: Priority }> = ({ p }) => (
    <StatusBadge status={p} size="sm" />
);

const priorityDotClass = (p: Priority): string =>
    ({ Urgent: 'tv-prio-dot high', High: 'tv-prio-dot high', Medium: 'tv-prio-dot medium', Low: 'tv-prio-dot low' }[p]);

// ─── Reject Modal ─────────────────────────────────────────────────────────────

const RejectModal: React.FC<{
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
    const [reason, setReason] = useState('');
    return (
        <div className="tv-modal-overlay" onClick={onCancel}>
            <div className="tv-modal" onClick={e => e.stopPropagation()}>
                <div className="tv-modal-header">
                    <div className="tv-modal-icon tv-modal-icon-danger">
                        <XCircle size={20} />
                    </div>
                    <div>
                        <h4 className="tv-modal-title">Reject Completion</h4>
                        <p className="tv-modal-sub">Provide a reason so the employee can revise.</p>
                    </div>
                </div>
                <textarea
                    className="tv-modal-textarea"
                    placeholder="e.g. Missing attachment, incomplete encoding, wrong format…"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    autoFocus
                />
                <div className="tv-modal-actions">
                    <button className="tv-btn tv-btn-outline" onClick={onCancel}>Cancel</button>
                    <button
                        className="tv-btn tv-btn-danger"
                        onClick={() => reason.trim() && onConfirm(reason.trim())}
                        disabled={!reason.trim()}
                    >
                        <XCircle size={13} /> Reject
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Component ────────────────────────────────────────────────────────────────

const TaskView: React.FC<TaskViewProps> = ({
    task, onEdit, onReopen, onClose, onApprove, onReject, onDeleteAttachment, onUpdate,
}) => {
    const [reopening, setReopening] = useState(false);
    const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [showHold, setShowHold] = useState(false);
    const [holdReason, setHoldReason] = useState('');
    const [holding, setHolding] = useState(false);
    const [showResume, setShowResume] = useState(false);
    const [revisedDeadline, setRevisedDeadline] = useState('');
    const [resuming, setResuming] = useState(false);
    const [showCancel, setShowCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [downloadError, setDownloadError] = useState('');
    const [uploadingAttachments, setUploadingAttachments] = useState(false);
    const [attachmentUploadError, setAttachmentUploadError] = useState('');
    const attachInputRef = useRef<HTMLInputElement>(null);
    const [confidentialConfirm, setConfidentialConfirm] = useState<{ open: boolean; pendingValue: boolean }>({ open: false, pendingValue: false });
    const [confidentialSaving, setConfidentialSaving] = useState(false);
    const { success: toastSuccess, error: toastError } = useToast();

    const token = localStorage.getItem('authToken');

    // ─── DMS Delivery Order & Tracking ──────────────────────────────────────────
    const [deliveryDetail, setDeliveryDetail] = useState<TaskDeliveryDetailData | null>(null);
    const [deliveryLoading, setDeliveryLoading] = useState(false);
    const [showEditDeliveryModal, setShowEditDeliveryModal] = useState(false);
    const [editingDelivery, setEditingDelivery] = useState<UpsertDeliveryDetailPayload>({
        recipientName: '',
        recipientContact: '',
        deliveryAddress: '',
        area: '',
        packageDescription: '',
        courierEmployeeId: '',
    });
    const [savingDelivery, setSavingDelivery] = useState(false);
    const [resendingDms, setResendingDms] = useState(false);
    const [copiedWaybill, setCopiedWaybill] = useState(false);

    const fetchDeliveryDetail = useCallback(async () => {
        if (!task.taskId) return;
        setDeliveryLoading(true);
        try {
            const res = await api.get<any>(`/api/dms-integration/tasks/${task.taskId}/delivery-details`);
            const json = res.data;
            const data = json?.data ?? json;
            if (data && (data.recipientName || data.dmsWaybillNo || data.syncStatus)) {
                setDeliveryDetail(data);
                setEditingDelivery({
                    recipientName: data.recipientName || '',
                    recipientContact: data.recipientContact || '',
                    deliveryAddress: data.deliveryAddress || '',
                    area: data.area || '',
                    packageDescription: data.packageDescription || '',
                    courierEmployeeId: data.courierEmployeeId || '',
                });
            } else {
                setDeliveryDetail(null);
            }
        } catch {
            setDeliveryDetail(null);
        } finally {
            setDeliveryLoading(false);
        }
    }, [task.taskId]);

    useEffect(() => {
        fetchDeliveryDetail();
    }, [fetchDeliveryDetail]);

    const handleSaveDelivery = async () => {
        if (!editingDelivery.recipientName.trim() || !editingDelivery.recipientContact.trim() || !editingDelivery.deliveryAddress.trim()) {
            toastError('Recipient Name, Contact Number, and Delivery Address are required.');
            return;
        }
        setSavingDelivery(true);
        try {
            const res = await api.put(`/api/dms-integration/tasks/${task.taskId}/delivery-details`, editingDelivery);
            const savedData = res?.data?.data ?? res?.data;
            setDeliveryDetail(savedData);
            setShowEditDeliveryModal(false);
            toastSuccess('Delivery details saved successfully.');
        } catch (err: any) {
            toastError(err?.response?.data?.message || err?.message || 'Failed to save delivery details.');
        } finally {
            setSavingDelivery(false);
        }
    };

    const handleResendDms = async () => {
        setResendingDms(true);
        try {
            const res = await api.post(`/api/dms-integration/tasks/${task.taskId}/resend`, {});
            const savedData = res?.data?.data ?? res?.data;
            setDeliveryDetail(savedData);
            if (savedData?.dmsWaybillNo) {
                toastSuccess(`DMS Delivery Order created! Waybill: ${savedData.dmsWaybillNo}`);
            } else {
                toastSuccess('Dispatched to DMS successfully.');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to dispatch to DMS.';
            toastError(msg);
            await fetchDeliveryDetail();
        } finally {
            setResendingDms(false);
        }
    };

    const handleCopyWaybill = (waybill: string) => {
        navigator.clipboard.writeText(waybill);
        setCopiedWaybill(true);
        toastSuccess(`Waybill ${waybill} copied to clipboard!`);
        setTimeout(() => setCopiedWaybill(false), 2500);
    };

    const fetchAttachments = useCallback(async () => {
        if (!task.taskId) return;
        setAttachmentsLoading(true);
        try {
            const res = await api.get<any>(`/api/tasks/${task.taskId}/attachments`, { pageSize: 100 });
            const json = res.data;
            if (res.status === 200) {
                const raw = json?.data?.items ?? json?.data ?? json;
                setAttachments(Array.isArray(raw) ? raw.map((a: any) => ({
                    id: a.id,
                    fileName: a.fileName,
                    fileSize: a.fileSize,
                    fileType: a.fileType,
                    description: a.description,
                    uploadedByName: a.uploadedByName,
                    createdAt: a.createdAt,
                })) : []);
            }
        } catch {
            // silently fail
        } finally {
            setAttachmentsLoading(false);
        }
    }, [task.taskId, token]);

    useEffect(() => {
        fetchAttachments();
    }, [fetchAttachments]);

    const handleDownload = async (attachmentId: string, fileName: string) => {
        try {
            const res = await axios.get(`/api/attachments/${attachmentId}/download`, {
                responseType: 'blob',
                headers: { Authorization: `Bearer ${token}` },
            });
            const blob = res.data;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            setDownloadError('Unable to download attachment. The file may no longer be available.');
        }
    };

    const handleDelete = async (attachmentId: string) => {
        try {
            // Only remove from the list once the parent confirms the delete
            // succeeded on the server, so a failed delete doesn't lose the item.
            await onDeleteAttachment?.(attachmentId);
            setAttachments(prev => prev.filter(a => a.id !== attachmentId));
            setDeleteConfirmId(null);
        } catch {
            setDeleteConfirmId(null);
        }
    };

    const handleUploadFiles = async (files: FileList | File[]) => {
        const selected = Array.from(files);
        if (selected.length === 0) return;

        const allowed = ['pdf', 'docx', 'xlsx', 'jpg', 'png'];
        for (const file of selected) {
            const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
            if (!allowed.includes(ext)) {
                setAttachmentUploadError(`Unsupported format "${file.name}". Allowed: PDF, DOCX, XLSX, JPG, PNG.`);
                toastError(`Unsupported format "${file.name}". Allowed: PDF, DOCX, XLSX, JPG, PNG.`);
                return;
            }
            if (file.size > 20 * 1024 * 1024) {
                setAttachmentUploadError(`"${file.name}" exceeds the maximum size of 20MB.`);
                toastError(`"${file.name}" exceeds the maximum size of 20MB.`);
                return;
            }
        }

        if (attachInputRef.current) attachInputRef.current.value = '';
        setUploadingAttachments(true);
        setAttachmentUploadError('');

        const results = await Promise.allSettled(selected.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            await api.upload(`/api/tasks/${task.taskId}/attachments`, formData);
        }));

        const failed = results.filter(r => r.status === 'rejected').length;
        const uploaded = results.length - failed;
        setUploadingAttachments(false);

        if (uploaded > 0) {
            toastSuccess(`${uploaded} attachment(s) uploaded successfully.`);
            await fetchAttachments();
            onUpdate?.({ ...task, attachmentCount: (task.attachmentCount ?? 0) + uploaded });
        }
        if (failed > 0) {
            const msg = `${failed} attachment(s) failed to upload.`;
            setAttachmentUploadError(msg);
            toastError(msg);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    const [reviewState, setReviewState] = useState<ReviewState>(
        task.taskStatus === 'Completed' ? 'approved' :
            task.taskStatus === 'Done/Pending Review' ? 'pending_review' : 'none'
    );
    const [reviewHistory, setReviewHistory] = useState<ReviewHistoryEntry[]>([]);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [localStatus, setLocalStatus] = useState<TaskStatus>(task.taskStatus);
    // Controls: mobile full-screen tab (details | comments | recommendations)
    // AND (on desktop) which panel shows on the right — 'details' has no
    // meaning on the right panel, so it falls back to 'comments' there.
    const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'recommendations'>('details');

    const currentUser = localStorage.getItem('employeeName') ?? 'Admin';
    const userRole = localStorage.getItem('userRole') ?? '';
    const isCoordOrManager = userRole === 'Coordinator' || userRole === 'Manager';
    const isCoordinator = userRole === 'Coordinator';
    const isEmployee = ['Dispatcher', 'Encoder', 'Courier', 'Accountant'].includes(userRole);
    const isAssignedToMe = task.assignedTo === localStorage.getItem('employeeId');

    const od = isEffectivelyOverdue({ ...task, taskStatus: localStatus });
    const effectiveStatus = od ? 'Overdue' : localStatus;

    // What the right-hand panel should render on desktop.
    const rightPanelTab: 'comments' | 'recommendations' =
        activeTab === 'recommendations' ? 'recommendations' : 'comments';

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // ── Review actions ──
    const handleRequestReview = async () => {
        try {
            await api.patch(`/api/Task/${task.taskId}/status`, { newStatus: 'DonePendingReview' });
            setReviewState('pending_review');
            setLocalStatus('Done/Pending Review');
            setReviewHistory(prev => [...prev, {
                action: 'submitted', by: currentUser,
                at: new Date().toISOString(),
            }]);
        } catch { /* silently fail */ }
    };

    const handleApprove = async () => {
        try {
            if (onApprove) {
                await onApprove(task.taskId);
            } else {
                await api.patch(`/api/Task/${task.taskId}/review`, { isApproved: true });
            }
            setReviewState('approved');
            setLocalStatus('Completed');
            setReviewHistory(prev => [...prev, {
                action: 'approved', by: currentUser,
                at: new Date().toISOString(),
            }]);
            onUpdate?.({ ...task, taskStatus: 'Completed' });
            await fetchDeliveryDetail();
        } catch (err: any) {
            toastError(err?.response?.data?.message || err?.message || 'Failed to approve task.');
        }
    };

    const handleReject = (reason: string) => {
        setShowRejectModal(false);
        setReviewState('rejected');
        setLocalStatus('In Progress');
        setReviewHistory(prev => [...prev, {
            action: 'rejected', by: currentUser,
            at: new Date().toISOString(), note: reason,
        }]);
        onReject?.(task.taskId, reason);
    };

    const handleReopen = () => {
        if (reopening) return;
        setReopening(true);
        setReviewHistory(prev => [...prev, {
            action: 'reopened', by: currentUser,
            at: new Date().toISOString(),
        }]);
        onReopen();
    };

    // ── Review banner ──
    const renderReviewBanner = () => {
        const isDonePending = effectiveStatus === 'Done/Pending Review' || effectiveStatus === 'Pending Admin Review';
        const isInProgress = effectiveStatus === 'In Progress' || effectiveStatus === 'Not Started';
        const isCompleted = effectiveStatus === 'Completed';
        const isCancelled = effectiveStatus === 'Cancelled';

        if (isCompleted || isCancelled) return null;

        // Coordinator/Manager view: show approve/reject for tasks pending review
        if (isCoordOrManager && isDonePending) {
            return (
                <div className="tv-review-banner tv-review-pending">
                    <div className="tv-review-banner-left">
                        <Truck size={18} className="tv-review-truck-icon" />
                        <div>
                            <span className="tv-review-banner-title">Awaiting Completion Review & DMS Dispatch</span>
                            <span className="tv-review-banner-sub">
                                {task.assignedEmployee} submitted this task for review. Approving will mark it <strong>Completed</strong> and automatically create a <strong>Delivery Order in DMS</strong> with an auto-generated Waybill number.
                            </span>
                        </div>
                    </div>
                    <div className="tv-review-banner-actions">
                        <button className="tv-btn tv-btn-danger-solid" onClick={() => setShowRejectModal(true)}>
                            <XCircle size={13} /> Return for Rework
                        </button>
                        <button className="tv-btn tv-btn-success" onClick={handleApprove}>
                            <CheckCircle2 size={13} /> Approve & Create DMS Order
                        </button>
                    </div>
                </div>
            );
        }

        // Employee view: show "Submit for Review" when task is In Progress
        if (isEmployee && isInProgress && isAssignedToMe) {
            return (
                <div className="tv-review-banner tv-review-none">
                    <div className="tv-review-banner-left">
                        <Clock size={15} />
                        <div>
                            <span className="tv-review-banner-title">Task in progress</span>
                            <span className="tv-review-banner-sub">
                                Submit this task for review when ready.
                            </span>
                        </div>
                    </div>
                    <button className="tv-btn tv-btn-primary" onClick={handleRequestReview}>
                        <CheckCircle2 size={13} /> Submit for Review
                    </button>
                </div>
            );
        }

        // Rejected state — employee can resubmit
        if (reviewState === 'rejected' && isInProgress && isEmployee) {
            return (
                <div className="tv-review-banner tv-review-rejected">
                    <div className="tv-review-banner-left">
                        <AlertTriangle size={16} />
                        <div>
                            <span className="tv-review-banner-title">Completion rejected</span>
                            <span className="tv-review-banner-sub">
                                The employee needs to revise and resubmit.
                            </span>
                        </div>
                    </div>
                    <button className="tv-btn tv-btn-outline-sm" onClick={handleRequestReview}>
                        <CheckCircle2 size={12} /> Re-submit
                    </button>
                </div>
            );
        }

        return null;
    };

    return (
        <>
            <div className="tv-panel" role="region" aria-label={task.taskTitle}>

                {/* ── Navigation Top Bar ── */}
                <div className="tv-nav-header">
                    <button className="tv-back-btn" onClick={onClose} aria-label="Back to Task List">
                        <ArrowLeft size={15} />
                        <span>Back to Task List</span>
                    </button>
                    <div className="tv-breadcrumbs">
                        <span className="tv-breadcrumb-muted">Task Management</span>
                        <span className="tv-breadcrumb-sep">/</span>
                        <span className="tv-breadcrumb-active">Task Details</span>
                        {task.taskId && <span className="tv-breadcrumb-id">#{task.taskId.slice(0, 8)}</span>}
                    </div>
                </div>

                {/* ── Header ── */}
                <div className="tv-header">
                    <div className="tv-header-left">
                        <span className={priorityDotClass(task.priority)} />
                        <div className="tv-header-text">
                            <h2 className="tv-title">
                                {task.taskTitle}
                                {task.classification && (
                                    <span
                                        style={{
                                            marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3,
                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                            verticalAlign: 'middle', letterSpacing: '0.03em',
                                            background: task.classification === 'special' ? 'rgba(67,24,255,0.08)' : 'rgba(5,150,105,0.08)',
                                            color: task.classification === 'special' ? '#4318FF' : '#059669',
                                        }}
                                    >
                                        {task.classification === 'special' ? 'SPECIAL TASK' : 'ROUTINE'}
                                    </span>
                                )}
                                {task.isConfidential && (
                                    <span
                                        title="Confidential — only Coordinators and Manager can view"
                                        style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--status-failed, #ee5d50)', background: 'rgba(238, 93, 80, 0.08)', padding: '2px 8px', borderRadius: 4, verticalAlign: 'middle', letterSpacing: '0.04em' }}
                                    >
                                        <Lock size={11} /> CONFIDENTIAL
                                    </span>
                                )}
                            </h2>
                            <p className="tv-subtitle">
                                Created by <strong>{task.createdByEmployee}</strong>
                                {task.createdAt && <> · {fmtDate(task.createdAt)}</>}
                            </p>
                        </div>
                    </div>
                    <div className="tv-header-actions">
                        <button className="tv-btn tv-btn-primary" onClick={onEdit}>
                            <Pencil size={13} /> Edit
                        </button>
                        {isCoordOrManager && effectiveStatus !== 'Completed' && effectiveStatus !== 'Cancelled' && effectiveStatus !== 'On Hold' && (
                            <button className="tv-btn tv-btn-outline" onClick={() => setShowHold(true)}>
                                <Clock size={13} /> Hold
                            </button>
                        )}
                        {isCoordOrManager && effectiveStatus !== 'Completed' && effectiveStatus !== 'Cancelled' && (
                            <button className="tv-btn tv-btn-outline-danger" onClick={() => setShowCancel(true)}>
                                <XCircle size={13} /> Cancel
                            </button>
                        )}
                        {isCoordOrManager && effectiveStatus === 'On Hold' && (
                            <button className="tv-btn tv-btn-outline" onClick={() => {
                                const d = new Date(); d.setDate(d.getDate() + 1);
                                setRevisedDeadline(d.toISOString().slice(0, 16));
                                setShowResume(true);
                            }}>
                                <RotateCcw size={13} /> Resume
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Review banner ── */}
                {renderReviewBanner()}

                {/* ── Mobile tabs ── */}
                <div className="tv-tabs">
                    <button className={`tv-tab${activeTab === 'details' ? ' active' : ''}`}
                        onClick={() => setActiveTab('details')}>Details</button>
                    <button className={`tv-tab${activeTab === 'comments' ? ' active' : ''}`}
                        onClick={() => setActiveTab('comments')}>
                        Comments
                    </button>
                    <button className={`tv-tab${activeTab === 'recommendations' ? ' active' : ''}`}
                        onClick={() => setActiveTab('recommendations')}>
                        Recommendations
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="tv-body">

                    {/* ── Left: Details ── */}
                    <div className={`tv-details${activeTab === 'details' ? ' tv-mobile-visible' : ''}`}>

                        {/* Meta chips */}
                        <div className="tv-meta-grid">
                            <div className="tv-meta-chip">
                                <span className="tv-meta-label">Status</span>
                                <StatusBadge status={reviewState === 'pending_review' ? 'Pending Review' : effectiveStatus} size="sm" />
                            </div>
                            <div className="tv-meta-chip">
                                <span className="tv-meta-label">Priority</span>
                                <PrioBadge p={task.priority} />
                            </div>
                            <div className="tv-meta-chip">
                                <span className="tv-meta-label">Classification</span>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                                    background: task.classification === 'special' ? 'rgba(67,24,255,0.08)' : 'rgba(5,150,105,0.08)',
                                    color: task.classification === 'special' ? '#4318FF' : '#059669',
                                }}>
                                    {task.classification === 'special' ? 'SPECIAL TASK' : 'ROUTINE'}
                                </span>
                            </div>
                            <div className="tv-meta-chip">
                                <span className="tv-meta-label">Due Date</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    {task.isSLALocked && (
                                        <span title="SLA Locked — deadline enforced by system" style={{ display: 'inline-flex', alignItems: 'center', color: '#7c1d1d', background: '#fef2f2', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, gap: 2 }}>
                                            <Lock size={10} /> SLA
                                        </span>
                                    )}
                                    <span className={`tv-meta-value${od ? ' tv-overdue' : ''}`}>
                                        {task.dueAt ? fmtDate(task.dueAt) : '—'}
                                    </span>
                                </span>
                            </div>
                            <div className="tv-meta-chip">
                                <span className="tv-meta-label">Scope</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>
                                    {task.assignmentScope !== undefined
                                        ? (['Single', 'Team', 'Department'][task.assignmentScope] ?? '—')
                                        : '—'}
                                </span>
                            </div>
                        </div>

                        {/* Assigned to */}
                        <div className="tv-section">
                            <span className="tv-section-label">
                                {task.assignmentScope === 2 ? 'Department' : 'Assigned To'}
                            </span>
                            <div className="tv-assignee">
                                {task.assignmentScope === 2 && (
                                    <span className="tv-assignee-name" style={{ marginBottom: 4 }}>
                                        {task.assignedDepartmentName || '—'}
                                    </span>
                                )}
                                {task.assignees && task.assignees.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                        {task.assignees.map((a, i) => {
                                            const pct = a.completionPercentage ?? 0;
                                            return (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div className="tv-avatar tv-avatar-blue">
                                                        {(a.fullName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="tv-assignee-name" style={{ flex: 1 }}>
                                                        {a.fullName || 'Unassigned'}
                                                    </span>
                                                    <span
                                                        title="Completion percentage set by the employee"
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            padding: '1px 7px',
                                                            borderRadius: 4,
                                                            background: pct >= 100
                                                                ? 'rgba(5,150,105,0.12)'
                                                                : pct >= 50
                                                                    ? 'rgba(0,169,157,0.12)'
                                                                    : 'rgba(148,163,184,0.15)',
                                                            color: pct >= 100 ? '#059669' : pct >= 50 ? '#00A99D' : 'var(--text-secondary)',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {pct}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : task.assignmentScope === 2 ? null : (
                                    <>
                                        <div className="tv-avatar tv-avatar-blue">
                                            {(task.assignedEmployee || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <span className="tv-assignee-name">
                                            {task.assignedEmployee || 'Unassigned'}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Confidential Toggle */}
                        <div className="tv-section">
                            <span className="tv-section-label">Visibility</span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                                <input
                                    type="checkbox"
                                    checked={!!task.isConfidential}
                                    onChange={e => {
                                        e.preventDefault();
                                        setConfidentialConfirm({ open: true, pendingValue: e.target.checked });
                                    }}
                                    style={{ accentColor: 'var(--teal, #00A99D)', width: 16, height: 16, cursor: 'pointer' }}
                                />
                                <Lock size={13} color="var(--text-secondary)" />
                                <span>Confidential — {task.isConfidential ? 'Only Coordinators & Manager can view' : 'Visible to all assigned roles'}</span>
                            </label>
                        </div>

                        {/* Description */}
                        <div className="tv-section">
                            <span className="tv-section-label">Description</span>
                            <div className="tv-text-box">
                                {task.taskDescription
                                    ? task.taskDescription
                                    : <span className="tv-empty-text">No description provided.</span>}
                            </div>
                        </div>

                        {/* Remarks */}
                        {task.taskRemarks && (
                            <div className="tv-section">
                                <span className="tv-section-label">Remarks</span>
                                <div className="tv-text-box tv-text-box-remarks">{task.taskRemarks}</div>
                            </div>
                        )}

                        {/* ── DMS Delivery Details & Tracking Card (Integration 1) ── */}
                        <div className="tv-section tv-dms-section">
                            <div className="tv-dms-header">
                                <div className="tv-dms-header-title">
                                    <Truck size={15} className="tv-dms-icon" />
                                    <span>Delivery Management & Waybill (DMS)</span>
                                </div>
                                <div className="tv-dms-header-status">
                                    {deliveryDetail?.dmsWaybillNo ? (
                                        <span className="tv-dms-pill tv-dms-pill-synced">
                                            <Check size={11} /> Synced to DMS
                                        </span>
                                    ) : deliveryDetail?.syncStatus === 'Failed' ? (
                                        <span className="tv-dms-pill tv-dms-pill-failed">
                                            <AlertCircle size={11} /> Sync Failed
                                        </span>
                                    ) : deliveryDetail?.recipientName ? (
                                        <span className="tv-dms-pill tv-dms-pill-pending">
                                            <Clock size={11} /> Ready for Dispatch
                                        </span>
                                    ) : (
                                        <span className="tv-dms-pill tv-dms-pill-empty">
                                            Optional Delivery Info
                                        </span>
                                    )}
                                </div>
                            </div>

                            {deliveryLoading ? (
                                <div className="tv-text-box" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Loader2 size={12} className="spin" /> Loading delivery information…
                                </div>
                            ) : deliveryDetail?.dmsWaybillNo ? (
                                <div className="tv-dms-card tv-dms-card-active">
                                    <div className="tv-dms-waybill-banner">
                                        <div className="tv-dms-waybill-info">
                                            <span className="tv-dms-waybill-label">DMS WAYBILL NUMBER</span>
                                            <span className="tv-dms-waybill-val">{deliveryDetail.dmsWaybillNo}</span>
                                        </div>
                                        <div className="tv-dms-waybill-actions">
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm tv-dms-copy-btn"
                                                onClick={() => handleCopyWaybill(deliveryDetail.dmsWaybillNo!)}
                                                title="Copy Waybill Number"
                                            >
                                                {copiedWaybill ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                                                {copiedWaybill ? 'Copied!' : 'Copy Waybill'}
                                            </button>
                                            {deliveryDetail.dmsStatus && (
                                                <span className="tv-dms-status-tag">
                                                    Status: <strong>{deliveryDetail.dmsStatus}</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Multi-Step Delivery Stepper (Integration 2) ── */}
                                    <div className="tv-dms-stepper-wrap">
                                        {(() => {
                                            const s = (deliveryDetail.dmsStatus || '').toLowerCase();
                                            const isDelivered = s.includes('delivered') || s.includes('completed');
                                            const isTransit = s.includes('transit') || s.includes('out') || isDelivered;
                                            const isPickedUp = s.includes('pickup') || isTransit;
                                            return (
                                                <div className="tv-dms-mini-stepper">
                                                    <div className="tv-dms-mini-step done">
                                                        <div className="tv-dms-mini-dot"><Check size={10} /></div>
                                                        <span className="tv-dms-mini-label">Dispatched</span>
                                                    </div>
                                                    <div className={`tv-dms-mini-step ${isPickedUp ? 'done' : ''}`}>
                                                        <div className="tv-dms-mini-dot">{isPickedUp ? <Check size={10} /> : '2'}</div>
                                                        <span className="tv-dms-mini-label">Picked Up</span>
                                                    </div>
                                                    <div className={`tv-dms-mini-step ${isTransit ? 'done' : ''}`}>
                                                        <div className="tv-dms-mini-dot">{isTransit ? <Check size={10} /> : '3'}</div>
                                                        <span className="tv-dms-mini-label">In Transit</span>
                                                    </div>
                                                    <div className={`tv-dms-mini-step ${isDelivered ? 'done' : ''}`}>
                                                        <div className="tv-dms-mini-dot">{isDelivered ? <Check size={10} /> : '4'}</div>
                                                        <span className="tv-dms-mini-label">Delivered</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {deliveryDetail.dmsFailureReason && (
                                        <div className="tv-dms-error-box" style={{ margin: '4px 0' }}>
                                            <AlertCircle size={14} className="tv-dms-error-icon" />
                                            <div>
                                                <div className="tv-dms-error-title">Delivery Issue Reported</div>
                                                <div className="tv-dms-error-msg">{deliveryDetail.dmsFailureReason}</div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="tv-dms-grid">
                                        <div className="tv-dms-grid-item">
                                            <span className="tv-dms-grid-label">Recipient</span>
                                            <span className="tv-dms-grid-value">{deliveryDetail.recipientName || '—'}</span>
                                        </div>
                                        <div className="tv-dms-grid-item">
                                            <span className="tv-dms-grid-label">Contact Number</span>
                                            <span className="tv-dms-grid-value">{deliveryDetail.recipientContact || '—'}</span>
                                        </div>
                                        <div className="tv-dms-grid-item tv-dms-grid-full">
                                            <span className="tv-dms-grid-label">Delivery Address</span>
                                            <span className="tv-dms-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MapPin size={12} color="var(--primary)" />
                                                {deliveryDetail.deliveryAddress || '—'}
                                                {deliveryDetail.area && <span className="tv-dms-area-tag">({deliveryDetail.area})</span>}
                                            </span>
                                        </div>
                                        {deliveryDetail.courierEmployeeId && (
                                            <div className="tv-dms-grid-item">
                                                <span className="tv-dms-grid-label">Assigned Driver</span>
                                                <span className="tv-dms-grid-value" style={{ fontFamily: 'monospace' }}>
                                                    {deliveryDetail.courierEmployeeId}
                                                </span>
                                            </div>
                                        )}
                                        {deliveryDetail.packageDescription && (
                                            <div className="tv-dms-grid-item tv-dms-grid-full">
                                                <span className="tv-dms-grid-label">Package Description</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.packageDescription}</span>
                                            </div>
                                        )}
                                        {deliveryDetail.dmsLatitude && deliveryDetail.dmsLongitude && (
                                            <div className="tv-dms-grid-item tv-dms-grid-full">
                                                <span className="tv-dms-grid-label">GPS Telemetry</span>
                                                <a
                                                    href={`https://www.google.com/maps?q=${deliveryDetail.dmsLatitude},${deliveryDetail.dmsLongitude}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="tv-dms-gps-badge"
                                                    title="Open live coordinates in Google Maps"
                                                >
                                                    <MapPin size={11} />
                                                    <span>Lat: {deliveryDetail.dmsLatitude.toFixed(4)}, Lng: {deliveryDetail.dmsLongitude.toFixed(4)}</span>
                                                    <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        )}
                                        {deliveryDetail.dmsOrderId && (
                                            <div className="tv-dms-grid-item">
                                                <span className="tv-dms-grid-label">DMS Order ID</span>
                                                <span className="tv-dms-grid-value">#{deliveryDetail.dmsOrderId}</span>
                                            </div>
                                        )}
                                        {deliveryDetail.dmsLastSyncedAt && (
                                            <div className="tv-dms-grid-item">
                                                <span className="tv-dms-grid-label">Last Synced</span>
                                                <span className="tv-dms-grid-value">{fmtDateTime(deliveryDetail.dmsLastSyncedAt)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {isCoordOrManager && (
                                        <div className="tv-dms-card-footer">
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm"
                                                onClick={() => setShowEditDeliveryModal(true)}
                                            >
                                                <Pencil size={11} /> Edit Recipient Details
                                            </button>
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm"
                                                onClick={handleResendDms}
                                                disabled={resendingDms}
                                                title="Re-sync order with DMS"
                                            >
                                                {resendingDms ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
                                                {resendingDms ? 'Syncing…' : 'Re-sync DMS'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="tv-dms-card tv-dms-card-inactive">
                                    {deliveryDetail?.syncStatus === 'Failed' && (
                                        <div className="tv-dms-error-box">
                                            <AlertCircle size={14} className="tv-dms-error-icon" />
                                            <div>
                                                <div className="tv-dms-error-title">DMS Transmission Failed</div>
                                                <div className="tv-dms-error-msg">{deliveryDetail.syncError || 'Unable to communicate with DMS service.'}</div>
                                            </div>
                                        </div>
                                    )}

                                    {deliveryDetail?.recipientName ? (
                                        <div className="tv-dms-grid">
                                            <div className="tv-dms-grid-item">
                                                <span className="tv-dms-grid-label">Recipient</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.recipientName}</span>
                                            </div>
                                            <div className="tv-dms-grid-item">
                                                <span className="tv-dms-grid-label">Contact Number</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.recipientContact}</span>
                                            </div>
                                            <div className="tv-dms-grid-item tv-dms-grid-full">
                                                <span className="tv-dms-grid-label">Delivery Address</span>
                                                <span className="tv-dms-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <MapPin size={12} color="var(--primary)" />
                                                    {deliveryDetail.deliveryAddress}
                                                    {deliveryDetail.area && <span className="tv-dms-area-tag">({deliveryDetail.area})</span>}
                                                </span>
                                            </div>
                                            {deliveryDetail.packageDescription && (
                                                <div className="tv-dms-grid-item tv-dms-grid-full">
                                                    <span className="tv-dms-grid-label">Package Description</span>
                                                    <span className="tv-dms-grid-value">{deliveryDetail.packageDescription}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="tv-dms-empty-hint">
                                            <Truck size={24} style={{ opacity: 0.35, marginBottom: 4 }} />
                                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                Delivery details will be automatically synthesized from the task title on completion.
                                            </p>
                                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                You can also pre-specify custom recipient name, contact number, and drop-off address.
                                            </p>
                                        </div>
                                    )}

                                    {isCoordOrManager && (
                                        <div className="tv-dms-card-footer">
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm"
                                                onClick={() => {
                                                    if (!deliveryDetail) {
                                                        setEditingDelivery({
                                                            recipientName: task.assignedEmployee || 'Operations Dispatch',
                                                            recipientContact: '09123456789',
                                                            deliveryAddress: 'Metro Manila',
                                                            area: 'Manila',
                                                            packageDescription: task.taskTitle,
                                                            courierEmployeeId: '',
                                                        });
                                                    }
                                                    setShowEditDeliveryModal(true);
                                                }}
                                            >
                                                <Pencil size={11} /> {deliveryDetail?.recipientName ? 'Edit Delivery Details' : 'Configure Delivery Details'}
                                            </button>
                                            {(effectiveStatus === 'Completed' || deliveryDetail?.syncStatus === 'Failed') && (
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-primary tv-btn-sm"
                                                    onClick={handleResendDms}
                                                    disabled={resendingDms}
                                                >
                                                    {resendingDms ? <Loader2 size={11} className="spin" /> : <Send size={11} />}
                                                    {resendingDms ? 'Dispatching…' : 'Dispatch Order to DMS Now'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Attachments */}
                        <div className="tv-section">
                            <span className="tv-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Paperclip size={13} /> Attachments
                                {(task.attachmentCount ?? 0) > 0 && (
                                    <span className="tv-attach-count">{task.attachmentCount}</span>
                                )}
                                {isCoordOrManager && (
                                    <>
                                        <input
                                            ref={attachInputRef}
                                            type="file"
                                            multiple
                                            accept=".pdf,.docx,.xlsx,.jpg,.png"
                                            style={{ display: 'none' }}
                                            onChange={e => handleUploadFiles(e.target.files ?? [])}
                                        />
                                        <button
                                            type="button"
                                            className="tv-btn tv-btn-outline-sm tv-attach-upload-btn"
                                            onClick={() => attachInputRef.current?.click()}
                                            disabled={uploadingAttachments}
                                            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                            title="Upload one or more files"
                                        >
                                            {uploadingAttachments ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
                                            {uploadingAttachments ? 'Uploading…' : 'Upload'}
                                        </button>
                                    </>
                                )}
                            </span>
                            {attachmentsLoading ? (
                                <div className="tv-text-box" style={{ color: 'var(--sidebar-text)', fontSize: 12 }}>
                                    Loading attachments…
                                </div>
                            ) : attachments.length === 0 ? (
                                <div className="tv-text-box">
                                    <span className="tv-empty-text">No attachments.</span>
                                </div>
                            ) : (
                                <div className="tv-attach-list">
                                    {attachments.map(a => (
                                        <div key={a.id} className="tv-attach-item">
                                            <FileText size={15} className="tv-attach-icon" />
                                            <div className="tv-attach-info">
                                                <span className="tv-attach-name" title={a.fileName}>{a.fileName}</span>
                                                <span className="tv-attach-meta">
                                                    {formatFileSize(a.fileSize)}
                                                    {a.uploadedByName && <> · by {a.uploadedByName}</>}
                                                </span>
                                            </div>
                                            <div className="tv-attach-actions">
                                                <button className="tv-icon-btn tv-attach-btn" title="Download"
                                                    onClick={() => handleDownload(a.id, a.fileName)}>
                                                    <Download size={13} />
                                                </button>
                                                {onDeleteAttachment && (
                                                    deleteConfirmId === a.id ? (
                                                        <div className="tv-attach-confirm">
                                                            <button className="tv-btn tv-btn-danger-xs" onClick={() => handleDelete(a.id)}>
                                                                <XCircle size={11} /> Confirm
                                                            </button>
                                                            <button className="tv-icon-btn tv-attach-btn" onClick={() => setDeleteConfirmId(null)}>
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button className="tv-icon-btn tv-attach-btn tv-attach-delete" title="Delete"
                                                            onClick={() => setDeleteConfirmId(a.id)}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {downloadError && (
                                <div className="tv-text-box" style={{ color: 'var(--status-failed)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertCircle size={12} /> {downloadError}
                                </div>
                            )}
                            {attachmentUploadError && (
                                <div className="tv-text-box" style={{ color: 'var(--status-failed)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertCircle size={12} /> {attachmentUploadError}
                                </div>
                            )}
                        </div>

                        {/* Review history */}
                        {reviewHistory.length > 0 && (
                            <div className="tv-section">
                                <span className="tv-section-label">Review History</span>
                                <div className="tv-review-history">
                                    {reviewHistory.map((h, i) => (
                                        <div key={i} className={`tv-rh-item tv-rh-${h.action}`}>
                                            <div className={`tv-rh-dot tv-rh-dot-${h.action}`} />
                                            <div className="tv-rh-content">
                                                <span className="tv-rh-label">
                                                    {h.action === 'submitted' && 'Submitted for review'}
                                                    {h.action === 'approved' && 'Completion approved'}
                                                    {h.action === 'rejected' && 'Completion rejected'}
                                                    {h.action === 'reopened' && 'Task reopened'}
                                                </span>
                                                <span className="tv-rh-meta">by {h.by} · {fmtDateTime(h.at)}</span>
                                                {h.note && <span className="tv-rh-note">"{h.note}"</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Timeline */}
                        <div className="tv-timeline">
                            <div className="tv-timeline-item">
                                <span className="tv-timeline-dot" />
                                <span className="tv-timeline-text">
                                    Task created · {task.createdAt ? fmtDateTime(task.createdAt) : '—'}
                                </span>
                            </div>
                            {task.dueAt && (
                                <div className="tv-timeline-item">
                                    <span className={`tv-timeline-dot${od ? ' tv-dot-red' : ' tv-dot-blue'}`} />
                                    <span className="tv-timeline-text">Due · {fmtDateTime(task.dueAt)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Right: Comments / Recommendations (single panel, toggled) ── */}
                    <div className={`tv-comments${activeTab !== 'details' ? ' tv-mobile-visible' : ''}`}>
                        <div className="tv-comments-toggle">
                            <button
                                type="button"
                                className={rightPanelTab === 'comments' ? 'active' : ''}
                                onClick={() => setActiveTab('comments')}
                            >
                                <MessageSquare size={13} /> Comments
                            </button>
                            <button
                                type="button"
                                className={rightPanelTab === 'recommendations' ? 'active' : ''}
                                onClick={() => setActiveTab('recommendations')}
                            >
                                <Lightbulb size={13} /> Recommendations
                            </button>
                        </div>
                        {rightPanelTab === 'recommendations'
                            ? <TaskRecommendations taskId={task.taskId} />
                            : <TaskComments taskId={task.taskId} currentEmployeeId={task.assignedTo} taskReferenceNumber={task.taskReferenceNumber || task.taskId.slice(0, 8).toUpperCase()} />}
                    </div>
                </div>
            </div>

            {showRejectModal && (
                <RejectModal
                    onConfirm={handleReject}
                    onCancel={() => setShowRejectModal(false)}
                />
            )}

            {showHold && (
                <div className="tv-modal-overlay" onClick={() => !holding && setShowHold(false)}>
                    <div className="tv-modal" onClick={e => e.stopPropagation()}>
                        <div className="tv-modal-header">
                            <div className="tv-modal-icon tv-modal-icon-warning">
                                <Clock size={20} />
                            </div>
                            <div>
                                <h4 className="tv-modal-title">Place Task On Hold</h4>
                                <p className="tv-modal-sub">The deadline/SLA countdown will pause immediately.</p>
                            </div>
                        </div>
                        <textarea
                            className="tv-modal-textarea"
                            placeholder="Reason for holding this task (required)..."
                            value={holdReason}
                            onChange={e => setHoldReason(e.target.value)}
                            rows={3}
                            autoFocus
                        />
                        <div className="tv-modal-actions">
                            <button className="tv-btn tv-btn-outline" onClick={() => { setShowHold(false); setHoldReason(''); }} disabled={holding}>Cancel</button>
                            <button className="tv-btn tv-btn-warning"
                                onClick={async () => {
                                    if (!holdReason.trim()) return;
                                    setHolding(true);
                                    try {
                                        await api.patch(`/api/Task/${task.taskId}/hold`, { holdReason: holdReason.trim() });
                                        setLocalStatus('On Hold');
                                        setShowHold(false);
                                        setHoldReason('');
                                        // Propagate to the parent so the task list
                                        // reflects On Hold right away.
                                        onUpdate?.({ ...task, taskStatus: 'On Hold' });
                                    } catch (err: any) {
                                        console.error(err);
                                    } finally { setHolding(false); }
                                }}
                                disabled={!holdReason.trim() || holding}>
                                {holding ? <Loader2 size={13} className="spin" /> : <Clock size={13} />} Place On Hold
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showResume && (
                <div className="tv-modal-overlay" onClick={() => !resuming && setShowResume(false)}>
                    <div className="tv-modal" onClick={e => e.stopPropagation()}>
                        <div className="tv-modal-header">
                            <div className="tv-modal-icon tv-modal-icon-success">
                                <RotateCcw size={20} />
                            </div>
                            <div>
                                <h4 className="tv-modal-title">Resume Task</h4>
                                <p className="tv-modal-sub">Set a new revised deadline to restart the countdown.</p>
                            </div>
                        </div>
                        <div style={{ padding: '0 24px 16px' }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Revised Deadline *</label>
                            <input
                                type="datetime-local"
                                value={revisedDeadline}
                                onChange={e => setRevisedDeadline(e.target.value)}
                                min={new Date().toISOString().slice(0, 16)}
                                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none' }}
                            />
                        </div>
                        <div className="tv-modal-actions">
                            <button className="tv-btn tv-btn-outline" onClick={() => setShowResume(false)} disabled={resuming}>Cancel</button>
                            <button className="tv-btn tv-btn-primary"
                                onClick={async () => {
                                    if (!revisedDeadline) return;
                                    setResuming(true);
                                    try {
                                        const res = await api.patch(`/api/Task/${task.taskId}/resume`, { revisedDeadline: new Date(revisedDeadline).toISOString() });
                                        const resumedDto = res?.data?.data ?? res?.data;
                                        const newStatus: TaskViewTask['taskStatus'] = (resumedDto?.status === 0 || resumedDto?.status === 'NotStarted') ? 'Not Started' : 'In Progress';
                                        setLocalStatus(newStatus);
                                        setShowResume(false);
                                        onUpdate?.({ ...task, taskStatus: newStatus, dueAt: resumedDto?.deadline ?? (new Date(revisedDeadline).toISOString()) });
                                    } catch (err: any) {
                                        console.error(err);
                                    } finally { setResuming(false); }
                                }}
                                disabled={!revisedDeadline || resuming}>
                                {resuming ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />} Resume Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCancel && (
                <div className="tv-modal-overlay" onClick={() => !cancelling && setShowCancel(false)}>
                    <div className="tv-modal" onClick={e => e.stopPropagation()}>
                        <div className="tv-modal-header">
                            <div className="tv-modal-icon tv-modal-icon-danger">
                                <XCircle size={20} />
                            </div>
                            <div>
                                <h4 className="tv-modal-title">Cancel Task</h4>
                                <p className="tv-modal-sub">This action cannot be undone. The task will be marked as Cancelled.</p>
                            </div>
                        </div>
                        <textarea
                            className="tv-modal-textarea"
                            placeholder="Reason for cancellation (required)..."
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            rows={3}
                            autoFocus
                        />
                        <div className="tv-modal-actions">
                            <button className="tv-btn tv-btn-outline" onClick={() => { setShowCancel(false); setCancelReason(''); }} disabled={cancelling}>Keep Task</button>
                                                    <button className="tv-btn tv-btn-danger"
                                                        onClick={async () => {
                                                            if (!cancelReason.trim()) return;
                                                            setCancelling(true);
                                                            try {
                                                                await api.patch(`/api/Task/${task.taskId}/cancel`, { cancellationReason: cancelReason.trim(), isConfirmed: true });
                                                                setLocalStatus('Cancelled');
                                                                setShowCancel(false);
                                                                setCancelReason('');
                                                                onUpdate?.({ ...task, taskStatus: 'Cancelled' });
                                                            } catch (err: any) {
                                                                const msg = err?.response?.data?.message || err?.response?.data?.Message || 'Failed to cancel task.';
                                                                alert(msg);
                                                            } finally { setCancelling(false); }
                                                        }}
                                                        disabled={!cancelReason.trim() || cancelling}>
                                                        {cancelling ? <Loader2 size={13} className="spin" /> : <XCircle size={13} />} Cancel Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confidential Confirmation Modal */}
            <ConfirmationModal
                isOpen={confidentialConfirm.open}
                variant={confidentialConfirm.pendingValue ? 'warning' : 'info'}
                title={confidentialConfirm.pendingValue ? 'Mark task as Confidential?' : 'Remove Confidential status?'}
                description={
                    confidentialConfirm.pendingValue
                        ? 'This task will be hidden from Encoders, Dispatchers, and Couriers. Only Coordinators and Managers will be able to see it in lists, searches, and notifications.'
                        : 'This task will become visible to all assigned roles, including Encoders, Dispatchers, and Couriers.'
                }
                confirmLabel={confidentialConfirm.pendingValue ? 'Mark as Confidential' : 'Remove Confidential'}
                isLoading={confidentialSaving}
                onConfirm={async () => {
                    setConfidentialSaving(true);
                    try {
                        await api.put(`/api/Task/${task.taskId}`, { isConfidential: confidentialConfirm.pendingValue });
                        toastSuccess(confidentialConfirm.pendingValue ? 'Task marked as confidential.' : 'Confidential status removed.');
                        if (onUpdate) {
                            onUpdate({ ...task, isConfidential: confidentialConfirm.pendingValue });
                        }
                    } catch (err: any) {
                        const msg = err?.response?.data?.message || err?.response?.data?.Message || 'Failed to update confidentiality.';
                        toastError(msg);
                    } finally {
                        setConfidentialSaving(false);
                        setConfidentialConfirm({ open: false, pendingValue: false });
                    }
                }}
                onCancel={() => setConfidentialConfirm({ open: false, pendingValue: false })}
            />

            {/* ── Edit Delivery Details Modal (DMS Integration) ── */}
            {showEditDeliveryModal && (
                <div className="tv-modal-overlay" onClick={() => !savingDelivery && setShowEditDeliveryModal(false)}>
                    <div className="tv-modal tv-modal-delivery" onClick={e => e.stopPropagation()}>
                        <div className="tv-modal-header">
                            <div className="tv-modal-icon tv-modal-icon-primary">
                                <Truck size={20} />
                            </div>
                            <div>
                                <h4 className="tv-modal-title">Configure Delivery & Recipient Details</h4>
                                <p className="tv-modal-sub">Details sent to DMS for automatic Delivery Order & Waybill generation upon task completion.</p>
                            </div>
                        </div>

                        <div className="tv-modal-form-body">
                            <div className="tv-form-group">
                                <label className="tv-form-label">Recipient Full Name <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                                <input
                                    type="text"
                                    className="tv-form-input"
                                    placeholder="e.g. Engr. Roberto Cruz / Operations Lead"
                                    value={editingDelivery.recipientName}
                                    onChange={e => setEditingDelivery(prev => ({ ...prev, recipientName: e.target.value }))}
                                />
                            </div>

                            <div className="tv-form-row">
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Recipient Contact Number <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. 09171234567"
                                        value={editingDelivery.recipientContact}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, recipientContact: e.target.value }))}
                                    />
                                </div>
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Area / City / District</label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. Taguig, Makati, Manila, Cebu"
                                        value={editingDelivery.area || ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, area: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="tv-form-group">
                                <label className="tv-form-label">Delivery Address / Destination <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                                <textarea
                                    className="tv-form-input tv-form-textarea"
                                    rows={2}
                                    placeholder="e.g. Tower 2, High Street South, Bonifacio Global City, Taguig"
                                    value={editingDelivery.deliveryAddress}
                                    onChange={e => setEditingDelivery(prev => ({ ...prev, deliveryAddress: e.target.value }))}
                                />
                            </div>

                            <div className="tv-form-row">
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Package Description / Item</label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. Confidential Project Dossier / Hardware Parts"
                                        value={editingDelivery.packageDescription || ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, packageDescription: e.target.value }))}
                                    />
                                </div>
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Courier Employee ID <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>(Optional DMS Driver)</span></label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. DRV-001"
                                        value={editingDelivery.courierEmployeeId || ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, courierEmployeeId: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="tv-modal-actions">
                            <button
                                type="button"
                                className="tv-btn tv-btn-outline"
                                onClick={() => setShowEditDeliveryModal(false)}
                                disabled={savingDelivery}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="tv-btn tv-btn-primary"
                                onClick={handleSaveDelivery}
                                disabled={savingDelivery || !editingDelivery.recipientName.trim() || !editingDelivery.recipientContact.trim() || !editingDelivery.deliveryAddress.trim()}
                            >
                                {savingDelivery ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                                {savingDelivery ? 'Saving…' : 'Save Delivery Details'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TaskView;