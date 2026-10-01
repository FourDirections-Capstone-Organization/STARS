import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SpeedexLogo from '../../assets/SpeedexLogo.jpg';
import {
    ClipboardList,
    CheckCircle2,
    AlertCircle,
    Package,
    LayoutDashboard,
    Truck,
    BarChart3,
    UserCircle2,
    Plus,
    Pencil,
    X,
    Hash,
    Eye,
    EyeOff,
    Lightbulb,
    Shield,
    Phone,
    Lock,
    ChevronRight,
    ChevronLeft,
    LogOut,
    Save,
    Loader2,
    User,
    Users,
    Trash2,
    Mail,
    RotateCcw,
    ThumbsUp,
    ThumbsDown,
    Download,
    FileText,
    Calendar,
    Filter,
    Repeat,
    ToggleLeft,
    Copy,
    Activity,
    Building,
    Clock,
    Play,
    Bell,
    Info,
    DollarSign,
    Flame,
    ArrowLeft,
    TrendingUp,
    UserCheck,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import './OpAdmin_Dashboard.css';
import { useNavigate } from 'react-router-dom';
import TaskView, { TaskViewTask } from '../../components/TaskView/TaskView';
import { useToast } from '../../components/Toast/Toast';
import { resolveIncrementalTitlePreview } from '../../services/taskTitleUtils';

import { usePreventBackNav } from '../../components/Auth/usePreventBackNav';
import GlobalHeader, { NotificationItem } from '../../components/GlobalHeader/GlobalHeader';
import Sidebar from '../../components/Sidebar/Sidebar';
import StatusCard from '../../components/StatusCard/StatusCard';
import DataTable, { ActionsDropdown } from '../../components/ui/DataTable';
import FormModal from '../../components/FormModal/FormModal';
import ActionButton from '../../components/ActionButton/ActionButton';
import ConfirmationModal from '../../components/ConfirmationModal/ConfirmationModal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import SubTabNav from '../../components/ui/SubTabNav';
import SearchableSelect from '../../components/ui/SearchableSelect';
import TaskManager, { TMTask } from '../../components/TaskManager/TaskManager';
import api from '../../api';
import axios from 'axios';
import AIAssignmentView from '../EmergingTechAI/AIAssignmentView';
import AnnouncementsTab from '../../components/AnnouncementsTab/AnnouncementsTab';
import AnnouncementBanner from '../../components/AnnouncementsTab/AnnouncementBanner';
import TaskTemplatesTab from './TaskTemplates/TaskTemplatesTab';

const NOTIF_TYPE_MAP: Record<number, string> = {
    0: 'TaskAssigned', 1: 'TaskUpdated', 2: 'TaskOverdue', 3: 'DeadlineWarning',
    4: 'PushBack', 5: 'TaskCancelled', 6: 'TaskResumed', 7: 'TaskOnHold',
    8: 'TaskCompleted', 9: 'TemplateTaskUnassigned'
};

interface ConfirmModalState {
    isOpen: boolean;
    variant: 'neutral' | 'danger' | 'warning' | 'info' | 'success';
    title: string;
    description: string;
    notice?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
}

const CONFIRM_CLOSED: ConfirmModalState = {
    isOpen: false,
    variant: 'neutral',
    title: '',
    description: '',
    onConfirm: () => { },
};

// --- Dashboard API Types ------------------------------------------------------

interface DashboardEmployeeWorkload {
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    role: string;
    department: string;
    activeTaskCount: number;
    overdueTaskCount: number;
    availabilityStatus: { status: string; isAvailable: boolean };
}

interface DepartmentWorkloadItem {
    departmentId: string;
    departmentName: string;
    totalActiveTasks: number;
    totalOverdueTasks: number;
    employeeCount: number;
}

interface TeamWorkloadItem {
    teamId: string;
    teamName: string;
    memberCount: number;
    totalActiveTasks: number;
    totalOverdueTasks: number;
}

interface DashboardResponse {
    totalActiveTasks: number;
    overdueTaskCount: number;
    notStartedCount: number;
    inProgressCount: number;
    donePendingReviewCount: number;
    onHoldCount: number;
    completedTodayCount: number;
    employeeWorkload: DashboardEmployeeWorkload[];
    departmentWorkload: DepartmentWorkloadItem[];
    teamWorkload: TeamWorkloadItem[];
}

interface EmployeeFilterOption {
    employeeId: string;
    employeeName: string;
}

interface DepartmentFilterOption {
    departmentId: string;
    departmentName: string;
}

interface ApiResponse<T> {
    isSuccess: boolean;
    message: string;
    data: T | null;
}

// --- Types --------------------------------------------------------------------

type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';  // match backend casing
type TaskStatus = 'Draft' | 'Assigned' | 'Pending' | 'In Progress' | 'Pending Admin Review' | 'Done' | 'Completed' | 'Overdue';
type NavTab =
    | 'dashboard'
    | 'tasks'
    | 'team'
    | 'reports'
    | 'profile'
    | 'reopen'
    | 'templates'
    | 'approvals'
    | 'activity_logs'
    | 'announcements'
    | 'notifications'
    | 'notification_settings';

interface TeamMember {
    accountId: string;
    employeeName: string;
    role: string;
    presenceStatus?: string;
}

interface Task {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    taskCategory?: string;
    taskReferenceNumber?: string;
    priority: Priority;
    classification: number;
    dueAt: string | null;
    taskStatus: TaskStatus;
    taskRemarks?: string;
    assignedEmployee: string;
    createdByEmployee: string;
    assignedTo: string;
    /** Each assignee plus the completion percentage the employee reported. */
    assignees?: { fullName: string; completionPercentage: number }[];
    createdAt: string;
    updatedAt?: string;
    deleted?: boolean;
    Deleted?: boolean;
    supportingEvidenceUrl?: string;
    isConfidential?: boolean;
    isSLALocked?: boolean;
    attachmentCount?: number;
}

// DTOs matching backend
interface CreateTaskDTO {
    title: string;
    description: string;
    priorityLevel: number;
    classification: number;
    assignmentScope: number;
    deadline: string | null;
    assignedUserIds?: string[];
    assignedDepartmentId?: string;
    teamId?: string;
    isConfidential?: boolean;
}

interface UpdateTaskDTO {
    title?: string;
    description?: string;
    priorityLevel?: number;
    classification?: number;
    assignmentScope?: number;
    deadline?: string | null;
    assignedUserIds?: string[];
    assignedDepartmentId?: string;
    teamId?: string;
    isConfidential?: boolean;
}

// DTO from backend for duplicate warnings
interface DuplicateWarningDTO {
    taskId: string;
    title: string;
    status: string;
    similarityPercentage: number;
}

// Enriched match detail (fetched per-task from /api/Task/{id})
interface DuplicateDetailDTO extends DuplicateWarningDTO {
    referenceNumber?: string;
    description?: string;
    deadline?: string | null;
    priority?: string;
    assignee?: string;
    loading: boolean;
    error?: boolean;
}

// --- Reopen Request Types ------------------------------------------------------

interface ReopenRequest {
    requestId: string;
    referenceNumber?: string;
    taskId: string;
    taskTitle: string;
    employeeName: string;
    employeeId: string;
    reason: string;
    supportingEvidence?: string;
    currentStatus: TaskStatus;
    status: 'Pending' | 'Approved' | 'Rejected';
    submittedAt: string;
    reviewedAt?: string;
    adminRemarks?: string;
}

// --- Report Types --------------------------------------------------------------

interface ReportFilter {
    dateRangeStart: string;
    dateRangeEnd: string;
    employeeId: string;
    taskPriorityLevel: string;
    taskStatus: string;
    taskCategory: string;
}

interface TaskCompletionReport {
    totalTasksAssigned: number;
    totalTasksCompleted: number;
    totalTasksInProgress: number;
    totalTasksPendingReview: number;
    totalOverdueTasks: number;
    taskCompletionRate: number;
    overallOnTimeRate: number;
    averageTaskCompletionTimeHours: number;
    employeePerformanceSummary: EmployeePerformance[];
    tasks: TaskCompletionItem[];
}

interface TaskCompletionItem {
    taskId: string;
    taskReferenceNumber: string;
    title: string;
    assignedEmployee: string;
    department: string;
    priority: string;
    classification: string;
    createdAt: string;
    deadline: string;
    revisedDeadline?: string;
    completedAt?: string;
    durationHours: number;
    isOnTime: boolean;
    overdueHours: number;
    status: string;
}

interface EmployeePerformance {
    employeeName: string;
    totalAssigned: number;
    totalCompleted: number;
    completionRate: number;
    averageCompletionTimeHours: number;
}

interface OperationalFilter {
    dateRangeStart: string;
    dateRangeEnd: string;
    departmentId: string;
    employeeId: string;
    reportFormat: string;
}

interface OperationalSummaryReport {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    taskCompletionRate: number;
    overallOnTimeRate: number;
    overallSlaBreachRate: number;
    departmentSummaries: DepartmentOperationalSummary[];
    employeePerformanceSummary: OperationalEmployeePerformance[];
    workloadByCategory: WorkloadItem[];
    workloadByDepartment: WorkloadItem[];
    workloadByPriority: WorkloadItem[];
}

interface DepartmentOperationalSummary {
    departmentId?: string;
    departmentName: string;
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
    slaBreachedTasks: number;
    atRiskTasks: number;
    onTimeRate: number;
    slaBreachRate: number;
    tasksPerMember: number;
    workloadBalanceStatus: string; // Balanced, Moderate, Overloaded
}

interface FinancialInvoiceItem {
    invoiceNumber: string;
    fomsReference: string;
    clientAccount: string;
    department: string;
    billingDate: string;
    dueDate: string;
    paymentDate?: string;
    currency: string;
    amountBilled: number;
    amountPaid: number;
    outstandingBalance: number;
    paymentStatus: string;
    paymentMethod: string;
    fiscalPeriod: string;
}

interface FinancialReport {
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRate: number;
    totalInvoices: number;
    overdueInvoicesCount: number;
    fiscalPeriod: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    invoices: FinancialInvoiceItem[];
}

interface OperationalEmployeePerformance {
    employeeName: string;
    assigned: number;
    completed: number;
    overdue: number;
    completionRate: number;
}

interface WorkloadItem {
    categoryName: string;
    taskCount: number;
    percentage: number;
}

interface ReportFilterOption {
    id: string;
    name: string;
}

const TASK_CATEGORIES = [
    'RoutineDailyTask',
    'SpecialTask',
];

const TASK_STATUSES_FILTER = [
    'Pending',
    'In Progress',
    'Pending Admin Review',
    'Done',
    'Completed',
    'Overdue',
];

const PER_PAGE = 10;

const PRIORITY_LEVELS = ['Urgent', 'High', 'Medium', 'Low'];



// --- Task Template Types -------------------------------------------------------

interface TaskTemplateDTO {
    templateId: string;
    templateName: string;
    defaultTitle: string;
    templateDescription: string;
    priorityLevel: string;
    recurrenceType: string;
    recurrenceStartDate: string;
    assignedEmployeeId: string | null;
    assignedEmployeeName: string | null;
    templateStatus: string;
    nextGenerationDate: string | null;
    lastGeneratedDate: string | null;
    createdBy: string;
    createdByName: string | null;
    createdAt: string;
}

interface CreateTemplateDTO {
    templateName: string;
    defaultTitle: string;
    templateDescription: string;
    priorityLevel: string;
    recurrenceType: string;
    recurrenceStartDate: string;
    assignedEmployee: string | null;
    templateStatus: string;
}

const RECURRENCE_TYPES = ['Daily', 'Weekly', 'Monthly'];
const TEMPLATE_STATUSES = ['Active', 'Inactive'];
const RECURRENCE_LABELS: Record<string, string> = { Daily: 'Every day', Weekly: 'Every week', Monthly: 'Every month' };

// --- Mock Template Data (toggle to test without backend) ----------------------






const NAV_GROUPS = [
    {
        label: 'MAIN MENU',
        items: [
            { tab: 'dashboard' as NavTab, icon: LayoutDashboard, label: 'Dashboard' },
            { tab: 'tasks' as NavTab, icon: Package, label: 'Tasks' },
            { tab: 'team' as NavTab, icon: Users, label: 'Team' },
        ],
    },
    {
        label: 'TEMPLATES',
        items: [
            { tab: 'templates' as NavTab, icon: Copy, label: 'Task Templates' },
        ],
    },
    {
        label: 'REPORTS',
        items: [
            { tab: 'reports' as NavTab, icon: BarChart3, label: 'Reports' },
        ],
    },
    {
        label: 'ACCOUNT',
        items: [
            { tab: 'profile' as NavTab, icon: UserCircle2, label: 'Profile' },
            { tab: 'activity_logs' as NavTab, icon: Activity, label: 'Activity Logs' },
        ],
    },
];

// --- Helpers ------------------------------------------------------------------
const isEffectivelyOverdue = (t: Task): boolean =>
    t.taskStatus !== 'Completed' && t.taskStatus !== 'Draft' && t.taskStatus !== 'Done' && t.taskStatus !== 'Pending Admin Review' && !!t.dueAt && new Date(t.dueAt) < new Date();

const getInitials = (name: string): string => {
    if (!name) return 'OA';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
};

const statusBadgeClass = (s: string): string =>
({
    'Draft': 'badge badge-gray',
    'Assigned': 'badge badge-purple',
    'Pending': 'badge badge-blue',
    'In Progress': 'badge badge-amber',
    'Pending Admin Review': 'badge badge-purple',
    'Done': 'badge badge-blue',
    'Completed': 'badge badge-green',
    'Overdue': 'badge badge-red'
}[s] ?? 'badge badge-blue');

// --- FSM (Finite State Machine) Task Status Transitions ----------------------
const FSM_TRANSITIONS: Record<string, string[]> = {
    'Draft': ['Assigned'],
    'Assigned': ['In Progress'],
    'In Progress': ['Pending Admin Review'],
    'Pending Admin Review': ['Completed', 'In Progress'],
    'Done': ['Completed'],
    'Completed': [],
    'Pending': [],
    'Overdue': [],
};

const isTransitionValid = (from: string, to: string): boolean =>
    FSM_TRANSITIONS[from]?.includes(to) ?? false;

const priorityDotClass = (p: Priority): string =>
    ({ Urgent: 'prio-dot urgent', High: 'prio-dot high', Medium: 'prio-dot medium', Low: 'prio-dot low' }[p]);

const fmtDate = (d: string): string => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (d: string): string => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
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

const getActivityDescription = (log: any): string => {
    if (log.description && log.description.trim()) {
        return log.description;
    }
    const actor = log.actorName || log.userName || (log.firstName ? [log.firstName, log.lastName].filter(Boolean).join(' ') : 'User');
    const action = formatActionType(log.actionType);
    const entity = log.targetEntity || 'record';
    
    switch (log.actionType) {
        case 'Create':
            return `${actor} created new ${entity.toLowerCase()}${log.targetEntityId ? ` (#${String(log.targetEntityId).slice(0, 8)})` : ''}`;
        case 'Update':
            return `${actor} updated ${entity.toLowerCase()}`;
        case 'Delete':
            return `${actor} deleted ${entity.toLowerCase()}`;
        case 'StatusChange':
            return `${actor} changed ${entity.toLowerCase()} status${log.newValue ? ` to "${log.newValue}"` : ''}`;
        case 'Login':
            return `${actor} logged into the system`;
        case 'Logout':
            return `${actor} logged out`;
        case 'Upload':
            return `${actor} uploaded attachment for ${entity.toLowerCase()}`;
        case 'Export':
            return `${actor} exported ${entity.toLowerCase()} report data`;
        case 'AccessDenied':
            return `Unauthorized access attempt to ${entity}`;
        case 'BlockedAction':
            return `Blocked action attempt on ${entity}`;
        case 'DuplicateOverride':
            return `${actor} confirmed duplicate task override`;
        default:
            return `${actor} performed ${action} on ${entity}`;
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

const statusToProgress = (s: string): number => ({
    'Draft': 0,
    'Assigned': 10,
    'In Progress': 45,
    'Pending Admin Review': 75,
    'Done': 90,
    'Completed': 100,
    'Overdue': 45,
}[s] ?? 0);

// --- Sub-components -----------------------------------------------------------

const PRIO_META: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
    Urgent: { label: 'Urgent', color: '#7c1d1d', bg: '#fef2f2', border: '#fecaca', icon: '🔴' },
    High: { label: 'High', color: '#b91c1c', bg: '#fff7ed', border: '#fed7aa', icon: '🟠' },
    Medium: { label: 'Medium', color: '#92400e', bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
    Low: { label: 'Low', color: '#065f46', bg: '#f0fdf4', border: '#bbf7d0', icon: '🟢' },
};

const PrioBadge: React.FC<{ p: Priority }> = ({ p }) => {
    const m = PRIO_META[p] ?? PRIO_META.Medium;
    return (
        <span style={{
            fontSize: '0.65rem', padding: '1px 8px', borderRadius: 999, fontWeight: 700,
            color: m.color, background: m.bg, border: `1px solid ${m.border}`,
            display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
        }}>
            {m.icon} {m.label}
        </span>
    );
};

const ProgressBar: React.FC<{ pct: number; cls: string }> = ({ pct, cls }) => (
    <div className="progress-bar">
        <div className={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
);

interface TaskRowProps {
    task: Task;
    onView: (id: string) => void;   // string not number
    onEdit?: (id: string) => void;
    showEditBtn?: boolean;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, onView, onEdit, showEditBtn = false }) => {
    const od = isEffectivelyOverdue(task);
    const effectiveStatus = od ? 'Overdue' : task.taskStatus;
    const progress = statusToProgress(effectiveStatus);
    const refDisplay = task.taskReferenceNumber || task.taskId.slice(0, 8).toUpperCase();

    return (
        <div className="task-item" onClick={() => onView(task.taskId)}>
            <div className="task-row-top">
                <span className={priorityDotClass(task.priority)} />
                <span className="task-name">
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', marginRight: 6 }}>
                        #{refDisplay}
                    </span>
                    {task.taskTitle}
                </span>
                <span className={statusBadgeClass(effectiveStatus)}>{effectiveStatus}</span>
                {showEditBtn && onEdit && (
                    <ActionsDropdown
                        actions={[
                            {
                                label: 'Edit',
                                icon: <Pencil size={12} />,
                                onClick: () => onEdit(task.taskId)
                            },
                            {
                                label: 'View Details',
                                icon: <Eye size={12} />,
                                onClick: () => onView(task.taskId)
                            }
                        ]}
                    />
                )}
            </div>
            <div style={{ margin: '6px 0 4px', height: 4, background: '#e8ecf4', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? '#05cd99' : progress >= 75 ? '#4318ff' : progress >= 45 ? '#ffb547' : '#94a3b8', borderRadius: 2, transition: 'width 0.3s ease' }} />
            </div>
            <div className="task-row-bottom">
                <span className="task-assignee">{task.assignedEmployee || 'Unassigned'}</span>
                {task.isConfidential && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--status-failed)', background: 'rgba(238,93,80,0.08)', padding: '1px 6px', borderRadius: 4, marginRight: 8 }}>CONFIDENTIAL</span>}
                <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 12 }}>{task.updatedAt ? fmtDateTime(task.updatedAt) : ''}</span>
                <span className={`task-due${od ? ' overdue' : ''}`}>{task.dueAt ? fmtDate(task.dueAt) : '—'}</span>
            </div>
        </div>
    );
};

// --- Modal: New / Edit Task ---------------------------------------------------

interface TaskModalWorkloadInfo {
    accountId: string;
    employeeName: string;
    workload: number;
    department?: string;
    departmentId?: string;
    teamId?: string;
    teamName?: string;
    availabilityStatus: string;
    isAvailable: boolean;
}

interface TaskModalProps {
    mode: 'new' | 'edit';
    initial?: Partial<Task>;
    teamMembers: TeamMember[];
    tasks: Task[];
    onSave: (data: CreateTaskDTO | UpdateTaskDTO) => Promise<void> | void;
    onClose: () => void;
    onDelete?: () => void;
    showSuccess?: (msg: string) => void;
    onFileChange?: (files: File[]) => void;
}

const formatDateForInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getPriorityDeadlineRange = (priority: Priority | ''): { min: string; max?: string; maxDate?: Date; helperText: string } => {
    const now = new Date();
    const minStr = formatDateForInput(now);

    if (priority === 'Urgent') {
        const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return {
            min: minStr,
            max: formatDateForInput(d),
            maxDate: d,
            helperText: '🔴 Urgent SLA: Locked to 24 hours from creation.',
        };
    }
    if (priority === 'High') {
        const d = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        return {
            min: minStr,
            max: formatDateForInput(d),
            maxDate: d,
            helperText: '🟠 High: Deadline must be 1 to 2 days only from current date.',
        };
    }
    if (priority === 'Medium') {
        const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return {
            min: minStr,
            max: formatDateForInput(d),
            maxDate: d,
            helperText: '🟡 Medium: Deadline must be within 1 week (7 days) from current date.',
        };
    }
    if (priority === 'Low') {
        return {
            min: minStr,
            max: undefined,
            maxDate: undefined,
            helperText: '🟢 Low: Any future date can be selected.',
        };
    }
    return {
        min: minStr,
        max: undefined,
        maxDate: undefined,
        helperText: 'Select a priority to see the allowed deadline range.',
    };
};

const getQuickPickOptions = (priority: Priority | '') => {
    if (priority === 'High') {
        return [
            { label: '+1 Day (24h)', hours: 24 },
            { label: '+2 Days (48h max)', hours: 48 },
        ];
    }
    if (priority === 'Medium') {
        return [
            { label: '+2 Days', hours: 48 },
            { label: '+3 Days', hours: 72 },
            { label: '+5 Days', hours: 120 },
            { label: '+1 Week (7d max)', hours: 168 },
        ];
    }
    if (priority === 'Low') {
        return [
            { label: '+1 Week', hours: 168 },
            { label: '+2 Weeks', hours: 336 },
            { label: '+1 Month (30d)', hours: 720 },
        ];
    }
    return [];
};

const TaskModal: React.FC<TaskModalProps> = ({
    mode,
    initial = {},
    teamMembers,
    tasks,
    onSave,
    onClose,
    onDelete,
    showSuccess,
    onFileChange,
}) => {
    const existingTitles = useMemo(() => tasks.map(t => t.taskTitle).filter(Boolean), [tasks]);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [supportingEvidenceFiles, setSupportingEvidenceFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        taskTitle: initial.taskTitle ?? '',
        taskDescription: initial.taskDescription ?? '',
        taskCategory: initial.taskCategory ?? '',
        priority: (initial.priority ?? 'Medium') as Priority,
        dueAt: initial.dueAt ? initial.dueAt.slice(0, 16) : '',
        isConfidential: initial.isConfidential ?? false,
        assignmentScope: (initial.assignees && initial.assignees.length > 1 ? 'Team' : 'SingleEmployee') as 'SingleEmployee' | 'Team' | 'Department',
        assignedTo: initial.assignedTo ?? '',
        assignedDepartmentId: '',
        taskRemarks: initial.taskRemarks ?? '',
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [eligibleEmployees, setEligibleEmployees] = useState<TaskModalWorkloadInfo[]>([]);
    const [teamsForTask, setTeamsForTask] = useState<Array<{ id: string; name: string; memberCount: number; departmentId?: string; departmentName?: string; memberIds?: string[] }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
    const [recommendation, setRecommendation] = useState<{ accountId: string; employeeName: string; reason: string } | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [singleSearch, setSingleSearch] = useState('');
    const [filterDeptId, setFilterDeptId] = useState('');
    const [filterTeamId, setFilterTeamId] = useState('');

    const slaLocked = form.priority === 'Urgent';
    const deadlineRange = getPriorityDeadlineRange(form.priority);
    const quickPicks = getQuickPickOptions(form.priority);

    // Fetch assignable employees, teams, and departments
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [empRes, teamRes, deptRes] = await Promise.allSettled([
                    api.get('/api/Task/assignable-users'),
                    api.get('/api/Team?pageNumber=1&pageSize=100'),
                    api.get('/api/Department'),
                ]);

                if (empRes.status === 'fulfilled' && empRes.value?.data) {
                    const rawList: any[] = empRes.value.data?.data ?? empRes.value.data ?? [];
                    const mapped: TaskModalWorkloadInfo[] = rawList.map((e: any) => ({
                        accountId: e.id ?? e.accountId ?? e.userId ?? '',
                        employeeName: e.fullName ?? e.employeeName ?? e.name ?? 'Unknown',
                        workload: e.workload ?? e.activeTaskCount ?? 0,
                        department: e.departmentName ?? e.department ?? '',
                        departmentId: e.departmentId ? String(e.departmentId) : '',
                        teamId: e.teamId ? String(e.teamId) : '',
                        teamName: e.teamName ?? '',
                        availabilityStatus: typeof e.availabilityStatus === 'object'
                            ? (e.availabilityStatus?.status ?? (e.availabilityStatus?.isAvailable ? 'Available' : 'Unavailable'))
                            : (e.availabilityStatus ?? (e.isAvailable ? 'Available' : 'Unavailable')),
                        isAvailable: typeof e.availabilityStatus === 'object'
                            ? Boolean(e.availabilityStatus?.isAvailable)
                            : (e.isAvailable !== false && e.availabilityStatus !== 'Offline' && e.availabilityStatus !== 'On Leave'),
                    }));
                    setEligibleEmployees(mapped);
                    if (mapped.length > 0) {
                        const available = mapped.filter(e => e.isAvailable);
                        const pool = available.length > 0 ? available : mapped;
                        const best = pool.reduce((acc, curr) => (curr.workload < acc.workload ? curr : acc), pool[0]);
                        setRecommendation({
                            accountId: best.accountId,
                            employeeName: best.employeeName,
                            reason: `Lowest active workload (${best.workload} tasks)`,
                        });
                    }
                }

                if (teamRes.status === 'fulfilled' && teamRes.value?.data) {
                    const tList: any[] = teamRes.value.data?.data?.items ?? teamRes.value.data?.data ?? teamRes.value.data ?? [];
                    setTeamsForTask(tList.map((t: any) => ({
                        id: t.id ?? t.teamId,
                        name: t.name ?? t.teamName,
                        memberCount: t.memberCount ?? t.members?.length ?? 0,
                        departmentId: t.departmentId ? String(t.departmentId) : '',
                        departmentName: t.departmentName ?? '',
                        memberIds: t.members?.map((m: any) => m.userId ?? m.id) ?? [],
                    })));
                }

                if (deptRes.status === 'fulfilled' && deptRes.value?.data) {
                    const dList: any[] = deptRes.value.data?.data ?? deptRes.value.data ?? [];
                    setDepartments(dList.map((d: any) => ({
                        id: String(d.departmentId ?? d.id),
                        name: d.name ?? d.departmentName ?? '',
                    })));
                }
            } catch {
                // fallback gracefully
            }
        };
        fetchMeta();
    }, []);

    // Filtered teams based on department
    const availableTeams = useMemo(() => {
        if (!filterDeptId) return teamsForTask;
        return teamsForTask.filter(t => t.departmentId === filterDeptId);
    }, [teamsForTask, filterDeptId]);

    // Filtered employees based on department and team
    const filteredEmployees = useMemo(() => {
        let list = eligibleEmployees;
        if (filterDeptId) {
            list = list.filter(e => e.departmentId === filterDeptId);
        }
        if (filterTeamId) {
            const team = teamsForTask.find(t => t.id === filterTeamId);
            list = list.filter(e => e.teamId === filterTeamId || (team?.memberIds && team.memberIds.includes(e.accountId)));
        }
        if (singleSearch.trim()) {
            const q = singleSearch.toLowerCase();
            list = list.filter(e =>
                e.employeeName.toLowerCase().includes(q) ||
                (e.department && e.department.toLowerCase().includes(q)) ||
                (e.teamName && e.teamName.toLowerCase().includes(q))
            );
        }
        return list;
    }, [eligibleEmployees, filterDeptId, filterTeamId, singleSearch, teamsForTask]);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const val = e.target.value;
        setForm(prev => ({ ...prev, [k]: val }));
        setFormError('');
        const msg = validateField(k, val);
        setErrors(prev => ({ ...prev, [k]: msg || '' }));
    };

    const validateField = (name: string, val: any): string => {
        if (name === 'taskTitle') {
            if (!val || !val.trim()) return 'Task title is required.';
            if (val.trim().length < 3) return 'Task title must be at least 3 characters.';
            if (val.trim().length > 150) return 'Task title cannot exceed 150 characters.';
        }
        if (name === 'taskDescription') {
            if (!val || !val.trim()) return 'Task description is required.';
            if (val.trim().length < 5) return 'Task description must be at least 5 characters.';
            if (val.trim().length > 2000) return 'Task description cannot exceed 2000 characters.';
        }
        if (name === 'dueAt') {
            if (!val) return 'Due date is required.';
            const d = new Date(val);
            if (isNaN(d.getTime())) return 'Invalid due date.';
            const now = new Date();
            if (d < now) return 'Due date cannot be in the past.';
            if (form.priority === 'High') {
                const maxHigh = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
                if (d > maxHigh) return 'High priority deadline must be within 1 to 2 days only from current date.';
            } else if (form.priority === 'Medium') {
                const maxMed = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                if (d > maxMed) return 'Medium priority deadline must be within 1 week (7 days) from current date.';
            }
        }
        if (name === 'priority') {
            if (!val) return 'Priority is required.';
        }
        if (name === 'assignedTo' && form.assignmentScope === 'SingleEmployee') {
            if (!val) return 'Please select an employee.';
        }
        if (name === 'assignedTo' && form.assignmentScope === 'Team') {
            if (!selectedTeamId) return 'Please select a team.';
        }
        if (name === 'assignedDepartmentId' && form.assignmentScope === 'Department') {
            if (!val) return 'Please select a department.';
        }
        return '';
    };

    const validateAll = (): boolean => {
        const errs: Record<string, string> = {
            taskTitle: validateField('taskTitle', form.taskTitle),
            taskDescription: validateField('taskDescription', form.taskDescription),
            dueAt: validateField('dueAt', form.dueAt),
            priority: validateField('priority', form.priority),
        };
        if (form.assignmentScope === 'SingleEmployee') {
            errs.assignedTo = validateField('assignedTo', form.assignedTo);
        } else if (form.assignmentScope === 'Team') {
            errs.assignedTo = validateField('assignedTo', selectedTeamId);
        } else if (form.assignmentScope === 'Department') {
            errs.assignedDepartmentId = validateField('assignedDepartmentId', form.assignedDepartmentId);
        }
        const cleaned = Object.fromEntries(Object.entries(errs).filter(([, v]) => !!v));
        setErrors(cleaned);
        return Object.keys(cleaned).length === 0;
    };

    const handleSave = async () => {
        if (!validateAll()) {
            setFormError('Please resolve the highlighted validation errors before saving.');
            return;
        }
        setSubmitting(true);
        setFormError('');

        const scopeMap = { SingleEmployee: 0, Team: 1, Department: 2 };
        const prioMap = { Low: 0, Medium: 1, High: 2, Urgent: 3 };

        const payload: any = {
            title: form.taskTitle.trim(),
            description: form.taskDescription.trim(),
            priorityLevel: prioMap[form.priority] ?? 1,
            classification: 0,
            assignmentScope: scopeMap[form.assignmentScope] ?? 0,
            deadline: form.dueAt ? new Date(form.dueAt).toISOString() : null,
            isConfidential: form.isConfidential,
            assignedUserIds: form.assignmentScope === 'SingleEmployee' && form.assignedTo ? [form.assignedTo] : [],
            teamId: form.assignmentScope === 'Team' ? selectedTeamId || undefined : undefined,
            assignedDepartmentId: form.assignmentScope === 'Department' ? form.assignedDepartmentId || undefined : undefined,
        };

        if (supportingEvidenceFiles.length > 0) {
            onFileChange?.(supportingEvidenceFiles);
        }
        try {
            await onSave(payload);
        } catch {
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    // -- Shared field error renderer ---------------------------------------
    const FieldErr = ({ name }: { name: string }) =>
        errors[name] ? (
            <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={11} />{errors[name]}
            </span>
        ) : null;

    // -- Char counter renderer ---------------------------------------------
    const CharCount = ({ value, max }: { value: string; max: number }) => (
        <span style={{
            fontSize: 11, marginTop: 3, display: 'block', textAlign: 'right',
            color: value.length > max * 0.9 ? (value.length >= max ? 'var(--status-failed, #ee5d50)' : '#c05c00') : 'var(--text-secondary)',
        }}>
            {value.length}/{max}
        </span>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3>{mode === 'new' ? 'Create New Task' : 'Edit Task'}</h3>
                        <p className="modal-subtitle">
                            {mode === 'new' ? 'Fill in the details to create a new task.' : 'Update the task details below.'}
                        </p>
                    </div>
                    <button className="icon-btn" onClick={onClose}><X size={16} /></button>
                </div>

                <div className="modal-form">

                    {/* -- Task Title -- */}
                    <div className="field">
                        <label>Task Title <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                        <input
                            value={form.taskTitle}
                            onChange={set('taskTitle')}
                            placeholder="e.g. Route planning update"
                            className={errors.taskTitle ? 'input-error' : ''}
                            maxLength={150}
                            style={{ outline: 'none' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <FieldErr name="taskTitle" />
                            {!errors.taskTitle && form.taskTitle.trim().length >= 3 && (() => {
                                const preview = mode === 'new' ? resolveIncrementalTitlePreview(form.taskTitle, existingTitles) : '';
                                if (preview && preview !== form.taskTitle.trim()) {
                                    return (
                                        <span style={{ fontSize: 11, color: '#0284c7', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Info size={11} /> Existing title found: will create as &quot;<strong>{preview}</strong>&quot;
                                        </span>
                                    );
                                }
                                return <span style={{ fontSize: 11, color: 'var(--status-active)', marginTop: 3 }}>✓ Looks good</span>;
                            })()}
                            <CharCount value={form.taskTitle} max={150} />
                        </div>
                    </div>

                    {/* -- Description -- */}
                    <div className="field">
                        <label>Description <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                        <textarea
                            value={form.taskDescription}
                            onChange={set('taskDescription')}
                            placeholder="Describe the task..."
                            rows={3}
                            className={errors.taskDescription ? 'input-error' : ''}
                            maxLength={2000}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <FieldErr name="taskDescription" />
                            <CharCount value={form.taskDescription} max={2000} />
                        </div>
                    </div>

                    {/* -- Due Date + Priority -- */}
                    <div className="field-row">
                        <div className="field">
                            <label>
                                Due Date <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span>
                                {deadlineRange.maxDate && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#0284c7', background: 'rgba(2,132,199,0.08)', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>
                                        Max: {deadlineRange.maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </label>
                            <input
                                type="datetime-local"
                                value={form.dueAt}
                                onChange={slaLocked ? undefined : set('dueAt')}
                                min={deadlineRange.min}
                                max={deadlineRange.max}
                                readOnly={slaLocked}
                                className={`${errors.dueAt ? 'input-error' : form.dueAt ? 'input-success' : ''}${slaLocked ? ' input-sla-locked' : ''}`}
                                style={slaLocked ? { background: '#fef2f2', cursor: 'not-allowed', opacity: 0.85 } : {}}
                            />
                            <FieldErr name="dueAt" />
                            {deadlineRange.helperText && (
                                <span style={{ fontSize: 11, color: slaLocked ? '#7c1d1d' : 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                                    {deadlineRange.helperText}
                                </span>
                            )}
                            {quickPicks.length > 0 && !slaLocked && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', alignSelf: 'center', marginRight: 2 }}>Quick:</span>
                                    {quickPicks.map(qp => (
                                        <button
                                            key={qp.label}
                                            type="button"
                                            onClick={() => {
                                                const target = new Date(Date.now() + qp.hours * 60 * 60 * 1000);
                                                const formatted = formatDateForInput(target);
                                                setForm(p => ({ ...p, dueAt: formatted }));
                                                setErrors(p => ({ ...p, dueAt: '' }));
                                            }}
                                            style={{
                                                fontSize: 10.5,
                                                padding: '2px 7px',
                                                borderRadius: 4,
                                                border: '1px solid #cbd5e1',
                                                background: '#f8fafc',
                                                color: '#334155',
                                                cursor: 'pointer',
                                                fontWeight: 500
                                            }}
                                        >
                                            {qp.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="field">
                            <label>
                                Priority <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span>
                            </label>
                            <select
                                value={form.priority}
                                onChange={e => {
                                    const val = e.target.value as Priority;
                                    const range = getPriorityDeadlineRange(val);
                                    let newDueAt = form.dueAt;
                                    if (val === 'Urgent') {
                                        const sla = new Date(Date.now() + 24 * 60 * 60 * 1000);
                                        newDueAt = formatDateForInput(sla);
                                    } else if (range.maxDate && form.dueAt) {
                                        const curr = new Date(form.dueAt);
                                        if (curr > range.maxDate) {
                                            newDueAt = formatDateForInput(range.maxDate);
                                        }
                                    }
                                    setForm(prev => ({ ...prev, priority: val, dueAt: newDueAt }));
                                    setFormError('');
                                    const msg = validateField('priority', val);
                                    setErrors(prev => ({ ...prev, priority: msg || '', dueAt: '' }));
                                }}
                                className={errors.priority ? 'input-error' : ''}
                            >
                                <option value="">Select priority</option>
                                <option value="Urgent">🔴 Urgent</option>
                                <option value="High">🟠 High (1-2 days)</option>
                                <option value="Medium">🟡 Medium (within 1 week)</option>
                                <option value="Low">🟢 Low (any future date)</option>
                            </select>
                            <FieldErr name="priority" />
                            {!errors.priority && form.priority && (
                                <span style={{
                                    fontSize: 11, marginTop: 3, display: 'block',
                                    color: form.priority === 'Urgent' ? '#7c1d1d' : form.priority === 'High' ? 'var(--status-failed)' : form.priority === 'Medium' ? 'var(--status-pending)' : 'var(--status-active)',
                                }}>
                                    {form.priority === 'Urgent' && '🔴 Urgent — 24h SLA enforced'}
                                    {form.priority === 'High' && '🟠 High — Deadline restricted to 1–2 days'}
                                    {form.priority === 'Medium' && '🟡 Medium — Deadline restricted to 1 week'}
                                    {form.priority === 'Low' && '🟢 Low — Any future deadline allowed'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* -- Task Category -- */}
                    <div className="field">
                        <label>Task Category <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                        <select
                            value={form.taskCategory}
                            onChange={set('taskCategory')}
                        >
                            <option value="">Select category</option>
                            <option value="Operations">Operations</option>
                            <option value="Logistics">Logistics</option>
                            <option value="IT & Admin">IT & Admin</option>
                            <option value="Customer Service">Customer Service</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* -- Supporting Document -- */}
                    <div className="field">
                        <label>Supporting Document <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(optional) — select one or more files</span></label>
                        {initial.supportingEvidenceUrl && supportingEvidenceFiles.length === 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '8px 12px', background: 'rgba(67,24,255,0.04)', border: '1px solid rgba(67,24,255,0.15)', borderRadius: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {(initial.supportingEvidenceUrl.split('/').pop() || '').replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => window.open(initial.supportingEvidenceUrl, '_blank')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 4, fontSize: 11, fontWeight: 600 }}
                                >
                                    View
                                </button>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.docx,.xlsx,.jpg,.png"
                                onChange={e => {
                                    const files = Array.from(e.target.files ?? []);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                    if (files.length === 0) return;
                                    const allowed = ['pdf', 'docx', 'xlsx', 'jpg', 'png'];
                                    for (const file of files) {
                                        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
                                        if (!allowed.includes(ext)) {
                                            setFormError(`Invalid file format "${file.name}". Allowed: PDF, DOCX, XLSX, JPG, PNG.`);
                                            return;
                                        }
                                        if (file.size > 20 * 1024 * 1024) {
                                            setFormError(`File "${file.name}" exceeds the maximum size of 20MB.`);
                                            return;
                                        }
                                    }
                                    setFormError('');
                                    const existingKeys = new Set(supportingEvidenceFiles.map(f => `${f.name}-${f.size}`));
                                    const newUnique = files.filter(f => !existingKeys.has(`${f.name}-${f.size}`));
                                    const updated = [...supportingEvidenceFiles, ...newUnique];
                                    setSupportingEvidenceFiles(updated);
                                    onFileChange?.(updated);
                                }}
                                style={{ display: supportingEvidenceFiles.length > 0 ? 'none' : 'block', flex: 1, fontSize: 13 }}
                            />
                        </div>
                        {supportingEvidenceFiles.length > 0 ? (
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {supportingEvidenceFiles.map((file, idx) => (
                                        <div key={`${file.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,169,157,0.05)', border: '1px solid rgba(0,169,157,0.18)', borderRadius: 6 }}>
                                            <span style={{ fontSize: 11, color: 'var(--status-active)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = supportingEvidenceFiles.filter((_, i) => i !== idx);
                                                    setSupportingEvidenceFiles(next);
                                                    onFileChange?.(next);
                                                }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ee5d50', padding: 2 }}
                                                aria-label={`Remove ${file.name}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--primary, #0284c7)', background: 'rgba(2, 132, 199, 0.08)', border: '1px dashed rgba(2, 132, 199, 0.4)', borderRadius: 6, cursor: 'pointer' }}
                                    >
                                        <Plus size={13} /> Upload more
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSupportingEvidenceFiles([]);
                                            onFileChange?.([]);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ee5d50', padding: 4, fontSize: 11, fontWeight: 600 }}
                                    >
                                        Clear all
                                    </button>
                                </div>
                                <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {supportingEvidenceFiles.length} file{supportingEvidenceFiles.length === 1 ? '' : 's'} selected — uploaded after the task is saved.
                                </span>
                            </div>
                        ) : initial.supportingEvidenceUrl ? (
                            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, display: 'block' }}>
                                Leave empty to keep current file. Select new files above to add attachments.
                            </span>
                        ) : null}
                    </div>

                    {/* -- Confidential Task Toggle -- */}
                    <label className={`conf-card${form.isConfidential ? ' active' : ''}`} style={{ marginBottom: 12 }}>
                        <input type="checkbox" checked={form.isConfidential}
                            onChange={e => setForm(prev => ({ ...prev, isConfidential: e.target.checked }))} />
                        <div className="conf-card-body">
                            <div className="conf-label-row">
                                <span className="conf-icon">
                                    <Lock size={14} color={form.isConfidential ? '#ee5d50' : 'var(--text-secondary)'} />
                                </span>
                                <span className="conf-title">Confidential Task</span>
                                {form.isConfidential && <span className="conf-badge">Restricted</span>}
                            </div>
                            <span className="conf-desc">
                                {form.isConfidential ? (
                                    <>Only <strong>Coordinators</strong> &amp; <strong>Manager</strong> can view this task</>
                                ) : (
                                    'Restrict visibility to Coordinators and Manager only'
                                )}
                            </span>
                        </div>
                    </label>

                    {/* -- Assignment Scope -- */}
                    <div className="sr-section">
                        <div className="sr-header">
                            <div className="sr-title-row">
                                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                                    Assignment Scope &amp; Target
                                </span>
                            </div>
                        </div>

                        <div className="scope-selector">
                            {(['SingleEmployee', 'Team', 'Department'] as const).map(scope => (
                                <label
                                    key={scope}
                                    className={`scope-option${form.assignmentScope === scope ? ' active' : ''}`}
                                    onClick={() => {
                                        setForm(prev => ({ ...prev, assignmentScope: scope, assignedDepartmentId: '' }));
                                        setErrors(prev => ({ ...prev, assignmentScope: '', assignedTo: '', assignedDepartmentId: '' }));
                                        setSelectedTeamId('');
                                    }}
                                >
                                    <input type="radio" name="scope" value={scope}
                                        checked={form.assignmentScope === scope}
                                        onChange={() => { }} />
                                    {scope === 'SingleEmployee' ? <UserCircle2 className="scope-icon" /> : scope === 'Team' ? <Users className="scope-icon" /> : <Building className="scope-icon" />}
                                    {scope === 'SingleEmployee' ? 'Single' : scope === 'Team' ? 'Team' : 'Department'}
                                </label>
                            ))}
                        </div>

                        {/* -- SingleEmployee: pick one user -- */}
                        {form.assignmentScope === 'SingleEmployee' && (
                            <div className="emp-picker-section">
                                {recommendation && (
                                    <div className="emp-picker-rec-banner">
                                        <Lightbulb size={13} />
                                        <span>Recommended: <strong>{recommendation.employeeName}</strong> — {recommendation.reason}</span>
                                    </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Department Filter</label>
                                        <select
                                            value={filterDeptId}
                                            onChange={e => {
                                                setFilterDeptId(e.target.value);
                                                setFilterTeamId('');
                                            }}
                                            style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Team Filter</label>
                                        <select
                                            value={filterTeamId}
                                            onChange={e => setFilterTeamId(e.target.value)}
                                            style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                                        >
                                            <option value="">All Teams {filterDeptId ? 'in Department' : ''}</option>
                                            {availableTeams.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.memberCount})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    className="emp-picker-search"
                                    placeholder="Search employees…"
                                    value={singleSearch}
                                    onChange={e => setSingleSearch(e.target.value)}
                                />
                                {filteredEmployees.length > 0 ? (
                                    <div className="emp-picker-list">
                                        {filteredEmployees.map(e => {
                                            const isSelected = form.assignedTo === e.accountId;
                                            const isRecommended = recommendation?.accountId === e.accountId;
                                            const disabled = !e.isAvailable;
                                            return (
                                                <div key={e.accountId}
                                                    className={`emp-picker-row${isSelected ? ' selected' : ''}${isRecommended && !isSelected ? ' recommended' : ''}${disabled ? ' disabled' : ''}`}
                                                    onClick={() => { if (disabled) return; setForm(prev => ({ ...prev, assignedTo: e.accountId })); setErrors(prev => ({ ...prev, assignedTo: '' })); }}
                                                >
                                                    <input type="radio" name="singleEmp" className="emp-picker-radio" checked={isSelected} disabled={disabled} onChange={() => { }} />
                                                    <div className="emp-picker-info">
                                                        <span className="emp-picker-name">{e.employeeName}</span>
                                                        <div className="emp-picker-meta">
                                                            <span className={`emp-picker-dot ${e.isAvailable ? 'active' : e.availabilityStatus === 'Offline' ? 'offline' : 'leave'}`} />
                                                            <span>{e.availabilityStatus}</span>
                                                            <span>{e.workload} tasks</span>
                                                            {e.department && <span style={{ color: '#64748b' }}>• {e.department}</span>}
                                                            {e.teamName && <span style={{ color: '#0284c7' }}>• {e.teamName}</span>}
                                                        </div>
                                                    </div>
                                                    {isRecommended && <span className="emp-picker-tag best">Best pick</span>}
                                                    {isSelected && <span className="emp-picker-tag selected-tag"><CheckCircle2 size={11} /> Selected</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="emp-picker-empty">No eligible employees found for assignment matching filters.</div>
                                )}
                                <FieldErr name="assignedTo" />
                                {!errors.assignedTo && form.assignedTo && (
                                    <span className="emp-picker-confirm"><CheckCircle2 size={12} /> {eligibleEmployees.find(e => e.accountId === form.assignedTo)?.employeeName ?? 'Employee'} assigned</span>
                                )}
                            </div>
                        )}

                        {/* -- Team: pick a team from Team Management -- */}
                        {form.assignmentScope === 'Team' && (
                            <div className="field" style={{ marginBottom: 0 }}>
                                <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>Department Filter</label>
                                    <select
                                        value={filterDeptId}
                                        onChange={e => {
                                            setFilterDeptId(e.target.value);
                                            setSelectedTeamId('');
                                        }}
                                        style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                                    >
                                        <option value="">All Departments</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <label>Team <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select
                                    value={selectedTeamId}
                                    onChange={e => { setSelectedTeamId(e.target.value); setErrors(prev => ({ ...prev, assignedTo: '' })); }}
                                    className={errors.assignedTo ? 'input-error' : ''}
                                >
                                    <option value="">Select team</option>
                                    {availableTeams.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.memberCount} member{t.memberCount !== 1 ? 's' : ''}){t.departmentName ? ` — ${t.departmentName}` : ''}</option>
                                    ))}
                                </select>
                                {availableTeams.length === 0 && (
                                    <div style={{ fontSize: 11, color: 'var(--status-warn, #d97706)', marginTop: 4 }}>
                                        None — no teams {filterDeptId ? 'under selected department' : 'created yet'}.
                                    </div>
                                )}
                                <FieldErr name="assignedTo" />
                                {!errors.assignedTo && selectedTeamId && (
                                    <span className="emp-picker-confirm"><CheckCircle2 size={12} /> Assigned to team: {teamsForTask.find(t => t.id === selectedTeamId)?.name ?? ''}</span>
                                )}
                            </div>
                        )}

                        {/* -- Department: pick a department -- */}
                        {form.assignmentScope === 'Department' && (
                            <div className="field" style={{ marginBottom: 0 }}>
                                <label>Target Department <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select
                                    value={form.assignedDepartmentId}
                                    onChange={e => { setForm(prev => ({ ...prev, assignedDepartmentId: e.target.value })); setErrors(prev => ({ ...prev, assignedDepartmentId: '' })); }}
                                    className={errors.assignedDepartmentId ? 'input-error' : ''}
                                >
                                    <option value="">Select department</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                                <FieldErr name="assignedDepartmentId" />
                            </div>
                        )}
                    </div>

                    {/* -- Remarks (edit mode only) -- */}
                    {mode === 'edit' && (
                        <div className="field">
                            <label>Remarks</label>
                            <input
                                value={form.taskRemarks}
                                onChange={set('taskRemarks')}
                                placeholder="Optional remarks..."
                                maxLength={200}
                            />
                            <CharCount value={form.taskRemarks} max={200} />
                        </div>
                    )}
                </div>

                {formError && (
                    <div className="form-api-error" style={{ marginBottom: 8 }}>
                        <AlertCircle size={14} /><span>{formError}</span>
                    </div>
                )}

                <div className="modal-actions">
                    <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                        {mode === 'edit' && onDelete && (
                            <button className="btn btn-danger" onClick={() => onDelete()} disabled={submitting}>
                                <Trash2 size={13} /> Delete Task
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={submitting}>
                            {submitting
                                ? <><Loader2 size={13} className="spin" /> Saving…</>
                                : <><Save size={13} /> Save Changes</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Modal: View Task ---------------------------------------------------------

interface ViewModalProps {
    task: Task;
    onEdit: () => void;
    onReopen: () => void;
    onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
    onAdminOverride: (taskId: string) => void;
    onClose: () => void;
    onViewMore?: () => void;
    onReview?: () => void;
}

const ViewModal: React.FC<ViewModalProps> = ({ task, onEdit, onReopen, onStatusChange, onAdminOverride, onClose, onViewMore, onReview }) => {
    const nextStatus = (FSM_TRANSITIONS[task.taskStatus]?.[0] ?? '') as TaskStatus;
    const canTransition = !!nextStatus;
    const statusLabel: Record<string, string> = {
        'Draft': 'Assign Task',
        'Assigned': 'Mark In Progress',
        'In Progress': 'Mark Done',
        'Done': 'Approve & Complete',
        'Pending Admin Review': 'Review & Complete',
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card view-modal-card" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="view-modal-header">
                    <div>
                        <h3 className="view-modal-title">{task.taskTitle} {task.isConfidential && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-failed)', background: 'rgba(238,93,80,0.08)', padding: '2px 8px', borderRadius: 4, verticalAlign: 'middle', marginLeft: 8 }}>CONFIDENTIAL</span>}</h3>
                        <p className="view-modal-subtitle">Created by: {task.createdByEmployee}</p>
                    </div>
                </div>

                {/* Meta row */}
                <div className="view-modal-meta">
                    <div className="view-modal-meta-item">
                        <span className="view-modal-label">Due Date</span>
                        <span className="view-modal-meta-value">{task.dueAt ? fmtDate(task.dueAt) : '—'}</span>
                    </div>
                    <div className="view-modal-meta-item">
                        <span className="view-modal-label">Priority</span>
                        <PrioBadge p={task.priority} />
                    </div>
                    <div className="view-modal-meta-item">
                        <span className="view-modal-label">Status</span>
                        <span className={statusBadgeClass(task.taskStatus)}>{task.taskStatus}</span>
                    </div>
                </div>

                {/* Description */}
                <div className="view-modal-section">
                    <label className="view-modal-label">Description</label>
                    <div className="view-modal-desc-box">
                        {task.taskDescription || ''}
                    </div>
                </div>

                {/* Assigned To */}
                <div className="view-modal-section">
                    <label className="view-modal-label">Assigned To:</label>
                    <div className="view-modal-assignee-box">
                        {task.assignees && task.assignees.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                {task.assignees.map((a, i) => {
                                    const pct = a.completionPercentage ?? 0;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className="view-modal-assignee-name" style={{ flex: 1, fontWeight: 600 }}>
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
                        ) : (
                            task.assignedEmployee || 'Unassigned'
                        )}
                    </div>
                </div>

                {/* Remarks if any */}
                {task.taskRemarks && (
                    <div className="view-modal-section">
                        <label className="view-modal-label">Remarks</label>
                        <div className="view-modal-desc-box">{task.taskRemarks}</div>
                    </div>
                )}

                {/* Actions */}
                <div className="view-modal-actions">
                    {canTransition && task.taskStatus !== 'Pending Admin Review' && (
                        <button className="btn btn-primary" onClick={() => onStatusChange(task.taskId, nextStatus)}
                            title={`Transition to ${nextStatus}`}>
                            {statusLabel[task.taskStatus] ?? `Move to ${nextStatus}`}
                        </button>
                    )}
                    {task.taskStatus === 'Pending Admin Review' && (
                        <button className="btn btn-primary" onClick={onReview}
                            title="Review task submission">
                            <Eye size={13} /> Review Task
                        </button>
                    )}
                    {task.taskStatus === 'Completed' && (
                        <button className="btn btn-primary" onClick={() => onAdminOverride(task.taskId)}
                            title="Admin override for completed task">
                            <RotateCcw size={13} /> Admin Override
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={onViewMore}>
                        View More
                    </button>
                    {task.taskStatus !== 'Completed' && (
                        <button className="btn btn-primary" onClick={onEdit}>
                            <Pencil size={13} /> Edit Task
                        </button>
                    )}
                    <button className="btn" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

// --- Admin Override Modal ------------------------------------------------------
const OVERRIDE_TARGETS = ['Assigned', 'In Progress', 'Done'];

interface AdminOverrideModalProps {
    task: Task;
    onSubmit: (reason: string, remarks: string, requestedStatus: string) => void;
    onClose: () => void;
}

const AdminOverrideModal: React.FC<AdminOverrideModalProps> = ({ task, onSubmit, onClose }) => {
    const [requestedStatus, setRequestedStatus] = useState('In Progress');
    const [reason, setReason] = useState('');
    const [remarks, setRemarks] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [errors, setErrors] = useState<{ reason?: string; remarks?: string; confirmed?: string; requestedStatus?: string }>({});

    const handleSubmit = () => {
        const e: typeof errors = {};
        if (!requestedStatus) e.requestedStatus = 'Target status is required.';
        if (!reason.trim()) e.reason = 'Override reason is required.';
        else if (reason.length > 500) e.reason = 'Override reason must not exceed 500 characters.';
        if (!remarks.trim()) e.remarks = 'Admin remarks are required.';
        else if (remarks.length > 500) e.remarks = 'Admin remarks must not exceed 500 characters.';
        if (!confirmed) e.confirmed = 'You must confirm this override.';
        setErrors(e);
        if (Object.keys(e).length === 0) onSubmit(reason.trim(), remarks.trim(), requestedStatus);
    };

    return (
        <FormModal isOpen onClose={onClose} title="Admin Override" subtitle={`Modifying completed task: ${task.taskTitle}`} size="sm" confirmOnCancel={true}
            footer={
                <>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit}
                        style={{ background: 'var(--status-failed)', borderColor: 'var(--status-failed)' }}>
                        <Shield size={14} /> Submit Override
                    </button>
                </>
            }
        >
            <div className="view-modal-meta" style={{ marginBottom: 16 }}>
                <div className="view-modal-meta-item">
                    <span className="view-modal-label">Task ID</span>
                    <span className="view-modal-meta-value" style={{ fontSize: 12 }}>{task.taskId}</span>
                </div>
                <div className="view-modal-meta-item">
                    <span className="view-modal-label">Current Status</span>
                    <span className={statusBadgeClass(task.taskStatus)}>{task.taskStatus}</span>
                </div>
                <div className="view-modal-meta-item">
                    <span className="view-modal-label">Priority</span>
                    <PrioBadge p={task.priority} />
                </div>
            </div>

            <div className="field">
                <label>Requested Status *</label>
                <select value={requestedStatus} onChange={e => setRequestedStatus(e.target.value)}
                    className={errors.requestedStatus ? 'report-input report-input-error' : 'report-input'}>
                    {OVERRIDE_TARGETS.map(s => (<option key={s} value={s}>{s}</option>))}
                </select>
                {errors.requestedStatus && <span className="report-field-error">{errors.requestedStatus}</span>}
            </div>

            <div className="field">
                <label>Override Reason *</label>
                <textarea className={errors.reason ? 'report-input report-input-error' : 'report-input'}
                    rows={3} maxLength={500} value={reason}
                    onChange={e => { setReason(e.target.value); setErrors(p => ({ ...p, reason: '' })); }}
                    placeholder="Explain why this completed task needs modification..." />
                {errors.reason && <span className="report-field-error">{errors.reason}</span>}
                <span style={{ fontSize: 11, marginTop: 3, display: 'block', textAlign: 'right', color: reason.length > 450 ? (reason.length >= 500 ? 'var(--status-failed)' : '#c05c00') : 'var(--text-secondary)' }}>
                    {reason.length}/500
                </span>
            </div>

            <div className="field">
                <label>Admin Remarks *</label>
                <textarea className={errors.remarks ? 'report-input report-input-error' : 'report-input'}
                    rows={3} maxLength={500} value={remarks}
                    onChange={e => { setRemarks(e.target.value); setErrors(p => ({ ...p, remarks: '' })); }}
                    placeholder="Additional notes for the audit log..." />
                {errors.remarks && <span className="report-field-error">{errors.remarks}</span>}
                <span style={{ fontSize: 11, marginTop: 3, display: 'block', textAlign: 'right', color: remarks.length > 450 ? (remarks.length >= 500 ? 'var(--status-failed)' : '#c05c00') : 'var(--text-secondary)' }}>
                    {remarks.length}/500
                </span>
            </div>

            <div className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <input type="checkbox" id="override-confirm" checked={confirmed}
                    onChange={e => { setConfirmed(e.target.checked); setErrors(p => ({ ...p, confirmed: '' })); }}
                    style={{ marginTop: 3 }} />
                <label htmlFor="override-confirm" style={{ fontSize: 13, fontWeight: 500, margin: 0, textTransform: 'none', letterSpacing: 0, color: 'var(--text-primary)' }}>
                    I confirm this admin override. I understand this action will be recorded in the Audit Log and the task will be reopened for modification.
                </label>
            </div>
            {errors.confirmed && <span className="report-field-error">{errors.confirmed}</span>}
        </FormModal>
    );
};

// --- Task Review Modal (Approve & Close / Return for Rework) ------------------
interface TaskReviewModalProps {
    task: Task;
    onSubmit: (taskId: string, adminDecision: 'Approve & Close' | 'Return for Rework', reviewerRemarks: string) => Promise<void>;
    onClose: () => void;
}

const TaskReviewModal: React.FC<TaskReviewModalProps> = ({ task, onSubmit, onClose }) => {
    const [decision, setDecision] = useState<'Approve & Close' | 'Return for Rework' | ''>('');
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!decision) { setError('Please select an admin decision.'); return; }
        if (decision === 'Return for Rework' && !remarks.trim()) {
            setError('Reviewer Remarks are required when returning a task for rework.');
            return;
        }
        setError('');
        setSubmitting(true);
        try {
            await onSubmit(task.taskId, decision, remarks.trim());
            onClose();
        } catch (err: any) {
            setError(err.message ?? 'Failed to submit review decision.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <FormModal isOpen onClose={onClose} title="Review Task Submission" subtitle={`Reviewing: ${task.taskTitle}`} size="md" confirmOnCancel={true}
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !decision}>
                        {submitting
                            ? <><Loader2 size={13} className="spin" /> Submitting…</>
                            : <><Shield size={13} /> Submit Review Decision</>
                        }
                    </button>
                </>
            }
        >
            <div className="view-modal-meta" style={{ marginBottom: 16 }}>
                <div className="view-modal-meta-item">
                    <span className="view-modal-label">Task ID</span>
                    <span className="view-modal-meta-value" style={{ fontSize: 12 }}>{task.taskId}</span>
                </div>
                <div className="view-modal-meta-item">
                    <span className="view-modal-label">Assigned To</span>
                    <span className="view-modal-meta-value">{task.assignedEmployee}</span>
                </div>
                <div className="view-modal-meta-item">
                    <span className="view-modal-label">Priority</span>
                    <PrioBadge p={task.priority} />
                </div>
            </div>

            {task.taskRemarks && (
                <div className="field">
                    <label>Employee Notes</label>
                    <div style={{ padding: '10px 12px', background: 'var(--bg-main)', borderRadius: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                        {task.taskRemarks}
                    </div>
                </div>
            )}

            <div className="field">
                <label>Admin Decision <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                <select className="report-select" value={decision}
                    onChange={e => { setDecision(e.target.value as 'Approve & Close' | 'Return for Rework'); setError(''); }}>
                    <option value="">Select decision</option>
                    <option value="Approve & Close">Approve & Close</option>
                    <option value="Return for Rework">Return for Rework</option>
                </select>
            </div>

            <div className="field">
                <label>
                    Reviewer Remarks
                    {decision === 'Return for Rework' && <span style={{ color: 'var(--status-failed)' }}> * (Required for rework)</span>}
                </label>
                <textarea className={remarks.length > 500 ? 'report-input report-input-error' : 'report-input'}
                    rows={4} maxLength={500} value={remarks}
                    onChange={e => { setRemarks(e.target.value); setError(''); }}
                    placeholder={decision === 'Return for Rework' ? 'Provide specific instructions on what needs to be improved...' : 'Optional closing remarks...'}
                    disabled={!decision} />
                <span style={{ fontSize: 11, marginTop: 3, display: 'block', textAlign: 'right', color: remarks.length > 450 ? (remarks.length >= 500 ? 'var(--status-failed)' : '#c05c00') : 'var(--text-secondary)' }}>
                    {remarks.length}/500
                </span>
            </div>

            {error && <div className="form-api-error" style={{ marginBottom: 10 }}><AlertCircle size={14} /><span>{error}</span></div>}
        </FormModal>
    );
};

// --- Dashboard Tab ------------------------------------------------------------

const DashboardTab: React.FC<{
    dashboardData: DashboardResponse | null;
    dashboardEmployees: EmployeeFilterOption[];
    dashboardDepartments: DepartmentFilterOption[];
    dashboardLoading: boolean;
    dashboardError: string | null;
    filters: { dateStart: string; dateEnd: string; employeeId: string; departmentId: string; taskStatus: string; assignmentScope: string };
    onFilterChange: (filters: { dateStart: string; dateEnd: string; employeeId: string; departmentId: string; taskStatus: string; assignmentScope: string }) => void;
    onClearFilters: () => void;
    onNewTask: () => void;
    tasks?: any[];
    onViewTask?: (task: any) => void;
}> = ({ dashboardData, dashboardEmployees, dashboardDepartments, dashboardLoading, dashboardError, filters, onFilterChange, onClearFilters, onNewTask, tasks, onViewTask }) => {
    // Local filters for Workload Summary only — does NOT trigger full dashboard re-fetch
    const [wlFilters, setWlFilters] = useState({ employeeId: '', departmentId: '', assignmentScope: '', taskStatus: '', dateStart: '', dateEnd: '' });
    const hasAnyFilter = wlFilters.employeeId || wlFilters.departmentId || wlFilters.assignmentScope || wlFilters.taskStatus || wlFilters.dateStart || wlFilters.dateEnd;
    const td = dashboardData;

    // ── Workload Summary filters ─────────────────────────────────────────────
    // The card's filters (department, scope, status, date range) are applied
    // server-side via /api/Dashboard/metrics so the employee workload reflects
    // the selected criteria. "Overdue" is not a task status, so it is applied
    // client-side to the fetched rows (overdueTaskCount > 0).
    const [filteredWorkloadData, setFilteredWorkloadData] = useState<any[] | null>(null);
    const [wlLoading, setWlLoading] = useState(false);

    useEffect(() => {
        if (!hasAnyFilter) {
            setFilteredWorkloadData(null);
            setWlLoading(false);
            return;
        }

        let cancelled = false;
        setWlLoading(true);
        const params: Record<string, string> = {};
        if (wlFilters.employeeId) params.employeeId = wlFilters.employeeId;
        if (wlFilters.assignmentScope !== '') params.assignmentScope = wlFilters.assignmentScope;
        if (wlFilters.dateStart) params.dateRangeStart = new Date(`${wlFilters.dateStart}T00:00:00`).toISOString();
        if (wlFilters.dateEnd) params.dateRangeEnd = new Date(`${wlFilters.dateEnd}T23:59:59`).toISOString();
        // The Workload Summary card can show any department (e.g. "Last Mile")
        // even though a Coordinator's summary metrics are department-scoped.
        // The department filter is applied below on the employee's department.
        params.includeAllDepartments = 'true';
        if (wlFilters.taskStatus && wlFilters.taskStatus !== 'Overdue') {
            const statusMap: Record<string, string> = {
                Assigned: '0', 'In Progress': '1', 'Pending Admin Review': '2', Completed: '3',
            };
            const statusNum = statusMap[wlFilters.taskStatus];
            if (statusNum !== undefined) params.status = statusNum;
        }

        (async () => {
            try {
                const res = await axios.get(`/api/Dashboard/metrics?${new URLSearchParams(params).toString()}`, { timeout: 6000 });
                const d = res.data?.data;
                let rows: any[] = d?.employeeWorkload ?? [];
                if (wlFilters.taskStatus === 'Overdue') {
                    rows = rows.filter(w => (w.overdueTaskCount ?? 0) > 0);
                }
                // Department filter matches the EMPLOYEE's department (not the
                // tasks' assigned department), so e.g. "Last Mile" shows its own
                // employees' workload.
                if (wlFilters.departmentId) {
                    const deptName = dashboardDepartments.find(dd => dd.departmentId === wlFilters.departmentId)?.departmentName;
                    if (deptName) rows = rows.filter(w => (w.department ?? '') === deptName);
                }
                if (!cancelled) setFilteredWorkloadData(rows);
            } catch {
                if (!cancelled) setFilteredWorkloadData([]);
            } finally {
                if (!cancelled) setWlLoading(false);
            }
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wlFilters]);

    const totalActive = td?.totalActiveTasks ?? 0;
    const notStarted = td?.notStartedCount ?? 0;
    const inProgress = td?.inProgressCount ?? 0;
    const pendingReview = td?.donePendingReviewCount ?? 0;
    const onHold = td?.onHoldCount ?? 0;
    const completedToday = td?.completedTodayCount ?? 0;
    const overdue = td?.overdueTaskCount ?? 0;
    const total = notStarted + inProgress + pendingReview + onHold + completedToday;
    const workloads = td?.employeeWorkload ?? [];
    const teamWorkloads = td?.teamWorkload ?? [];
    const deptWorkloads = td?.departmentWorkload ?? [];
    const filteredWorkloads = filteredWorkloadData ?? workloads;
    const avgPerEmployee = workloads.length > 0 ? (total / workloads.length).toFixed(1) : '0';
    const lastUpdated = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const statusChartData = [
        { name: 'Not Started', value: notStarted, color: 'var(--text-secondary)' },
        { name: 'In Progress', value: inProgress, color: 'var(--status-pending)' },
        { name: 'Pending Review', value: pendingReview, color: 'var(--primary)' },
        { name: 'Completed Today', value: completedToday, color: 'var(--status-active)' },
        { name: 'Overdue', value: overdue, color: 'var(--status-failed)' },
    ].filter(d => d.value > 0);

    const workloadChartData = workloads.map(w => ({
        name: w.employeeName.split(' ')[0],
        Total: w.activeTaskCount + w.overdueTaskCount,
        Completed: 0,
        Overdue: w.overdueTaskCount,
    }));

    const donutColors = statusChartData.map(d => d.color);

    return (
        <div className="dashboard-content">
            {dashboardLoading ? (
                <EmptyState icon={<Loader2 size={24} className="spin" />} title="Loading workload data..." />
            ) : (
                <>
                    {/* ── Header Row: Neo4j badge + auto-refresh + New Task ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="ai-neo4j-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 999, background: 'rgba(0,169,157,0.08)', color: 'var(--primary)', border: '1px solid rgba(0,169,157,0.15)', whiteSpace: 'nowrap' }}>
                                <Activity size={12} /> Neo4j Graph
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-active)', display: 'inline-block' }} />
                                Auto-refresh 30s
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Updated {lastUpdated}
                            </span>
                        </div>
                        <button className="btn btn-primary" onClick={onNewTask} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 9, fontSize: 13, whiteSpace: 'nowrap', background: 'var(--teal, #00A99D)', borderColor: 'var(--teal, #00A99D)', color: '#fff' }}>
                            <Plus size={14} /> New Task
                        </button>
                    </div>
                    {td ? (
                        <div className="stats-row stats-row-6">
                            <StatusCard icon={<ClipboardList size={20} strokeWidth={2.3} />} variant="teal" label="Total Tasks" value={total} subtext={`${total} task${total !== 1 ? 's' : ''}`} />
                            <StatusCard icon={<Loader2 size={20} strokeWidth={2.3} />} variant="warning" label="Active / In Progress" value={totalActive} subtext={inProgress > 0 ? `${inProgress} in progress` : 'None in progress'} />
                            <StatusCard icon={<Eye size={20} strokeWidth={2.3} />} variant="info" label="Pending Review" value={pendingReview} subtext={pendingReview > 0 ? 'Awaiting admin review' : 'All reviewed'} />
                            <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="Completed Today" value={completedToday} subtext={completedToday > 0 ? `Out of ${total} total` : 'No completions yet'} />
                            <StatusCard icon={<Clock size={20} strokeWidth={2.3} />} variant="new" label="On Hold" value={onHold} subtext={onHold > 0 ? `${onHold} paused` : 'None on hold'} />
                            <StatusCard icon={<AlertCircle size={20} strokeWidth={2.3} />} variant="danger" label="Overdue" value={overdue} subtext={overdue > 0 ? `${overdue} past deadline` : 'No overdue tasks'} />
                        </div>
                    ) : (
                        <div className="stats-row stats-row-6">
                            <StatusCard icon={<ClipboardList size={20} strokeWidth={2.3} />} variant="teal" label="Total Tasks" value={0} subtext="No data" />
                            <StatusCard icon={<Loader2 size={20} strokeWidth={2.3} />} variant="warning" label="Active / In Progress" value={0} subtext="No data" />
                            <StatusCard icon={<Eye size={20} strokeWidth={2.3} />} variant="info" label="Pending Review" value={0} subtext="No data" />
                            <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="Completed Today" value={0} subtext="No data" />
                            <StatusCard icon={<Clock size={20} strokeWidth={2.3} />} variant="new" label="On Hold" value={0} subtext="No data" />
                            <StatusCard icon={<AlertCircle size={20} strokeWidth={2.3} />} variant="danger" label="Overdue" value={0} subtext="No data" />
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                                <svg viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                                    <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
                                    <circle cx="40" cy="40" r="34" fill="none" stroke={total > 0 ? 'var(--status-active)' : 'var(--border)'} strokeWidth="6"
                                        strokeDasharray={`${2 * Math.PI * 34}`}
                                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - (total > 0 ? Math.round(completedToday / total * 100) : 0) / 100)}`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{total > 0 ? Math.round(completedToday / total * 100) : 0}%</span>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>done</span>
                                </div>
                            </div>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>TODAY'S COMPLETION RATE</span>
                                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '4px 0 0', fontWeight: 500 }}>
                                    {completedToday} of {total} tasks completed today
                                </p>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {overdue > 0 ? `${overdue} overdue — ` : ''}
                                    {pendingReview > 0 ? `${pendingReview} pending review` : 'No pending reviews'}
                                </span>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header-layout" style={{ margin: 0, marginBottom: 12 }}>
                                <h3 style={{ fontSize: 13 }}>Quick Summary</h3>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                                {[
                                    { label: 'Total Tasks', value: total },
                                    { label: 'Employees', value: workloads.length },
                                    { label: 'Avg/Employee', value: avgPerEmployee },
                                    { label: 'In Progress', value: inProgress },
                                    { label: 'Not Started', value: notStarted },
                                    { label: 'On Hold', value: onHold },
                                ].map(s => (
                                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{s.label}</span>
                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div className="card">
                            <div className="card-header-layout" style={{ margin: 0, marginBottom: 12 }}>
                                <h3>Employee Workload Distribution</h3>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{workloads.length} employees</span>
                            </div>
                            {workloadChartData.length === 0 ? (
                                <EmptyState title="No workload data available." />
                            ) : (
                                <ResponsiveContainer width="100%" height={Math.max(200, workloads.length * 36)}>
                                    <BarChart data={workloadChartData} margin={{ left: -10, right: 10, top: 0, bottom: 0 }} barCategoryGap="20%">
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                                        <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12 }} />
                                        <Bar dataKey="Total" fill="var(--primary)" radius={[3, 3, 0, 0]} name="Total" />
                                        <Bar dataKey="Overdue" fill="var(--status-failed)" radius={[3, 3, 0, 0]} name="Overdue" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="card">
                            <div className="card-header-layout" style={{ margin: 0, marginBottom: 12 }}>
                                <h3>Task Status Distribution</h3>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} total</span>
                            </div>
                            {statusChartData.length === 0 ? (
                                <EmptyState title="No data to display." />
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ResponsiveContainer width={180} height={180}>
                                        <PieChart>
                                            <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" stroke="none">
                                                {statusChartData.map((_, idx) => (<Cell key={idx} fill={donutColors[idx]} />))}
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {statusChartData.map(d => {
                                            const pctVal = Math.round(d.value / total * 100);
                                            return (
                                                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{d.name}</span>
                                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{d.value} ({pctVal}%)</span>
                                                        </div>
                                                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
                                                            <div style={{ width: `${pctVal}%`, height: '100%', background: d.color, borderRadius: 2 }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Department Workload Row ──
                        Team Workload Distribution card hidden until the team
                        management feature is planned and tested. */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
                        <div className="card">
                            <div className="card-header-layout" style={{ margin: 0, marginBottom: 12 }}>
                                <h3>Department Workload</h3>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{deptWorkloads.length} departments</span>
                            </div>
                            {deptWorkloads.length === 0 ? (
                                <EmptyState title="No department workload data." />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {deptWorkloads.map(d => {
                                        const total = d.totalActiveTasks + d.totalOverdueTasks;
                                        const pct = total > 0 ? Math.round((1 - d.totalOverdueTasks / total) * 100) : 100;
                                        const barColor = pct >= 80 ? 'var(--status-active)' : pct >= 50 ? 'var(--status-pending)' : 'var(--status-failed)';
                                        return (
                                            <div key={d.departmentId} style={{ padding: '10px 12px', background: 'var(--bg-main)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.departmentName}</span>
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.employeeCount} employees</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 6 }}>
                                                    <span style={{ color: 'var(--status-pending)', fontWeight: 600 }}>{d.totalActiveTasks} active</span>
                                                    <span style={{ color: d.totalOverdueTasks > 0 ? 'var(--status-failed)' : 'var(--text-muted)', fontWeight: 600 }}>{d.totalOverdueTasks} overdue</span>
                                                </div>
                                                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <DataTable
                        title="Workload Summary per Employee"
                        filterElements={
                            <div className="dt-filter-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <select value={wlFilters.assignmentScope} style={{ height: 36, borderRadius: 'var(--r-sm, 8px)', border: '1px solid var(--border)', padding: '0 8px', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                    onChange={e => setWlFilters(p => ({ ...p, assignmentScope: e.target.value }))}>
                                    <option value="">All Scopes</option>
                                    <option value="0">Single Employee</option>
                                    <option value="1">Team</option>
                                    <option value="2">Department</option>
                                </select>
                                <SearchableSelect
                                    value={wlFilters.employeeId}
                                    onChange={val => setWlFilters(p => ({ ...p, employeeId: val }))}
                                    options={dashboardEmployees.map(m => ({ value: m.employeeId, label: m.employeeName }))}
                                    placeholder="All Employees"
                                    searchPlaceholder="Search employees..."
                                    width={160}
                                />
                                <SearchableSelect
                                    value={wlFilters.departmentId}
                                    onChange={val => setWlFilters(p => ({ ...p, departmentId: val }))}
                                    options={dashboardDepartments.map(d => ({ value: d.departmentId, label: d.departmentName }))}
                                    placeholder="All Departments"
                                    searchPlaceholder="Search departments..."
                                    width={160}
                                />
                                <select value={wlFilters.taskStatus} style={{ height: 36, borderRadius: 'var(--r-sm, 8px)', border: '1px solid var(--border)', padding: '0 8px', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                    onChange={e => setWlFilters(p => ({ ...p, taskStatus: e.target.value }))}>
                                    <option value="">All Statuses</option>
                                    <option value="Assigned">Assigned</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Pending Admin Review">Pending Admin Review</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Overdue">Overdue</option>
                                </select>
                                {[{ label: '1M', months: 1 }, { label: '3M', months: 3 }, { label: '6M', months: 6 }, { label: '12M', months: 12 }].map(p => {
                                    const end = new Date(); const start = new Date(); start.setMonth(start.getMonth() - p.months);
                                    const from = start.toISOString().split('T')[0];
                                    const isActive = wlFilters.dateStart === from;
                                    return (
                                        <button key={p.label}
                                            className={`filter-pill${isActive ? ' active' : ''}`}
                                            onClick={e => {
                                                e.stopPropagation();
                                                setWlFilters(prev => ({ ...prev, dateStart: from, dateEnd: end.toISOString().split('T')[0] }));
                                            }}
                                            style={{ fontSize: 11, padding: '6px 10px', height: 36, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 8px)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {p.label}
                                        </button>
                                    );
                                })}
                                {hasAnyFilter && (
                                    <button className="btn btn-sm" onClick={() => setWlFilters({ employeeId: '', departmentId: '', assignmentScope: '', taskStatus: '', dateStart: '', dateEnd: '' })} style={{ height: 36, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} /> Clear</button>
                                )}
                            </div>
                        }
                        headers={['EMPLOYEE', 'TOTAL', 'ACTIVE', 'COMPLETED', 'OVERDUE', 'COMPLETION']}
                        loading={hasAnyFilter ? wlLoading : false}
                        emptyMessage="No workload data available."
                        totalRecords={filteredWorkloads.length}
                    >
                        {filteredWorkloads.map((w, idx) => {
                            const empTotal = w.activeTaskCount + w.overdueTaskCount;
                            const pct = w.overdueTaskCount > 0 ? Math.round((1 - w.overdueTaskCount / empTotal) * 100) : 100;
                            const barColor = pct >= 80 ? 'var(--status-active)' : pct >= 50 ? 'var(--status-pending)' : 'var(--status-failed)';
                            return (
                                <tr key={w.employeeId}>
                                    <td style={{ fontWeight: 600 }}>{w.employeeName}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{empTotal}</td>
                                    <td style={{ textAlign: 'center', color: 'var(--status-pending)', fontWeight: 700 }}>{w.activeTaskCount}</td>
                                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>&mdash;</td>
                                    <td style={{ textAlign: 'center', color: w.overdueTaskCount > 0 ? 'var(--status-failed)' : 'var(--text-muted)', fontWeight: 700 }}>
                                        {w.overdueTaskCount || '0'}
                                    </td>
                                    <td>
                                        {empTotal > 0 ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, maxWidth: 100, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{pct}%</span>
                                            </div>
                                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>&mdash;</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </DataTable>

                    {/* ── Recent Tasks ── */}
                    {tasks && tasks.length > 0 && (
                        <DataTable
                            title={`Recent Tasks (${tasks.filter((t: any) => t.taskStatus !== 'Completed' && t.taskStatus !== 'Done').length} active)`}
                            headers={['#', 'Task', 'Assignee', 'Priority', 'Due Date', 'Status', '']}
                            loading={false}
                            emptyMessage="No tasks found."
                            totalRecords={tasks.length}
                        >
                            {tasks.slice(0, 10).map((t: any) => {
                                const refDisplay = t.referenceNumber || t.taskId?.slice(0, 8).toUpperCase() || '#';
                                const status = t.taskStatus || t.status;
                                const prio = t.priority || 'Medium';
                                const due = t.dueAt || t.dueDate;
                                const assignee = t.assignedEmployee || t.assignee?.name || '—';
                                const isOverdue = due && status !== 'Completed' && status !== 'Done' && new Date(due) < new Date();
                                return (
                                    <tr key={t.taskId || t.id} onClick={() => onViewTask?.(t)} style={{ cursor: 'pointer' }}>
                                        <td style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                            #{refDisplay}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                <span>{t.taskTitle || t.name}</span>
                                                {t.isConfidential && (
                                                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--status-failed)', background: 'rgba(238,93,80,0.08)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                                        <Lock size={9} /> CONFIDENTIAL
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ fontSize: 13 }}>{assignee}</td>
                                        <td>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                                                background: prio === 'Urgent' ? '#fef2f2' : prio === 'High' ? '#fff7ed' : prio === 'Medium' ? '#fffbeb' : '#eff6ff',
                                                color: prio === 'Urgent' ? '#dc2626' : prio === 'High' ? '#ea580c' : prio === 'Medium' ? '#d97706' : '#2563eb'
                                            }}>
                                                {prio}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 12, color: isOverdue ? '#dc2626' : 'var(--text-secondary)', fontWeight: isOverdue ? 700 : 400 }}>
                                            {due ? new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        <td>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                                background: status === 'Completed' || status === 'Done' ? 'rgba(5,150,105,0.1)' : isOverdue ? 'rgba(220,38,38,0.1)' : 'rgba(0,169,157,0.08)',
                                                color: status === 'Completed' || status === 'Done' ? '#059669' : isOverdue ? '#dc2626' : 'var(--primary)'
                                            }}>
                                                {status || '—'}
                                            </span>
                                        </td>
                                        <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                                            <ActionsDropdown
                                                actions={[
                                                    { label: 'View Details', icon: <Eye size={12} />, onClick: () => onViewTask?.(t) },
                                                ]}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </DataTable>
                    )}
                </>
            )}
        </div>
    );
};

// --- Tasks Tab ----------------------------------------------------------------

const TASK_STATUS_FILTERS = ['Draft', 'Assigned', 'In Progress', 'Pending Admin Review', 'Done', 'Completed', 'Overdue'];

const PRIORITY_WEIGHTS: Record<string, number> = { Urgent: 4, High: 3, Medium: 2, Low: 1 };

const TasksTab: React.FC<{
    tasks: Task[];
    binTasks: Task[];
    teamMembers: TeamMember[];
    loading: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onView: (id: string) => void;
    onEdit: (id: string) => void;
    onRestore: (taskId: string) => void;
    onEmptyBin: () => void;
    onNewTask: () => void;
}> = ({ tasks, binTasks, teamMembers, loading, searchQuery, setSearchQuery, onView, onEdit, onRestore, onEmptyBin, onNewTask }) => {
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterDeadline, setFilterDeadline] = useState('');
    const [sortBy, setSortBy] = useState('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [subTab, setSubTab] = useState<'active' | 'bin'>('active');
    const [searchError, setSearchError] = useState('');
    const [taskPage, setTaskPage] = useState(1);

    const deletedTasks = binTasks;

    const handleSearchChange = (val: string) => {
        if (val.length > 150) {
            setSearchError('Search must not exceed 150 characters.');
            return;
        }
        setSearchError('');
        setSearchQuery(val);
    };

    const sorted = [...tasks]
        .filter(t =>
            (!filterStatus || t.taskStatus === filterStatus) &&
            (!filterPriority || t.priority === filterPriority) &&
            (!filterEmployee || t.assignedTo === filterEmployee) &&
            (!filterDeadline || (t.dueAt && t.dueAt.startsWith(filterDeadline))) &&
            (!searchQuery || t.taskTitle.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .sort((a, b) => {
            if (!sortBy) return 0;
            const dir = sortOrder === 'asc' ? 1 : -1;
            switch (sortBy) {
                case 'taskTitle':
                    return dir * a.taskTitle.localeCompare(b.taskTitle);
                case 'deadline':
                    return dir * ((a.dueAt ?? '') > (b.dueAt ?? '') ? 1 : -1);
                case 'priority':
                    return dir * ((PRIORITY_WEIGHTS[a.priority] ?? 0) - (PRIORITY_WEIGHTS[b.priority] ?? 0));
                case 'status':
                    return dir * a.taskStatus.localeCompare(b.taskStatus);
                case 'assignedEmployee':
                    return dir * a.assignedEmployee.localeCompare(b.assignedEmployee);
                default:
                    return 0;
            }
        });

    const taskTotalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
    const pagedTasks = subTab === 'active'
        ? sorted.slice((taskPage - 1) * PER_PAGE, taskPage * PER_PAGE)
        : [];

    return (
        <div className="dashboard-content">
            <DataTable
                tabs={[
                    { key: 'active', label: 'Active Tasks', icon: <Package size={14} />, badge: tasks.filter(t => t.taskStatus !== 'Completed' && t.taskStatus !== 'Done').length || undefined },
                    { key: 'bin', label: 'Bin', icon: <Trash2 size={14} />, badge: deletedTasks.length },
                ]}
                activeTab={subTab}
                onTabChange={key => { setSubTab(key as 'active' | 'bin'); setTaskPage(1); }}
                searchQuery={subTab === 'active' ? searchQuery : undefined}
                setSearchQuery={subTab === 'active' ? (val => { handleSearchChange(val); setTaskPage(1); }) : undefined}
                searchPlaceholder="Search tasks..."
                filterElements={subTab === 'active' ? (
                    <>
                        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setTaskPage(1); }}>
                            <option value="">All Statuses</option>
                            {TASK_STATUS_FILTERS.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setTaskPage(1); }}>
                            <option value="">All Priorities</option>
                            <option value="Urgent">Urgent</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                        <SearchableSelect
                            value={filterEmployee}
                            onChange={val => { setFilterEmployee(val); setTaskPage(1); }}
                            placeholder="All Employees"
                            searchPlaceholder="Search employees..."
                            options={teamMembers.map(m => ({ value: m.accountId, label: m.employeeName }))}
                            width={160}
                        />
                        <input type="date" value={filterDeadline}
                            onChange={e => { setFilterDeadline(e.target.value); setTaskPage(1); }}
                            style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--border, #e8ecf4)', padding: '0 12px', fontSize: '0.82rem', fontFamily: 'inherit', background: 'white', color: 'var(--text-primary)', outline: 'none' }} />
                        <select value={sortBy} onChange={e => { setSortBy(e.target.value); setTaskPage(1); }}
                            style={{ borderLeft: '2px solid var(--border, #e8ecf4)', paddingLeft: 12, borderRadius: 0 }}>
                            <option value="">Sort By</option>
                            <option value="taskTitle">Task Title</option>
                            <option value="deadline">Deadline</option>
                            <option value="priority">Priority Level</option>
                            <option value="status">Status</option>
                            <option value="assignedEmployee">Assigned Employee</option>
                        </select>
                        <select value={sortOrder} onChange={e => { setSortOrder(e.target.value as 'asc' | 'desc'); setTaskPage(1); }}>
                            <option value="asc">Ascending</option>
                            <option value="desc">Descending</option>
                        </select>
                    </>
                ) : (
                    deletedTasks.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(238,93,80,0.06)', border: '1px solid rgba(238,93,80,0.18)', borderRadius: 10, fontSize: 13, color: '#b42318', flex: 1 }}>
                            <Trash2 size={14} />
                            Items in the bin are soft-deleted. You can restore them or empty the bin.
                        </div>
                    ) : undefined
                )}
                actionButton={subTab === 'active' ? {
                    label: 'New Task',
                    icon: <Plus size={14} />,
                    onClick: onNewTask
                } : (
                    deletedTasks.length > 0 ? {
                        label: 'Empty Bin',
                        icon: <Trash2 size={13} />,
                        onClick: onEmptyBin
                    } : undefined
                )}
                headers={['TASK', 'ASSIGNEE', 'PRIORITY', 'DUE DATE'].concat(subTab === 'bin' ? ['ACTIONS'] : [])}
                loading={loading}
                emptyIcon={subTab === 'bin' ? <Trash2 size={24} /> : <Package size={20} />}
                emptyMessage={subTab === 'bin' ? 'Bin is empty' : 'No matching task records found.'}
                currentPage={taskPage} totalPages={taskTotalPages} onPageChange={setTaskPage}
            >
                {searchError && (
                    <tr><td colSpan={subTab === 'bin' ? 5 : 4} style={{ padding: '8px 20px 0', border: 'none' }}>
                        <span style={{ fontSize: 12, color: 'var(--status-failed)' }}>{searchError}</span>
                    </td></tr>
                )}
                {subTab === 'active' && pagedTasks.length > 0 && pagedTasks.map(t => {
                    const od = isEffectivelyOverdue(t);
                    const effectiveStatus = od ? 'Overdue' : t.taskStatus;
                    const refDisplay = t.taskReferenceNumber || t.taskId.slice(0, 8).toUpperCase();
                    return (
                        <tr key={t.taskId} onClick={() => onView(t.taskId)} style={{ cursor: 'pointer' }}>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={priorityDotClass(t.priority)} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em' }}>#{refDisplay}</span>
                                            {t.taskTitle}
                                        </div>
                                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className={statusBadgeClass(effectiveStatus)} style={{ fontSize: 10, padding: '1px 8px' }}>{effectiveStatus}</span>
                                            <div style={{ width: 100, height: 4, background: '#e8ecf4', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ width: `${statusToProgress(effectiveStatus)}%`, height: '100%', background: statusToProgress(effectiveStatus) >= 100 ? '#05cd99' : statusToProgress(effectiveStatus) >= 75 ? '#4318ff' : statusToProgress(effectiveStatus) >= 45 ? '#ffb547' : '#94a3b8', borderRadius: 2 }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{t.assignedEmployee || 'Unassigned'}</td>
                            <td><PrioBadge p={t.priority} /></td>
                            <td style={{ fontSize: 12, color: od ? 'var(--status-failed)' : 'var(--text-secondary)', fontWeight: od ? 700 : 400 }}>{t.dueAt ? fmtDate(t.dueAt) : '—'}</td>
                        </tr>
                    );
                })}
                {subTab !== 'active' && deletedTasks.map((t, binIdx) => (
                    <tr key={t.taskId ?? binIdx} style={{ opacity: 0.75 }}>
                        <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', textDecoration: 'line-through', textDecorationColor: 'var(--text-secondary)' }}>
                                {t.taskTitle}
                            </div>
                            {t.taskDescription && (
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t.taskDescription}
                                </div>
                            )}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {t.assignedEmployee || '—'}
                        </td>
                        <td><PrioBadge p={t.priority} /></td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {t.dueAt ? fmtDate(t.dueAt) : '—'}
                        </td>
                        <td>
                            <ActionsDropdown
                                actions={[
                                    {
                                        label: 'Restore',
                                        icon: <CheckCircle2 size={12} />,
                                        onClick: () => onRestore(t.taskId),
                                        variant: 'success'
                                    }
                                ]}
                            />
                        </td>
                    </tr>
                ))}
            </DataTable>
        </div>
    );
};



// --- Task Template Tab ---------------------------------------------------------
const TemplateTab: React.FC<{ teamMembers: TeamMember[] }> = ({ teamMembers }) => {
    return <TaskTemplatesTab teamMembers={teamMembers} />;
};

// --- Team Tab -----------------------------------------------------------------

interface EmpRecDTO {
    recommendationId: string;
    category: string;
    notes: string;
    recommendedByName: string;
    taskTitle: string;
    createdAt: string;
}

const CATEGORY_LABELS: Record<number, string> = {
    0: 'Timeliness',
    1: 'Work Quality',
    2: 'Communication',
    3: 'Other',
};

interface TeamDTO {
    id: string;
    name: string;
    departmentId: string | null;
    departmentName: string | null;
    description: string | null;
    isActive: boolean;
    memberCount: number;
    members: {
        userId: string;
        fullName: string;
        employeeNumber: string;
        role: string | null;
        department: string | null;
        availabilityStatus: string | null;
        isAvailable: boolean;
        joinedAt: string;
    }[];
    createdAt: string;
}

const REC_MONTH_PRESETS = [
    { label: '1m', months: 1 },
    { label: '3m', months: 3 },
    { label: '6m', months: 6 },
    { label: '12m', months: 12 },
] as const;

const TeamTab: React.FC<{
    tasks: Task[];
    teamMembers: TeamMember[];
    onView: (id: string) => void;
}> = ({ tasks, teamMembers, onView }) => {
    const [teams, setTeams] = useState<TeamDTO[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(false);
    const [teamsError, setTeamsError] = useState('');
    const [selectedMemberId, setSelectedMemberId] = useState('');

    // Create / edit modal state
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [editingTeam, setEditingTeam] = useState<TeamDTO | null>(null);
    const [teamForm, setTeamForm] = useState({ name: '', description: '', memberUserIds: [] as string[] });
    const [teamSaving, setTeamSaving] = useState(false);
    const [teamError, setTeamError] = useState('');

    // Delete confirmation
    const [deleteTeamId, setDeleteTeamId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Add-member state (per team card)
    const [addMembersTeamId, setAddMembersTeamId] = useState<string | null>(null);
    const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
    const [addingMembers, setAddingMembers] = useState(false);

    // Recommendation history modal
    const [showRecModal, setShowRecModal] = useState(false);
    const [recEmployeeId, setRecEmployeeId] = useState('');
    const [recEmployeeName, setRecEmployeeName] = useState('');
    const [recPreset, setRecPreset] = useState<number | null>(null);
    const [empRecommendations, setEmpRecommendations] = useState<EmpRecDTO[]>([]);
    const [recLoading, setRecLoading] = useState(false);
    const [recError, setRecError] = useState('');
    const [recPage, setRecPage] = useState(1);
    const [recTotalPages, setRecTotalPages] = useState(1);
    const [recTotalRecords, setRecTotalRecords] = useState(0);
    const REC_PAGE_SIZE = 8;

    const { success, error } = useToast();

    // Employees who are already in a team (from the fetched team memberships)
    const assignedUserIds = useMemo(() => {
        const set = new Set<string>();
        teams.forEach(t => t.members.forEach(m => set.add(m.userId)));
        return set;
    }, [teams]);

    // Hierarchy Filter State: Department > Team
    const [filterDept, setFilterDept] = useState<string>('');
    const [filterTeamId, setFilterTeamId] = useState<string>('');

    const departmentOptions = useMemo(() => {
        const set = new Set<string>();
        ['Coordinator & Customer Service Team', 'Dispatch Team', 'Forwarding Team'].forEach(d => set.add(d));
        teams.forEach(t => {
            if (t.departmentName) set.add(t.departmentName);
        });
        return Array.from(set);
    }, [teams]);

    const availableTeamsForFilter = useMemo(() => {
        if (!filterDept) return teams;
        return teams.filter(t => (t.departmentName || 'Unassigned') === filterDept);
    }, [teams, filterDept]);

    const filteredTeams = useMemo(() => {
        return teams.filter(t => {
            if (filterDept && (t.departmentName || 'Unassigned') !== filterDept) return false;
            if (filterTeamId && t.id !== filterTeamId) return false;
            return true;
        });
    }, [teams, filterDept, filterTeamId]);

    const groupedTeams = useMemo(() => {
        const map = new Map<string, TeamDTO[]>();
        filteredTeams.forEach(t => {
            const dept = t.departmentName || 'Unassigned Department';
            if (!map.has(dept)) map.set(dept, []);
            map.get(dept)!.push(t);
        });
        return map;
    }, [filteredTeams]);

    const fetchTeams = useCallback(async () => {
        setTeamsLoading(true);
        setTeamsError('');
        try {
            const res = await api.get('/api/Team?pageNumber=1&pageSize=100');
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setTeams(d.items);
            } else {
                setTeams([]);
            }
        } catch {
            setTeamsError('Failed to load teams.');
            setTeams([]);
        } finally {
            setTeamsLoading(false);
        }
    }, []);

    useEffect(() => { fetchTeams(); }, [fetchTeams]);

    const openCreate = () => {
        setEditingTeam(null);
        setTeamForm({ name: '', description: '', memberUserIds: [] });
        setTeamError('');
        setShowTeamModal(true);
    };

    const openEdit = (t: TeamDTO) => {
        setEditingTeam(t);
        setTeamForm({
            name: t.name,
            description: t.description ?? '',
            memberUserIds: t.members.map(m => m.userId),
        });
        setTeamError('');
        setShowTeamModal(true);
    };

    const handleSaveTeam = async () => {
        if (!teamForm.name.trim()) { setTeamError('Team name is required.'); return; }
        setTeamSaving(true);
        setTeamError('');
        try {
            if (editingTeam) {
                await api.put(`/api/Team/${editingTeam.id}`, {
                    name: teamForm.name.trim(),
                    description: teamForm.description.trim() || null,
                    isActive: true,
                });
                // Replace members: remove all then re-add the selected ones.
                const current = teams.find(t => t.id === editingTeam.id);
                const toRemove = (current?.members ?? []).map(m => m.userId).filter(uid => !teamForm.memberUserIds.includes(uid));
                const toAdd = teamForm.memberUserIds.filter(uid => !(current?.members ?? []).some(m => m.userId === uid));
                if (toRemove.length > 0) {
                    await Promise.all(toRemove.map(uid => api.delete(`/api/Team/${editingTeam.id}/members/${uid}`)));
                }
                if (toAdd.length > 0) {
                    await api.post(`/api/Team/${editingTeam.id}/members`, { memberUserIds: toAdd });
                }
                success('Team updated successfully.');
            } else {
                const body: any = {
                    name: teamForm.name.trim(),
                    description: teamForm.description.trim() || null,
                };
                if (teamForm.memberUserIds.length > 0) body.memberUserIds = teamForm.memberUserIds;
                await api.post('/api/Team', body);
                success('Team created successfully.');
            }
            setShowTeamModal(false);
            await fetchTeams();
        } catch (err: any) {
            setTeamError(err?.response?.data?.message || err?.message || 'Failed to save team.');
        } finally {
            setTeamSaving(false);
        }
    };

    const handleDeleteTeam = async () => {
        if (!deleteTeamId) return;
        setDeleting(true);
        try {
            await api.delete(`/api/Team/${deleteTeamId}`);
            success('Team deleted; members unassigned.');
            setDeleteTeamId(null);
            await fetchTeams();
        } catch (err: any) {
            error(err?.response?.data?.message || err?.message || 'Failed to delete team.');
        } finally {
            setDeleting(false);
        }
    };

    const handleAddMembers = async () => {
        if (!addMembersTeamId || addMemberIds.length === 0) return;
        setAddingMembers(true);
        try {
            await api.post(`/api/Team/${addMembersTeamId}/members`, { memberUserIds: addMemberIds });
            success('Member(s) added to team.');
            setAddMembersTeamId(null);
            setAddMemberIds([]);
            await fetchTeams();
        } catch (err: any) {
            error(err?.response?.data?.message || err?.message || 'Failed to add members.');
        } finally {
            setAddingMembers(false);
        }
    };

    const handleRemoveMember = async (teamId: string, memberUserId: string) => {
        try {
            await api.delete(`/api/Team/${teamId}/members/${memberUserId}`);
            success('Member removed from team.');
            await fetchTeams();
        } catch (err: any) {
            error(err?.response?.data?.message || err?.message || 'Failed to remove member.');
        }
    };

    const fetchEmpRecommendations = async (empId: string, empName: string, months: number | null, page: number = 1) => {
        setRecLoading(true);
        setRecError('');
        setEmpRecommendations([]);
        setRecEmployeeId(empId);
        setRecEmployeeName(empName);
        setRecPreset(months);
        setRecPage(page);
        try {
            const params: any = { pageNumber: page, pageSize: REC_PAGE_SIZE };
            if (months) {
                const from = new Date();
                from.setMonth(from.getMonth() - months);
                from.setHours(0, 0, 0, 0);
                params.dateFrom = from.toISOString();
            }
            const res = await api.get<any>(`/api/users/${empId}/recommendations`, { params });
            const json = res.data;
            const d = json?.data;
            const list: any[] = json.isSuccess && Array.isArray(d?.items) ? d.items : (json.isSuccess && Array.isArray(d) ? d : []);
            setEmpRecommendations(list.map((r: any) => ({
                recommendationId: r.id ?? r.recommendationId,
                category: CATEGORY_LABELS[r.category as number] ?? String(r.category),
                notes: r.notes ?? '',
                recommendedByName: r.coordinatorName ?? '',
                taskTitle: r.taskTitle ?? '',
                createdAt: r.createdAt ?? '',
            })));
            setRecTotalPages(d?.totalPages || 1);
            setRecTotalRecords(d?.totalCount ?? list.length);
        } catch (err: any) {
            setRecError(err?.response?.data?.message || err?.message || 'Failed to load recommendations.');
            setRecTotalPages(1);
            setRecTotalRecords(0);
        } finally {
            setRecLoading(false);
        }
    };

    const openRecommendations = (empId: string, empName: string) => {
        setShowRecModal(true);
        fetchEmpRecommendations(empId, empName, null, 1);
    };

    const unassignedEmployees = teamMembers.filter(m => !assignedUserIds.has(m.accountId));

    // Selected member's tasks (used when a member is picked from a team dropdown)
    const selectedEmployeeName = teamMembers.find(m => m.accountId === selectedMemberId)?.employeeName;

    return (
        <div className="dashboard-content">
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Team Management</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={14} /> Create Team
                    </button>
                </div>

                {/* Department > Team Hierarchy Filter Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 16px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        <Filter size={15} style={{ color: 'var(--primary)' }} />
                        <span>Filter:</span>
                    </div>

                    {/* Department Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Department:</span>
                        <select
                            value={filterDept}
                            onChange={e => {
                                const newDept = e.target.value;
                                setFilterDept(newDept);
                                if (filterTeamId) {
                                    const team = teams.find(t => t.id === filterTeamId);
                                    if (team && (team.departmentName || 'Unassigned') !== newDept) {
                                        setFilterTeamId('');
                                    }
                                }
                            }}
                            style={{ height: 32, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 12, background: '#fff', outline: 'none' }}
                        >
                            <option value="">All Departments</option>
                            {departmentOptions.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                    </div>

                    {/* Team Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Team:</span>
                        <select
                            value={filterTeamId}
                            onChange={e => {
                                const newTeamId = e.target.value;
                                setFilterTeamId(newTeamId);
                                if (newTeamId) {
                                    const team = teams.find(t => t.id === newTeamId);
                                    if (team?.departmentName && !filterDept) {
                                        setFilterDept(team.departmentName);
                                    }
                                }
                            }}
                            style={{ height: 32, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 12, background: '#fff', outline: 'none' }}
                        >
                            <option value="">All Teams ({availableTeamsForFilter.length})</option>
                            {availableTeamsForFilter.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Reset Button */}
                    {(filterDept || filterTeamId) && (
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => { setFilterDept(''); setFilterTeamId(''); }}
                            style={{ height: 30, padding: '0 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            <X size={12} /> Clear Filter
                        </button>
                    )}

                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                        Showing <strong>{filteredTeams.length}</strong> of <strong>{teams.length}</strong> teams
                    </span>
                </div>

                {teamsLoading ? (
                    <div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading teams...</p></div>
                ) : teamsError ? (
                    <div className="empty-state"><AlertCircle size={22} /><p>{teamsError}</p></div>
                ) : teams.length === 0 ? (
                    <div className="empty-state"><Users size={22} /><p>No teams yet. Create a team to get started.</p></div>
                ) : filteredTeams.length === 0 ? (
                    <div className="empty-state"><Users size={22} /><p>No teams matching selected filters.</p></div>
                ) : (
                    <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {Array.from(groupedTeams.entries()).map(([deptName, deptTeams]) => (
                            <div key={deptName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="team-dept-group-header">
                                    <Building size={15} style={{ color: 'var(--primary)' }} />
                                    <span className="team-dept-group-title">{deptName}</span>
                                    <span className="badge badge-blue" style={{ fontSize: 11 }}>
                                        {deptTeams.length} team{deptTeams.length !== 1 ? 's' : ''}
                                    </span>
                                    <div className="team-dept-group-line" />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                                    {deptTeams.map(t => (
                                        <div key={t.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                                                    <span className="badge badge-blue">{t.memberCount} member{t.memberCount !== 1 ? 's' : ''}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="btn btn-sm" onClick={() => openEdit(t)} title="Edit team" style={{ padding: '4px 6px' }}>
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button className="btn btn-sm" onClick={() => setDeleteTeamId(t.id)} title="Delete team" style={{ padding: '4px 6px', color: '#dc2626' }}>
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            {t.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.description}</div>}
                                            {t.departmentName && <div style={{ fontSize: 11, color: '#94a3b8' }}>Department: {t.departmentName}</div>}

                                            {/* Member dropdown */}
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>MEMBERS</div>
                                            {t.members.length === 0 ? (
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>No members assigned.</div>
                                            ) : (
                                                <select
                                                    value={selectedMemberId && t.members.some(m => m.userId === selectedMemberId) ? selectedMemberId : ''}
                                                    onChange={e => setSelectedMemberId(e.target.value)}
                                                    style={{ height: 34, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 8px', fontSize: 12, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff' }}
                                                >
                                                    <option value="">Select a member…</option>
                                                    {t.members.map(m => (
                                                        <option key={m.userId} value={m.userId}>{m.fullName}{m.role ? ` — ${m.role}` : ''}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {/* Member rows with transfer + remove */}
                                            {t.members.map(m => (
                                                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fullName}</div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.employeeNumber}{m.department ? ` · ${m.department}` : ''}</div>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm"
                                                        onClick={() => openRecommendations(m.userId, m.fullName)}
                                                        title="Recommendation history"
                                                        style={{ padding: '4px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                                    >
                                                        <Lightbulb size={11} /> Recs
                                                    </button>
                                                    <button className="btn btn-sm" onClick={() => handleRemoveMember(t.id, m.userId)} title="Remove from team" style={{ padding: '4px 6px', color: '#dc2626' }}>
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Add members */}
                                            {unassignedEmployees.length > 0 && (
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                                    <select
                                                        value={addMembersTeamId === t.id ? addMemberIds[0] ?? '' : ''}
                                                        onChange={e => { setAddMembersTeamId(t.id); setAddMemberIds(e.target.value ? [e.target.value] : []); }}
                                                        style={{ flex: 1, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 8px', fontSize: 12, outline: 'none', background: '#fff' }}
                                                    >
                                                        <option value="">Add member…</option>
                                                        {unassignedEmployees.map(m => (
                                                            <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        disabled={addMembersTeamId !== t.id || addMemberIds.length === 0 || addingMembers}
                                                        onClick={handleAddMembers}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                    >
                                                        {addingMembers && addMembersTeamId === t.id ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Add
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Workload Distribution (all employees) */}
            <div className="card">
                <div className="card-header-layout"><h3>Workload Distribution</h3></div>
                {teamMembers.length === 0 ? (
                    <EmptyState icon={<Users size={20} />} title="No employees found" />
                ) : (
                    <div className="perf-bars">
                        {teamMembers.map(m => {
                            const mt = tasks.filter(t => t.assignedEmployee === m.employeeName);
                            const mc = mt.filter(t => t.taskStatus === 'Completed').length;
                            const pct = mt.length > 0 ? Math.round(mc / mt.length * 100) : 0;
                            const memberTeam = teams.find(t => t.members.some(x => x.userId === m.accountId));
                            return (
                                <div key={m.accountId} className="perf-item">
                                    <span className="perf-label">{m.employeeName.split(' ')[0]}{memberTeam ? ` (${memberTeam.name})` : ''}</span>
                                    <div className="perf-track">
                                        <div className="perf-fill" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--status-active)' : pct >= 50 ? 'var(--status-pending)' : 'var(--status-failed)', borderRadius: 3, height: '100%', transition: 'width 0.4s ease' }} />
                                    </div>
                                    <span className="perf-pct">{mc}/{mt.length}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Selected member's tasks */}
            {selectedEmployeeName && (
                <div className="card">
                    <div className="card-header-layout"><h3>{selectedEmployeeName}'s Tasks</h3></div>
                    {tasks.filter(t => t.assignedEmployee === selectedEmployeeName).length === 0
                        ? <EmptyState icon={<Package size={20} />} title="No tasks assigned" />
                        : tasks
                            .filter(t => t.assignedEmployee === selectedEmployeeName)
                            .map(t => <TaskRow key={t.taskId} task={t} onView={onView} />)
                    }
                </div>
            )}

            <FormModal
                isOpen={showTeamModal}
                onClose={() => setShowTeamModal(false)}
                title={editingTeam ? 'Edit Team' : 'Create Team'}
                subtitle={editingTeam ? `Editing ${editingTeam.name}` : 'Create a team and assign employees to it.'}
                size="md"
                footer={
                    <>
                        <button className="fm-btn fm-btn-cancel" onClick={() => setShowTeamModal(false)} disabled={teamSaving}>Cancel</button>
                        <button className="fm-btn fm-btn-primary" onClick={handleSaveTeam} disabled={teamSaving || !teamForm.name.trim()}>
                            {teamSaving ? <><Loader2 size={13} className="fm-spin" /> Saving…</> : 'Save Team'}
                        </button>
                    </>
                }
            >
                {teamError && <div className="fm-api-error"><AlertCircle size={14} /><span>{teamError}</span></div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Team Name *</label>
                        <input
                            type="text"
                            value={teamForm.name}
                            onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g. Last Mile Squad"
                            maxLength={100}
                            style={{ height: 36, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Description</label>
                        <input
                            type="text"
                            value={teamForm.description}
                            onChange={e => setTeamForm(p => ({ ...p, description: e.target.value }))}
                            placeholder="Optional description"
                            maxLength={500}
                            style={{ height: 36, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Assign Employees {editingTeam && '(employees already in another team are skipped)'}
                        </label>
                        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {teamMembers.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>No employees available.</div>}
                            {teamMembers.map(m => {
                                const isCurrent = editingTeam?.members.some(x => x.userId === m.accountId);
                                const takenByOther = assignedUserIds.has(m.accountId) && !isCurrent;
                                return (
                                    <label key={m.accountId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: takenByOther ? 'not-allowed' : 'pointer', opacity: takenByOther ? 0.5 : 1 }}>
                                        <input
                                            type="checkbox"
                                            checked={teamForm.memberUserIds.includes(m.accountId)}
                                            disabled={takenByOther}
                                            onChange={e => setTeamForm(p => ({
                                                ...p,
                                                memberUserIds: e.target.checked
                                                    ? [...p.memberUserIds, m.accountId]
                                                    : p.memberUserIds.filter(id => id !== m.accountId),
                                            }))}
                                        />
                                        <span>{m.employeeName}</span>
                                        {takenByOther && <span style={{ fontSize: 10, color: '#d97706' }}>(already in a team)</span>}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </FormModal>

            <ConfirmationModal
                isOpen={deleteTeamId !== null}
                variant="danger"
                title="Delete Team"
                description="Deleting this team will unassign all of its employees from the team. This action cannot be undone."
                confirmLabel={deleting ? 'Deleting…' : 'Delete Team'}
                cancelLabel="Cancel"
                onConfirm={handleDeleteTeam}
                onCancel={() => setDeleteTeamId(null)}
            />

            <FormModal
                isOpen={showRecModal}
                onClose={() => setShowRecModal(false)}
                title="Recommendation History"
                subtitle={`All recommendations for ${recEmployeeName}`}
                size="md"
                footer={<button className="btn" onClick={() => setShowRecModal(false)}>Close</button>}
            >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Period:</span>
                    <button
                        type="button"
                        className={`filter-pill${recPreset === null ? ' active' : ''}`}
                        onClick={() => fetchEmpRecommendations(recEmployeeId, recEmployeeName, null, 1)}
                    >All</button>
                    {REC_MONTH_PRESETS.map(p => (
                        <button
                            key={p.label}
                            type="button"
                            className={`filter-pill${recPreset === p.months ? ' active' : ''}`}
                            onClick={() => fetchEmpRecommendations(recEmployeeId, recEmployeeName, p.months, 1)}
                        >{p.label}</button>
                    ))}
                </div>
                {recLoading ? (
                    <div className="tr-loading"><Loader2 size={14} className="tr-spin" /> Loading recommendations...</div>
                ) : recError ? (
                    <div className="tr-error" style={{ marginBottom: 12 }}><AlertCircle size={13} /> {recError}</div>
                ) : empRecommendations.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                        No recommendations for this employee yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                        {empRecommendations.map(r => (
                            <div key={r.recommendationId} className="tr-item">
                                <div className="tr-item-top">
                                    <span className="tr-category">{r.category}</span>
                                    <span className="tr-author"><User size={10} /> {r.recommendedByName}</span>
                                </div>
                                <div className="tr-notes">{r.notes}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8', display: 'flex', gap: 8 }}>
                                    <span>Task: {r.taskTitle}</span>
                                    <span>·</span>
                                    <span>{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!recLoading && !recError && recTotalRecords > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
                        <Pagination
                            currentPage={recPage}
                            totalPages={recTotalPages}
                            onPageChange={p => fetchEmpRecommendations(recEmployeeId, recEmployeeName, recPreset, p)}
                        />
                    </div>
                )}
            </FormModal>
        </div>
    );
};

// --- Approvals Wrapper (sub-tab navigation) -----------------------------------

const ApprovalsWrapper: React.FC = () => {
    const [subTab, setSubTab] = useState<'pending' | 'matrices'>('pending');
    return (
        <div className="dashboard-content">
            <div className="report-subtabs">
                <button className={`filter-pill${subTab === 'pending' ? ' active' : ''}`}
                    onClick={() => setSubTab('pending')}>
                    <Shield size={14} /> Pending Approvals
                </button>
                <button className={`filter-pill${subTab === 'matrices' ? ' active' : ''}`}
                    onClick={() => setSubTab('matrices')}>
                    <RotateCcw size={14} /> Routing Config
                </button>
            </div>
        </div>
    );
};

// --- Notification Settings Tab (TN-002: Configurable Deadline Alerts) ---------

const NotificationSettingsTab: React.FC = () => {
    const { success, error } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [value, setValue] = useState('2');
    const [unit, setUnit] = useState<'Hours' | 'Days'>('Days');
    const [formError, setFormError] = useState('');

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        setFormError('');
        try {
            const res = await api.get('/api/NotificationSettings');
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d) {
                setValue(String(d.deadlineWarningValue ?? 2));
                const u = d.deadlineWarningUnit;
                setUnit(u === 'Hours' || u === 0 ? 'Hours' : 'Days');
            }
        } catch {
            // keep defaults (2 days)
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async () => {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
            setFormError('The threshold must be a positive whole number.');
            return;
        }
        setFormError('');
        setSaving(true);
        try {
            await api.put('/api/NotificationSettings', {
                deadlineWarningValue: num,
                deadlineWarningUnit: unit === 'Hours' ? 0 : 1,
            });
            success('Deadline warning threshold updated successfully.');
        } catch (err: any) {
            error(err.response?.data?.message || err.message || 'Failed to update settings.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="dashboard-content">
                <div className="dashboard-grid">
                    <div className="card">
                        <div className="empty-state">
                            <Loader2 size={22} className="spin" />
                            <p>Loading notification settings…</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-content">
            <div className="dashboard-grid" style={{ maxWidth: 760, margin: '0 auto' }}>
                <div className="card">
                    <div className="card-header-layout">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Bell size={15} /> Deadline Warning Settings
                        </h3>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
                        Configure when the system warns assignees that a task deadline is approaching.
                        The system's scheduled check compares each active task's remaining time against this
                        threshold and triggers a <strong>Deadline Approaching</strong> notification to
                        the assignee once the remaining time reaches it. The change applies to all future checks
                        and is recorded in the Audit Log.
                    </p>

                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                            Warning threshold (before due)
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={value}
                                onChange={e => { setValue(e.target.value); setFormError(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                                style={{
                                    width: 140, padding: '8px 12px', fontSize: 13, borderRadius: 8,
                                    border: `1px solid ${formError ? 'var(--status-failed, #ee5d50)' : 'var(--border-color, #e2e8f0)'}`,
                                    background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #1e293b)',
                                    outline: 'none',
                                }}
                            />
                            <select
                                value={unit}
                                onChange={e => setUnit(e.target.value as 'Hours' | 'Days')}
                                style={{
                                    padding: '8px 12px', fontSize: 13, borderRadius: 8,
                                    border: '1px solid var(--border-color, #e2e8f0)',
                                    background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #1e293b)',
                                    outline: 'none', cursor: 'pointer',
                                }}
                            >
                                <option value="Hours">Hours</option>
                                <option value="Days">Days</option>
                            </select>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                            Default: <strong>2 days</strong>. For example, a value of 48 Hours warns exactly 48 hours
                            before the task deadline.
                        </p>
                    </div>

                    {formError && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--status-failed, #ee5d50)' }}>
                            <AlertCircle size={13} /> {formError}
                        </div>
                    )}

                    <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {saving ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Save size={13} /> Save Threshold</>}
                        </button>
                        <button className="btn" onClick={fetchSettings} disabled={saving}>Reset</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Reports Tab --------------------------------------------------------------

/** Reads a blob error response and returns the message string (falls back to fallback). */
async function readBlobError(err: any, fallback: string): Promise<string> {
    try {
        const blob: Blob = err?.response?.data;
        if (blob instanceof Blob) {
            const text = await blob.text();
            const json = JSON.parse(text);
            if (json?.errors && typeof json.errors === 'object') {
                const errorMessages = Object.entries(json.errors)
                    .map(([field, msgs]: [string, any]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
                    .join('; ');
                if (errorMessages) return `${json.title || 'Validation error'}: ${errorMessages}`;
            }
            return json?.message || json?.title || fallback;
        }
    } catch { /* ignore parse errors */ }
    return err?.response?.data?.message || err?.message || fallback;
}

const REPORT_PAGE_SIZE = 10;

type TimeChunk = 'Monthly' | 'Quarterly' | 'Annual';
type YearType = 'Calendar' | 'Fiscal';

const computeDateRange = (chunk: TimeChunk, yearType: YearType = 'Calendar', refDate: Date = new Date()) => {
    const y = refDate.getFullYear();
    const m = refDate.getMonth(); // 0 to 11

    if (chunk === 'Monthly') {
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        };
    } else if (chunk === 'Quarterly') {
        if (yearType === 'Fiscal') {
            let qStartMonth = 9;
            let qYear = y;
            if (m >= 0 && m <= 2) { qStartMonth = 0; }
            else if (m >= 3 && m <= 5) { qStartMonth = 3; }
            else if (m >= 6 && m <= 8) { qStartMonth = 6; }
            else { qStartMonth = 9; }
            if (qStartMonth === 9 && m < 9) qYear = y - 1;
            const start = new Date(qYear, qStartMonth, 1);
            const end = new Date(qYear, qStartMonth + 3, 0);
            return {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
            };
        } else {
            const q = Math.floor(m / 3);
            const start = new Date(y, q * 3, 1);
            const end = new Date(y, (q + 1) * 3, 0);
            return {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
            };
        }
    } else { // Annual
        if (yearType === 'Fiscal') {
            const fYear = m >= 9 ? y : y - 1;
            const start = new Date(fYear, 9, 1); // Oct 1
            const end = new Date(fYear + 1, 9, 0); // Sep 30
            return {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
            };
        } else {
            const start = new Date(y, 0, 1); // Jan 1
            const end = new Date(y, 11, 31); // Dec 31
            return {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0],
            };
        }
    }
};

const DateRangeEngineField: React.FC<{
    dateRangeStart: string;
    dateRangeEnd: string;
    onChange: (start: string, end: string) => void;
    label?: string;
    showFiscalYear?: boolean;
    activeChunk?: TimeChunk;
    onChunkChange?: (chunk: TimeChunk) => void;
    yearType?: YearType;
    onYearTypeChange?: (yt: YearType) => void;
}> = ({
    dateRangeStart,
    dateRangeEnd,
    onChange,
    label = 'Date Range',
    showFiscalYear = false,
    activeChunk: externalChunk,
    onChunkChange: externalOnChunkChange,
    yearType: externalYearType,
    onYearTypeChange: externalOnYearTypeChange,
}) => {
    const [internalChunk, setInternalChunk] = useState<TimeChunk>('Monthly');
    const [internalYearType, setInternalYearType] = useState<YearType>('Calendar');

    const activeChunk = externalChunk !== undefined ? externalChunk : internalChunk;
    const activeYearType = externalYearType !== undefined ? externalYearType : internalYearType;

    const handleChunkChange = (chunk: TimeChunk) => {
        if (externalOnChunkChange) {
            externalOnChunkChange(chunk);
        } else {
            setInternalChunk(chunk);
        }
        const { start, end } = computeDateRange(chunk, showFiscalYear || externalYearType !== undefined ? activeYearType : 'Calendar');
        onChange(start, end);
    };

    const handleYearTypeChange = (yt: YearType) => {
        if (externalOnYearTypeChange) {
            externalOnYearTypeChange(yt);
        } else {
            setInternalYearType(yt);
        }
        const { start, end } = computeDateRange(activeChunk, yt);
        onChange(start, end);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                    {label}
                </label>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <button
                        type="button"
                        className={`filter-pill${activeChunk === 'Monthly' ? ' active' : ''}`}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, height: 20 }}
                        onClick={() => handleChunkChange('Monthly')}
                    >
                        Monthly
                    </button>
                    <button
                        type="button"
                        className={`filter-pill${activeChunk === 'Quarterly' ? ' active' : ''}`}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, height: 20 }}
                        onClick={() => handleChunkChange('Quarterly')}
                    >
                        Quarterly
                    </button>
                    <button
                        type="button"
                        className={`filter-pill${activeChunk === 'Annual' ? ' active' : ''}`}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, height: 20 }}
                        onClick={() => handleChunkChange('Annual')}
                    >
                        Annual
                    </button>
                    {showFiscalYear && (
                        <>
                            <span style={{ width: 1, height: 12, background: 'var(--border)', margin: '0 2px' }} />
                            <button
                                type="button"
                                className={`filter-pill${activeYearType === 'Calendar' ? ' active' : ''}`}
                                style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, height: 20 }}
                                onClick={() => handleYearTypeChange('Calendar')}
                                title="Calendar Year (Jan 1 - Dec 31)"
                            >
                                Calendar
                            </button>
                            <button
                                type="button"
                                className={`filter-pill${activeYearType === 'Fiscal' ? ' active' : ''}`}
                                style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, height: 20 }}
                                onClick={() => handleYearTypeChange('Fiscal')}
                                title="Speedex Accounting Year: Oct 1 - Sep 30"
                            >
                                Fiscal
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <input
                    type="date"
                    className="report-select"
                    style={{ width: 128, padding: '5px 8px', fontSize: 11.5, borderRadius: 6, height: 34 }}
                    value={dateRangeStart}
                    onChange={e => onChange(e.target.value, dateRangeEnd)}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}>to</span>
                <input
                    type="date"
                    className="report-select"
                    style={{ width: 128, padding: '5px 8px', fontSize: 11.5, borderRadius: 6, height: 34 }}
                    value={dateRangeEnd}
                    onChange={e => onChange(dateRangeStart, e.target.value)}
                />
            </div>
        </div>
    );
};

export const ReportsTab: React.FC<{ teamMembers: Array<{ accountId: string; employeeName: string; role?: string }> }> = ({ teamMembers }) => {
    const { success, error } = useToast();
    const [reportSubTab, setReportSubTab] = useState<'kpi-tracking' | 'performance-report' | 'foms-export' | 'task-completion' | 'operational-summary'>('kpi-tracking');

    // Shared filter options
    const [departments, setDepartments] = useState<ReportFilterOption[]>([]);
    const [employees, setEmployees] = useState<ReportFilterOption[]>([]);

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const res = await api.get('/api/reports/filter-options');
                const data = res.data;
                if (data.isSuccess && data.data) {
                    setDepartments(data.data.departments || []);
                    setEmployees(data.data.employees || []);
                }
            } catch { }
        };
        fetchOptions();
    }, []);

    // Combine loaded employees with teamMembers fallback
    const allEmployeeOptions = useMemo(() => {
        if (employees.length > 0) {
            return employees.map(e => ({ accountId: e.id, employeeName: e.name }));
        }
        return teamMembers;
    }, [employees, teamMembers]);

    // Download blob helper
    const downloadBlob = (blobData: any, defaultFileName: string, mimeType: string, contentDisposition?: string) => {
        const match = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        const fileName = match?.[1]?.replace(/['"]/g, '') || defaultFileName;
        const url = URL.createObjectURL(new Blob([blobData], { type: mimeType }));
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Pagination states (20 records per page)
    const [kpiPage, setKpiPage] = useState(1);
    const [prEmpPage, setPrEmpPage] = useState(1);
    const [tcLogsPage, setTcLogsPage] = useState(1);
    const [tcEmpPage, setTcEmpPage] = useState(1);
    const [opDeptPage, setOpDeptPage] = useState(1);
    const [opEmpPage, setOpEmpPage] = useState(1);
    const [financialPage, setFinancialPage] = useState(1);

    useEffect(() => {
        setKpiPage(1);
        setPrEmpPage(1);
        setTcLogsPage(1);
        setTcEmpPage(1);
        setOpDeptPage(1);
        setOpEmpPage(1);
        setFinancialPage(1);
    }, [reportSubTab]);

    // --- KPI Tracking State ---
    const initialKpiDates = useMemo(() => computeDateRange('Monthly'), []);
    const [kpiFilter, setKpiFilter] = useState<{ dateRangeStart: string; dateRangeEnd: string; employeeId: string }>({
        dateRangeStart: initialKpiDates.start,
        dateRangeEnd: initialKpiDates.end,
        employeeId: '',
    });
    const [kpiData, setKpiData] = useState<any>(null);
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpiError, setKpiError] = useState('');
    const [kpiNoRecords, setKpiNoRecords] = useState(false);

    const handleKpiGenerate = async () => {
        if (!kpiFilter.dateRangeStart || !kpiFilter.dateRangeEnd) {
            setKpiError('Please select a date range first.');
            return;
        }
        setKpiPage(1);
        setKpiLoading(true);
        setKpiError('');
        setKpiNoRecords(false);
        setKpiData(null);
        try {
            const params = new URLSearchParams();
            params.set('dateRangeStart', kpiFilter.dateRangeStart);
            params.set('dateRangeEnd', kpiFilter.dateRangeEnd);
            if (kpiFilter.employeeId) params.set('employeeId', kpiFilter.employeeId);
            const res = await api.get(`/api/reports/kpi?${params.toString()}`);
            const json = res.data;
            if (json?.isSuccess && json?.data) {
                setKpiData(json.data);
            } else {
                setKpiNoRecords(true);
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                setKpiNoRecords(true);
                return;
            }
            setKpiError(err?.response?.data?.message || err.message || 'Failed to load KPI data.');
        } finally {
            setKpiLoading(false);
        }
    };

    const handleKpiExport = () => {
        if (!kpiData?.employeeKpis || kpiData.employeeKpis.length === 0) {
            error('No KPI data to export. Generate a report first.');
            return;
        }
        const headers = ['Employee Name', 'Department', 'Total Completed', 'On-Time Tasks', 'Late Tasks', 'On-Time Rate (%)', 'Late Rate (%)'];
        const rows = kpiData.employeeKpis.map((e: any) => [
            `"${e.employeeName || ''}"`,
            `"${e.department || ''}"`,
            e.totalCompleted ?? 0,
            e.onTimeCount ?? 0,
            e.lateCount ?? 0,
            `${e.onTimeRate ?? 0}%`,
            `${e.lateRate ?? 0}%`
        ]);
        const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
        downloadBlob(
            csvContent,
            `KPI_Tracking_Report_${kpiFilter.dateRangeStart}_${kpiFilter.dateRangeEnd}.csv`,
            'text/csv;charset=utf-8;'
        );
        success('KPI Tracking CSV exported successfully.');
    };

    // --- Performance Report State (Part 2: 5 KPIs) ---
    const initialPrDates = useMemo(() => computeDateRange('Monthly'), []);
    const [prFilter, setPrFilter] = useState<{
        period: 'Weekly' | 'Monthly' | 'Quarterly' | 'Annual';
        dateRangeStart: string;
        dateRangeEnd: string;
        employeeId: string;
        departmentId: string;
    }>({
        period: 'Monthly',
        dateRangeStart: initialPrDates.start,
        dateRangeEnd: initialPrDates.end,
        employeeId: '',
        departmentId: '',
    });
    const [prData, setPrData] = useState<any>(null);
    const [prLoading, setPrLoading] = useState(false);
    const [prExporting, setPrExporting] = useState(false);
    const [prError, setPrError] = useState('');
    const [prNoRecords, setPrNoRecords] = useState(false);

    const handlePrGenerate = async () => {
        if (!prFilter.dateRangeStart || !prFilter.dateRangeEnd) {
            setPrError('Please select a date range.');
            return;
        }
        const start = new Date(prFilter.dateRangeStart);
        const end = new Date(prFilter.dateRangeEnd);
        if (start > end) {
            setPrError('Start date must be before end date.');
            return;
        }
        setPrEmpPage(1);
        setPrLoading(true);
        setPrError('');
        setPrNoRecords(false);
        setPrData(null);
        try {
            const params = new URLSearchParams();
            params.set('period', prFilter.period);
            params.set('dateRangeStart', prFilter.dateRangeStart);
            params.set('dateRangeEnd', prFilter.dateRangeEnd);
            if (prFilter.employeeId) params.set('employeeId', prFilter.employeeId);
            if (prFilter.departmentId) params.set('departmentId', prFilter.departmentId);
            const res = await api.get(`/api/reports/performance?${params.toString()}`);
            const json = res.data;
            if (json?.isSuccess && json?.data) {
                setPrData(json.data);
            } else {
                setPrNoRecords(true);
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                setPrNoRecords(true);
                return;
            }
            setPrError(err?.response?.data?.message || err.message || 'Failed to generate report.');
        } finally {
            setPrLoading(false);
        }
    };

    const handlePrExport = async (format: 'Excel' | 'Pdf' | 'Csv') => {
        if (!prFilter.dateRangeStart || !prFilter.dateRangeEnd) {
            setPrError('Please generate a report first before exporting.');
            return;
        }
        setPrExporting(true);
        try {
            const body = {
                period: prFilter.period,
                dateRangeStart: prFilter.dateRangeStart || undefined,
                dateRangeEnd: prFilter.dateRangeEnd || undefined,
                departmentId: prFilter.departmentId || undefined,
                employeeId: prFilter.employeeId || undefined,
                exportFormat: format,
            };
            const res = await axios.post('/api/reports/export', body, { responseType: 'blob' });
            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                error(json?.message || 'Export failed.');
                return;
            }
            const mimeType = format === 'Excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : format === 'Csv'
                ? 'text/csv;charset=utf-8;'
                : 'application/pdf';
            const ext = format === 'Excel' ? 'xlsx' : format === 'Csv' ? 'csv' : 'pdf';
            downloadBlob(
                res.data,
                `Performance_Report_${prFilter.dateRangeStart}_${prFilter.dateRangeEnd}.${ext}`,
                mimeType,
                res.headers['content-disposition']
            );
            success(`${format} report downloaded successfully.`);
        } catch (err: any) {
            const msg = await readBlobError(err, 'Export failed. Please try again.');
            error(msg);
        } finally {
            setPrExporting(false);
        }
    };

    // --- Task Completion State (Part 1: Granular Task Logs) ---
    const initialTcDates = useMemo(() => computeDateRange('Monthly'), []);
    const [tcFilter, setTcFilter] = useState<ReportFilter>({
        dateRangeStart: initialTcDates.start,
        dateRangeEnd: initialTcDates.end,
        employeeId: '',
        taskPriorityLevel: '',
        taskStatus: '',
        taskCategory: '',
    });
    const [tcReport, setTcReport] = useState<TaskCompletionReport | null>(null);
    const [tcLoading, setTcLoading] = useState(false);
    const [tcExporting, setTcExporting] = useState(false);
    const [tcError, setTcError] = useState('');
    const [tcNoRecords, setTcNoRecords] = useState(false);
    const [tcGeneratedAt, setTcGeneratedAt] = useState('');

    const handleTcGenerate = async () => {
        if (!tcFilter.dateRangeStart || !tcFilter.dateRangeEnd) {
            setTcError('Please select a date range first.');
            return;
        }
        setTcLogsPage(1);
        setTcEmpPage(1);
        setTcLoading(true); setTcError(''); setTcNoRecords(false); setTcReport(null);
        try {
            const params = new URLSearchParams();
            params.set('DateRangeStart', tcFilter.dateRangeStart);
            params.set('DateRangeEnd', tcFilter.dateRangeEnd);
            if (tcFilter.employeeId) params.set('EmployeeId', tcFilter.employeeId);
            if (tcFilter.taskPriorityLevel) params.set('TaskPriorityLevel', tcFilter.taskPriorityLevel);
            if (tcFilter.taskStatus) params.set('TaskStatus', tcFilter.taskStatus);
            if (tcFilter.taskCategory) params.set('TaskCategory', tcFilter.taskCategory);

            let data;
            try {
                const res = await api.get(`/api/reports/task-completion?${params}`);
                data = res.data;
            } catch (err: any) {
                if (err.response?.status === 400) { setTcError('Invalid date range selected.'); return; }
                if (err.response?.status === 404) { setTcNoRecords(true); return; }
                setTcError(err?.response?.data?.message || 'Failed to generate report. Please try again.'); return;
            }
            if (data?.isSuccess && data?.data) { setTcReport(data.data); setTcGeneratedAt(new Date().toLocaleString()); }
            else { setTcNoRecords(true); }
        } catch { setTcError('Failed to generate report. Please try again.'); }
        finally { setTcLoading(false); }
    };

    const handleTcReset = () => {
        setTcLogsPage(1);
        setTcEmpPage(1);
        setTcFilter({ dateRangeStart: initialTcDates.start, dateRangeEnd: initialTcDates.end, employeeId: '', taskPriorityLevel: '', taskStatus: '', taskCategory: '' });
        setTcReport(null); setTcError(''); setTcNoRecords(false); setTcGeneratedAt('');
    };

    const handleTcExport = async (format: 'Excel' | 'Pdf' | 'Csv') => {
        if (!tcFilter.dateRangeStart || !tcFilter.dateRangeEnd) {
            setTcError('Please select a date range first.');
            return;
        }
        setTcExporting(true);
        try {
            const body = {
                dateRangeStart: tcFilter.dateRangeStart,
                dateRangeEnd: tcFilter.dateRangeEnd,
                employeeId: tcFilter.employeeId || undefined,
                taskPriorityLevel: tcFilter.taskPriorityLevel || undefined,
                taskStatus: tcFilter.taskStatus || undefined,
                taskCategory: tcFilter.taskCategory || undefined,
                exportFormat: format,
            };
            const res = await axios.post('/api/reports/task-completion/export', body, { responseType: 'blob' });
            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                error(json?.message || 'Export failed.');
                return;
            }
            const mimeType = format === 'Excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : format === 'Csv'
                ? 'text/csv;charset=utf-8;'
                : 'application/pdf';
            const ext = format === 'Excel' ? 'xlsx' : format === 'Csv' ? 'csv' : 'pdf';
            downloadBlob(
                res.data,
                `Task_Completion_Report_${tcFilter.dateRangeStart}_${tcFilter.dateRangeEnd}.${ext}`,
                mimeType,
                res.headers['content-disposition']
            );
            success(`Task Completion ${format} report downloaded successfully.`);
        } catch (err: any) {
            const msg = await readBlobError(err, 'Task Completion export failed. Please try again.');
            error(msg);
        } finally {
            setTcExporting(false);
        }
    };

    // --- Operational Summary State (Part 1 & 2: SLA & Workload Balance) ---
    const initialOpDates = useMemo(() => computeDateRange('Monthly'), []);
    const [opFilter, setOpFilter] = useState<OperationalFilter>({
        dateRangeStart: initialOpDates.start, dateRangeEnd: initialOpDates.end, departmentId: '', employeeId: '', reportFormat: 'PDF',
    });
    const [opReport, setOpReport] = useState<OperationalSummaryReport | null>(null);
    const [opLoading, setOpLoading] = useState(false);
    const [opDownloading, setOpDownloading] = useState(false);
    const [opError, setOpError] = useState('');
    const [opNoRecords, setOpNoRecords] = useState(false);
    const [opGeneratedAt, setOpGeneratedAt] = useState('');

    const handleOpGenerate = async () => {
        if (!opFilter.dateRangeStart || !opFilter.dateRangeEnd) {
            setOpError('Please select a date range first.');
            return;
        }
        setOpDeptPage(1);
        setOpEmpPage(1);
        setOpLoading(true); setOpError(''); setOpNoRecords(false); setOpReport(null);
        try {
            const params = new URLSearchParams();
            params.set('DateRangeStart', opFilter.dateRangeStart);
            params.set('DateRangeEnd', opFilter.dateRangeEnd);
            if (opFilter.departmentId) params.set('DepartmentId', opFilter.departmentId);
            if (opFilter.employeeId) params.set('EmployeeId', opFilter.employeeId);

            let data;
            try {
                const res = await api.get(`/api/reports/operational-summary?${params}`);
                data = res.data;
            } catch (err: any) {
                if (err.response?.status === 400) { setOpError('Invalid date range selected.'); setOpLoading(false); return; }
                if (err.response?.status === 404) { setOpNoRecords(true); setOpLoading(false); return; }
                setOpError('Failed to generate report. Please try again.'); setOpLoading(false); return;
            }
            if (data?.isSuccess && data?.data) { setOpReport(data.data); setOpGeneratedAt(new Date().toLocaleString()); }
            else { setOpNoRecords(true); }
        } catch { setOpError('Failed to generate report. Please try again.'); }
        finally { setOpLoading(false); }
    };

    const handleOpReset = () => {
        setOpDeptPage(1);
        setOpEmpPage(1);
        setOpFilter({ dateRangeStart: initialOpDates.start, dateRangeEnd: initialOpDates.end, departmentId: '', employeeId: '', reportFormat: 'PDF' });
        setOpReport(null); setOpError(''); setOpNoRecords(false); setOpGeneratedAt('');
    };

    const handleOpDownload = async (overrideFormat?: string) => {
        const fmt = overrideFormat || opFilter.reportFormat;
        setOpDownloading(true);
        try {
            const params = new URLSearchParams();
            params.set('DateRangeStart', opFilter.dateRangeStart);
            params.set('DateRangeEnd', opFilter.dateRangeEnd);
            if (opFilter.departmentId) params.set('DepartmentId', opFilter.departmentId);
            if (opFilter.employeeId) params.set('EmployeeId', opFilter.employeeId);
            params.set('ReportFormat', fmt);

            const res = await axios.get(`/api/reports/operational-summary/download?${params}`, { responseType: 'blob' });

            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                error(json?.message || 'Failed to download report.');
                return;
            }
            const mimeType = fmt === 'EXCEL'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : fmt === 'CSV'
                ? 'text/csv;charset=utf-8;'
                : 'application/pdf';
            const ext = fmt === 'EXCEL' ? 'xlsx' : fmt === 'CSV' ? 'csv' : 'pdf';
            downloadBlob(
                res.data,
                `OperationalSummaryReport_${new Date().toISOString().slice(0, 10)}.${ext}`,
                mimeType,
                res.headers['content-disposition']
            );
            success(`${fmt} report downloaded successfully.`);
        } catch (err: any) {
            const msg = await readBlobError(err, 'Failed to download report. Please try again.');
            error(msg);
        } finally {
            setOpDownloading(false);
        }
    };

    // --- Financial Report (FOMS) State (Part 1: Realistic Financial Ledger) ---
    const [fomsYearType, setFomsYearType] = useState<YearType>('Calendar');
    const [fomsChunk, setFomsChunk] = useState<TimeChunk>('Monthly');
    const initialFomsDates = useMemo(() => computeDateRange('Monthly', 'Calendar'), []);
    const [fomsFilter, setFomsFilter] = useState<{
        dateRangeStart: string;
        dateRangeEnd: string;
        departmentId: string;
        status: string;
    }>({
        dateRangeStart: initialFomsDates.start,
        dateRangeEnd: initialFomsDates.end,
        departmentId: '',
        status: 'All',
    });

    const handleFomsYearTypeChange = (yt: YearType) => {
        setFomsYearType(yt);
        const { start, end } = computeDateRange(fomsChunk, yt);
        setFomsFilter(prev => ({ ...prev, dateRangeStart: start, dateRangeEnd: end }));
    };

    const handleFomsChunkChange = (chunk: TimeChunk) => {
        setFomsChunk(chunk);
        const { start, end } = computeDateRange(chunk, fomsYearType);
        setFomsFilter(prev => ({ ...prev, dateRangeStart: start, dateRangeEnd: end }));
    };
    const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
    const [financialLoading, setFinancialLoading] = useState(false);
    const [financialExporting, setFinancialExporting] = useState(false);
    const [financialError, setFinancialError] = useState('');
    const [financialNoRecords, setFinancialNoRecords] = useState(false);
    const [financialGeneratedAt, setFinancialGeneratedAt] = useState('');

    const handleFinancialGenerate = async () => {
        if (!fomsFilter.dateRangeStart || !fomsFilter.dateRangeEnd) {
            setFinancialError('Please select a date range.');
            return;
        }
        setFinancialPage(1);
        setFinancialLoading(true);
        setFinancialError('');
        setFinancialNoRecords(false);
        setFinancialReport(null);
        try {
            const params = new URLSearchParams();
            params.set('DateRangeStart', fomsFilter.dateRangeStart);
            params.set('DateRangeEnd', fomsFilter.dateRangeEnd);
            if (fomsFilter.departmentId) params.set('DepartmentId', fomsFilter.departmentId);
            if (fomsFilter.status && fomsFilter.status !== 'All') params.set('Status', fomsFilter.status);

            const res = await api.get(`/api/reports/financial?${params.toString()}`);
            const json = res.data;
            if (json?.isSuccess && json?.data) {
                setFinancialReport(json.data);
                setFinancialGeneratedAt(new Date().toLocaleString());
            } else {
                setFinancialNoRecords(true);
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                setFinancialNoRecords(true);
                return;
            }
            setFinancialError(err?.response?.data?.message || err.message || 'Failed to load Financial Report.');
        } finally {
            setFinancialLoading(false);
        }
    };

    const handleFinancialExport = async (format: 'Excel' | 'Pdf' | 'Csv') => {
        if (!fomsFilter.dateRangeStart || !fomsFilter.dateRangeEnd) {
            setFinancialError('Please select a date range first.');
            return;
        }
        setFinancialExporting(true);
        try {
            const body = {
                dateRangeStart: fomsFilter.dateRangeStart,
                dateRangeEnd: fomsFilter.dateRangeEnd,
                departmentId: fomsFilter.departmentId || undefined,
                status: fomsFilter.status !== 'All' ? fomsFilter.status : undefined,
                exportFormat: format,
            };
            const res = await axios.post('/api/reports/financial/export', body, { responseType: 'blob' });
            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                error(json?.message || 'Financial export failed.');
                return;
            }
            const mimeType = format === 'Excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : format === 'Csv'
                ? 'text/csv;charset=utf-8;'
                : 'application/pdf';
            const ext = format === 'Excel' ? 'xlsx' : format === 'Csv' ? 'csv' : 'pdf';
            downloadBlob(
                res.data,
                `Speedex_Financial_Report_${fomsFilter.dateRangeStart}_to_${fomsFilter.dateRangeEnd}.${ext}`,
                mimeType,
                res.headers['content-disposition']
            );
            success(`Financial ${format} report exported successfully.`);
        } catch (err: any) {
            const msg = await readBlobError(err, 'Financial export failed. Please try again.');
            error(msg);
        } finally {
            setFinancialExporting(false);
        }
    };

    const handleLegacyFomsTaskExport = async () => {
        if (!fomsFilter.dateRangeStart || !fomsFilter.dateRangeEnd) {
            setFinancialError('Please select a date range.');
            return;
        }
        setFinancialExporting(true);
        try {
            const body: Record<string, any> = {
                dateRangeStart: fomsFilter.dateRangeStart,
                dateRangeEnd: fomsFilter.dateRangeEnd,
            };
            const res = await axios.post('/api/foms/export', body, { responseType: 'blob' });
            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                error(json?.message || 'FOMS export failed.');
                return;
            }
            downloadBlob(
                res.data,
                `foms_tasks_export_${fomsFilter.dateRangeStart}_to_${fomsFilter.dateRangeEnd}.csv`,
                'text/csv;charset=utf-8;',
                res.headers['content-disposition']
            );
            success('FOMS task records exported successfully.');
        } catch (err: any) {
            error(err?.response?.data?.message || err?.message || 'Failed to export FOMS data.');
        } finally {
            setLoading(false);
        }
    };

    // Pagination data slices (PAGE_SIZE = 20)
    const pagedEmployeeKpis = useMemo(() => {
        if (!kpiData?.employeeKpis) return [];
        const start = (kpiPage - 1) * REPORT_PAGE_SIZE;
        return kpiData.employeeKpis.slice(start, start + REPORT_PAGE_SIZE);
    }, [kpiData?.employeeKpis, kpiPage]);
    const totalKpiPages = Math.ceil((kpiData?.employeeKpis?.length || 0) / REPORT_PAGE_SIZE);

    const pagedTcTasks = useMemo(() => {
        if (!tcReport?.tasks) return [];
        const start = (tcLogsPage - 1) * REPORT_PAGE_SIZE;
        return tcReport.tasks.slice(start, start + REPORT_PAGE_SIZE);
    }, [tcReport?.tasks, tcLogsPage]);
    const totalTcLogPages = Math.ceil((tcReport?.tasks?.length || 0) / REPORT_PAGE_SIZE);

    const pagedTcEmp = useMemo(() => {
        if (!tcReport?.employeePerformanceSummary) return [];
        const start = (tcEmpPage - 1) * REPORT_PAGE_SIZE;
        return tcReport.employeePerformanceSummary.slice(start, start + REPORT_PAGE_SIZE);
    }, [tcReport?.employeePerformanceSummary, tcEmpPage]);
    const totalTcEmpPages = Math.ceil((tcReport?.employeePerformanceSummary?.length || 0) / REPORT_PAGE_SIZE);

    const pagedOpDept = useMemo(() => {
        if (!opReport?.departmentSummaries) return [];
        const start = (opDeptPage - 1) * REPORT_PAGE_SIZE;
        return opReport.departmentSummaries.slice(start, start + REPORT_PAGE_SIZE);
    }, [opReport?.departmentSummaries, opDeptPage]);
    const totalOpDeptPages = Math.ceil((opReport?.departmentSummaries?.length || 0) / REPORT_PAGE_SIZE);

    const pagedOpEmp = useMemo(() => {
        if (!opReport?.employeePerformanceSummary) return [];
        const start = (opEmpPage - 1) * REPORT_PAGE_SIZE;
        return opReport.employeePerformanceSummary.slice(start, start + REPORT_PAGE_SIZE);
    }, [opReport?.employeePerformanceSummary, opEmpPage]);
    const totalOpEmpPages = Math.ceil((opReport?.employeePerformanceSummary?.length || 0) / REPORT_PAGE_SIZE);

    const pagedPrEmp = useMemo(() => {
        if (!prData?.employeeBreakdown) return [];
        const start = (prEmpPage - 1) * REPORT_PAGE_SIZE;
        return prData.employeeBreakdown.slice(start, start + REPORT_PAGE_SIZE);
    }, [prData?.employeeBreakdown, prEmpPage]);
    const totalPrEmpPages = Math.ceil((prData?.employeeBreakdown?.length || 0) / REPORT_PAGE_SIZE);

    const pagedInvoices = useMemo(() => {
        if (!financialReport?.invoices) return [];
        const start = (financialPage - 1) * REPORT_PAGE_SIZE;
        return financialReport.invoices.slice(start, start + REPORT_PAGE_SIZE);
    }, [financialReport?.invoices, financialPage]);
    const totalFinancialPages = Math.ceil((financialReport?.invoices?.length || 0) / REPORT_PAGE_SIZE);

    // Auto-load initial report data on mount or tab change
    useEffect(() => {
        if (reportSubTab === 'kpi-tracking' && !kpiData && !kpiLoading && !kpiError) {
            handleKpiGenerate();
        } else if (reportSubTab === 'task-completion' && !tcReport && !tcLoading && !tcError) {
            handleTcGenerate();
        } else if (reportSubTab === 'operational-summary' && !opReport && !opLoading && !opError) {
            handleOpGenerate();
        } else if (reportSubTab === 'performance-report' && !prData && !prLoading && !prError) {
            handlePrGenerate();
        } else if (reportSubTab === 'foms-export' && !financialReport && !financialLoading && !financialError) {
            handleFinancialGenerate();
        }
    }, [reportSubTab]);

    // Chart Data Helpers
    const [selectedPrEmpId, setSelectedPrEmpId] = useState<string>('');

    const formatReportDateTime = (d?: string | Date | null) => {
        if (!d) return '—';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '—';
            return dt.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return '—';
        }
    };

    const selectedPrEmp = useMemo(() => {
        const targetId = selectedPrEmpId || prFilter.employeeId;
        if (!targetId) return null;
        return prData?.employeeBreakdown?.find((e: any) => String(e.employeeId) === targetId) || null;
    }, [selectedPrEmpId, prFilter.employeeId, prData?.employeeBreakdown]);

    const tcChartData = useMemo(() => {
        if (!tcReport) return [];
        return [
            { name: 'Completed', value: tcReport.totalTasksCompleted || 0, fill: '#05cd99' },
            { name: 'In Progress', value: tcReport.totalTasksInProgress || 0, fill: '#ffb547' },
            { name: 'Pending Review', value: tcReport.totalTasksPendingReview || 0, fill: '#4318ff' },
            { name: 'Overdue', value: tcReport.totalOverdueTasks || 0, fill: '#ee5d50' },
        ].filter(d => d.value > 0);
    }, [tcReport]);

    const tcPriorityChartData = useMemo(() => {
        if (!tcReport?.tasks) return [];
        const counts: Record<string, number> = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
        for (const t of tcReport.tasks) {
            const p = t.priority || 'Medium';
            counts[p] = (counts[p] || 0) + 1;
        }
        return [
            { name: 'Urgent', count: counts['Urgent'], fill: '#ee5d50' },
            { name: 'High', count: counts['High'], fill: '#ffb547' },
            { name: 'Medium', count: counts['Medium'], fill: '#4318ff' },
            { name: 'Low', count: counts['Low'], fill: '#05cd99' },
        ];
    }, [tcReport?.tasks]);

    return (
        <div className="dashboard-content reports-dashboard-content">
            <SubTabNav
                tabs={[
                    { key: 'kpi-tracking', label: 'KPI Tracking', icon: <BarChart3 size={14} /> },
                    { key: 'task-completion', label: 'Task Completion Report', icon: <FileText size={14} /> },
                    { key: 'operational-summary', label: 'Operational Report', icon: <Activity size={14} /> },
                    { key: 'performance-report', label: 'Performance Report', icon: <TrendingUp size={14} /> },
                    { key: 'foms-export', label: 'Financial Report (FOMS)', icon: <DollarSign size={14} /> },
                ]}
                activeTab={reportSubTab}
                onTabChange={key => {
                    setSelectedPrEmpId('');
                    setReportSubTab(key as 'kpi-tracking' | 'performance-report' | 'foms-export' | 'task-completion' | 'operational-summary');
                }}
            />

            {/* 1. KPI Tracking */}
            {reportSubTab === 'kpi-tracking' && (
                <>
                    <div className="card report-filter-card">
                        <div style={{ marginBottom: 12 }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                📊 KPI Tracking &amp; SLA Performance
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                                Track on-time task delivery rates, identify overdue trends, and evaluate employee SLA compliance.
                            </p>
                        </div>
                        <div className="report-filter-bar">
                            <div className="report-filter-fields">
                                <DateRangeEngineField
                                    dateRangeStart={kpiFilter.dateRangeStart}
                                    dateRangeEnd={kpiFilter.dateRangeEnd}
                                    onChange={(start, end) => setKpiFilter(prev => ({ ...prev, dateRangeStart: start, dateRangeEnd: end }))}
                                    showFiscalYear={false}
                                />
                                <div className="field" style={{ minWidth: 200 }}>
                                    <label>Employee Filter</label>
                                    <SearchableSelect
                                        value={kpiFilter.employeeId}
                                        onChange={val => setKpiFilter(prev => ({ ...prev, employeeId: val }))}
                                        options={allEmployeeOptions.map(m => ({ value: m.accountId, label: m.employeeName }))}
                                        placeholder="All Employees"
                                        searchPlaceholder="Search employees..."
                                        width="100%"
                                    />
                                </div>
                            </div>
                            <div className="report-filter-actions-right">
                                {kpiData && (
                                    <button className="btn" onClick={handleKpiExport} title="Export KPI CSV">
                                        <Download size={14} /> Export CSV
                                    </button>
                                )}
                                <button className="btn btn-teal" onClick={handleKpiGenerate} disabled={kpiLoading} style={{ height: 34 }}>
                                    {kpiLoading ? <><Loader2 size={14} className="spin" /> Generating...</> : <><Filter size={14} /> Generate Report</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {kpiError && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="empty-state">
                                <AlertCircle size={22} style={{ color: 'var(--danger)' }} />
                                <p>{kpiError}</p>
                            </div>
                        </div>
                    )}

                    {kpiNoRecords && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="report-empty-state">
                                <FileText size={22} />
                                <p>No completed tasks found for the selected criteria.</p>
                            </div>
                        </div>
                    )}

                    {kpiData && !kpiError && !kpiNoRecords && (
                        <>
                            <div className="stats-row stats-row-3" style={{ marginTop: 16 }}>
                                {[
                                    { label: 'Total Completed', value: kpiData.totalCompletedTasks, icon: <CheckCircle2 size={18} />, variant: 'teal', subtext: 'Completed tasks' },
                                    { label: 'On-Time Tasks', value: kpiData.totalOnTimeTasks, icon: <CheckCircle2 size={18} />, variant: 'success', subtext: `${kpiData.overallOnTimeRate}% on-time rate` },
                                    { label: 'Late Tasks', value: kpiData.totalLateTasks, icon: <AlertCircle size={18} />, variant: 'danger', subtext: `${kpiData.overallLateRate}% late rate` },
                                ].map(s => (
                                    <StatusCard key={s.label} icon={s.icon} variant={s.variant as any} label={s.label} value={s.value} subtext={s.subtext} />
                                ))}
                            </div>

                            {/* Visual Graphs for KPI Tracking */}
                            <div className="report-charts-grid">
                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>On-Time vs. Late Breakdown</h4>
                                        <span className="report-pill teal">Overall Compliance</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'On-Time Tasks', value: kpiData.totalOnTimeTasks || 0 },
                                                        { name: 'Late Tasks', value: kpiData.totalLateTasks || 0 },
                                                    ]}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={55}
                                                    outerRadius={80}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                >
                                                    <Cell fill="#05cd99" />
                                                    <Cell fill="#ee5d50" />
                                                </Pie>
                                                <Tooltip formatter={(val: any) => [`${val} tasks`, 'Count']} />
                                                <Legend verticalAlign="bottom" height={36} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Employee Completion Breakdown</h4>
                                        <span className="report-pill blue">Top Contributors</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={kpiData.employeeKpis?.slice(0, 7).map((e: any) => ({
                                                name: e.employeeName.split(' ')[0],
                                                'On-Time': e.onTimeCount || 0,
                                                'Late': e.lateCount || 0,
                                            })) || []} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                <YAxis tick={{ fontSize: 11 }} />
                                                <Tooltip />
                                                <Legend />
                                                <Bar dataKey="On-Time" fill="#05cd99" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="Late" fill="#ee5d50" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Per-Employee Breakdown</h4>
                                    {kpiData.employeeKpis && <span className="report-pill blue">{kpiData.employeeKpis.length} employees</span>}
                                </div>
                                {kpiData.employeeKpis && kpiData.employeeKpis.length > 0 ? (
                                    <>
                                        <table className="table-card-data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '22%' }}>Employee</th>
                                                    <th style={{ width: '18%' }}>Department</th>
                                                    <th style={{ width: '12%', textAlign: 'center' }}>Completed</th>
                                                    <th style={{ width: '12%', textAlign: 'center' }}>On-Time</th>
                                                    <th style={{ width: '12%', textAlign: 'center' }}>Late</th>
                                                    <th style={{ width: '12%', textAlign: 'center' }}>On-Time Rate</th>
                                                    <th style={{ width: '12%', textAlign: 'center' }}>Late Rate</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedEmployeeKpis.map((kpi: any) => {
                                                    const onTimeRate = kpi.onTimeRate ?? 0;
                                                    const isGood = onTimeRate >= 80;
                                                    const isWarning = onTimeRate >= 50 && onTimeRate < 80;
                                                    return (
                                                        <tr key={kpi.employeeId} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{kpi.employeeName}</td>
                                                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{kpi.department}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{kpi.totalCompleted}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--status-active)' }}>{kpi.onTimeCount}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--status-failed)' }}>{kpi.lateCount}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${isGood ? 'success' : isWarning ? 'warning' : 'danger'}`}>
                                                                    {onTimeRate}%
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-secondary)' }}>{kpi.lateRate}%</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                Showing {Math.min((kpiPage - 1) * REPORT_PAGE_SIZE + 1, kpiData.employeeKpis.length)}–{Math.min(kpiPage * REPORT_PAGE_SIZE, kpiData.employeeKpis.length)} of {kpiData.employeeKpis.length} records
                                            </span>
                                            <Pagination
                                                currentPage={kpiPage}
                                                totalPages={totalKpiPages}
                                                onPageChange={setKpiPage}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="empty-state" style={{ padding: '32px 0' }}>
                                        <CheckCircle2 size={22} />
                                        <p>No completed tasks found for the selected criteria.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* 2. Task Completion Report */}
            {reportSubTab === 'task-completion' && (
                <>
                    <div className="card report-filter-card">
                        <div style={{ marginBottom: 12 }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                📋 Task Completion Reports &amp; Logs
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                                Audit granular task completion logs, individual performance metrics, and export data.
                            </p>
                        </div>
                        <div className="report-filter-bar">
                            <div className="report-filter-fields">
                                <DateRangeEngineField
                                    dateRangeStart={tcFilter.dateRangeStart}
                                    dateRangeEnd={tcFilter.dateRangeEnd}
                                    onChange={(start, end) => setTcFilter(p => ({ ...p, dateRangeStart: start, dateRangeEnd: end }))}
                                    showFiscalYear={false}
                                />
                                <div className="field" style={{ minWidth: 170 }}>
                                    <label>Employee Filter</label>
                                    <SearchableSelect
                                        value={tcFilter.employeeId}
                                        onChange={val => setTcFilter(p => ({ ...p, employeeId: val }))}
                                        options={allEmployeeOptions.map(m => ({ value: m.accountId, label: m.employeeName }))}
                                        placeholder="All Employees"
                                        searchPlaceholder="Search employees..."
                                        width="100%"
                                    />
                                </div>
                                <div className="field" style={{ width: 130 }}>
                                    <label>Priority</label>
                                    <select className="report-select"
                                        value={tcFilter.taskPriorityLevel}
                                        onChange={e => setTcFilter(p => ({ ...p, taskPriorityLevel: e.target.value }))}>
                                        <option value="">All Priorities</option>
                                        {PRIORITY_LEVELS.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field" style={{ width: 130 }}>
                                    <label>Status</label>
                                    <select className="report-select"
                                        value={tcFilter.taskStatus}
                                        onChange={e => setTcFilter(p => ({ ...p, taskStatus: e.target.value }))}>
                                        <option value="">All Statuses</option>
                                        {TASK_STATUSES_FILTER.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field" style={{ width: 140 }}>
                                    <label>Category</label>
                                    <select className="report-select"
                                        value={tcFilter.taskCategory}
                                        onChange={e => setTcFilter(p => ({ ...p, taskCategory: e.target.value }))}>
                                        <option value="">All Categories</option>
                                        {TASK_CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="report-filter-actions-right">
                                <button className="btn" onClick={handleTcReset} title="Reset Filters"><RotateCcw size={14} /> Reset</button>
                                {tcReport && (
                                    <>
                                        <button className="btn" onClick={() => handleTcExport('Csv')} disabled={tcExporting} title="Export CSV">
                                            {tcExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} CSV
                                        </button>
                                        <button className="btn" onClick={() => handleTcExport('Excel')} disabled={tcExporting} title="Export Excel">
                                            {tcExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Excel
                                        </button>
                                        <button className="btn" onClick={() => handleTcExport('Pdf')} disabled={tcExporting} title="Export PDF">
                                            {tcExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} PDF
                                        </button>
                                    </>
                                )}
                                <button className="btn btn-teal" onClick={handleTcGenerate} disabled={tcLoading} style={{ height: 34 }}>
                                    {tcLoading ? <Loader2 size={14} className="spin" /> : <Filter size={14} />}
                                    {' '}{tcLoading ? 'Generating...' : 'Generate Report'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {tcError && <div className="report-error-msg">{tcError}</div>}
                    {tcNoRecords && <div className="report-empty-state"><FileText size={22} /><p>No records found for selected criteria.</p></div>}

                    {tcReport && (
                        <>
                            <div className="report-summary-grid">
                                <StatusCard icon={<ClipboardList size={20} strokeWidth={2.3} />} variant='teal' label="ASSIGNED" value={String(tcReport.totalTasksAssigned)} subtext="Total tasks" />
                                <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="COMPLETED" value={String(tcReport.totalTasksCompleted)} subtext="Tasks finished" />
                                <StatusCard icon={<Loader2 size={20} strokeWidth={2.3} />} variant="warning" label="IN PROGRESS" value={String(tcReport.totalTasksInProgress)} subtext="Ongoing" />
                                <StatusCard icon={<Eye size={20} strokeWidth={2.3} />} variant='teal' label="PENDING REVIEW" value={String(tcReport.totalTasksPendingReview)} subtext="Awaiting review" />
                                <StatusCard icon={<AlertCircle size={20} strokeWidth={2.3} />} variant="danger" label="OVERDUE" value={String(tcReport.totalOverdueTasks)} subtext="Past deadline" />
                                <StatusCard icon={<BarChart3 size={20} strokeWidth={2.3} />} variant="success" label="COMPLETION RATE" value={`${tcReport.taskCompletionRate}%`} subtext="Completion rate" />
                                <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="ON-TIME RATE" value={`${tcReport.overallOnTimeRate ?? 0}%`} subtext="On-time delivery" />
                                <StatusCard icon={<Calendar size={20} strokeWidth={2.3} />} variant="warning" label="AVG TIME" value={`${(tcReport.averageTaskCompletionTimeHours ?? 0).toFixed(1)}h`} subtext="Per task avg" />
                            </div>

                            {/* Visual Charts for Task Completion */}
                            <div className="report-charts-grid">
                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Task Status Distribution</h4>
                                        <span className="report-pill teal">Status Breakdown</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        {tcChartData.length === 0 ? (
                                            <div className="report-empty-state"><p>No status data available.</p></div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={tcChartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={50}
                                                        outerRadius={75}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                    >
                                                        {tcChartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Tasks by Priority</h4>
                                        <span className="report-pill blue">Priority Distribution</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={tcPriorityChartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                <YAxis tick={{ fontSize: 11 }} />
                                                <Tooltip />
                                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                                    {tcPriorityChartData.map((entry, idx) => (
                                                        <Cell key={`prio-${idx}`} fill={entry.fill} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Granular Task Logs */}
                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Granular Task Execution Logs ({tcReport.tasks?.length || 0} tasks)</h4>
                                </div>
                                {tcReport.tasks && tcReport.tasks.length > 0 ? (
                                    <>
                                        <table className="table-card-data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '22%' }}>Task Ref &amp; Title</th>
                                                    <th style={{ width: '16%' }}>Assigned / Completed By</th>
                                                    <th style={{ width: '11%' }}>Department</th>
                                                    <th style={{ width: '9%', textAlign: 'center' }}>Priority</th>
                                                    <th style={{ width: '12%' }}>Deadline</th>
                                                    <th style={{ width: '12%' }}>Last Updated</th>
                                                    <th style={{ width: '10%', textAlign: 'center' }}>Timeliness Status</th>
                                                    <th style={{ width: '8%', textAlign: 'center' }}>Current Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedTcTasks.map((task) => {
                                                    const isCompleted = task.status === 'Completed';
                                                    const isOverdue = !isCompleted && !task.isOnTime;
                                                    return (
                                                        <tr key={task.taskId} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                                                <div>{task.title}</div>
                                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>Ref: {task.taskReferenceNumber}</div>
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                                                                    <User size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                                                    <span>{task.assignedEmployee || 'Unassigned'}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12 }}>{task.department || 'N/A'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${task.priority === 'Urgent' ? 'danger' : task.priority === 'High' ? 'warning' : 'blue'}`}>
                                                                    {task.priority}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', fontSize: 11.5 }}>
                                                                {formatReportDateTime(task.deadline)}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', fontSize: 11.5 }}>
                                                                {formatReportDateTime(task.completedAt || (task as any).updatedAt)}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${isCompleted
                                                                    ? (task.isOnTime ? 'success' : 'danger')
                                                                    : (isOverdue ? 'danger' : 'warning')}`}>
                                                                    {isCompleted
                                                                        ? (task.isOnTime ? '✅ On-Time' : `⏰ Late ${task.overdueHours > 0 ? `(+${task.overdueHours.toFixed(1)}h)` : ''}`)
                                                                        : (isOverdue ? `⚠️ Overdue ${task.overdueHours > 0 ? `(+${task.overdueHours.toFixed(1)}h)` : ''}` : '⏳ In Progress')}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className="report-pill teal">{task.status}</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                Showing {Math.min((tcLogsPage - 1) * REPORT_PAGE_SIZE + 1, tcReport.tasks.length)}–{Math.min(tcLogsPage * REPORT_PAGE_SIZE, tcReport.tasks.length)} of {tcReport.tasks.length} records
                                            </span>
                                            <Pagination
                                                currentPage={tcLogsPage}
                                                totalPages={totalTcLogPages}
                                                onPageChange={setTcLogsPage}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="empty-state" style={{ padding: '32px 0' }}>
                                        <CheckCircle2 size={22} />
                                        <p>No task execution logs available for selected range.</p>
                                    </div>
                                )}
                            </div>

                            <div className="card" style={{ marginTop: 16 }}>
                                <DataTable title="Employee Performance Summary"
                                    headers={['Employee', 'Assigned', 'Completed', 'Rate', 'Avg Time (h)']}
                                    loading={false} emptyMessage="No employee data for selected criteria."
                                    totalRecords={tcReport.employeePerformanceSummary.length}
                                    currentPage={tcEmpPage}
                                    totalPages={totalTcEmpPages}
                                    onPageChange={setTcEmpPage}
                                    pageSize={REPORT_PAGE_SIZE}>
                                    {pagedTcEmp.map(ep => (
                                        <tr key={ep.employeeName}>
                                            <td style={{ fontWeight: 600 }}>{ep.employeeName}</td>
                                            <td>{ep.totalAssigned}</td>
                                            <td>{ep.totalCompleted}</td>
                                            <td>{ep.completionRate}%</td>
                                            <td>{(ep.averageCompletionTimeHours ?? 0).toFixed(1)}</td>
                                        </tr>
                                    ))}
                                </DataTable>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* 3. Operational Summary Report */}
            {reportSubTab === 'operational-summary' && (
                <>
                    <div className="card report-filter-card">
                        <div style={{ marginBottom: 12 }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                📈 Operational Summary &amp; SLA Compliance
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                                Department workload balance, capacity utilization, and operational SLA breach indicators.
                            </p>
                        </div>
                        <div className="report-filter-bar">
                            <div className="report-filter-fields">
                                <DateRangeEngineField
                                    dateRangeStart={opFilter.dateRangeStart}
                                    dateRangeEnd={opFilter.dateRangeEnd}
                                    onChange={(start, end) => setOpFilter(p => ({ ...p, dateRangeStart: start, dateRangeEnd: end }))}
                                    showFiscalYear={false}
                                />
                                <div className="field" style={{ width: 170 }}>
                                    <label>Department</label>
                                    <select className="report-select"
                                        value={opFilter.departmentId}
                                        onChange={e => setOpFilter(p => ({ ...p, departmentId: e.target.value }))}>
                                        <option value="">All Departments</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field" style={{ minWidth: 180 }}>
                                    <label>Employee Filter</label>
                                    <SearchableSelect
                                        value={opFilter.employeeId}
                                        onChange={val => setOpFilter(p => ({ ...p, employeeId: val }))}
                                        options={allEmployeeOptions.map(e => ({ value: e.accountId, label: e.employeeName }))}
                                        placeholder="All Employees"
                                        searchPlaceholder="Search employees..."
                                        width="100%"
                                    />
                                </div>
                            </div>
                            <div className="report-filter-actions-right">
                                <button className="btn" onClick={handleOpReset} title="Reset Filters"><RotateCcw size={14} /> Reset</button>
                                {opReport && (
                                    <>
                                        <button className="btn" onClick={() => handleOpDownload('PDF')} disabled={opDownloading} title="Download PDF">
                                            {opDownloading ? <Loader2 size={14} className="spin" /> : <Download size={14} />} PDF
                                        </button>
                                        <button className="btn" onClick={() => handleOpDownload('EXCEL')} disabled={opDownloading} title="Download Excel">
                                            {opDownloading ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Excel
                                        </button>
                                        <button className="btn" onClick={() => handleOpDownload('CSV')} disabled={opDownloading} title="Download CSV">
                                            {opDownloading ? <Loader2 size={14} className="spin" /> : <Download size={14} />} CSV
                                        </button>
                                    </>
                                )}
                                <button className="btn btn-teal" onClick={handleOpGenerate} disabled={opLoading} style={{ height: 34 }}>
                                    {opLoading ? <Loader2 size={14} className="spin" /> : <Filter size={14} />}
                                    {' '}{opLoading ? 'Generating...' : 'Generate Report'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {opError && <div className="report-error-msg">{opError}</div>}
                    {opNoRecords && <div className="report-empty-state"><FileText size={22} /><p>No records found for selected criteria.</p></div>}

                    {opReport && (
                        <>
                            <div className="report-summary-grid">
                                <StatusCard icon={<ClipboardList size={20} strokeWidth={2.3} />} variant='teal' label="TOTAL TASKS" value={String(opReport.totalTasks)} subtext="All tasks" />
                                <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="COMPLETED" value={String(opReport.completedTasks)} subtext="Tasks finished" />
                                <StatusCard icon={<Loader2 size={20} strokeWidth={2.3} />} variant="warning" label="PENDING" value={String(opReport.pendingTasks)} subtext="Not yet completed" />
                                <StatusCard icon={<AlertCircle size={20} strokeWidth={2.3} />} variant="danger" label="OVERDUE" value={String(opReport.overdueTasks)} subtext="Past deadline" />
                                <StatusCard icon={<BarChart3 size={20} strokeWidth={2.3} />} variant="success" label="COMPLETION RATE" value={`${opReport.taskCompletionRate.toFixed(1)}%`} subtext="Overall rate" />
                                <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="ON-TIME RATE" value={`${(opReport.overallOnTimeRate ?? 0).toFixed(1)}%`} subtext="On-time delivery" />
                                <StatusCard icon={<AlertCircle size={20} strokeWidth={2.3} />} variant="danger" label="SLA BREACH RATE" value={`${(opReport.overallSlaBreachRate ?? 0).toFixed(1)}%`} subtext="Missed SLA" />
                            </div>

                            {/* Visual Charts for Operational Report */}
                            <div className="report-charts-grid">
                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Department Task Volume &amp; SLA Breaches</h4>
                                        <span className="report-pill teal">By Department</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={opReport.departmentSummaries?.slice(0, 6).map(d => ({
                                                name: d.departmentName.split(' ')[0],
                                                Total: d.totalTasks,
                                                Completed: d.completedTasks,
                                                'SLA Breached': d.slaBreachedTasks,
                                            })) || []} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                <YAxis tick={{ fontSize: 11 }} />
                                                <Tooltip />
                                                <Legend />
                                                <Bar dataKey="Total" fill="#0284c7" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="Completed" fill="#05cd99" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="SLA Breached" fill="#ee5d50" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Workload by Priority</h4>
                                        <span className="report-pill blue">Distribution</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        {opReport.workloadByPriority && opReport.workloadByPriority.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={opReport.workloadByPriority.map(w => ({
                                                    name: w.categoryName,
                                                    Tasks: w.taskCount,
                                                }))} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                    <YAxis tick={{ fontSize: 11 }} />
                                                    <Tooltip />
                                                    <Bar dataKey="Tasks" fill="#4318ff" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="report-empty-state"><p>No priority breakdown data.</p></div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Department SLA Breach & Workload Balance Table */}
                            {opReport.departmentSummaries && opReport.departmentSummaries.length > 0 && (
                                <div className="card" style={{ marginTop: 16 }}>
                                    <div className="card-header-layout">
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Department / Team Workload &amp; SLA Breach Risk</h4>
                                            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                                Monitor department SLA hits, team capacity, and active bottlenecks.
                                            </p>
                                        </div>
                                        <span className="report-pill blue">{opReport.departmentSummaries.length} Teams</span>
                                    </div>
                                    <table className="table-card-data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '20%' }}>Department / Team</th>
                                                <th style={{ width: '9%', textAlign: 'center' }}>Total Tasks</th>
                                                <th style={{ width: '9%', textAlign: 'center' }}>Completed</th>
                                                <th style={{ width: '8%', textAlign: 'center' }}>Active</th>
                                                <th style={{ width: '10%', textAlign: 'center' }}>SLA Breached</th>
                                                <th style={{ width: '14%', textAlign: 'center' }}>SLA Hit Risk</th>
                                                <th style={{ width: '10%', textAlign: 'center' }}>On-Time Rate</th>
                                                <th style={{ width: '10%', textAlign: 'center' }}>Tasks / Member</th>
                                                <th style={{ width: '10%', textAlign: 'center' }}>Team Capacity Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedOpDept.map((dept) => {
                                                const status = dept.workloadBalanceStatus || 'Balanced';
                                                const isBalanced = status === 'Balanced';
                                                const isModerate = status === 'Moderate';
                                                const hasBreach = (dept.slaBreachedTasks || 0) > 0;
                                                const isHighBreach = (dept.slaBreachRate || 0) >= 15;
                                                return (
                                                    <tr key={dept.departmentName} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{dept.departmentName}</td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{dept.totalTasks}</td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--status-active)', fontWeight: 600 }}>{dept.completedTasks}</td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{dept.activeTasks}</td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', color: hasBreach ? 'var(--status-failed)' : 'var(--text-secondary)', fontWeight: 700 }}>
                                                            {dept.slaBreachedTasks}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <span className={`report-pill ${hasBreach || isHighBreach ? 'danger' : dept.slaBreachRate > 0 ? 'warning' : 'success'}`}>
                                                                {hasBreach || isHighBreach
                                                                    ? (dept.slaBreachedTasks > 0 ? `🚨 ${dept.slaBreachedTasks} SLA Breached` : `🚨 ${dept.slaBreachRate.toFixed(1)}% Breach Risk`)
                                                                    : dept.slaBreachRate > 0 ? `⚠️ ${dept.slaBreachRate.toFixed(1)}% Watch` : '✅ SLA Healthy'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--status-active)', fontWeight: 600 }}>
                                                            {dept.onTimeRate.toFixed(1)}%
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                                                            {dept.tasksPerMember.toFixed(1)}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <span className={`report-pill ${isBalanced ? 'success' : isModerate ? 'warning' : 'danger'}`}>
                                                                {isBalanced ? '🌿 ' : isModerate ? '⚠️ ' : '🔥 '}{status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Showing {Math.min((opDeptPage - 1) * REPORT_PAGE_SIZE + 1, opReport.departmentSummaries.length)}–{Math.min(opDeptPage * REPORT_PAGE_SIZE, opReport.departmentSummaries.length)} of {opReport.departmentSummaries.length} records
                                        </span>
                                        <Pagination
                                            currentPage={opDeptPage}
                                            totalPages={totalOpDeptPages}
                                            onPageChange={setOpDeptPage}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Employee Workload & Overload Watchlist */}
                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Employee Workload &amp; Overload Watchlist</h4>
                                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Identify employees who are overloaded or at risk of SLA delays.
                                        </p>
                                    </div>
                                    <span className="report-pill teal">{opReport.employeePerformanceSummary?.length || 0} Members</span>
                                </div>
                                <DataTable title=""
                                    headers={['Employee', 'Assigned Load', 'Completed', 'Overdue / At Risk', 'Completion Rate', 'Workload & Capacity Status']}
                                    loading={false} emptyMessage="No employee data for selected criteria."
                                    totalRecords={opReport.employeePerformanceSummary.length}
                                    currentPage={opEmpPage}
                                    totalPages={totalOpEmpPages}
                                    onPageChange={setOpEmpPage}
                                    pageSize={REPORT_PAGE_SIZE}>
                                    {pagedOpEmp.map(ep => {
                                        const isOverloaded = (ep.assigned || 0) >= 6;
                                        const isModerate = (ep.assigned || 0) >= 3;
                                        const hasOverdue = (ep.overdue || 0) > 0;
                                        return (
                                            <tr key={ep.employeeName}>
                                                <td style={{ fontWeight: 600 }}>{ep.employeeName}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 700 }}>{ep.assigned}</td>
                                                <td style={{ textAlign: 'center', color: 'var(--status-active)', fontWeight: 600 }}>{ep.completed}</td>
                                                <td style={{ textAlign: 'center', color: hasOverdue ? 'var(--status-failed)' : 'var(--text-secondary)', fontWeight: 700 }}>
                                                    {ep.overdue}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{ep.completionRate.toFixed(1)}%</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className={`report-pill ${isOverloaded ? 'danger' : isModerate ? 'warning' : 'success'}`}>
                                                        {isOverloaded ? <><Flame size={12} /> Overloaded ({ep.assigned})</> : isModerate ? `⚠️ Moderate (${ep.assigned})` : `🌿 Balanced (${ep.assigned})`}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </DataTable>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* 4. Performance Report */}
            {reportSubTab === 'performance-report' && (
                <>
                    <div className="card report-filter-card">
                        <div style={{ marginBottom: 12 }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                🎯 Performance &amp; Quality Indicators (5 Core KPIs)
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                                Holistic assessment of Completion Rate, On-Time Delivery, SLA Breach Rate, Rework Rate, and Output Volume.
                            </p>
                        </div>
                        <div className="report-filter-bar">
                            <div className="report-filter-fields">
                                <DateRangeEngineField
                                    dateRangeStart={prFilter.dateRangeStart}
                                    dateRangeEnd={prFilter.dateRangeEnd}
                                    onChange={(start, end) => setPrFilter(prev => ({ ...prev, dateRangeStart: start, dateRangeEnd: end }))}
                                    showFiscalYear={false}
                                />
                                <div className="field" style={{ width: 120 }}>
                                    <label>Period *</label>
                                    <select className="report-select" value={prFilter.period} onChange={e => setPrFilter(prev => ({ ...prev, period: e.target.value as any }))}>
                                        <option value="Weekly">Weekly</option>
                                        <option value="Monthly">Monthly</option>
                                        <option value="Quarterly">Quarterly</option>
                                        <option value="Annual">Annual</option>
                                    </select>
                                </div>
                                <div className="field" style={{ minWidth: 170 }}>
                                    <label>Employee Filter</label>
                                    <SearchableSelect
                                        value={prFilter.employeeId}
                                        onChange={val => setPrFilter(prev => ({ ...prev, employeeId: val }))}
                                        options={allEmployeeOptions.map(m => ({ value: m.accountId, label: m.employeeName }))}
                                        placeholder="All Employees"
                                        searchPlaceholder="Search employees..."
                                        width="100%"
                                    />
                                </div>
                                <div className="field" style={{ minWidth: 170 }}>
                                    <label>Department</label>
                                    <SearchableSelect
                                        value={prFilter.departmentId}
                                        onChange={val => setPrFilter(prev => ({ ...prev, departmentId: val }))}
                                        options={departments.map(d => ({ value: d.id, label: d.name }))}
                                        placeholder="All Departments"
                                        searchPlaceholder="Search departments..."
                                        width="100%"
                                    />
                                </div>
                            </div>
                            <div className="report-filter-actions-right">
                                {prData && (
                                    <>
                                        <button className="btn" onClick={() => handlePrExport('Excel')} disabled={prExporting} title="Export Excel">
                                            {prExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Excel
                                        </button>
                                        <button className="btn" onClick={() => handlePrExport('Pdf')} disabled={prExporting} title="Export PDF">
                                            {prExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} PDF
                                        </button>
                                        <button className="btn" onClick={() => handlePrExport('Csv')} disabled={prExporting} title="Export CSV">
                                            {prExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} CSV
                                        </button>
                                    </>
                                )}
                                <button className="btn btn-teal" onClick={handlePrGenerate} disabled={prLoading} style={{ height: 34 }}>
                                    {prLoading ? <><Loader2 size={14} className="spin" /> Generating...</> : <><Filter size={14} /> Generate Report</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {prError && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="empty-state">
                                <AlertCircle size={22} style={{ color: 'var(--danger)' }} />
                                <p>{prError}</p>
                            </div>
                        </div>
                    )}

                    {prNoRecords && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="report-empty-state">
                                <FileText size={22} />
                                <p>No completed tasks found for the selected criteria.</p>
                            </div>
                        </div>
                    )}

                    {prData && !prError && !prNoRecords && (
                        <>
                            {/* Part 2: The 5 KPIs Row or Single Employee Focus */}
                            {selectedPrEmp ? (
                                <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #4318ff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setSelectedPrEmpId('')}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                            >
                                                <ArrowLeft size={14} /> All Employees Overview
                                            </button>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    👤 {selectedPrEmp.employeeName}
                                                    <span className="report-pill teal">{selectedPrEmp.role || 'Member'}</span>
                                                    <span className="report-pill blue">{selectedPrEmp.department}</span>
                                                </h3>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                    Single Employee Performance History over {prData.period} Period ({prData.dateRangeStart?.split('T')[0]} to {prData.dateRangeEnd?.split('T')[0]})
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            {selectedPrEmp.completionRate >= 90 && selectedPrEmp.onTimeRate >= 90 ? (
                                                <span className="report-pill success" style={{ padding: '5px 12px', fontSize: 12 }}>
                                                    🌟 Top Performer (Exceeding SLA)
                                                </span>
                                            ) : selectedPrEmp.slaBreachRate > 15 ? (
                                                <span className="report-pill danger" style={{ padding: '5px 12px', fontSize: 12 }}>
                                                    ⚠️ High SLA Breach Risk (Needs Coaching)
                                                </span>
                                            ) : (
                                                <span className="report-pill blue" style={{ padding: '5px 12px', fontSize: 12 }}>
                                                    👍 Reliable &amp; Consistent Output
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Individual 5 KPIs */}
                                    <div className="stats-row stats-row-5">
                                        <StatusCard
                                            icon={<BarChart3 size={18} />}
                                            variant="teal"
                                            label="1. COMPLETION RATE"
                                            value={`${selectedPrEmp.completionRate ?? 0}%`}
                                            subtext={`${selectedPrEmp.totalCompleted} of ${selectedPrEmp.totalAssigned} assigned`}
                                        />
                                        <StatusCard
                                            icon={<CheckCircle2 size={18} />}
                                            variant="success"
                                            label="2. ON-TIME RATE"
                                            value={`${selectedPrEmp.onTimeRate ?? 0}%`}
                                            subtext="Delivered within SLA"
                                        />
                                        <StatusCard
                                            icon={<AlertCircle size={18} />}
                                            variant="danger"
                                            label="3. SLA BREACH RATE"
                                            value={`${selectedPrEmp.slaBreachRate ?? 0}%`}
                                            subtext="Tasks missed deadline"
                                        />
                                        <StatusCard
                                            icon={<RotateCcw size={18} />}
                                            variant="warning"
                                            label="4. REWORK RATE"
                                            value={`${selectedPrEmp.reworkRate ?? 0}%`}
                                            subtext="Tasks revised"
                                        />
                                        <StatusCard
                                            icon={<ClipboardList size={18} />}
                                            variant="teal"
                                            label="5. TOTAL OUTPUT"
                                            value={selectedPrEmp.totalCompleted}
                                            subtext="Completed tasks"
                                        />
                                    </div>

                                    {/* Visual Chart for this Employee */}
                                    <div className="report-charts-grid" style={{ marginTop: 16 }}>
                                        <div className="card" style={{ background: 'var(--bg-secondary, #fafbfc)' }}>
                                            <div className="card-header-layout">
                                                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Individual Quality &amp; Efficiency Breakdown</h4>
                                                <span className="report-pill teal">5 Core KPI Benchmark</span>
                                            </div>
                                            <div style={{ height: 210, marginTop: 8 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Completion', rate: selectedPrEmp.completionRate || 0, fill: '#05cd99' },
                                                        { name: 'On-Time', rate: selectedPrEmp.onTimeRate || 0, fill: '#0284c7' },
                                                        { name: 'SLA Breach', rate: selectedPrEmp.slaBreachRate || 0, fill: '#ee5d50' },
                                                        { name: 'Rework', rate: selectedPrEmp.reworkRate || 0, fill: '#ffb547' },
                                                    ]} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                                                        <Tooltip formatter={(val: any) => [`${val}%`, 'Score']} />
                                                        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                                                            {[
                                                                <Cell key="ic0" fill="#05cd99" />,
                                                                <Cell key="ic1" fill="#0284c7" />,
                                                                <Cell key="ic2" fill="#ee5d50" />,
                                                                <Cell key="ic3" fill="#ffb547" />
                                                            ]}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div className="card" style={{ background: 'var(--bg-secondary, #fafbfc)' }}>
                                            <div className="card-header-layout">
                                                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Workload &amp; Delivery Ratio</h4>
                                                <span className="report-pill blue">Volume Breakdown</span>
                                            </div>
                                            <div style={{ height: 210, marginTop: 8 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Assigned', count: selectedPrEmp.totalAssigned || 0, fill: '#4318ff' },
                                                        { name: 'Completed', count: selectedPrEmp.totalCompleted || 0, fill: '#05cd99' },
                                                        { name: 'Remaining / Active', count: Math.max(0, (selectedPrEmp.totalAssigned || 0) - (selectedPrEmp.totalCompleted || 0)), fill: '#ffb547' },
                                                    ]} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                        <YAxis tick={{ fontSize: 11 }} />
                                                        <Tooltip formatter={(val: any) => [`${val} tasks`, 'Count']} />
                                                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                                            {[
                                                                <Cell key="wb0" fill="#4318ff" />,
                                                                <Cell key="wb1" fill="#05cd99" />,
                                                                <Cell key="wb2" fill="#ffb547" />
                                                            ]}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Overall Team 5 KPIs Row */}
                                    <div className="stats-row stats-row-5" style={{ marginTop: 16 }}>
                                        <StatusCard
                                            icon={<BarChart3 size={18} />}
                                            variant="teal"
                                            label="1. COMPLETION RATE"
                                            value={`${prData.overallCompletionRate ?? prData.overallOnTimeRate ?? 0}%`}
                                            subtext="Completed vs assigned"
                                        />
                                        <StatusCard
                                            icon={<CheckCircle2 size={18} />}
                                            variant="success"
                                            label="2. ON-TIME RATE"
                                            value={`${prData.overallOnTimeRate ?? 0}%`}
                                            subtext="Delivered by deadline"
                                        />
                                        <StatusCard
                                            icon={<AlertCircle size={18} />}
                                            variant="danger"
                                            label="3. SLA BREACH RATE"
                                            value={`${prData.overallSlaBreachRate ?? 0}%`}
                                            subtext="Missed SLA window"
                                        />
                                        <StatusCard
                                            icon={<RotateCcw size={18} />}
                                            variant="warning"
                                            label="4. REWORK RATE"
                                            value={`${prData.overallReworkRate ?? 0}%`}
                                            subtext="Push-back / revised"
                                        />
                                        <StatusCard
                                            icon={<ClipboardList size={18} />}
                                            variant="teal"
                                            label="5. TOTAL COMPLETED"
                                            value={prData.totalCompletedTasks}
                                            subtext="Finished output"
                                        />
                                    </div>

                                    {/* Visual Charts for Performance Report */}
                                    <div className="report-charts-grid">
                                        <div className="card">
                                            <div className="card-header-layout">
                                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Core 5 KPIs Summary (%)</h4>
                                                <span className="report-pill teal">KPI Index</span>
                                            </div>
                                            <div style={{ height: 230, marginTop: 8 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Completion', rate: prData.overallCompletionRate ?? prData.overallOnTimeRate ?? 0, fill: '#05cd99' },
                                                        { name: 'On-Time', rate: prData.overallOnTimeRate ?? 0, fill: '#0284c7' },
                                                        { name: 'SLA Breach', rate: prData.overallSlaBreachRate ?? 0, fill: '#ee5d50' },
                                                        { name: 'Rework', rate: prData.overallReworkRate ?? 0, fill: '#ffb547' },
                                                    ]} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                                                        <Tooltip formatter={(val: any) => [`${val}%`, 'Rate']} />
                                                        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                                                            {[
                                                                <Cell key="c0" fill="#05cd99" />,
                                                                <Cell key="c1" fill="#0284c7" />,
                                                                <Cell key="c2" fill="#ee5d50" />,
                                                                <Cell key="c3" fill="#ffb547" />
                                                            ]}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div className="card">
                                            <div className="card-header-layout">
                                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Employee Performance Comparison</h4>
                                                <span className="report-pill blue">On-Time vs Completion</span>
                                            </div>
                                            <div style={{ height: 230, marginTop: 8 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={prData.employeeBreakdown?.slice(0, 6).map((e: any) => ({
                                                        name: e.employeeName.split(' ')[0],
                                                        'Completion %': e.completionRate || 0,
                                                        'On-Time %': e.onTimeRate || 0,
                                                    })) || []} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                                                        <Tooltip formatter={(val: any) => [`${val}%`, 'Rate']} />
                                                        <Legend />
                                                        <Bar dataKey="Completion %" fill="#05cd99" radius={[4, 4, 0, 0]} />
                                                        <Bar dataKey="On-Time %" fill="#4318ff" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* All Employees Breakdown Table */}
                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Employee Breakdown &amp; 5 KPIs ({prData.period})</h4>
                                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Click any employee to view their individual progress over time.
                                        </p>
                                    </div>
                                    <span className="report-pill blue">{prData.employeeBreakdown?.length || 0} employees</span>
                                </div>
                                {prData.employeeBreakdown && prData.employeeBreakdown.length > 0 ? (
                                    <>
                                        <table className="table-card-data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '16%' }}>Employee</th>
                                                    <th style={{ width: '12%' }}>Department</th>
                                                    <th style={{ width: '10%' }}>Role</th>
                                                    <th style={{ width: '7%', textAlign: 'center' }}>Assigned</th>
                                                    <th style={{ width: '7%', textAlign: 'center' }}>Completed</th>
                                                    <th style={{ width: '9%', textAlign: 'center' }}>Completion Rate</th>
                                                    <th style={{ width: '9%', textAlign: 'center' }}>On-Time Rate</th>
                                                    <th style={{ width: '9%', textAlign: 'center' }}>SLA Breach Rate</th>
                                                    <th style={{ width: '8%', textAlign: 'center' }}>Rework Rate</th>
                                                    <th style={{ width: '13%', textAlign: 'center' }}>Individual Deep-Dive</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedPrEmp.map((kpi: any) => {
                                                    const isSelected = selectedPrEmpId === kpi.employeeId;
                                                    const completionRate = kpi.completionRate ?? 0;
                                                    const onTimeRate = kpi.onTimeRate ?? 0;
                                                    const breachRate = kpi.slaBreachRate ?? 0;
                                                    const reworkRate = kpi.reworkRate ?? 0;
                                                    return (
                                                        <tr key={kpi.employeeId} style={{
                                                            borderBottom: '1px solid var(--border)',
                                                            backgroundColor: isSelected ? 'rgba(67, 24, 255, 0.05)' : undefined
                                                        }}>
                                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                                    <UserCheck size={14} style={{ color: isSelected ? '#4318ff' : 'var(--text-secondary)' }} />
                                                                    {kpi.employeeName}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12 }}>{kpi.department}</td>
                                                            <td style={{ padding: '8px 10px', fontSize: 12 }}>{kpi.role}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{kpi.totalAssigned}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--status-active)', fontWeight: 600 }}>{kpi.totalCompleted}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${completionRate >= 80 ? 'success' : 'warning'}`}>
                                                                    {completionRate}%
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${onTimeRate >= 80 ? 'success' : onTimeRate >= 50 ? 'warning' : 'danger'}`}>
                                                                    {onTimeRate}%
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${breachRate > 0 ? 'danger' : 'neutral'}`}>
                                                                    {breachRate}%
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <span className={`report-pill ${reworkRate > 0 ? 'warning' : 'neutral'}`}>
                                                                    {reworkRate}%
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <button
                                                                    className="btn btn-secondary btn-sm"
                                                                    style={{
                                                                        padding: '3px 8px', fontSize: 11,
                                                                        background: isSelected ? 'var(--teal, #00A99D)' : undefined,
                                                                        borderColor: isSelected ? 'var(--teal, #00A99D)' : undefined,
                                                                        color: isSelected ? '#fff' : undefined
                                                                    }}
                                                                    onClick={() => setSelectedPrEmpId(isSelected ? '' : kpi.employeeId)}
                                                                >
                                                                    {isSelected ? '✓ Viewing' : '🔍 Deep-Dive'}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                Showing {Math.min((prEmpPage - 1) * REPORT_PAGE_SIZE + 1, prData.employeeBreakdown.length)}–{Math.min(prEmpPage * REPORT_PAGE_SIZE, prData.employeeBreakdown.length)} of {prData.employeeBreakdown.length} records
                                            </span>
                                            <Pagination
                                                currentPage={prEmpPage}
                                                totalPages={totalPrEmpPages}
                                                onPageChange={setPrEmpPage}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="empty-state" style={{ padding: '32px 0' }}>
                                        <CheckCircle2 size={22} />
                                        <p>No completed tasks found for the selected criteria.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* 5. Financial Report (FOMS) */}
            {reportSubTab === 'foms-export' && (
                <>
                    <div className="card report-filter-card">
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                    💰 Financial Report &amp; FOMS Ledger
                                </h3>
                                <span className="report-pill blue">FOMS Financial Ledger</span>
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                                Speedex Operations &amp; Field Operations Management System (FOMS) ledger. Track billed charges, collections, outstanding balances, and invoice settlements.
                            </p>
                        </div>
                        <div className="report-filter-bar">
                            <div className="report-filter-fields">
                                <DateRangeEngineField
                                    dateRangeStart={fomsFilter.dateRangeStart}
                                    dateRangeEnd={fomsFilter.dateRangeEnd}
                                    onChange={(start, end) => setFomsFilter(prev => ({ ...prev, dateRangeStart: start, dateRangeEnd: end }))}
                                    showFiscalYear={false}
                                    activeChunk={fomsChunk}
                                    onChunkChange={handleFomsChunkChange}
                                    yearType={fomsYearType}
                                    onYearTypeChange={handleFomsYearTypeChange}
                                />
                                <div className="field" style={{ width: 170 }}>
                                    <label>Department</label>
                                    <select className="report-select"
                                        value={fomsFilter.departmentId}
                                        onChange={e => setFomsFilter(prev => ({ ...prev, departmentId: e.target.value }))}>
                                        <option value="">All Departments</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field" style={{ width: 150 }}>
                                    <label>Invoice Status</label>
                                    <select className="report-select"
                                        value={fomsFilter.status}
                                        onChange={e => setFomsFilter(prev => ({ ...prev, status: e.target.value }))}>
                                        <option value="All">All Invoices</option>
                                        <option value="Paid">Paid</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Overdue">Overdue</option>
                                    </select>
                                </div>
                                <div className="field fiscal-toggle-field" style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                                        Accounting Cycle
                                    </label>
                                    <div className="fiscal-toggle-pill-group">
                                        <button
                                            type="button"
                                            className={`fiscal-toggle-btn${fomsYearType === 'Calendar' ? ' active' : ''}`}
                                            onClick={() => handleFomsYearTypeChange('Calendar')}
                                            title="Standard Calendar: Jan 1 – Dec 31"
                                        >
                                            <Calendar size={15} />
                                            <span>Calendar Year</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`fiscal-toggle-btn${fomsYearType === 'Fiscal' ? ' active' : ''}`}
                                            onClick={() => handleFomsYearTypeChange('Fiscal')}
                                            title="Speedex Accounting Year: Oct 1 – Sep 30"
                                        >
                                            <Building size={15} />
                                            <span>Fiscal Year (Speedex)</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="report-filter-actions-right">
                                {financialReport && (
                                    <>
                                        <button className="btn" onClick={() => handleFinancialExport('Excel')} disabled={financialExporting} title="Export Excel">
                                            {financialExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Excel
                                        </button>
                                        <button className="btn" onClick={() => handleFinancialExport('Pdf')} disabled={financialExporting} title="Export PDF">
                                            {financialExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} PDF
                                        </button>
                                        <button className="btn" onClick={() => handleFinancialExport('Csv')} disabled={financialExporting} title="Export CSV">
                                            {financialExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} CSV
                                        </button>
                                        <button className="btn" onClick={handleLegacyFomsTaskExport} disabled={financialExporting} title="Export task records for Field Operations">
                                            <FileText size={14} /> Tasks CSV
                                        </button>
                                    </>
                                )}
                                <button className="btn btn-teal" onClick={handleFinancialGenerate} disabled={financialLoading} style={{ height: 34 }}>
                                    {financialLoading ? <><Loader2 size={14} className="spin" /> Generating...</> : <><Filter size={14} /> Generate Report</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {financialError && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="empty-state">
                                <AlertCircle size={22} style={{ color: 'var(--danger)' }} />
                                <p>{financialError}</p>
                            </div>
                        </div>
                    )}

                    {financialNoRecords && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="report-empty-state">
                                <FileText size={22} />
                                <p>No financial records found for the selected criteria.</p>
                            </div>
                        </div>
                    )}

                    {financialReport && (
                        <>
                            <div className="stats-row stats-row-5" style={{ marginTop: 16 }}>
                                <StatusCard
                                    icon={<DollarSign size={18} />}
                                    variant="teal"
                                    label="TOTAL BILLED"
                                    value={`₱${(financialReport.totalBilled || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    subtext="Invoiced amount"
                                />
                                <StatusCard
                                    icon={<CheckCircle2 size={18} />}
                                    variant="success"
                                    label="TOTAL COLLECTED"
                                    value={`₱${(financialReport.totalCollected || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    subtext="Received payments"
                                />
                                <StatusCard
                                    icon={<AlertCircle size={18} />}
                                    variant="warning"
                                    label="OUTSTANDING BALANCE"
                                    value={`₱${(financialReport.totalOutstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    subtext="Pending payment"
                                />
                                <StatusCard
                                    icon={<BarChart3 size={18} />}
                                    variant="success"
                                    label="COLLECTION RATE"
                                    value={`${financialReport.collectionRate.toFixed(1)}%`}
                                    subtext="Payment recovery"
                                />
                                <StatusCard
                                    icon={<FileText size={18} />}
                                    variant="teal"
                                    label="TOTAL INVOICES"
                                    value={financialReport.totalInvoices}
                                    subtext={`${financialReport.overdueInvoicesCount} overdue`}
                                />
                            </div>

                            {/* Visual Charts for Financial Report */}
                            <div className="report-charts-grid">
                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Revenue &amp; Collection Overview</h4>
                                        <span className="report-pill teal">Financial Volume</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={[
                                                { name: 'Billed', amount: financialReport.totalBilled || 0, fill: '#0284c7' },
                                                { name: 'Collected', amount: financialReport.totalCollected || 0, fill: '#05cd99' },
                                                { name: 'Outstanding', amount: financialReport.totalOutstanding || 0, fill: '#ffb547' },
                                            ]} margin={{ top: 10, right: 10, left: -5, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                                                <Tooltip formatter={(val: any) => [`₱${Number(val).toLocaleString()}`, 'Amount']} />
                                                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                                                    {[
                                                        <Cell key="b0" fill="#0284c7" />,
                                                        <Cell key="b1" fill="#05cd99" />,
                                                        <Cell key="b2" fill="#ffb547" />
                                                    ]}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-header-layout">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Invoice Payment Status</h4>
                                        <span className="report-pill blue">Settlement Status</span>
                                    </div>
                                    <div style={{ height: 230, marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Paid', value: financialReport.paidInvoicesCount || (financialReport.invoices?.filter(i => i.paymentStatus === 'Paid').length) || 0 },
                                                        { name: 'Pending', value: financialReport.pendingInvoicesCount || (financialReport.invoices?.filter(i => i.paymentStatus === 'Pending').length) || 0 },
                                                        { name: 'Overdue', value: financialReport.overdueInvoicesCount || 0 },
                                                    ].filter(d => d.value > 0)}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={50}
                                                    outerRadius={75}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                >
                                                    <Cell fill="#05cd99" />
                                                    <Cell fill="#ffb547" />
                                                    <Cell fill="#ee5d50" />
                                                </Pie>
                                                <Tooltip formatter={(val: any) => [`${val} invoices`, 'Count']} />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Speedex Financial Invoices &amp; FOMS Ledger</h4>
                                    <span className="report-pill blue">{financialReport.invoices?.length || 0} Invoices</span>
                                </div>
                                {financialReport.invoices && financialReport.invoices.length > 0 ? (
                                    <>
                                        <table className="table-card-data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '10%' }}>Invoice #</th>
                                                    <th style={{ width: '10%' }}>FOMS Ref</th>
                                                    <th style={{ width: '13%' }}>Client Account</th>
                                                    <th style={{ width: '9%' }}>Department</th>
                                                    <th style={{ width: '8%' }}>Billing Date</th>
                                                    <th style={{ width: '8%' }}>Due Date</th>
                                                    <th style={{ width: '10%', textAlign: 'right' }}>Amount Billed</th>
                                                    <th style={{ width: '10%', textAlign: 'right' }}>Amount Paid</th>
                                                    <th style={{ width: '10%', textAlign: 'right' }}>Balance</th>
                                                    <th style={{ width: '6%', textAlign: 'center' }}>Status</th>
                                                    <th style={{ width: '6%' }}>Method</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedInvoices.map((inv) => (
                                                    <tr key={inv.invoiceNumber} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '8px 10px', fontWeight: 600, fontFamily: 'monospace' }}>{inv.invoiceNumber}</td>
                                                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 11.5 }}>{inv.fomsReference}</td>
                                                        <td style={{ padding: '8px 10px' }}>{inv.clientAccount}</td>
                                                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12 }}>{inv.department}</td>
                                                        <td style={{ padding: '8px 10px', fontSize: 11.5 }}>{inv.billingDate}</td>
                                                        <td style={{ padding: '8px 10px', fontSize: 11.5 }}>{inv.dueDate}</td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                                                            ₱{inv.amountBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--status-active)' }}>
                                                            ₱{inv.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: inv.outstandingBalance > 0 ? 'var(--status-failed)' : 'var(--text-secondary)' }}>
                                                            ₱{inv.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <span className={`report-pill ${inv.paymentStatus === 'Paid' ? 'success' : inv.paymentStatus === 'Pending' ? 'warning' : 'danger'}`}>
                                                                {inv.paymentStatus}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--text-secondary)' }}>{inv.paymentMethod}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: 'var(--bg-secondary, #fafbfc)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                                                    <td colSpan={6} style={{ padding: '8px 10px', textAlign: 'right' }}>Total ({financialReport.invoices.length} Invoices):</td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--primary)' }}>
                                                        ₱{(financialReport.totalBilled || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--status-active)' }}>
                                                        ₱{(financialReport.totalCollected || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: (financialReport.totalOutstanding || 0) > 0 ? 'var(--status-failed)' : 'var(--text-secondary)' }}>
                                                        ₱{(financialReport.totalOutstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                                        {financialReport.collectionRate?.toFixed(1)}% Collected
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                Showing {Math.min((financialPage - 1) * REPORT_PAGE_SIZE + 1, financialReport.invoices.length)}–{Math.min(financialPage * REPORT_PAGE_SIZE, financialReport.invoices.length)} of {financialReport.invoices.length} records
                                            </span>
                                            <Pagination
                                                currentPage={financialPage}
                                                totalPages={totalFinancialPages}
                                                onPageChange={setFinancialPage}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="empty-state" style={{ padding: '32px 0' }}>
                                        <CheckCircle2 size={22} />
                                        <p>No invoice records for selected criteria.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

// --- Profile Tab --------------------------------------------------------------

function ProfileTab() {
    const { success, error } = useToast();
    const employeeId = localStorage.getItem('employeeId') ?? '';
    const firstName = localStorage.getItem('firstName') ?? '';
    const middleName = localStorage.getItem('middleName') ?? '';
    const lastName = localStorage.getItem('lastName') ?? '';
    const employeeNameStored = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const profileRole = localStorage.getItem('role') ?? '';
    const displayProfileRole = profileRole === 'Manager' ? 'Manager' : 'Coordinator';
    const employeeContact = localStorage.getItem('contactNumber') ?? '';
    const storedEmail = localStorage.getItem('email') ?? '';

    // -- Profile edit state ---------------------------------------------------
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({
        firstName: firstName,
        middleName: middleName,
        lastName: lastName,
        contactNumber: employeeContact,
        email: storedEmail,
    });
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [profileSaving, setProfileSaving] = useState(false);

    // -- Password Gate state --------------------------------------------------
    const [passwordGate, setPasswordGate] = useState(false);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [showGatePassword, setShowGatePassword] = useState(false);

    // -- Password change state ------------------------------------------------
    const [editingPassword, setEditingPassword] = useState(false);
    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwError, setPwError] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        const t = localStorage.getItem('authToken');
        if (!t) return;
        api.get('/api/Auth/me')
            .then(res => res.data)
            .catch(() => null)
            .then(resJson => {
                if (!resJson || !resJson.isSuccess || !resJson.data) return;
                const data = resJson.data;
                const contact = data.contactNumber ?? data.contact ?? data.phoneNumber ?? '';
                const email = data.email ?? '';
                const firstNameVal = data.firstName ?? '';
                const middleNameVal = data.middleName ?? '';
                const lastNameVal = data.lastName ?? '';
                const suffixVal = data.suffix ?? '';

                if (firstNameVal) localStorage.setItem('firstName', firstNameVal);
                if (middleNameVal) localStorage.setItem('middleName', middleNameVal);
                if (lastNameVal) localStorage.setItem('lastName', lastNameVal);
                if (suffixVal) localStorage.setItem('suffix', suffixVal);
                if (contact) localStorage.setItem('contactNumber', contact);
                if (email) localStorage.setItem('email', email);

                setProfileForm(prev => ({
                    ...prev,
                    firstName: firstNameVal || prev.firstName,
                    middleName: middleNameVal || prev.middleName,
                    lastName: lastNameVal || prev.lastName,
                    contactNumber: contact || prev.contactNumber,
                    email: email || prev.email,
                }));
            })
            .catch(() => { });
    }, []);

    // -- "Save Changes" clicked: validate first, then open gate ---------------
    const requestSave = () => {
        if (!profileForm.firstName.trim() || !/^[A-Za-z\s]{1,50}$/.test(profileForm.firstName.trim())) {
            error('Given Name must contain letters only and be up to 50 characters.');
            return;
        }
        if (profileForm.middleName?.trim() && !/^[A-Za-z\s]{1,50}$/.test(profileForm.middleName.trim())) {
            error('Middle Name must contain letters only and be up to 50 characters.');
            return;
        }
        if (!profileForm.lastName.trim() || !/^[A-Za-z\s]{1,50}$/.test(profileForm.lastName.trim())) {
            error('Last Name must contain letters only and be up to 50 characters.');
            return;
        }
        const email = profileForm.email.trim();
        if (!email || email.length < 12 || email.length > 64 || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
            error('Enter a valid Email Address (12-64 characters, local-part@domain).');
            return;
        }
        if (!profileForm.contactNumber.trim() || !/^[0-9]{11}$/.test(profileForm.contactNumber.trim())) {
            error('Contact Number must be exactly 11 digits.');
            return;
        }
        setGatePassword('');
        setGateError('');
        setShowGatePassword(false);
        setPasswordGate(true);
    };

    // -- Gate confirmed: verify password then save ----------------------------
    const handleGateConfirm = async () => {
        if (!gatePassword) { setGateError('Please enter your password.'); return; }
        setGateLoading(true);
        setGateError('');
        try {
            const verifyRes = await api.post('/api/Auth/verify-password', {
                employeeID: employeeId,
                password: gatePassword,
            });
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

    // -- Actual save (only called after password verified) --------------------
    const performSave = async () => {
        setProfileSaving(true);
        try {
            const fd = new FormData();
            fd.append('firstName', profileForm.firstName.trim());
            fd.append('middleName', profileForm.middleName.trim());
            fd.append('lastName', profileForm.lastName.trim());
            fd.append('contactNumber', profileForm.contactNumber.trim());
            fd.append('email', profileForm.email.trim());
            await api.uploadPut('/api/Profile/update-profile', fd);
            localStorage.setItem('firstName', profileForm.firstName.trim());
            localStorage.setItem('middleName', profileForm.middleName.trim());
            localStorage.setItem('lastName', profileForm.lastName.trim());
            localStorage.setItem('contactNumber', profileForm.contactNumber.trim());
            localStorage.setItem('email', profileForm.email.trim());
            setEditingProfile(false);
            success('Profile updated successfully.');
        } catch (err: any) {
            error(err.message ?? 'Something went wrong.');
        } finally {
            setProfileSaving(false);
        }
    };

    const handlePwChange = (key: keyof typeof pwForm) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setPwForm(prev => ({ ...prev, [key]: e.target.value }));
            setPwError('');
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

    const handleProfileChange = (key: keyof typeof profileForm) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            setProfileForm(prev => ({ ...prev, [key]: val }));
            validateField(key, val);
        };

    const handlePwSave = async () => {
        if (!pwForm.current) { setPwError('Current password is required.'); return; }
        if (pwForm.next.length < 15) { setPwError('New password must be at least 15 characters.'); return; }
        if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
        setPwSaving(true);
        try {
            await api.post('/api/Auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.next, confirmPassword: pwForm.confirm });
            success('Password changed successfully!');
            setEditingPassword(false);
            setPwForm({ current: '', next: '', confirm: '' });
        } catch (err: any) {
            setPwError(err.message ?? 'Something went wrong.');
        } finally {
            setPwSaving(false);
        }
    };

    const displayName = [profileForm.firstName, profileForm.middleName, profileForm.lastName]
        .filter(Boolean).join(' ') || 'Coordinator';
    const displayContact = profileForm.contactNumber || employeeContact;

    return (
        <div className="dashboard-content">

            {/* -- Password Gate Modal ---------------------------------------- */}
            {passwordGate && (
                <FormModal isOpen={passwordGate} onClose={() => setPasswordGate(false)}
                    title="Confirm Your Identity" subtitle="Enter your password to save your profile changes." size="sm"
                    footer={
                        <>
                            <button className="btn" onClick={() => setPasswordGate(false)} disabled={gateLoading}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleGateConfirm} disabled={gateLoading || !gatePassword}>
                                {gateLoading ? <><Loader2 size={13} className="spin" /> Verifying…</> : <><Shield size={13} /> Confirm & Save</>}
                            </button>
                        </>
                    }
                >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px', gap: 8 }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,169,157,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            )}

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1.5fr' }}>

                {/* -- Profile Card ------------------------------------------- */}
                <div className="card">
                    <div className="card-header-layout">
                        <h3>My Profile</h3>
                        {!editingProfile && (
                            <button
                                className="btn btn-primary"
                                style={{ fontSize: 12, padding: '6px 14px', width: 'fit-content', flexShrink: 0, marginLeft: 'auto' }}
                                onClick={() => {
                                    setEditingProfile(true);
                                    ['firstName', 'middleName', 'lastName', 'email', 'contactNumber'].forEach(k => validateField(k, (profileForm as any)[k]));
                                }}
                            >
                                <Pencil size={12} /> Edit Profile
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px', gap: 10 }}>
                        <div
                            className="avatar-circle large"
                            style={{
                                width: 72, height: 72, fontSize: 28,
                                background: 'linear-gradient(135deg, #4318ff, #6a5cff)',
                                boxShadow: '0 8px 20px rgba(67,24,255,0.28)',
                            }}
                        >
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</h4>
                            <StatusBadge status="Active" />
                        </div>
                    </div>

                    {editingProfile ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="field">
                                <label>First Name <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                                <input
                                    type="text"
                                    value={profileForm.firstName}
                                    onChange={handleProfileChange('firstName')}
                                    placeholder="Enter first name"
                                    maxLength={50}
                                    style={validationErrors['firstName'] ? { borderColor: 'var(--status-failed)' } : {}}
                                />
                                {validationErrors['firstName'] && <span style={{ color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>{validationErrors['firstName']}</span>}
                            </div>
                            <div className="field">
                                <label>Middle Name <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>(optional)</span></label>
                                <input
                                    type="text"
                                    value={profileForm.middleName}
                                    onChange={handleProfileChange('middleName')}
                                    placeholder="Enter middle name"
                                    maxLength={50}
                                    style={validationErrors['middleName'] ? { borderColor: 'var(--status-failed)' } : {}}
                                />
                                {validationErrors['middleName'] && <span style={{ color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>{validationErrors['middleName']}</span>}
                            </div>
                            <div className="field">
                                <label>Last Name <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                                <input
                                    type="text"
                                    value={profileForm.lastName}
                                    onChange={handleProfileChange('lastName')}
                                    placeholder="Enter last name"
                                    maxLength={50}
                                    style={validationErrors['lastName'] ? { borderColor: 'var(--status-failed)' } : {}}
                                />
                                {validationErrors['lastName'] && <span style={{ color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>{validationErrors['lastName']}</span>}
                            </div>
                            <div className="field">
                                <label>Email Address <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                                <input
                                    type="email"
                                    value={profileForm.email}
                                    onChange={handleProfileChange('email')}
                                    placeholder="e.g. name@company.com"
                                    style={validationErrors['email'] ? { borderColor: 'var(--status-failed)' } : {}}
                                />
                                {validationErrors['email'] && <span style={{ color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>{validationErrors['email']}</span>}
                            </div>
                            <div className="field">
                                <label>Contact Number</label>
                                <input
                                    type="tel"
                                    value={profileForm.contactNumber}
                                    onChange={handleProfileChange('contactNumber')}
                                    placeholder="e.g. 09170000000"
                                    style={validationErrors['contactNumber'] ? { borderColor: 'var(--status-failed)' } : {}}
                                />
                                {validationErrors['contactNumber'] && <span style={{ color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>{validationErrors['contactNumber']}</span>}
                            </div>
                            <div className="detail-grid" style={{ marginTop: 4 }}>
                                <div className="detail-item">
                                    <span className="detail-label">Employee ID</span>
                                    <span className="detail-value">{employeeId || '—'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Role</span>
                                    <span className="detail-value">Coordinator</span>
                                </div>
                            </div>
                            <div className="modal-actions" style={{ padding: '4px 0 0' }}>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        setEditingProfile(false);
                                        setProfileForm({
                                            firstName: localStorage.getItem('firstName') ?? '',
                                            middleName: localStorage.getItem('middleName') ?? '',
                                            lastName: localStorage.getItem('lastName') ?? '',
                                            contactNumber: employeeContact,
                                            email: storedEmail,
                                        });
                                    }}
                                    disabled={profileSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={requestSave}
                                    disabled={profileSaving}
                                >
                                    {profileSaving
                                        ? <><Loader2 size={13} className="spin" /> Saving…</>
                                        : <><Save size={13} /> Save Changes</>
                                    }
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="detail-grid" style={{ marginTop: 4 }}>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <Hash size={11} style={{ display: 'inline', marginRight: 4 }} />Employee ID
                                </span>
                                <span className="detail-value">{employeeId || '—'}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <UserCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} />First Name
                                </span>
                                <span className="detail-value">{profileForm.firstName || '—'}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <UserCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} />Middle Name
                                </span>
                                <span className="detail-value">{profileForm.middleName || '—'}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <UserCircle2 size={11} style={{ display: 'inline', marginRight: 4 }} />Last Name
                                </span>
                                <span className="detail-value">{profileForm.lastName || '—'}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <Mail size={11} style={{ display: 'inline', marginRight: 4 }} />Email Address
                                </span>
                                <span className="detail-value">{profileForm.email || '—'}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <Shield size={11} style={{ display: 'inline', marginRight: 4 }} />Role
                                </span>
                                <span className="detail-value">Coordinator</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">
                                    <Phone size={11} style={{ display: 'inline', marginRight: 4 }} />Contact
                                </span>
                                <span className="detail-value">{displayContact || '—'}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* -- Security Card ------------------------------------------- */}
                <div className="card">
                    <div className="card-header-layout">
                        <h3>Security Settings</h3>
                        {!editingPassword && (
                            <button
                                className="btn btn-primary"
                                style={{ fontSize: 12, padding: '6px 14px', width: 'fit-content', flexShrink: 0, marginLeft: 'auto' }}
                                onClick={() => setEditingPassword(true)}
                            >
                                <Lock size={12} /> Change Password
                            </button>
                        )}
                    </div>

                    {!editingPassword ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                            <div className="system-status-item" style={{ cursor: 'default' }}>
                                <div className="system-icon bg-success"><CheckCircle2 size={16} /></div>
                                <div className="system-info">
                                    <span className="system-name">Password</span>
                                    <span className="system-detail">Last updated recently</span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-active)', background: 'rgba(5,205,153,0.12)', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                                    Secure
                                </span>
                            </div>
                            <div style={{ height: 1, background: 'var(--border)' }} />
                            <div className="system-status-item" style={{ cursor: 'default' }}>
                                <div className="system-icon bg-primary"><Shield size={16} /></div>
                                <div className="system-info">
                                    <span className="system-name">Role Permissions</span>
                                    <span className="system-detail">Operations access granted</span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'rgba(67,24,255,0.1)', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                                    {displayProfileRole}
                                </span>
                            </div>
                            <div style={{ height: 1, background: 'var(--border)' }} />
                            <div className="system-status-item" style={{ cursor: 'default' }}>
                                <div className="system-icon bg-warning"><AlertCircle size={16} /></div>
                                <div className="system-info">
                                    <span className="system-name">Active Session</span>
                                    <span className="system-detail">Logged in on this device</span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-pending)', background: 'rgba(255,181,71,0.15)', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                                    Live
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="modal-form" style={{ padding: '4px 0 0' }}>
                            {pwError && (
                                <div className="form-api-error" style={{ marginBottom: 8 }}>
                                    <AlertCircle size={14} /><span>{pwError}</span>
                                </div>
                            )}
                            <div className="field">
                                <label>Current Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showCurrent ? 'text' : 'password'}
                                        value={pwForm.current}
                                        onChange={handlePwChange('current')}
                                        placeholder="Enter current password"
                                        style={{ paddingRight: 40, width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(p => !p)}
                                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                                        tabIndex={-1}
                                    >
                                        {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                            <div className="field">
                                <label>New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showNext ? 'text' : 'password'}
                                        value={pwForm.next}
                                        onChange={handlePwChange('next')}
                                        placeholder="At least 6 characters"
                                        style={{ paddingRight: 40, width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNext(p => !p)}
                                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                                        tabIndex={-1}
                                    >
                                        {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                {pwForm.next.length > 0 && (
                                    <div style={{ marginTop: 6 }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {[1, 2, 3].map(level => (
                                                <div key={level} style={{
                                                    flex: 1, height: 4, borderRadius: 2,
                                                    background: pwForm.next.length >= level * 4
                                                        ? level === 1 ? 'var(--status-failed)' : level === 2 ? 'var(--status-pending)' : 'var(--status-active)'
                                                        : '#e9edf7',
                                                    transition: 'background 0.2s',
                                                }} />
                                            ))}
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                                            {pwForm.next.length < 4 ? 'Weak' : pwForm.next.length < 8 ? 'Fair' : 'Strong'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="field">
                                <label>Confirm New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showConfirm ? 'text' : 'password'}
                                        value={pwForm.confirm}
                                        onChange={handlePwChange('confirm')}
                                        placeholder="Re-enter new password"
                                        style={{ paddingRight: 40, width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(p => !p)}
                                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                                        tabIndex={-1}
                                    >
                                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                {pwForm.confirm.length > 0 && pwForm.next !== pwForm.confirm && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed)', marginTop: 3, display: 'block' }}>
                                        Passwords do not match
                                    </span>
                                )}
                                {pwForm.confirm.length > 0 && pwForm.next === pwForm.confirm && (
                                    <span style={{ fontSize: 11, color: 'var(--status-active)', marginTop: 3, display: 'block' }}>
                                        ? Passwords match
                                    </span>
                                )}
                            </div>
                            <div className="modal-actions" style={{ padding: '4px 0 0' }}>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        setEditingPassword(false);
                                        setPwError('');
                                        setPwForm({ current: '', next: '', confirm: '' });
                                    }}
                                    disabled={pwSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handlePwSave}
                                    disabled={pwSaving}
                                >
                                    {pwSaving
                                        ? <><Loader2 size={13} className="spin" /> Saving…</>
                                        : <><Save size={13} /> Update Password</>
                                    }
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* -- Account Overview ------------------------------------------- */}
            <div className="card">
                <div className="card-header-layout"><h3>Account Overview</h3></div>
                <div className="system-status-list">
                    {[
                        { icon: Users, bg: 'bg-primary', name: 'Manage Employees', detail: 'Register, edit, and deactivate accounts' },
                        { icon: Truck, bg: 'bg-warning', name: 'Delivery Oversight', detail: 'View and manage all deliveries' },
                        { icon: BarChart3, bg: 'bg-success', name: 'Analytics & Reports', detail: 'Access system-wide reports' },
                    ].map(({ icon: Icon, bg, name, detail }) => (
                        <div key={name} className="system-status-item">
                            <div className={`system-icon ${bg}`}><Icon size={16} /></div>
                            <div className="system-info">
                                <span className="system-name">{name}</span>
                                <span className="system-detail">{detail}</span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', background: '#eef2ff', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                                Full Access
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


// --- Modal: Reopen Approval --------------------------------------------------

interface ReopenApprovalModalProps {
    request: ReopenRequest;
    onApprove: (requestId: string, remarks: string) => void;
    onReject: (requestId: string, remarks: string) => void;
    onClose: () => void;
}

const ReopenApprovalModal: React.FC<ReopenApprovalModalProps> = ({ request, onApprove, onReject, onClose }) => {
    const [decision, setDecision] = useState<'Approve' | 'Reject' | ''>('');
    const [remarks, setRemarks] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!decision) errs.decision = 'Please select an approval decision.';
        if (!remarks.trim()) errs.remarks = 'Admin remarks are required.';
        else if (remarks.trim().length > 500) errs.remarks = 'Remarks must not exceed 500 characters.';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = () => {
        if (!validate()) return;
        setSubmitting(true);
        if (decision === 'Approve') {
            onApprove(request.requestId, remarks.trim());
        } else {
            onReject(request.requestId, remarks.trim());
        }
        setSubmitting(false);
    };

    return (
        <FormModal isOpen onClose={onClose} title="Reopen Task Approval" subtitle="Review and decide on the reopening request." size="md" confirmOnCancel={true}
            footer={
                <>
                    <div style={{ flex: 1 }} />
                    <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !decision}>
                        {submitting ? <><Loader2 size={13} className="spin" /> Submitting…</> : <><ThumbsUp size={13} /> Submit Decision</>}
                    </button>
                </>
            }
        >
            <div className="reopen-info-grid">
                <div className="reopen-info-item">
                    <span className="reopen-info-label">Request Ref</span>
                    <span className="reopen-info-value" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{request.referenceNumber || request.requestId.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="reopen-info-item">
                    <span className="reopen-info-label">Task ID</span>
                    <span className="reopen-info-value">{request.taskId}</span>
                </div>
                <div className="reopen-info-item">
                    <span className="reopen-info-label">Task Title</span>
                    <span className="reopen-info-value">{request.taskTitle}</span>
                </div>
                <div className="reopen-info-item">
                    <span className="reopen-info-label">Employee</span>
                    <span className="reopen-info-value">{request.employeeName}</span>
                </div>
                <div className="reopen-info-item">
                    <span className="reopen-info-label">Current Status</span>
                    <span className={statusBadgeClass(request.currentStatus)} style={{ fontSize: 11 }}>{request.currentStatus}</span>
                </div>
                <div className="reopen-info-item">
                    <span className="reopen-info-label">Submitted</span>
                    <span className="reopen-info-value">{fmtDate(request.submittedAt)}</span>
                </div>
            </div>

            <div className="field">
                <label>Reopening Reason</label>
                <div className="reopen-reason-box">{request.reason}</div>
            </div>

            {request.supportingEvidence && (
                <div className="field">
                    <label>Supporting Evidence</label>
                    <div className="reopen-evidence-box">
                        <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>{request.supportingEvidence}</span>
                    </div>
                </div>
            )}

            <div className="field">
                <label>Approval Decision <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                <select value={decision}
                    onChange={e => { setDecision(e.target.value as 'Approve' | 'Reject'); setErrors(prev => ({ ...prev, decision: '' })); }}
                    className={errors.decision ? 'input-error' : ''}>
                    <option value="">Select decision</option>
                    <option value="Approve">Approve</option>
                    <option value="Reject">Reject</option>
                </select>
                {errors.decision && (
                    <span style={{ fontSize: 11, color: 'var(--status-failed)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={11} />{errors.decision}
                    </span>
                )}
            </div>

            <div className="field">
                <label>Admin Remarks <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                <textarea value={remarks}
                    onChange={e => { setRemarks(e.target.value); setErrors(prev => ({ ...prev, remarks: '' })); }}
                    placeholder="Provide a reason for your decision..." rows={3}
                    className={errors.remarks ? 'input-error' : ''} maxLength={500} />
                {errors.remarks && (
                    <span style={{ fontSize: 11, color: 'var(--status-failed)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={11} />{errors.remarks}
                    </span>
                )}
                <span style={{ fontSize: 11, marginTop: 3, display: 'block', textAlign: 'right', color: remarks.length > 450 ? (remarks.length >= 500 ? 'var(--status-failed)' : '#c05c00') : 'var(--text-secondary)' }}>
                    {remarks.length}/500
                </span>
            </div>
        </FormModal>
    );
};

// --- Tab: Reopen Requests -----------------------------------------------------

const ReopenTab: React.FC<{
    requests: ReopenRequest[];
    onReview: (req: ReopenRequest) => void;
}> = ({ requests, onReview }) => {
    const pending = requests.filter(r => r.status === 'Pending');
    const history = requests.filter(r => r.status !== 'Pending');
    const [pendingPage, setPendingPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const pendingTotalPages = Math.max(1, Math.ceil(pending.length / PER_PAGE));
    const historyTotalPages = Math.max(1, Math.ceil(history.length / PER_PAGE));
    const pagedPending = pending.slice((pendingPage - 1) * PER_PAGE, pendingPage * PER_PAGE);
    const pagedHistory = history.slice((historyPage - 1) * PER_PAGE, historyPage * PER_PAGE);

    return (
        <div className="dashboard-content">
            {/* Stat cards */}
            <div className="stats-row stats-row-4">
                {[
                    { label: 'PENDING REQUESTS', value: pending.length, icon: <RotateCcw size={20} strokeWidth={2.3} />, variant: 'warning', subtext: 'Awaiting review' },
                    { label: 'APPROVED', value: history.filter(r => r.status === 'Approved').length, icon: <ThumbsUp size={20} strokeWidth={2.3} />, variant: 'success', subtext: 'Task reopened' },
                    { label: 'REJECTED', value: history.filter(r => r.status === 'Rejected').length, icon: <ThumbsDown size={20} strokeWidth={2.3} />, variant: 'danger', subtext: 'Declined requests' },
                    { label: 'TOTAL', value: requests.length, icon: <ClipboardList size={20} strokeWidth={2.3} />, variant: 'teal', subtext: 'All time' },
                ].map(s => (
                    <StatusCard key={s.label} icon={s.icon} variant={s.variant} label={s.label} value={s.value} subtext={s.subtext} />
                ))}
            </div>

            {/* Pending Requests */}
            <div className="reopen-section">
                <div className="reopen-section-header">
                    <h3>Pending Reopen Requests</h3>
                    {pending.length > 0 && <span className="badge badge-amber">{pending.length} pending</span>}
                </div>
                <DataTable
                    headers={['REQUEST ID', 'TASK', 'EMPLOYEE', 'REASON', 'SUBMITTED', 'ACTIONS']}
                    loading={false}
                    emptyMessage="No pending reopen requests."
                    emptyIcon={<RotateCcw size={24} />}
                    totalRecords={pending.length}
                    currentPage={pendingPage} totalPages={pendingTotalPages} onPageChange={setPendingPage}
                >
                    {pagedPending.map(r => (
                        <tr key={r.requestId}>
                            <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{r.referenceNumber || r.requestId.slice(0, 8).toUpperCase()}</td>
                            <td><div style={{ fontWeight: 600, fontSize: 13 }}>{r.taskTitle}</div></td>
                            <td style={{ fontSize: 13 }}>{r.employeeName}</td>
                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{r.reason}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(r.submittedAt)}</td>
                            <td>
                                <button className="btn btn-primary" onClick={() => onReview(r)} style={{ fontSize: 11, padding: '4px 12px' }}>
                                    <Eye size={12} /> Review
                                </button>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            </div>

            {/* History */}
            {history.length > 0 && (
                <div style={{ marginTop: 24 }}>
                    <h3 style={{ marginBottom: 12, fontSize: 15 }}>Request History</h3>
                    <DataTable
                        headers={['REQUEST ID', 'TASK', 'EMPLOYEE', 'DECISION', 'REMARKS', 'REVIEWED']}
                        loading={false}
                        totalRecords={history.length}
                        currentPage={historyPage} totalPages={historyTotalPages} onPageChange={setHistoryPage}
                    >
                        {pagedHistory.map(r => (
                            <tr key={r.requestId}>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{r.referenceNumber || r.requestId.slice(0, 8).toUpperCase()}</td>
                                <td><div style={{ fontWeight: 600, fontSize: 13 }}>{r.taskTitle}</div></td>
                                <td style={{ fontSize: 13 }}>{r.employeeName}</td>
                                <td><StatusBadge status={r.status} size="sm" /></td>
                                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{r.adminRemarks || '—'}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.reviewedAt ? fmtDate(r.reviewedAt) : '—'}</td>
                            </tr>
                        ))}
                    </DataTable>
                </div>
            )}
        </div>
    );
};

// --- Duplicate Warning Modal --------------------------------------------------

interface DuplicateWarningModalProps {
    duplicates: DuplicateWarningDTO[];
    details: DuplicateDetailDTO[];
    newTaskTitle?: string;
    newTaskDescription?: string;
    onViewTask: (taskId: string) => void;
    onContinue: () => void;
    onCancel: () => void;
}

const similarityColor = (p: number): string =>
    p >= 90 ? 'var(--status-failed)' : p >= 80 ? '#c05c00' : p >= 70 ? '#9a6e00' : 'var(--text-primary)';

const fmtDeadline = (d?: string | null): string => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const snippet = (s?: string): string => {
    if (!s) return '';
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
};

const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
    duplicates, details, newTaskTitle, newTaskDescription, onViewTask, onContinue, onCancel,
}) => (
    <FormModal isOpen onClose={onCancel}
        title="Potential duplicate task detected."
        subtitle={`The system found ${duplicates.length} similar task${duplicates.length !== 1 ? 's' : ''} in existing records. Review the matches below.`}
        size="lg"
        footer={
            <div className="modal-actions" style={{ width: '100%', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onCancel}><X size={13} /> Cancel</button>
                <button className="btn btn-warning" onClick={onContinue}><CheckCircle2 size={13} /> Continue Anyway</button>
            </div>
        }
    >
        {newTaskTitle && (
            <div style={{ margin: '4px 0 12px', padding: '10px 12px', background: 'rgba(2, 132, 199, 0.06)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>New task: {newTaskTitle}</div>
                {newTaskDescription && (
                    <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{snippet(newTaskDescription)}</div>
                )}
                <div style={{ marginTop: 6, fontSize: 11, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Info size={12} /> Auto-numbering rule: If a task with this exact title exists, an increment number (e.g. &quot;1&quot;, &quot;2&quot;) will be added automatically.
                </div>
            </div>
        )}
        <div style={{ overflowX: 'auto', margin: '8px 0 4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)', width: 130 }}>Similarity</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Existing Task</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Priority</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Deadline</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Assignee</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</th>
                        <th style={{ padding: '8px 8px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {details.map((d, i) => (
                        <tr key={d.taskId || i} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                            <td style={{ padding: '10px 8px', minWidth: 120 }}>
                                <div style={{ fontWeight: 700, color: similarityColor(d.similarityPercentage) }}>{d.similarityPercentage}%</div>
                                <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 4 }}>
                                    <div style={{ width: `${Math.min(100, d.similarityPercentage)}%`, height: '100%', background: similarityColor(d.similarityPercentage), borderRadius: 3 }} />
                                </div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{d.referenceNumber || (d.taskId.length > 8 ? d.taskId.slice(0, 8) + '…' : d.taskId)}</div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                                <span className={statusBadgeClass(d.status)} style={{ fontSize: 11 }}>{d.status}</span>
                            </td>
                            <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>{d.loading ? '…' : (d.priority || '—')}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{d.loading ? '…' : fmtDeadline(d.deadline)}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>{d.loading ? '…' : (d.assignee || '—')}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', maxWidth: 260 }}>
                                {d.loading ? <span style={{ fontSize: 11, fontStyle: 'italic' }}>Loading…</span> : (snippet(d.description) || '—')}
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                                <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onViewTask(d.taskId)}><Eye size={13} /> View</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </FormModal>
);

// --- Root Component -----------------------------------------------------------

export default function OpsAdminDashboard() {
    const navigate = useNavigate();
    usePreventBackNav();

    const employeeId = localStorage.getItem('employeeId') ?? '';
    const firstName = localStorage.getItem('firstName') ?? '';
    const lastName = localStorage.getItem('lastName') ?? '';
    const middleName = localStorage.getItem('middleName') ?? '';
    const rawRole = localStorage.getItem('role') ?? '';
    const displayRole = rawRole === 'Manager' ? 'Manager' : 'Coordinator';
    const employeeName = [firstName, middleName, lastName].filter(Boolean).join(' ') || displayRole;
    const { success, error } = useToast();
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(CONFIRM_CLOSED);


    const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
    // Close any open task detail/edit/review panels when navigating via the
    // sidebar so they don't linger over a different page.
    const handleNavChange = useCallback((tab: NavTab) => {
        setActiveTab(tab);
        setEditingTask(null);
        setViewingTask(null);
        setDetailTask(null);
        setOverrideTask(null);
        setReviewTask(null);
        setViewingDuplicateTask(null);
        setReviewingRequest(null);
    }, []);
    const SIDEBAR_NAV_GROUPS = React.useMemo(() => [
        {
            label: null,
            items: [
                {
                    label: 'Task Allocation and Review System',
                    icon: 'ti ti-clipboard-list',
                    subItems: [
                        { label: 'Dashboard', onClick: () => handleNavChange('dashboard'), active: activeTab === 'dashboard' },
                        { label: 'Tasks', onClick: () => handleNavChange('tasks'), active: activeTab === 'tasks' },
                        { label: 'Team', onClick: () => handleNavChange('team'), active: activeTab === 'team' },
                        { label: 'Task Templates', onClick: () => handleNavChange('templates'), active: activeTab === 'templates' },
                        { label: 'Reports', onClick: () => handleNavChange('reports'), active: activeTab === 'reports' },
                        { label: 'Activity Logs', onClick: () => handleNavChange('activity_logs'), active: activeTab === 'activity_logs' },
                        { label: 'Announcements', onClick: () => handleNavChange('announcements'), active: activeTab === 'announcements' },
                        { label: 'Notifications', onClick: () => handleNavChange('notifications'), active: activeTab === 'notifications' },
                    ],
                },
                {
                    label: 'General',
                    icon: 'ti ti-settings',
                    subItems: [
                        { label: 'Profile', onClick: () => handleNavChange('profile'), active: activeTab === 'profile' },
                        { label: 'Notification Settings', onClick: () => handleNavChange('notification_settings'), active: activeTab === 'notification_settings' },
                    ],
                },
            ],
        },
    ], [activeTab, handleNavChange]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const CLASSIFICATION_MAP: Record<number, string> = { 0: 'routine', 1: 'special' };
    const tmTasks = useMemo(() => tasks.map(t => ({
        id: t.taskId,
        name: t.taskTitle,
        referenceNumber: t.taskReferenceNumber,
        classification: CLASSIFICATION_MAP[t.classification] ?? '',
        project: t.taskCategory,
        assignee: t.assignedTo ? { id: t.assignedTo, name: t.assignedEmployee || 'Unassigned' } : undefined,
        priority: t.priority as TMTask['priority'],
        status: ({ Draft: 'Backlog', Assigned: 'To do', Pending: 'To do', 'In Progress': 'In progress', 'Pending Admin Review': 'In review', Done: 'Done', Completed: 'Done', 'On Hold': 'On hold', Cancelled: 'Cancelled', Overdue: 'In progress' } as Record<string, TMTask['status']>)[t.taskStatus] || 'Backlog',
        dueDate: t.dueAt || undefined,
        progress: t.taskStatus === 'Completed' || t.taskStatus === 'Done' ? 100 : t.taskStatus === 'In Progress' ? 50 : t.taskStatus === 'Pending Admin Review' ? 80 : t.taskStatus === 'Assigned' || t.taskStatus === 'Pending' ? 10 : 0,
        isArchived: false,
        isDeleted: t.deleted || t.Deleted || false,
        isConfidential: t.isConfidential ?? false,
    })), [tasks]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [userPresenceStatus, setUserPresenceStatus] = useState('Offline');
    const [headerNotifications, setHeaderNotifications] = useState<NotificationItem[]>([]);

    const mapToHeaderNotification = useCallback((n: any): NotificationItem => {
        const typeLabels: Record<string, NotificationItem['type']> = {
            TaskAssigned: 'info', TaskUpdated: 'info', TaskOverdue: 'alert', DeadlineWarning: 'alert',
            TaskCancelled: 'system', TaskCompleted: 'success',
        };
        const type = typeof n.type === 'number' ? ['TaskAssigned', 'TaskUpdated', 'TaskOverdue', 'DeadlineWarning', 'PushBack', 'TaskCancelled', 'TaskResumed', 'TaskOnHold', 'TaskCompleted', 'TemplateTaskUnassigned'][n.type] || 'Unknown' : n.type || '';
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

    const [showNew, setShowNew] = useState(false);
    const [taskSubTab, setTaskSubTab] = useState<'list' | 'create'>('list');
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [viewingTask, setViewingTask] = useState<Task | null>(null);
    const [detailTask, setDetailTask] = useState<TaskViewTask | null>(null);
    const [overrideTask, setOverrideTask] = useState<Task | null>(null);
    const [reviewTask, setReviewTask] = useState<Task | null>(null);

    // -- Fetch Tasks --
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(new Set());
    const [binTasks, setBinTasks] = useState<Task[]>([]);

    // ── Awaiting Review + Overdue (derived from task status/deadlines) ──
    const [awaitingReviewNotifs, setAwaitingReviewNotifs] = useState<NotificationItem[]>([]);
    const [overdueNotifs, setOverdueNotifs] = useState<NotificationItem[]>([]);

    const fetchAwaitingReview = useCallback(async () => {
        try {
            const res = await api.get('/api/Task', { pageNumber: 1, pageSize: 100 });
            const json = res.data;
            const d = json?.data;
            const rawList: any[] = Array.isArray(json) ? json : (Array.isArray(d?.items) ? d.items : []);
            const reviewNotifs: NotificationItem[] = [];
            const overdueNotifsList: NotificationItem[] = [];
            const additions: Task[] = [];
            const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };
            const STATUS_LABELS: Record<number, string> = { 0: 'Assigned', 1: 'In Progress', 2: 'Pending Admin Review', 3: 'Completed', 4: 'On Hold', 5: 'Cancelled' };
            const now = new Date();
            rawList.forEach((t: any) => {
                const taskId = t.id ?? t.taskId;
                const rawTitle = t.title ?? t.taskTitle ?? '';
                const title = rawTitle.length > 50 ? rawTitle.slice(0, 50) + '...' : rawTitle;
                const updatedAt = t.updatedAt ?? t.createdAt ?? new Date().toISOString();
                const createdDate = new Date(updatedAt);
                const isToday = createdDate.toDateString() === now.toDateString();
                const statusNum = t.status ?? -1;
                const deadlineStr = t.deadline ?? t.dueAt ?? null;
                const isOverdue = statusNum !== 2 && statusNum !== 3 && statusNum !== 5
                    && !!deadlineStr && new Date(deadlineStr) < now;

                if (statusNum === 2) {
                    reviewNotifs.push({
                        id: `review-${taskId}`,
                        title: 'Awaiting Your Review',
                        description: `Task '${title}' has been submitted for review.`,
                        timestamp: createdDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        date: isToday ? 'Today' : createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                        createdAt: updatedAt,
                        read: false,
                        type: 'info',
                        category: 'system',
                        isToday,
                        source: 'System',
                        relatedEntityId: taskId,
                        relatedEntityType: 'task',
                    });
                } else if (isOverdue) {
                    overdueNotifsList.push({
                        id: `overdue-${taskId}`,
                        title: 'Task Overdue',
                        description: `Task '${title}' is overdue.`,
                        timestamp: createdDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        date: isToday ? 'Today' : createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                        createdAt: updatedAt,
                        read: false,
                        type: 'alert',
                        category: 'system',
                        isToday,
                        source: 'System',
                        relatedEntityId: taskId,
                        relatedEntityType: 'task',
                    });
                }
                additions.push({
                    taskId,
                    taskTitle: rawTitle,
                    taskDescription: t.description ?? t.taskDescription ?? '',
                    taskCategory: t.taskCategory ?? '',
                    taskReferenceNumber: t.taskReferenceNumber ?? '',
                    classification: t.classification ?? t.Classification ?? 0,
                    priority: (PRIORITY_LABELS[t.priorityLevel] || t.priority || 'Medium') as Priority,
                    dueAt: deadlineStr,
                    taskStatus: STATUS_LABELS[statusNum] ?? t.taskStatus ?? '',
                    taskRemarks: t.progressNotes ?? t.taskRemarks ?? '',
                    assignedEmployee: t.assignees?.length > 0 ? t.assignees[0].fullName ?? '' : '',
                    createdByEmployee: t.createdByName ?? t.createdByEmployee ?? '',
                    assignedTo: t.assignees?.length > 0 ? t.assignees[0].userId ?? '' : '',
                    createdAt: t.createdAt ?? '',
                    updatedAt: t.updatedAt ?? undefined,
                    deleted: deletedTaskIds.has(taskId),
                    supportingEvidenceUrl: t.supportingEvidenceUrl ?? '',
                    isConfidential: t.isConfidential ?? false,
                    isSLALocked: t.isSLALocked ?? false,
                    attachmentCount: t.attachmentCount ?? 0,
                });
            });
            setAwaitingReviewNotifs(reviewNotifs);
            setOverdueNotifs(overdueNotifsList);
            if (additions.length > 0) {
                setAllTasks(prev => {
                    const existing = new Set(prev.map(t => t.taskId));
                    return [...prev, ...additions.filter(a => !existing.has(a.taskId))];
                });
            }
        } catch { /* silent */ }
    }, [deletedTaskIds]);

    useEffect(() => { fetchAwaitingReview(); }, [fetchAwaitingReview]);

    const mergedHeaderNotifications = useMemo(() => {
        const realOverdueIds = new Set(
            headerNotifications
                .filter(n => n.relatedEntityId && typeof n.title === 'string' && n.title.toLowerCase().includes('is overdue'))
                .map(n => n.relatedEntityId as string)
        );
        return [...awaitingReviewNotifs, ...overdueNotifs.filter(n => !realOverdueIds.has(n.relatedEntityId as string)), ...headerNotifications];
    }, [awaitingReviewNotifs, overdueNotifs, headerNotifications]);

    // The notification page shows ONLY the server-paginated feed so every page has
    // the same number of records. Derived rows (awaiting review/overdue) are computed
    // from live task state and would inflate page 1 differently from later pages, so
    // they stay in the header dropdown (mergedHeaderNotifications) only.
    const mergedAllNotifications = useMemo(() => allNotifications, [allNotifications]);

    // Server-side pagination for task list
    const [taskPage, setTaskPage] = useState(1);
    const [taskTotalPages, setTaskTotalPages] = useState(1);
    const [taskTotalRecords, setTaskTotalRecords] = useState(0);
    const [taskPageSize, setTaskPageSize] = useState(8);
    const [taskTab, setTaskTab] = useState<'active' | 'completed' | 'bin'>('active');
    const [taskFilterPrio, setTaskFilterPrio] = useState('');
    const [taskFilterClassification, setTaskFilterClassification] = useState('');
    const [taskFilterAssignee, setTaskFilterAssignee] = useState('');
    const [taskSummary, setTaskSummary] = useState<{ active: number; inProgress: number; completed: number; overdue: number }>({ active: 0, inProgress: 0, completed: 0, overdue: 0 });

    // Reopen Requests state
    const [reopenRequests, setReopenRequests] = useState<ReopenRequest[]>([]);
    const [reopenLoading, setReopenLoading] = useState(false);
    const [reviewingRequest, setReviewingRequest] = useState<ReopenRequest | null>(null);

    // Duplicate warning state
    const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateWarningDTO[]>([]);
    const [duplicateDetails, setDuplicateDetails] = useState<DuplicateDetailDTO[]>([]);
    const [viewingDuplicateTask, setViewingDuplicateTask] = useState<TaskViewTask | null>(null);
    const [pendingTaskData, setPendingTaskData] = useState<CreateTaskDTO | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    // -- Dashboard Data --
    const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardError, setDashboardError] = useState<string | null>(null);
    const [dashboardEmployees, setDashboardEmployees] = useState<EmployeeFilterOption[]>([]);
    const [dashboardDepartments, setDashboardDepartments] = useState<DepartmentFilterOption[]>([]);
    const [dashboardFilters, setDashboardFilters] = useState({ dateStart: '', dateEnd: '', employeeId: '', departmentId: '', taskStatus: '', assignmentScope: '' });

    const mountedRef = useRef(true);
    const filtersRef = useRef(dashboardFilters);
    filtersRef.current = dashboardFilters;

    const taskPageRef = useRef(taskPage);
    taskPageRef.current = taskPage;
    const taskPageSizeRef = useRef(taskPageSize);
    taskPageSizeRef.current = taskPageSize;
    const taskTabRef = useRef(taskTab);
    taskTabRef.current = taskTab;
    const taskFilterPrioRef = useRef(taskFilterPrio);
    taskFilterPrioRef.current = taskFilterPrio;
    const taskFilterClassificationRef = useRef(taskFilterClassification);
    taskFilterClassificationRef.current = taskFilterClassification;
    const taskFilterAssigneeRef = useRef(taskFilterAssignee);
    taskFilterAssigneeRef.current = taskFilterAssignee;
    const deletedTaskIdsRef = useRef(deletedTaskIds);
    deletedTaskIdsRef.current = deletedTaskIds;

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    const doFetchDashboard = useCallback(async () => {
        if (!mountedRef.current) return;
        setDashboardLoading(true);
        setDashboardError(null);
        const currentFilters = filtersRef.current;

        try {
            const params = new URLSearchParams();
            const ds = currentFilters.dateStart || undefined;
            if (ds) params.append('dateRangeStart', ds);
            const de = currentFilters.dateEnd || undefined;
            if (de) params.append('dateRangeEnd', de);
            if (currentFilters.employeeId) params.append('employeeId', currentFilters.employeeId);
            if (currentFilters.departmentId) params.append('departmentId', currentFilters.departmentId);
            if (currentFilters.taskStatus) {
                const statusMap: Record<string, string> = { 'Assigned': 'NotStarted', 'In Progress': 'InProgress', 'Pending Admin Review': 'DonePendingReview', 'Completed': 'Completed', 'On Hold': 'OnHold', 'Cancelled': 'Cancelled' };
                params.append('status', statusMap[currentFilters.taskStatus] || currentFilters.taskStatus);
            }
            if (currentFilters.assignmentScope) params.append('assignmentScope', currentFilters.assignmentScope);

            const res = await axios.get(`/api/Dashboard/metrics?${params}`, { timeout: 6000 });
            if (!mountedRef.current) return;
            const body = res.data;
            if (!body.isSuccess) {
                setFallbackDashboardData();
            } else {
                setDashboardData(body.data);
                setDashboardError(null);
            }
        } catch (err: any) {
            if (!mountedRef.current) return;
            console.warn('[Dashboard] metrics unavailable, using fallback:', err?.message || err);
            setFallbackDashboardData();
        } finally {
            if (mountedRef.current) setDashboardLoading(false);
        }
    }, []);

    // Silent version for background polling — does NOT toggle dashboardLoading
    // (which would collapse the content, force the browser scroll to the top).
    const doFetchDashboardSilent = useCallback(async () => {
        if (!mountedRef.current) return;
        const currentFilters = filtersRef.current;

        try {
            const params = new URLSearchParams();
            const ds = currentFilters.dateStart || undefined;
            if (ds) params.append('dateRangeStart', ds);
            const de = currentFilters.dateEnd || undefined;
            if (de) params.append('dateRangeEnd', de);
            if (currentFilters.employeeId) params.append('employeeId', currentFilters.employeeId);
            if (currentFilters.departmentId) params.append('departmentId', currentFilters.departmentId);
            if (currentFilters.taskStatus) {
                const statusMap: Record<string, string> = { 'Assigned': 'NotStarted', 'In Progress': 'InProgress', 'Pending Admin Review': 'DonePendingReview', 'Completed': 'Completed', 'On Hold': 'OnHold', 'Cancelled': 'Cancelled' };
                params.append('status', statusMap[currentFilters.taskStatus] || currentFilters.taskStatus);
            }
            if (currentFilters.assignmentScope) params.append('assignmentScope', currentFilters.assignmentScope);

            const res = await axios.get(`/api/Dashboard/metrics?${params}`, { timeout: 6000 });
            if (!mountedRef.current) return;
            const body = res.data;
            if (body.isSuccess) {
                setDashboardData(body.data);
                setDashboardError(null);
            }
        } catch (err: any) {
            if (!mountedRef.current) return;
            console.warn('[Dashboard] silent refresh failed:', err?.message || err);
        }
    }, []);

    const setFallbackDashboardData = useCallback(() => {
        const fallback: DashboardResponse = {
            totalActiveTasks: 0,
            overdueTaskCount: 0,
            notStartedCount: 0,
            inProgressCount: 0,
            donePendingReviewCount: 0,
            onHoldCount: 0,
            completedTodayCount: 0,
            employeeWorkload: [],
            departmentWorkload: [],
            teamWorkload: [],
        };
        setDashboardData(fallback);
        setDashboardError(null);
    }, []);

    const fetchDashboardFilterOptions = useCallback(async () => {
        try {
            const [empRes, deptRes] = await Promise.all([
                api.get('/api/Dashboard/employee-availability').catch(() => ({ data: null })),
                api.get('/api/Department').catch(() => ({ data: null })),
            ]);
            if (empRes.data) {
                const json = empRes.data;
                const list: any[] = Array.isArray(json) ? json : (Array.isArray(json.data?.items) ? json.data.items : (Array.isArray(json.data) ? json.data : []));
                setDashboardEmployees(list.map((e: any) => ({ employeeId: e.userId ?? e.UserId ?? e.employeeId, employeeName: e.fullName ?? e.FullName ?? e.employeeName })));
            }
            if (deptRes.data) {
                const json = deptRes.data;
                const depts: any[] = Array.isArray(json) ? json : (Array.isArray(json.data?.items) ? json.data.items : (Array.isArray(json.data) ? json.data : []));
                setDashboardDepartments(depts.map((d: any) => ({ departmentId: d.id ?? d.departmentId, departmentName: d.name ?? d.departmentName })));
            }
        } catch { /* non-fatal */ }
    }, []);

    const handleDashboardClearFilters = useCallback(() => {
        setDashboardFilters({ dateStart: '', dateEnd: '', employeeId: '', departmentId: '', taskStatus: '', assignmentScope: '' });
    }, []);

    // -- Activity Logs --

    // -- Activity Logs --
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [activityLogPage, setActivityLogPage] = useState(1);
    const [activityLogTotalPages, setActivityLogTotalPages] = useState(1);
    const [activityLogTotalRecords, setActivityLogTotalRecords] = useState(0);
    const [activityLogLoading, setActivityLogLoading] = useState(false);
    const [activityLogSearch, setActivityLogSearch] = useState('');
    const [activityLogType, setActivityLogType] = useState('');
    const [activityLogDate, setActivityLogDate] = useState('');
    const ACTIVITY_LOG_PAGE_SIZE = 15;

    const fetchActivityLogs = useCallback(async (page: number, silent = false) => {
        if (!silent) setActivityLogLoading(true);
        try {
            const endpoint = rawRole === 'Manager' ? '/api/audit-logs' : '/api/audit-logs/my';
            const params: any = { pageNumber: page, pageSize: ACTIVITY_LOG_PAGE_SIZE };
            if (activityLogType) params.actionType = activityLogType;
            if (activityLogDate) {
                params.dateRangeStart = activityLogDate;
                params.dateRangeEnd = activityLogDate;
            }
            const res = await api.get(endpoint, params);
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setActivityLogs(d.items);
                setActivityLogPage(d.pageNumber || page);
                setActivityLogTotalPages(d.totalPages || 1);
                setActivityLogTotalRecords(d.totalCount ?? d.items.length);
            } else {
                setActivityLogs([]);
                setActivityLogTotalRecords(0);
            }
        } catch {
            setActivityLogs([]);
            setActivityLogTotalRecords(0);
        } finally {
            if (!silent) setActivityLogLoading(false);
        }
    }, [rawRole, activityLogType, activityLogDate]);

    const filteredActivityLogs = useMemo(() => {
        if (!activityLogSearch) return activityLogs;
        const q = activityLogSearch.toLowerCase().trim();
        return activityLogs.filter(log =>
            (log.actorName || '').toLowerCase().includes(q) ||
            (log.actorRole || '').toLowerCase().includes(q) ||
            (log.actionType || '').toLowerCase().includes(q) ||
            (log.description || '').toLowerCase().includes(q) ||
            (log.targetEntity || '').toLowerCase().includes(q)
        );
    }, [activityLogs, activityLogSearch]);

    useEffect(() => {
        if (activeTab === 'activity_logs') {
            fetchActivityLogs(1);
        }
    }, [activeTab, fetchActivityLogs]);

    // -- Update fetchTasks --
    const fetchTasks = useCallback(async (silent: boolean = false) => {
        if (!silent) {
            setLoadingTasks(true);
        }
        try {
            const statusParam = taskTabRef.current === 'completed' ? `&status=3` : taskTabRef.current === 'bin' ? `&status=5` : ``;
            // The Active tab filters out Done and Cancelled tasks client-side (TaskManager tabTasks),
            // so exclude Completed (status 3) and Cancelled (status 5) server-side BEFORE pagination. Otherwise a
            // Completed or Cancelled task landing on a page gets dropped client-side and that page
            // shows fewer rows than the page size.
            const excludeStatusParam = taskTabRef.current === 'active' ? `&excludeStatuses=3,5` : ``;
            // Dropdown filters are sent server-side so the server filters AND paginates
            // consistently — each page then shows the same number of matching rows.
            const prioParam = taskFilterPrioRef.current ? `&priority=${encodeURIComponent(taskFilterPrioRef.current)}` : ``;
            const CLASSIFICATION_PARAM_MAP: Record<string, string> = { routine: '0', special: '1' };
            const classificationParam = taskFilterClassificationRef.current
                ? `&classification=${CLASSIFICATION_PARAM_MAP[taskFilterClassificationRef.current] ?? taskFilterClassificationRef.current}`
                : ``;
            const assigneeParam = taskFilterAssigneeRef.current ? `&assignedToUserId=${encodeURIComponent(taskFilterAssigneeRef.current)}` : ``;
            const res = await api.get(`/api/Task?pageNumber=${taskPageRef.current}&pageSize=${taskPageSizeRef.current}${statusParam}${excludeStatusParam}${prioParam}${classificationParam}${assigneeParam}`);
            const jsonRes = res.data;
            const rawList: any[] = Array.isArray(jsonRes) ? jsonRes : (Array.isArray(jsonRes?.data?.items) ? jsonRes.data.items : (Array.isArray(jsonRes?.data) ? jsonRes.data : []));

            if (jsonRes?.data?.totalCount !== undefined) {
                setTaskTotalRecords(jsonRes.data.totalCount);
                setTaskTotalPages(jsonRes.data.totalPages ?? 1);
            }

            // Summary counts come from the server (computed across ALL pages, respecting visibility)
            if (jsonRes?.data) {
                setTaskSummary({
                    active: jsonRes.data.activeCount ?? 0,
                    inProgress: jsonRes.data.inProgressCount ?? 0,
                    completed: jsonRes.data.completedCount ?? 0,
                    overdue: jsonRes.data.overdueCount ?? 0,
                });
            }

            const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };
            const STATUS_LABELS: Record<number, string> = { 0: 'Assigned', 1: 'In Progress', 2: 'Pending Admin Review', 3: 'Completed', 4: 'On Hold', 5: 'Cancelled' };
            const normalized: Task[] = rawList.map(t => ({
                taskId: t.id ?? t.taskId,
                taskTitle: t.title ?? t.taskTitle ?? '',
                taskDescription: t.description ?? t.taskDescription ?? '',
                taskCategory: t.taskCategory ?? '',
                taskReferenceNumber: t.taskReferenceNumber ?? '',
                classification: t.classification ?? t.Classification ?? 0,
                priority: (PRIORITY_LABELS[t.priorityLevel] || t.priority || 'Medium') as Priority,
                dueAt: t.deadline ?? t.dueAt ?? null,
                taskStatus: STATUS_LABELS[t.status] ?? t.taskStatus ?? '',
                taskRemarks: t.progressNotes ?? t.taskRemarks ?? '',
                assignedEmployee: t.assignees?.length > 0 ? t.assignees[0].fullName ?? '' : '',
                createdByEmployee: t.createdByName ?? t.createdByEmployee ?? '',
                assignedTo: t.assignees?.length > 0 ? t.assignees[0].userId ?? '' : '',
                assignees: (t.assignees ?? []).map((a: any) => ({
                    fullName: a.fullName ?? a.FullName ?? '',
                    completionPercentage: a.completionPercentage ?? a.CompletionPercentage ?? 0,
                })),
                createdAt: t.createdAt ?? '',
                updatedAt: t.updatedAt ?? undefined,
                deleted: deletedTaskIdsRef.current.has(t.id ?? t.taskId),
                supportingEvidenceUrl: t.supportingEvidenceUrl ?? '',
                isConfidential: t.isConfidential ?? false,
                isSLALocked: t.isSLALocked ?? false,
                attachmentCount: t.attachmentCount ?? 0,
                assignmentScope: t.assignmentScope ?? t.AssignmentScope ?? 0,
            }));

            setAllTasks(normalized);
            setTasks(normalized.filter(t => !t.deleted));
        } catch {
            if (!silent) console.warn('[fetchTasks] Failed to load tasks');
        } finally {
            if (!silent) setLoadingTasks(false);
        }
    }, []);

    const fetchBinRecords = async () => {
        try {
            const res = await api.get(`/api/Task/bin-records/${employeeId}`);
            const data = res.data;

            setBinTasks(data);
        } catch {
            setBinTasks([]);
        }
    };

    // -- Restore task --
    const handleRestoreTask = async (taskId: string) => {
        try {
            await api.patch(`/api/Task/${taskId}/restore-task`);
            setAllTasks(prev => prev.map(t =>
                t.taskId === taskId ? { ...t, deleted: false } : t
            ));
            setTasks(prev => {
                const restored = allTasks.find(t => t.taskId === taskId);
                return restored ? [...prev, { ...restored, deleted: false }] : prev;
            });
            success('Task restored successfully.');
            await fetchTasks();
            await doFetchDashboard();
            await fetchBinRecords();
        } catch (err: any) {
            error(err.message ?? 'Failed to restore task.');
        }
    };

    const handleEmptyBin = () => {
        setConfirmModal({
            isOpen: true,
            variant: 'danger',
            title: 'Empty Trash Bin',
            description: 'Permanently remove all items in the bin? This action cannot be undone.',
            confirmLabel: 'Empty Bin',
            onConfirm: async () => {
                setConfirmModal(CONFIRM_CLOSED);
                try {
                    await api.delete(`/api/Task/empty-bin/${employeeId}`);

                    setBinTasks([]);
                    await fetchTasks();
                    success('Bin emptied successfully.');
                } catch (err: any) {
                    error(err.message ?? 'Failed to empty bin.');
                }
            }
        });
    };

    // -- Fetch Team Members (for assignee dropdown) --
    const fetchTeamMembers = async () => {
        try {
            const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=100');
            const body = res.data;
            const rawList: any[] = Array.isArray(body) ? body : (Array.isArray(body?.data?.items) ? body.data.items : (Array.isArray(body?.data?.data) ? body.data.data : (Array.isArray(body?.data) ? body.data : [])));

            setTeamMembers(rawList.map(e => ({
                accountId: e.userId ?? e.UserId ?? e.id,
                employeeName: (e.fullName ?? e.FullName ?? e.employeeName ?? e.EmployeeName ?? '').trim(),
                role: e.role ?? '',
                presenceStatus: e.availabilityStatus ?? e.AvailabilityStatus ?? 'Active',
            })));
        } catch {
            setTeamMembers([]);
        }
    };

    const fetchReopenRequests = async () => {
        setReopenLoading(true);
        try {
            const res = await api.get('/api/Task/reopen-requests');
            const data: any[] = res.data;
            setReopenRequests(data.map((r: any) => ({
                requestId: r.requestId,
                referenceNumber: r.referenceNumber,
                taskId: r.taskId,
                taskTitle: r.taskTitle,
                employeeName: r.employeeName,
                employeeId: r.employeeId,
                reason: r.reason,
                supportingEvidence: r.supportingEvidence,
                currentStatus: r.currentStatus,
                status: r.status,
                submittedAt: r.submittedAt,
                reviewedAt: r.reviewedAt,
                adminRemarks: r.adminRemarks,
            })));
        } catch {
            setReopenRequests([]);
        } finally {
            setReopenLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        fetchBinRecords();
        fetchTeamMembers();
        fetchReopenRequests();
        fetchDashboardFilterOptions();
        const t = localStorage.getItem('authToken');
        if (!t) return;
        api.get('/api/Auth/me')
            .then(res => res.data)
            .catch(() => null)
            .then(resJson => {
                if (!resJson || !resJson.isSuccess || !resJson.data) return;
                const data = resJson.data;
                const contact = data.contactNumber ?? data.contact ?? data.phoneNumber ?? '';
                const email = data.email ?? '';
                const firstNameVal = data.firstName ?? '';
                const middleNameVal = data.middleName ?? '';
                const lastNameVal = data.lastName ?? '';
                const suffixVal = data.suffix ?? '';

                if (firstNameVal) localStorage.setItem('firstName', firstNameVal);
                if (middleNameVal) localStorage.setItem('middleName', middleNameVal);
                if (lastNameVal) localStorage.setItem('lastName', lastNameVal);
                if (suffixVal) localStorage.setItem('suffix', suffixVal);
                if (contact) localStorage.setItem('contactNumber', contact);
                if (email) localStorage.setItem('email', email);

                const fullName = [firstNameVal, middleNameVal, lastNameVal, suffixVal].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
                if (fullName) localStorage.setItem('employeeName', fullName);
            })
            .catch(() => { });
    }, []);

    // -- Create Task --
    const handleNewTask = async (data: CreateTaskDTO, skipDuplicateCheck = false) => {
        try {
            // Check for duplicates before saving (requirement 1, 7)
            if (!skipDuplicateCheck) {
                try {
                    const checkRes = await api.post('/api/Duplicate/check', { title: data.title, description: data.description });
                    const checkJson = checkRes.data;
                    if (checkJson?.isSuccess && checkJson?.data?.hasDuplicates && checkJson.data.matches?.length > 0) {
                        setDuplicateWarnings(checkJson.data.matches);
                        setPendingTaskData(data);
                        fetchDuplicateDetails(checkJson.data.matches);
                        return;
                    }
                } catch {
                    // Duplicate check failed — proceed with creation
                }
            }

            const res = await api.post('/api/Task', data);
            const created = res.data;
            const taskId = created?.data?.id ?? created?.id ?? created?.data?.Id;
            const createdTitle = created?.data?.title ?? created?.title ?? created?.data?.Title ?? data.title;

            // Upload supporting documents if provided
            if (taskId && pendingFiles.length > 0) {
                const results = await Promise.allSettled(pendingFiles.map(async (file) => {
                    const fileFormData = new FormData();
                    fileFormData.append('file', file);
                    await api.upload(`/api/tasks/${taskId}/attachments`, fileFormData);
                }));
                const failed = results.filter(r => r.status === 'rejected').length;
                const uploaded = results.length - failed;
                setPendingFiles([]);
                if (failed > 0) {
                    error(`${uploaded} attachment(s) uploaded, ${failed} failed.`);
                } else {
                    success(`Task "${createdTitle}" created. ${uploaded} attachment(s) uploaded.`);
                }
            } else {
                success(`Task "${createdTitle}" created successfully.`);
            }

            setShowNew(false);
            fetchTasks().catch(() => { });
            doFetchDashboard().catch(() => { });
        } catch (err: any) {
            const status = err.response?.status;
            const respData = err.response?.data;
            const serverMsg = respData?.message || respData?.Message || respData?.title || '';
            const detail = respData?.errors ? Object.values(respData.errors).flat().join('. ') : '';
            const rawText = typeof respData === 'string' ? respData : JSON.stringify(respData || '');
            console.error('[handleNewTask] status:', status, 'response:', rawText);
            const fallback = status === 500 ? 'Server error - check console for details.' : 'Failed to create task.';
            error(serverMsg || detail || fallback);
            setShowNew(false);
        }
    };

    // -- Record duplicate-warning decision (continue/cancel) --
    const recordDuplicateDecision = async (decision: 'continue' | 'cancel') => {
        if (!pendingTaskData) return;
        try {
            await api.post('/api/Duplicate/decision', {
                title: pendingTaskData.title,
                description: pendingTaskData.description,
                decision,
                matchCount: duplicateWarnings.length,
                topSimilarity: duplicateWarnings[0]?.similarityPercentage ?? null,
                matchedTaskIds: duplicateWarnings.map(d => d.taskId),
            });
        } catch {
            // decision recording must never block the flow
        }
    };

    // -- Enrich duplicate matches with per-task detail (parallel fetch) --
    const fetchDuplicateDetails = async (matches: DuplicateWarningDTO[]) => {
        if (!matches.length) return;
        setDuplicateDetails(matches.map(m => ({ ...m, loading: true })));
        const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };
        const results = await Promise.allSettled(
            matches.map(m => api.get(`/api/Task/${m.taskId}`).then(res => res?.data?.data ?? res?.data))
        );
        setDuplicateDetails(matches.map((m, i) => {
            const r = results[i];
            if (r.status !== 'fulfilled' || !r.value) {
                return { ...m, loading: false, error: true };
            }
            const dto: any = r.value;
            return {
                ...m,
                referenceNumber: dto.referenceNumber ?? dto.taskReferenceNumber ?? '',
                description: dto.description ?? '',
                deadline: dto.deadline ?? null,
                priority: (PRIORITY_LABELS[dto.priorityLevel] ?? dto.priority ?? '') as string,
                assignee: dto.assignees?.length > 0 ? (dto.assignees[0].fullName ?? '') : '',
                loading: false,
                error: false,
            };
        }));
    };

    // -- Map /api/Task/{id} response into a TaskViewTask --
    const mapTaskDetailToTaskView = (dto: any): TaskViewTask => {
        const STATUS_LABELS: Record<number, TaskViewTask['taskStatus']> = {
            0: 'Not Started', 1: 'In Progress', 2: 'Done/Pending Review',
            3: 'Completed', 4: 'On Hold', 5: 'Cancelled',
        };
        const PRIORITY_LABELS: Record<number, TaskViewTask['priority']> = {
            0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent',
        };
        const rawStatus = dto.status;
        let taskStatus: TaskViewTask['taskStatus'];
        if (typeof rawStatus === 'number') {
            taskStatus = STATUS_LABELS[rawStatus] ?? 'Not Started';
        } else {
            const s: string = (rawStatus ?? '') as string;
            if (s === 'Pending Admin Review' || s === 'DonePendingReview') taskStatus = 'Done/Pending Review';
            else if (s === 'NotStarted') taskStatus = 'Not Started';
            else if (s === 'InProgress') taskStatus = 'In Progress';
            else if (s === 'OnHold') taskStatus = 'On Hold';
            else if (s === 'Completed') taskStatus = 'Completed';
            else if (s === 'Cancelled') taskStatus = 'Cancelled';
            else taskStatus = (s as TaskViewTask['taskStatus']) || 'Not Started';
        }
        return {
            taskId: dto.id ?? '',
            taskTitle: dto.title ?? '',
            taskDescription: dto.description ?? '',
            priority: PRIORITY_LABELS[dto.priorityLevel] ?? ((dto.priority as TaskViewTask['priority']) || 'Medium'),
            dueAt: dto.deadline ?? null,
            taskStatus,
            taskRemarks: dto.progressNotes ?? '',
            assignedEmployee: dto.assignees?.length > 0 ? (dto.assignees[0].fullName ?? '') : '',
            createdByEmployee: dto.createdByName ?? '',
            assignedTo: dto.assignees?.length > 0 ? (dto.assignees[0].userId ?? '') : '',
            assignees: (dto.assignees ?? []).map((a: any) => ({
                fullName: a.fullName ?? a.FullName ?? '',
                completionPercentage: a.completionPercentage ?? a.CompletionPercentage ?? 0,
            })),
            createdAt: dto.createdAt ?? '',
            isConfidential: dto.isConfidential ?? false,
            isSLALocked: dto.isSLALocked ?? false,
            attachmentCount: dto.attachmentCount ?? 0,
            assignedDepartmentId: dto.assignedDepartmentId ?? undefined,
            assignedDepartmentName: dto.assignedDepartmentName ?? undefined,
            assignmentScope: dto.assignmentScope ?? dto.AssignmentScope ?? 0,
            taskReferenceNumber: dto.taskReferenceNumber ?? dto.referenceNumber ?? '',
        };
    };

    // -- Open a matched task in the full TaskView --
    const openDuplicateTask = async (taskId: string) => {
        try {
            const res = await api.get(`/api/Task/${taskId}`);
            const dto = res?.data?.data ?? res?.data;
            if (dto) {
                setActiveTab('tasks');
                setDetailTask(mapTaskDetailToTaskView(dto));
                setViewingDuplicateTask(null);
                setShowNew(false);
                setDuplicateWarnings([]);
                setDuplicateDetails([]);
                setPendingTaskData(null);
            }
        } catch {
            error('Failed to load task details.');
        }
    };

    // -- Update Task --
    const handleEditTask = async (taskId: string, data: UpdateTaskDTO) => {
        try {
            await api.put(`/api/Task/${taskId}`, data);

            if (pendingFiles.length > 0) {
                const results = await Promise.allSettled(pendingFiles.map(async (file) => {
                    const fileFormData = new FormData();
                    fileFormData.append('file', file);
                    await api.upload(`/api/tasks/${taskId}/attachments`, fileFormData);
                }));
                const failed = results.filter(r => r.status === 'rejected').length;
                const uploaded = results.length - failed;
                setPendingFiles([]);
                if (failed > 0) {
                    error(`Task updated. ${uploaded} attachment(s) uploaded, ${failed} failed.`);
                } else {
                    success(`Task updated. ${uploaded} attachment(s) uploaded.`);
                }
            } else {
                success('Task updated successfully.');
            }

            await fetchTasks();
            await doFetchDashboard();
            setEditingTask(null);
        } catch (err: any) {
            console.error('Update task error:', err);
            error(err.message || err.Message || 'Failed to update task.');
        }
    };

    // -- Delete a task attachment --
    const handleDeleteAttachment = async (attachmentId: string) => {
        try {
            await api.delete(`/api/attachments/${attachmentId}`);
            success('Attachment deleted.');
            setDetailTask(prev => prev ? { ...prev, attachmentCount: Math.max(0, (prev.attachmentCount ?? 0) - 1) } : prev);
            setViewingDuplicateTask(prev => prev ? { ...prev, attachmentCount: Math.max(0, (prev.attachmentCount ?? 0) - 1) } : prev);
            fetchTasks();
        } catch (err: any) {
            error(err.response?.data?.message || err.response?.data?.Message || 'Failed to delete attachment.');
            throw err;
        }
    };

    // -- Reopen Task (direct admin override) --
    const handleReopenTask = async (taskId: string) => {
        try {
            const formData = new FormData();
            formData.append('Reason', 'Admin reopen request');
            await api.upload(`/api/Task/${taskId}/reopen-request`, formData);
            await fetchTasks();
            await doFetchDashboard();
            await fetchReopenRequests();
            success('Reopen request submitted for review.');
        } catch (err: any) {
            error(err.message ?? 'Failed to reopen task.');
        }
    };

    // -- FSM Status Transition --
    const STATUS_TO_BACKEND: Record<string, string> = {
        'Not Started': 'NotStarted', 'In Progress': 'InProgress', 'Pending Admin Review': 'DonePendingReview',
        'Done/Pending Review': 'DonePendingReview', 'Completed': 'Completed', 'On Hold': 'OnHold', 'Cancelled': 'Cancelled',
    };
    const handleStatusTransition = async (taskId: string, newStatus: TaskStatus) => {
        const task = tasks.find(t => t.taskId === taskId);
        if (!task) { error('Task not found.'); return; }
        try {
            await api.patch(`/api/Task/${taskId}/status`, { newStatus: STATUS_TO_BACKEND[newStatus] || newStatus });
            await fetchTasks();
            await doFetchDashboard();
            setViewingTask(null);
            success('Task status updated successfully.');
        } catch (err: any) {
            error(err.message ?? 'Invalid task status transition.');
        }
    };

    // -- Task Review (Approve & Close / Return for Rework) --
    const handleReviewTask = async (taskId: string, adminDecision: 'Approve & Close' | 'Return for Rework', reviewerRemarks: string) => {
        try {
            await api.patch(`/api/Task/${taskId}/review`, {
                isApproved: adminDecision === 'Approve & Close',
                remarks: reviewerRemarks || undefined,
            });
            await fetchTasks();
            await fetchAwaitingReview();
            await doFetchDashboard();
            success(
                adminDecision === 'Approve & Close'
                    ? 'Task officially closed and recorded.'
                    : 'Task returned for rework. The employee has been notified.'
            );
        } catch (err: any) {
            error(err.message ?? 'Failed to submit review decision.');
        }
    };

    // -- Admin Override (completed task) --
    const handleAdminOverride = async (taskId: string, reason: string, remarks: string, requestedStatus: string) => {
        try {
            await api.post(`/api/Task/${taskId}/override`, {
                OverrideReason: reason,
                AdminRemarks: remarks,
                ApprovalConfirmation: true,
                RequestedStatus: requestedStatus,
            });
            await fetchTasks();
            setOverrideTask(null);
            success('Administrator override applied — Task reopened — Audit Log entry generated.');
        } catch (err: any) {
            error(err.message ?? 'Administrator override failed.');
        }
    };

    // -- Approve Reopen Request --
    const handleApproveReopen = async (requestId: string, adminRemarks: string) => {
        try {
            await api.patch(`/api/Task/reopen-requests/${requestId}/review`, {
                ApprovalDecision: 'Approve',
                AdminRemarks: adminRemarks,
            });
            setReopenRequests(prev => prev.map(r =>
                r.requestId === requestId
                    ? { ...r, status: 'Approved', adminRemarks, reviewedAt: new Date().toISOString() }
                    : r
            ));
            await fetchTasks();
            await doFetchDashboard();
            setReviewingRequest(null);
            success('Reopening request approved — Task reopened — Task history preserved — Audit Log entry generated.');
        } catch (err: any) {
            error(err.message ?? 'Failed to approve reopen request.');
        }
    };

    // -- Reject Reopen Request --
    const handleRejectReopen = async (requestId: string, adminRemarks: string) => {
        try {
            await api.patch(`/api/Task/reopen-requests/${requestId}/review`, {
                ApprovalDecision: 'Reject',
                AdminRemarks: adminRemarks,
            });
            setReopenRequests(prev => prev.map(r =>
                r.requestId === requestId
                    ? { ...r, status: 'Rejected', adminRemarks, reviewedAt: new Date().toISOString() }
                    : r
            ));
            await doFetchDashboard();
            setReviewingRequest(null);
            success('Reopening request rejected — Original task preserved — Audit Log entry generated.');
        } catch (err: any) {
            error(err.message ?? 'Failed to reject reopen request.');
        }
    };

    const handleDeleteTask = (taskId: string) => {
        setConfirmModal({
            isOpen: true,
            variant: 'danger',
            title: 'Delete Task',
            description: 'Delete this task? This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Keep',
            onConfirm: async () => {
                setConfirmModal(CONFIRM_CLOSED);
                try {
                    await api.delete(`/api/Task/${taskId}/delete-task`);

                    // Track locally so refetches don't resurrect the task
                    setDeletedTaskIds(prev => new Set(prev).add(taskId));
                    setAllTasks(prev => prev.map(t =>
                        t.taskId === taskId ? { ...t, deleted: true } : t
                    ));
                    setTasks(prev => prev.filter(t => t.taskId !== taskId));
                    setEditingTask(null);
                    setViewingTask(null);
                    setDetailTask(null);
                    success('Task deleted successfully.');

                    await fetchTasks();
                    await doFetchDashboard();
                    await fetchBinRecords();

                } catch (err: any) {
                    error(err.message ?? 'Something went wrong.');
                }
            }
        });
    };

    const handleLogout = async () => {
        const token = localStorage.getItem('authToken');

        if (token) {
            await api.post('/api/Auth/logout', {}).catch(() => { }); // non-fatal — clear localStorage regardless
        }

        ['employeeId', 'refreshToken', 'authToken', 'employeeName',
            'firstName', 'middleName', 'lastName', 'contactNumber', 'role']
            .forEach(k => localStorage.removeItem(k));
        navigate('/');
    };

    const pageTitles: Record<NavTab, string> = {
        dashboard: 'Board Overview',
        tasks: 'Task Management',
        team: 'Team Management',
        reports: 'Performance Reports',
        profile: 'My Profile',
        reopen: 'Reopen Requests',
        templates: 'Task Templates',
        approvals: 'Approvals',
        activity_logs: 'Activity Logs',
        announcements: 'Announcements',
        notifications: 'Notifications',
        notification_settings: 'Notification Settings',
    };

    // -- Fetch dashboard data on mount and when filters change --
    useEffect(() => {
        doFetchDashboard();
    }, [dashboardFilters]);

    useEffect(() => {
        fetchActivityLogs(1);
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

    // -- Polling: keep notifications fresh on every tab --
    useEffect(() => {
        const interval = setInterval(() => {
            fetchHeaderNotifications();
            fetchAwaitingReview();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // -- Silent auto-refresh of the task list while the Tasks tab is open --
    useEffect(() => {
        if (activeTab !== 'tasks') return;
        const interval = setInterval(() => {
            fetchTasks(true);
        }, 30000);
        return () => clearInterval(interval);
    }, [activeTab]);

    // Re-fetch tasks when page, page size, tab, or a dropdown filter changes
    useEffect(() => { fetchTasks(); }, [taskPage, taskPageSize, taskTab, taskFilterPrio, taskFilterClassification, taskFilterAssignee]);

    // -- Auto-refresh dashboard data every 30 seconds (silent, no loading state) --
    useEffect(() => {
        const interval = setInterval(() => {
            // Silent refresh: skip the loading spinner so the page doesn't collapse
            // and force-scroll to the top. Only update data.
            doFetchDashboardSilent();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="dashboard-container">
            <Sidebar
                logoUrl={SpeedexLogo}
                logoText="SPEEDEX"
                navGroups={SIDEBAR_NAV_GROUPS}
                profile={{
                    name: employeeName || displayRole,
                    role: displayRole,
                    avatarInitials: getInitials(employeeName || displayRole),
                }}
                onProfileClick={() => handleNavChange('profile')}
                onLogout={handleLogout}
            />

            {/* -- Main -- */}
            <main className="main-viewport">
                <GlobalHeader
                    title={pageTitles[activeTab]}
                    breadcrumbs={[{ label: displayRole }, { label: pageTitles[activeTab] }]}
                    notifications={mergedHeaderNotifications}
                    profile={{
                        name: employeeName || displayRole,
                        role: displayRole,
                        avatarInitials: getInitials(employeeName || displayRole),
                    }}
                    onSettings={() => handleNavChange('profile')}
                    onLogout={handleLogout}
                    onViewAllNotifications={() => handleNavChange('notifications')}
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
                            const found = tasks.find(t => t.taskId === n.relatedEntityId!) || allTasks.find(t => t.taskId === n.relatedEntityId!);
                            if (found) { setViewingTask(found); return; }
                        }
                        if (n.relatedEntityType === 'announcement') handleNavChange('announcements');
                    }}
                />

                {activeTab === 'dashboard' && (
                    <>
                        <div className="dashboard-content" style={{ paddingBottom: 0, marginBottom: -10 }}>
                            <AnnouncementBanner onNavigateToAnnouncements={() => handleNavChange('announcements')} />
                        </div>
                        <DashboardTab
                            dashboardData={dashboardData}
                            dashboardEmployees={dashboardEmployees}
                            dashboardDepartments={dashboardDepartments}
                            dashboardLoading={dashboardLoading}
                            dashboardError={dashboardError}
                            filters={dashboardFilters}
                            onFilterChange={setDashboardFilters}
                            onClearFilters={handleDashboardClearFilters}
                            onNewTask={() => { handleNavChange('tasks'); setTaskSubTab('create'); }}
                            tasks={tasks}
                            onViewTask={task => { setActiveTab('tasks'); setDetailTask(task); }}
                        />
                    </>
                )}

                {activeTab === 'tasks' && (
                    <>
                        {detailTask ? (
                            <div className="dashboard-content">
                                <TaskView
                                    task={detailTask}
                                    onEdit={() => { setEditingTask(detailTask); setDetailTask(null); }}
                                    onReopen={() => handleReopenTask(detailTask.taskId)}
                                    onClose={() => setDetailTask(null)}
                                    onApprove={(id) => handleReviewTask(id, 'Approve & Close', 'Approved via TaskView.')}
                                    onReject={(id, reason) => handleReviewTask(id, 'Return for Rework', reason)}
                                    onDeleteAttachment={handleDeleteAttachment}
                                    onUpdate={(updated) => {
                                        setDetailTask(updated);
                                        fetchTasks();
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="dashboard-content" style={{ paddingBottom: 0 }}>
                                    <SubTabNav
                                        className="tasks-subtab-nav"
                                        tabs={[
                                            { key: 'list', label: 'Task List' },
                                            { key: 'create', label: 'Create Task' },
                                        ]}
                                        activeTab={taskSubTab}
                                        onTabChange={key => setTaskSubTab(key as 'list' | 'create')}
                                    />
                                </div>
                                {taskSubTab === 'list' && (
                                    <div className="dashboard-content">
                                        <TaskManager
                                            tasks={tmTasks}
                                            summary={taskSummary}
                                            activeTab={taskTab}
                                            onTabChange={tab => { setTaskTab(tab); setTaskPage(1); }}
                                            filterPrio={taskFilterPrio}
                                            onFilterPrioChange={val => { setTaskFilterPrio(val); setTaskPage(1); }}
                                            filterClassification={taskFilterClassification}
                                            onFilterClassificationChange={val => { setTaskFilterClassification(val); setTaskPage(1); }}
                                            filterAssignee={taskFilterAssignee}
                                            onFilterAssigneeChange={val => { setTaskFilterAssignee(val); setTaskPage(1); }}
                                            teamMembers={teamMembers.map(m => ({ accountId: m.accountId, employeeName: m.employeeName }))}
                                            onNewTask={() => { setTaskSubTab('create'); setShowNew(false); }}
                                            onEdit={id => setEditingTask(tasks.find(t => t.taskId === id) ?? null)}
                                            onView={id => setDetailTask(tasks.find(t => t.taskId === id) ?? null)}
                                            onArchive={ids => { ids.forEach(id => handleDeleteTask(id)); }}
                                            onRestore={ids => { ids.forEach(id => handleRestoreTask(id)); }}
                                            onDelete={ids => { ids.forEach(id => handleDeleteTask(id)); }}
                                            onMarkDone={ids => { ids.forEach(id => handleStatusTransition(id, 'Completed')); }}
                                            serverPagination={{
                                                currentPage: taskPage,
                                                totalPages: taskTotalPages,
                                                totalRecords: taskTotalRecords,
                                                pageSize: taskPageSize,
                                                onPageChange: (page) => { setTaskPage(page); },
                                                onPageSizeChange: (size) => { setTaskPageSize(size); setTaskPage(1); },
                                            }}
                                        />
                                    </div>
                                )}
                                {taskSubTab === 'create' && (
                                    <div className="dashboard-content">
                                        <AIAssignmentView
                                            onTaskCreated={() => {
                                                fetchTasks().catch(() => { });
                                                doFetchDashboard().catch(() => { });
                                            }}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
                {activeTab === 'team' && (
                    <TeamTab
                        tasks={tasks}
                        teamMembers={teamMembers}
                        onView={id => setViewingTask(tasks.find(t => t.taskId === id) ?? null)}
                    />
                )}
                {activeTab === 'templates' && <TemplateTab teamMembers={teamMembers} />}
                {activeTab === 'approvals' && <ApprovalsWrapper />}
                {activeTab === 'reports' && <ReportsTab teamMembers={teamMembers} />}
                {activeTab === 'profile' && <ProfileTab />}
                {activeTab === 'reopen' && (
                    <ReopenTab
                        requests={reopenRequests}
                        onReview={req => setReviewingRequest(req)}
                    />
                )}
                {activeTab === 'activity_logs' && (
                    <div className="dashboard-content" style={{ padding: '24px 28px' }}>
                        <DataTable
                            title="Activity & Audit Logs"
                            headers={['Date & Time', 'User / Role', 'Action', 'Activity Description', 'Affected Record', 'Changes (Old → New)']}
                            loading={activityLogLoading}
                            searchQuery={activityLogSearch}
                            onSearchChange={val => setActivityLogSearch(val)}
                            searchPlaceholder="Search by user, action, description, or entity…"
                            filterElements={
                                <>
                                    <select
                                        value={activityLogType}
                                        onChange={e => { setActivityLogType(e.target.value); }}
                                        style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 12px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}
                                        aria-label="Filter by action type"
                                    >
                                        <option value="">All Action Types</option>
                                        {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type="date"
                                            value={activityLogDate}
                                            onChange={e => setActivityLogDate(e.target.value)}
                                            title="Filter by date"
                                            style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', color: activityLogDate ? '#0f172a' : '#64748b' }}
                                        />
                                        {activityLogDate && (
                                            <button
                                                type="button"
                                                onClick={() => setActivityLogDate('')}
                                                title="Clear date filter"
                                                style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                    {(activityLogSearch || activityLogType || activityLogDate) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActivityLogSearch('');
                                                setActivityLogType('');
                                                setActivityLogDate('');
                                            }}
                                            style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, color: '#dc2626', cursor: 'pointer' }}
                                        >
                                            Reset Filters
                                        </button>
                                    )}
                                </>
                            }
                            emptyMessage="No activity logs found."
                            emptyIcon={<Activity size={24} />}
                            totalRecords={activityLogTotalRecords || filteredActivityLogs.length}
                            currentPage={activityLogPage}
                            totalPages={activityLogTotalPages}
                            onPageChange={p => fetchActivityLogs(p)}
                        >
                            {filteredActivityLogs.map((log: any) => {
                                const badge = getAuditBadgeStyle(log.actionType ?? '');
                                const activityDesc = getActivityDescription(log);
                                return (
                                    <tr key={log.id || `${log.timestamp}-${log.actionType}-${Math.random()}`}>
                                        <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {fmtDate(log.timestamp || log.createdAt)}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                {log.timestamp || log.createdAt ? new Date(log.timestamp || log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: 13, verticalAlign: 'middle' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {log.actorName || log.userName || (log.firstName ? [log.firstName, log.lastName].filter(Boolean).join(' ') : 'System')}
                                            </div>
                                            {log.actorRole && (
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                    {log.actorRole}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                                                background: badge.background, color: badge.color,
                                            }}>
                                                {formatActionType(log.actionType)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-primary)', maxWidth: 300, verticalAlign: 'middle' }}>
                                            <div style={{ fontWeight: 500, lineHeight: 1.45 }}>
                                                {activityDesc}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: 13, verticalAlign: 'middle' }}>
                                            {log.targetEntity ? (
                                                <>
                                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                                        {log.targetEntity}
                                                    </div>
                                                    {log.targetEntityId && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                                                            ID: {String(log.targetEntityId).length > 8 ? `${String(log.targetEntityId).slice(0, 8)}…` : log.targetEntityId}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '14px 16px', color: 'var(--text-primary)', verticalAlign: 'middle' }}>{renderChanges(log.oldValue, log.newValue)}</td>
                                    </tr>
                                );
                            })}
                        </DataTable>
                    </div>
                )}
                {activeTab === 'announcements' && (
                    <AnnouncementsTab canCreate={true} />
                )}

                {activeTab === 'notifications' && (
                    <div className="dashboard-content">
                        <div className="card">
                            <div className="card-header-layout">
                                <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>Notifications</h3>
                            </div>
                            {notifLoading ? (
                                <div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading notifications...</p></div>
                            ) : allNotifications.length === 0 ? (
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
                                                    const found = allTasks.find(t => t.taskId === n.taskId);
                                                    if (found) {
                                                        setActiveTab('tasks');
                                                        setDetailTask(found);
                                                    }
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
                {activeTab === 'notification_settings' && <NotificationSettingsTab />}
            </main>

            {/* -- Modals -- */}
            {showNew && (
                <TaskModal
                    key="new-task"
                    mode="new"
                    teamMembers={teamMembers}
                    tasks={tasks}
                    onSave={data => handleNewTask(data as CreateTaskDTO)}
                    onClose={() => { setShowNew(false); setDuplicateWarnings([]); setDuplicateDetails([]); setViewingDuplicateTask(null); setPendingTaskData(null); setPendingFiles([]); }}
                    showSuccess={success}
                    onFileChange={f => setPendingFiles(f)}
                />
            )}
            {editingTask && (
                <TaskModal
                    key={`edit-${editingTask.taskId}`}
                    mode="edit"
                    initial={editingTask}
                    teamMembers={teamMembers}
                    tasks={tasks}
                    onSave={data => handleEditTask(editingTask.taskId, data as UpdateTaskDTO)}
                    onClose={() => setEditingTask(null)}
                    onDelete={() => handleDeleteTask(editingTask.taskId)}
                    onFileChange={f => setPendingFiles(f)}
                />
            )}
            {viewingTask && (
                <ViewModal
                    task={viewingTask}
                    onEdit={() => { setEditingTask(viewingTask); setViewingTask(null); }}
                    onReopen={() => handleReopenTask(viewingTask.taskId)}
                    onStatusChange={(id, status) => handleStatusTransition(id, status)}
                    onAdminOverride={(id) => setOverrideTask(tasks.find(t => t.taskId === id) ?? null)}
                    onClose={() => setViewingTask(null)}
                    onViewMore={() => { setActiveTab('tasks'); setDetailTask(viewingTask); setViewingTask(null); }}
                    onReview={() => { setReviewTask(viewingTask); setViewingTask(null); }}
                />
            )}

            {overrideTask && (
                <AdminOverrideModal
                    task={overrideTask}
                    onSubmit={(reason, remarks, requestedStatus) => handleAdminOverride(overrideTask.taskId, reason, remarks, requestedStatus)}
                    onClose={() => setOverrideTask(null)}
                />
            )}
            {reviewTask && (
                <TaskReviewModal
                    task={reviewTask}
                    onSubmit={(taskId, decision, remarks) => handleReviewTask(taskId, decision, remarks)}
                    onClose={() => setReviewTask(null)}
                />
            )}
            {reviewingRequest && (
                <ReopenApprovalModal
                    request={reviewingRequest}
                    onApprove={handleApproveReopen}
                    onReject={handleRejectReopen}
                    onClose={() => setReviewingRequest(null)}
                />
            )}
            {duplicateWarnings.length > 0 && pendingTaskData && !viewingDuplicateTask && (
                <DuplicateWarningModal
                    duplicates={duplicateWarnings}
                    details={duplicateDetails}
                    newTaskTitle={pendingTaskData.title}
                    newTaskDescription={pendingTaskData.description}
                    onViewTask={openDuplicateTask}
                    onContinue={async () => {
                        const task = pendingTaskData;
                        await recordDuplicateDecision('continue');
                        setShowNew(false);
                        setDuplicateWarnings([]);
                        setDuplicateDetails([]);
                        setPendingTaskData(null);
                        handleNewTask(task, true);
                    }}
                    onCancel={async () => {
                        await recordDuplicateDecision('cancel');
                        setDuplicateWarnings([]);
                        setDuplicateDetails([]);
                        setPendingTaskData(null);
                        setPendingFiles([]);
                        setShowNew(false);
                    }}
                />
            )}


            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                variant={confirmModal.variant}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmLabel={confirmModal.confirmLabel}
                cancelLabel={confirmModal.cancelLabel}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(CONFIRM_CLOSED)}
            />
        </div>
    );
}
