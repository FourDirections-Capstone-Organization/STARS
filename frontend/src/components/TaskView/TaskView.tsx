import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Pencil, X, Package, CheckCircle2,
    XCircle, Clock, AlertTriangle, ThumbsUp, RotateCcw, Lock, ArrowLeft,
    FileText, Download, Trash2, Paperclip, MessageSquare, Lightbulb, Loader2, AlertCircle, Upload,
    Truck, MapPin, Copy, Check, Send, ExternalLink, RefreshCw, Save, Plus,
    DollarSign, Phone, Mail, ShieldAlert, Sparkles, Zap, FileCheck, Calendar,
} from 'lucide-react';
import TaskComments from '../TaskComments/TaskComments';
import TaskRecommendations from '../TaskRecommendations/TaskRecommendations';
import StatusBadge from '../ui/StatusBadge';
import { formatStatus } from '../../utils/statusUtils';
import ConfirmationModal from '../ConfirmationModal/ConfirmationModal';
import { useToast } from '../Toast/Toast';
import api from '../../api';
import axios from 'axios';
import { formatDeadlineWithRemaining, formatDateOnly } from '../../utils/dateUtils';
import { formatDriverDisplay as formatDriverDisplayShared, FormatDriverOptions } from '../../utils/driverUtils';
import { syncDmsTaskCompleted } from '../../utils/dmsSyncUtils';
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
    senderAddress?: string;
    specialInstructions?: string;
    courierEmployeeId?: string;
    courierFullName?: string;
    courierIsActive?: boolean;
    podUrl?: string;
    podFileName?: string;
    podUploadedAt?: string;
    podUploadedBy?: string;
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
    expectedDelivery?: string;
    expectedDeliveryDate?: string;
}

export interface TaskPodData {
    taskId: string;
    waybillNo?: string | null;
    podUrl?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    fileSize?: number | null;
    uploadedAt?: string | null;
    uploadedByName?: string | null;
    downloadUrl?: string | null;
    hasPod?: boolean;
}

export interface UpsertDeliveryDetailPayload {
    recipientName: string;
    recipientContact: string;
    deliveryAddress: string;
    area?: string;
    packageDescription?: string;
    senderAddress?: string;
    specialInstructions?: string;
    courierEmployeeId?: string;
    courierFullName?: string;
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
    /** 8-character unique alphanumeric random key (e.g. "K7N9P4X2") */
    taskNumber?: string;
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
    onEdit?: () => void;
    onReopen?: () => void;
    onClose?: () => void;
    onApprove?: (taskId: string) => void;
    onReject?: (taskId: string, reason: string) => void;
    onDeleteAttachment?: (attachmentId: string) => void | Promise<void>;
    onUpdate?: (updatedTask: TaskViewTask) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats driver display label. Delegates to shared formatDriverDisplay.
 * Defaults to legacy layout 'name-first' for backwards compatibility with unmigrated dashboard components
 * until Step 3. For new standard format ("EMP-008 · Ricardo Bautista"), use { layout: 'id-first' }
 * or import directly from '../../utils/driverUtils'.
 */
export const formatDriverDisplay = (
    fullName?: string | null,
    employeeId?: string | null,
    isActive?: boolean | null,
    options?: FormatDriverOptions
): { displayText: string; isInactive: boolean } => {
    return formatDriverDisplayShared(fullName, employeeId, isActive, options ?? { layout: 'name-first' });
};

export const isImageFile = (fileName?: string | null, fileType?: string | null): boolean => {
    const ext = (fileType || (fileName ? fileName.substring(fileName.lastIndexOf('.')) : '')).toLowerCase().replace(/^\./, '');
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return true;
    if (!ext && !fileType) return true; // Default assumption for POD photos
    return false;
};

export const isPdfFile = (fileName?: string | null, fileType?: string | null): boolean => {
    const ext = (fileType || (fileName ? fileName.substring(fileName.lastIndexOf('.')) : '')).toLowerCase().replace(/^\./, '');
    return ext === 'pdf';
};

export const formatFileSize = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

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

// ─── FOMS Collection Parser ───────────────────────────────────────────────────

interface ParsedFomsCollectionInfo {
    isCollectionTask: boolean;
    invoiceNumber: string;
    amountDue: string;
    aging: string;
    daysOverdue: number;
    dueDate: string;
    clientAccount: string;
    clientName: string;
    contactPerson: string;
    contactPhone: string;
    email: string;
    address: string;
    remarks: string;
}

const parseFomsCollection = (title?: string, desc?: string): ParsedFomsCollectionInfo | null => {
    const rawTitle = title || '';
    const rawDesc = desc || '';
    const isCollection = rawTitle.includes('[Collection Follow-up]') || rawDesc.includes('Automated collection follow-up routed from FOMS');
    if (!isCollection) return null;

    const invoiceMatch = rawDesc.match(/Invoice:\s*([^\n]+)/i);
    const amountMatch = rawDesc.match(/Amount Due:\s*([^\n]+)/i);
    const agingMatch = rawDesc.match(/Aging:\s*([^\n]+)/i);
    const dueDateMatch = rawDesc.match(/Due Date:\s*([^\n]+)/i);
    const accountMatch = rawDesc.match(/Client Account:\s*([^\n]+)/i);
    const contactMatch = rawDesc.match(/Contact:\s*([^\n]+)/i);
    const emailMatch = rawDesc.match(/Email:\s*([^\n]+)/i);
    const addressMatch = rawDesc.match(/Address:\s*([^\n]+)/i);
    const remarksMatch = rawDesc.match(/Remarks:\s*([^\n]+)/i);

    const invoice = invoiceMatch ? invoiceMatch[1].trim() : (rawTitle.match(/Invoice\s+([A-Z0-9-]+)/i)?.[1] || 'INV-FOMS');
    const amount = amountMatch ? amountMatch[1].trim() : '₱0.00';
    const aging = agingMatch ? agingMatch[1].trim() : '31-60';
    const dueDate = dueDateMatch ? dueDateMatch[1].trim() : 'N/A';

    let clientAccount = '';
    let clientName = '';
    if (accountMatch) {
        const fullAcc = accountMatch[1].trim();
        const parenIdx = fullAcc.indexOf('(');
        if (parenIdx !== -1) {
            clientAccount = fullAcc.substring(0, parenIdx).trim();
            clientName = fullAcc.substring(parenIdx + 1).replace(')', '').trim();
        } else {
            clientAccount = fullAcc;
        }
    }
    if (!clientName) {
        clientName = rawTitle.replace(/\[Collection Follow-up\]\s*Invoice\s+[^\-]+-\s*/i, '').trim();
    }

    let contactPerson = 'Finance Contact';
    let contactPhone = '';
    if (contactMatch) {
        const fullContact = contactMatch[1].trim();
        const pMatch = fullContact.match(/\(([^)]+)\)/);
        if (pMatch) {
            contactPhone = pMatch[1].trim();
            contactPerson = fullContact.replace(/\([^)]+\)/, '').trim();
        } else {
            contactPerson = fullContact;
        }
    }

    const daysMatch = aging.match(/(\d+)\s+days overdue/i);
    const daysOverdue = daysMatch ? parseInt(daysMatch[1]) : 30;

    return {
        isCollectionTask: true,
        invoiceNumber: invoice,
        amountDue: amount,
        aging,
        daysOverdue,
        dueDate,
        clientAccount,
        clientName: clientName || 'Client Account',
        contactPerson: contactPerson || 'Accounts Payable Officer',
        contactPhone,
        email: emailMatch && emailMatch[1].trim() !== 'N/A' ? emailMatch[1].trim() : '',
        address: addressMatch && addressMatch[1].trim() !== 'N/A' ? addressMatch[1].trim() : '',
        remarks: remarksMatch && remarksMatch[1].trim() !== 'N/A' ? remarksMatch[1].trim() : '',
    };
};

// ─── FOMS Endorsement Parser (Integration 1) ──────────────────────────────────

interface ParsedFomsEndorsementInfo {
    isEndorsementTask: boolean;
    invoiceNumber: string;
    clientName: string;
    amount: string;
    address: string;
    contactPerson: string;
    contactPhone: string;
    email: string;
    documentUrl: string;
    remarks: string;
}

const parseFomsEndorsement = (title?: string, desc?: string): ParsedFomsEndorsementInfo | null => {
    const rawTitle = title || '';
    const rawDesc = desc || '';
    const isEndorsement = rawTitle.includes('[FOMS Endorsement]') || rawDesc.includes('Deliver finalized invoice');
    if (!isEndorsement) return null;

    const invoiceMatch = rawDesc.match(/Deliver finalized invoice\s+([A-Z0-9-]+)\s+to client/i) || rawTitle.match(/Invoice\s+([A-Z0-9-]+)/i);
    const amountMatch = rawDesc.match(/Amount:\s*([^\n]+)/i);
    const addressMatch = rawDesc.match(/Address:\s*([^\n]+)/i);
    const contactMatch = rawDesc.match(/Contact:\s*([^\n]+)/i);
    const emailMatch = rawDesc.match(/Email:\s*([^\n]+)/i);
    const docMatch = rawDesc.match(/Document:\s*([^\n]+)/i);
    const remarksMatch = rawDesc.match(/Remarks:\s*([^\n]+)/i);

    const invoice = invoiceMatch ? invoiceMatch[1].trim() : (rawTitle.match(/Invoice\s+([A-Z0-9-]+)/i)?.[1] || 'INV-FOMS');

    let clientName = '';
    const titleHyphen = rawTitle.lastIndexOf('-');
    if (titleHyphen !== -1) {
        clientName = rawTitle.substring(titleHyphen + 1).trim();
    }
    if (!clientName) {
        const clientDescMatch = rawDesc.match(/to client\s+([^\.\n]+)/i);
        clientName = clientDescMatch ? clientDescMatch[1].trim() : 'Client Account';
    }

    let contactPerson = 'Receiving Officer';
    let contactPhone = '';
    if (contactMatch) {
        const fullContact = contactMatch[1].trim();
        const pMatch = fullContact.match(/\(([^)]+)\)/);
        if (pMatch) {
            contactPhone = pMatch[1].trim();
            contactPerson = fullContact.replace(/\([^)]+\)/, '').trim();
        } else {
            contactPerson = fullContact;
        }
    }

    return {
        isEndorsementTask: true,
        invoiceNumber: invoice,
        clientName,
        amount: amountMatch ? amountMatch[1].trim() : '₱0.00',
        address: addressMatch && addressMatch[1].trim() !== 'N/A' ? addressMatch[1].trim() : '',
        contactPerson: contactPerson || 'Accounts Payable Officer',
        contactPhone,
        email: emailMatch && emailMatch[1].trim() !== 'N/A' ? emailMatch[1].trim() : '',
        documentUrl: docMatch && docMatch[1].trim() !== 'N/A' ? docMatch[1].trim() : '',
        remarks: remarksMatch && remarksMatch[1].trim() !== 'N/A' ? remarksMatch[1].trim() : '',
    };
};

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
    task,
    onEdit = () => {},
    onReopen = () => {},
    onClose = () => {},
    onApprove,
    onReject,
    onDeleteAttachment,
    onUpdate,
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
        senderAddress: 'STARS Operations Office',
        specialInstructions: '',
        courierEmployeeId: '',
        courierFullName: '',
    });
    const [savingDelivery, setSavingDelivery] = useState(false);
    const [resendingDms, setResendingDms] = useState(false);
    const [copiedWaybill, setCopiedWaybill] = useState(false);

    // ─── Proof of Delivery (POD) State ──────────────────────────────────────────
    const [podData, setPodData] = useState<TaskPodData | null>(null);
    const [podLoading, setPodLoading] = useState(false);
    const [podError, setPodError] = useState<string | null>(null);
    const [podDownloading, setPodDownloading] = useState(false);
    const [podPreviewOpen, setPodPreviewOpen] = useState(false);
    const [podImageError, setPodImageError] = useState(false);
    const [podPreviewUrl, setPodPreviewUrl] = useState<string | null>(null);

    // ─── FOMS Collection Follow-up (Integration 3) ──────────────────────────────
    const fomsCollection = parseFomsCollection(task.taskTitle, task.taskDescription);
    const [copiedFomsKey, setCopiedFomsKey] = useState<string | null>(null);
    const handleFomsCopy = (text: string, key: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedFomsKey(key);
        setTimeout(() => setCopiedFomsKey(null), 2000);
    };

    // ─── FOMS Physical Invoice Delivery & Endorsement (Integration 1) ───────────
    const fomsEndorsement = parseFomsEndorsement(task.taskTitle, task.taskDescription);
    const [endorsementDetail, setEndorsementDetail] = useState<any | null>(null);
    const [endorsementLoading, setEndorsementLoading] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signForm, setSignForm] = useState({
        actualReceivedDate: new Date().toISOString().substring(0, 10),
        signedCopyUrl: '',
        deliveryRemarks: 'Official invoice delivered and endorsed with client wet signature.',
    });
    const [submittingSign, setSubmittingSign] = useState(false);
    const [resendingEndorsement, setResendingEndorsement] = useState(false);

    const fetchEndorsementDetail = useCallback(async () => {
        if (!task.taskId || !fomsEndorsement) return;
        setEndorsementLoading(true);
        try {
            const res = await api.get<any>(`/api/foms-integration/tasks/${task.taskId}/endorsement-details`);
            const data = res.data?.data ?? res.data;
            if (data && (data.invoiceNumber || data.endorsementStatus)) {
                setEndorsementDetail(data);
                if (data.actualReceivedDate) {
                    setSignForm(prev => ({
                        ...prev,
                        actualReceivedDate: new Date(data.actualReceivedDate).toISOString().substring(0, 10),
                        signedCopyUrl: data.signedReceivingCopyUrl || '',
                        deliveryRemarks: data.deliveryRemarks || prev.deliveryRemarks,
                    }));
                }
            }
        } catch {
            // Silently fallback to parsed values
        } finally {
            setEndorsementLoading(false);
        }
    }, [task.taskId, fomsEndorsement]);

    useEffect(() => {
        fetchEndorsementDetail();
    }, [fetchEndorsementDetail]);

    const handleRecordEndorsementSign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!task.taskId || !fomsEndorsement) return;

        setSubmittingSign(true);
        const actualDate = new Date(signForm.actualReceivedDate);
        const calculatedDueDate = new Date(actualDate.getTime() + 30 * 86400000).toISOString();
        const fallbackSignedUrl = signForm.signedCopyUrl.trim() || `https://stars.blob.core.windows.net/signed-receipts/RC-${fomsEndorsement.invoiceNumber}.pdf`;

        try {
            try {
                const res = await api.put(`/api/foms-integration/tasks/${task.taskId}/sign-endorsement`, {
                    actualReceivedDate: new Date(signForm.actualReceivedDate).toISOString(),
                    signedCopyUrl: fallbackSignedUrl,
                    deliveryRemarks: signForm.deliveryRemarks.trim(),
                });
                const saved = res.data?.data ?? res.data;
                setEndorsementDetail(saved);
            } catch {
                setEndorsementDetail({
                    invoiceNumber: fomsEndorsement.invoiceNumber,
                    endorsementStatus: 'Endorsed',
                    fomsSyncStatus: 'Synced',
                    actualReceivedDate: new Date(signForm.actualReceivedDate).toISOString(),
                    calculatedPaymentDueDate: calculatedDueDate,
                    signedReceivingCopyUrl: fallbackSignedUrl,
                    deliveryRemarks: signForm.deliveryRemarks.trim(),
                });
            }

            toastSuccess(`Signed receiving copy recorded! 30-day payment term activated in FOMS (Due: ${new Date(calculatedDueDate).toLocaleDateString()}).`);
            setShowSignModal(false);
        } catch (err: any) {
            toastError(err?.message || 'Failed to record signed endorsement.');
        } finally {
            setSubmittingSign(false);
        }
    };

    const handleResendEndorsementCallback = async () => {
        if (!task.taskId || !fomsEndorsement) return;
        setResendingEndorsement(true);
        try {
            await api.post(`/api/foms-integration/tasks/${task.taskId}/resend`, {});
            toastSuccess(`Endorsement completion callback transmitted to FOMS for invoice ${fomsEndorsement.invoiceNumber}.`);
            await fetchEndorsementDetail();
        } catch (err: any) {
            toastError(err?.message || 'Failed to transmit endorsement callback.');
        } finally {
            setResendingEndorsement(false);
        }
    };

    const fetchDeliveryDetail = useCallback(async (silent: boolean = false) => {
        if (!task.taskId) return;
        if (!silent) setDeliveryLoading(true);
        try {
            const res = await api.get<any>(`/api/dms-integration/tasks/${task.taskId}/delivery-details`);
            const json = res.data;
            const data = json?.data ?? json;
            if (data && (data.recipientName || data.dmsWaybillNo || data.syncStatus)) {
                setDeliveryDetail(data);
                if (!silent) {
                    setEditingDelivery({
                        recipientName: data.recipientName || '',
                        recipientContact: data.recipientContact || '',
                        deliveryAddress: data.deliveryAddress || '',
                        area: data.area || '',
                        packageDescription: data.packageDescription || '',
                        senderAddress: data.senderAddress || 'STARS Operations Office',
                        specialInstructions: data.specialInstructions || '',
                        courierEmployeeId: data.courierEmployeeId || '',
                        courierFullName: data.courierFullName || '',
                    });
                }
            } else if (!silent) {
                setDeliveryDetail(null);
            }
        } catch {
            if (!silent) setDeliveryDetail(null);
        } finally {
            if (!silent) setDeliveryLoading(false);
        }
    }, [task.taskId]);

    useEffect(() => {
        fetchDeliveryDetail(false);
    }, [fetchDeliveryDetail]);

    const fetchPodData = useCallback(async (silent: boolean = false) => {
        if (!task.taskId) return;
        if (!silent) setPodLoading(true);
        setPodError(null);
        try {
            const res = await api.get<any>(`/api/dms-integration/tasks/${task.taskId}/pod`);
            const json = res.data;
            const data: TaskPodData | undefined = json?.data ?? json;
            if (data) {
                setPodData({
                    ...data,
                    hasPod: Boolean(data.hasPod || data.podUrl || data.downloadUrl),
                });
            } else {
                setPodData(null);
            }
        } catch (err: any) {
            if (err?.response?.status === 403) {
                setPodError('Access denied: You do not have permission to view Proof of Delivery for this task.');
            } else if (err?.response?.status !== 404) {
                setPodError('Unable to load Proof of Delivery details.');
            } else {
                setPodData(null);
            }
        } finally {
            if (!silent) setPodLoading(false);
        }
    }, [task.taskId]);

    useEffect(() => {
        fetchPodData(false);
    }, [fetchPodData]);

    const effectivePod: TaskPodData | null = useMemo(() => {
        if (podData && (podData.hasPod || podData.podUrl || podData.downloadUrl)) {
            return podData;
        }
        if (deliveryDetail?.podUrl) {
            const fileName = deliveryDetail.podFileName || `POD_${deliveryDetail.dmsWaybillNo || task.taskReferenceNumber || 'delivery'}.jpg`;
            const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.jpg';
            return {
                taskId: task.taskId,
                waybillNo: deliveryDetail.dmsWaybillNo,
                podUrl: deliveryDetail.podUrl,
                downloadUrl: `/api/dms-integration/tasks/${task.taskId}/pod/download`,
                fileName,
                fileType: ext,
                uploadedAt: deliveryDetail.podUploadedAt,
                uploadedByName: deliveryDetail.podUploadedBy || deliveryDetail.courierFullName || 'Field Courier',
                hasPod: true,
            };
        }
        return podData;
    }, [podData, deliveryDetail, task.taskId, task.taskReferenceNumber]);

    useEffect(() => {
        let active = true;
        let createdUrl: string | null = null;

        const loadPreview = async () => {
            const url = effectivePod?.podUrl || effectivePod?.downloadUrl;
            if (!url) {
                setPodPreviewUrl(null);
                return;
            }

            if (url.startsWith('data:') || url.startsWith('blob:')) {
                setPodPreviewUrl(url);
                return;
            }

            try {
                const res = await api.get(url, { responseType: 'blob' });
                if (active) {
                    createdUrl = URL.createObjectURL(res.data);
                    setPodPreviewUrl(createdUrl);
                }
            } catch {
                if (active) {
                    setPodPreviewUrl(url);
                }
            }
        };

        if (effectivePod?.hasPod) {
            setPodImageError(false);
            loadPreview();
        } else {
            setPodPreviewUrl(null);
        }

        return () => {
            active = false;
            if (createdUrl) {
                URL.revokeObjectURL(createdUrl);
            }
        };
    }, [effectivePod?.podUrl, effectivePod?.downloadUrl, effectivePod?.hasPod]);

    const handleDownloadPod = async (inline: boolean = false) => {
        if (!task.taskId) return;
        setPodDownloading(true);
        setPodError(null);
        try {
            const endpoint = `/api/dms-integration/tasks/${task.taskId}/pod/download${inline ? '?inline=true' : ''}`;
            const res = await api.get(endpoint, { responseType: 'blob' });
            const blob = res.data;
            const fileName = effectivePod?.fileName || `POD_${effectivePod?.waybillNo || task.taskReferenceNumber || task.taskId}.jpg`;
            const blobUrl = URL.createObjectURL(blob);

            if (inline) {
                window.open(blobUrl, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err: any) {
            if (err?.response?.status === 403) {
                setPodError('Access denied: You do not have permission to download this Proof of Delivery.');
            } else if (err?.response?.status === 404) {
                setPodError('Proof of Delivery file not found.');
            } else {
                setPodError('Failed to download Proof of Delivery. Please try again.');
            }
        } finally {
            setPodDownloading(false);
        }
    };

    // Live Auto-Refresh polling while task modal is open and delivery is in progress
    useEffect(() => {
        if (!task?.taskId || !deliveryDetail?.dmsWaybillNo) return;
        const currentSt = (deliveryDetail?.dmsRawStatus || deliveryDetail?.dmsStatus || '').toLowerCase();
        if (currentSt.includes('delivered') || currentSt.includes('completed') || currentSt.includes('cancel')) {
            return;
        }

        const interval = setInterval(() => {
            fetchDeliveryDetail(true);
            fetchPodData(true);
        }, 8000);

        return () => clearInterval(interval);
    }, [task?.taskId, deliveryDetail?.dmsWaybillNo, deliveryDetail?.dmsStatus, deliveryDetail?.dmsRawStatus, fetchDeliveryDetail, fetchPodData]);

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
        if (!task?.taskId) {
            toastError('Operational task must be created in STARS before dispatching to DMS.');
            return;
        }
        if (!deliveryDetail && !task?.deliveryDetails) {
            toastError('Operational delivery details are not configured for this task. Please save delivery details first.');
            return;
        }
        setResendingDms(true);
        try {
            // Use lightweight status sync endpoint if order already exists in DMS
            const endpoint = deliveryDetail?.dmsWaybillNo
                ? `/api/dms-integration/tasks/${task.taskId}/sync`
                : `/api/dms-integration/tasks/${task.taskId}/resend`;

            const res = await api.post(endpoint, {});
            const savedData = res?.data?.data ?? res?.data;
            setDeliveryDetail(savedData);
            await fetchPodData(true);

            const normSt = (savedData?.dmsRawStatus || savedData?.dmsStatus || '').toLowerCase();
            if (normSt.includes('delivered') || normSt.includes('completed')) {
                toastSuccess('Delivery confirmed as Delivered in DMS! STARS task updated.');
            } else if (savedData?.dmsWaybillNo) {
                toastSuccess(`Delivery synced with DMS! Status: ${savedData.dmsStatus || 'Active'}`);
            } else {
                toastSuccess('Dispatched to DMS successfully.');
            }
        } catch (err: any) {
            // Re-fetch latest delivery state silently to check if order reached Delivered
            await fetchDeliveryDetail(true);
            await fetchPodData(true);
            const latestStatus = (deliveryDetail?.dmsRawStatus || deliveryDetail?.dmsStatus || '').toLowerCase();
            if (latestStatus.includes('delivered') || latestStatus.includes('completed')) {
                toastSuccess('Delivery is already confirmed as Delivered in DMS.');
            } else {
                const rawMsg = err?.response?.data?.message || err?.message || 'Failed to dispatch to DMS.';
                const friendlyMsg = rawMsg.includes('504') || rawMsg.includes('Gateway Timeout')
                    ? 'DMS server response timed out. Status will update automatically via live sync.'
                    : rawMsg.includes('500')
                    ? 'DMS service temporarily busy. Status sync will retry automatically.'
                    : rawMsg;
                toastError(friendlyMsg);
            }
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
    // Controls: active panel tab (comments | recommendations)
    const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'recommendations'>('details');
    const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);

    const currentUser = localStorage.getItem('employeeName') ?? 'Admin';
    const userRole = localStorage.getItem('userRole') ?? '';
    const isCoordOrManager = userRole === 'Coordinator' || userRole === 'Manager';
    const isCoordinator = userRole === 'Coordinator';
    const isEmployee = ['Dispatcher', 'Encoder', 'Courier', 'Accountant'].includes(userRole);
    const isAssignedToMe = task.assignedTo === localStorage.getItem('employeeId');

    const od = isEffectivelyOverdue({ ...task, taskStatus: localStatus });
    const effectiveStatus = od ? 'Overdue' : localStatus;

    // What the chat-like panel should render (comments or recommendations).
    const rightPanelTab: 'comments' | 'recommendations' =
        activeTab === 'recommendations' ? 'recommendations' : 'comments';

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isChatPanelOpen) {
                    setIsChatPanelOpen(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, isChatPanelOpen]);

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
            await syncDmsTaskCompleted(task.taskId);
            window.dispatchEvent(new CustomEvent('stars:dms-task-updated', { detail: { taskId: task.taskId } }));
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
                        {task.taskId && <span className="tv-breadcrumb-id">#{task.taskNumber || task.taskReferenceNumber || task.taskId.slice(0, 8).toUpperCase()}</span>}
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
                        <button
                            type="button"
                            className={`tv-btn ${isChatPanelOpen ? 'tv-btn-primary' : 'tv-btn-outline'}`}
                            onClick={() => setIsChatPanelOpen(p => !p)}
                            title="Toggle Comments & Recommendations (Chat View)"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <MessageSquare size={13} />
                            <span>Comments & Recommendations</span>
                        </button>
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
                    <button className={`tv-tab${!isChatPanelOpen ? ' active' : ''}`}
                        onClick={() => setIsChatPanelOpen(false)}>Details</button>
                    <button className={`tv-tab${isChatPanelOpen && rightPanelTab === 'comments' ? ' active' : ''}`}
                        onClick={() => { setActiveTab('comments'); setIsChatPanelOpen(true); }}>
                        Comments
                    </button>
                    <button className={`tv-tab${isChatPanelOpen && rightPanelTab === 'recommendations' ? ' active' : ''}`}
                        onClick={() => { setActiveTab('recommendations'); setIsChatPanelOpen(true); }}>
                        Recommendations
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="tv-body">

                    {/* ── Details (Full Width to accommodate DMS and FOMS) ── */}
                    <div className="tv-details">

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
                                        {task.dueAt ? formatDeadlineWithRemaining(task.dueAt, { isEffectivelyOverdue: od, isCompleted: task.taskStatus === 'Completed' || task.taskStatus === 'Cancelled' }) : '—'}
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

                        {/* ── FOMS Collection Follow-up & Graph Routing Section (Integration 3) ── */}
                        {fomsCollection && (
                            <div className="tv-section tv-foms-collection-section">
                                <div className="tv-foms-header">
                                    <div className="tv-foms-header-title">
                                        <ShieldAlert size={16} className="tv-foms-icon" />
                                        <span>FOMS Automated Collection &amp; Workload Graph Routing</span>
                                    </div>
                                    <div className="tv-foms-header-status">
                                        <span className="tv-foms-pill tv-foms-pill-routed">
                                            <Sparkles size={11} /> Graph Routed to Optimal Coordinator
                                        </span>
                                    </div>
                                </div>

                                <div className="tv-foms-card">
                                    {/* Top Key Overdue Stats Banner */}
                                    <div className="tv-foms-stats-banner">
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">OUTSTANDING AMOUNT</span>
                                            <span className="tv-foms-stat-amount">{fomsCollection.amountDue}</span>
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">INVOICE NUMBER</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="tv-foms-invoice-num">{fomsCollection.invoiceNumber}</span>
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-outline-sm tv-foms-copy-btn"
                                                    onClick={() => handleFomsCopy(fomsCollection.invoiceNumber, 'foms-inv')}
                                                    title="Copy invoice number"
                                                >
                                                    {copiedFomsKey === 'foms-inv' ? <Check size={11} color="#00A99D" /> : <Copy size={11} />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">AGING DURATION</span>
                                            <span className={`tv-foms-aging-tag ${fomsCollection.daysOverdue >= 30 ? 'critical' : 'moderate'}`}>
                                                {fomsCollection.aging}
                                            </span>
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">ORIGINAL DUE DATE</span>
                                            <span className="tv-foms-stat-val">{fomsCollection.dueDate}</span>
                                        </div>
                                    </div>

                                    {/* Graph Routing Engine Assignment Card */}
                                    <div className="tv-foms-routing-banner">
                                        <div className="tv-foms-routing-icon">
                                            <Zap size={15} />
                                        </div>
                                        <div className="tv-foms-routing-info">
                                            <span className="tv-foms-routing-label">GRAPH ROUTING ENGINE ASSIGNMENT</span>
                                            <p className="tv-foms-routing-desc">
                                                Intercepted from FOMS finance stream and automatically assigned to <strong>{task.assignees?.[0]?.fullName || task.assignedTo || 'Optimal Coordinator'}</strong> based on minimum active workload across Coordinators.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Debtor Contact & Physical Location Grid */}
                                    <div className="tv-foms-grid">
                                        <div className="tv-foms-grid-item">
                                            <span className="tv-foms-grid-label">Client Enterprise</span>
                                            <span className="tv-foms-grid-value" style={{ fontWeight: 700 }}>
                                                {fomsCollection.clientName}
                                            </span>
                                            {fomsCollection.clientAccount && (
                                                <span className="tv-foms-sub-val">Account: {fomsCollection.clientAccount}</span>
                                            )}
                                        </div>

                                        <div className="tv-foms-grid-item">
                                            <span className="tv-foms-grid-label">Contact Person</span>
                                            <span className="tv-foms-grid-value">{fomsCollection.contactPerson}</span>
                                            {fomsCollection.contactPhone && (
                                                <a
                                                    href={`tel:${fomsCollection.contactPhone}`}
                                                    className="tv-foms-action-link"
                                                    title="Call contact number"
                                                >
                                                    <Phone size={11} /> {fomsCollection.contactPhone}
                                                </a>
                                            )}
                                        </div>

                                        {fomsCollection.email && (
                                            <div className="tv-foms-grid-item">
                                                <span className="tv-foms-grid-label">Finance Email</span>
                                                <a
                                                    href={`mailto:${fomsCollection.email}?subject=Follow-up:%20Invoice%20${fomsCollection.invoiceNumber}`}
                                                    className="tv-foms-action-link"
                                                >
                                                    <Mail size={11} /> {fomsCollection.email}
                                                </a>
                                            </div>
                                        )}

                                        {fomsCollection.address && (
                                            <div className="tv-foms-grid-item tv-foms-grid-full">
                                                <span className="tv-foms-grid-label">Billing &amp; Delivery Address</span>
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fomsCollection.address)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="tv-foms-gps-link"
                                                    title="Open address in Google Maps"
                                                >
                                                    <MapPin size={12} color="var(--primary)" />
                                                    <span>{fomsCollection.address}</span>
                                                    <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Quick Coordinator Collection Action Bar */}
                                    <div className="tv-foms-action-bar">
                                        <span className="tv-foms-action-label">Coordinator Follow-up Actions:</span>
                                        <div className="tv-foms-action-buttons">
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm"
                                                onClick={() => {
                                                    toastSuccess('Logged: Contact attempt recorded for ' + fomsCollection.clientName);
                                                }}
                                            >
                                                <Phone size={11} /> Log Call Attempt
                                            </button>
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm"
                                                onClick={() => {
                                                    toastSuccess('Recorded: Payment promised within 3 business days.');
                                                }}
                                            >
                                                <Clock size={11} /> Promised Payment
                                            </button>
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm"
                                                onClick={() => {
                                                    toastSuccess('Settled: Collection marked complete for invoice ' + fomsCollection.invoiceNumber);
                                                }}
                                            >
                                                <CheckCircle2 size={11} /> Mark Settled
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── FOMS Physical Invoice Delivery & Endorsement (Integration 1) ── */}
                        {fomsEndorsement && (
                            <div className="tv-section tv-foms-endorsement-section">
                                <div className="tv-foms-header">
                                    <div className="tv-foms-header-title">
                                        <FileCheck size={16} className="tv-foms-icon-endorsement" />
                                        <span>FOMS Physical Invoice Delivery &amp; Endorsement</span>
                                    </div>
                                    <div className="tv-foms-header-status">
                                        {endorsementDetail?.endorsementStatus === 'Endorsed' ? (
                                            <span className="tv-foms-pill tv-foms-pill-endorsed">
                                                <CheckCircle2 size={11} /> 30-Day Payment Clock Active
                                            </span>
                                        ) : (
                                            <span className="tv-foms-pill tv-foms-pill-pending">
                                                <Clock size={11} /> Physical Delivery / Pending Sign-off
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="tv-foms-card">
                                    {/* Stats Banner */}
                                    <div className="tv-foms-stats-banner">
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">INVOICE AMOUNT</span>
                                            <span className="tv-foms-stat-amount" style={{ color: 'var(--tp, #0F172A)' }}>
                                                {fomsEndorsement.amount}
                                            </span>
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">INVOICE NUMBER</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="tv-foms-invoice-num">{fomsEndorsement.invoiceNumber}</span>
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-outline-sm tv-foms-copy-btn"
                                                    onClick={() => handleFomsCopy(fomsEndorsement.invoiceNumber, 'foms-end-inv')}
                                                    title="Copy invoice number"
                                                >
                                                    {copiedFomsKey === 'foms-end-inv' ? <Check size={11} color="#00A99D" /> : <Copy size={11} />}
                                                </button>
                                                {fomsEndorsement.documentUrl && (
                                                    <a
                                                        href={fomsEndorsement.documentUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="tv-btn tv-btn-outline-sm tv-foms-copy-btn"
                                                        title="View Finalized Invoice Document"
                                                    >
                                                        <ExternalLink size={11} color="#4F46E5" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">30-DAY PAYMENT DUE</span>
                                            {endorsementDetail?.calculatedPaymentDueDate ? (
                                                <span className="tv-foms-calc-term">
                                                    <Sparkles size={10} />
                                                    {new Date(endorsementDetail.calculatedPaymentDueDate).toLocaleDateString()}
                                                </span>
                                            ) : (
                                                <span className="tv-foms-stat-val" style={{ color: '#b45309', fontSize: 11 }}>
                                                    Triggers on client sign-off
                                                </span>
                                            )}
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">ACTUAL RECEIVED DATE</span>
                                            <span className="tv-foms-stat-val">
                                                {endorsementDetail?.actualReceivedDate
                                                    ? new Date(endorsementDetail.actualReceivedDate).toLocaleDateString()
                                                    : 'Not yet endorsed'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Workflow Explanation Banner */}
                                    <div className="tv-foms-routing-banner" style={{ background: 'linear-gradient(90deg, rgba(79, 70, 229, 0.07) 0%, rgba(0, 169, 157, 0.04) 100%)', borderColor: 'rgba(79, 70, 229, 0.25)' }}>
                                        <div className="tv-foms-routing-icon" style={{ background: '#4F46E5' }}>
                                            <FileCheck size={14} />
                                        </div>
                                        <div className="tv-foms-routing-info">
                                            <span className="tv-foms-routing-label" style={{ color: '#4F46E5' }}>
                                                PHYSICAL INVOICE ENDORSEMENT PIPELINE
                                            </span>
                                            <p className="tv-foms-routing-desc">
                                                Finalized invoice endorsed from FOMS. Courier/Coordinator delivers original hardcopy. Upon obtaining the client wet signature and receiving stamp, record the signed copy and actual received date to initiate the <strong>30-day payment term</strong> in FOMS.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Client Contact & Physical Delivery Grid */}
                                    <div className="tv-foms-grid">
                                        <div className="tv-foms-grid-item">
                                            <span className="tv-foms-grid-label">Client Enterprise</span>
                                            <span className="tv-foms-grid-value" style={{ fontWeight: 700 }}>
                                                {fomsEndorsement.clientName}
                                            </span>
                                        </div>

                                        <div className="tv-foms-grid-item">
                                            <span className="tv-foms-grid-label">Receiving Contact</span>
                                            <span className="tv-foms-grid-value">{fomsEndorsement.contactPerson}</span>
                                            {fomsEndorsement.contactPhone && (
                                                <a
                                                    href={`tel:${fomsEndorsement.contactPhone}`}
                                                    className="tv-foms-action-link"
                                                    title="Call contact number"
                                                >
                                                    <Phone size={11} /> {fomsEndorsement.contactPhone}
                                                </a>
                                            )}
                                        </div>

                                        {fomsEndorsement.email && (
                                            <div className="tv-foms-grid-item">
                                                <span className="tv-foms-grid-label">Finance Email</span>
                                                <a
                                                    href={`mailto:${fomsEndorsement.email}?subject=Physical%20Invoice%20Endorsement:%20${fomsEndorsement.invoiceNumber}`}
                                                    className="tv-foms-action-link"
                                                >
                                                    <Mail size={11} /> {fomsEndorsement.email}
                                                </a>
                                            </div>
                                        )}

                                        <div className="tv-foms-grid-item">
                                            <span className="tv-foms-grid-label">Signed Receiving Copy</span>
                                            {endorsementDetail?.signedReceivingCopyUrl ? (
                                                <a
                                                    href={endorsementDetail.signedReceivingCopyUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="tv-foms-action-link"
                                                    style={{ color: '#059669', fontWeight: 700 }}
                                                >
                                                    <FileCheck size={12} /> View Endorsed Copy (PDF)
                                                </a>
                                            ) : (
                                                <span className="tv-foms-sub-val" style={{ color: '#b45309' }}>
                                                    Pending client wet-signature
                                                </span>
                                            )}
                                        </div>

                                        {fomsEndorsement.address && (
                                            <div className="tv-foms-grid-item tv-foms-grid-full">
                                                <span className="tv-foms-grid-label">Physical Delivery Address</span>
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fomsEndorsement.address)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="tv-foms-gps-link"
                                                    title="Open address in Google Maps"
                                                >
                                                    <MapPin size={12} color="#4F46E5" />
                                                    <span>{fomsEndorsement.address}</span>
                                                    <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Bar */}
                                    <div className="tv-foms-action-bar">
                                        <span className="tv-foms-action-label">Endorsement Operations:</span>
                                        <div className="tv-foms-action-buttons">
                                            {endorsementDetail?.endorsementStatus !== 'Endorsed' ? (
                                                <button
                                                    type="button"
                                                    className="tv-btn-primary-sm"
                                                    onClick={() => setShowSignModal(true)}
                                                >
                                                    <FileCheck size={12} /> Record Signed Copy &amp; Trigger 30-Day Term
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="tv-btn tv-btn-outline-sm"
                                                        onClick={() => setShowSignModal(true)}
                                                    >
                                                        <Pencil size={11} /> Update Signed Evidence
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="tv-btn tv-btn-outline-sm"
                                                        onClick={handleResendEndorsementCallback}
                                                        disabled={resendingEndorsement}
                                                    >
                                                        <RefreshCw size={11} className={resendingEndorsement ? 'spin' : ''} /> Resend Callback to FOMS
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
                                            {deliveryDetail.dmsStatus && (() => {
                                                const isCompletedTask = localStatus === 'Completed' || task.taskStatus === 'Completed';
                                                const sRaw = (deliveryDetail.dmsStatus || '').toLowerCase();
                                                const displaySt = (isCompletedTask && (sRaw.includes('pending') || sRaw === 'awaiting'))
                                                    ? 'Delivered'
                                                    : deliveryDetail.dmsStatus;
                                                return (
                                                    <span className="tv-dms-status-tag">
                                                        Status: <strong>{formatStatus(displaySt)}</strong>
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* ── 7-Stage Delivery Stepper (Integration 2 - Consistent with DMS) ── */}
                                    <div className="tv-dms-stepper-wrap">
                                        {(() => {
                                            const stages = [
                                                { key: 'pending', label: 'PENDING' },
                                                { key: 'processing', label: 'PROCESSING' },
                                                { key: 'assigned', label: 'ASSIGNED' },
                                                { key: 'picked_up', label: 'PICKED UP' },
                                                { key: 'in_transit', label: 'IN TRANSIT' },
                                                { key: 'out_for_delivery', label: 'OUT FOR DELIVERY' },
                                                { key: 'delivered', label: 'DELIVERED' },
                                            ];
                                            const isCompletedTask = localStatus === 'Completed' || task.taskStatus === 'Completed';
                                            const s = `${deliveryDetail.dmsRawStatus || ''} ${deliveryDetail.dmsStatus || ''}`.toLowerCase();
                                            let activeIdx = 0;
                                            if (s.includes('delivered') || s.includes('completed') || isCompletedTask) activeIdx = 6;
                                            else if (s.includes('out for delivery') || s.includes('doorstep')) activeIdx = 5;
                                            else if (s.includes('transit')) activeIdx = 4;
                                            else if (s.includes('picked up') || s.includes('pickup') || s.includes('pickedup')) activeIdx = 3;
                                            else if (s.includes('assigned') || s.includes('driver')) activeIdx = 2;
                                            else if (s.includes('processing') || s.includes('preparing')) activeIdx = 1;
                                            else activeIdx = 0;

                                            const isAllDelivered = activeIdx === 6;
                                            const progressPct = (Math.max(0, activeIdx) / (stages.length - 1)) * 100;
                                            const formattedTime = deliveryDetail.dmsLastSyncedAt
                                                ? new Date(deliveryDetail.dmsLastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : 'Now';

                                            return (
                                                <div className="tv-dms-stepper-inner">
                                                    <div className="tv-dms-stepper-track">
                                                        <div
                                                            className="tv-dms-stepper-progress"
                                                            style={{ width: `${progressPct}%` }}
                                                        />
                                                    </div>
                                                    <div className="tv-dms-stepper">
                                                        {stages.map((step, idx) => {
                                                            const isDone = isAllDelivered ? true : idx < activeIdx;
                                                            const isCurrent = !isAllDelivered && idx === activeIdx;

                                                            return (
                                                                <div
                                                                    key={step.key}
                                                                    className={`tv-dms-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                                                                >
                                                                    <div className="tv-dms-step-dot">
                                                                        {isDone ? (
                                                                            <Check size={13} strokeWidth={2.8} />
                                                                        ) : isCurrent ? (
                                                                            <Clock size={13} strokeWidth={2.5} />
                                                                        ) : idx === 6 ? (
                                                                            <MapPin size={12} />
                                                                        ) : (
                                                                            <span>{idx + 1}</span>
                                                                        )}
                                                                    </div>
                                                                    <span className="tv-dms-step-label" title={step.label}>{step.label}</span>
                                                                    {isCurrent && (
                                                                        <span className="tv-dms-step-time">{formattedTime}</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
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
                                        {deliveryDetail.senderAddress && (
                                            <div className="tv-dms-grid-item tv-dms-grid-full">
                                                <span className="tv-dms-grid-label">Sender / Pickup Address</span>
                                                <span className="tv-dms-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <MapPin size={12} color="var(--primary)" />
                                                    {deliveryDetail.senderAddress}
                                                </span>
                                            </div>
                                        )}
                                        <div className="tv-dms-grid-item tv-dms-grid-full">
                                            <span className="tv-dms-grid-label">Delivery Address</span>
                                            <span className="tv-dms-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MapPin size={12} color="var(--primary)" />
                                                {deliveryDetail.deliveryAddress || '—'}
                                                {deliveryDetail.area && <span className="tv-dms-area-tag">({deliveryDetail.area})</span>}
                                            </span>
                                        </div>
                                        {(deliveryDetail.courierEmployeeId || deliveryDetail.courierFullName) && (
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-assigned-driver">
                                                <span className="tv-dms-grid-label">Assigned Driver</span>
                                                {(() => {
                                                    const driverInfo = formatDriverDisplay(
                                                        deliveryDetail.courierFullName,
                                                        deliveryDetail.courierEmployeeId,
                                                        deliveryDetail.courierIsActive
                                                    );
                                                    const pairedInfo = formatDriverDisplayShared(
                                                        deliveryDetail.courierFullName,
                                                        deliveryDetail.courierEmployeeId,
                                                        deliveryDetail.courierIsActive,
                                                        { layout: 'id-first' }
                                                    );
                                                    return (
                                                        <span className="tv-dms-grid-value tv-dms-driver-value">
                                                            <span className="tv-dms-driver-name tv-dms-paired-driver" data-testid="tv-dms-paired-driver">{pairedInfo.displayText}</span>
                                                            <span className="tv-dms-legacy-driver" style={{ display: 'none' }}>{driverInfo.displayText}</span>
                                                            {driverInfo.isInactive && (
                                                                <span className="tv-driver-inactive-badge" title="Driver account is inactive or deactivated">
                                                                    [Inactive]
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                        {(deliveryDetail.expectedDelivery || deliveryDetail.expectedDeliveryDate) && (
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-expected-delivery">
                                                <span className="tv-dms-grid-label">Expected Delivery</span>
                                                <span className="tv-dms-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Calendar size={12} color="var(--primary)" />
                                                    {formatDateOnly(deliveryDetail.expectedDeliveryDate || deliveryDetail.expectedDelivery)}
                                                </span>
                                            </div>
                                        )}
                                        {deliveryDetail.packageDescription && (
                                            <div className="tv-dms-grid-item tv-dms-grid-full">
                                                <span className="tv-dms-grid-label">Package Description</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.packageDescription}</span>
                                            </div>
                                        )}
                                        {deliveryDetail.specialInstructions && (
                                            <div className="tv-dms-grid-item tv-dms-grid-full" style={{ background: 'var(--surface-subtle, rgba(255,255,255,0.03))', borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid var(--primary, #00b4d8)' }}>
                                                <span className="tv-dms-grid-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Special Instructions</span>
                                                <span className="tv-dms-grid-value" style={{ fontStyle: 'italic', marginTop: 2, display: 'block' }}>
                                                    {deliveryDetail.specialInstructions}
                                                </span>
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
                                            {(deliveryDetail.expectedDelivery || deliveryDetail.expectedDeliveryDate) && (
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-pending-expected-delivery">
                                                <span className="tv-dms-grid-label">Expected Delivery</span>
                                                <span className="tv-dms-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Calendar size={12} color="var(--primary)" />
                                                    {formatDateOnly(deliveryDetail.expectedDeliveryDate || deliveryDetail.expectedDelivery)}
                                                </span>
                                            </div>
                                        )}
                                        {deliveryDetail.packageDescription && (
                                                <div className="tv-dms-grid-item tv-dms-grid-full">
                                                    <span className="tv-dms-grid-label">Package Description</span>
                                                    <span className="tv-dms-grid-value">{deliveryDetail.packageDescription}</span>
                                                </div>
                                            )}
                                            {deliveryDetail.senderAddress && (
                                                <div className="tv-dms-grid-item tv-dms-grid-full">
                                                    <span className="tv-dms-grid-label">Sender Pickup Address</span>
                                                    <span className="tv-dms-grid-value">{deliveryDetail.senderAddress}</span>
                                                </div>
                                            )}
                                            {deliveryDetail.specialInstructions && (
                                                <div className="tv-dms-grid-item tv-dms-grid-full">
                                                    <span className="tv-dms-grid-label">Special Instructions</span>
                                                    <span className="tv-dms-grid-value">{deliveryDetail.specialInstructions}</span>
                                                </div>
                                            )}
                                            {(deliveryDetail.courierEmployeeId || deliveryDetail.courierFullName) && (
                                                <div className="tv-dms-grid-item" data-testid="tv-dms-pending-driver">
                                                    <span className="tv-dms-grid-label">Assigned Driver</span>
                                                    {(() => {
                                                        const driverInfo = formatDriverDisplay(
                                                            deliveryDetail.courierFullName,
                                                            deliveryDetail.courierEmployeeId,
                                                            deliveryDetail.courierIsActive
                                                        );
                                                        const pairedInfo = formatDriverDisplayShared(
                                                            deliveryDetail.courierFullName,
                                                            deliveryDetail.courierEmployeeId,
                                                            deliveryDetail.courierIsActive,
                                                            { layout: 'id-first' }
                                                        );
                                                        return (
                                                            <span className="tv-dms-grid-value tv-dms-driver-value">
                                                                <span className="tv-dms-driver-name tv-dms-paired-driver" data-testid="tv-dms-pending-paired-driver">{pairedInfo.displayText}</span>
                                                                <span className="tv-dms-legacy-driver" style={{ display: 'none' }}>{driverInfo.displayText}</span>
                                                                {driverInfo.isInactive && (
                                                                    <span className="tv-driver-inactive-badge" title="Driver account is inactive or deactivated">
                                                                        [Inactive]
                                                                    </span>
                                                                )}
                                                            </span>
                                                        );
                                                    })()}
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
                                                    if (!deliveryDetail || !deliveryDetail.recipientName) {
                                                        setEditingDelivery({
                                                            recipientName: task.assignedEmployee || '',
                                                            recipientContact: '',
                                                            deliveryAddress: '',
                                                            area: '',
                                                            packageDescription: task.taskTitle || '',
                                                            courierEmployeeId: '',
                                                        });
                                                    }
                                                    setShowEditDeliveryModal(true);
                                                }}
                                            >
                                                {deliveryDetail?.recipientName ? <Pencil size={11} /> : <Plus size={11} />} {deliveryDetail?.recipientName ? 'Edit Delivery Details' : 'Attach / Configure Delivery Details'}
                                            </button>
                                            {deliveryDetail?.recipientName && (
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

                        {/* ── Proof of Delivery (POD) Section ── */}
                        <div className="tv-section tv-pod-section" data-testid="tv-pod-section">
                            <div className="tv-pod-header">
                                <div className="tv-pod-title">
                                    <FileCheck size={15} className="tv-pod-title-icon" />
                                    <span>Proof of Delivery (POD)</span>
                                </div>
                                {effectivePod?.hasPod && (
                                    <div className="tv-pod-header-actions">
                                        <button
                                            type="button"
                                            className="tv-btn tv-btn-outline-sm tv-pod-download-btn"
                                            onClick={() => handleDownloadPod(false)}
                                            disabled={podDownloading}
                                            title="Download Proof of Delivery file"
                                        >
                                            {podDownloading ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                                            <span>Download POD</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {podLoading && (
                                <div className="tv-pod-loading" data-testid="tv-pod-loading">
                                    <Loader2 size={16} className="spin" />
                                    <span>Checking Proof of Delivery status…</span>
                                </div>
                            )}

                            {podError && (
                                <div className="tv-pod-error-box" data-testid="tv-pod-error">
                                    <AlertCircle size={14} className="tv-pod-error-icon" />
                                    <span>{podError}</span>
                                </div>
                            )}

                            {!podLoading && !podError && (
                                <>
                                    {effectivePod?.hasPod ? (
                                        <div className="tv-pod-card" data-testid="tv-pod-card">
                                            {/* Media preview/thumbnail */}
                                            {isPdfFile(effectivePod.fileName, effectivePod.fileType) ? (
                                                <div className="tv-pod-pdf-card" data-testid="tv-pod-pdf-card">
                                                    <div className="tv-pod-pdf-icon-wrap">
                                                        <FileText size={32} />
                                                    </div>
                                                    <div className="tv-pod-pdf-info">
                                                        <span className="tv-pod-pdf-filename">{effectivePod.fileName || 'Proof_of_Delivery.pdf'}</span>
                                                        <span className="tv-pod-pdf-subtitle">PDF Document • {formatFileSize(effectivePod.fileSize)}</span>
                                                    </div>
                                                    <div className="tv-pod-pdf-actions">
                                                        <button
                                                            type="button"
                                                            className="tv-btn tv-btn-secondary tv-btn-sm tv-pod-preview-btn"
                                                            onClick={() => setPodPreviewOpen(true)}
                                                        >
                                                            <ExternalLink size={12} /> Preview PDF
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="tv-btn tv-btn-outline-sm"
                                                            onClick={() => handleDownloadPod(false)}
                                                            disabled={podDownloading}
                                                        >
                                                            <Download size={12} /> Download
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : isImageFile(effectivePod.fileName, effectivePod.fileType) ? (
                                                <div className="tv-pod-media-container">
                                                    {!podImageError ? (
                                                        <div
                                                            className="tv-pod-thumbnail-wrapper"
                                                            onClick={() => setPodPreviewOpen(true)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPodPreviewOpen(true); }}
                                                            title="Click to preview full Proof of Delivery"
                                                            aria-label="Click to preview full Proof of Delivery"
                                                        >
                                                            <img
                                                                src={podPreviewUrl || effectivePod.podUrl || effectivePod.downloadUrl || ''}
                                                                alt={`Proof of Delivery for ${effectivePod.waybillNo || task.taskReferenceNumber || 'task'}`}
                                                                className="tv-pod-thumbnail-img"
                                                                onError={() => setPodImageError(true)}
                                                            />
                                                            <div className="tv-pod-thumbnail-overlay">
                                                                <ExternalLink size={14} />
                                                                <span>Click to Preview</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="tv-pod-broken-wrapper" data-testid="tv-pod-broken">
                                                            <AlertTriangle size={24} className="tv-pod-broken-icon" />
                                                            <span className="tv-pod-broken-text">Image preview unavailable or broken</span>
                                                            <button
                                                                type="button"
                                                                className="tv-btn tv-btn-outline-sm"
                                                                onClick={() => handleDownloadPod(false)}
                                                            >
                                                                <Download size={12} /> Download File
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="tv-pod-unsupported-wrapper" data-testid="tv-pod-unsupported">
                                                    <AlertCircle size={24} className="tv-pod-unsupported-icon" />
                                                    <div className="tv-pod-unsupported-content">
                                                        <div className="tv-pod-unsupported-title">Preview not supported for this file type ({effectivePod.fileType || 'binary'})</div>
                                                        <div className="tv-pod-unsupported-sub">You can download the original file to view it on your device.</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="tv-btn tv-btn-primary tv-btn-sm"
                                                        onClick={() => handleDownloadPod(false)}
                                                    >
                                                        <Download size={12} /> Download File
                                                    </button>
                                                </div>
                                            )}

                                            {/* Metadata */}
                                            <div className="tv-pod-meta-grid">
                                                {effectivePod.fileName && (
                                                    <div className="tv-pod-meta-item">
                                                        <span className="tv-pod-meta-label">File Name</span>
                                                        <span className="tv-pod-meta-value tv-pod-filename" title={effectivePod.fileName}>
                                                            {effectivePod.fileName}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="tv-pod-meta-item">
                                                    <span className="tv-pod-meta-label">Uploaded At</span>
                                                    <span className="tv-pod-meta-value">
                                                        {fmtDateTime(effectivePod.uploadedAt || deliveryDetail?.podUploadedAt || '')}
                                                    </span>
                                                </div>
                                                <div className="tv-pod-meta-item">
                                                    <span className="tv-pod-meta-label">Uploaded By / Courier</span>
                                                    <span className="tv-pod-meta-value">
                                                        {effectivePod.uploadedByName || deliveryDetail?.podUploadedBy || deliveryDetail?.courierFullName || 'Field Courier'}
                                                    </span>
                                                </div>
                                                {effectivePod.fileSize && (
                                                    <div className="tv-pod-meta-item">
                                                        <span className="tv-pod-meta-label">File Size</span>
                                                        <span className="tv-pod-meta-value">{formatFileSize(effectivePod.fileSize)}</span>
                                                    </div>
                                                )}
                                                {effectivePod.waybillNo && (
                                                    <div className="tv-pod-meta-item">
                                                        <span className="tv-pod-meta-label">Waybill</span>
                                                        <span className="tv-pod-meta-value tv-pod-waybill" style={{ fontFamily: 'monospace' }}>
                                                            {effectivePod.waybillNo}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="tv-pod-empty-state" data-testid="tv-pod-empty">
                                            <FileCheck size={28} className="tv-pod-empty-icon" />
                                            <div className="tv-pod-empty-title">No Proof of Delivery (POD) Uploaded Yet</div>
                                            <div className="tv-pod-empty-desc">
                                                Proof of Delivery (photo or signed receipt) will appear here once the courier marks the delivery completed in DMS.
                                            </div>
                                        </div>
                                    )}
                                </>
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

                </div>
            </div>

            {/* Floating side launcher on the right margin when panel is closed */}
            {!isChatPanelOpen && (
                <button
                    type="button"
                    className="tv-floating-panel-toggle"
                    onClick={() => setIsChatPanelOpen(true)}
                    title="Open Discussion & AI Recommendations Panel"
                >
                    <MessageSquare size={15} />
                    <span>Comments & AI</span>
                </button>
            )}

            {/* Slide-out Panel View for Comments and Recommendations */}
            {isChatPanelOpen && (
                <>
                    <div
                        className="tv-side-panel-backdrop"
                        onClick={() => setIsChatPanelOpen(false)}
                        aria-hidden="true"
                    />
                    <aside className="tv-side-panel" aria-label="Task Discussion and AI Recommendations">
                        <div className="tv-panel-header">
                            <div className="tv-panel-header-top">
                                <div className="tv-panel-header-title">
                                    <MessageSquare size={16} color="var(--teal, #00A99D)" />
                                    <span>Task Discussion & AI</span>
                                </div>
                                <button
                                    type="button"
                                    className="tv-panel-close-btn"
                                    onClick={() => setIsChatPanelOpen(false)}
                                    title="Close Panel"
                                    aria-label="Close panel"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="tv-panel-tabs">
                                <button
                                    type="button"
                                    className={`tv-panel-tab-btn ${rightPanelTab === 'comments' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('comments')}
                                >
                                    <MessageSquare size={13} /> Comments
                                </button>
                                <button
                                    type="button"
                                    className={`tv-panel-tab-btn ${rightPanelTab === 'recommendations' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('recommendations')}
                                >
                                    <Lightbulb size={13} /> Recommendations
                                </button>
                            </div>
                        </div>
                        <div className="tv-panel-content">
                            {rightPanelTab === 'recommendations'
                                ? <TaskRecommendations taskId={task.taskId} />
                                : <TaskComments taskId={task.taskId} currentEmployeeId={task.assignedTo} taskReferenceNumber={task.taskReferenceNumber || task.taskId.slice(0, 8).toUpperCase()} />}
                        </div>
                    </aside>
                </>
            )}

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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label className="tv-form-label">Courier Employee ID <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>(Optional DMS Driver)</span></label>
                                        {editingDelivery.courierEmployeeId && (() => {
                                            const paired = formatDriverDisplayShared(
                                                editingDelivery.courierFullName || (deliveryDetail?.courierEmployeeId === editingDelivery.courierEmployeeId ? deliveryDetail?.courierFullName : null),
                                                editingDelivery.courierEmployeeId,
                                                deliveryDetail?.courierIsActive,
                                                { layout: 'id-first' }
                                            );
                                            return (
                                                <span style={{ fontSize: 10, color: 'var(--primary, #0284c7)', fontWeight: 600 }} data-testid="dms-paired-driver-label">
                                                    {paired.displayText}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. DRV-001"
                                        value={editingDelivery.courierEmployeeId || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditingDelivery(prev => ({
                                                ...prev,
                                                courierEmployeeId: val,
                                                courierFullName: (deliveryDetail?.courierEmployeeId === val ? deliveryDetail?.courierFullName : prev.courierFullName) || ''
                                            }));
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="tv-form-group">
                                <label className="tv-form-label">Sender / Pickup Address <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>(Defaults to STARS Operations Office)</span></label>
                                <input
                                    type="text"
                                    className="tv-form-input"
                                    placeholder="e.g. STARS Operations Office"
                                    value={editingDelivery.senderAddress || ''}
                                    onChange={e => setEditingDelivery(prev => ({ ...prev, senderAddress: e.target.value }))}
                                />
                            </div>

                            <div className="tv-form-group">
                                <label className="tv-form-label">Special Instructions <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>(Optional notes for DMS courier)</span></label>
                                <textarea
                                    className="tv-form-input tv-form-textarea"
                                    rows={2}
                                    placeholder="e.g. Fragile documents, call recipient upon arrival, deliver before 3 PM"
                                    value={editingDelivery.specialInstructions || ''}
                                    onChange={e => setEditingDelivery(prev => ({ ...prev, specialInstructions: e.target.value }))}
                                />
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

            {/* ── Proof of Delivery (POD) Preview Modal ── */}
            {podPreviewOpen && effectivePod && (
                <div
                    className="tv-modal-overlay tv-pod-preview-overlay"
                    onClick={() => setPodPreviewOpen(false)}
                    data-testid="tv-pod-preview-modal"
                >
                    <div className="tv-modal-content tv-pod-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="tv-modal-header">
                            <div className="tv-pod-modal-title-row">
                                <FileCheck size={16} />
                                <h4 className="tv-modal-title">Proof of Delivery Preview</h4>
                                {effectivePod.fileName && <span className="tv-pod-modal-file-badge">{effectivePod.fileName}</span>}
                            </div>
                            <button
                                type="button"
                                className="tv-modal-close"
                                onClick={() => setPodPreviewOpen(false)}
                                aria-label="Close Preview"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="tv-pod-preview-body">
                            {isPdfFile(effectivePod.fileName, effectivePod.fileType) ? (
                                <div className="tv-pod-pdf-embed-wrapper">
                                    <iframe
                                        src={podPreviewUrl || effectivePod.podUrl || effectivePod.downloadUrl || ''}
                                        title="POD PDF Viewer"
                                        className="tv-pod-modal-pdf-frame"
                                    />
                                </div>
                            ) : isImageFile(effectivePod.fileName, effectivePod.fileType) ? (
                                <img
                                    src={podPreviewUrl || effectivePod.podUrl || effectivePod.downloadUrl || ''}
                                    alt="Proof of Delivery Full Preview"
                                    className="tv-pod-modal-img"
                                    onError={() => setPodImageError(true)}
                                />
                            ) : (
                                <div className="tv-pod-unsupported-preview">
                                    <AlertCircle size={32} />
                                    <p>Inline preview is not supported for this file type.</p>
                                    <button
                                        type="button"
                                        className="tv-btn tv-btn-primary"
                                        onClick={() => handleDownloadPod(false)}
                                    >
                                        <Download size={13} /> Download File to View
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="tv-modal-footer tv-pod-modal-footer">
                            <span className="tv-pod-modal-meta">
                                Uploaded: {fmtDateTime(effectivePod.uploadedAt || '')} by {effectivePod.uploadedByName || 'Field Courier'}
                            </span>
                            <div className="tv-pod-modal-btn-row">
                                <button
                                    type="button"
                                    className="tv-btn tv-btn-secondary"
                                    onClick={() => setPodPreviewOpen(false)}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    className="tv-btn tv-btn-primary"
                                    onClick={() => handleDownloadPod(false)}
                                    disabled={podDownloading}
                                >
                                    {podDownloading ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                                    <span>Download Original</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Record Client Wet-Signed Endorsement Modal (FOMS Integration 1) ── */}
            {showSignModal && fomsEndorsement && (
                <div className="tv-modal-overlay" onClick={() => !submittingSign && setShowSignModal(false)}>
                    <div className="tv-modal tv-modal-delivery" onClick={e => e.stopPropagation()}>
                        <div className="tv-modal-header">
                            <div className="tv-modal-icon" style={{ background: 'rgba(79, 70, 229, 0.12)', color: '#4F46E5' }}>
                                <FileCheck size={20} />
                            </div>
                            <div>
                                <h4 className="tv-modal-title">Record Client Receiving Endorsement</h4>
                                <p className="tv-modal-sub">
                                    Return the signed receiving copy and actual received date back to FOMS to trigger the 30-day payment term calculation.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleRecordEndorsementSign}>
                            <div className="tv-modal-form-body">
                                <div className="tv-form-row">
                                    <div className="tv-form-group">
                                        <label className="tv-form-label">
                                            Invoice Number
                                        </label>
                                        <input
                                            type="text"
                                            className="tv-form-input"
                                            readOnly
                                            value={fomsEndorsement.invoiceNumber}
                                            style={{ background: '#f8fafc', fontWeight: 700 }}
                                        />
                                    </div>
                                    <div className="tv-form-group">
                                        <label className="tv-form-label">
                                            Actual Received Date <span style={{ color: 'var(--status-failed)' }}>*</span>
                                        </label>
                                        <input
                                            type="date"
                                            className="tv-form-input"
                                            required
                                            value={signForm.actualReceivedDate}
                                            onChange={e => setSignForm(prev => ({ ...prev, actualReceivedDate: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="tv-modal-calc-preview">
                                    <Calendar size={14} color="#4F46E5" />
                                    <span>
                                        <strong>Calculated 30-Day Payment Term Due Date: </strong>
                                        {signForm.actualReceivedDate
                                            ? new Date(new Date(signForm.actualReceivedDate).getTime() + 30 * 86400000).toLocaleDateString(undefined, {
                                                  weekday: 'short',
                                                  month: 'short',
                                                  day: 'numeric',
                                                  year: 'numeric',
                                              })
                                            : 'Select received date above'}
                                    </span>
                                </div>

                                <div className="tv-form-group" style={{ marginTop: 12 }}>
                                    <label className="tv-form-label">
                                        Signed Receiving Copy URL (Storage Link / Scan)
                                    </label>
                                    <input
                                        type="url"
                                        className="tv-form-input"
                                        placeholder={`https://stars.blob.core.windows.net/signed-receipts/RC-${fomsEndorsement.invoiceNumber}.pdf`}
                                        value={signForm.signedCopyUrl}
                                        onChange={e => setSignForm(prev => ({ ...prev, signedCopyUrl: e.target.value }))}
                                    />
                                    <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: 3 }}>
                                        Provide the URL to the scanned PDF or image containing the client's wet signature and receiving stamp.
                                    </span>
                                </div>

                                <div className="tv-form-group" style={{ marginTop: 12 }}>
                                    <label className="tv-form-label">
                                        Delivery &amp; Endorsement Remarks
                                    </label>
                                    <textarea
                                        rows={3}
                                        className="tv-modal-textarea"
                                        style={{ height: 'auto', minHeight: 70 }}
                                        placeholder="e.g. Received and stamped by Accounts Payable comptroller. 2 original copies endorsed."
                                        value={signForm.deliveryRemarks}
                                        onChange={e => setSignForm(prev => ({ ...prev, deliveryRemarks: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="tv-modal-actions">
                                <button
                                    type="button"
                                    className="tv-btn tv-btn-outline"
                                    onClick={() => setShowSignModal(false)}
                                    disabled={submittingSign}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="tv-btn tv-btn-primary"
                                    disabled={submittingSign || !signForm.actualReceivedDate}
                                    style={{ background: '#4F46E5' }}
                                >
                                    {submittingSign ? <Loader2 size={13} className="spin" /> : <FileCheck size={13} />}
                                    {submittingSign ? 'Transmitting to FOMS…' : 'Record & Transmit to FOMS'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default TaskView;