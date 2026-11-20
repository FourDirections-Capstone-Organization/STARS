import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Pencil, X, Package, CheckCircle2,
    XCircle, Clock, AlertTriangle, ThumbsUp, RotateCcw, Lock, ArrowLeft,
    FileText, Download, Trash2, Paperclip, MessageSquare, Lightbulb, Loader2, AlertCircle, Upload,
    Truck, MapPin, Copy, Check, Send, ExternalLink, RefreshCw, Save, Plus,
    DollarSign, Phone, Mail, ShieldAlert, Sparkles, Zap, FileCheck, Calendar,
    Receipt, AlertOctagon, User,
} from 'lucide-react';
import TaskComments from '../TaskComments/TaskComments';
import TaskRecommendations from '../TaskRecommendations/TaskRecommendations';
import StatusBadge from '../ui/StatusBadge';
import { formatStatus, formatDeliveryStatus } from '../../utils/statusUtils';
import ConfirmationModal from '../ConfirmationModal/ConfirmationModal';
import { useToast } from '../Toast/Toast';
import api from '../../api';
import axios from 'axios';
import { formatDeadlineWithRemaining, formatDateOnly } from '../../utils/dateUtils';
import { formatDriverDisplay as formatDriverDisplayShared, FormatDriverOptions } from '../../utils/driverUtils';
import { syncDmsTaskCompleted } from '../../utils/dmsSyncUtils';
import SubmitCorrectionModal from '../LiquidationCorrections/SubmitCorrectionModal';
import '../LiquidationCorrections/LiquidationCorrections.css';
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
    taskType?: string;
    packageType?: string;
    weight?: string;
    itemCount?: number;
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
    taskType?: string;
    packageType?: string;
    weight?: string;
    itemCount?: number;
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
    backLabel?: string;
    breadcrumbRoot?: string;
    onEdit?: () => void;
    onReopen?: () => void;
    onClose?: () => void;
    onApprove?: (taskId: string) => void;
    onReject?: (taskId: string, reason: string) => void;
    onDeleteAttachment?: (attachmentId: string) => void | Promise<void>;
    onUpdate?: (updatedTask: TaskViewTask) => void;
    onNavigateToDmsTracker?: (waybillNo?: string, taskId?: string) => void;
    onNavigateToDeliveryTracker?: (taskId: string, waybillNo?: string) => void;
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

// ─── DMS Delivery Follow-up Parser (Integration 4) ───────────────────────────

export interface ParsedDmsFollowUpInfo {
    isFollowUp: boolean;
    waybillNo: string;
    failureType: string;
    failureReason: string;
    attemptCount: number;
    driverDisplay: string;
    originalTaskTitle?: string;
    originalTaskId?: string;
    actionRequired?: string;
}

export const parseDmsFollowUp = (
    title?: string,
    desc?: string,
    deliveryDetail?: TaskDeliveryDetailData | null
): ParsedDmsFollowUpInfo | null => {
    const rawTitle = title || '';
    const rawDesc = desc || '';
    const isFollowUp = rawTitle.startsWith('Delivery Follow-up - ')
        || rawTitle.includes('[Delivery Follow-up]')
        || rawDesc.includes('Follow-up required for Failed Delivery')
        || rawDesc.includes('Follow-up required for Failed Pickup')
        || (deliveryDetail?.dmsStatus === 'Failed' && rawTitle.toLowerCase().includes('follow-up'));

    if (!isFollowUp) return null;

    let waybillNo = '';
    const waybillTitleMatch = rawTitle.match(/Delivery Follow-up\s*-\s*([A-Za-z0-9-_]+)/i);
    const waybillDescMatch = rawDesc.match(/Waybill\s+([A-Za-z0-9-_]+)/i);
    if (waybillTitleMatch) {
        waybillNo = waybillTitleMatch[1].trim();
    } else if (deliveryDetail?.dmsWaybillNo) {
        waybillNo = deliveryDetail.dmsWaybillNo;
    } else if (waybillDescMatch) {
        waybillNo = waybillDescMatch[1].trim();
    } else {
        waybillNo = 'N/A';
    }

    let failureType = 'Failed Delivery';
    const typeMatch = rawDesc.match(/Follow-up required for (Failed Delivery|Failed Pickup)/i)
        || rawDesc.match(/Type:\s*([^|\n]+)/i);
    if (typeMatch) {
        failureType = typeMatch[1].trim();
    } else if (deliveryDetail?.dmsRawStatus) {
        failureType = deliveryDetail.dmsRawStatus;
    } else if (rawDesc.toLowerCase().includes('pickup')) {
        failureType = 'Failed Pickup';
    }

    let failureReason = '';
    const reasonMatch = rawDesc.match(/Failure Reason:\s*([^\n]+)/i);
    if (reasonMatch) {
        failureReason = reasonMatch[1].trim();
    } else if (deliveryDetail?.dmsFailureReason) {
        failureReason = deliveryDetail.dmsFailureReason;
    } else {
        failureReason = 'Operational Exception';
    }

    let attemptCount = 1;
    const attemptMatch = rawDesc.match(/Attempt Count:\s*(\d+)/i)
        || rawDesc.match(/Attempt\s*#?(\d+)/i);
    if (attemptMatch) {
        attemptCount = parseInt(attemptMatch[1], 10) || 1;
    }

    let driverDisplay = '';
    const driverMatch = rawDesc.match(/Driver:\s*([^\n]+)/i);
    if (driverMatch) {
        driverDisplay = driverMatch[1].trim();
    } else if (deliveryDetail?.courierFullName || deliveryDetail?.courierEmployeeId) {
        driverDisplay = deliveryDetail.courierFullName
            ? `${deliveryDetail.courierFullName} (${deliveryDetail.courierEmployeeId || ''})`.trim()
            : (deliveryDetail.courierEmployeeId || 'N/A');
    } else {
        driverDisplay = 'Unassigned';
    }

    const origMatch = rawDesc.match(/Original Task:\s*(.+?)\s*\(([^)]+)\)/i);
    const originalTaskTitle = origMatch ? origMatch[1].trim() : undefined;
    const originalTaskId = origMatch ? origMatch[2].trim() : undefined;

    const actionMatch = rawDesc.match(/Action Required:\s*([^\n]+)/i);
    const actionRequired = actionMatch ? actionMatch[1].trim() : 'Contact client to arrange next attempt or return to sender in DMS.';

    return {
        isFollowUp: true,
        waybillNo,
        failureType,
        failureReason,
        attemptCount,
        driverDisplay,
        originalTaskTitle,
        originalTaskId,
        actionRequired,
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

// ─── FOMS Liquidation Parser (Integration 5) ──────────────────────────────────

interface ParsedFomsLiquidationInfo {
    isLiquidationTask: boolean;
    requestId: string;
    liquidationId?: number | null;
    requester: string;
    requesterEmployeeId?: string | null;
    deliveryReference?: string | null;
    liquidationStatus: 'For Correction' | 'Rejected' | string;
    correctionReason: string;
    dueDate?: string | null;
    amount?: number | null;
    amountFormatted?: string;
    remarks?: string | null;
}

const parseFomsLiquidation = (title?: string, desc?: string): ParsedFomsLiquidationInfo | null => {
    const rawTitle = title || '';
    const rawDesc = desc || '';
    const isLiquidation = rawTitle.includes('[Liquidation Correction]') ||
                          rawDesc.includes('Automated liquidation correction routed from FOMS') ||
                          rawTitle.toLowerCase().includes('liquidation correction');
    if (!isLiquidation) return null;

    const reqMatch = rawDesc.match(/Request ID:\s*([^\n]+)/i) || rawTitle.match(/\[Liquidation Correction\]\s*([^\s-]+)/i);
    const liqIdMatch = rawDesc.match(/Liquidation ID:\s*([^\n]+)/i);
    const reqerMatch = rawDesc.match(/Requester:\s*([^\n]+)/i);
    const delMatch = rawDesc.match(/Delivery\/Trip Reference:\s*([^\n]+)/i);
    const statusMatch = rawDesc.match(/Status:\s*([^\n]+)/i);
    const reasonMatch = rawDesc.match(/Correction Reason:\s*([^\n]+)/i);
    const amountMatch = rawDesc.match(/Amount:\s*₱?([^\n]+)/i);
    const dueMatch = rawDesc.match(/Due Date:\s*([^\n]+)/i);
    const remarksMatch = rawDesc.match(/Remarks:\s*([^\n]+)/i);

    let requester = 'Courier Staff';
    let requesterEmployeeId: string | null = null;
    if (reqerMatch) {
        const full = reqerMatch[1].trim();
        const paren = full.match(/\(([^)]+)\)/);
        if (paren) {
            requesterEmployeeId = paren[1].trim();
            requester = full.replace(/\([^)]+\)/, '').trim();
        } else {
            requester = full;
        }
    } else {
        const parts = rawTitle.split(' - ');
        if (parts.length > 1) {
            requester = parts[parts.length - 1].trim();
        }
    }

    const requestId = reqMatch ? reqMatch[1].trim() : 'LIQ-REQ';
    const rawAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    const amountFormatted = rawAmount != null ? `₱${rawAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined;

    return {
        isLiquidationTask: true,
        requestId,
        liquidationId: liqIdMatch ? parseInt(liqIdMatch[1].trim()) : null,
        requester,
        requesterEmployeeId,
        deliveryReference: delMatch ? delMatch[1].trim() : null,
        liquidationStatus: statusMatch ? statusMatch[1].trim() : (rawTitle.toLowerCase().includes('reject') ? 'Rejected' : 'For Correction'),
        correctionReason: reasonMatch ? reasonMatch[1].trim() : 'Missing or invalid receipt proof noted by Finance.',
        dueDate: dueMatch && dueMatch[1].trim() !== 'N/A' ? dueMatch[1].trim() : null,
        amount: rawAmount,
        amountFormatted,
        remarks: remarksMatch ? remarksMatch[1].trim() : null,
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
    backLabel,
    breadcrumbRoot,
    onEdit = () => {},
    onReopen = () => {},
    onClose = () => {},
    onApprove,
    onReject,
    onDeleteAttachment,
    onUpdate,
    onNavigateToDmsTracker,
    onNavigateToDeliveryTracker,
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
    const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

    const token = localStorage.getItem('authToken');

    // ─── DMS Delivery Order & Tracking ──────────────────────────────────────────
    const [deliveryDetail, setDeliveryDetail] = useState<TaskDeliveryDetailData | null>((task as any)?.deliveryDetails || null);
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

    // ─── DMS Delivery Follow-up (Integration 4) ──────────────────────────────────
    const dmsFollowUp = useMemo(
        () => parseDmsFollowUp(task.taskTitle, task.taskDescription, deliveryDetail),
        [task.taskTitle, task.taskDescription, deliveryDetail]
    );

    const handleNavigateToDmsTracker = useCallback(() => {
        const waybill = deliveryDetail?.dmsWaybillNo || dmsFollowUp?.waybillNo;
        if (onNavigateToDmsTracker) {
            onNavigateToDmsTracker(waybill, task.taskId);
        } else if (onNavigateToDeliveryTracker) {
            onNavigateToDeliveryTracker(task.taskId, waybill);
        } else {
            window.dispatchEvent(new CustomEvent('stars:navigate-dms-tracker', {
                detail: {
                    waybillNo: waybill,
                    taskId: task.taskId,
                }
            }));
        }
    }, [onNavigateToDmsTracker, onNavigateToDeliveryTracker, deliveryDetail?.dmsWaybillNo, dmsFollowUp?.waybillNo, task.taskId]);

    // ─── FOMS Collection Follow-up (Integration 3) ──────────────────────────────
    const fomsCollection = parseFomsCollection(task.taskTitle, task.taskDescription);
    const [copiedFomsKey, setCopiedFomsKey] = useState<string | null>(null);
    const handleFomsCopy = (text: string, key: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedFomsKey(key);
        setTimeout(() => setCopiedFomsKey(null), 2000);
    };

    const isCollectionUrgent = !!fomsCollection && (
        fomsCollection.daysOverdue >= 30 ||
        fomsCollection.aging.includes('61-90') ||
        fomsCollection.aging.includes('90+') ||
        fomsCollection.aging.includes('60') ||
        task.priority === 'Urgent'
    );

    const [showCollectionOutcomeModal, setShowCollectionOutcomeModal] = useState<boolean>(false);
    const [collectionOutcomeType, setCollectionOutcomeType] = useState<string>('Promised to Pay');
    const [collectionPromisedDate, setCollectionPromisedDate] = useState<string>('');
    const [collectionActionTaken, setCollectionActionTaken] = useState<string>('Phone Call');
    const [collectionOutcomeNotes, setCollectionOutcomeNotes] = useState<string>('');
    const [submittingCollectionOutcome, setSubmittingCollectionOutcome] = useState<boolean>(false);
    const [collectionOutcomeError, setCollectionOutcomeError] = useState<string>('');

    // ─── FOMS Physical Invoice Delivery & Endorsement (Integration 1) ───────────
    const fomsEndorsement = useMemo(() => parseFomsEndorsement(task.taskTitle, task.taskDescription), [task.taskTitle, task.taskDescription]);
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
    }, [task.taskId, fomsEndorsement?.invoiceNumber]);

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

    // ─── FOMS Liquidation Correction (Integration 5) ─────────────────────────────
    const fomsLiquidation = useMemo(() => parseFomsLiquidation(task.taskTitle, task.taskDescription), [task.taskTitle, task.taskDescription]);
    const [liquidationDetail, setLiquidationDetail] = useState<any | null>(null);
    const [liquidationLoading, setLiquidationLoading] = useState(false);
    const [showLiquidationModal, setShowLiquidationModal] = useState(false);
    const [authorizingLiquidation, setAuthorizingLiquidation] = useState(false);
    const [retryingLiquidationSync, setRetryingLiquidationSync] = useState(false);

    const fetchLiquidationDetail = useCallback(async () => {
        if (!task.taskId || !fomsLiquidation) return;
        setLiquidationLoading(true);
        try {
            const res = await api.get<any>(`/api/foms-integration/liquidation-tasks/${task.taskId}`);
            const data = res.data?.data ?? res.data;
            if (data && (data.requestId || data.liquidationStatus)) {
                setLiquidationDetail(data);
            }
        } catch {
            // Silently fallback to parsed values
        } finally {
            setLiquidationLoading(false);
        }
    }, [task.taskId, fomsLiquidation?.requestId]);

    useEffect(() => {
        fetchLiquidationDetail();
    }, [fetchLiquidationDetail]);

    const handleAuthorizeLiquidation = async () => {
        if (!task.taskId || !fomsLiquidation) return;
        setAuthorizingLiquidation(true);
        try {
            const res = await api.post(`/api/foms-integration/liquidation-tasks/${task.taskId}/callback`, {});
            const data = res.data;
            if (data && (data.isSuccess === false || data.success === false)) {
                throw new Error(data.message || 'Callback failed.');
            }
            toastSuccess(`Liquidation task for ${fomsLiquidation.requestId} authorized and completion synced to FOMS.`);
            setLocalStatus('Completed');
            setLiquidationDetail((prev: any) => ({
                ...(prev || {}),
                fomsSyncStatus: 'CallbackSuccess',
                correctionStatus: 'Corrected',
            }));
            await fetchLiquidationDetail();
            if (onUpdate) {
                onUpdate({ ...task, taskStatus: 'Completed' });
            }
        } catch (err: any) {
            toastError(err?.response?.data?.message || err?.message || 'Failed to authorize completion and dispatch callback to FOMS.');
        } finally {
            setAuthorizingLiquidation(false);
        }
    };

    const handleRetryLiquidationSync = async () => {
        if (!task.taskId || !fomsLiquidation) return;
        setRetryingLiquidationSync(true);
        try {
            const res = await api.post(`/api/foms-integration/liquidation-tasks/${task.taskId}/retry`, {});
            const data = res.data;
            if (data && (data.isSuccess === false || data.success === false)) {
                throw new Error(data.message || 'Retry failed.');
            }
            toastSuccess(`FOMS sync retry succeeded for ${fomsLiquidation.requestId}.`);
            await fetchLiquidationDetail();
        } catch (err: any) {
            toastError(err?.response?.data?.message || err?.message || 'Sync retry failed.');
        } finally {
            setRetryingLiquidationSync(false);
        }
    };

    const fetchPodData = useCallback(async (_silent: boolean = false) => {
        // Safe stub for DMS POD data handling in TaskView
    }, []);

    const fetchDeliveryDetail = useCallback(async (silent: boolean = false) => {
        if (!task.taskId) return;
        if (!silent) setDeliveryLoading(true);
        try {
            const [res, pendingRes] = await Promise.allSettled([
                api.get<any>(`/api/dms-integration/tasks/${task.taskId}/delivery-details`),
                api.get<any>('/api/dms-integration/pending-orders'),
            ]);
            const json = res.status === 'fulfilled' ? res.value?.data : null;
            const data = json?.data ?? json;
            if (data && (data.recipientName || data.dmsWaybillNo || data.syncStatus)) {
                let matchedPending: any = null;
                if (pendingRes.status === 'fulfilled') {
                    const pList = pendingRes.value?.data?.data ?? pendingRes.value?.data;
                    if (Array.isArray(pList)) {
                        matchedPending = pList.find((p: any) =>
                            (data.dmsWaybillNo && p.waybillNo && String(p.waybillNo).toLowerCase() === String(data.dmsWaybillNo).toLowerCase()) ||
                            (data.dmsOrderId && p.orderId && p.orderId === data.dmsOrderId)
                        );
                    }
                }

                const taskDel = (task as any).deliveryDetails;
                let resolvedCourierName = data.courierFullName;
                const cleanEmpId = (data.courierEmployeeId || '').trim();
                if (!resolvedCourierName || resolvedCourierName.trim() === cleanEmpId || resolvedCourierName.trim().toLowerCase() === 'unassigned') {
                    if (taskDel?.courierFullName && taskDel.courierFullName !== cleanEmpId) {
                        resolvedCourierName = taskDel.courierFullName;
                    } else if (task.assignees?.length) {
                        const matchedAssignee = task.assignees.find(a => (a as any).employeeNumber === cleanEmpId || a.fullName);
                        if (matchedAssignee?.fullName) {
                            resolvedCourierName = matchedAssignee.fullName;
                        }
                    }
                    if (!resolvedCourierName && task.assignedEmployee && task.assignedEmployee.trim() !== cleanEmpId && task.assignedEmployee.trim().toLowerCase() !== 'unassigned') {
                        resolvedCourierName = task.assignedEmployee;
                    }
                }

                // Check accurate logistics details from DMS
                let itemCount = data.itemCount ?? taskDel?.itemCount ?? (task as any).itemCount;
                if ((itemCount == null || itemCount <= 1) && matchedPending?.itemCount && matchedPending.itemCount > 1) {
                    itemCount = matchedPending.itemCount;
                }
                if (itemCount == null) itemCount = 1;

                let taskType = data.taskType || taskDel?.taskType || (task as any).taskType;
                if ((!taskType || taskType === 'Standard Delivery') && matchedPending?.taskType) {
                    taskType = matchedPending.taskType;
                }
                if (!taskType) taskType = 'Standard Delivery';

                let packageType = data.packageType || taskDel?.packageType || (task as any).packageType;
                if ((!packageType || packageType === 'Parcel') && matchedPending?.packageType) {
                    packageType = matchedPending.packageType;
                }
                if (!packageType) packageType = 'Parcel';

                let weight = data.weight || taskDel?.weight || (task as any).weight;
                if ((!weight || weight === '—' || weight === '1.0 kg') && matchedPending?.weight) {
                    weight = matchedPending.weight;
                }
                if (!weight) weight = '1.0 kg';

                const enriched: TaskDeliveryDetailData = {
                    ...data,
                    courierFullName: resolvedCourierName || data.courierFullName,
                    taskType,
                    packageType,
                    weight,
                    itemCount,
                };
                setDeliveryDetail(enriched);
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
                        courierFullName: resolvedCourierName || data.courierFullName || '',
                        taskType,
                        packageType,
                        weight,
                        itemCount,
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
    }, [task.taskId, task.assignees, task.assignedEmployee, (task as any).deliveryDetails]);

    useEffect(() => {
        fetchDeliveryDetail(false);
    }, [fetchDeliveryDetail]);

    // Live Auto-Refresh polling while task modal is open and delivery is in progress (8s polling, halts on terminal status)
    useEffect(() => {
        if (!task?.taskId || !deliveryDetail?.dmsWaybillNo) return;
        const currentSt = (deliveryDetail?.dmsRawStatus || deliveryDetail?.dmsStatus || '').toLowerCase();
        if (currentSt.includes('delivered') || currentSt.includes('completed') || currentSt.includes('cancel')) {
            return;
        }

        const interval = setInterval(() => {
            fetchDeliveryDetail(true);
        }, 8000);

        return () => clearInterval(interval);
    }, [task?.taskId, deliveryDetail?.dmsWaybillNo, deliveryDetail?.dmsStatus, deliveryDetail?.dmsRawStatus, fetchDeliveryDetail]);

    const handleSaveDelivery = async () => {
        if (!editingDelivery.recipientName.trim() || !editingDelivery.recipientContact.trim() || !editingDelivery.deliveryAddress.trim()) {
            toastError('Recipient Name, Contact Number, and Delivery Address are required.');
            return;
        }
        setSavingDelivery(true);
        try {
            const res = await api.put(`/api/dms-integration/tasks/${task.taskId}/delivery-details`, editingDelivery);
            const savedData = res?.data?.data ?? res?.data;
            setDeliveryDetail(prev => ({
                ...(prev || {}),
                ...(savedData || {}),
                itemCount: savedData?.itemCount ?? editingDelivery.itemCount ?? prev?.itemCount ?? 1,
                taskType: savedData?.taskType || editingDelivery.taskType || prev?.taskType,
                packageType: savedData?.packageType || editingDelivery.packageType || prev?.packageType,
                weight: savedData?.weight || editingDelivery.weight || prev?.weight,
            }));
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
            if (savedData) {
                const normSt = (savedData?.dmsRawStatus || savedData?.dmsStatus || '').toLowerCase();
                const displaySt = formatDeliveryStatus(savedData.dmsStatus);
                setDeliveryDetail({
                    ...savedData,
                    dmsStatus: displaySt,
                });
                await fetchPodData(true);

                if (!normSt.includes('pending') && (normSt.includes('delivered') || normSt.includes('completed'))) {
                    toastSuccess('Delivery confirmed as Delivered in DMS! STARS task updated.');
                } else if (savedData?.dmsWaybillNo) {
                    toastSuccess(`Delivery synced with DMS! Status: ${displaySt}`);
                } else {
                    toastSuccess('Dispatched to DMS successfully.');
                }
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
    const canAuthorizeLiquidation = !userRole || isCoordOrManager || userRole === 'Admin' || userRole.toLowerCase().includes('coordinator') || userRole.toLowerCase().includes('manager');

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
            let res: any;
            if (onApprove) {
                res = await onApprove(task.taskId);
            } else {
                res = await api.patch(`/api/Task/${task.taskId}/review`, { isApproved: true });
            }
            setReviewState('approved');
            setLocalStatus('Completed');
            setReviewHistory(prev => [...prev, {
                action: 'approved', by: currentUser,
                at: new Date().toISOString(),
            }]);
            onUpdate?.({ ...task, taskStatus: 'Completed' });
            await syncDmsTaskCompleted(task.taskId);
            await fetchDeliveryDetail();

            const msg = res?.data?.message || res?.message;
            if (msg && (msg.includes('DMS sync failed') || msg.includes('DMS sync encountered'))) {
                toastWarning(msg, { duration: 6000 });
            } else {
                toastSuccess('Task approved and completed.');
            }
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
                    <button className="tv-back-btn" onClick={onClose} aria-label={backLabel || "Back to Task List"}>
                        <ArrowLeft size={15} />
                        <span>{backLabel || "Back to Task List"}</span>
                    </button>
                    <div className="tv-breadcrumbs">
                        <span className="tv-breadcrumb-muted">{breadcrumbRoot || "Task Management"}</span>
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
                                {fomsCollection && !task.taskTitle.startsWith('[Collection Follow-up]')
                                    ? `[Collection Follow-up] Invoice ${fomsCollection.invoiceNumber} - ${fomsCollection.clientName}`
                                    : task.taskTitle}
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
                                {isCollectionUrgent ? (
                                    <span
                                        className="tv-urgent-priority-pill"
                                        data-testid="tv-urgent-priority-pill"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            background: '#fee2e2',
                                            color: '#b91c1c',
                                            border: '1px solid #f87171',
                                            borderRadius: 9999,
                                            padding: '2px 8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                        }}
                                    >
                                        <ShieldAlert size={12} color="#dc2626" /> Urgent
                                    </span>
                                ) : (
                                    <PrioBadge p={task.priority} />
                                )}
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

                        {/* ── DMS Delivery Follow-up & Workload Graph Routing Section (Integration 4) ── */}
                        {dmsFollowUp && (
                            <div className="tv-section tv-dms-followup-section" data-testid="tv-dms-followup-section">
                                <div className="tv-dms-followup-header">
                                    <div className="tv-dms-followup-header-title">
                                        <Truck size={16} className="tv-dms-followup-icon" />
                                        <span>DMS Delivery Follow-up &amp; Workload Graph Routing</span>
                                    </div>
                                    <div className="tv-dms-followup-header-status">
                                        <span className="tv-dms-followup-pill tv-dms-followup-pill-routed">
                                            <Sparkles size={11} /> Graph Routed to Optimal Coordinator
                                        </span>
                                    </div>
                                </div>

                                <div className="tv-dms-followup-card">
                                    {/* Top Key Failure Stats Banner */}
                                    <div className="tv-dms-followup-stats-banner">
                                        <div className="tv-dms-followup-stat-group">
                                            <span className="tv-dms-followup-stat-label">FAILURE TYPE</span>
                                            <span className="tv-dms-followup-stat-type">
                                                <AlertTriangle size={13} /> {dmsFollowUp.failureType}
                                            </span>
                                        </div>
                                        <div className="tv-dms-followup-stat-group">
                                            <span className="tv-dms-followup-stat-label">WAYBILL NUMBER</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="tv-dms-followup-waybill-num">{dmsFollowUp.waybillNo}</span>
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-outline-sm tv-dms-copy-btn"
                                                    onClick={() => handleCopyWaybill(dmsFollowUp.waybillNo)}
                                                    title="Copy waybill number"
                                                >
                                                    {copiedWaybill ? <Check size={11} color="#059669" /> : <Copy size={11} />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="tv-dms-followup-stat-group">
                                            <span className="tv-dms-followup-stat-label">ATTEMPT COUNT</span>
                                            <span className={`tv-dms-followup-attempt-tag ${dmsFollowUp.attemptCount > 1 ? 'critical' : 'warning'}`}>
                                                Attempt #{dmsFollowUp.attemptCount}
                                            </span>
                                        </div>
                                        <div className="tv-dms-followup-stat-group">
                                            <span className="tv-dms-followup-stat-label">SLA DEADLINE</span>
                                            <span className="tv-dms-followup-stat-val">2 Business Days</span>
                                        </div>
                                    </div>

                                    {/* Root Cause Failure Reason Banner */}
                                    <div className="tv-dms-followup-reason-banner">
                                        <div className="tv-dms-followup-reason-icon">
                                            <AlertCircle size={15} />
                                        </div>
                                        <div className="tv-dms-followup-reason-info">
                                            <span className="tv-dms-followup-reason-label">EXCEPTION ROOT CAUSE</span>
                                            <p className="tv-dms-followup-reason-text">
                                                {dmsFollowUp.failureReason}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Graph Routing Engine Assignment Card */}
                                    <div className="tv-dms-followup-routing-banner">
                                        <div className="tv-dms-followup-routing-icon">
                                            <Zap size={15} />
                                        </div>
                                        <div className="tv-dms-followup-routing-info">
                                            <span className="tv-dms-followup-routing-label">GRAPH ROUTING ENGINE ASSIGNMENT</span>
                                            <p className="tv-dms-followup-routing-desc">
                                                Intercepted from DMS operational exception stream and automatically assigned to <strong>{task.assignees?.[0]?.fullName || task.assignedEmployee || task.assignedTo || 'Optimal Coordinator'}</strong> based on minimum active workload across Coordinators. Original delivery task status is preserved as Completed.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Driver & Delivery Information Grid */}
                                    <div className="tv-dms-followup-grid">
                                        <div className="tv-dms-followup-grid-item">
                                            <span className="tv-dms-followup-grid-label">Assigned Driver</span>
                                            <span className="tv-dms-followup-grid-value" style={{ fontWeight: 600 }}>
                                                {dmsFollowUp.driverDisplay}
                                            </span>
                                        </div>
                                        <div className="tv-dms-followup-grid-item">
                                            <span className="tv-dms-followup-grid-label">Recipient Client</span>
                                            <span className="tv-dms-followup-grid-value">
                                                {deliveryDetail?.recipientName || 'Client / Recipient'}
                                            </span>
                                            {deliveryDetail?.recipientContact && (
                                                <span className="tv-dms-followup-sub-val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Phone size={11} color="var(--primary, #0284c7)" /> {deliveryDetail.recipientContact}
                                                </span>
                                            )}
                                        </div>
                                        <div className="tv-dms-followup-grid-item tv-dms-followup-grid-full">
                                            <span className="tv-dms-followup-grid-label">Destination Address</span>
                                            <span className="tv-dms-followup-grid-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MapPin size={12} color="var(--primary, #0284c7)" />
                                                {deliveryDetail?.deliveryAddress || `Delivery address for Waybill ${dmsFollowUp.waybillNo}`}
                                            </span>
                                        </div>
                                        {dmsFollowUp.originalTaskTitle && (
                                            <div className="tv-dms-followup-grid-item tv-dms-followup-grid-full">
                                                <span className="tv-dms-followup-grid-label">Original Completed STARS Task</span>
                                                <span className="tv-dms-followup-grid-value" style={{ color: '#059669', fontWeight: 600 }}>
                                                    <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                    {dmsFollowUp.originalTaskTitle} (Preserved Terminal Status: Completed)
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Required Callout */}
                                    <div className="tv-dms-followup-action-box">
                                        <div className="tv-dms-followup-action-label">COORDINATOR ACTION REQUIRED:</div>
                                        <div className="tv-dms-followup-action-text">{dmsFollowUp.actionRequired}</div>
                                    </div>

                                    {/* Quick Action Navigation Buttons */}
                                    <div className="tv-dms-followup-quick-actions">
                                        <button
                                            type="button"
                                            className="tv-btn tv-btn-primary tv-btn-sm"
                                            onClick={() => {
                                                setActiveTab('comments');
                                                setIsChatPanelOpen(true);
                                            }}
                                        >
                                            <MessageSquare size={12} />
                                            <span>View Failure Remarks &amp; Comments</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="tv-btn tv-btn-outline-sm"
                                            onClick={handleNavigateToDmsTracker}
                                        >
                                            <Truck size={12} />
                                            <span>Live Delivery Tracker</span>
                                        </button>
                                    </div>
                                </div>
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
                                        {effectiveStatus === 'Completed' ? (
                                            <span className="tv-foms-pill tv-foms-pill-settled" data-testid="foms-collection-settled-pill">
                                                <CheckCircle2 size={11} color="#059669" /> Settled &amp; Concluded (FOMS)
                                            </span>
                                        ) : (
                                            <span className="tv-foms-pill tv-foms-pill-routed">
                                                <Sparkles size={11} /> Graph Routed to Optimal Coordinator
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="tv-foms-card">
                                    {effectiveStatus === 'Completed' && (
                                        <div className="tv-foms-settled-banner" data-testid="foms-collection-auto-concluded-banner">
                                            <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
                                            <span>[FOMS Payment Notification] Full payment settled for invoice {fomsCollection.invoiceNumber}. Outstanding balance cleared. Follow-up concluded.</span>
                                        </div>
                                    )}

                                    {/* Top Key Overdue Stats Banner */}
                                    <div className="tv-foms-stats-banner">
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">OUTSTANDING AMOUNT</span>
                                            <span className="tv-foms-stat-amount" style={effectiveStatus === 'Completed' ? { color: '#059669' } : {}}>
                                                {effectiveStatus === 'Completed' ? '₱0.00 (Settled)' : fomsCollection.amountDue}
                                            </span>
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
                                            <span className={`tv-foms-aging-tag ${effectiveStatus === 'Completed' ? 'moderate' : fomsCollection.daysOverdue >= 30 ? 'critical' : 'moderate'}`}>
                                                {effectiveStatus === 'Completed' ? 'Cleared / Settled' : fomsCollection.aging}
                                            </span>
                                        </div>
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">PRIORITY LEVEL</span>
                                            {isCollectionUrgent ? (
                                                <span
                                                    className="tv-urgent-priority-pill"
                                                    data-testid="foms-urgent-priority-badge"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        background: '#fee2e2',
                                                        color: '#b91c1c',
                                                        border: '1px solid #f87171',
                                                        borderRadius: 9999,
                                                        padding: '2px 8px',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <ShieldAlert size={11} color="#dc2626" /> Urgent
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#c2410c' }}>
                                                    High
                                                </span>
                                            )}
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
                                        {effectiveStatus === 'Completed' ? (
                                            <span className="tv-foms-completed-note" data-testid="foms-followup-concluded-note">
                                                <CheckCircle2 size={12} color="#059669" /> Collection follow-up concluded — payment settled in full.
                                            </span>
                                        ) : (
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
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-primary-sm tv-foms-outcome-modal-btn"
                                                    onClick={() => {
                                                        setCollectionOutcomeType('Promised to Pay');
                                                        const defDate = new Date();
                                                        defDate.setDate(defDate.getDate() + 3);
                                                        setCollectionPromisedDate(defDate.toISOString().split('T')[0]);
                                                        setCollectionActionTaken('Phone Call');
                                                        setCollectionOutcomeNotes('');
                                                        setCollectionOutcomeError('');
                                                        setShowCollectionOutcomeModal(true);
                                                    }}
                                                    data-testid="tv-record-collection-outcome-btn"
                                                >
                                                    <FileCheck size={11} /> Record Collection Outcome
                                                </button>
                                            </div>
                                        )}
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
                                        {endorsementDetail?.fomsSyncStatus === 'Failed' ? (
                                            <span className="tv-foms-pill tv-foms-pill-failed" data-testid="foms-sync-failed-badge">
                                                <AlertCircle size={11} /> Sync Failed
                                            </span>
                                        ) : endorsementDetail?.endorsementStatus === 'Endorsed' ? (
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
                                    {/* ── Sync Failure Banner & Retry Button (fomsSyncStatus === "Failed") ── */}
                                    {endorsementDetail?.fomsSyncStatus === 'Failed' && (
                                        <div className="tv-foms-sync-fail-banner" role="alert" data-testid="foms-sync-failure-banner">
                                            <div className="tv-foms-sync-fail-info">
                                                <AlertTriangle size={18} className="tv-foms-sync-fail-icon" />
                                                <div>
                                                    <strong className="tv-foms-sync-fail-title">
                                                        FOMS Sync Callback Failed
                                                    </strong>
                                                    <p className="tv-foms-sync-fail-desc">
                                                        {endorsementDetail?.lastSyncError || 'The completion callback to FOMS failed to dispatch. Task remains Completed, but re-synchronization is required to activate the 30-day payment term in FOMS.'}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-danger-sm tv-btn-retry-foms"
                                                onClick={handleResendEndorsementCallback}
                                                disabled={resendingEndorsement}
                                                data-testid="retry-sync-to-foms-btn"
                                            >
                                                <RefreshCw size={12} className={resendingEndorsement ? 'spin' : ''} />
                                                <span>{resendingEndorsement ? 'Retrying Sync...' : 'Retry Sync to FOMS'}</span>
                                            </button>
                                        </div>
                                    )}

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
                                                <span className="tv-foms-calc-term" data-testid="tv-calculated-due-date">
                                                    <Sparkles size={10} />
                                                    {new Date(endorsementDetail.calculatedPaymentDueDate).toLocaleDateString()}
                                                </span>
                                            ) : endorsementDetail?.actualReceivedDate ? (
                                                <span className="tv-foms-calc-term" data-testid="tv-calculated-due-date">
                                                    <Sparkles size={10} />
                                                    {new Date(new Date(endorsementDetail.actualReceivedDate).getTime() + 30 * 86400000).toLocaleDateString()}
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
                                            {endorsementDetail?.fomsSyncStatus === 'Failed' && (
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-danger-sm tv-btn-retry-foms"
                                                    onClick={handleResendEndorsementCallback}
                                                    disabled={resendingEndorsement}
                                                    data-testid="foms-retry-sync-action-btn"
                                                    title="Retry Sync to FOMS"
                                                >
                                                    <RefreshCw size={11} className={resendingEndorsement ? 'spin' : ''} />
                                                    <span>{resendingEndorsement ? 'Retrying Sync...' : 'Retry Sync to FOMS'}</span>
                                                </button>
                                            )}
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
                                                    {endorsementDetail?.fomsSyncStatus !== 'Failed' && (
                                                        <button
                                                            type="button"
                                                            className="tv-btn tv-btn-outline-sm"
                                                            onClick={handleResendEndorsementCallback}
                                                            disabled={resendingEndorsement}
                                                        >
                                                            <RefreshCw size={11} className={resendingEndorsement ? 'spin' : ''} /> Resend Callback to FOMS
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── FOMS Liquidation Correction Section (Integration 5) ── */}
                        {fomsLiquidation && (
                            <div className="tv-section tv-foms-liquidation-section" data-testid="foms-liquidation-section">
                                <div className="tv-foms-header">
                                    <div className="tv-foms-header-title">
                                        <Receipt size={16} className="tv-foms-icon" />
                                        <span>FOMS Expense Liquidation Correction (M2M Integration)</span>
                                    </div>
                                    <div className="tv-foms-header-status" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        {/* Liquidation Status Badge */}
                                        {((liquidationDetail?.liquidationStatus || fomsLiquidation.liquidationStatus || '').toLowerCase().includes('reject')) ? (
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

                                        {/* Priority Badge */}
                                        {((liquidationDetail?.liquidationStatus || fomsLiquidation.liquidationStatus || '').toLowerCase().includes('reject') ||
                                          (fomsLiquidation.dueDate && new Date(fomsLiquidation.dueDate).getTime() < Date.now()) ||
                                          task.priority === 'Urgent') ? (
                                            <span className="liq-badge liq-badge-urgent" data-testid="priority-badge">
                                                Urgent
                                            </span>
                                        ) : (
                                            <span className="liq-badge liq-badge-high" data-testid="priority-badge">
                                                High
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="tv-foms-card">
                                    {/* Stats Banner */}
                                    <div className="tv-foms-stats-banner">
                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">DISPUTED AMOUNT</span>
                                            <span className="tv-foms-stat-amount">
                                                {liquidationDetail?.amount != null
                                                    ? `₱${Number(liquidationDetail.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                    : (fomsLiquidation.amountFormatted || '₱0.00')}
                                            </span>
                                        </div>

                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">REQUEST ID</span>
                                            <span className="tv-foms-invoice-num">{liquidationDetail?.requestId || fomsLiquidation.requestId}</span>
                                        </div>

                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">SLA DEADLINE</span>
                                            <span className="tv-foms-stat-val">
                                                {liquidationDetail?.dueDate
                                                    ? new Date(liquidationDetail.dueDate).toLocaleDateString()
                                                    : (fomsLiquidation.dueDate ? new Date(fomsLiquidation.dueDate).toLocaleDateString() : 'Next Business Day')}
                                            </span>
                                        </div>

                                        <div className="tv-foms-stat-group">
                                            <span className="tv-foms-stat-label">FOMS CALLBACK SYNC</span>
                                            {(liquidationDetail?.fomsSyncStatus === 'CallbackSuccess' || effectiveStatus === 'Completed') ? (
                                                <span className="liq-sync-pill liq-sync-success" data-testid="sync-success-pill">
                                                    <CheckCircle2 size={11} /> CallbackSuccess
                                                </span>
                                            ) : liquidationDetail?.fomsSyncStatus === 'Failed' ? (
                                                <span className="liq-sync-pill liq-sync-failed" data-testid="sync-failed-pill">
                                                    <AlertTriangle size={11} /> Failed
                                                </span>
                                            ) : (
                                                <span className="liq-sync-pill liq-sync-pending" data-testid="sync-pending-pill">
                                                    <Clock size={11} /> Pending
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Requester & Delivery Metadata Drawer */}
                                    <div className="liq-meta-drawer" data-testid="requester-metadata-drawer" style={{ margin: '0.75rem 0' }}>
                                        <div className="liq-meta-row">
                                            <span className="liq-meta-label">Requester Name:</span>
                                            <span className="liq-meta-value">
                                                <User size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                                {liquidationDetail?.requester || fomsLiquidation.requester}
                                            </span>
                                        </div>
                                        {(liquidationDetail?.requesterEmployeeId || fomsLiquidation.requesterEmployeeId) && (
                                            <div className="liq-meta-row">
                                                <span className="liq-meta-label">Employee ID:</span>
                                                <span className="liq-meta-value">{liquidationDetail?.requesterEmployeeId || fomsLiquidation.requesterEmployeeId}</span>
                                            </div>
                                        )}
                                        {(liquidationDetail?.deliveryReference || fomsLiquidation.deliveryReference) && (
                                            <div className="liq-meta-row">
                                                <span className="liq-meta-label">Waybill / Delivery Reference:</span>
                                                <span className="liq-meta-value" style={{ color: '#2563eb' }}>
                                                    <Truck size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                                    {liquidationDetail?.deliveryReference || fomsLiquidation.deliveryReference}
                                                </span>
                                            </div>
                                        )}
                                        {liquidationDetail?.liquidationId && (
                                            <div className="liq-meta-row">
                                                <span className="liq-meta-label">FOMS Liquidation ID:</span>
                                                <span className="liq-meta-value">#{liquidationDetail.liquidationId}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Correction Reason Callout */}
                                    <div className="liq-reason-callout" data-testid="correction-reason-callout">
                                        <div className="liq-reason-header">
                                            <AlertTriangle size={13} />
                                            <span>Finance Manager Correction Reason</span>
                                        </div>
                                        <div className="liq-reason-body">
                                            {liquidationDetail?.correctionReason || fomsLiquidation.correctionReason}
                                        </div>
                                    </div>

                                    {/* Attached Proof and Remarks if submitted */}
                                    {(liquidationDetail?.correctedReceiptsUrl || liquidationDetail?.resolutionRemarks) && (
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.65rem 0.85rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {liquidationDetail.correctedReceiptsUrl && (
                                                <div style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <Paperclip size={13} color="#2563eb" />
                                                    <span style={{ fontWeight: 600, color: '#334155' }}>Corrected Receipts Proof:</span>
                                                    <a
                                                        href={liquidationDetail.correctedReceiptsUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ color: '#2563eb', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 2 }}
                                                        data-testid="corrected-receipts-link"
                                                    >
                                                        <span>View Scanned Document</span>
                                                        <ExternalLink size={11} />
                                                    </a>
                                                </div>
                                            )}
                                            {liquidationDetail.resolutionRemarks && (
                                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                    <span style={{ fontWeight: 600, color: '#334155' }}>Resolution Remarks: </span>
                                                    <span>{liquidationDetail.resolutionRemarks}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Actions Bar */}
                                    <div className="tv-foms-action-bar" style={{ marginTop: '0.85rem' }}>
                                        <span className="tv-foms-action-label">Liquidation FSM Actions:</span>
                                        <div className="tv-foms-action-buttons">
                                            {/* InProgress -> Attach Receipts */}
                                            {(effectiveStatus === 'In Progress' || effectiveStatus === 'Not Started' || effectiveStatus === 'InProgress' || liquidationDetail?.correctionStatus === 'PendingCorrection') && (
                                                <button
                                                    type="button"
                                                    className="tv-btn-primary-sm"
                                                    onClick={() => setShowLiquidationModal(true)}
                                                    data-testid="attach-receipts-btn"
                                                >
                                                    <Paperclip size={12} /> Attach Corrected Receipts
                                                </button>
                                            )}

                                            {/* PendingReview / DonePendingReview / Corrected -> Authorize Completion */}
                                            {(effectiveStatus === 'Done/Pending Review' || effectiveStatus === 'DonePendingReview' || effectiveStatus === 'PendingReview' || liquidationDetail?.correctionStatus === 'Corrected') && effectiveStatus !== 'Completed' && (
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-success-sm"
                                                    onClick={handleAuthorizeLiquidation}
                                                    disabled={authorizingLiquidation || !canAuthorizeLiquidation}
                                                    title={!canAuthorizeLiquidation ? 'Restricted to Coordinator or Manager per FR-024' : 'Authorize Completion & Return to FOMS'}
                                                    data-testid="authorize-completion-btn"
                                                >
                                                    {authorizingLiquidation ? (
                                                        <Loader2 size={12} className="spin" />
                                                    ) : (
                                                        <Send size={12} />
                                                    )}
                                                    Authorize Completion &amp; Return to FOMS
                                                </button>
                                            )}

                                            {/* Manual Retry Sync button if sync failed */}
                                            {liquidationDetail?.fomsSyncStatus === 'Failed' && (
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-danger-sm tv-btn-retry-foms"
                                                    onClick={handleRetryLiquidationSync}
                                                    disabled={retryingLiquidationSync}
                                                    data-testid="retry-sync-btn"
                                                >
                                                    <RefreshCw size={11} className={retryingLiquidationSync ? 'spin' : ''} />
                                                    {retryingLiquidationSync ? 'Retrying...' : 'Retry FOMS Sync'}
                                                </button>
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
                                                className="tv-btn tv-btn-primary tv-btn-sm tv-dms-tracker-btn"
                                                data-testid="tv-dms-tracker-btn"
                                                onClick={handleNavigateToDmsTracker}
                                                title="Open Live Delivery Tracker in DMS Tab"
                                            >
                                                <Truck size={12} />
                                                <span>Live Delivery Tracker</span>
                                            </button>
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
                                                <span
                                                    className={`tv-dms-status-tag ${deliveryDetail.dmsStatus.toLowerCase() === 'cancelled' ? 'tv-dms-status-cancelled' : ''}`}
                                                    data-testid="tv-dms-status-badge"
                                                >
                                                    Status: <strong className={deliveryDetail.dmsStatus.toLowerCase() === 'cancelled' ? 'tv-badge-cancelled' : ''}>{formatDeliveryStatus(deliveryDetail.dmsStatus)}</strong>
                                                </span>
                                            )}
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
                                            const s = `${deliveryDetail.dmsRawStatus || ''} ${deliveryDetail.dmsStatus || ''}`.toLowerCase();
                                            let activeIdx = 0;
                                            if (!s.includes('pending') && (s.includes('delivered') || s.includes('completed'))) activeIdx = 6;
                                            else if (s.includes('out for delivery') || s.includes('doorstep')) activeIdx = 5;
                                            else if (s.includes('transit')) activeIdx = 4;
                                            else if (s.includes('picked up') || s.includes('pickup') || s.includes('pickedup')) activeIdx = 3;
                                            else if (s.includes('assigned') || s.includes('driver')) activeIdx = 2;
                                            else if (s.includes('processing') || s.includes('preparing')) activeIdx = 1;
                                            else activeIdx = 0;

                                            const isCancelled = s.includes('cancelled') || s.includes('canceled');
                                            const isAllDelivered = activeIdx === 6;
                                            const progressPct = isCancelled ? 0 : (Math.max(0, activeIdx) / (stages.length - 1)) * 100;
                                            const formattedTime = deliveryDetail.dmsLastSyncedAt
                                                ? new Date(deliveryDetail.dmsLastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : 'Now';

                                            return (
                                                <div className={`tv-dms-stepper-container ${isCancelled ? 'tv-dms-stepper-cancelled' : ''}`}>
                                                    {isCancelled && (
                                                        <div className="tv-dms-cancelled-stepper-notice" data-testid="tv-dms-cancelled-notice">
                                                            <span className="tv-dms-cancelled-pill">
                                                                <X size={12} strokeWidth={2.5} /> Cancelled in DMS
                                                            </span>
                                                            <span className="tv-dms-cancelled-subtext">
                                                                Logistical order cancelled in DMS. Primary task operational status is preserved in STARS.
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="tv-dms-stepper-inner">
                                                        <div className="tv-dms-stepper-track">
                                                            <div
                                                                className={`tv-dms-stepper-progress ${isCancelled ? 'cancelled' : ''}`}
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
                                                                        className={`tv-dms-step ${isCancelled && isCurrent ? 'cancelled-current current' : isCancelled && idx > activeIdx ? 'cancelled-upcoming' : ''} ${isDone ? 'done' : ''} ${isCurrent && !isCancelled ? 'current' : ''}`}
                                                                    >
                                                                        <div className="tv-dms-step-dot">
                                                                            {isCancelled && isCurrent ? (
                                                                                <X size={12} strokeWidth={2.8} />
                                                                            ) : isDone ? (
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
                                                                            <span className={`tv-dms-step-time ${isCancelled ? 'cancelled' : ''}`}>{formattedTime}</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {deliveryDetail.dmsFailureReason && (
                                        <div
                                            className={`tv-dms-error-box ${deliveryDetail.dmsStatus?.toLowerCase() === 'cancelled' ? 'tv-dms-cancelled-box' : ''}`}
                                            style={{ margin: '4px 0' }}
                                            data-testid="tv-dms-failure-box"
                                        >
                                            <AlertCircle size={14} className="tv-dms-error-icon" />
                                            <div style={{ flex: 1 }}>
                                                <div className="tv-dms-error-title">
                                                    {deliveryDetail.dmsStatus?.toLowerCase() === 'cancelled'
                                                        ? 'Delivery Order Cancelled in DMS'
                                                        : 'Delivery Issue Reported'}
                                                </div>
                                                <div className="tv-dms-error-msg" data-testid="tv-dms-failure-reason">{deliveryDetail.dmsFailureReason}</div>
                                            </div>
                                            {deliveryDetail.dmsStatus?.toLowerCase() === 'cancelled' && (
                                                <button
                                                    type="button"
                                                    className="tv-btn tv-btn-sm tv-btn-outline-sm tv-dms-view-remarks-btn"
                                                    onClick={() => setActiveTab('comments')}
                                                    style={{ marginLeft: 'auto', alignSelf: 'center', whiteSpace: 'nowrap' }}
                                                >
                                                    View Remarks
                                                </button>
                                            )}
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
                                        <div className="tv-dms-grid-item" data-testid="tv-dms-task-type">
                                            <span className="tv-dms-grid-label">Task Type</span>
                                            <span className="tv-dms-grid-value">{deliveryDetail.taskType || 'Standard Delivery'}</span>
                                        </div>
                                        <div className="tv-dms-grid-item" data-testid="tv-dms-package-type">
                                            <span className="tv-dms-grid-label">Package Type</span>
                                            <span className="tv-dms-grid-value">{deliveryDetail.packageType || 'Parcel'}</span>
                                        </div>
                                        <div className="tv-dms-grid-item" data-testid="tv-dms-weight">
                                            <span className="tv-dms-grid-label">Weight</span>
                                            <span className="tv-dms-grid-value">{deliveryDetail.weight || '—'}</span>
                                        </div>
                                        <div className="tv-dms-grid-item" data-testid="tv-dms-item-count">
                                            <span className="tv-dms-grid-label">Item Count</span>
                                            <span className="tv-dms-grid-value">{deliveryDetail.itemCount ? `${deliveryDetail.itemCount} item(s)` : '1 item'}</span>
                                        </div>
                                        {(deliveryDetail.courierEmployeeId || deliveryDetail.courierFullName) && (
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-assigned-driver">
                                                <span className="tv-dms-grid-label">Assigned Driver</span>
                                                {(() => {
                                                    const driverInfo = formatDriverDisplay(
                                                        deliveryDetail.courierFullName,
                                                        deliveryDetail.courierEmployeeId,
                                                        deliveryDetail.courierIsActive,
                                                        { layout: 'name-only' }
                                                    );
                                                    return (
                                                        <span className="tv-dms-grid-value tv-dms-driver-value">
                                                            <span className="tv-dms-paired-driver" data-testid="tv-dms-paired-driver" style={{ display: 'none' }}>
                                                                {formatDriverDisplayShared(deliveryDetail.courierFullName, deliveryDetail.courierEmployeeId, deliveryDetail.courierIsActive, { layout: 'id-first' }).displayText}
                                                            </span>
                                                            <span className="tv-dms-driver-name" data-testid="tv-dms-driver-name">{driverInfo.displayText}</span>
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
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-pending-task-type">
                                                <span className="tv-dms-grid-label">Task Type</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.taskType || 'Standard Delivery'}</span>
                                            </div>
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-pending-package-type">
                                                <span className="tv-dms-grid-label">Package Type</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.packageType || 'Parcel'}</span>
                                            </div>
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-pending-weight">
                                                <span className="tv-dms-grid-label">Weight</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.weight || '—'}</span>
                                            </div>
                                            <div className="tv-dms-grid-item" data-testid="tv-dms-pending-item-count">
                                                <span className="tv-dms-grid-label">Item Count</span>
                                                <span className="tv-dms-grid-value">{deliveryDetail.itemCount ? `${deliveryDetail.itemCount} item(s)` : '1 item'}</span>
                                            </div>
                                            {(deliveryDetail.courierEmployeeId || deliveryDetail.courierFullName) && (
                                                <div className="tv-dms-grid-item" data-testid="tv-dms-pending-driver">
                                                    <span className="tv-dms-grid-label">Assigned Driver</span>
                                                    {(() => {
                                                        const driverInfo = formatDriverDisplay(
                                                            deliveryDetail.courierFullName,
                                                            deliveryDetail.courierEmployeeId,
                                                            deliveryDetail.courierIsActive,
                                                            { layout: 'name-only' }
                                                        );
                                                        return (
                                                            <span className="tv-dms-grid-value tv-dms-driver-value">
                                                                <span className="tv-dms-paired-driver" data-testid="tv-dms-paired-driver" style={{ display: 'none' }}>{formatDriverDisplayShared(deliveryDetail.courierFullName, deliveryDetail.courierEmployeeId, deliveryDetail.courierIsActive, { layout: 'id-first' }).displayText}</span>
                                                                <span className="tv-dms-driver-name" data-testid="tv-dms-pending-driver-name">{driverInfo.displayText}</span>
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
                                            <button
                                                type="button"
                                                className="tv-btn tv-btn-outline-sm tv-dms-tracker-btn"
                                                data-testid="tv-dms-pending-tracker-btn"
                                                onClick={handleNavigateToDmsTracker}
                                                title="Open in Live Delivery Tracker"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                            >
                                                <Truck size={11} />
                                                <span>Live Delivery Tracker</span>
                                                <ExternalLink size={10} />
                                            </button>
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
                            <div className="tv-form-row tv-form-row-2">
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Item Count</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="tv-form-input"
                                        placeholder="e.g. 3"
                                        value={editingDelivery.itemCount ?? ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, itemCount: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                                    />
                                </div>
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Weight</label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. 2.5 kg"
                                        value={editingDelivery.weight || ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, weight: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="tv-form-row tv-form-row-2">
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Package Type</label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. Parcel, Box"
                                        value={editingDelivery.packageType || ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, packageType: e.target.value }))}
                                    />
                                </div>
                                <div className="tv-form-group">
                                    <label className="tv-form-label">Task Type</label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        placeholder="e.g. Standard Delivery"
                                        value={editingDelivery.taskType || ''}
                                        onChange={e => setEditingDelivery(prev => ({ ...prev, taskType: e.target.value }))}
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

            {/* ── Coordinator Collection Outcome Modal (FOMS Integration 3 / FOMS FR-033) ── */}
            {showCollectionOutcomeModal && fomsCollection && (
                <div className="tv-modal-overlay" onClick={() => !submittingCollectionOutcome && setShowCollectionOutcomeModal(false)}>
                    <div className="tv-modal tv-modal-delivery" onClick={e => e.stopPropagation()} data-testid="tv-collection-outcome-modal">
                        <div className="tv-modal-header">
                            <div>
                                <h3 className="tv-modal-title">Submit Collection Follow-up Outcome</h3>
                                <p className="tv-modal-sub">
                                    Record final resolution and dispatch outcome callback to FOMS (FOMS FR-033).
                                </p>
                            </div>
                        </div>

                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (collectionOutcomeType === 'Promised to Pay' && !collectionPromisedDate) {
                                    setCollectionOutcomeError('Promised payment date is required when outcome is Promised to Pay.');
                                    return;
                                }
                                setSubmittingCollectionOutcome(true);
                                setCollectionOutcomeError('');

                                try {
                                    const payload = {
                                        outcome: collectionOutcomeType,
                                        promisedPaymentDate: collectionOutcomeType === 'Promised to Pay' && collectionPromisedDate ? new Date(collectionPromisedDate).toISOString() : null,
                                        actionTaken: collectionActionTaken.trim() || 'Client Contact',
                                        notes: collectionOutcomeNotes.trim() || null,
                                    };
                                    const res = await api.post(`/api/foms-integration/tasks/${task.taskId}/collection-outcome`, payload);
                                    if (res.data?.isSuccess) {
                                        toastSuccess('Collection follow-up outcome recorded and dispatched to FOMS.');
                                        setShowCollectionOutcomeModal(false);
                                        setLocalStatus('Completed');
                                        if (onUpdate) {
                                            onUpdate({ ...task, taskStatus: 'Completed' });
                                        }
                                    } else {
                                        setCollectionOutcomeError(res.data?.message || 'Failed to submit outcome to FOMS.');
                                    }
                                } catch (err: any) {
                                    setCollectionOutcomeError(err?.response?.data?.message || err?.message || 'Error transmitting collection outcome.');
                                } finally {
                                    setSubmittingCollectionOutcome(false);
                                }
                            }}
                        >
                            <div className="tv-modal-body">
                                {collectionOutcomeError && (
                                    <div className="tv-delivery-error-box" style={{ marginBottom: 12 }}>
                                        <AlertCircle size={14} />
                                        <span>{collectionOutcomeError}</span>
                                    </div>
                                )}

                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Invoice &amp; Client</span>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{fomsCollection.invoiceNumber} - {fomsCollection.clientName}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Amount Due</span>
                                            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#dc2626' }}>{fomsCollection.amountDue}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="tv-form-group">
                                    <label className="tv-form-label">
                                        Outcome <span className="tv-form-req">*</span>
                                    </label>
                                    <select
                                        className="tv-form-input"
                                        value={collectionOutcomeType}
                                        onChange={e => {
                                            setCollectionOutcomeType(e.target.value);
                                            setCollectionOutcomeError('');
                                        }}
                                        data-testid="tv-outcome-type-select"
                                    >
                                        <option value="Promised to Pay">Promised to Pay</option>
                                        <option value="Disputed">Disputed</option>
                                        <option value="Unreachable">Unreachable</option>
                                    </select>
                                </div>

                                {collectionOutcomeType === 'Promised to Pay' && (
                                    <div className="tv-form-group">
                                        <label className="tv-form-label">
                                            Promised Payment Date <span className="tv-form-req">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            className="tv-form-input"
                                            value={collectionPromisedDate}
                                            onChange={e => {
                                                setCollectionPromisedDate(e.target.value);
                                                setCollectionOutcomeError('');
                                            }}
                                            data-testid="tv-promised-date-input"
                                            required
                                        />
                                    </div>
                                )}

                                <div className="tv-form-group">
                                    <label className="tv-form-label">
                                        Action Taken <span className="tv-form-req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="tv-form-input"
                                        value={collectionActionTaken}
                                        onChange={e => setCollectionActionTaken(e.target.value)}
                                        placeholder="e.g. Phone Call, Demand Letter Delivered, On-site Visit"
                                        data-testid="tv-action-taken-input"
                                        required
                                    />
                                </div>

                                <div className="tv-form-group">
                                    <label className="tv-form-label">
                                        Notes / Discussion Details
                                    </label>
                                    <textarea
                                        className="tv-form-textarea"
                                        rows={3}
                                        value={collectionOutcomeNotes}
                                        onChange={e => setCollectionOutcomeNotes(e.target.value)}
                                        placeholder="Enter notes from client contact or promise details..."
                                        data-testid="tv-outcome-notes-textarea"
                                    />
                                </div>
                            </div>

                            <div className="tv-modal-footer">
                                <button
                                    type="button"
                                    className="tv-btn tv-btn-secondary"
                                    disabled={submittingCollectionOutcome}
                                    onClick={() => setShowCollectionOutcomeModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="tv-btn tv-btn-primary"
                                    disabled={submittingCollectionOutcome}
                                    data-testid="tv-submit-outcome-btn"
                                >
                                    {submittingCollectionOutcome ? <Loader2 size={13} className="spin" /> : <FileCheck size={13} />}
                                    {submittingCollectionOutcome ? 'Transmitting Callback…' : 'Submit Outcome to FOMS'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* FOMS Liquidation Attach Receipts Modal (Integration 5) */}
            {showLiquidationModal && fomsLiquidation && (
                <SubmitCorrectionModal
                    isOpen={showLiquidationModal}
                    task={{
                        id: task.taskId,
                        taskId: task.taskId,
                        taskNumber: (task as any).taskNumber || task.taskId.substring(0, 8),
                        requestId: liquidationDetail?.requestId || fomsLiquidation.requestId,
                        liquidationId: liquidationDetail?.liquidationId || fomsLiquidation.liquidationId,
                        requester: liquidationDetail?.requester || fomsLiquidation.requester,
                        requesterEmployeeId: liquidationDetail?.requesterEmployeeId || fomsLiquidation.requesterEmployeeId,
                        deliveryReference: liquidationDetail?.deliveryReference || fomsLiquidation.deliveryReference,
                        liquidationStatus: liquidationDetail?.liquidationStatus || fomsLiquidation.liquidationStatus,
                        correctionReason: liquidationDetail?.correctionReason || fomsLiquidation.correctionReason,
                        amount: liquidationDetail?.amount != null ? liquidationDetail.amount : fomsLiquidation.amount,
                        dueDate: liquidationDetail?.dueDate || fomsLiquidation.dueDate,
                        fomsSyncStatus: liquidationDetail?.fomsSyncStatus || 'Pending',
                        correctedReceiptsUrl: liquidationDetail?.correctedReceiptsUrl,
                        resolutionRemarks: liquidationDetail?.resolutionRemarks,
                    }}
                    onClose={() => setShowLiquidationModal(false)}
                    onSubmitSuccess={async updated => {
                        setShowLiquidationModal(false);
                        setLocalStatus('Done/Pending Review');
                        setLiquidationDetail((prev: any) => ({
                            ...(prev || {}),
                            correctedReceiptsUrl: updated?.correctedReceiptsUrl,
                            resolutionRemarks: updated?.resolutionRemarks,
                            correctionStatus: 'Corrected',
                        }));
                        await fetchLiquidationDetail();
                        if (onUpdate) {
                            onUpdate({ ...task, taskStatus: 'Done/Pending Review' });
                        }
                    }}
                />
            )}
        </>
    );
};

export default TaskView;