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
import TaskManager, { TMTask } from '../../components/TaskManager/TaskManager';
import api from '../../api';
import axios from 'axios';
import AIAssignmentView from '../EmergingTechAI/AIAssignmentView';
import AnnouncementsTab from '../../components/AnnouncementsTab/AnnouncementsTab';
import AnnouncementBanner from '../../components/AnnouncementsTab/AnnouncementBanner';

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
    averageTaskCompletionTimeHours: number;
    employeePerformanceSummary: EmployeePerformance[];
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
    employeePerformanceSummary: OperationalEmployeePerformance[];
    workloadByCategory: WorkloadItem[];
    workloadByDepartment: WorkloadItem[];
    workloadByPriority: WorkloadItem[];
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

interface WorkloadInfo {
    employeeName: string;
    accountId: string;
    availabilityStatus: string;
    isAvailable: boolean;
    workload: number;
    role: string;
    isRecommended: boolean;
    recommendationReason: string;
}

interface Recommendation {
    employeeName: string;
    accountId: string;
    availabilityStatus: string;
    workload: number;
    reason: string;
}

interface TaskModalProps {
    mode: 'new' | 'edit';
    initial?: Partial<Task>;
    teamMembers: TeamMember[];
    tasks: Task[];
    onSave: (data: CreateTaskDTO | UpdateTaskDTO) => Promise<void>;
    onClose: () => void;
    onDelete?: () => void;
    showSuccess?: (msg: string) => void;
    onFileChange?: (files: File[]) => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ mode, initial = {}, teamMembers, tasks, onSave, onClose, onDelete, showSuccess, onFileChange }) => {
    const resolvedAssignedTo =
        initial.assignedTo ||
        teamMembers.find(m => m.employeeName === initial.assignedEmployee)?.accountId ||
        '';

    const CLASSIFICATION_OPTIONS: { label: string; value: number }[] = [
        { label: 'Routine Daily Task', value: 0 },
        { label: 'Special Task', value: 1 },
    ];

    const isSLAEditLock = mode === 'edit' && initial.isSLALocked;
    const existingTitles = useMemo(() => (tasks || []).map(t => t.taskTitle || ''), [tasks]);
    const [form, setForm] = useState({
        taskTitle: initial.taskTitle ?? '',
        taskDescription: initial.taskDescription ?? '',
        dueAt: (initial.isSLALocked && initial.dueAt) ? initial.dueAt.substring(0, 16) : (initial.dueAt ?? ''),
        priority: initial.priority ?? '' as Priority,
        assignedTo: resolvedAssignedTo,
        classification: initial.classification ?? -1,
        taskCategory: initial.taskCategory ?? '',
        taskRemarks: initial.taskRemarks ?? '',
        isConfidential: initial.isConfidential ?? false,
        assignmentScope: 'SingleEmployee' as 'SingleEmployee' | 'Team' | 'Department',
        assignedDepartmentId: '',
    });
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [teamsForTask, setTeamsForTask] = useState<{ id: string; name: string; memberCount: number }[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [supportingEvidenceFiles, setSupportingEvidenceFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
    const [eligibleEmployees, setEligibleEmployees] = useState<WorkloadInfo[]>([]);
    const [recommendationAccepted, setRecommendationAccepted] = useState(true);
    const [singleSearch, setSingleSearch] = useState('');

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=50');
                const json = res.data;
                const list: any[] = json.isSuccess && Array.isArray(json.data?.items) ? json.data.items : (json.isSuccess && Array.isArray(json.data) ? json.data : (Array.isArray(json.data?.data) ? json.data.data : []));
                if (list.length > 0) {
                    const sample = list[0];
                    console.debug('[TaskForm] ALL KEYS of first item:', Object.keys(sample));
                    console.debug('[TaskForm] Raw first item:', JSON.stringify(sample, null, 2));
                    const mapped: WorkloadInfo[] = list.map((emp: any) => ({
                        employeeName: emp.fullName ?? emp.FullName ?? emp.employeeName ?? '',
                        accountId: emp.userId ?? emp.UserId ?? emp.id ?? '',
                        availabilityStatus: emp.availabilityStatus ?? emp.AvailabilityStatus ?? emp.status ?? 'Active',
                        isAvailable: emp.isAvailable ?? emp.IsAvailable ?? emp.available ?? true,
                        workload: typeof emp.workload === 'number' ? emp.workload : 0,
                        role: emp.role ?? emp.Role ?? '',
                        isRecommended: true,
                        recommendationReason: 'Available for assignment',
                    }));
                    setEligibleEmployees(mapped);
                    const activeEmployees = mapped.filter(e => e.isAvailable);
                    if (activeEmployees.length > 0) {
                        const best = activeEmployees.reduce((a, b) => a.workload <= b.workload ? a : b);
                        setRecommendation({
                            employeeName: best.employeeName || 'Recommended Employee',
                            accountId: best.accountId,
                            availabilityStatus: best.availabilityStatus,
                            workload: best.workload,
                            reason: 'Available for assignment',
                        });
                    }
                }
            } catch (err) {
                console.warn('[TaskForm] fetchRecommendations error:', err);
            }
        };
        const fetchDepartments = async () => {
            try {
                const res = await api.get('/api/Department');
                const json = res.data;
                if (json.isSuccess && json.data?.items) {
                    setDepartments(json.data.items.map((d: any) => ({ id: d.id ?? d.departmentId, name: d.name ?? d.departmentName })));
                }
            } catch {
            }
        };
        const fetchTeams = async () => {
            try {
                const res = await api.get('/api/Team?pageNumber=1&pageSize=100');
                const json = res.data;
                if (json.isSuccess && json.data?.items) {
                    setTeamsForTask(json.data.items.map((t: any) => ({
                        id: t.id ?? t.teamId,
                        name: t.name ?? t.teamName,
                        memberCount: t.memberCount ?? t.members?.length ?? 0,
                    })));
                }
            } catch {
            }
        };
        fetchRecommendations();
        fetchDepartments();
        fetchTeams();

        // FR-065: Periodic refresh of availability status
        const interval = setInterval(fetchRecommendations, 30000);
        return () => clearInterval(interval);
    }, []);

    // -- Per-field live validator ------------------------------------------
    const validateField = (key: string, value: string): string => {
        switch (key) {
            case 'taskTitle': {
                const v = value.trim();
                if (!v) return 'Task title is required.';
                if (v.length < 3) return 'Title must be at least 3 characters.';
                if (v.length > 150) return 'Title must not exceed 150 characters.';
                return '';
            }
            case 'taskDescription': {
                const v = value.trim();
                if (!v) return 'Task description is required.';
                if (v.length > 2000) return 'Description must not exceed 2,000 characters.';
                return '';
            }
            case 'dueAt': {
                if (slaLocked) return '';
                if (!value) return 'Deadline is required.';
                const selected = new Date(value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (selected < today) return 'Deadline must not be in the past.';
                return '';
            }
            case 'assignedTo': {
                return '';
            }
            case 'assignmentScope': {
                if (!value) return 'Assignment scope is required.';
                return '';
            }
            case 'assignedDepartmentId': {
                if (form.assignmentScope === 'Department' && !value) return 'Department is required for Department scope.';
                return '';
            }
            case 'classification': {
                const v = Number(value);
                if (v !== 0 && v !== 1) return 'Classification is required.';
                return '';
            }
            case 'priority': {
                if (!value) return 'Priority is required.';
                if (!['Urgent', 'High', 'Medium', 'Low'].includes(value)) return 'Please select a valid priority.';
                return '';
            }
            default:
                return '';
        }
    };

    // -- Validate all fields on submit -------------------------------------
    const validateAll = (): boolean => {
        const newErrors: Record<string, string> = {};
        (['taskTitle', 'taskDescription', 'dueAt', 'priority', 'classification'] as const).forEach(key => {
            const msg = validateField(key, String(form[key] ?? ''));
            if (msg) newErrors[key] = msg;
        });
        if (form.assignmentScope === 'SingleEmployee' && !form.assignedTo) {
            newErrors.assignedTo = 'Task must be assigned to at least one employee.';
        }
        if (form.assignmentScope === 'Team' && !selectedTeamId) {
            newErrors.assignedTo = 'Select a team to assign the task to.';
        }
        if (form.assignmentScope === 'Department' && !form.assignedDepartmentId) {
            newErrors.assignedDepartmentId = 'Select a department.';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // -- Live change handler -----------------------------------------------
    const set = (key: keyof typeof form) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            const value = e.target.value;
            setForm(prev => ({ ...prev, [key]: value }));
            setFormError('');
            const msg = validateField(key, value);
            setErrors(prev => ({ ...prev, [key]: msg || '' }));
        };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const minDateTime = todayStart.toISOString().slice(0, 16);

    const PRIORITY_MAP: Record<string, number> = { Urgent: 3, High: 2, Medium: 1, Low: 0 };
    const SCOPE_MAP: Record<string, number> = { SingleEmployee: 0, Team: 1, Department: 2 };
    const isUrgent = form.priority === 'Urgent';
    const slaLocked = isUrgent || isSLAEditLock;
    const getSlaDeadline = () => {
        const d = new Date();
        d.setHours(d.getHours() + 24);
        return d;
    };

    const handleSave = async () => {
        if (!validateAll()) return;

        // FR-065: Pre-submit availability validation
        if (form.assignmentScope === 'SingleEmployee' && form.assignedTo) {
            const emp = eligibleEmployees.find(e => e.accountId === form.assignedTo);
            if (emp && !emp.isAvailable) {
                setFormError(`${emp.employeeName} is currently ${emp.availabilityStatus} and cannot be assigned.`);
                return;
            }
        }
        if (form.assignmentScope === 'Team' && selectedTeamId) {
            // Assignees are resolved server-side from the team's members.
        }

        setSubmitting(true);
        const scopeNum = SCOPE_MAP[form.assignmentScope] ?? 0;
        let assignedUserIds: string[] | undefined;
        let assignedDepartmentId: string | undefined;

        if (form.assignmentScope === 'SingleEmployee') {
            assignedUserIds = form.assignedTo ? [form.assignedTo] : undefined;
        } else if (form.assignmentScope === 'Team') {
            // Assignees are resolved server-side from the team's members.
            assignedUserIds = undefined;
        } else if (form.assignmentScope === 'Department') {
            assignedDepartmentId = form.assignedDepartmentId || undefined;
        }

        const payload: CreateTaskDTO = {
            title: form.taskTitle.trim(),
            description: form.taskDescription.trim(),
            priorityLevel: PRIORITY_MAP[form.priority] ?? 1,
            classification: form.classification,
            assignmentScope: scopeNum,
            deadline: form.dueAt ? new Date(form.dueAt).toISOString() : null,
            assignedUserIds,
            assignedDepartmentId,
            teamId: form.assignmentScope === 'Team' ? selectedTeamId || undefined : undefined,
            isConfidential: form.isConfidential,
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
                            </label>
                            <input
                                type="datetime-local"
                                value={form.dueAt}
                                onChange={slaLocked ? undefined : set('dueAt')}
                                min={minDateTime}
                                readOnly={slaLocked}
                                className={`${errors.dueAt ? 'input-error' : form.dueAt ? 'input-success' : ''}${slaLocked ? ' input-sla-locked' : ''}`}
                                style={slaLocked ? { background: '#fef2f2', cursor: 'not-allowed', opacity: 0.85 } : {}}
                            />
                            <FieldErr name="dueAt" />
                            {slaLocked && (
                                <span style={{ fontSize: 11, color: '#7c1d1d', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Lock size={11} /> SLA enforced — deadline locked to 24 hours from creation
                                </span>
                            )}
                            {!slaLocked && !errors.dueAt && form.dueAt && (
                                <span style={{ fontSize: 11, color: 'var(--status-active)', marginTop: 3, display: 'block' }}>
                                    ✓ {new Date(form.dueAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            {!slaLocked && !form.dueAt && !errors.dueAt && (
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                                    Cannot be in the past.
                                </span>
                            )}
                        </div>
                        <div className="field">
                            <label>
                                Priority <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span>
                            </label>
                            <select
                                value={form.priority}
                                onChange={e => {
                                    const val = e.target.value;
                                    setForm(prev => ({ ...prev, priority: val as Priority, dueAt: val === 'Urgent' ? getSlaDeadline().toISOString().slice(0, 16) : prev.dueAt }));
                                    setFormError('');
                                    const msg = validateField('priority', val);
                                    setErrors(prev => ({ ...prev, priority: msg || '' }));
                                }}
                                className={errors.priority ? 'input-error' : ''}
                            >
                                <option value="">Select priority</option>
                                <option value="Urgent">🔴 Urgent</option>
                                <option value="High">🟠 High</option>
                                <option value="Medium">🟡 Medium</option>
                                <option value="Low">🟢 Low</option>
                            </select>
                            <FieldErr name="priority" />
                            {!errors.priority && form.priority && (
                                <span style={{
                                    fontSize: 11, marginTop: 3, display: 'block',
                                    color: form.priority === 'Urgent' ? '#7c1d1d' : form.priority === 'High' ? 'var(--status-failed)' : form.priority === 'Medium' ? 'var(--status-pending)' : 'var(--status-active)',
                                }}>
                                    {form.priority === 'Urgent' && '🔴 Urgent — requires immediate attention'}
                                    {form.priority === 'High' && '🟠 High priority — will be flagged for urgent attention'}
                                    {form.priority === 'Medium' && '🟡 Medium priority selected'}
                                    {form.priority === 'Low' && '🟢 Low priority selected'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* -- Classification -- */}
                    <div className="field">
                        <label>Classification <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {CLASSIFICATION_OPTIONS.map(opt => (
                                <label
                                    key={opt.value}
                                    onClick={() => { setForm(prev => ({ ...prev, classification: opt.value })); setErrors(prev => ({ ...prev, classification: '' })); }}
                                    style={{
                                        flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                                        fontSize: '0.85rem', fontWeight: 600,
                                        border: `1.5px solid ${form.classification === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                                        background: form.classification === opt.value ? 'var(--teal-bg, rgba(0,169,157,0.06))' : 'var(--bg-main)',
                                        color: form.classification === opt.value ? 'var(--primary)' : 'var(--text-secondary)',
                                        transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <input type="radio" name="classification" value={opt.value}
                                        checked={form.classification === opt.value}
                                        onChange={() => { }} style={{ display: 'none' }} />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                        <FieldErr name="classification" />
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
                                    Assignment
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
                                <input
                                    type="text"
                                    className="emp-picker-search"
                                    placeholder="Search employees…"
                                    value={singleSearch}
                                    onChange={e => setSingleSearch(e.target.value)}
                                />
                                {eligibleEmployees.length > 0 ? (
                                    <div className="emp-picker-list">
                                        {(singleSearch
                                            ? eligibleEmployees.filter(e =>
                                                e.employeeName.toLowerCase().includes(singleSearch.toLowerCase()))
                                            : eligibleEmployees
                                        ).map(e => {
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
                                                        </div>
                                                    </div>
                                                    {isRecommended && <span className="emp-picker-tag best">Best pick</span>}
                                                    {isSelected && <span className="emp-picker-tag selected-tag"><CheckCircle2 size={11} /> Selected</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="emp-picker-empty">No eligible employees found for assignment.</div>
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
                                <label>Team <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select
                                    value={selectedTeamId}
                                    onChange={e => { setSelectedTeamId(e.target.value); setErrors(prev => ({ ...prev, assignedTo: '' })); }}
                                    className={errors.assignedTo ? 'input-error' : ''}
                                >
                                    <option value="">Select team</option>
                                    {teamsForTask.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.memberCount} member{t.memberCount !== 1 ? 's' : ''})</option>
                                    ))}
                                </select>
                                {teamsForTask.length === 0 && (
                                    <div style={{ fontSize: 11, color: 'var(--status-warn, #d97706)', marginTop: 4 }}>
                                        None — no teams have been created yet in Team Management.
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
                        <div className="stats-row">
                            <StatusCard icon={<ClipboardList size={20} strokeWidth={2.3} />} variant="teal" label="Total Tasks" value={total} subtext={`${total} task${total !== 1 ? 's' : ''}`} />
                            <StatusCard icon={<Loader2 size={20} strokeWidth={2.3} />} variant="warning" label="Active / In Progress" value={totalActive} subtext={inProgress > 0 ? `${inProgress} in progress` : 'None in progress'} />
                            <StatusCard icon={<Eye size={20} strokeWidth={2.3} />} variant="info" label="Pending Review" value={pendingReview} subtext={pendingReview > 0 ? 'Awaiting admin review' : 'All reviewed'} />
                            <StatusCard icon={<CheckCircle2 size={20} strokeWidth={2.3} />} variant="success" label="Completed Today" value={completedToday} subtext={completedToday > 0 ? `Out of ${total} total` : 'No completions yet'} />
                            <StatusCard icon={<Clock size={20} strokeWidth={2.3} />} variant="new" label="On Hold" value={onHold} subtext={onHold > 0 ? `${onHold} paused` : 'None on hold'} />
                            <StatusCard icon={<AlertCircle size={20} strokeWidth={2.3} />} variant="danger" label="Overdue" value={overdue} subtext={overdue > 0 ? `${overdue} past deadline` : 'No overdue tasks'} />
                        </div>
                    ) : (
                        <div className="stats-row">
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
                                <select value={wlFilters.employeeId} style={{ height: 36, borderRadius: 'var(--r-sm, 8px)', border: '1px solid var(--border)', padding: '0 8px', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                    onChange={e => setWlFilters(p => ({ ...p, employeeId: e.target.value }))}>
                                    <option value="">All Employees</option>
                                    {dashboardEmployees.map(m => (<option key={m.employeeId} value={m.employeeId}>{m.employeeName}</option>))}
                                </select>
                                <select value={wlFilters.departmentId} style={{ height: 36, borderRadius: 'var(--r-sm, 8px)', border: '1px solid var(--border)', padding: '0 8px', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                    onChange={e => setWlFilters(p => ({ ...p, departmentId: e.target.value }))}>
                                    <option value="">All Departments</option>
                                    {dashboardDepartments.map(d => (<option key={d.departmentId} value={d.departmentId}>{d.departmentName}</option>))}
                                </select>
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
                        <select value={filterEmployee} onChange={e => { setFilterEmployee(e.target.value); setTaskPage(1); }}>
                            <option value="">All Employees</option>
                            {teamMembers.map(m => (
                                <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>
                            ))}
                        </select>
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
    const { success, error } = useToast();
    const [templates, setTemplates] = useState<TaskTemplateDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<TaskTemplateDTO | null>(null);
    const [templatePage, setTemplatePage] = useState(1);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/TaskTemplate');
            const body = res.data;
            const list: any[] = body.isSuccess && Array.isArray(body.data?.items) ? body.data.items : (Array.isArray(body.data) ? body.data : (Array.isArray(body.data?.data) ? body.data.data : []));
            setTemplates(list.map((t: any) => ({
                templateId: t.id ?? t.templateId,
                templateName: t.templateName ?? '',
                defaultTitle: t.defaultTitle ?? '',
                templateDescription: t.defaultDescription ?? '',
                priorityLevel: String(t.defaultPriorityLevel ?? t.priorityLevel ?? 'Medium'),
                recurrenceType: String(t.recurrenceRule ?? t.recurrenceType ?? 'Daily'),
                recurrenceStartDate: t.recurrenceStartDate ?? '',
                assignedEmployeeId: t.defaultAssigneeId ?? t.assignedEmployeeId ?? null,
                assignedEmployeeName: t.assignedEmployeeName ?? null,
                templateStatus: t.isActive ? 'Active' : 'Inactive',
                nextGenerationDate: t.nextGenerationDate ?? null,
                lastGeneratedDate: t.lastGeneratedDate ?? null,
                createdBy: t.createdBy ?? '',
                createdByName: t.createdByName ?? null,
                createdAt: t.createdAt ?? '',
            })));
        } catch {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTemplates(); }, []);

    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const handleDeleteTemplate = async (templateId: string) => {
        try {
            await api.delete(`/api/TaskTemplate/${templateId}`);
            success('Task template deleted successfully.');
            setDeleteConfirm(null);
            await fetchTemplates();
        } catch (err: any) {
            error(err.message ?? 'Failed to delete template.');
        }
    };

    const handleToggle = async (templateId: string, currentStatus: string) => {
        try {
            await api.put(`/api/TaskTemplate/${templateId}`, { isActive: currentStatus !== 'Active' });
            success('Template status updated successfully.');
            await fetchTemplates();
        } catch (err: any) {
            error(err.message ?? 'Failed to toggle template status.');
        }
    };

    const handleDeploy = async (templateId: string) => {
        try {
            await api.post(`/api/TaskTemplate/${templateId}/deploy`);
            success('Task deployed successfully from template.');
            await fetchTemplates();
        } catch (err: any) {
            error(err.message ?? 'Failed to deploy task from template.');
        }
    };

    const PRIO_TO_BACKEND: Record<string, number> = { Low: 0, Medium: 1, High: 2, Urgent: 3 };
    const RECUR_TO_BACKEND: Record<string, number> = { Daily: 0, Weekly: 1, Monthly: 2 };
    const handleSave = async (data: CreateTemplateDTO, templateId?: string) => {
        const backendPayload = {
            templateName: data.templateName,
            defaultTitle: data.defaultTitle || data.templateName,
            defaultDescription: data.templateDescription,
            defaultPriorityLevel: PRIO_TO_BACKEND[data.priorityLevel] ?? 1,
            defaultClassification: 0,
            recurrenceRule: RECUR_TO_BACKEND[data.recurrenceType] ?? 0,
            recurrenceStartDate: data.recurrenceStartDate,
            defaultAssigneeId: data.assignedEmployee || null,
            isActive: data.templateStatus === 'Active',
        };
        if (templateId) {
            await api.put(`/api/TaskTemplate/${templateId}`, backendPayload);
            success('Task template updated successfully.');
        } else {
            await api.post('/api/TaskTemplate', backendPayload);
            success('Task template created successfully.');
        }
        await fetchTemplates();
        setShowModal(false);
        setEditingTemplate(null);
    };

    const openEdit = (t: TaskTemplateDTO) => {
        setEditingTemplate(t);
        setShowModal(true);
    };

    const fmtTemplateDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const tmplTotalPages = Math.max(1, Math.ceil(templates.length / PER_PAGE));
    const pagedTemplates = templates.slice((templatePage - 1) * PER_PAGE, templatePage * PER_PAGE);

    return (
        <div className="dashboard-content">
            <DataTable
                title="Task Templates"
                totalResults={templates.length}
                actionButton={{ label: 'Create Template', icon: <Plus size={14} />, onClick: () => { setEditingTemplate(null); setShowModal(true); } }}
                loading={loading}
                emptyMessage="No task templates found."
                emptyIcon={<Copy size={20} />}
                headers={['TEMPLATE NAME', 'PRIORITY', 'RECURRENCE', 'NEXT GENERATION', 'ASSIGNEE', 'STATUS', 'ACTIONS']}
                currentPage={templatePage} totalPages={tmplTotalPages} onPageChange={setTemplatePage}
            >
                {pagedTemplates.map(t => (
                    <tr key={t.templateId}>
                        <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{t.templateName}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.templateDescription}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Task title: {t.defaultTitle || t.templateName}</div>
                        </td>
                        <td><PrioBadge p={t.priorityLevel as Priority} /></td>
                        <td>
                            <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Repeat size={12} /> {RECURRENCE_LABELS[t.recurrenceType] ?? t.recurrenceType}
                            </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtTemplateDate(t.nextGenerationDate)}</td>
                        <td style={{ fontSize: 13 }}>{t.assignedEmployeeName || 'Auto-assign'}</td>
                        <td>
                            <StatusBadge status={t.templateStatus} size="sm" />
                        </td>
                        <td>
                            <ActionsDropdown
                                actions={[
                                    { label: 'Edit', icon: <Pencil size={12} />, onClick: () => openEdit(t) },
                                    { label: 'Deploy Now', icon: <Play size={12} />, onClick: () => handleDeploy(t.templateId), variant: 'success' as const },
                                    {
                                        label: t.templateStatus === 'Active' ? 'Deactivate' : 'Activate',
                                        icon: <ToggleLeft size={12} />,
                                        onClick: () => handleToggle(t.templateId, t.templateStatus),
                                        variant: 'default' as const,
                                    },
                                    {
                                        label: 'Delete',
                                        icon: <Trash2 size={12} />,
                                        onClick: () => setDeleteConfirm(t.templateId),
                                        variant: 'danger' as const,
                                    },
                                ]}
                            />
                        </td>
                    </tr>
                ))}
            </DataTable>

            <ConfirmationModal
                isOpen={deleteConfirm !== null}
                variant="danger"
                title="Delete Task Template"
                description="Are you sure you want to delete this task template? This action cannot be undone."
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={() => deleteConfirm && handleDeleteTemplate(deleteConfirm)}
                onCancel={() => setDeleteConfirm(null)}
            />

            {showModal && (
                <TemplateModal
                    template={editingTemplate}
                    teamMembers={teamMembers}
                    onSave={handleSave}
                    onClose={() => { setShowModal(false); setEditingTemplate(null); }}
                />
            )}
        </div>
    );
};

// --- Template Create/Edit Modal ----------------------------------------------

interface TemplateModalProps {
    template: TaskTemplateDTO | null;
    teamMembers: TeamMember[];
    onSave: (data: CreateTemplateDTO, templateId?: string) => Promise<void>;
    onClose: () => void;
}

const TemplateModal: React.FC<TemplateModalProps> = ({ template, teamMembers, onSave, onClose }) => {
    const isEdit = !!template;
    const [form, setForm] = useState({
        templateName: template?.templateName ?? '',
        defaultTitle: template?.defaultTitle ?? '',
        templateDescription: template?.templateDescription ?? '',
        priorityLevel: template?.priorityLevel ?? 'Medium',
        recurrenceType: template?.recurrenceType ?? 'Daily',
        recurrenceStartDate: template?.recurrenceStartDate ? template.recurrenceStartDate.substring(0, 10) : '',
        assignedEmployee: template?.assignedEmployeeId ?? '',
        templateStatus: template?.templateStatus ?? 'Active',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');

    const validate = (): boolean => {
        const e: Record<string, string> = {};
        if (!form.templateName.trim()) e.templateName = 'Template name is required.';
        else if (form.templateName.length > 150) e.templateName = 'Must not exceed 150 characters.';
        if (!form.defaultTitle.trim()) e.defaultTitle = 'Default title is required.';
        else if (form.defaultTitle.length > 150) e.defaultTitle = 'Must not exceed 150 characters.';
        if (!form.templateDescription.trim()) e.templateDescription = 'Description is required.';
        else if (form.templateDescription.length > 2000) e.templateDescription = 'Must not exceed 2000 characters.';
        if (!form.recurrenceStartDate) e.recurrenceStartDate = 'Start date is required.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSubmitting(true);
        setApiError('');
        try {
            await onSave({
                templateName: form.templateName.trim(),
                defaultTitle: form.defaultTitle.trim(),
                templateDescription: form.templateDescription.trim(),
                priorityLevel: form.priorityLevel,
                recurrenceType: form.recurrenceType,
                recurrenceStartDate: form.recurrenceStartDate,
                assignedEmployee: form.assignedEmployee || null,
                templateStatus: form.templateStatus,
            }, template?.templateId);
        } catch (err: any) {
            setApiError(err.message ?? 'Operation failed.');
        } finally {
            setSubmitting(false);
        }
    };

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setForm(p => ({ ...p, [key]: e.target.value }));
        setErrors(p => ({ ...p, [key]: '' }));
    };

    const FieldErr = ({ name }: { name: string }) => errors[name] ? <span className="report-field-error">{errors[name]}</span> : null;

    return (
        <FormModal isOpen onClose={onClose}
            title={isEdit ? 'Edit Task Template' : 'Create Task Template'}
            subtitle={isEdit ? 'Update the template details below.' : 'Fill in the details to create a recurring task template.'}
            size="md" confirmOnCancel={true}
            footer={
                <>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Save size={13} /> {isEdit ? 'Update Template' : 'Create Template'}</>}
                    </button>
                </>
            }
        >
            {apiError && <div className="report-error-msg" style={{ marginBottom: 14 }}>{apiError}</div>}

            <div className="field">
                <label>Template Name *</label>
                <input type="text" className={errors.templateName ? 'report-input report-input-error' : 'report-input'}
                    value={form.templateName} onChange={set('templateName')} maxLength={150} placeholder="e.g. Weekly Warehouse Inventory" />
                <FieldErr name="templateName" />
            </div>

            <div className="field">
                <label>Default Task Title *</label>
                <input type="text" className={errors.defaultTitle ? 'report-input report-input-error' : 'report-input'}
                    value={form.defaultTitle} onChange={set('defaultTitle')} maxLength={150} placeholder="e.g. Conduct weekly warehouse inventory" />
                <FieldErr name="defaultTitle" />
            </div>

            <div className="field">
                <label>Template Description *</label>
                <textarea className={errors.templateDescription ? 'report-input report-input-error' : 'report-input'}
                    rows={3} value={form.templateDescription} onChange={set('templateDescription')} maxLength={2000} placeholder="Describe the recurring task..." />
                <FieldErr name="templateDescription" />
                <span style={{ fontSize: 11, marginTop: 3, display: 'block', textAlign: 'right', color: 'var(--text-secondary)' }}>{form.templateDescription.length}/2000</span>
            </div>

            <div className="field-row">
                <div className="field">
                    <label>Priority Level</label>
                    <select className="report-select" value={form.priorityLevel} onChange={set('priorityLevel')}>
                        {PRIORITY_LEVELS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="field">
                    <label>Recurrence Type</label>
                    <select className="report-select" value={form.recurrenceType} onChange={set('recurrenceType')}>
                        {RECURRENCE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
            </div>

            <div className="field-row">
                <div className="field">
                    <label>Recurrence Start Date *</label>
                    <input type="date" className={errors.recurrenceStartDate ? 'report-input report-input-error' : 'report-input'}
                        value={form.recurrenceStartDate} onChange={set('recurrenceStartDate')} />
                    <FieldErr name="recurrenceStartDate" />
                </div>
                <div className="field">
                    <label>Assigned Employee</label>
                    <select className="report-select" value={form.assignedEmployee} onChange={set('assignedEmployee')}>
                        <option value="">Auto-assign (unassigned)</option>
                        {teamMembers.map(m => <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>)}
                    </select>
                </div>
            </div>

            <div className="field">
                <label>Template Status</label>
                <div style={{ display: 'flex', gap: 8 }}>
                    {TEMPLATE_STATUSES.map(s => (
                        <button key={s} type="button"
                            className={`filter-pill${form.templateStatus === s ? ' active' : ''}`}
                            onClick={() => { setForm(p => ({ ...p, templateStatus: s })); }}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>
        </FormModal>
    );
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
                {teamsLoading ? (
                    <div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading teams...</p></div>
                ) : teamsError ? (
                    <div className="empty-state"><AlertCircle size={22} /><p>{teamsError}</p></div>
                ) : teams.length === 0 ? (
                    <div className="empty-state"><Users size={22} /><p>No teams yet. Create a team to get started.</p></div>
                ) : (
                    <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                        {teams.map(t => (
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
            return json?.message || json?.title || fallback;
        }
    } catch { /* ignore parse errors */ }
    return err?.response?.data?.message || err?.message || fallback;
}

export const ReportsTab: React.FC<{ teamMembers: Array<{ accountId: string; employeeName: string; role?: string }> }> = ({ teamMembers }) => {
    const { success, error } = useToast();
    const [reportSubTab, setReportSubTab] = useState<'kpi-tracking' | 'performance-report' | 'foms-export' | 'task-completion' | 'operational-summary'>('kpi-tracking');

    const DATE_PRESETS = [
        { label: '1 Month', months: 1 },
        { label: '3 Months', months: 3 },
        { label: '6 Months', months: 6 },
        { label: '12 Months', months: 12 },
    ] as const;

    const getDateRangeMonths = (months: number) => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - months);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        };
    };

    const getDateRangeDays = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        };
    };

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

    // --- KPI Tracking State ---
    const initialKpiDates = useMemo(() => getDateRangeMonths(1), []);
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

    // --- Performance Report State ---
    const initialPrDates = useMemo(() => getDateRangeDays(30), []);
    const [prFilter, setPrFilter] = useState<{
        period: 'Weekly' | 'Monthly';
        dateRangeStart: string;
        dateRangeEnd: string;
        employeeId: string;
        departmentId: string;
    }>({
        period: 'Weekly',
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

    const handlePrExport = async (format: 'Excel' | 'Pdf') => {
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
            const contentDisposition = res.headers['content-disposition'];
            const match = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            const fileName = match?.[1]?.replace(/['"]/g, '') || `Performance_Report_${prFilter.dateRangeStart}_${prFilter.dateRangeEnd}.${format === 'Excel' ? 'xlsx' : 'pdf'}`;
            const mimeType = format === 'Excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf';
            const url = URL.createObjectURL(new Blob([res.data], { type: mimeType }));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            success(`${format} report downloaded successfully.`);
        } catch (err: any) {
            const msg = await readBlobError(err, 'Export failed. Please try again.');
            error(msg);
        } finally {
            setPrExporting(false);
        }
    };

    // --- FOMS Export State ---
    const initialFomsDates = useMemo(() => getDateRangeDays(30), []);
    const [fomsFilter, setFomsFilter] = useState<{ dateRangeStart: string; dateRangeEnd: string; employeeId: string }>({
        dateRangeStart: initialFomsDates.start,
        dateRangeEnd: initialFomsDates.end,
        employeeId: '',
    });
    const [fomsExporting, setFomsExporting] = useState(false);
    const [fomsError, setFomsError] = useState('');

    const handleFomsExport = async () => {
        if (!fomsFilter.dateRangeStart || !fomsFilter.dateRangeEnd) {
            setFomsError('Please select a date range.');
            return;
        }
        const start = new Date(fomsFilter.dateRangeStart);
        const end = new Date(fomsFilter.dateRangeEnd);
        if (start > end) {
            setFomsError('Start date must be before end date.');
            return;
        }
        setFomsExporting(true);
        setFomsError('');
        try {
            const body: Record<string, any> = {
                dateRangeStart: fomsFilter.dateRangeStart,
                dateRangeEnd: fomsFilter.dateRangeEnd,
            };
            if (fomsFilter.employeeId) body.employeeId = fomsFilter.employeeId;
            const res = await axios.post('/api/foms/export', body, { responseType: 'blob' });
            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                const msg = json?.message || 'FOMS export failed.';
                setFomsError(msg);
                error(msg);
                return;
            }
            const contentDisposition = res.headers['content-disposition'];
            const match = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            const fileName = match?.[1]?.replace(/['"]/g, '') || `foms_export_${fomsFilter.dateRangeStart}_to_${fomsFilter.dateRangeEnd}.csv`;
            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            success('FOMS export completed successfully.');
        } catch (err: any) {
            const msg = await readBlobError(err, 'FOMS export failed. Please try again.');
            setFomsError(msg);
            error(msg);
        } finally {
            setFomsExporting(false);
        }
    };

    // --- Task Completion State ---
    const initialTcDates = useMemo(() => getDateRangeMonths(1), []);
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
    const [tcError, setTcError] = useState('');
    const [tcNoRecords, setTcNoRecords] = useState(false);
    const [tcGeneratedAt, setTcGeneratedAt] = useState('');

    const applyTcPreset = (months: number) => {
        const { start, end } = getDateRangeMonths(months);
        setTcFilter(p => ({
            ...p,
            dateRangeStart: start,
            dateRangeEnd: end,
        }));
    };

    const handleTcGenerate = async () => {
        if (!tcFilter.dateRangeStart || !tcFilter.dateRangeEnd) {
            setTcError('Please select a date range preset first.');
            return;
        }
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
        setTcFilter({ dateRangeStart: initialTcDates.start, dateRangeEnd: initialTcDates.end, employeeId: '', taskPriorityLevel: '', taskStatus: '', taskCategory: '' });
        setTcReport(null); setTcError(''); setTcNoRecords(false); setTcGeneratedAt('');
    };

    const exportCSV = () => {
        if (!tcReport) return;
        const rows: string[] = [];
        rows.push('Task Completion Report');
        rows.push(`Generated,${tcGeneratedAt}`);
        rows.push(''); rows.push('Summary');
        rows.push(`Total Tasks Assigned,${tcReport.totalTasksAssigned}`);
        rows.push(`Total Tasks Completed,${tcReport.totalTasksCompleted}`);
        rows.push(`Total Tasks In Progress,${tcReport.totalTasksInProgress}`);
        rows.push(`Total Tasks Pending Review,${tcReport.totalTasksPendingReview}`);
        rows.push(`Total Overdue Tasks,${tcReport.totalOverdueTasks}`);
        rows.push(`Task Completion Rate,${tcReport.taskCompletionRate}%`);
        rows.push(`Avg Completion Time (Hours),${(tcReport.averageTaskCompletionTimeHours ?? 0).toFixed(1)}`);
        rows.push(''); rows.push('Employee Performance');
        rows.push('Employee,Assigned,Completed,Completion Rate,Avg Time (Hours)');
        for (const ep of (tcReport.employeePerformanceSummary || [])) {
            rows.push(`${ep.employeeName},${ep.totalAssigned},${ep.totalCompleted},${ep.completionRate}%,${(ep.averageCompletionTimeHours ?? 0).toFixed(1)}`);
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task-completion-report-${tcFilter.dateRangeStart}-to-${tcFilter.dateRangeEnd}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        success('CSV exported successfully.');
    };

    const tcChartData = tcReport
        ? [
            { name: 'Completed', value: tcReport.totalTasksCompleted, fill: 'var(--status-active)' },
            { name: 'In Progress', value: tcReport.totalTasksInProgress, fill: 'var(--status-pending)' },
            { name: 'Pending Review', value: tcReport.totalTasksPendingReview, fill: 'var(--primary)' },
            { name: 'Overdue', value: tcReport.totalOverdueTasks, fill: 'var(--status-failed)' },
        ].filter(d => d.value > 0) : [];

    // --- Operational Summary State ---
    const initialOpDates = useMemo(() => getDateRangeMonths(1), []);
    const [opFilter, setOpFilter] = useState<OperationalFilter>({
        dateRangeStart: initialOpDates.start, dateRangeEnd: initialOpDates.end, departmentId: '', employeeId: '', reportFormat: 'PDF',
    });
    const [opReport, setOpReport] = useState<OperationalSummaryReport | null>(null);
    const [opLoading, setOpLoading] = useState(false);
    const [opDownloading, setOpDownloading] = useState(false);
    const [opError, setOpError] = useState('');
    const [opNoRecords, setOpNoRecords] = useState(false);
    const [opGeneratedAt, setOpGeneratedAt] = useState('');

    const applyOpPreset = (months: number) => {
        const { start, end } = getDateRangeMonths(months);
        setOpFilter(p => ({
            ...p,
            dateRangeStart: start,
            dateRangeEnd: end,
        }));
    };

    const handleOpGenerate = async () => {
        if (!opFilter.dateRangeStart || !opFilter.dateRangeEnd) {
            setOpError('Please select a date range preset first.');
            return;
        }
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
        setOpFilter({ dateRangeStart: initialOpDates.start, dateRangeEnd: initialOpDates.end, departmentId: '', employeeId: '', reportFormat: 'PDF' });
        setOpReport(null); setOpError(''); setOpNoRecords(false); setOpGeneratedAt('');
    };

    const handleOpDownload = async () => {
        if (!opReport) return;
        setOpDownloading(true);
        try {
            const params = new URLSearchParams();
            params.set('DateRangeStart', opFilter.dateRangeStart);
            params.set('DateRangeEnd', opFilter.dateRangeEnd);
            if (opFilter.departmentId) params.set('DepartmentId', opFilter.departmentId);
            if (opFilter.employeeId) params.set('EmployeeId', opFilter.employeeId);
            params.set('ReportFormat', opFilter.reportFormat);

            const res = await axios.get(`/api/reports/operational-summary/download?${params}`, { responseType: 'blob' });

            const contentType = res.headers['content-type'] ?? '';
            if (contentType.includes('application/json')) {
                const text = await (res.data as Blob).text();
                const json = JSON.parse(text);
                error(json?.message || 'Failed to download report.');
                return;
            }
            const mimeType = opFilter.reportFormat === 'EXCEL'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf';
            const url = URL.createObjectURL(new Blob([res.data], { type: mimeType }));
            const a = document.createElement('a');
            const ext = opFilter.reportFormat === 'EXCEL' ? 'xlsx' : 'pdf';
            a.href = url;
            a.download = `OperationalSummaryReport_${new Date().toISOString().slice(0, 10)}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            success('Report downloaded successfully.');
        } catch (err: any) {
            const msg = await readBlobError(err, 'Failed to download report. Please try again.');
            error(msg);
        } finally {
            setOpDownloading(false);
        }
    };

    return (
        <div className="dashboard-content" style={{ padding: 0 }}>
            <SubTabNav
                tabs={[
                    { key: 'kpi-tracking', label: 'KPI Tracking', icon: <BarChart3 size={14} /> },
                    { key: 'performance-report', label: 'Performance Report', icon: <BarChart3 size={14} /> },
                    { key: 'foms-export', label: 'FOMS Export', icon: <Download size={14} /> },
                    { key: 'task-completion', label: 'Task Completion Report', icon: <FileText size={14} /> },
                    { key: 'operational-summary', label: 'Operational Summary Report', icon: <BarChart3 size={14} /> },
                ]}
                activeTab={reportSubTab}
                onTabChange={key => setReportSubTab(key as 'kpi-tracking' | 'performance-report' | 'foms-export' | 'task-completion' | 'operational-summary')}
            />

            {reportSubTab === 'kpi-tracking' && (
                <>
                    <div className="card report-filter-card">
                        <div className="card-header-layout">
                            <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>KPI Tracking</h3>
                        </div>
                        <div className="report-filter-grid">
                            <div className="field">
                                <label>Date Range</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {DATE_PRESETS.map(p => {
                                        const { start } = getDateRangeMonths(p.months);
                                        const isActive = kpiFilter.dateRangeStart === start;
                                        return (
                                            <button key={p.label}
                                                type="button"
                                                className={`filter-pill${isActive ? ' active' : ''}`}
                                                style={{ fontSize: 12, padding: '6px 14px' }}
                                                onClick={() => {
                                                    const { start: s, end: e } = getDateRangeMonths(p.months);
                                                    setKpiFilter(prev => ({
                                                        ...prev,
                                                        dateRangeStart: s,
                                                        dateRangeEnd: e,
                                                    }));
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {kpiFilter.dateRangeStart && kpiFilter.dateRangeEnd && (
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                        {kpiFilter.dateRangeStart} → {kpiFilter.dateRangeEnd}
                                    </span>
                                )}
                            </div>
                            <div className="field">
                                <label>Employee</label>
                                <select value={kpiFilter.employeeId}
                                    onChange={e => setKpiFilter(prev => ({ ...prev, employeeId: e.target.value }))}
                                >
                                    <option value="">All Employees</option>
                                    {allEmployeeOptions.map(m => (
                                        <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field" style={{ alignSelf: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleKpiGenerate} disabled={kpiLoading}>
                                    {kpiLoading ? <><Loader2 size={14} className="spin" /> Generating...</> : <>Generate Report</>}
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
                            <div className="stats-row" style={{ marginTop: 16 }}>
                                {[
                                    { label: 'Total Completed', value: kpiData.totalCompletedTasks, icon: <CheckCircle2 size={18} />, variant: 'teal', subtext: 'Completed tasks' },
                                    { label: 'On-Time', value: kpiData.totalOnTimeTasks, icon: <CheckCircle2 size={18} />, variant: 'success', subtext: `${kpiData.overallOnTimeRate}% rate` },
                                    { label: 'Late', value: kpiData.totalLateTasks, icon: <AlertCircle size={18} />, variant: 'danger', subtext: `${kpiData.overallLateRate}% rate` },
                                ].map(s => (
                                    <StatusCard key={s.label} icon={s.icon} variant={s.variant as any} label={s.label} value={s.value} subtext={s.subtext} />
                                ))}
                            </div>

                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>Per-Employee Breakdown</h3>
                                    {kpiData.employeeKpis && <span className="badge badge-blue">{kpiData.employeeKpis.length} employees</span>}
                                </div>
                                {kpiData.employeeKpis && kpiData.employeeKpis.length > 0 ? (
                                    <table className="table-card-data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th>Employee</th>
                                                <th>Department</th>
                                                <th style={{ textAlign: 'center' }}>Completed</th>
                                                <th style={{ textAlign: 'center' }}>On-Time</th>
                                                <th style={{ textAlign: 'center' }}>Late</th>
                                                <th style={{ textAlign: 'center' }}>On-Time Rate</th>
                                                <th style={{ textAlign: 'center' }}>Late Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {kpiData.employeeKpis.map((kpi: any) => {
                                                const onTimeRate = kpi.onTimeRate ?? 0;
                                                const isGood = onTimeRate >= 80;
                                                const isWarning = onTimeRate >= 50 && onTimeRate < 80;
                                                return (
                                                    <tr key={kpi.employeeId} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{kpi.employeeName}</td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{kpi.department}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{kpi.totalCompleted}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--status-active)' }}>{kpi.onTimeCount}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--status-failed)' }}>{kpi.lateCount}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                            <span style={{
                                                                display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                                                                fontSize: 12, fontWeight: 700,
                                                                background: isGood ? 'rgba(5,205,153,0.12)' : isWarning ? 'rgba(255,181,71,0.12)' : 'rgba(238,93,80,0.12)',
                                                                color: isGood ? 'var(--status-active)' : isWarning ? 'var(--status-pending)' : 'var(--status-failed)',
                                                            }}>
                                                                {onTimeRate}%
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{kpi.lateRate}%</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
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

            {reportSubTab === 'performance-report' && (
                <>
                    <div className="card report-filter-card">
                        <div className="card-header-layout">
                            <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>Performance Report</h3>
                        </div>
                        <div className="report-filter-grid">
                            <div className="field">
                                <label>Date Range *</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'Last 7 Days', days: 7 },
                                        { label: 'Last 30 Days', days: 30 },
                                        { label: 'Last 90 Days', days: 90 },
                                    ].map(p => {
                                        const { start } = getDateRangeDays(p.days);
                                        const isActive = prFilter.dateRangeStart === start;
                                        return (
                                            <button key={p.label}
                                                type="button"
                                                className={`filter-pill${isActive ? ' active' : ''}`}
                                                style={{ fontSize: 12, padding: '6px 14px' }}
                                                onClick={() => {
                                                    const { start: s, end: e } = getDateRangeDays(p.days);
                                                    setPrFilter(prev => ({ ...prev, dateRangeStart: s, dateRangeEnd: e }));
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {prFilter.dateRangeStart && prFilter.dateRangeEnd && (
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                        {prFilter.dateRangeStart} → {prFilter.dateRangeEnd}
                                    </span>
                                )}
                            </div>
                            <div className="field">
                                <label>Period *</label>
                                <select value={prFilter.period} onChange={e => setPrFilter(prev => ({ ...prev, period: e.target.value as 'Weekly' | 'Monthly' }))}>
                                    <option value="Weekly">Weekly</option>
                                    <option value="Monthly">Monthly</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Employee</label>
                                <select value={prFilter.employeeId} onChange={e => setPrFilter(prev => ({ ...prev, employeeId: e.target.value }))}>
                                    <option value="">All Employees</option>
                                    {allEmployeeOptions.map(m => (
                                        <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label>Department</label>
                                <select value={prFilter.departmentId} onChange={e => setPrFilter(prev => ({ ...prev, departmentId: e.target.value }))}>
                                    <option value="">All Departments</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field" style={{ alignSelf: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handlePrGenerate} disabled={prLoading}>
                                    {prLoading ? <><Loader2 size={14} className="spin" /> Generating...</> : <>Generate Report</>}
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
                            <div className="stats-row" style={{ marginTop: 16 }}>
                                {[
                                    { label: 'Total Completed', value: prData.totalCompletedTasks, icon: <CheckCircle2 size={18} />, variant: 'teal' as const, subtext: 'Completed tasks' },
                                    { label: 'On-Time', value: Math.round((prData.totalCompletedTasks ?? 0) * ((prData.overallOnTimeRate ?? 0) / 100)), icon: <CheckCircle2 size={18} />, variant: 'success' as const, subtext: `${prData.overallOnTimeRate ?? 0}% rate` },
                                    { label: 'Late', value: Math.round((prData.totalCompletedTasks ?? 0) * ((prData.overallLateRate ?? 0) / 100)), icon: <AlertCircle size={18} />, variant: 'danger' as const, subtext: `${prData.overallLateRate ?? 0}% rate` },
                                ].map(s => (
                                    <StatusCard key={s.label} icon={s.icon} variant={s.variant} label={s.label} value={s.value} subtext={s.subtext} />
                                ))}
                            </div>

                            <div className="card" style={{ marginTop: 16 }}>
                                <div className="card-header-layout">
                                    <h3>Employee Breakdown ({prData.period})</h3>
                                    <span className="badge badge-blue">{prData.employeeBreakdown?.length || 0} employees</span>
                                </div>
                                {prData.employeeBreakdown && prData.employeeBreakdown.length > 0 ? (
                                    <table className="table-card-data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th>Employee</th>
                                                <th>Department</th>
                                                <th>Role</th>
                                                <th style={{ textAlign: 'center' }}>Completed</th>
                                                <th style={{ textAlign: 'center' }}>On-Time</th>
                                                <th style={{ textAlign: 'center' }}>Late</th>
                                                <th style={{ textAlign: 'center' }}>On-Time Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {prData.employeeBreakdown.map((kpi: any) => {
                                                const rate = kpi.onTimeRate ?? 0;
                                                return (
                                                    <tr key={kpi.employeeId} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{kpi.employeeName}</td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{kpi.department}</td>
                                                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{kpi.role}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{kpi.totalCompleted}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--status-active)' }}>{kpi.onTimeCount}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--status-failed)' }}>{kpi.lateCount}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                            <span style={{
                                                                display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                                                                fontSize: 12, fontWeight: 700,
                                                                background: rate >= 80 ? 'rgba(5,205,153,0.12)' : rate >= 50 ? 'rgba(255,181,71,0.12)' : 'rgba(238,93,80,0.12)',
                                                                color: rate >= 80 ? 'var(--status-active)' : rate >= 50 ? 'var(--status-pending)' : 'var(--status-failed)',
                                                             }}>{rate}%</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="empty-state" style={{ padding: '32px 0' }}>
                                        <CheckCircle2 size={22} />
                                        <p>No completed tasks found for the selected criteria.</p>
                                    </div>
                                )}
                                <div className="report-export-row">
                                    <span className="report-generated-badge">
                                        <Calendar size={12} /> {prData.dateRangeStart?.split('T')[0]} to {prData.dateRangeEnd?.split('T')[0]}
                                    </span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-primary" onClick={() => handlePrExport('Excel')} disabled={prExporting}>
                                            {prExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Export Excel
                                        </button>
                                        <button className="btn btn-primary" onClick={() => handlePrExport('Pdf')} disabled={prExporting}>
                                            {prExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Export PDF
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {reportSubTab === 'foms-export' && (
                <>
                    <div className="card report-filter-card">
                        <div className="card-header-layout">
                            <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>FOMS Export</h3>
                            <span className="badge badge-blue">CSV</span>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, padding: '0 24px' }}>
                            Export completed task records for the Field Operations Management System.
                            Only reviewed and completed tasks are included.
                        </p>
                        <div className="report-filter-grid">
                            <div className="field">
                                <label>Date Range *</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'Last 7 Days', days: 7 },
                                        { label: 'Last 30 Days', days: 30 },
                                        { label: 'Last 90 Days', days: 90 },
                                    ].map(p => {
                                        const { start } = getDateRangeDays(p.days);
                                        const isActive = fomsFilter.dateRangeStart === start;
                                        return (
                                            <button key={p.label}
                                                type="button"
                                                className={`filter-pill${isActive ? ' active' : ''}`}
                                                style={{ fontSize: 12, padding: '6px 14px' }}
                                                onClick={() => {
                                                    const { start: s, end: e } = getDateRangeDays(p.days);
                                                    setFomsFilter(prev => ({ ...prev, dateRangeStart: s, dateRangeEnd: e }));
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {fomsFilter.dateRangeStart && fomsFilter.dateRangeEnd && (
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                        {fomsFilter.dateRangeStart} → {fomsFilter.dateRangeEnd}
                                    </span>
                                )}
                            </div>
                            <div className="field">
                                <label>Employee</label>
                                <select value={fomsFilter.employeeId} onChange={e => setFomsFilter(prev => ({ ...prev, employeeId: e.target.value }))}>
                                    <option value="">All Employees</option>
                                    {allEmployeeOptions.map(m => (
                                        <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field" style={{ alignSelf: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleFomsExport} disabled={fomsExporting}>
                                    {fomsExporting ? <><Loader2 size={14} className="spin" /> Exporting...</> : <><Download size={14} /> Export to CSV</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {fomsError && (
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="empty-state">
                                <AlertCircle size={22} style={{ color: 'var(--danger)' }} />
                                <p>{fomsError}</p>
                            </div>
                        </div>
                    )}

                    <div className="card" style={{ marginTop: 16 }}>
                        <div className="card-header-layout">
                            <h3>Export Format</h3>
                        </div>
                        <div style={{ padding: '16px 24px' }}>
                            <table style={{ width: '100%', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Column</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Source</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['TaskReferenceNumber', 'Task identifier', 'Task title (truncated)'],
                                        ['Title', 'Full task title', 'Task title'],
                                        ['Status', 'Task status', 'Always "Completed"'],
                                        ['Priority', 'Priority level', 'Task priority level'],
                                        ['Classification', 'Task classification', 'Task classification'],
                                        ['AssignedEmployee', 'Assigned employee(s)', 'Task assignments'],
                                        ['Department', 'Department name', 'Assigned department'],
                                        ['Deadline', 'Original deadline', 'Task deadline'],
                                        ['RevisedDeadline', 'Revised deadline (if any)', 'Revised deadline'],
                                        ['CreatedAt', 'Task creation timestamp', 'Created timestamp'],
                                        ['CompletedAt', 'Completion timestamp', 'Updated timestamp'],
                                        ['DurationHours', 'Total duration in hours', 'CompletedAt - CreatedAt'],
                                        ['IsOnTime', 'Whether completed on time', 'CompletedAt <= Deadline'],
                                        ['OvertimeHours', 'Overtime hours if late', 'CompletedAt - Deadline (if late)'],
                                        ['IsSLALocked', 'SLA enforcement flag', 'SLA lock status'],
                                        ['ReviewRemarks', 'Reviewer remarks', 'Review remarks'],
                                        ['PushBackComment', 'Push-back comment', 'Push back comment'],
                                    ].map(([col, desc, src]) => (
                                        <tr key={col} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{col}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{desc}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{src}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {reportSubTab === 'task-completion' && (
                <>
                    <div className="card report-filter-card">
                        <div className="card-header-layout">
                            <h3 style={{ fontSize: 0, margin: 0, padding: 0, visibility: 'hidden', height: 0, overflow: 'hidden' }}>Task Completion Reports</h3>
                        </div>
                        <div className="report-filter-grid">
                            <div className="field">
                                <label>Date Range *</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {DATE_PRESETS.map(p => {
                                        const { start } = getDateRangeMonths(p.months);
                                        const isActive = tcFilter.dateRangeStart === start;
                                        return (
                                            <button key={p.label} type="button"
                                                className={`filter-pill${isActive ? ' active' : ''}`}
                                                onClick={() => applyTcPreset(p.months)}
                                                style={{ fontSize: 12, padding: '6px 14px' }}>
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {tcFilter.dateRangeStart && tcFilter.dateRangeEnd && (
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                        {tcFilter.dateRangeStart} → {tcFilter.dateRangeEnd}
                                    </span>
                                )}
                            </div>
                            <div className="field">
                                <label>Employee</label>
                                <select className="report-select"
                                    value={tcFilter.employeeId}
                                    onChange={e => setTcFilter(p => ({ ...p, employeeId: e.target.value }))}>
                                    <option value="">All Employees</option>
                                    {allEmployeeOptions.map(m => (
                                        <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
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
                            <div className="field">
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
                            <div className="field">
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
                        <div className="report-filter-actions">
                            <button className="btn" onClick={handleTcReset}><RotateCcw size={14} /> Reset</button>
                            <button className="btn btn-primary" onClick={handleTcGenerate} disabled={tcLoading}>
                                {tcLoading ? <Loader2 size={14} className="spin" /> : <Filter size={14} />}
                                {' '}{tcLoading ? 'Generating...' : 'Generate Report'}
                            </button>
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
                                <StatusCard icon={<BarChart3 size={20} strokeWidth={2.3} />} variant="success" label="COMPLETION RATE" value={`${tcReport.taskCompletionRate}%`} subtext="Overall rate" />
                                <StatusCard icon={<Calendar size={20} strokeWidth={2.3} />} variant="warning" label="AVG TIME" value={`${(tcReport.averageTaskCompletionTimeHours ?? 0).toFixed(1)}h`} subtext="Per task" />
                            </div>
                            <div className="card">
                                <DataTable title="Employee Performance Summary"
                                    headers={['Employee', 'Assigned', 'Completed', 'Rate', 'Avg Time (h)']}
                                    loading={false} emptyMessage="No employee data for selected criteria."
                                    totalRecords={tcReport.employeePerformanceSummary.length}>
                                    {tcReport.employeePerformanceSummary.map(ep => (
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
                            <div className="card">
                                <div className="card-header-layout"><h3>Task Status Distribution</h3></div>
                                {tcChartData.length === 0 ? (
                                    <div className="report-empty-state" style={{ padding: '20px 0' }}><p>No status data available.</p></div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={tcChartData} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e9edf7" />
                                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                            <Tooltip />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                {tcChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            <div className="report-export-row">
                                <span className="report-generated-badge"><Calendar size={12} /> Report generated at: {tcGeneratedAt}</span>
                                <button className="btn btn-primary" onClick={exportCSV}>
                                    <Download size={14} /> Export CSV
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}

            {reportSubTab === 'operational-summary' && (
                <>
                    <div className="card report-filter-card">
                        <div className="card-header-layout">
                            <h3><BarChart3 size={18} style={{ marginRight: 6, verticalAlign: 'middle' }} />Operational Summary Report</h3>
                        </div>
                        <div className="report-filter-grid">
                            <div className="field">
                                <label>Date Range *</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {DATE_PRESETS.map(p => {
                                        const { start } = getDateRangeMonths(p.months);
                                        const isActive = opFilter.dateRangeStart === start;
                                        return (
                                            <button key={p.label} type="button"
                                                className={`filter-pill${isActive ? ' active' : ''}`}
                                                onClick={() => applyOpPreset(p.months)}
                                                style={{ fontSize: 12, padding: '6px 14px' }}>
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {opFilter.dateRangeStart && opFilter.dateRangeEnd && (
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                                        {opFilter.dateRangeStart} → {opFilter.dateRangeEnd}
                                    </span>
                                )}
                            </div>
                            <div className="field">
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
                            <div className="field">
                                <label>Employee</label>
                                <select className="report-select"
                                    value={opFilter.employeeId}
                                    onChange={e => setOpFilter(p => ({ ...p, employeeId: e.target.value }))}>
                                    <option value="">All Employees</option>
                                    {allEmployeeOptions.map(e => (
                                        <option key={e.accountId} value={e.accountId}>{e.employeeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label>Report Format</label>
                                <select className="report-select"
                                    value={opFilter.reportFormat}
                                    onChange={e => setOpFilter(p => ({ ...p, reportFormat: e.target.value }))}>
                                    <option value="PDF">PDF</option>
                                    <option value="EXCEL">Excel</option>
                                </select>
                            </div>
                        </div>
                        <div className="report-filter-actions">
                            <button className="btn" onClick={handleOpReset}><RotateCcw size={14} /> Reset</button>
                            <button className="btn btn-primary" onClick={handleOpGenerate} disabled={opLoading}>
                                {opLoading ? <Loader2 size={14} className="spin" /> : <Filter size={14} />}
                                {' '}{opLoading ? 'Generating...' : 'Generate Report'}
                            </button>
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
                            </div>

                            <div className="card">
                                <DataTable title="Employee Performance Summary"
                                    headers={['Employee', 'Assigned', 'Completed', 'Overdue', 'Completion Rate']}
                                    loading={false} emptyMessage="No employee data for selected criteria."
                                    totalRecords={opReport.employeePerformanceSummary.length}>
                                    {opReport.employeePerformanceSummary.map(ep => (
                                        <tr key={ep.employeeName}>
                                            <td style={{ fontWeight: 600 }}>{ep.employeeName}</td>
                                            <td>{ep.assigned}</td>
                                            <td>{ep.completed}</td>
                                            <td>{ep.overdue}</td>
                                            <td>{ep.completionRate.toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </DataTable>
                            </div>

                            {opReport.workloadByCategory.length > 0 && (
                                <div className="card">
                                    <div className="card-header-layout"><h3>Workload by Category</h3></div>
                                    <DataTable headers={['Category', 'Task Count', 'Percentage']}
                                        loading={false} emptyMessage="No data."
                                        totalRecords={opReport.workloadByCategory.length}>
                                        {opReport.workloadByCategory.map(w => (
                                            <tr key={w.categoryName}>
                                                <td style={{ fontWeight: 600 }}>{w.categoryName}</td>
                                                <td>{w.taskCount}</td>
                                                <td>{w.percentage.toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </DataTable>
                                </div>
                            )}

                            {opReport.workloadByDepartment.length > 0 && (
                                <div className="card">
                                    <div className="card-header-layout"><h3>Workload by Department</h3></div>
                                    <DataTable headers={['Department', 'Task Count', 'Percentage']}
                                        loading={false} emptyMessage="No data."
                                        totalRecords={opReport.workloadByDepartment.length}>
                                        {opReport.workloadByDepartment.map(w => (
                                            <tr key={w.categoryName}>
                                                <td style={{ fontWeight: 600 }}>{w.categoryName}</td>
                                                <td>{w.taskCount}</td>
                                                <td>{w.percentage.toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </DataTable>
                                </div>
                            )}

                            {opReport.workloadByPriority.length > 0 && (
                                <div className="card">
                                    <div className="card-header-layout"><h3>Workload by Priority</h3></div>
                                    <DataTable headers={['Priority', 'Task Count', 'Percentage']}
                                        loading={false} emptyMessage="No data."
                                        totalRecords={opReport.workloadByPriority.length}>
                                        {opReport.workloadByPriority.map(w => (
                                            <tr key={w.categoryName}>
                                                <td style={{ fontWeight: 600 }}>{w.categoryName}</td>
                                                <td>{w.taskCount}</td>
                                                <td>{w.percentage.toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </DataTable>
                                </div>
                            )}

                            <div className="report-export-row">
                                <span className="report-generated-badge"><Calendar size={12} /> Report generated at: {opGeneratedAt}</span>
                                <button className="btn btn-primary" onClick={handleOpDownload} disabled={opDownloading}>
                                    {opDownloading ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                                    {' '}{opDownloading ? 'Preparing...' : `Download ${opFilter.reportFormat === 'EXCEL' ? 'Excel' : 'PDF'}`}
                                </button>
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
            <div className="stats-row">
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
        status: ({ Draft: 'Backlog', Assigned: 'To do', Pending: 'To do', 'In Progress': 'In progress', 'Pending Admin Review': 'In review', Done: 'Done', Completed: 'Done', Overdue: 'In progress' } as Record<string, TMTask['status']>)[t.taskStatus] || 'Backlog',
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

    // -- Update fetchTasks --
    const fetchTasks = useCallback(async (silent: boolean = false) => {
        if (!silent) {
            setLoadingTasks(true);
        }
        try {
            const statusParam = taskTabRef.current === 'completed' ? `&status=3` : ``;
            // The Active tab filters out Done tasks client-side (TaskManager tabTasks),
            // so exclude Completed (status 3) server-side BEFORE pagination. Otherwise a
            // Completed task landing on a page gets dropped client-side and that page
            // shows fewer rows than the page size.
            const excludeStatusParam = taskTabRef.current === 'active' ? `&excludeStatus=3` : ``;
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
                    <div className="dashboard-content">
                        <DataTable
                            title="My Activity Logs"
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
                                            {fmtDateTime(log.timestamp)}
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
