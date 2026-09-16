import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SpeedexLogo from '../../assets/SpeedexLogo.jpg';
import {
    LayoutDashboard,
    ClipboardList,
    UserCircle2,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronRight,
    X,
    Save,
    Eye,
    EyeOff,
    Pencil,
    Lock,
    User,
    Phone,
    Loader2,
    Hash,
    Shield,

    FileText,
    Plus,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    MessageSquare,
    RefreshCw,
    LogOut,
    Mail,
    Activity,
    Search,
    Bell,
    Paperclip,
    Download,
    Lightbulb,
    PauseCircle,
} from 'lucide-react';
import './OpEmployee_Dashboard.css';
import { usePreventBackNav } from '../../components/Auth/usePreventBackNav';
import { useToast } from '../../components/Toast/Toast';
import GlobalHeader, { NotificationItem } from '../../components/GlobalHeader/GlobalHeader';
import Sidebar from '../../components/Sidebar/Sidebar';
import StatusCard from '../../components/StatusCard/StatusCard';

import FormModal from '../../components/FormModal/FormModal';
import EmptyState from '../../components/ui/EmptyState';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import TaskComments from '../../components/TaskComments/TaskComments';
import TaskRecommendations from '../../components/TaskRecommendations/TaskRecommendations';
import api from '../../api';
import axios from 'axios';
import AnnouncementsTab from '../../components/AnnouncementsTab/AnnouncementsTab';
import TaskCharts from '../../components/TaskCharts/TaskCharts';
import { BarChart2 } from 'lucide-react';

// --- Helpers ------------------------------------------------------------------

const getAccountIdFromToken = (): string => {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return '';
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '')));
        return payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
            ?? payload.nameid
            ?? payload.sub
            ?? payload.nameidentifier
            ?? '';
    } catch { return ''; }
};

// --- Types --------------------------------------------------------------------

type Priority = 'high' | 'medium' | 'low';
type TaskStatus = 'pending' | 'assigned' | 'in-progress' | 'pending-review' | 'done' | 'completed' | 'on-hold' | 'overdue';
type NavTab = 'dashboard' | 'my-tasks' | 'task-progress-review' | 'profile' | 'activity_logs' | 'announcements' | 'notifications';

interface Task {
    id: string;
    name: string;
    description: string;
    deadline: string;
    priority: Priority;
    status: TaskStatus;
    progress: number;
    assignedBy: string;
    createdAt?: string;
    remarks?: string;
    category?: string;
    supportingEvidenceUrl?: string;
    referenceNumber?: string;
    isConfidential?: boolean;
    pushBackComment?: string;
    reviewRemarks?: string;
    holdReason?: string;
    isApproved?: boolean;
}

interface TaskResponseDTO {
    id?: string;
    taskId?: string;
    title?: string;
    taskTitle?: string;
    description?: string;
    taskDescription?: string;
    classification?: number;
    taskCategory?: string;
    priorityLevel?: number;
    priority?: string;
    deadline?: string;
    dueAt?: string;
    status?: number;
    taskStatus?: string;
    assignees?: { userId?: string; fullName?: string; employeeNumber?: string; role?: string }[];
    assignedEmployee?: string;
    myCompletionPercentage?: number;
    createdByName?: string;
    createdByEmployee?: string;
    createdAt?: string;
    supportingEvidenceUrl?: string;
    taskReferenceNumber?: string;
    isConfidential?: boolean;
    pushBackComment?: string;
    reviewRemarks?: string;
    holdReason?: string;
    isApproved?: boolean;
}

interface UserProfile {
    employeeId: string;
    fullName: string;
    phone: string;
    email: string;
    role: string;
    accountStatus: string;
    presenceStatus?: string;
}



const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };
const STATUS_LABELS: Record<number, string> = { 0: 'Assigned', 1: 'In Progress', 2: 'Pending Admin Review', 3: 'Completed', 4: 'On Hold', 5: 'Cancelled' };
const NOTIF_TYPE_MAP: Record<number, string> = {
    0: 'TaskAssigned', 1: 'TaskUpdated', 2: 'TaskOverdue', 3: 'DeadlineWarning',
    4: 'PushBack', 5: 'TaskCancelled', 6: 'TaskResumed', 7: 'TaskOnHold',
    8: 'TaskCompleted', 9: 'TemplateTaskUnassigned'
};

const dtoToTask = (dto: TaskResponseDTO): Task => {
    const taskId = dto.id ?? dto.taskId ?? '';
    const title = dto.title ?? dto.taskTitle ?? '';
    const description = dto.description ?? dto.taskDescription ?? '';
    const priorityStr = dto.priorityLevel !== undefined ? PRIORITY_LABELS[dto.priorityLevel] : (dto.priority || 'Medium');
    const dueAt = dto.deadline ?? dto.dueAt ?? '';
    const statusStr = dto.status !== undefined ? STATUS_LABELS[dto.status] : (dto.taskStatus || 'Assigned');
    const assignedEmployee = dto.assignees?.length ? dto.assignees[0].fullName ?? '' : (dto.assignedEmployee ?? '');
    const createdByEmployee = dto.createdByName ?? dto.createdByEmployee ?? '';

    const priorityMap: Record<string, Priority> = {
        High: 'high', Medium: 'medium', Low: 'low', Urgent: 'high',
    };
    const statusMap: Record<string, TaskStatus> = {
        Draft: 'pending', Pending: 'pending', Assigned: 'assigned',
        'In Progress': 'in-progress', 'Pending Admin Review': 'pending-review', Done: 'done', Completed: 'completed',
        'On Hold': 'on-hold',
    };
    const status: TaskStatus = statusMap[statusStr] ?? 'pending';
    const defaultProgress: Record<TaskStatus, number> = {
        pending: 0, assigned: 0, 'in-progress': 50, 'pending-review': 90, done: 90, completed: 100, overdue: 0,
    };
    return {
        id: taskId,
        name: title,
        description: description,
        deadline: dueAt ? dueAt.split('T')[0] : '',
        priority: priorityMap[priorityStr] ?? 'medium',
        status,
        // Use the employee's own reported completion percentage when the
        // backend provides it; fall back to the status-derived default.
        progress: dto.myCompletionPercentage !== undefined && dto.myCompletionPercentage !== null
            ? dto.myCompletionPercentage
            : defaultProgress[status],
        assignedBy: createdByEmployee,
        createdAt: dto.createdAt ?? '',
        category: '',
        supportingEvidenceUrl: dto.supportingEvidenceUrl,
        referenceNumber: dto.taskReferenceNumber,
        isConfidential: dto.isConfidential ?? false,
        pushBackComment: dto.pushBackComment,
        reviewRemarks: dto.reviewRemarks,
        holdReason: dto.holdReason,
        isApproved: dto.isApproved,
    };
};

// --- Helpers ------------------------------------------------------------------

const fmtDate = (d: string): string => {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
    Login: 'Login', Logout: 'Logout', Create: 'Create', Read: 'Read', Update: 'Update',
    Delete: 'Delete', StatusChange: 'Status Change', Upload: 'Upload', Export: 'Export',
    AccessDenied: 'Access Denied', BlockedAction: 'Blocked Action', DuplicateOverride: 'Duplicate Override',
};

const formatActionType = (raw?: string): string => {
    if (!raw) return '—';
    if (AUDIT_ACTION_LABELS[raw]) return AUDIT_ACTION_LABELS[raw];
    return raw.replace(/([A-Z])/g, ' $1').trim();
};

const getAuditBadgeStyle = (raw: string): { background: string; color: string } => {
    switch (raw) {
        case 'Login': case 'Create':
            return { background: 'var(--status-active-bg)', color: 'var(--status-active)' };
        case 'Logout':
            return { background: 'var(--status-pending-bg)', color: 'var(--status-pending)' };
        case 'Delete': case 'AccessDenied': case 'BlockedAction':
            return { background: 'var(--status-failed-bg)', color: 'var(--status-failed)' };
        case 'DuplicateOverride':
            return { background: '#ede9fe', color: '#6d28d9' };
        default:
            return { background: 'var(--status-new-bg)', color: 'var(--status-new)' };
    }
};

const fmtChangeValue = (v?: string | null): string => {
    if (!v) return '';
    const s = String(v);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
};

const renderChanges = (oldValue?: string | null, newValue?: string | null) => {
    if (!oldValue && !newValue) return '—';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {oldValue ? <span title={String(oldValue)}>Old: {fmtChangeValue(oldValue)}</span> : null}
            {newValue ? <span title={String(newValue)}>New: {fmtChangeValue(newValue)}</span> : null}
        </div>
    );
};

const isEffectivelyOverdue = (t: Task): boolean =>
    t.status !== 'completed' && t.status !== 'done' && t.status !== 'pending-review' && t.status !== 'assigned' && t.status !== 'on-hold' && !!t.deadline && new Date(t.deadline + 'T00:00:00') < new Date();

const effectiveStatus = (t: Task): TaskStatus =>
    isEffectivelyOverdue(t) ? 'overdue' : t.status;

const ROLE_MAP: Record<number, string> = { 0: 'Manager', 1: 'Coordinator', 2: 'Dispatcher', 3: 'Encoder', 4: 'Courier', 5: 'Accountant' };
const toDisplayRole = (role: any) => {
    if (typeof role === 'number') return ROLE_MAP[role] || String(role);
    if (typeof role === 'string') {
        const num = parseInt(role, 10);
        if (!isNaN(num)) return ROLE_MAP[num] || role;
        return role;
    }
    return String(role || '');
};

const calcDays = (start: string, end: string): number =>
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;

const getInitials = (name: string): string => {
    if (!name) return 'OP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
};

// --- Meta Maps ----------------------------------------------------------------

const statusMeta: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', cls: 'badge-blue', icon: <Clock size={11} /> },
    assigned: { label: 'Assigned', cls: 'badge-purple', icon: <Clock size={11} /> },
    'in-progress': { label: 'In Progress', cls: 'badge-amber', icon: <Loader2 size={11} /> },
    'pending-review': { label: 'Pending Review', cls: 'badge-purple', icon: <Eye size={11} /> },
    done: { label: 'Done', cls: 'badge-blue', icon: <CheckCircle2 size={11} /> },
    completed: { label: 'Completed', cls: 'badge-green', icon: <CheckCircle2 size={11} /> },
    'on-hold': { label: 'On Hold', cls: 'badge-gray', icon: <PauseCircle size={11} /> },
    overdue: { label: 'Overdue', cls: 'badge-red', icon: <AlertCircle size={11} /> },
};

const FSM_EMPLOYEE_TRANSITIONS: Record<string, TaskStatus[]> = {
    pending: ['in-progress'],
    assigned: ['in-progress'],
    'in-progress': ['pending-review'],
    'on-hold': [],
    done: [],
    completed: [],
};

const priorityMeta: Record<Priority, { cls: string; bar: string }> = {
    high: { cls: 'prio-high', bar: 'bar-red' },
    medium: { cls: 'prio-medium', bar: 'bar-amber' },
    low: { cls: 'prio-low', bar: 'bar-green' },
};

// --- Nav Config ---------------------------------------------------------------

const NAV_GROUPS: { label: string; items: { tab: NavTab; icon: React.FC<any>; label: string }[] }[] = [
    {
        label: 'MAIN MENU',
        items: [
            { tab: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { tab: 'my-tasks', icon: ClipboardList, label: 'My Tasks' },
        ],
    },
    {
        label: 'WORKFLOW',
        items: [
            { tab: 'task-progress-review', icon: Eye, label: 'Task Progress Review' },
        ],
    },
    {
        label: 'PERSONAL',
        items: [
            { tab: 'profile', icon: UserCircle2, label: 'Profile' },
            { tab: 'activity_logs', icon: Activity, label: 'Activity Logs' },
        ],
    },
];

// --- Task Detail Modal --------------------------------------------------------

interface TaskDetailProps {
    task: Task;
    onUpdate: () => void;
    onClose: () => void;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ task, onUpdate, onClose }) => {
    const es = effectiveStatus(task);
    const sm = statusMeta[es];
    const pm = priorityMeta[task.priority];
    const [showComments, setShowComments] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);
    const accountId = getAccountIdFromToken();

    // ── Task attachments (view-only for employees) ──
    const [attachments, setAttachments] = useState<{ id: string; fileName: string; fileSize: number; uploadedByName?: string }[]>([]);
    const [attachmentsLoading, setAttachmentsLoading] = useState(true);
    const [downloadError, setDownloadError] = useState('');
    const token = localStorage.getItem('authToken') ?? '';

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setAttachmentsLoading(true);
            setDownloadError('');
            try {
                const res = await api.get(`/api/tasks/${task.id}/attachments`, { pageNumber: 1, pageSize: 100 });
                const json = res.data;
                const d = json?.data;
                const items: any[] = Array.isArray(json) ? json : (Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []));
                if (!cancelled) {
                    setAttachments(items.map((a: any) => ({
                        id: a.id ?? '',
                        fileName: a.fileName ?? '',
                        fileSize: a.fileSize ?? 0,
                        uploadedByName: a.uploadedByName ?? '',
                    })));
                }
            } catch {
                if (!cancelled) setAttachments([]);
            } finally {
                if (!cancelled) setAttachmentsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [task.id]);

    const formatFileSize = (bytes: number): string => {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleDownloadAttachment = async (attachmentId: string, fileName: string) => {
        setDownloadError('');
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

    return (
        <FormModal isOpen onClose={onClose} title={task.isConfidential ? `[CONFIDENTIAL] ${task.name}` : task.name} subtitle={sm.label} size="md"
            footer={
                <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={onClose}>Close</button>
                    {task.status !== 'completed' && task.status !== 'done' && task.status !== 'on-hold' && (
                        <button className="btn btn-primary" onClick={onUpdate}>
                            <Pencil size={13} /> Update Progress
                        </button>
                    )}
                </div>
            }
        >
            {task.description && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Description</label>
                    <p style={{ margin: '4px 0 0', fontSize: 14 }}>{task.description}</p>
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {[
                    { label: 'Deadline', value: fmtDate(task.deadline) },
                    { label: 'Priority', value: task.priority, style: { textTransform: 'capitalize' as const } },
                    { label: 'Assigned by', value: task.assignedBy },
                    { label: 'Progress', value: `${task.progress}%` },
                    ...(task.referenceNumber ? [{ label: 'Ref #', value: task.referenceNumber }] : []),
                    ...(task.category ? [{ label: 'Category', value: task.category }] : []),
                    ...(task.supportingEvidenceUrl ? [{ label: 'Document', value: task.supportingEvidenceUrl ?? '' }] : []),
                ].map(({ label, value, style }: { label: string; value: string; style?: any }) => (
                    <div key={label}>
                        <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</label>
                        {label === 'Document' ? (
                            <a href={value} target="_blank" rel="noopener noreferrer"
                                style={{ marginTop: 4, fontSize: 13, color: 'var(--primary)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <FileText size={13} /> {value.split('/').pop() || 'View'}
                            </a>
                        ) : (
                            <p style={{ margin: '4px 0 0', fontSize: 14, ...(style || {}) }}>{value}</p>
                        )}
                    </div>
                ))}
            </div>
            <div className="tc-bar" style={{ height: 8, marginBottom: 12 }}>
                <div className={`tc-fill ${pm.bar}`} style={{ width: `${task.progress}%` }} />
            </div>

            {task.status === 'on-hold' && (
                <div style={{
                    marginBottom: 12, padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                    <PauseCircle size={14} style={{ color: '#D97706', marginTop: 1, flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 2 }}>
                            Task On Hold — read-only
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {task.holdReason
                                ? <>Reason: {task.holdReason}</>
                                : 'This task has been paused by the assigner and cannot be updated until it is resumed.'}
                        </div>
                    </div>
                </div>
            )}

            {/* Task Attachments (view-only for employees) */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Paperclip size={13} /> Attachments
                    {attachments.length > 0 && (
                        <span className="tv-attach-count">{attachments.length}</span>
                    )}
                </label>
                {attachmentsLoading ? (
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Loading attachments…</p>
                ) : attachments.length === 0 ? (
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No attachments.</p>
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
                                        onClick={() => handleDownloadAttachment(a.id, a.fileName)}>
                                        <Download size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {downloadError && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--status-failed)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertCircle size={12} /> {downloadError}
                    </p>
                )}
            </div>
            {task.remarks && (
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Remarks</label>
                    <p style={{ margin: '4px 0 0', fontSize: 14 }}>{task.remarks}</p>
                </div>
            )}
            {task.pushBackComment && (
                <div style={{ marginBottom: 12, padding: 10, background: 'rgba(238,93,80,0.06)', borderRadius: 8, border: '1px solid rgba(238,93,80,0.15)' }}>
                    <label style={{ fontSize: 12, color: 'var(--status-failed)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <RefreshCw size={12} /> Coordinator Push-Back Comment
                    </label>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-primary)' }}>"{task.pushBackComment}"</p>
                </div>
            )}
            {task.reviewRemarks && (
                <div style={{ marginBottom: 12, padding: 10, background: 'rgba(5,205,153,0.06)', borderRadius: 8, border: '1px solid rgba(5,205,153,0.15)' }}>
                    <label style={{ fontSize: 12, color: 'var(--status-active)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} /> Review Remarks
                    </label>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-primary)' }}>{task.reviewRemarks}</p>
                </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setShowComments(v => !v)}
                >
                    <MessageSquare size={16} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Comments</span>
                    {showComments ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
                </div>
                {showComments && (
                    <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
                        <TaskComments taskId={task.id} currentEmployeeId={accountId} taskReferenceNumber={task.referenceNumber} />
                    </div>
                )}

                <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginTop: 12 }}
                    onClick={() => setShowRecommendations(v => !v)}
                >
                    <Lightbulb size={16} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Recommendations</span>
                    {showRecommendations ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
                </div>
                {showRecommendations && (
                    <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
                        <TaskRecommendations taskId={task.id} />
                    </div>
                )}
            </div>
        </FormModal>
    );
};

// --- Progress Update Modal ----------------------------------------------------

interface ProgressModalProps {
    task: Task;
    onSave: (id: string, status: TaskStatus, progress: number, remarks: string) => Promise<void>;
    onClose: () => void;
}

const ProgressModal: React.FC<ProgressModalProps> = ({ task, onSave, onClose }) => {
    const baseStatus = task.status === 'overdue' ? 'in-progress' : task.status;
    const [status, setStatus] = useState<TaskStatus>(baseStatus);
    const [progress, setProgress] = useState(task.progress);
    const [remarks, setRemarks] = useState(task.remarks ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [fsmError, setFsmError] = useState('');

    const handleStatusChange = (s: TaskStatus) => {
        const validNext = FSM_EMPLOYEE_TRANSITIONS[baseStatus] ?? [];
        if (!validNext.includes(s)) {
            setFsmError(`Invalid transition: cannot move from "${statusMeta[baseStatus]?.label ?? baseStatus}" to "${statusMeta[s]?.label ?? s}". Status sequence violation detected.`);
            return;
        }
        setFsmError('');
        setStatus(s);
        if (s === 'pending-review') setProgress(100);
        if (s === 'in-progress' && progress === 0) setProgress(25);
    };

    const handleSave = async () => {
        if (status === baseStatus && (!remarks.trim() || remarks.trim() === (task.remarks ?? '').trim())) {
            setFsmError('No changes detected. Update the status or remarks to proceed.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            await onSave(task.id, validNext.length > 0 ? status : baseStatus, progress, remarks);
            onClose();
        } catch (err: any) {
            setError(err.message ?? 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const validNext = FSM_EMPLOYEE_TRANSITIONS[baseStatus] ?? [];
    const statusOptions: { value: TaskStatus; label: string }[] = validNext.map(s => ({
        value: s,
        label: statusMeta[s]?.label ?? s,
    }));

    return (
        <FormModal isOpen onClose={onClose} title="Update Progress" subtitle={task.name} size="sm"
            footer={
                <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Save size={13} /> Save</>}
                    </button>
                </div>
            }
        >
            {error && (
                <div className="form-api-error" style={{ marginBottom: 12 }}>
                    <AlertCircle size={14} /><span>{error}</span>
                </div>
            )}
            {fsmError && (
                <div className="form-api-error" style={{ marginBottom: 12 }}>
                    <AlertCircle size={14} /><span>{fsmError}</span>
                </div>
            )}
            {validNext.length === 0 ? (
                <div className="field" style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <AlertCircle size={18} style={{ marginBottom: 6 }} />
                    <p style={{ fontSize: 13 }}>This task is in "{statusMeta[baseStatus]?.label ?? baseStatus}" status and cannot be updated further. Contact your admin if you need changes.</p>
                </div>
            ) : (
                <>
                    <div className="field">
                        <label>Status — <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>current: {statusMeta[baseStatus]?.label ?? baseStatus}</span></label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {statusOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    className={`filter-pill${status === opt.value ? ' active' : ''}`}
                                    onClick={() => handleStatusChange(opt.value)}
                                >
                                    {statusMeta[opt.value].icon} {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="field">
                        <label>Progress — {progress}%</label>
                        <input
                            type="range" min={0} max={100} step={5} value={progress}
                            onChange={e => setProgress(Number(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary)' }}
                        />
                        <div className="tc-bar" style={{ marginTop: 6, height: 8 }}>
                            <div
                                className={`tc-fill ${priorityMeta[task.priority].bar}`}
                                style={{ width: `${progress}%`, transition: 'width 0.2s' }}
                            />
                        </div>
                    </div>
                </>
            )}

            <div className="field">
                <label>Remarks <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                    className="leave-reason-textarea" rows={3} maxLength={300}
                    placeholder="Add any notes about your progress…"
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                />
                <div className="leave-char-count">{remarks.length} / 300</div>
            </div>
        </FormModal>
    );
};

// --- Task Card ----------------------------------------------------------------

interface TaskCardProps {
    task: Task;
    onView: (id: string) => void;
    onUpdate: (id: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onView, onUpdate }) => {
    const es = effectiveStatus(task);
    const sm = statusMeta[es];
    const pm = priorityMeta[task.priority];
    const od = es === 'overdue';
    const daysLeft = task.deadline
        ? Math.ceil((new Date(task.deadline + 'T00:00:00').getTime() - Date.now()) / 86400000)
        : null;

    return (
        <div
            className={`task-card task-card-clickable${od ? ' task-card-overdue' : ''}`}
            onClick={() => onView(task.id)}
            role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onView(task.id)}
        >
            <div className="tc-top">
                <span className={`prio-strip ${pm.cls}`} />
                <div className="tc-header">
                    <h4 className="tc-name">{task.name}</h4>
                    {task.isConfidential && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--status-failed)', background: 'rgba(238,93,80,0.08)', padding: '1px 5px', borderRadius: 3, marginLeft: 6, whiteSpace: 'nowrap' }}>CONFIDENTIAL</span>}
                    <span className={`badge ${sm.cls}`}>{sm.icon}{sm.label}</span>
                </div>
            </div>
            <p className="tc-desc">{task.description}</p>
            <div className="tc-meta">
                <span className={`tc-deadline${od ? ' overdue-text' : daysLeft !== null && daysLeft <= 2 ? ' warning-text' : ''}`}>
                    {od ? '? Overdue'
                        : daysLeft !== null
                            ? daysLeft === 0 ? 'Due today'
                                : daysLeft === 1 ? 'Due tomorrow'
                                    : `${daysLeft}d left`
                            : fmtDate(task.deadline)}
                </span>
                <span className="tc-date">{fmtDate(task.deadline)}</span>
            </div>
            <div className="tc-progress-row">
                <div className="tc-bar">
                    <div className={`tc-fill ${pm.bar}`} style={{ width: `${task.progress}%` }} />
                </div>
                <span className="tc-pct">{task.progress}%</span>
            </div>
            {task.status === 'completed' && (
                <div className="tc-actions">
                    <span className="completed-pill"><CheckCircle2 size={12} /> Done</span>
                </div>
            )}
        </div>
    );
};

// --- Dashboard Tab ------------------------------------------------------------

interface DashboardTabProps {
    tasks: Task[];
    user: UserProfile;
    onView: (id: string) => void;
    onUpdate: (id: string) => void;
    onGoTasks: () => void;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ tasks, user, onView, onUpdate, onGoTasks }) => {
    // My Progress card - paginated, newest first
    const [progressSearch, setProgressSearch] = useState('');
    const [progressStatus, setProgressStatus] = useState('');
    const [progressPage, setProgressPage] = useState(1);
    // High Priority Tasks card - paginated
    const [urgentSearch, setUrgentSearch] = useState('');
    const [urgentStatus, setUrgentStatus] = useState('');
    const [urgentPage, setUrgentPage] = useState(1);

    const URGENT_PAGE_SIZE = 6;
    const PROGRESS_PAGE_SIZE = 8;

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'completed').length;
    const inProg = tasks.filter(t => t.status === 'in-progress').length;
    const overdue = tasks.filter(t => effectiveStatus(t) === 'overdue').length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Employee';
    const initials = getInitials(user.fullName);

    // My Progress - always newest first, searchable + status filter, paginated.
    const progressSource = [...tasks].sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || ''));
    const progressFiltered = progressSource
        .filter(t => !progressSearch || t.name.toLowerCase().includes(progressSearch.toLowerCase()))
        .filter(t => !progressStatus || effectiveStatus(t) === progressStatus);
    const progressTotalPages = Math.max(1, Math.ceil(progressFiltered.length / PROGRESS_PAGE_SIZE));
    const safeProgressPage = Math.min(progressPage, progressTotalPages);
    const progressItems = progressFiltered.slice((safeProgressPage - 1) * PROGRESS_PAGE_SIZE, safeProgressPage * PROGRESS_PAGE_SIZE);

    // High Priority - not completed, searchable + status filter, paginated.
    const urgentFiltered = tasks
        .filter(t => t.priority === 'high' && t.status !== 'completed')
        .filter(t => !urgentSearch || t.name.toLowerCase().includes(urgentSearch.toLowerCase()))
        .filter(t => !urgentStatus || effectiveStatus(t) === urgentStatus);
    const urgentTotalPages = Math.max(1, Math.ceil(urgentFiltered.length / URGENT_PAGE_SIZE));
    const safeUrgentPage = Math.min(urgentPage, urgentTotalPages);
    const urgentItems = urgentFiltered.slice((safeUrgentPage - 1) * URGENT_PAGE_SIZE, safeUrgentPage * URGENT_PAGE_SIZE);

    const statusFilterOptions = Object.entries(statusMeta).filter(([key]) => key !== 'done');

    const cardSearchInputStyle: React.CSSProperties = {
        width: '100%', height: 32, borderRadius: 8, border: '1px solid #dbe3f0',
        padding: '0 10px 0 30px', fontSize: 12, outline: 'none', boxSizing: 'border-box',
        background: '#f8fafc', color: 'var(--text-primary)', fontFamily: 'inherit',
    };
    const cardSelectStyle: React.CSSProperties = {
        height: 32, borderRadius: 8, border: '1px solid #dbe3f0', padding: '0 6px',
        fontSize: 12, outline: 'none', cursor: 'pointer', background: '#fff',
        color: 'var(--text-primary)', fontFamily: 'inherit',
    };

    return (
        <div className="tab-content">
            <div className="welcome-banner">
                <div className="wb-left">
                    <div className="wb-avatar">{initials}</div>
                    <div>
                        <h2 className="wb-name">Good day, {firstName}!</h2>
                        <p className="wb-sub">{toDisplayRole(user.role)}</p>
                    </div>
                </div>
                <div className="wb-right">
                    <div className="wb-ring-wrap">
                        <svg viewBox="0 0 60 60" className="wb-ring">
                            <circle cx="30" cy="30" r="24" className="ring-bg" />
                            <circle
                                cx="30" cy="30" r="24" className="ring-fill"
                                strokeDasharray={`${2 * Math.PI * 24}`}
                                strokeDashoffset={`${2 * Math.PI * 24 * (1 - pct / 100)}`}
                            />
                        </svg>
                        <div className="wb-ring-text">
                            <span className="wb-pct">{pct}%</span>
                            <span className="wb-pct-sub">done</span>
                        </div>
                    </div>
                    <div className="wb-stats">
                        <div className="wb-stat"><span className="wbs-val">{total}</span><span className="wbs-label">Total</span></div>
                        <div className="wb-stat"><span className="wbs-val green">{done}</span><span className="wbs-label">Done</span></div>
                        <div className="wb-stat"><span className="wbs-val amber">{inProg}</span><span className="wbs-label">Active</span></div>
                        <div className="wb-stat"><span className="wbs-val red">{overdue}</span><span className="wbs-label">Overdue</span></div>
                    </div>
                </div>
            </div>

            <div className="stats-row">
                {[
                    { label: 'My Tasks', value: total, icon: <ClipboardList size={20} strokeWidth={2.3} />, variant: 'teal', subtext: 'Assigned to me' },
                    { label: 'In Progress', value: inProg, icon: <Loader2 size={20} strokeWidth={2.3} />, variant: 'warning', subtext: 'Currently active' },
                    { label: 'Completed', value: done, icon: <CheckCircle2 size={20} strokeWidth={2.3} />, variant: 'success', subtext: 'Finished tasks' },
                    { label: 'Overdue', value: overdue, icon: <AlertCircle size={20} strokeWidth={2.3} />, variant: 'danger', subtext: 'Needs attention' },
                ].map(s => (
                    <StatusCard key={s.label} icon={s.icon} variant={s.variant} label={s.label} value={s.value} subtext={s.subtext} />
                ))}
            </div>

            <div className="dashboard-grid">
                <div className="card">
                    <div className="card-header-layout">
                        <h3>High Priority Tasks <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>({urgentFiltered.length})</span></h3>
                        <button className="link-btn" onClick={onGoTasks}>All tasks <ChevronRight size={13} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input type="text" placeholder="Search tasks..." value={urgentSearch}
                                onChange={e => { setUrgentSearch(e.target.value); setUrgentPage(1); }}
                                style={cardSearchInputStyle} />
                        </div>
                        <select value={urgentStatus} onChange={e => { setUrgentStatus(e.target.value); setUrgentPage(1); }} style={cardSelectStyle}>
                            <option value="">All Status</option>
                            {statusFilterOptions.map(([key, meta]) => (
                                <option key={key} value={key}>{meta.label}</option>
                            ))}
                        </select>
                    </div>
                    {urgentItems.length === 0 ? (
                        <div className="empty-state"><CheckCircle2 size={22} /><p>No urgent tasks - great work!</p></div>
                    ) : urgentItems.map(t => (
                        <div key={t.id} className="dash-task-row" onClick={() => onView(t.id)}>
                            <div className="dtr-left">
                                <span className={`prio-dot ${priorityMeta[t.priority].cls}`} />
                                <div>
                                    <div className="dtr-name">{t.name}</div>
                                    <div className="dtr-date">{fmtDate(t.deadline)}</div>
                                </div>
                            </div>
                            <div className="dtr-right">
                                <span className={`badge ${statusMeta[effectiveStatus(t)].cls}`}>
                                    {statusMeta[effectiveStatus(t)].label}
                                </span>
                                {t.status !== 'completed' && t.status !== 'on-hold' && (
                                    <button
                                        className="btn btn-xs btn-primary"
                                        onClick={e => { e.stopPropagation(); onUpdate(t.id); }}
                                    >
                                        Update
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {urgentTotalPages > 1 && (
                        <div style={{ marginTop: 10 }}>
                            <Pagination currentPage={safeUrgentPage} totalPages={urgentTotalPages}
                                onPageChange={setUrgentPage} />
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="card-header-layout">
                        <h3>My Progress <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>({progressFiltered.length})</span></h3>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input type="text" placeholder="Search tasks..." value={progressSearch}
                                onChange={e => { setProgressSearch(e.target.value); setProgressPage(1); }}
                                style={cardSearchInputStyle} />
                        </div>
                        <select value={progressStatus} onChange={e => { setProgressStatus(e.target.value); setProgressPage(1); }} style={cardSelectStyle}>
                            <option value="">All Status</option>
                            {statusFilterOptions.map(([key, meta]) => (
                                <option key={key} value={key}>{meta.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="progress-summary">
                        {progressItems.length === 0 ? (
                            <div className="empty-state"><ClipboardList size={22} /><p>No tasks to show.</p></div>
                        ) : progressItems.map(t => (
                            <div key={t.id} className="ps-item" onClick={() => onView(t.id)}>
                                <div className="ps-info">
                                    <span className="ps-name">{t.name}</span>
                                    <span className="ps-pct">{t.progress}%</span>
                                </div>
                                <div className="ps-bar">
                                    <div className={`ps-fill ${priorityMeta[t.priority].bar}`} style={{ width: `${t.progress}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    {progressTotalPages > 1 && (
                        <div style={{ marginTop: 10 }}>
                            <Pagination currentPage={safeProgressPage} totalPages={progressTotalPages}
                                onPageChange={setProgressPage} />
                        </div>
                    )}
                </div>
            </div>

            {/* ── My Analytics ─────────────────────────────────────────── */}
            <div className="card">
                <div className="analytics-section-header">
                    <BarChart2 size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <div>
                        <h3 className="analytics-section-title">My Analytics</h3>
                        <p className="analytics-section-sub">Visual overview of your task data</p>
                    </div>
                </div>
                <TaskCharts tasks={tasks} />
            </div>
        </div>
    );
};

// --- My Tasks Tab -------------------------------------------------------------

interface MyTasksTabProps {
    tasks: Task[];
    loading: boolean;
    error: string;
    onView: (id: string) => void;
    onUpdate: (id: string) => void;
    onRetry: () => void;
}

const MyTasksTab: React.FC<MyTasksTabProps> = ({ tasks, loading, error, onView, onUpdate, onRetry }) => {
    const [filter, setFilter] = useState<'all' | TaskStatus>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 9;

    const filters: { key: 'all' | TaskStatus; label: string; count: number }[] = [
        { key: 'all', label: 'All', count: tasks.length },
        { key: 'pending', label: 'Pending', count: tasks.filter(t => t.status === 'pending').length },
        { key: 'in-progress', label: 'In Progress', count: tasks.filter(t => t.status === 'in-progress').length },
        { key: 'completed', label: 'Completed', count: tasks.filter(t => t.status === 'completed').length },
        { key: 'overdue', label: 'Overdue', count: tasks.filter(t => effectiveStatus(t) === 'overdue').length },
    ];

    const baseFiltered = filter === 'all'
        ? tasks
        : filter === 'overdue'
            ? tasks.filter(t => effectiveStatus(t) === 'overdue')
            : tasks.filter(t => t.status === filter);

    const filtered = baseFiltered
        .filter(t => priorityFilter === 'all' || t.priority === priorityFilter)
        .filter(t => !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));

    // Reset to the first page whenever any filter or the search changes
    useEffect(() => { setPage(1); }, [filter, searchQuery, priorityFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (loading) {
        return (
            <div className="tab-content">
                <div className="card">
                    <div className="empty-state">
                        <Loader2 size={22} className="spin" />
                        <p>Loading your tasks…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="tab-content">
                <div className="card">
                    <div className="empty-state">
                        <AlertCircle size={22} style={{ color: 'var(--danger)' }} />
                        <p>{error}</p>
                        <button className="btn btn-primary" onClick={onRetry} style={{ marginTop: 8 }}>
                            <RefreshCw size={13} /> Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tab-content">
            <div className="filter-pills">
                {filters.map(f => (
                    <button
                        key={f.key}
                        className={`filter-pill${filter === f.key ? ' active' : ''}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}<span className="fp-count">{f.count}</span>
                    </button>
                ))}
            </div>

            {/* Search by title + urgency filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search by task title…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%', height: 36, borderRadius: 8,
                            border: '1px solid var(--border)', padding: '0 10px 0 32px',
                            fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)',
                            fontFamily: 'inherit', outline: 'none',
                        }}
                    />
                </div>
                <select
                    value={priorityFilter}
                    onChange={e => setPriorityFilter(e.target.value)}
                    style={{
                        height: 36, borderRadius: 8, border: '1px solid var(--border)',
                        padding: '0 10px', fontSize: 12, background: 'var(--bg-card)',
                        color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                    }}
                >
                    <option value="all">All Urgency</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length} task{filtered.length === 1 ? '' : 's'}</span>
            </div>

            {filtered.length === 0 ? (
                <div className="card">
                    <div className="empty-state"><ClipboardList size={22} /><p>No tasks match your filters</p></div>
                </div>
            ) : (
                <>
                    <div className="task-grid">
                        {paged.map(t => <TaskCard key={t.id} task={t} onView={onView} onUpdate={onUpdate} />)}
                    </div>
                    {totalPages > 1 && (
                        <div style={{ marginTop: 16 }}>
                            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
};



// --- Profile Tab --------------------------------------------------------------

interface ProfileTabProps {
    user: UserProfile;
    onUpdateUser: (u: UserProfile) => void;
}

const ProfileTab: React.FC<ProfileTabProps> = ({ user, onUpdateUser }) => {
    const { success, error } = useToast();
    const [passwordGate, setPasswordGate] = useState(false);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [showGatePassword, setShowGatePassword] = useState(false);

    const [editMode, setEditMode] = useState(false);
    const [pwdMode, setPwdMode] = useState(false);
    const [form, setForm] = useState({
        firstName: localStorage.getItem('firstName') ?? '',
        middleName: localStorage.getItem('middleName') ?? '',
        lastName: localStorage.getItem('lastName') ?? '',
        contactNumber: user.phone,
        email: localStorage.getItem('email') ?? ''
    });
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [profileSaving, setProfileSaving] = useState(false);

    const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
    const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false });
    const [pwdError, setPwdError] = useState('');
    const [pwdSaving, setPwdSaving] = useState(false);

    useEffect(() => {
        setForm({
            firstName: localStorage.getItem('firstName') ?? '',
            middleName: localStorage.getItem('middleName') ?? '',
            lastName: localStorage.getItem('lastName') ?? '',
            contactNumber: localStorage.getItem('contactNumber') ?? '',
            email: localStorage.getItem('email') ?? ''
        });
    }, [user.fullName, user.phone]);

    const requestSave = () => {
        if (!form.firstName.trim() || !/^[A-Za-z\s]{1,50}$/.test(form.firstName.trim())) { error('Given Name must contain letters only and be up to 50 characters.'); return; }
        if (form.middleName.trim() && !/^[A-Za-z\s.]{1,50}$/.test(form.middleName.trim())) { error('Middle Initial must contain letters, spaces, or periods only.'); return; }
        if (!form.lastName.trim() || !/^[A-Za-z\s]{1,50}$/.test(form.lastName.trim())) { error('Last Name must contain letters only and be up to 50 characters.'); return; }

        const email = form.email.trim();
        if (!email || email.length < 12 || email.length > 64 || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
            error('Enter a valid Email Address (12-64 characters, local-part@domain).'); return;
        }

        if (!form.contactNumber.trim() || !/^[0-9]{11}$/.test(form.contactNumber.trim())) {
            error('Contact Number must be exactly 11 digits.'); return;
        }
        setGatePassword('');
        setGateError('');
        setShowGatePassword(false);
        setPasswordGate(true);
    };

    const handleGateConfirm = async () => {
        if (!gatePassword) { setGateError('Please enter your password.'); return; }
        setGateLoading(true);
        setGateError('');
        try {
            const employeeId = localStorage.getItem('employeeId') ?? '';
            const verifyRes = await api.post('/api/Auth/verify-password', { employeeID: employeeId, password: gatePassword });
            const verifyData = verifyRes.data;
            if (!verifyData.isSuccess) { throw new Error(verifyData.message || verifyData.Message || 'Incorrect password. Please try again.'); }
            setPasswordGate(false);
            setGatePassword('');
            await performSave();
        } catch (err: any) {
            setGateError(err.message ?? 'Incorrect password. Please try again.');
        } finally {
            setGateLoading(false);
        }
    };

    const performSave = async () => {
        setProfileSaving(true);
        try {
            const employeeId = localStorage.getItem('employeeId') ?? '';
            const firstName = form.firstName.trim();
            const lastName = form.lastName.trim();
            const middleName = form.middleName.trim();
            const formData = new FormData();
            formData.append('employeeNumber', employeeId);
            formData.append('firstName', firstName);
            formData.append('middleName', middleName);
            formData.append('lastName', lastName);
            formData.append('contactNumber', form.contactNumber.trim());
            formData.append('email', form.email.trim());

            await api.uploadPut(`/api/Profile/update-profile?employeeNumber=${encodeURIComponent(employeeId)}`, formData);
            const newFullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
            localStorage.setItem('employeeName', newFullName);
            localStorage.setItem('firstName', firstName);
            localStorage.setItem('middleName', middleName);
            localStorage.setItem('lastName', lastName);
            localStorage.setItem('contactNumber', form.contactNumber.trim());
            localStorage.setItem('email', form.email.trim());
            onUpdateUser({ ...user, fullName: newFullName, phone: form.contactNumber.trim() });
            success('Profile updated successfully.');
            setEditMode(false);
        } catch (err: any) {
            error(err?.response?.data?.message ?? 'Something went wrong.');
        } finally {
            setProfileSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditMode(false);
        setPwdMode(false);
        setForm({
            firstName: localStorage.getItem('firstName') ?? '',
            middleName: localStorage.getItem('middleName') ?? '',
            lastName: localStorage.getItem('lastName') ?? '',
            contactNumber: user.phone,
            email: localStorage.getItem('email') ?? ''
        });
    };

    const validateField = (key: string, value: string) => {
        let err = '';
        if (key === 'firstName' || key === 'middleName' || key === 'lastName') {
            if (value && !/^[A-Za-z\s]+$/.test(value)) err = 'Letters only (A-Z, a-z)';
            else if (value.length > 50) err = 'Max 50 characters';
            else if ((key === 'firstName' || key === 'lastName') && !value) err = 'Required';
        } else if (key === 'email') {
            if (!value) err = 'Required';
            else if (value.length < 12 || value.length > 64) err = 'Must be 12-64 characters';
            else if (!/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) err = 'Invalid format';
        } else if (key === 'contactNumber') {
            if (value && !/^\d+$/.test(value)) err = 'Numbers only';
            else if (value && value.length !== 11) err = 'Must be exactly 11 digits';
        }
        setValidationErrors(prev => ({ ...prev, [key]: err }));
        return err;
    };

    const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setForm(prev => ({ ...prev, [k]: val }));
        validateField(k, val);
    };

    const handleChangePwd = async () => {
        setPwdError('');
        if (!pwd.current) { setPwdError('Current password is required.'); return; }
        if (pwd.next.length < 15) { setPwdError('New password must be at least 15 characters.'); return; }
        if (pwd.next !== pwd.confirm) { setPwdError('Passwords do not match.'); return; }
        setPwdSaving(true);
        try {
            await api.post('/api/Auth/change-password', { currentPassword: pwd.current, newPassword: pwd.next, confirmPassword: pwd.confirm });
            setPwdMode(false);
            setPwd({ current: '', next: '', confirm: '' });
        } catch (err: any) {
            setPwdError(err?.response?.data?.message ?? 'Something went wrong.');
        } finally {
            setPwdSaving(false);
        }
    };

    const toggleShow = (k: keyof typeof showPwd) =>
        setShowPwd(prev => ({ ...prev, [k]: !prev[k] }));

    const initials = getInitials(user.fullName);

    return (
        <div className="tab-content">

            {/* Password Gate Modal */}
            <FormModal isOpen={passwordGate} onClose={() => setPasswordGate(false)}
                title="Confirm Your Identity" subtitle="Enter your password to save your profile changes." size="sm"
                footer={
                    <>
                        <button className="btn" onClick={() => setPasswordGate(false)} disabled={gateLoading}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleGateConfirm} disabled={gateLoading || !gatePassword}>
                            {gateLoading
                                ? <><Loader2 size={13} className="spin" /> Verifying…</>
                                : <><Shield size={13} /> Confirm & Save</>
                            }
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px', gap: 8 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(67,24,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Lock size={22} color="var(--primary)" />
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                        For your security, please verify your identity before saving changes.
                    </p>
                </div>
                {gateError && <div className="form-api-error" style={{ marginBottom: 12 }}><AlertCircle size={14} /><span>{gateError}</span></div>}
                <div className="field" style={{ marginBottom: 20 }}>
                    <label>Password</label>
                    <div style={{ position: 'relative' }}>
                        <input type={showGatePassword ? 'text' : 'password'} value={gatePassword}
                            onChange={e => { setGatePassword(e.target.value); setGateError(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleGateConfirm()}
                            placeholder="Enter your current password" style={{ paddingRight: 40, width: '100%' }} autoFocus />
                        <button type="button" onClick={() => setShowGatePassword(p => !p)}
                            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }} tabIndex={-1}>
                            {showGatePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                </div>
            </FormModal>

            {/* Profile Hero */}
            <div className="profile-hero card">
                <div className="ph-avatar">{initials}</div>
                <div className="ph-info">
                    <h2 className="ph-name">{user.fullName || '—'}</h2>
                    <p className="ph-role">{toDisplayRole(user.role)}</p>
                    <div className="ph-badges">
                        <span className="badge badge-blue">{user.employeeId}</span>
                        <span className={`badge ${user.accountStatus === 'Active' ? 'badge-green' : 'badge-red'}`}>
                            {user.accountStatus}
                        </span>
                        <span
                            className={`badge ${user.presenceStatus === 'Online' ? 'badge-green' : 'badge-gray'}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            <span style={{
                                display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                                background: user.presenceStatus === 'Online' ? '#05cd99' : '#a3aed0',
                            }} />
                            {user.presenceStatus ?? 'Offline'}
                        </span>
                    </div>
                </div>
                <button
                    className={`btn ${editMode ? 'btn-danger' : 'btn-primary'} ph-edit-btn`}
                    onClick={editMode ? handleCancelEdit : () => {
                        setEditMode(true);
                        ['firstName', 'middleName', 'lastName', 'email', 'contactNumber'].forEach(k => validateField(k, (form as any)[k]));
                    }}
                >
                    {editMode ? <><X size={13} /> Cancel</> : <><Pencil size={13} /> Edit Profile</>}
                </button>
            </div>

            <div className="profile-grid">
                {/* Basic Information */}
                <div className="card">
                    <div className="card-header-layout">
                        <h3>Basic Information</h3>
                        {editMode && (
                            <button className="btn btn-primary" onClick={requestSave} disabled={profileSaving}>
                                {profileSaving
                                    ? <><Loader2 size={13} className="spin" /> Saving…</>
                                    : <><Save size={13} /> Save</>
                                }
                            </button>
                        )}
                    </div>
                    <div className="info-fields">
                        <div className="info-field">
                            <label>Employee ID</label>
                            <div className="if-value">
                                <span className="if-icon"><Hash size={15} /></span>
                                <span className="read-only-val">{user.employeeId || '—'}</span>
                            </div>
                        </div>
                        {editMode ? (
                            <>
                                <div className="info-field">
                                    <label>Given Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <div className="if-input-wrap" style={validationErrors['firstName'] ? { borderColor: 'var(--danger)' } : {}}>
                                        <span className="if-icon"><User size={15} /></span>
                                        <input type="text" value={form.firstName} onChange={setF('firstName')} placeholder="Given Name" maxLength={50} />
                                    </div>
                                    {validationErrors['firstName'] && <span style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{validationErrors['firstName']}</span>}
                                </div>
                                <div className="info-field">
                                    <label>Middle Initial <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>(optional)</span></label>
                                    <div className="if-input-wrap" style={validationErrors['middleName'] ? { borderColor: 'var(--danger)' } : {}}>
                                        <span className="if-icon"><User size={15} /></span>
                                        <input type="text" value={form.middleName} onChange={setF('middleName')} placeholder="e.g. S" maxLength={50} />
                                    </div>
                                    {validationErrors['middleName'] && <span style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{validationErrors['middleName']}</span>}
                                </div>
                                <div className="info-field">
                                    <label>Last Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <div className="if-input-wrap" style={validationErrors['lastName'] ? { borderColor: 'var(--danger)' } : {}}>
                                        <span className="if-icon"><User size={15} /></span>
                                        <input type="text" value={form.lastName} onChange={setF('lastName')} placeholder="Last Name" maxLength={50} />
                                    </div>
                                    {validationErrors['lastName'] && <span style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{validationErrors['lastName']}</span>}
                                </div>
                            </>
                        ) : (
                            <div className="info-field">
                                <label>Full Name</label>
                                <div className="if-value">
                                    <span className="if-icon"><User size={15} /></span>
                                    <span>{user.fullName || '—'}</span>
                                </div>
                            </div>
                        )}
                        <div className="info-field">
                            <label>Email Address <span style={{ color: 'var(--danger)' }}>*</span></label>
                            {editMode ? (
                                <>
                                    <div className="if-input-wrap" style={validationErrors['email'] ? { borderColor: 'var(--danger)' } : {}}>
                                        <span className="if-icon"><Mail size={15} /></span>
                                        <input type="email" value={form.email} onChange={setF('email')} placeholder="e.g. name@company.com" />
                                    </div>
                                    {validationErrors['email'] && <span style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{validationErrors['email']}</span>}
                                </>
                            ) : (
                                <div className="if-value">
                                    <span className="if-icon"><Mail size={15} /></span>
                                    <span>{form.email || '—'}</span>
                                </div>
                            )}
                        </div>
                        <div className="info-field">
                            <label>Contact Number</label>
                            {editMode ? (
                                <>
                                    <div className="if-input-wrap" style={validationErrors['contactNumber'] ? { borderColor: 'var(--danger)' } : {}}>
                                        <span className="if-icon"><Phone size={15} /></span>
                                        <input type="tel" value={form.contactNumber} onChange={setF('contactNumber')} placeholder="e.g. 09170000000" />
                                    </div>
                                    {validationErrors['contactNumber'] && <span style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{validationErrors['contactNumber']}</span>}
                                </>
                            ) : (
                                <div className="if-value">
                                    <span className="if-icon"><Phone size={15} /></span>
                                    <span>{user.phone || '—'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Account & Security */}
                <div className="card">
                    <div className="card-header-layout"><h3>Account & Security</h3></div>
                    <div className="account-info">
                        <div className="info-field">
                            <label>Role</label>
                            <div className="if-value">
                                <span className="if-icon"><Shield size={15} /></span>
                                <span className="read-only-val">{toDisplayRole(user.role) || '—'}</span>
                            </div>
                        </div>
                        <div className="info-field">
                            <label>Account Status</label>
                            <div className="if-value">
                                <span className={`status-badge ${(user.accountStatus ?? 'active').toLowerCase()}`}>
                                    {user.accountStatus ?? 'Active'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="pwd-section">
                        <div className="pwd-header">
                            <div className="pwd-title"><Lock size={15} /><span>Change Password</span></div>
                            <button
                                className={`btn ${pwdMode ? '' : 'btn-primary'} btn-sm`}
                                onClick={() => { setPwdMode(m => !m); setPwdError(''); setEditMode(false); }}
                            >
                                {pwdMode ? 'Cancel' : 'Change'}
                            </button>
                        </div>
                        {pwdMode && (
                            <div className="pwd-form">
                                {pwdError && (
                                    <div className="form-api-error" style={{ marginBottom: 8 }}>
                                        <AlertCircle size={14} /><span>{pwdError}</span>
                                    </div>
                                )}
                                {(['current', 'next', 'confirm'] as const).map((k, i) => (
                                    <div className="field" key={k}>
                                        <label>
                                            {i === 0 ? 'Current Password' : i === 1 ? 'New Password' : 'Confirm New Password'}
                                        </label>
                                        <div className="pwd-input-wrap">
                                            <input
                                                type={showPwd[k] ? 'text' : 'password'}
                                                value={pwd[k]}
                                                onChange={e => setPwd(p => ({ ...p, [k]: e.target.value }))}
                                                    placeholder={
                                                        i === 0 ? 'Enter current password'
                                                            : i === 1 ? 'At least 15 characters'
                                                                : 'Re-enter new password'
                                                    }
                                            />
                                            <button className="pwd-toggle" onClick={() => toggleShow(k)} tabIndex={-1}>
                                                {showPwd[k] ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                        {k === 'next' && pwd.next.length > 0 && (
                                            <div style={{ marginTop: 6 }}>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {[1, 2, 3].map(lv => (
                                                        <div key={lv} style={{
                                                            flex: 1, height: 4, borderRadius: 2,
                                                            background: pwd.next.length >= lv * 4
                                                                ? lv === 1 ? '#ee5d50' : lv === 2 ? '#ffb547' : '#05cd99'
                                                                : '#e9edf7',
                                                            transition: 'background 0.2s',
                                                        }} />
                                                    ))}
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                                                    {pwd.next.length < 4 ? 'Weak' : pwd.next.length < 8 ? 'Fair' : 'Strong'}
                                                </span>
                                            </div>
                                        )}
                                        {k === 'confirm' && pwd.confirm.length > 0 && (
                                            <span style={{
                                                fontSize: 11,
                                                color: pwd.next === pwd.confirm ? '#05cd99' : 'var(--danger)',
                                                marginTop: 3, display: 'block',
                                            }}>
                                                {pwd.next === pwd.confirm ? '? Passwords match' : 'Passwords do not match'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', justifyContent: 'center' }}
                                    onClick={handleChangePwd}
                                    disabled={pwdSaving}
                                >
                                    {pwdSaving
                                        ? <><Loader2 size={13} className="spin" /> Saving…</>
                                        : <><Lock size={13} /> Update Password</>
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Recommendation History — archived recommendations from the assignee's tasks */}
            <RecommendationHistoryCard />
        </div>
    );
};

// --- Recommendation History (Employee side) ----------------------------------

const REC_CATEGORY_LABELS: Record<number, string> = {
    0: 'Timeliness',
    1: 'Work Quality',
    2: 'Communication',
    3: 'Other',
};

const fmtRecDateTime = (d: string): string => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' · ' + new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

interface RecommendationRecord {
    recommendationId: string;
    category: string;
    notes: string;
    recommendedByName: string;
    taskTitle: string;
    createdAt: string;
}

const RecommendationHistoryCard: React.FC = () => {
    const accountId = getAccountIdFromToken();
    const [records, setRecords] = useState<RecommendationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const HISTORY_PAGE_SIZE = 6;

    const fetchHistory = useCallback(async (pageOverride?: number) => {
        const targetPage = pageOverride ?? page;
        if (!accountId) { setLoading(false); return; }
        setLoading(true);
        setError('');
        try {
            const res = await api.get(`/api/users/${accountId}/recommendations`, { pageNumber: targetPage, pageSize: HISTORY_PAGE_SIZE });
            const json = res.data;
            const d = json?.data;
            const list: any[] = json.isSuccess && Array.isArray(d?.items) ? d.items : (json.isSuccess && Array.isArray(d) ? d : []);
            setRecords(list.map((r: any) => ({
                recommendationId: r.id ?? r.recommendationId,
                category: REC_CATEGORY_LABELS[r.category as number] ?? String(r.category ?? ''),
                notes: r.notes ?? '',
                recommendedByName: r.coordinatorName ?? '',
                taskTitle: r.taskTitle ?? '',
                createdAt: r.createdAt ?? '',
            })));
            setTotalPages(d?.totalPages || 1);
            setTotalCount(d?.totalCount ?? list.length);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to load recommendations.');
            setRecords([]);
            setTotalPages(1);
        } finally {
            setLoading(false);
        }
    }, [accountId, page]);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    return (
        <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header-layout">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Lightbulb size={15} /> Recommendation History</h3>
                {totalCount > 0 && <span className="badge badge-blue">{totalCount} entries</span>}
            </div>
            {loading ? (
                <div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading recommendations…</p></div>
            ) : error ? (
                <div className="empty-state"><AlertCircle size={22} style={{ color: 'var(--danger)' }} /><p>{error}</p></div>
            ) : records.length === 0 ? (
                <div className="empty-state"><Lightbulb size={22} /><p>No recommendations yet. Recommendations from your Coordinator or Manager will appear here after task review.</p></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 8 }}>
                    {records.map(r => (
                        <div key={r.recommendationId} style={{ padding: '12px 14px', background: 'var(--bg-main)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(67, 24, 255, 0.08)', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                    {r.category}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    {r.createdAt ? fmtRecDateTime(r.createdAt) : ''}
                                </span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{r.notes}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <span><User size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{r.recommendedByName || '—'}</span>
                                <span>·</span>
                                <span>Task: {r.taskTitle || '—'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!loading && !error && records.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
            )}
        </div>
    );
};

// --- Task Progress Review Tab -------------------------------------------------

const TaskProgressReviewTab: React.FC<{
    tasks: Task[];
    loading: boolean;
    error: string;
    onView: (id: string) => void;
    onUpdate: (id: string) => void;
    onRetry: () => void;
}> = ({ tasks, loading, error, onView, onUpdate, onRetry }) => {
    const pendingReview = tasks.filter(t => t.status === 'pending-review' || t.status === 'done');
    const pushedBack = tasks.filter(t => t.status === 'in-progress' && !!t.pushBackComment);
    const completed = tasks.filter(t => t.status === 'completed');

    if (loading) {
        return (
            <div className="tab-content">
                <div className="card">
                    <div className="empty-state">
                        <Loader2 size={22} className="spin" />
                        <p>Loading review data…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="tab-content">
                <div className="card">
                    <div className="empty-state">
                        <AlertCircle size={22} style={{ color: 'var(--danger)' }} />
                        <p>{error}</p>
                        <button className="btn btn-primary" onClick={onRetry} style={{ marginTop: 8 }}>
                            <RefreshCw size={13} /> Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const allEmpty = pendingReview.length === 0 && pushedBack.length === 0 && completed.length === 0;
    if (allEmpty) {
        return (
            <div className="tab-content">
                <div className="card">
                    <div className="empty-state">
                        <Eye size={22} />
                        <p>No tasks have been submitted for review yet.</p>
                    </div>
                </div>
            </div>
        );
    }

    const SectionCard: React.FC<{
        title: string;
        icon: React.ReactNode;
        count: number;
        badgeCls: string;
        children: React.ReactNode;
    }> = ({ title, icon, count, badgeCls, children }) => (
        <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header-layout" style={{ marginBottom: 12 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    {icon}
                    {title}
                </h3>
                <span className={`badge ${badgeCls}`}>{count}</span>
            </div>
            {children}
        </div>
    );

    const renderTaskRow = (t: Task, extra?: React.ReactNode) => {
        const es = effectiveStatus(t);
        const sm = statusMeta[es];
        const pm = priorityMeta[t.priority];
        const od = es === 'overdue';
        return (
            <div
                key={t.id}
                className="dash-task-row"
                onClick={() => onView(t.id)}
                style={{ cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
            >
                <div className="dtr-left">
                    <span className={`prio-dot ${pm.cls}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dtr-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {t.name}
                            {t.isConfidential && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--status-failed)', background: 'rgba(238,93,80,0.08)', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                                    CONFIDENTIAL
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {t.referenceNumber ? `#${t.referenceNumber}` : ''}
                            </span>
                            {extra}
                        </div>
                    </div>
                </div>
                <div className="dtr-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${sm.cls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {sm.icon}{sm.label}
                    </span>
                    {t.status !== 'completed' && t.status !== 'on-hold' && (
                        <button
                            className="btn btn-xs btn-primary"
                            onClick={e => { e.stopPropagation(); onUpdate(t.id); }}
                        >
                            Update
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="tab-content">

            {/* -- Pending Review -- */}
            {pendingReview.length > 0 && (
                <SectionCard title="Pending Review" icon={<Eye size={16} />} count={pendingReview.length} badgeCls="badge-purple">
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        These tasks are waiting for your coordinator's review.
                    </p>
                    {pendingReview.map(t => renderTaskRow(t))}
                </SectionCard>
            )}

            {/* -- Pushed Back -- */}
            {pushedBack.length > 0 && (
                <SectionCard title="Pushed Back / Needs Revision" icon={<RefreshCw size={16} />} count={pushedBack.length} badgeCls="badge-amber">
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Your coordinator returned these tasks for revision. See their comments below.
                    </p>
                    {pushedBack.map(t =>
                        <div key={t.id}>
                            {renderTaskRow(t, t.pushBackComment ? (
                                <span style={{ fontSize: 11, color: 'var(--status-failed)', fontStyle: 'italic', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                    " {t.pushBackComment} "
                                </span>
                            ) : undefined)}
                        </div>
                    )}
                </SectionCard>
            )}

            {/* -- Approved / Completed -- */}
            {completed.length > 0 && (
                <SectionCard title="Approved / Completed" icon={<CheckCircle2 size={16} />} count={completed.length} badgeCls="badge-green">
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        These tasks have been reviewed and approved.
                    </p>
                    {completed.map(t => renderTaskRow(t, t.reviewRemarks ? (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            Remarks: {t.reviewRemarks}
                        </span>
                    ) : undefined))}
                </SectionCard>
            )}

        </div>
    );
};

// --- Root Component -----------------------------------------------------------

export default function EmployeeDashboard() {
    const navigate = useNavigate();
    usePreventBackNav();

    const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
    const SIDEBAR_NAV_GROUPS = React.useMemo(() => [
        {
        label: null,
        items: [
        {
        label: 'Task Allocation and Review System',
        icon: 'ti ti-clipboard-list',
        subItems: [
        { label: 'Dashboard', onClick: () => setActiveTab('dashboard'), active: activeTab === 'dashboard' },
        { label: 'My Tasks', onClick: () => setActiveTab('my-tasks'), active: activeTab === 'my-tasks' },
        { label: 'Task Progress Review', onClick: () => setActiveTab('task-progress-review'), active: activeTab === 'task-progress-review' },
        { label: 'Activity Logs', onClick: () => setActiveTab('activity_logs'), active: activeTab === 'activity_logs' },
        { label: 'Announcements', onClick: () => setActiveTab('announcements'), active: activeTab === 'announcements' },
        { label: 'Notifications', onClick: () => setActiveTab('notifications'), active: activeTab === 'notifications' },
        ],
        },
        {
        label: 'General',
        icon: 'ti ti-settings',
        subItems: [
        { label: 'Profile', onClick: () => setActiveTab('profile'), active: activeTab === 'profile' },
        ],
        },
        ],
        },
    ], [activeTab, setActiveTab]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [tasksError, setTasksError] = useState('');
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);


    const [user, setUser] = useState<UserProfile>({
        employeeId: localStorage.getItem('employeeId') ?? '',
        fullName: localStorage.getItem('employeeName') ?? '',
        phone: localStorage.getItem('contactNumber') ?? '',
        email: localStorage.getItem('email') ?? '',
        role: localStorage.getItem('role') ?? '',
        accountStatus: 'Active',
    });

    // -- Notifications --
    const [headerNotifications, setHeaderNotifications] = useState<NotificationItem[]>([]);

    const mapToHeaderNotification = useCallback((n: any): NotificationItem => {
        const typeLabels: Record<string, NotificationItem['type']> = {
            TaskAssigned: 'info', TaskUpdated: 'info', TaskOverdue: 'alert', DeadlineWarning: 'alert',
            TaskCancelled: 'system', TaskCompleted: 'success',
        };
        const type = typeof n.type === 'number' ? ['TaskAssigned','TaskUpdated','TaskOverdue','DeadlineWarning','PushBack','TaskCancelled','TaskResumed','TaskOnHold','TaskCompleted','TemplateTaskUnassigned'][n.type] || 'Unknown' : n.type || '';
        const createdAt = n.createdAt ?? '';
        const createdDate = new Date(createdAt);
        const now = new Date();
        const isToday = createdDate.toDateString() === now.toDateString();
        const timeStr = createdDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return {
            id: String(n.id ?? n.notificationId ?? ''),
            title: n.message ?? n.title ?? '',
            description: n.description ?? '',
            timestamp: timeStr,
            date: isToday ? 'Today' : createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            createdAt: createdAt,
            read: n.isRead ?? false,
            type: typeLabels[type] || 'info',
            category: 'system',
            isToday,
            source: 'System',
            relatedEntityId: n.relatedTaskId ?? n.taskId ?? null,
            relatedEntityType: n.relatedTaskId || n.taskId ? 'task' as const : undefined,
        };
    }, []);

    const fetchHeaderNotifications = useCallback(async () => {
        try {
            const res = await api.get('/api/Notification', { pageNumber: 1, pageSize: 10 });
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setHeaderNotifications(d.items.map(mapToHeaderNotification));
            }
        } catch { /* fallback to dummy */ }
    }, [mapToHeaderNotification]);

    useEffect(() => { fetchHeaderNotifications(); }, [fetchHeaderNotifications]);

    // ── Full Notifications Tab ──
    const NOTIF_PAGE_SIZE = 10;
    const [allNotifications, setAllNotifications] = useState<any[]>([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifPage, setNotifPage] = useState(1);
    const [notifTotalPages, setNotifTotalPages] = useState(1);
    const [notifTotalRecords, setNotifTotalRecords] = useState(0);

    // ── Awaiting Review (derived from tasks in pending review) ──
    const awaitingReviewNotifs = useMemo<NotificationItem[]>(() => {
        const pendingReview = tasks.filter(t => t.status === 'pending-review' || t.status === 'done');
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return pendingReview.map(t => {
            const name = t.name.length > 50 ? t.name.slice(0, 50) + '...' : t.name;
            return {
                id: `review-${t.id}`,
                title: 'Awaiting Review',
                description: `Task '${name}' is awaiting review.`,
                timestamp: nowStr,
                date: 'Today',
                createdAt: new Date().toISOString(),
                read: false,
                type: 'info',
                category: 'system',
                isToday: true,
                source: 'System',
                relatedEntityId: t.id,
                relatedEntityType: 'task' as const,
            };
        });
    }, [tasks]);

    const mergedHeaderNotifications = useMemo(
        () => [...awaitingReviewNotifs, ...headerNotifications],
        [awaitingReviewNotifs, headerNotifications]
    );

    // The notification page shows ONLY the server-paginated feed so every page has
    // the same number of records. Derived rows (awaiting review) are computed from
    // live task state and would inflate page 1 differently from later pages, so they
    // stay in the header dropdown (mergedHeaderNotifications) only.
    const mergedAllNotifications = useMemo(() => allNotifications, [allNotifications]);

    const fetchAllNotifications = useCallback(async (page: number) => {
        setNotifLoading(true);
        try {
            const res = await api.get('/api/Notification', { pageNumber: page, pageSize: NOTIF_PAGE_SIZE });
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setAllNotifications(d.items.map((n: any) => ({
                    notificationId: n.id ?? n.notificationId,
                    taskId: n.relatedTaskId ?? n.taskId ?? null,
                    notificationType: typeof n.type === 'number' ? NOTIF_TYPE_MAP[n.type] || 'Unknown' : n.type || '',
                    message: n.message ?? n.title ?? '',
                    isRead: n.isRead ?? false,
                    createdAt: n.createdAt ?? '',
                })));
                setNotifPage(d.pageNumber || page);
                setNotifTotalPages(d.totalPages || 1);
                setNotifTotalRecords(d.totalCount ?? d.items.length);
            } else {
                setAllNotifications([]);
                setNotifTotalRecords(0);
            }
        } catch {
            setAllNotifications([]);
            setNotifTotalRecords(0);
        } finally {
            setNotifLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'notifications') {
            fetchAllNotifications(1);
        }
    }, [activeTab, fetchAllNotifications]);

    // -- Activity Logs --
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [activityLogPage, setActivityLogPage] = useState(1);
    const [activityLogTotalPages, setActivityLogTotalPages] = useState(1);
    const ACTIVITY_LOG_PAGE_SIZE = 15;

    const fetchActivityLogs = async (page: number) => {
        try {
            const res = await api.get('/api/audit-logs/my', { pageNumber: page, pageSize: ACTIVITY_LOG_PAGE_SIZE });
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setActivityLogs(d.items);
                setActivityLogPage(d.pageNumber || page);
                setActivityLogTotalPages(d.totalPages || 1);
            } else {
                setActivityLogs([]);
            }
        } catch {
            setActivityLogs([]);
        }
    };

    const handleLogout = async () => {
        const token = localStorage.getItem('authToken');
        if (token) {
            await api.post('/api/Auth/logout').catch(() => { });
        }
        ['employeeId', 'refreshToken', 'authToken', 'employeeName', 'contactNumber', 'role']
            .forEach(k => localStorage.removeItem(k));
        navigate('/');
    };

    const fetchTasks = async () => {
        setTasksLoading(true);
        setTasksError('');
        try {
            const res = await api.get('/api/Task?pageNumber=1&pageSize=200');
            const json = res.data;
            const rawList: TaskResponseDTO[] = Array.isArray(json) ? json : (Array.isArray(json?.data?.items) ? json.data.items : (Array.isArray(json?.data) ? json.data : []));
            setTasks(rawList.map(dtoToTask));
        } catch {
            setTasks([]);
        } finally {
            setTasksLoading(false);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const employeeId = localStorage.getItem('employeeId');
        if (!token || !employeeId) { setLoadingUser(false); return; }

        api.get('/api/Auth/me')
            .then((res: any) => {
                const resJson = res.data;
                if (!resJson || !resJson.isSuccess || !resJson.data) throw new Error('Invalid response structure');
                const data = resJson.data;
                const fetchedFullName = (data.firstName || data.lastName)
                    ? [data.firstName, data.middleName, data.lastName, data.suffix].map(s => (s ?? '').trim()).filter(Boolean).join(' ')
                    : (data.employeeName ?? localStorage.getItem('employeeName') ?? '');

                const fetched: UserProfile = {
                    employeeId: data.employeeNumber ?? employeeId,
                    fullName: fetchedFullName,
                    phone: data.contactNumber ?? localStorage.getItem('contactNumber') ?? '',
                    email: data.email ?? localStorage.getItem('email') ?? '',
                    role: data.role ?? localStorage.getItem('role') ?? '',
                    accountStatus: data.accountStatus ?? 'Active',
                    presenceStatus: data.presenceStatus ?? 'Offline',
                };
                setUser(fetched);
                localStorage.setItem('employeeName', fetched.fullName);
                localStorage.setItem('contactNumber', fetched.phone);
                localStorage.setItem('email', fetched.email);
                localStorage.setItem('role', fetched.role);

                localStorage.setItem('firstName', data.firstName ?? '');
                localStorage.setItem('middleName', data.middleName ?? '');
                localStorage.setItem('lastName', data.lastName ?? '');
                localStorage.setItem('suffix', data.suffix ?? '');
            })
            .catch(err => console.warn('Could not fetch profile:', err))
            .finally(() => setLoadingUser(false));

        fetchTasks();
        fetchActivityLogs(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-fetch activity logs whenever the Activity Logs tab becomes active
    useEffect(() => {
        if (activeTab === 'activity_logs') {
            fetchActivityLogs(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Poll activity logs while the Activity Logs tab is open so new entries
    // appear without reloading the page
    useEffect(() => {
        if (activeTab !== 'activity_logs') return;
        const interval = setInterval(() => {
            fetchActivityLogs(activityLogPage);
        }, 15000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, activityLogPage]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchHeaderNotifications();
            fetchTasks();
        }, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toBackendStatus = (status: TaskStatus): string => ({
        pending: 'Pending', assigned: 'Assigned', 'in-progress': 'In Progress',
        'pending-review': 'Pending Admin Review', done: 'Done', completed: 'Completed', overdue: 'In Progress',
    }[status] ?? 'Assigned');

    const STATUS_TO_BACKEND: Record<string, number> = {
        assigned: 0, 'in-progress': 1, 'pending-review': 2, done: 2, completed: 3,
    };

    const handleSaveProgress = async (
        id: string, status: TaskStatus, progress: number, remarks: string
    ): Promise<void> => {
        const newStatus = STATUS_TO_BACKEND[status] ?? 1;
        try {
            await api.patch(`/api/Task/${id}/status`, { newStatus, progressNotes: remarks.trim() || undefined });
            // Persist the employee's reported completion percentage so
            // Coordinators and Managers can see it in the Task Details.
            const finalProgress = status === 'done' || status === 'completed' ? 100 : progress;
            await api.patch(`/api/Task/${id}/progress`, { completionPercentage: finalProgress });
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.response?.data?.Message || 'Failed to update task progress.';
            throw new Error(msg);
        }
        setTasks(ts => ts.map(t => t.id === id ? {
            ...t,
            status: status === 'overdue' ? 'in-progress' : status,
            progress: status === 'done' ? 100 : status === 'completed' ? 100 : progress,
            remarks: remarks.trim() || t.remarks,
        } : t));
    };

    const viewingTask = viewingId != null ? tasks.find(t => t.id === viewingId) ?? null : null;
    const updatingTask = updatingId != null ? tasks.find(t => t.id === updatingId) ?? null : null;
    const initials = getInitials(user.fullName);

    const pageTitles: Record<NavTab, string> = {
        dashboard: 'My Dashboard',
        'my-tasks': 'My Tasks',
        'task-progress-review': 'Task Progress Review',
        profile: 'My Profile',
        activity_logs: 'Activity Logs',
        announcements: 'Announcements',
        notifications: 'Notifications',
    };

    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return (
        <div className="dashboard-container">

            {/* -- Sidebar -- */}
            <Sidebar
                logoUrl={SpeedexLogo}
                logoText="SPEEDEX"
                navGroups={SIDEBAR_NAV_GROUPS}
                profile={{
                    name: user.fullName || 'Employee',
                    role: toDisplayRole(user.role) || 'Employee',
                    avatarInitials: initials,
                }}
                onProfileClick={() => setActiveTab('profile')}
                onLogout={handleLogout}
            />

            {/* -- Main -- */}
            <main className="main-viewport">
                <GlobalHeader
                    title={pageTitles[activeTab]}
                    breadcrumbs={[{ label: 'Employee' }, { label: pageTitles[activeTab] }]}
                    notifications={mergedHeaderNotifications}
                    profile={{
                        name: user.fullName || 'Employee',
                        role: toDisplayRole(user.role) || 'Employee',
                        avatarInitials: initials,
                    }}
                    onSettings={() => setActiveTab('profile')}
                    onLogout={handleLogout}
                    onViewAllNotifications={() => setActiveTab('notifications')}
                    onNotificationsUpdate={(items) => {
                        // GlobalHeader pushes back the full merged list (derived
                        // pins + real notifications). Keep only the real rows to
                        // avoid duplicating the pins when the list is re-merged.
                        setHeaderNotifications((items as NotificationItem[]).filter(n => {
                            const id = String(n.id ?? '');
                            return !id.startsWith('review-') && !id.startsWith('overdue-');
                        }));
                    }}
                    onNotificationAction={n => {
                        if (n.relatedEntityId && n.relatedEntityType === 'task') {
                            const found = tasks.find(t => t.id === n.relatedEntityId);
                            if (found) { setViewingId(found.id); return; }
                        }
                        if (n.relatedEntityType === 'announcement') setActiveTab('announcements');
                    }}
                />

                {activeTab === 'dashboard' && (
                    <DashboardTab
                        tasks={tasks} user={user}
                        onView={setViewingId} onUpdate={setUpdatingId}
                        onGoTasks={() => setActiveTab('my-tasks')}
                    />
                )}
                {activeTab === 'my-tasks' && (
                    <MyTasksTab
                        tasks={tasks} loading={tasksLoading} error={tasksError}
                        onView={setViewingId} onUpdate={setUpdatingId}
                        onRetry={fetchTasks}
                    />
                )}
                {activeTab === 'task-progress-review' && (
                    <TaskProgressReviewTab
                        tasks={tasks} loading={tasksLoading} error={tasksError}
                        onView={setViewingId} onUpdate={setUpdatingId}
                        onRetry={fetchTasks}
                    />
                )}
                {activeTab === 'profile' && (
                    <ProfileTab user={user} onUpdateUser={setUser} />
                )}
                {activeTab === 'activity_logs' && (
                    <div className="dashboard-content" style={{ padding: '0 28px 28px' }}>
                        <DataTable
                            title=""
                            headers={['Date & Time', 'Action', 'Affected Employee / Entity', 'Description', 'Changes (Old → New)']}
                            loading={false}
                            emptyMessage="No activity logs found."
                            emptyIcon={<Activity size={24} />}
                            totalRecords={activityLogs.length}
                            currentPage={activityLogPage}
                            totalPages={activityLogTotalPages}
                            onPageChange={p => fetchActivityLogs(p)}
                        >
                            {activityLogs.map((log: any) => {
                                const badge = getAuditBadgeStyle(log.actionType ?? '');
                                return (
                                <tr key={log.id}>
                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                                    </td>
                                    <td>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                                            background: badge.background, color: badge.color,
                                        }}>
                                            {formatActionType(log.actionType)}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 13 }}>
                                        <div style={{ color: 'var(--text-primary)' }}>
                                            {[log.actorName, log.actorRole].filter(Boolean).join(', ') || '—'}
                                        </div>
                                        {log.targetEntity && (
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                Entity: {log.targetEntity}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 13, color: 'var(--text-primary)' }}>{log.description}</td>
                                    <td style={{ color: 'var(--text-primary)' }}>{renderChanges(log.oldValue, log.newValue)}</td>
                                </tr>
                                );
                            })}
                        </DataTable>
                    </div>
                )}
                {activeTab === 'announcements' && (
                    <div className="dashboard-content" style={{ padding: '0 28px 28px' }}>
                        <AnnouncementsTab canCreate={false} />
                    </div>
                )}
                {activeTab === 'notifications' && (
                    <div className="dashboard-content" style={{ padding: '0 28px 28px' }}>
                        <div className="card">
                            <div className="card-header-layout">
                                <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>Notifications</h3>
                            </div>
                            {notifLoading ? (
                                <div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading notifications...</p></div>
                            ) : mergedAllNotifications.length === 0 ? (
                                <div className="empty-state"><Bell size={22} /><p>No notifications</p></div>
                            ) : (
                                <DataTable
                                    headers={['Date', 'Type', 'Message', 'Status']}
                                    loading={false}
                                    emptyMessage="No notifications"
                                    currentPage={notifPage}
                                    totalPages={notifTotalPages}
                                    onPageChange={p => fetchAllNotifications(p)}
                                    totalRecords={notifTotalRecords}
                                    pageSize={NOTIF_PAGE_SIZE}
                                >
                                    {mergedAllNotifications.map(n => {
                                        const badge = (() => {
                                            switch (n.notificationType) {
                                                case 'TaskAssigned': return { label: 'Assigned', cls: 'task-assigned' };
                                                case 'TaskUpdated': return { label: 'Updated', cls: 'task-assigned' };
                                                case 'TaskOverdue': return { label: 'Overdue', cls: 'deadline' };
                                                case 'DeadlineWarning': return { label: 'Deadline', cls: 'deadline' };
                                                case 'PushBack': return { label: 'Pushed back', cls: 'default' };
                                                case 'TaskCancelled': return { label: 'Cancelled', cls: 'default' };
                                                case 'TaskAwaitingReview': return { label: 'Awaiting Review', cls: 'task-assigned' };
                                                default: return { label: n.notificationType, cls: 'default' };
                                            }
                                        })();
                                        return (
                                            <tr key={n.notificationId} onClick={() => {
                                                if (n.taskId) {
                                                    const found = tasks.find(t => t.id === n.taskId);
                                                    if (found) setViewingId(found.id);
                                                }
                                            }} style={{ cursor: n.taskId ? 'pointer' : 'default' }}>
                                                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {new Date(n.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td><span className={`badge ${badge.cls}`} style={{ fontSize: 11 }}>{badge.label}</span></td>
                                                <td style={{ fontSize: 13, fontWeight: n.isRead ? 400 : 600 }}>{n.message}</td>
                                                <td>{n.isRead ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Read</span> : <span className="badge badge-blue" style={{ fontSize: 11 }}>New</span>}</td>
                                            </tr>
                                        );
                                    })}
                                </DataTable>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* -- Modals -- */}
            {viewingTask && (
                <TaskDetail
                    task={viewingTask}
                    onUpdate={() => { setUpdatingId(viewingTask.id); setViewingId(null); }}
                    onClose={() => setViewingId(null)}
                />
            )}
            {updatingTask && (
                <ProgressModal
                    task={updatingTask}
                    onSave={handleSaveProgress}
                    onClose={() => setUpdatingId(null)}
                />
            )}
        </div>
    );
}
