import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import SpeedexLogo from '../../assets/SpeedexLogo.jpg';
import {
    Users,
    ClipboardList,
    CheckCircle2,
    AlertCircle,
    Package,
    LayoutDashboard,
    Truck,
    BarChart3,
    UserCircle2,
    X,
    Save,
    Loader2,
    Plus,
    Pencil,
    Trash2,
    Search,
    Phone,
    Shield,
    Hash,
    ChevronLeft,
    ChevronRight,
    Lock,
    Eye,
    EyeOff,
    Clock,
    Filter,
    Copy,
    LogOut,
    Settings,
    Activity,
    FileText,
    Mail,
    Download,
    RefreshCw,
    GitBranch,
    Bell,
    Megaphone,
    Lightbulb,
    Info,
} from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './SystemAdmin_Dashboard.css';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/Toast/Toast';
import { resolveIncrementalTitlePreview } from '../../services/taskTitleUtils';
import SearchBar from '../../components/ui/SearchBar';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBanner from '../../components/ui/ErrorBanner';
import StatusBadge from '../../components/ui/StatusBadge';
import RoleBadge from '../../components/ui/RoleBadge';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import FormModal from '../../components/FormModal/FormModal';
import EmployeeDetailPanel from './EmployeeDetailPanel/EmployeeDetailPanel';
import { usePreventBackNav } from '../../components/Auth/usePreventBackNav';
import ConfirmationModal from '../../components/ConfirmationModal/ConfirmationModal';
import RoleManagementTab, { DepartmentResponseDTO, JobPositionResponseDTO } from './RoleManagementTab/RoleManagementTab';
import GlobalHeader from '../../components/GlobalHeader/GlobalHeader';
import Sidebar from '../../components/Sidebar/Sidebar';
import StatusCard from '../../components/StatusCard/StatusCard';
import ActionButton from '../../components/ActionButton/ActionButton';
import DataTable, { ActionsDropdown } from '../../components/ui/DataTable';
import DateRangePicker from '../../components/ui/DateRangePicker';
import SubTabNav from '../../components/ui/SubTabNav';
import OrgStructureTab from './OrgStructureTab/OrgStructureTab';
import { ReportsTab } from '../OpAdmin_Dashboard/OpAdmin_Dashboard';
import TaskManager from '../../components/TaskManager/TaskManager';
import AnnouncementsTab from '../../components/AnnouncementsTab/AnnouncementsTab';
import AnnouncementBanner from '../../components/AnnouncementsTab/AnnouncementBanner';
import TaskView, { TaskViewTask } from '../../components/TaskView/TaskView';
import api from '../../api';
import BiomarkerDashboard from '../EmergingTechAI/BiomarkerDashboard';
import AIAssignmentView from '../EmergingTechAI/AIAssignmentView';
import { AI_ANALYTICS_ENABLED } from '../../config/features';

// ─── Types ────────────────────────────────────────────────────────────────────

type NavTab =
    | 'dashboard'
    | 'employees'
    | 'delivery'
    | 'finance'
    | 'settings'
    | 'roles'
    | 'reports'
    | 'announcements'
    | 'notifications'
    | 'activity_logs'
    | 'tasks'
    | 'profile'
    | 'org-structure'
    | 'biomarker';

// ─── Updated Types ────────────────────────────────────────────────────────────

interface EmployeeRegisterDTO {
    employeeNumber: string;
    firstName: string;
    middleName: string;
    lastName: string;
    suffix: string;
    contactNumber: string;
    email: string;
    departmentId: string;
    jobPositionId: string;
    role: string;
    employmentStatus: string;
    hireDate: string;
}

interface FieldError {
    firstName?: string;
    lastName?: string;
    email?: string;
    departmentId?: string;
    jobPositionId?: string;
    role?: string;
    contactNumber?: string;
    employmentStatus?: string;
    hireDate?: string;
}

type FormState = EmployeeRegisterDTO;

const EMPTY_FORM: FormState = {
    employeeNumber: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    contactNumber: '',
    email: '',
    departmentId: '',
    jobPositionId: '',
    role: '',
    employmentStatus: 'Regular',
    hireDate: new Date().toISOString().split('T')[0],
};

interface ActivityLog {
    activityLogId: string;
    /** Raw UUID of the actor — displayed as User ID */
    userId: string;
    accountId: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    activityType: string;
    description: string;
    createdAt: string;
    actorRole?: string;
    /** Affected record: entity name + optional entity ID */
    targetEntity?: string;
    targetEntityId?: string;
    /** IP address of the request */
    ipAddress?: string;
    oldValue?: string | null;
    newValue?: string | null;
}

interface RecentEmployee {
    employeeNumber: string;
    employeeName: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    suffix?: string;
    contactNumber: string;
    role: string;
    accountStatus: string;
    presenceStatus?: string;
    email?: string;
    departmentName?: string;
    employmentStatus?: string;
    hireDate?: string;
    attachments?: Array<{
        employeeAttachmentId: string;
        fileName: string;
        fileUrl: string;
        contentType: string;
        fileSize: number;
    }>;
}



// ─── ConfirmModal state shape ─────────────────────────────────────────────────

interface ConfirmModalState {
    isOpen: boolean;
    variant: 'danger' | 'warning' | 'info' | 'success' | 'neutral';
    title: string;
    description: React.ReactNode;
    notice?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isLoading?: boolean;
    extraContent?: React.ReactNode;
    onConfirm: () => void;
}

const CONFIRM_CLOSED: ConfirmModalState = {
    isOpen: false,
    variant: 'neutral',
    title: '',
    description: '',
    onConfirm: () => { },
};

// ─── Constants ────────────────────────────────────────────────────────────────


const SYSTEM_ROLES = ['Manager', 'Coordinator', 'Dispatcher', 'Encoder', 'Courier', 'Accountant'];

const DEPARTMENTS = [
    'Operations',
    'Logistics',
    'Finance',
    'Human Resources',
    'Information Technology',
    'Customer Service',
    'Administration',
];

const POSITIONS: Record<string, string[]> = {
    'Operations': ['Operations Manager', 'Operations Coordinator', 'Operations Analyst'],
    'Logistics': ['Logistics Coordinator', 'Delivery Driver', 'Warehouse Staff'],
    'Finance': ['Finance Manager', 'Accountant', 'Finance Analyst'],
    'Human Resources': ['HR Manager', 'HR Coordinator', 'Recruiter'],
    'Information Technology': ['IT Manager', 'System Administrator', 'Developer', 'IT Support'],
    'Customer Service': ['Customer Service Manager', 'Customer Service Representative'],
    'Administration': ['Administrative Officer', 'Encoder', 'Data Entry Specialist'],
};

const EMPLOYMENT_STATUSES = ['Regular', 'Probationary', 'Contractual'];

export function getRolesForPosition(positionName?: string, allRoles: string[] = SYSTEM_ROLES): string[] {
    if (!positionName) return allRoles;
    const lower = positionName.toLowerCase().trim();

    if (lower.includes('encoder') || lower.includes('data entry')) {
        const match = allRoles.filter(r => r.toLowerCase() === 'encoder');
        return match.length > 0 ? match : ['Encoder'];
    }
    if (lower.includes('courier') || lower.includes('driver') || lower.includes('delivery')) {
        const match = allRoles.filter(r => r.toLowerCase() === 'courier');
        return match.length > 0 ? match : ['Courier'];
    }
    if (lower.includes('dispatcher') || lower.includes('dispatch')) {
        const match = allRoles.filter(r => r.toLowerCase() === 'dispatcher');
        return match.length > 0 ? match : ['Dispatcher'];
    }
    if (lower.includes('accountant') || lower.includes('accounting') || lower.includes('finance analyst')) {
        const match = allRoles.filter(r => r.toLowerCase() === 'accountant');
        return match.length > 0 ? match : ['Accountant'];
    }
    if (lower.includes('manager')) {
        const match = allRoles.filter(r => r.toLowerCase() === 'manager');
        return match.length > 0 ? match : ['Manager'];
    }
    if (
        lower.includes('coordinator') ||
        lower.includes('lead') ||
        lower.includes('specialist') ||
        lower.includes('analyst') ||
        lower.includes('admin') ||
        lower.includes('officer') ||
        lower.includes('representative') ||
        lower.includes('recruiter') ||
        lower.includes('developer') ||
        lower.includes('support')
    ) {
        const match = allRoles.filter(r => r.toLowerCase() === 'coordinator');
        return match.length > 0 ? match : ['Coordinator'];
    }

    const directMatch = allRoles.filter(r => lower.includes(r.toLowerCase()));
    if (directMatch.length > 0) return directMatch;

    return allRoles;
}

const PAGE_SIZE = 10;

const NAV_GROUPS = [
    {
        label: 'MAIN MENU',
        items: [
            { tab: 'dashboard' as NavTab, icon: 'LayoutDashboard', label: 'Dashboard' },
            { tab: 'employees' as NavTab, icon: 'Users', label: 'Manage Employee' },
        ],
    },
    {
        label: 'INTEGRATION',
        items: [
            { tab: 'delivery' as NavTab, icon: 'FileText', label: 'Delivery Summary' },
            { tab: 'tasks' as NavTab, icon: 'ClipboardList', label: 'Task Management' },
            { tab: 'finance' as NavTab, icon: 'BarChart3', label: 'Finance' },
        ],
    },
    {
        label: 'REPORTS',
        items: [
            { tab: 'reports' as NavTab, icon: 'BarChart3', label: 'Reports' },
        ],
    },
    {
        label: 'SYSTEM',
        items: [
            { tab: 'announcements' as NavTab, icon: 'Megaphone', label: 'Announcements' },
            { tab: 'settings' as NavTab, icon: 'Settings', label: 'Settings' },
            { tab: 'roles' as NavTab, icon: 'Shield', label: 'Role Management' },
            { tab: 'org-structure' as NavTab, icon: 'GitBranch', label: 'Org Structure' },
            { tab: 'notifications' as NavTab, icon: 'Bell', label: 'Notifications' },
            { tab: 'activity_logs' as NavTab, icon: 'Activity', label: 'Activity Logs' },
        ],
    },
];





// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildDisplayName = (
    firstName: string,
    middleName: string,
    lastName: string,
    suffix: string
): string => {
    return [firstName, middleName, lastName, suffix]
        .map(s => s.trim())
        .filter(Boolean)
        .join(' ');
};

const getEmployeeDisplayName = (emp: RecentEmployee): string => {
    if (emp.firstName || emp.lastName) {
        return buildDisplayName(
            emp.firstName ?? '',
            emp.middleName ?? '',
            emp.lastName ?? '',
            emp.suffix ?? ''
        );
    }
    return emp.employeeName ?? '';
};

// ─── Audit log helpers ───────────────────────────────────────────────────────

const AUDIT_ACTION_LABELS: Record<string, string> = {
    Login: 'Login',
    Logout: 'Logout',
    Create: 'Create',
    Read: 'Read',
    Update: 'Update',
    Delete: 'Delete',
    StatusChange: 'Status Change',
    Upload: 'Upload',
    Export: 'Export',
    AccessDenied: 'Access Denied',
    BlockedAction: 'Blocked Action',
    DuplicateOverride: 'Duplicate Override',
};

const formatActionType = (raw?: string): string => {
    if (!raw) return '—';
    if (AUDIT_ACTION_LABELS[raw]) return AUDIT_ACTION_LABELS[raw];
    return raw.replace(/([A-Z])/g, ' $1').trim();
};

const getAuditBadgeStyle = (raw: string, isBiomarker: boolean): { background: string; color: string } => {
    if (isBiomarker) return { background: '#ede9fe', color: '#6d28d9' };
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

function validate(form: FormState): FieldError {
    const errs: FieldError = {};

    // First Name
    if (!form.firstName.trim()) {
        errs.firstName = 'First name is required.';
    } else if (!/^[A-Za-z\s\-']+$/.test(form.firstName.trim())) {
        errs.firstName = 'Letters and spaces only.';
    } else if (form.firstName.trim().length > 50) {
        errs.firstName = 'Max 50 characters.';
    }

    // Last Name
    if (!form.lastName.trim()) {
        errs.lastName = 'Last name is required.';
    } else if (!/^[A-Za-z\s\-']+$/.test(form.lastName.trim())) {
        errs.lastName = 'Letters and spaces only.';
    } else if (form.lastName.trim().length > 50) {
        errs.lastName = 'Max 50 characters.';
    }

    // Email
    const email = form.email.trim();
    if (!email) {
        errs.email = 'Email address is required.';
    } else if (email.length > 100) {
        errs.email = 'Email must not exceed 100 characters.';
    } else if (!/^[a-zA-Z0-9._+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
        errs.email = 'Enter a valid email address.';
    }

    // Department
    if (!form.departmentId) errs.departmentId = 'Please select a department.';

    // Position
    if (!form.jobPositionId) errs.jobPositionId = 'Please select a position.';

    // Role
    if (!form.role) {
        errs.role = 'Please select a system role.';
    }

    // Contact Number
    const contact = form.contactNumber.trim();
    if (!contact) {
        errs.contactNumber = 'Contact number is required.';
    } else if (!/^09\d{9}$/.test(contact)) {
        errs.contactNumber = 'Enter a valid PH mobile number (09xxxxxxxxx).';
    }

    // Employment Status
    if (!form.employmentStatus) {
        errs.employmentStatus = 'Please select an employment status.';
    }

    // Hire Date
    if (!form.hireDate) {
        errs.hireDate = 'Hire date is required.';
    }

    return errs;
}

const toBackendRole = (role: string) => {
    const roleMap: Record<string, number> = {
        Manager: 0, Coordinator: 1, Dispatcher: 2,
        Encoder: 3, Courier: 4, Accountant: 5,
    };
    return roleMap[role] ?? 3; // default to Encoder (3)
};
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

const fmtDate = (d: string): string => {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const calcDays = (start: string, end: string): number =>
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getInitials = (name: string): string => {
    if (!name) return 'SA';
    const cleanName = name.trim();
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
};

const getStatusBadgeClass = (status?: string): string => {
    const s = (status ?? 'Active').toLowerCase();
    if (s === 'pending verification') return 'pending-badge';
    if (s === 'on leave' || s === 'locked') return 'locked';
    return s;
};

// ─── Shared Pagination Helper ─────────────────────────────────────────────────

function getPageNumbers(total: number, current: number): (number | '...')[] {
    const pages: (number | '...')[] = [];
    if (total <= 5) {
        for (let i = 1; i <= total; i++) pages.push(i);
    } else {
        pages.push(1);
        if (current > 3) pages.push('...');
        const start = Math.max(2, current - 1);
        const end = Math.min(total - 1, current + 1);
        for (let i = start; i <= end; i++) pages.push(i);
        if (current < total - 2) pages.push('...');
        pages.push(total);
    }
    return pages;
}

// ─── Add Employee Modal ───────────────────────────────────────────────────────

interface AddEmployeeModalProps {
    onClose: () => void;
    onSuccess: (employee: RecentEmployee) => void;
}


function AddEmployeeModal({ onClose, onSuccess }: AddEmployeeModalProps) {
    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
    const [errors, setErrors] = useState<FieldError>({});
    const [dirty, setDirty] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const [successData, setSuccessData] = useState<{ employeeNumber: string } | null>(null);
    const [empNumLoading, setEmpNumLoading] = useState(true);
    const [empNumError, setEmpNumError] = useState('');
    const [departments, setDepartments] = useState<DepartmentResponseDTO[]>([]);
    const [jobPositions, setJobPositions] = useState<JobPositionResponseDTO[]>([]);
    const [availableRoles, setAvailableRoles] = useState<string[]>(['Manager', 'Coordinator', 'Dispatcher', 'Encoder', 'Courier', 'Accountant']);
    const [loadingOrg, setLoadingOrg] = useState(true);
    const { success } = useToast();
    const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);

    useEffect(() => {
        const loadOrgData = async () => {
            setLoadingOrg(true);
            try {
                const [dRes, pRes, rRes] = await Promise.all([
                    api.get('/api/Department'),
                    api.get('/api/job-positions'),
                    api.get('/api/Role')
                ]);

                const deptsData = dRes.data;
                const posData = pRes.data;
                const rolesData = rRes.data;

                const rawDepts = Array.isArray(deptsData) ? deptsData : (deptsData.data?.items ?? (Array.isArray(deptsData.data) ? deptsData.data : deptsData.$values ?? []));
                const rawPos = Array.isArray(posData) ? posData : (posData.data?.items ?? (Array.isArray(posData.data) ? posData.data : posData.$values ?? []));
                const rawRoles = Array.isArray(rolesData) ? rolesData : (rolesData.data?.items ?? (Array.isArray(rolesData.data) ? rolesData.data : rolesData.$values ?? []));

                setDepartments(rawDepts.map((d: any) => ({
                    departmentId: d.id ?? d.departmentId ?? d.DepartmentId,
                    name: d.name ?? d.Name,
                    isActive: d.isActive ?? d.IsActive ?? ((d.status ?? d.Status) === 'Active'),
                    status: d.status ?? d.Status ?? 'Active'
                })).filter((d: any) => d.status === 'Active' || d.isActive !== false));

                setJobPositions(rawPos.map((p: any) => ({
                    jobPositionId: p.id ?? p.jobPositionId ?? p.JobPositionId,
                    name: p.name ?? p.Name,
                    departmentId: p.departmentId ?? p.DepartmentId,
                    isActive: p.isActive ?? p.IsActive ?? ((p.status ?? p.Status) === 'Active'),
                    status: p.status ?? p.Status ?? 'Active'
                })).filter((p: any) => p.status === 'Active' || p.isActive !== false));

                setAvailableRoles(rawRoles.map((r: any) => toDisplayRole(r.displayName ?? r.DisplayName ?? r.name ?? r.Name)));
            } catch (err) {
                console.error('Error loading organization data:', err);
            } finally {
                setLoadingOrg(false);
            }
        };
        loadOrgData();
    }, []);

    useEffect(() => {
        const generateEmployeeNumber = async () => {
            setEmpNumLoading(true);
            setEmpNumError('');
            try {
                const res = await api.get<any>('/api/User/next-employee-number');
                const empNum = res.data?.data ?? res.data;
                setForm(prev => ({ ...prev, employeeNumber: String(empNum).padStart(4, '0') }));
            } catch (err) {
                console.error('Error generating employee number:', err);
                setEmpNumError('Could not generate employee number. Please try again.');
            } finally {
                setEmpNumLoading(false);
            }
        };
        generateEmployeeNumber();
    }, []);

    // Derive available positions based on selected department
    const availablePositions = form.departmentId
        ? jobPositions.filter(p => p.departmentId === form.departmentId)
        : [];

    const selectedPosition = jobPositions.find(p => p.jobPositionId === form.jobPositionId);
    const allowedRoles = form.jobPositionId
        ? getRolesForPosition(selectedPosition?.name, availableRoles)
        : [];

    const validateField = (key: keyof FormState, value: string): string => {
        switch (key) {
            case 'email': {
                const v = value.trim();
                if (!v) return 'Email address is required.';
                if (v.length > 100) return 'Email must not exceed 100 characters.';
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
                return '';
            }
            case 'departmentId':
                return !value ? 'Please select a department.' : '';
            case 'jobPositionId':
                return !value ? 'Please select a position.' : '';
            case 'role':
                return !value ? 'Please select a system role.' : '';
            case 'hireDate':
                return !value ? 'Hire date is required.' : '';
            case 'contactNumber': {
                const v = value.trim();
                if (!v) return 'Contact number is required.';
                if (!/^09\d{9}$/.test(v)) return 'Enter a valid PH mobile number (09xxxxxxxxx).';
                return '';
            }
            default:
                return '';
        }
    };

    const handleChange = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setDirty(true);
        const value = e.target.value;

        // If department changes, reset position and role
        if (key === 'departmentId') {
            setForm(prev => ({ ...prev, departmentId: value, jobPositionId: '', role: '' }));
            setErrors(prev => ({ ...prev, departmentId: value ? undefined : 'Please select a department.', jobPositionId: undefined, role: undefined }));
            setApiError('');
            return;
        }

        // If position changes, dynamically filter role and auto-select if single match
        if (key === 'jobPositionId') {
            const pos = jobPositions.find(p => p.jobPositionId === value);
            const rolesForPos = value ? getRolesForPosition(pos?.name, availableRoles) : [];
            let autoRole = form.role;
            if (rolesForPos.length === 1) {
                autoRole = rolesForPos[0];
            } else if (!rolesForPos.includes(form.role)) {
                autoRole = '';
            }

            setForm(prev => ({ ...prev, jobPositionId: value, role: autoRole }));
            setErrors(prev => ({
                ...prev,
                jobPositionId: value ? undefined : 'Please select a position.',
                role: autoRole ? undefined : (value ? 'Please select a system role.' : undefined)
            }));
            setApiError('');
            return;
        }

        setForm(prev => ({ ...prev, [key]: value }));
        setApiError('');
        const errMsg = validateField(key, value);
        setErrors(prev => ({ ...prev, [key]: errMsg || undefined }));
    };

    const doRegister = async () => {
        setSubmitting(true);
        setApiError('');
        try {
            const res = await api.post('/api/User/register', {
                employeeNumber: form.employeeNumber,
                firstName: form.firstName.trim() || 'New',
                middleName: form.middleName.trim() || null,
                lastName: form.lastName.trim() || 'Employee',
                suffix: form.suffix.trim() || null,
                contactNumber: form.contactNumber || null,
                role: toBackendRole(form.role),
                email: form.email.trim(),
                departmentId: form.departmentId || null,
                jobPositionId: form.jobPositionId || null,
                employmentStatus: form.employmentStatus || 'Regular',
                hireDate: form.hireDate ? new Date(form.hireDate).toISOString() : null,
            });

            const responseData = res.data;
            if (!responseData.isSuccess || !responseData.data) {
                throw new Error(responseData.message || 'Registration failed');
            }

            const data = responseData.data;
            success('Employee registered successfully!');
            setDirty(false);
            onSuccess({
                employeeNumber: data.employeeNumber ?? form.employeeNumber,
                employeeName: form.email.trim(),
                firstName: '',
                middleName: '',
                lastName: '',
                suffix: '',
                contactNumber: '',
                role: data.role ?? form.role,
                accountStatus: 'Pending Verification',
                email: form.email.trim(),
            });
            onClose();
        } catch (err: any) {
            const errorData = err.response?.data;
            const validationMsg = errorData?.errors
                ? Object.values(errorData.errors).flat().join('. ')
                : '';
            const msg = errorData?.message ?? errorData?.Message ?? validationMsg
                ?? (typeof errorData === 'string' ? errorData : '');
            setApiError(msg || err.message || 'Employee registration failed. Please try again.');
        } finally {
            setSubmitting(false);
            setShowRegisterConfirm(false);
        }
    };

    const handleSubmit = () => {
        if (submitting || empNumLoading || !form.employeeNumber) return;
        const errs = validate(form);
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }
        setGatePassword('');
        setGateError('');
        setShowRegisterConfirm(true);
    };

    const handleConfirmRegister = async () => {
        if (!gatePassword) { setGateError('Please enter your password.'); return; }
        setGateLoading(true);
        setGateError('');
        try {
            const adminId = localStorage.getItem('employeeId') ?? '';
            const verifyRes = await api.post('/api/Auth/verify-password', { employeeID: adminId, password: gatePassword });
            const verifyData = verifyRes.data;
            if (!verifyData.isSuccess) { throw new Error(verifyData.message || verifyData.Message || 'Incorrect password.'); }
            setShowRegisterConfirm(false);
            await doRegister();
        } catch (err: any) {
            setGateError(err.response?.data?.message || err.message || 'Incorrect password. Please try again.');
        } finally {
            setGateLoading(false);
        }
    };

    // ── Error helper UI ───────────────────────────────────────────────────────
    const FieldErr = ({ msg }: { msg?: string }) =>
        msg ? (
            <span className="field-error" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>
                <AlertCircle size={12} /> {msg}
            </span>
        ) : null;

    const inputStyle = (hasErr?: string): React.CSSProperties => ({
        border: hasErr ? '1px solid var(--status-failed)' : '1px solid var(--border)',
    });

    return (
        <div style={{ display: 'contents' }}>
            <FormModal
                isOpen={true}
                onClose={() => { setDirty(false); onClose(); }}
                title="Add New Employee"
                subtitle="Fill in all details to register a new employee account."
                apiError={apiError}
                onSubmit={handleSubmit}
                isSubmitting={submitting}
                submitDisabled={empNumLoading || !!empNumError || loadingOrg}
                submitLabel="Register Employee"
                size="lg"
                confirmOnCancel={true}
                dirty={dirty}
                infoCard={form.employeeNumber ? {
                    avatarText: form.employeeNumber.slice(-4),
                    title: `Employee #${form.employeeNumber}`,
                    subtitle: form.email || 'Enter email address below',
                    badgeText: 'NEW',
                    badgeStatus: 'Pending',
                } : undefined}
            >
                <div className="fm-section">
                    <h5 className="fm-section-title">Account Information</h5>
                    <div className="fm-field-grid">
                        {/* Employee Number */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-number">
                                Employee ID <span className="optional" style={{ fontWeight: 600, background: 'var(--status-new-bg)', color: 'var(--primary)', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>AUTO</span>
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="emp-number"
                                    type="text"
                                    value={empNumLoading ? '' : form.employeeNumber}
                                    readOnly
                                    placeholder={empNumLoading ? 'Generating…' : ''}
                                    className="fm-input"
                                    style={{
                                        background: 'var(--bg-input)',
                                        color: empNumLoading ? 'var(--text-secondary)' : 'var(--text-primary)',
                                        cursor: 'not-allowed',
                                        paddingRight: 36,
                                        border: empNumError ? '1px solid var(--status-failed)' : '1px solid var(--border)'
                                    }}
                                />
                                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', color: empNumLoading ? 'var(--text-secondary)' : 'var(--status-active)' }}>
                                    {empNumLoading ? <Loader2 size={13} className="fm-spin" /> : <CheckCircle2 size={13} />}
                                </span>
                            </div>
                            {empNumError ? (
                                <span className="field-error" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--status-failed)', fontSize: 11, marginTop: 4 }}>
                                    <AlertCircle size={12} /> {empNumError}
                                </span>
                            ) : !empNumLoading && (
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>Assigned automatically. Cannot be changed.</span>
                            )}
                        </div>

                        {/* First Name */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-fname">
                                First Name <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <input id="emp-fname" type="text" placeholder="e.g. Juan"
                                value={form.firstName} onChange={handleChange('firstName')}
                                className="fm-input" style={inputStyle(errors.firstName)} maxLength={50} />
                            <FieldErr msg={errors.firstName} />
                        </div>
                        {/* Middle Name */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-mname">
                                Middle Name <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
                            </label>
                            <input id="emp-mname" type="text" placeholder="e.g. Santos"
                                value={form.middleName} onChange={handleChange('middleName')}
                                className="fm-input" style={inputStyle(errors.middleName)} maxLength={50} />
                            <FieldErr msg={errors.middleName} />
                        </div>
                        {/* Last Name */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-lname">
                                Last Name <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <input id="emp-lname" type="text" placeholder="e.g. Dela Cruz"
                                value={form.lastName} onChange={handleChange('lastName')}
                                className="fm-input" style={inputStyle(errors.lastName)} maxLength={50} />
                            <FieldErr msg={errors.lastName} />
                        </div>
                        {/* Suffix */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-suffix">
                                Suffix <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
                            </label>
                            <input id="emp-suffix" type="text" placeholder="e.g. Jr., III"
                                value={form.suffix} onChange={handleChange('suffix')}
                                className="fm-input" style={inputStyle(errors.suffix)} maxLength={10} />
                            <FieldErr msg={errors.suffix} />
                        </div>
                        {/* Email Address */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-email">
                                Email Address <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <input
                                id="emp-email"
                                type="email"
                                placeholder="e.g. name@company.com"
                                value={form.email}
                                onChange={handleChange('email')}
                                className="fm-input"
                                style={inputStyle(errors.email)}
                                maxLength={100}
                                autoComplete="off"
                            />
                            <FieldErr msg={errors.email} />
                        </div>
                        {/* Contact Number */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-contact">
                                Contact Number <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <input id="emp-contact" type="text" placeholder="e.g. 09171234567"
                                value={form.contactNumber} onChange={handleChange('contactNumber')}
                                className="fm-input" style={inputStyle(errors.contactNumber)} maxLength={11} />
                            <FieldErr msg={errors.contactNumber} />
                        </div>
                    </div>
                </div>

                <div className="fm-section">
                    <h5 className="fm-section-title">Department & Position</h5>
                    <div className="fm-field-grid">
                        {/* Department */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-dept">
                                Department <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <select
                                id="emp-dept"
                                value={form.departmentId}
                                onChange={handleChange('departmentId')}
                                className="fm-select"
                                style={inputStyle(errors.departmentId)}
                                disabled={loadingOrg}
                            >
                                <option value="">{loadingOrg ? 'Loading departments...' : 'Select a department'}</option>
                                {departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
                            </select>
                            <FieldErr msg={errors.departmentId} />
                        </div>

                        {/* Position */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-position">
                                Position <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <select
                                id="emp-position"
                                value={form.jobPositionId}
                                onChange={handleChange('jobPositionId')}
                                className="fm-select"
                                style={{
                                    ...inputStyle(errors.jobPositionId),
                                    opacity: !form.departmentId ? 0.6 : 1,
                                    cursor: !form.departmentId ? 'not-allowed' : 'pointer',
                                }}
                                disabled={!form.departmentId || loadingOrg}
                            >
                                <option value="">
                                    {form.departmentId ? 'Select a position' : 'Select department first'}
                                </option>
                                {availablePositions.map(p => <option key={p.jobPositionId} value={p.jobPositionId}>{p.name}</option>)}
                            </select>
                            <FieldErr msg={errors.jobPositionId} />
                        </div>
                    </div>
                </div>

                <div className="fm-section">
                    <h5 className="fm-section-title">Role, Employment & Hire Date</h5>
                    <div className="fm-field-grid">
                        {/* System Role */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-role">
                                System Role <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <select
                                id="emp-role"
                                value={form.role}
                                onChange={handleChange('role')}
                                className="fm-select"
                                style={{
                                    ...inputStyle(errors.role),
                                    opacity: !form.jobPositionId ? 0.6 : 1,
                                    cursor: !form.jobPositionId ? 'not-allowed' : 'pointer',
                                }}
                                disabled={!form.jobPositionId || loadingOrg}
                            >
                                <option value="">
                                    {!form.departmentId
                                        ? 'Select department first'
                                        : !form.jobPositionId
                                            ? 'Select position first'
                                            : 'Select a role'}
                                </option>
                                {allowedRoles.map(r => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                            <FieldErr msg={errors.role} />
                        </div>

                        {/* Employment Status */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-status">
                                Employment Status <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <select
                                id="emp-status"
                                value={form.employmentStatus}
                                onChange={handleChange('employmentStatus')}
                                className="fm-select"
                                style={inputStyle(errors.employmentStatus)}
                            >
                                <option value="">Select status</option>
                                <option value="Regular">Regular</option>
                                <option value="Probationary">Probationary</option>
                                <option value="Contractual">Contractual</option>
                            </select>
                            <FieldErr msg={errors.employmentStatus} />
                        </div>

                        {/* Hire Date */}
                        <div className="fm-field">
                            <label className="fm-label" htmlFor="emp-hire-date">
                                Hire Date <span style={{ color: 'var(--status-failed)' }}>*</span>
                            </label>
                            <input
                                id="emp-hire-date"
                                type="date"
                                value={form.hireDate}
                                onChange={handleChange('hireDate')}
                                className="fm-input"
                                style={inputStyle(errors.hireDate)}
                            />
                            <FieldErr msg={errors.hireDate} />
                        </div>
                    </div>
                </div>
            </FormModal>

            {/* ── Registration Confirmation ── */}
            <FormModal isOpen={showRegisterConfirm} onClose={() => setShowRegisterConfirm(false)}
                title="Confirm Employee Registration"
                subtitle="Review the details before creating this account."
                size="md"
                footer={
                    <>
                        <button className="btn" onClick={() => setShowRegisterConfirm(false)} disabled={gateLoading}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleConfirmRegister} disabled={gateLoading || !gatePassword}>
                            {gateLoading ? <><Loader2 size={13} className="fm-spin" /> Verifying…</> : <><Shield size={13} /> Register Employee</>}
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                    <div style={{ background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                            { label: 'Employee ID', value: form.employeeNumber },
                            { label: 'Name', value: [form.firstName, form.middleName, form.lastName, form.suffix].filter(Boolean).join(' ') },
                            { label: 'Email', value: form.email },
                            { label: 'Contact', value: form.contactNumber },
                            { label: 'Department', value: departments.find(d => (d.departmentId ?? d.id) === form.departmentId)?.name || form.departmentId },
                            { label: 'Position', value: jobPositions.find(p => (p.jobPositionId ?? p.id) === form.jobPositionId)?.name || form.jobPositionId },
                            { label: 'Role', value: form.role },
                            { label: 'Employment Status', value: form.employmentStatus },
                            { label: 'Hire Date', value: fmtDate(form.hireDate) },
                        ].map(item => (
                            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{item.label}</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.value || '—'}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ position: 'relative', marginTop: 8 }}>
                        <input id="gate-pw-input" type="password" placeholder="Enter your password to confirm"
                            value={gatePassword} onChange={e => { setGatePassword(e.target.value); setGateError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') handleConfirmRegister(); }}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${gateError ? '#dc2626' : '#e2e8f0'}`, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            autoFocus />
                    </div>
                    {gateError && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#dc2626' }}>
                            <AlertCircle size={12} />{gateError}
                        </div>
                    )}
                </div>
            </FormModal>

            {/* ── Success Screen ── */}
            <FormModal isOpen={!!successData} onClose={() => { setSuccessData(null); onClose(); }} size="sm"
                title="Employee registered"
                subtitle="Account has been created successfully."
            >
                {successData && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--status-active-bg)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
                            <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} color="var(--status-active)" />
                            <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                Login credentials have been sent to <strong>{form.email.trim()}</strong>. Ask the employee to check their inbox to activate their account.
                            </span>
                        </div>

                        <div style={{ background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)', padding: '12px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Employee ID', value: successData.employeeNumber },
                                { label: 'Department', value: departments.find(d => (d.departmentId ?? d.id) === form.departmentId)?.name },
                                { label: 'Position', value: jobPositions.find(p => (p.jobPositionId ?? p.id) === form.jobPositionId)?.name },
                                { label: 'Role', value: form.role },
                                { label: 'Status', value: form.employmentStatus },
                                { label: 'Hire Date', value: fmtDate(form.hireDate) },
                                { label: 'Email', value: form.email.trim() },
                            ].map(({ label, value }, i, arr) => (
                                <div key={label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                                        <strong style={{ textAlign: 'right', maxWidth: 240, wordBreak: 'break-all' }}>{value || '—'}</strong>
                                    </div>
                                    {i < arr.length - 1 && <div style={{ height: 1, background: 'var(--border)', marginTop: 10 }} />}
                                </div>
                            ))}
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setSuccessData(null); onClose(); }}>Done</button>
                    </>
                )}
            </FormModal>
        </div>
    );
}

// ─── Employee Details Modal ───────────────────────────────────────────────────

interface EmployeeDetailModalProps {
    employee: RecentEmployee;
    onClose: () => void;
    onUpdated: (updated: RecentEmployee) => void;
    initialEditMode?: boolean;
    rolesList?: string[];
}

function EmployeeDetailModal({ employee, onClose, onUpdated, initialEditMode = false, rolesList = SYSTEM_ROLES }: EmployeeDetailModalProps) {
    const [isEditing, setIsEditing] = useState(initialEditMode);
    const [form, setForm] = useState({
        firstName: employee.firstName ?? '',
        middleName: employee.middleName ?? '',
        lastName: employee.lastName ?? '',
        suffix: employee.suffix ?? '',
        contactNumber: employee.contactNumber,
        role: toDisplayRole(employee.role),
        accountStatus: employee.accountStatus,
        email: employee.email ?? '',
    });
    // Snapshot of form values at the moment edit mode is entered
    const initialFormRef = useRef<typeof form | null>(
        initialEditMode ? {
            firstName: employee.firstName ?? '',
            middleName: employee.middleName ?? '',
            lastName: employee.lastName ?? '',
            suffix: employee.suffix ?? '',
            contactNumber: employee.contactNumber,
            role: toDisplayRole(employee.role),
            accountStatus: employee.accountStatus,
            email: employee.email ?? '',
        } : null
    );
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(CONFIRM_CLOSED);
    const { success, error } = useToast();
    const displayName = getEmployeeDisplayName(employee);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [showGatePassword, setShowGatePassword] = useState(false);
    const [gateConsent, setGateConsent] = useState(false);
const gateConsentRef = useRef(false);

    // Track whether the form has unsaved changes compared to when editing started
    const isDirty = isEditing && initialFormRef.current !== null &&
        JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

    const enterEditMode = () => {
        // Capture snapshot so we can detect changes later
        initialFormRef.current = { ...form };
        setIsEditing(true);
    };

    const handleCloseModal = () => {
        onClose();
    };

    const handleCancelEdit = () => {
        if (isDirty) {
            setConfirmModal({
                isOpen: true,
                variant: 'warning',
                title: 'Discard unsaved changes?',
                description: (
                    <>
                        You have unsaved changes to <strong>{displayName}</strong>'s profile.
                        Cancelling now will discard all modifications.
                    </>
                ),
                confirmLabel: 'Discard changes',
                onConfirm: async () => {
                    // Restore the form back to the snapshot
                    if (initialFormRef.current) setForm({ ...initialFormRef.current });
                    initialFormRef.current = null;
                    setIsEditing(false);
                    setApiError('');
                    setConfirmModal(CONFIRM_CLOSED);
                },
            });
        } else {
            initialFormRef.current = null;
            setIsEditing(false);
            setApiError('');
        }
    };


    const handleChange = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm(prev => ({ ...prev, [key]: e.target.value }));
        setApiError('');
    };

    // ── Save (always guarded by password verification) ──────────────────────
    const handleSave = async () => {
        const doSave = async () => {
            setSubmitting(true);
            setApiError('');
            try {
                // Look up user GUID by employee number
                const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(employee.employeeNumber)}`);
                const lookupData = lookupRes.data;
                const userId = lookupData?.data?.id ?? lookupData?.id;
                if (!userId) throw new Error('Employee not found.');

                // When deactivating: update personal details FIRST (while user is still active),
                // then deactivate. When activating: activate first so PUT can succeed.
                const statusChanged = form.accountStatus !== employee.accountStatus;
                if (statusChanged && form.accountStatus === 'Active') {
                    await api.patch(`/api/User/${userId}/activate`);
                }

                await api.put(`/api/User/${userId}`, {
                    firstName: form.firstName.trim(),
                    middleName: form.middleName.trim(),
                    lastName: form.lastName.trim(),
                    suffix: form.suffix.trim(),
                    contactNumber: form.contactNumber,
                    email: form.email.trim(),
                });

                if (statusChanged && form.accountStatus !== 'Active') {
                    await api.patch(`/api/User/${userId}/deactivate`);
                }
                const newRoleVal = toBackendRole(form.role);
                const oldRoleVal = typeof employee.role === 'number' ? employee.role : parseInt(employee.role, 10);
                if (newRoleVal !== oldRoleVal) {
                    await api.patch(`/api/Role/user/${userId}/role`, { newRole: newRoleVal, reason: 'Role updated via admin panel' });
                }
                onUpdated({
                    ...employee,
                    firstName: form.firstName.trim(),
                    middleName: form.middleName.trim(),
                    lastName: form.lastName.trim(),
                    suffix: form.suffix.trim(),
                    employeeName: editDisplayName,
                    contactNumber: form.contactNumber,
                    role: toBackendRole(form.role),
                    accountStatus: form.accountStatus,
                    email: form.email.trim(),
                });
                initialFormRef.current = null;
                setIsEditing(false);
                success('Employee details updated successfully!');
                onClose();
            } catch (err: any) {
                const msg = err.response?.data?.message || err.response?.data?.Message || err.message || 'Something went wrong. Please try again.';
                error(msg);
                setApiError(msg);
            } finally {
                setSubmitting(false);
                setConfirmModal(CONFIRM_CLOSED);
            }
        };

        // Always verify the admin's password before any save
        setGatePassword('');
        setGateError('');
        setShowGatePassword(false);
        gateConsentRef.current = false;
        setConfirmModal({
            isOpen: true,
            variant: form.accountStatus !== employee.accountStatus
                ? (form.accountStatus === 'Active' ? 'success' : 'warning')
                : 'info',
            title: form.accountStatus !== employee.accountStatus
                ? `${form.accountStatus === 'Active' ? 'Activate' : 'Deactivate'} employee account?`
                : 'Confirm your identity',
            description: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {form.accountStatus !== employee.accountStatus && (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                            You are about to <strong>{form.accountStatus === 'Active' ? 'activate' : 'deactivate'}</strong> the account of{' '}
                            <strong>{displayName}</strong>.{' '}
                            {form.accountStatus === 'Active'
                                ? 'This will restore their access to the system.'
                                : 'This will revoke their access until reactivated.'}
                        </p>
                    )}
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        Enter your password to confirm these changes.
                    </p>
                </div>
            ),
            notice: 'For security, your identity must be verified before saving any changes.',
            confirmLabel: 'Verify & save',
            onConfirm: async () => {
                const isDeactivating = form.accountStatus !== 'Active' && form.accountStatus !== employee.accountStatus;
                if (isDeactivating && !gateConsentRef.current) {
                    setGateError('You must agree to the archiving of historical data before deactivating.');
                    return;
                }
                const pw = (document.getElementById('gate-pw-input') as HTMLInputElement)?.value ?? gatePassword;
                if (!pw) { setGateError('Please enter your password.'); return; }
                setGateLoading(true);
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                setGateError('');
                try {
                    const adminId = localStorage.getItem('employeeId') ?? '';
                    const res = await api.post('/api/Auth/verify-password', { employeeID: adminId, password: pw });
                    const verifyData = res.data;
                    if (!verifyData.isSuccess) { throw new Error(verifyData.message || verifyData.Message || 'Incorrect password. Please try again.'); }
                    setConfirmModal(CONFIRM_CLOSED);
                    await doSave();
                } catch (err: any) {
                    setGateError(err.response?.data?.message || err.response?.data?.Message || err.message || 'Incorrect password. Please try again.');
                } finally {
                    setGateLoading(false);
                }
            },
        });
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = () => {
        setConfirmModal({
            isOpen: true,
            variant: 'danger',
            title: 'Archive employee account?',
            description: (
                <>
                    This will permanently remove <strong>{displayName}</strong> and all associated
                    data. This action cannot be undone.
                </>
            ),
            notice: 'All leave records, tasks, and activity logs for this employee will also be archived.',
            confirmLabel: 'Archive employee',
            onConfirm: async () => {
                setSubmitting(true);
                setApiError('');
                try {
                    const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(employee.employeeNumber)}`);
                    const lookupData = lookupRes.data;
                    const userId = lookupData?.data?.id ?? lookupData?.id;
                    if (!userId) throw new Error('Employee not found.');
                    await api.patch(`/api/User/${userId}/deactivate`);
                    success(`${displayName} has been archived.`);
                    onUpdated({ ...employee, accountStatus: '__deleted__' });
                    onClose();
                } catch (err: any) {
                    setApiError(err.response?.data?.message || err.response?.data?.Message || err.message || 'Something went wrong. Please try again.');
                } finally {
                    setSubmitting(false);
                    setConfirmModal(CONFIRM_CLOSED);
                }
            },
        });
    };

    const editDisplayName = buildDisplayName(form.firstName, form.middleName, form.lastName, form.suffix);

    const resolvedTitle = isEditing ? 'Edit employee' : 'Employee Details';
    const resolvedSubtitle = isEditing ? 'Update details for this employee record' : `Viewing profile of ${displayName}`;

    const infoCard = {
        avatarText: (isEditing ? editDisplayName : displayName) || '?',
        title: isEditing ? editDisplayName || '—' : displayName,
        subtitle: `Employee No. ${employee.employeeNumber}`,
        badgeText: form.accountStatus ?? 'Active',
        badgeStatus: form.accountStatus ?? 'Active'
    };

    return (
        <>
            <FormModal
                isOpen={true}
                onClose={handleCloseModal}
                title={resolvedTitle}
                subtitle={resolvedSubtitle}
                infoCard={infoCard}
                apiError={apiError}
                onSubmit={isEditing ? handleSave : undefined}
                isSubmitting={submitting}
                size="md"
                confirmOnCancel={true}
                dirty={isDirty}
                footer={
                    isEditing ? (
                        <>
                            <button type="button" className="fm-btn fm-btn-cancel" onClick={handleCancelEdit} disabled={submitting}>Cancel</button>
                            <button type="submit" className="fm-btn fm-btn-primary" disabled={submitting}>
                                {submitting ? <><Loader2 size={13} className="fm-spin" /> Saving…</> : 'Save Changes'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="fm-btn fm-btn-danger" onClick={handleDelete} disabled={submitting}>Delete</button>
                            <button type="button" className="fm-btn fm-btn-primary" onClick={enterEditMode}>Edit</button>
                        </>
                    )
                }
            >
                {isEditing ? (
                    <>
                        <div className="fm-section">
                            <h5 className="fm-section-title">Account</h5>
                            <div className="fm-field-grid">
                                <div className="fm-field">
                                    <label className="fm-label">Role</label>
                                    <select value={form.role} onChange={handleChange('role')} className="fm-select">
                                        {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div className="fm-field">
                                    <label className="fm-label">Account Status</label>
                                    <select value={form.accountStatus} onChange={handleChange('accountStatus')} className="fm-select">
                                        <option value="Active">Active</option>
                                        <option value="Deactivated">Deactivated</option>
                                        {employee.accountStatus === 'On Leave' && <option value="On Leave">On Leave</option>}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="fm-section">
                            <h5 className="fm-section-title">Personal Information</h5>
                            <div className="fm-field-grid">
                                <div className="fm-field">
                                    <label className="fm-label">First Name</label>
                                    <input type="text" value={form.firstName} onChange={handleChange('firstName')} className="fm-input" maxLength={50} />
                                </div>
                                <div className="fm-field">
                                    <label className="fm-label">Last Name</label>
                                    <input type="text" value={form.lastName} onChange={handleChange('lastName')} className="fm-input" maxLength={50} />
                                </div>
                                <div className="fm-field">
                                    <label className="fm-label">Middle Name <span className="optional">optional</span></label>
                                    <input type="text" value={form.middleName} onChange={handleChange('middleName')} className="fm-input" maxLength={50} placeholder="None" />
                                </div>
                                <div className="fm-field">
                                    <label className="fm-label">Suffix <span className="optional">optional</span></label>
                                    <input type="text" value={form.suffix} onChange={handleChange('suffix')} className="fm-input" maxLength={10} placeholder="e.g. Jr., III" />
                                </div>
                            </div>
                        </div>

                        <div className="fm-section">
                            <h5 className="fm-section-title">Contact</h5>
                            <div className="fm-field-grid">
                                <div className="fm-field">
                                    <label className="fm-label">Contact Number</label>
                                    <input type="tel" value={form.contactNumber} onChange={handleChange('contactNumber')} className="fm-input" />
                                </div>
                                <div className="fm-field">
                                    <label className="fm-label">Email</label>
                                    <input type="email" value={form.email} onChange={handleChange('email')} className="fm-input" maxLength={100} />
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="detail-grid">
                        <div className="detail-item"><span className="detail-label">Employee Number</span><span className="detail-value">{employee.employeeNumber}</span></div>
                        <div className="detail-item"><span className="detail-label">Role</span><span className="detail-value">{form.role || '—'}</span></div>
                        <div className="detail-item"><span className="detail-label">First Name</span><span className="detail-value">{form.firstName || '—'}</span></div>
                        <div className="detail-item"><span className="detail-label">Last Name</span><span className="detail-value">{form.lastName || '—'}</span></div>
                        <div className="detail-item"><span className="detail-label">Middle Name</span><span className="detail-value">{form.middleName || '—'}</span></div>
                        <div className="detail-item"><span className="detail-label">Suffix</span><span className="detail-value">{form.suffix || '—'}</span></div>
                        <div className="detail-item"><span className="detail-label">Contact Number</span><span className="detail-value">{form.contactNumber || '—'}</span></div>
                        <div className="detail-item"><span className="detail-label">Email</span><span className="detail-value">{form.email || '—'}</span></div>
                    </div>
                )}
            </FormModal>

            {/* ── Confirmation Modal ── */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                variant={confirmModal.variant}
                title={confirmModal.title}
                description={confirmModal.description}
                notice={confirmModal.notice}
                confirmLabel={confirmModal.confirmLabel}
                isLoading={confirmModal.isLoading || submitting || gateLoading}
                extraContent={confirmModal.isOpen ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {confirmModal.variant === 'warning' && form.accountStatus !== 'Active' && (
                            <div style={{ padding: '10px 12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--status-failed)' }}>Warning:</strong> Historical tasks, comment logs, and recommendations will be archived in a read-only state.
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, cursor: 'pointer', fontWeight: 500 }}>
                                    <input type="checkbox" checked={gateConsent} onChange={e => { setGateConsent(e.target.checked); gateConsentRef.current = e.target.checked; setGateError(''); }} style={{ marginTop: 2, accentColor: 'var(--status-failed)' }} />
                                    <span>I understand and agree to proceed with deactivation.</span>
                                </label>
                            </div>
                        )}
                        <div style={{ position: 'relative' }}>
                            <input
                                id="gate-pw-input"
                                type={showGatePassword ? 'text' : 'password'}
                                placeholder="Enter your current password"
                                style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box', height: 38, borderRadius: 8, border: `1.5px solid ${gateError ? '#dc2626' : '#e2e8f0'}`, padding: '0 40px 0 12px', fontSize: 13, outline: 'none' }}
                                autoFocus
                                onChange={e => { setGatePassword(e.target.value); setGateError(''); }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        const btn = document.getElementById('gate-confirm-btn');
                                        btn?.click();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowGatePassword(p => !p)}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                                tabIndex={-1}
                            >
                                {showGatePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                        {gateError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#dc2626' }}>
                                <AlertCircle size={12} />{gateError}
                            </div>
                        )}
                    </div>
                ) : undefined}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(CONFIRM_CLOSED)}
            />
        </>
    );
}



// ─── Dashboard Tab ────────────────────────────────────────────────────────────

interface DashboardTabProps {
    employees: RecentEmployee[];
    recentEmployees: RecentEmployee[];
    activityLogs: ActivityLog[];
    loading: boolean;
    onSelectEmployee: (emp: RecentEmployee) => void;
    onEditEmployee?: (emp: RecentEmployee) => void;
    onViewAll: () => void;
    onAddEmployee: () => void;
    rolesCount?: number;
    activityLogPage?: number;
    activityLogTotalPages?: number;
    onActivityLogPageChange?: (page: number) => void;
}

function DashboardTab({ employees, recentEmployees, activityLogs, loading, onSelectEmployee, onEditEmployee, onViewAll, onAddEmployee, rolesCount, activityLogPage, activityLogTotalPages, onActivityLogPageChange }: DashboardTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const activeCount = (employees || []).filter(e => e.accountStatus === 'Active').length;
    const deactivatedCount = (employees || []).filter(e => e.accountStatus === 'Deactivated').length;

    const roleDistribution = Object.entries(
        employees.reduce<Record<string, number>>((acc, emp) => {
            const role = toDisplayRole(emp.role) || 'Unassigned';
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const statusDistribution = Object.entries(
        employees.reduce<Record<string, number>>((acc, emp) => {
            const status = emp.accountStatus || 'Unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const PIE_COLORS: Record<string, string> = {
        Active: '#059669',
        Deactivated: '#DC2626',
        'On Leave': '#D97706',
        Locked: '#D97706',
        Unknown: '#94A3B8',
    };

    const BAR_COLORS = ['#00A99D', '#0284C7', '#4F46E5', '#D97706', '#DC2626', '#FF7B42', '#8B5CF6'];

    const avgWorkloadByRole = Object.entries(
        employees.reduce<Record<string, { count: number; tasks: number }>>((acc, emp) => {
            if (emp.accountStatus !== 'Active') return acc;
            const role = toDisplayRole(emp.role) || 'Unassigned';
            if (!acc[role]) acc[role] = { count: 0, tasks: 0 };
            acc[role].count++;
            const hash = (emp.employeeNumber || '').length;
            acc[role].tasks += Math.min(hash + 2, 18);
            return acc;
        }, {})
    ).map(([role, data]) => ({ role, avg: Math.round(data.tasks / data.count) })).sort((a, b) => b.avg - a.avg);

    return (
        <div className="dashboard-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div className="header-search-wrap" style={{ margin: 0, width: 300 }}>
                    <Search size={14} className="header-search-icon" />
                    <input type="text" className="header-search-input" placeholder="Search employee, task…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <ActionButton icon={<Users size={18} />} onClick={onAddEmployee}>
                    Add Employee
                </ActionButton>
            </div>
            <div className="stats-row">
                {([
                    { icon: <Users size={20} strokeWidth={2.3} />, variant: 'teal', label: 'TOTAL EMPLOYEES', value: employees.length, subtext: 'All registered staff' },
                    { icon: <CheckCircle2 size={20} strokeWidth={2.3} />, variant: 'success', label: 'ACTIVE', value: activeCount, subtext: 'Currently active accounts' },
                    { icon: <AlertCircle size={20} strokeWidth={2.3} />, variant: 'danger', label: 'DEACTIVATED', value: deactivatedCount, subtext: 'Accounts needing review' },
                    { icon: <Shield size={20} strokeWidth={2.3} />, variant: 'warning', label: 'ROLES', value: rolesCount ?? SYSTEM_ROLES.length, subtext: 'Available role types' },
                ] as const).map(({ icon, variant, label, value, subtext }) => (
                    <StatusCard key={label} icon={icon} variant={variant} label={label} value={value} subtext={subtext} />
                ))}
            </div>

            {/* ── Charts Row ── */}
            <div className="dashboard-bottom-row">
                <div className="card">
                    <div className="card-header-layout">
                        <span className="text-link">Role Distribution</span>
                    </div>
                    {loading || employees.length === 0 ? (
                        <EmptyState message="No data" />
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={roleDistribution} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                    labelStyle={{ fontWeight: 700, marginBottom: 4 }}
                                />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                                    {roleDistribution.map((_, i) => (
                                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="card">
                    <div className="card-header-layout">
                        <span className="text-link">Account Status</span>
                    </div>
                    {loading || employees.length === 0 ? (
                        <EmptyState message="No data" />
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                                <Pie
                                    data={statusDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {statusDistribution.map((entry) => (
                                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#94A3B8'} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    iconType="circle"
                                    iconSize={10}
                                    formatter={(value: string) => <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="card">
                    <div className="card-header-layout">
                        <span className="text-link"><ClipboardList size={14} /> Avg Workload by Role</span>
                    </div>
                    {loading || avgWorkloadByRole.length === 0 ? (
                        <EmptyState message="No data" />
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={avgWorkloadByRole} margin={{ top: 16, right: 16, left: 0, bottom: 8 }} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <YAxis dataKey="role" type="category" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={90} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                    labelStyle={{ fontWeight: 700, marginBottom: 4 }}
                                    formatter={(value: unknown) => [`${Number(value ?? 0)} tasks/emp`, 'Avg Workload'] as [string, string]}
                                />
                                <Bar dataKey="avg" radius={[0, 6, 6, 0]} maxBarSize={28}>
                                    {avgWorkloadByRole.map((_, i) => (
                                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="dashboard-grid">
                <div className="card">
                    <div className="card-header-layout"><span className="text-link">Recent Employees</span><button className="view-all-link" onClick={onViewAll}>View more →</button></div>
                    {loading ? (
                        <EmptyState icon={<Loader2 size={22} className="spin" />} message="Loading..." />
                    ) : recentEmployees.length === 0 ? (
                        <EmptyState message="No data available" />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {(recentEmployees || []).filter(emp => {
                                if (!searchQuery) return true;
                                const q = searchQuery.toLowerCase();
                                return getEmployeeDisplayName(emp).toLowerCase().includes(q)
                                    || (emp.employeeNumber && emp.employeeNumber.toLowerCase().includes(q))
                                    || (emp.role != null && String(emp.role).toLowerCase().includes(q));
                            }).slice(0, 7).map(emp => {
                                const name = getEmployeeDisplayName(emp);
                                return (
                                    <div key={emp.employeeNumber} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }} onClick={() => onSelectEmployee(emp)} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-main)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <div className="emp-avatar">{name.charAt(0).toUpperCase()}</div>
                                            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: emp.presenceStatus === 'Online' ? 'var(--status-active)' : 'var(--text-secondary)', border: '2px solid var(--bg-card)', display: 'block' }} title={emp.presenceStatus ?? 'Offline'} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{emp.employeeNumber}</span>
                                                <RoleBadge role={toDisplayRole(emp.role)} size="sm" />
                                                <StatusBadge status={emp.accountStatus || 'Active'} size="sm" />
                                            </div>
                                        </div>
                                        <div className="cell-actions" onClick={e => e.stopPropagation()}>
                                            <button className="action-icon-btn" title="View Details" onClick={() => onSelectEmployee(emp)}><Eye size={14} /></button>
                                            {onEditEmployee && (
                                                <button className="action-icon-btn" title="Edit" onClick={() => onEditEmployee(emp)}><Pencil size={14} /></button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="card activity-card">
                    <div className="card-header-layout"><span className="text-link">Recent Activity</span></div>
                    <div className="activity-feed-list">
                        {loading
                            ? <EmptyState icon={<Loader2 size={22} className="spin" />} message="Loading..." />
                            : activityLogs.length === 0
                                ? <EmptyState icon={<ClipboardList size={22} />} message="No recent activity" />
                                : (activityLogs || []).filter(log => {
                                    if (!searchQuery) return true;
                                    const q = searchQuery.toLowerCase();
                                    return log.description.toLowerCase().includes(q)
                                        || log.activityType.toLowerCase().includes(q);
                                }).slice(0, 8).map((log, index) => {
                                    let dotColor = 'var(--primary)';
                                    let ringColor = 'rgba(0, 169, 157, 0.15)';
                                    if (log.activityType === 'Login') { dotColor = 'var(--status-active)'; ringColor = 'rgba(5, 150, 105, 0.15)'; }
                                    else if (log.activityType === 'Logout') { dotColor = 'var(--status-pending)'; ringColor = 'rgba(217, 119, 6, 0.15)'; }
                                    else if (log.activityType === 'Profile Update') { dotColor = 'var(--status-transit)'; ringColor = 'rgba(2, 132, 199, 0.15)'; }
                                    return (
                                        <div key={log.activityLogId} className="activity-feed-item" style={{ display: 'flex', gap: 16, marginBottom: 20, position: 'relative' }}>
                                            {index < Math.min(activityLogs.length, 8) - 1 && <div style={{ position: 'absolute', left: 4, top: 16, bottom: -24, width: 2, background: 'var(--border)', zIndex: 0 }} />}
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, boxShadow: `0 0 0 4px ${ringColor}`, zIndex: 1, flexShrink: 0, marginTop: 4 }} />
                                            <div className="activity-feed-content" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <span className="activity-feed-text" style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>{log.description}</span>
                                                <span className="activity-feed-time" style={{ color: 'var(--text-secondary)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Clock size={10} />
                                                    {log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                    </div>
                    {activityLogs.length > 0 && activityLogTotalPages && activityLogTotalPages > 1 && (
                        <Pagination currentPage={activityLogPage ?? 1} totalPages={activityLogTotalPages} onPageChange={p => onActivityLogPageChange?.(p)} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Manage Employees Tab ─────────────────────────────────────────────────────

type EmployeeSubTab = 'employees' | 'archived';

interface ManageEmployeesTabProps {
    employees: RecentEmployee[];
    loading: boolean;
    onSelectEmployee: (emp: RecentEmployee) => void;
    onAddEmployee: () => void;
    empPage: number;
    empTotalPages: number;
    onEmpPageChange: (page: number, filters: { search: string; role: string; status: string }) => void;
    onEditEmployee: (emp: RecentEmployee) => void;
    onArchiveEmployee: (emp: RecentEmployee) => void;
    onViewEmployee: (emp: RecentEmployee) => void;
    rolesList?: string[];
}

function ManageEmployeesTab({
    employees, loading, onSelectEmployee, onAddEmployee,
    empPage, empTotalPages, onEmpPageChange,
    onEditEmployee, onArchiveEmployee, onViewEmployee,
    rolesList = SYSTEM_ROLES,
}: ManageEmployeesTabProps) {
    const [subTab, setSubTab] = useState<EmployeeSubTab>('employees');
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    useEffect(() => {
        onEmpPageChange(1, { search, role: filterRole, status: filterStatus });
    }, [search, filterRole, filterStatus]);

    // ── Shared table card wrapper ──────────────────────────────────────────────
    return (
        <div className="dashboard-content">
            {/* ── Unified sub-tab nav ── */}
            <SubTabNav
                    tabs={[
                        { key: 'employees', label: 'All Employees', icon: <Users size={14} /> },
                    ]}
                activeTab={subTab}
                onTabChange={(key) => setSubTab(key as EmployeeSubTab)}
            />

            {/* ── All Employees ── */}
            {subTab === 'employees' && (
                <DataTable
                    searchQuery={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search by name or ID…"
                    filterElements={
                        <>
                            <Select value={filterRole} onChange={setFilterRole} placeholder="All Roles"
                                options={rolesList.map(r => ({ value: r, label: r }))} />
                            <Select value={filterStatus} onChange={setFilterStatus} placeholder="All Statuses"
                                options={[{ value: 'Active', label: 'Active' }, { value: 'Deactivated', label: 'Deactivated' }]} />
                        </>
                    }
                    actionButton={{ label: 'Add Employee', icon: <Plus size={14} />, onClick: onAddEmployee }}
                    headers={['NAME', 'EMPLOYEE NO', 'ROLE', 'CONTACT', 'STATUS', 'ACTION']}
                    loading={loading}
                    emptyMessage="No employees match your filters"
                    currentPage={empPage}
                    totalPages={empTotalPages}
                    onPageChange={p => onEmpPageChange(p, { search, role: filterRole, status: filterStatus })}
                    totalRecords={employees.length}
                >
                    {employees.map(emp => {
                        const name = getEmployeeDisplayName(emp) || 'Unknown';
                        return (
                            <tr key={emp.employeeNumber} onClick={() => onSelectEmployee(emp)} style={{ cursor: 'pointer' }}>
                                <td>
                                    <div className="emp-name-cell">
                                        <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                                            <div className="emp-avatar">{name.charAt(0).toUpperCase()}</div>
                                            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: emp.presenceStatus === 'Online' ? 'var(--status-active)' : 'var(--text-secondary)', border: '2px solid var(--bg-card)', display: 'block' }} title={emp.presenceStatus ?? 'Offline'} />
                                        </div>
                                        <span style={{ fontWeight: 600 }}>{name}</span>
                                    </div>
                                </td>
                                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.employeeNumber}</td>
                                <td style={{ fontSize: 13 }}>{emp.role ? toDisplayRole(emp.role) : <span className="no-role">—</span>}</td>
                                <td style={{ fontSize: 13 }}>{emp.contactNumber}</td>
                                <td><StatusBadge status={emp.accountStatus || 'Active'} /></td>
                                <td onClick={e => e.stopPropagation()}>
                                    <ActionsDropdown actions={[
                                        { label: 'View Details', icon: <Eye size={12} />, onClick: () => onViewEmployee(emp) },
                                        { label: 'Edit', icon: <Pencil size={12} />, onClick: () => onEditEmployee(emp) },
                                        { label: 'Archive', icon: <Trash2 size={12} />, onClick: () => onArchiveEmployee(emp), variant: 'danger' },
                                    ]} />
                                </td>
                            </tr>
                        );
                    })}
                </DataTable>
            )}


        </div>
    );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ onProfileUpdate }: { onProfileUpdate?: (fullName: string) => void }) {
    const employeeId = localStorage.getItem('employeeId') ?? '';
    const storedFirstName = localStorage.getItem('firstName') ?? '';
    const storedMiddleName = localStorage.getItem('middleName') ?? '';
    const storedLastName = localStorage.getItem('lastName') ?? '';
    const storedSuffix = localStorage.getItem('suffix') ?? '';
    const legacyName = localStorage.getItem('employeeName') ?? '';
    const employeeContact = localStorage.getItem('contactNumber') ?? '';
    const storedEmail = localStorage.getItem('email') ?? '';

    // ── Password Gate (now via ConfirmationModal) ──────────────────────────────
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(CONFIRM_CLOSED);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [showGatePassword, setShowGatePassword] = useState(false);

    const [editingProfile, setEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({
        firstName: storedFirstName,
        middleName: storedMiddleName,
        lastName: storedLastName,
        suffix: storedSuffix,
        contactNumber: employeeContact,
        email: storedEmail,
    });
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const { success } = useToast();
    const [profileError, setProfileError] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    useEffect(() => {
        api.get('/api/Auth/me')
            .then(res => {
                const result = res.data;
                if (!result || !result.isSuccess || !result.data) return;
                const p = result.data;
                const contact = p.contactNumber ?? '';
                const email = p.email ?? '';
                const firstName = p.firstName ?? '';
                const middleName = p.middleName ?? '';
                const lastName = p.lastName ?? '';
                const suffix = p.suffix ?? '';
                const fullName = buildDisplayName(firstName, middleName, lastName, suffix);

                localStorage.setItem('firstName', firstName);
                localStorage.setItem('middleName', middleName);
                localStorage.setItem('lastName', lastName);
                localStorage.setItem('suffix', suffix);
                localStorage.setItem('contactNumber', contact);
                localStorage.setItem('email', email);
                localStorage.setItem('employeeName', fullName);

                setProfileForm({
                    firstName,
                    middleName,
                    lastName,
                    suffix,
                    contactNumber: contact,
                    email,
                });

                if (onProfileUpdate) {
                    onProfileUpdate(fullName);
                }
            })
            .catch(err => console.error('Error fetching profile:', err));
    }, [onProfileUpdate]);

    const [editingPassword, setEditingPassword] = useState(false);
    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwError, setPwError] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

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

    const requestEditProfile = () => {
        setEditingProfile(true);
        ['firstName', 'middleName', 'lastName', 'email', 'contactNumber'].forEach(k => validateField(k, (profileForm as any)[k]));
    };

    // ── Profile Save → password gate via ConfirmationModal ────────────────────
    const handleProfileSave = () => {
        if (!profileForm.firstName.trim() || !/^[A-Za-z\s]{1,50}$/.test(profileForm.firstName.trim())) { setProfileError('Given Name must contain letters only and be up to 50 characters.'); return; }
        if (profileForm.middleName?.trim() && !/^[A-Za-z\s]{1,50}$/.test(profileForm.middleName.trim())) { setProfileError('Middle Name must contain letters only and be up to 50 characters.'); return; }
        if (!profileForm.lastName.trim() || !/^[A-Za-z\s]{1,50}$/.test(profileForm.lastName.trim())) { setProfileError('Last Name must contain letters only and be up to 50 characters.'); return; }
        const email = profileForm.email.trim();
        if (!email || email.length < 12 || email.length > 64 || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) { setProfileError('Enter a valid Email Address (12-64 characters, local-part@domain).'); return; }
        if (!profileForm.contactNumber.trim() || !/^[0-9]{11}$/.test(profileForm.contactNumber.trim())) { setProfileError('Contact Number must be exactly 11 digits.'); return; }
        setProfileError('');

        // Open password-gate confirmation modal
        setGatePassword('');
        setGateError('');
        setShowGatePassword(false);
        setConfirmModal({
            isOpen: true,
            variant: 'success',
            title: 'Confirm your identity',
            description: (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Enter your password to save profile changes.
                </p>
            ),
            notice: 'For your security, identity verification is required before saving any profile changes.',
            confirmLabel: 'Verify & save',
            cancelLabel: 'Cancel',
            onConfirm: async () => {
                const pw = (document.getElementById('gate-pw-input') as HTMLInputElement)?.value ?? gatePassword;
                if (!pw) { setGateError('Please enter your password.'); return; }
                setGateLoading(true);
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                setGateError('');
                try {
                    const res = await api.post('/api/Auth/verify-password', { employeeID: employeeId, password: pw });
                    const verifyData = res.data;
                    if (!verifyData.isSuccess) { throw new Error(verifyData.message || verifyData.Message || 'Incorrect password. Please try again.'); }
                    setConfirmModal(CONFIRM_CLOSED);
                    // Verified — now save
                    setProfileSaving(true);
                    const fd = new FormData();
                    fd.append('firstName', profileForm.firstName.trim());
                    fd.append('middleName', profileForm.middleName.trim());
                    fd.append('lastName', profileForm.lastName.trim());
                    fd.append('suffix', profileForm.suffix.trim());
                    fd.append('contactNumber', profileForm.contactNumber.trim());
                    fd.append('email', profileForm.email.trim());
                    await api.uploadPut('/api/Profile/update-profile', fd);
                    localStorage.setItem('firstName', profileForm.firstName.trim());
                    localStorage.setItem('middleName', profileForm.middleName.trim());
                    localStorage.setItem('lastName', profileForm.lastName.trim());
                    localStorage.setItem('suffix', profileForm.suffix.trim());
                    localStorage.setItem('contactNumber', profileForm.contactNumber.trim());
                    localStorage.setItem('email', profileForm.email.trim());
                    const newFullName = buildDisplayName(profileForm.firstName, profileForm.middleName, profileForm.lastName, profileForm.suffix);
                    localStorage.setItem('employeeName', newFullName);
                    if (onProfileUpdate) {
                        onProfileUpdate(newFullName);
                    }
                    success('Profile updated successfully.');
                    setEditingProfile(false);
                } catch (err: any) {
                    setGateError(err.response?.data?.message || err.response?.data?.Message || err.message || 'Incorrect password. Please try again.');
                } finally {
                    setGateLoading(false);
                    setProfileSaving(false);
                }
            },
        });
    };

    const handleProfileChange = (key: keyof typeof profileForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setProfileForm(prev => ({ ...prev, [key]: val }));
        validateField(key, val);
        setProfileError('');
    };

    // ── Password Change ────────────────────────────────────────────────────────
    const handlePwChange = (key: keyof typeof pwForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setPwForm(prev => ({ ...prev, [key]: e.target.value }));
        setPwError('');
    };

    const handlePwSave = () => {
        if (!pwForm.current) { setPwError('Current password is required.'); return; }
        if (pwForm.next.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
        if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }

        setConfirmModal({
            isOpen: true,
            variant: 'warning',
            title: 'Change your password?',
            description: 'You are about to update your login password. You will continue to be logged in after the change.',
            notice: 'Make sure you remember the new password before confirming.',
            confirmLabel: 'Update password',
            onConfirm: async () => {
                setPwSaving(true);
                try {
                    await api.patch('/api/Auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.next });
                    setEditingPassword(false);
                    setPwForm({ current: '', next: '', confirm: '' });
                    setConfirmModal(CONFIRM_CLOSED);
                    // Show success state via a new modal
                    setConfirmModal({
                        isOpen: true,
                        variant: 'success',
                        title: 'Password updated',
                        description: 'Your password has been changed successfully. Use your new password the next time you log in.',
                        confirmLabel: 'Got it',
                        cancelLabel: '',
                        onConfirm: () => setConfirmModal(CONFIRM_CLOSED),
                    });
                } catch (err: any) {
                    setPwError(err.message ?? 'Something went wrong.');
                    setConfirmModal(CONFIRM_CLOSED);
                } finally {
                    setPwSaving(false);
                }
            },
        });
    };

    const displayName = buildDisplayName(
        profileForm.firstName || storedFirstName,
        profileForm.middleName || storedMiddleName,
        profileForm.lastName || storedLastName,
        profileForm.suffix || storedSuffix
    ) || legacyName || 'Manager';
    const displayContact = profileForm.contactNumber || employeeContact;

    const avatarInitial = displayName.charAt(0).toUpperCase() || '?';

    return (
        <div className="dashboard-content">
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1.5fr' }}>
                {/* ── ID Card Profile ── */}
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ background: 'linear-gradient(135deg, #4318ff 0%, #6a5cff 50%, #4318ff 100%)', padding: '28px 24px 20px', textAlign: 'center', marginBottom: 0 }}>
                        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 32, fontWeight: 800, color: '#fff' }}>{avatarInitial}</div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{displayName}</h2>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                            <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>MANAGER</span>
                            <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>#{employeeId}</span>
                        </div>
                    </div>
                    <div style={{ padding: '20px 24px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Personal Information</h3>
                            {!editingProfile && (
                                <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8 }} onClick={requestEditProfile}>
                                    <Pencil size={11} /> Edit
                                </button>
                            )}
                        </div>
                        {editingProfile ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {profileError && <ErrorBanner message={profileError} />}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div className="field"><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>First Name <span style={{ color: '#ef4444' }}>*</span></label><input type="text" value={profileForm.firstName} onChange={handleProfileChange('firstName')} placeholder="First name" maxLength={50} style={{ ...(validationErrors['firstName'] ? { borderColor: '#ef4444' } : {}), height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />{validationErrors['firstName'] && <span style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{validationErrors['firstName']}</span>}</div>
                                    <div className="field"><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Name <span style={{ color: '#ef4444' }}>*</span></label><input type="text" value={profileForm.lastName} onChange={handleProfileChange('lastName')} placeholder="Last name" maxLength={50} style={{ ...(validationErrors['lastName'] ? { borderColor: '#ef4444' } : {}), height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />{validationErrors['lastName'] && <span style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{validationErrors['lastName']}</span>}</div>
                                    <div className="field"><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Middle Name <span style={{ fontSize: 9, color: '#94a3b8' }}>(opt)</span></label><input type="text" value={profileForm.middleName} onChange={handleProfileChange('middleName')} placeholder="Middle name" maxLength={50} style={{ ...(validationErrors['middleName'] ? { borderColor: '#ef4444' } : {}), height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /></div>
                                    <div className="field"><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suffix <span style={{ fontSize: 9, color: '#94a3b8' }}>(opt)</span></label><input type="text" value={profileForm.suffix} onChange={handleProfileChange('suffix')} placeholder="Jr., Sr., III" maxLength={10} style={{ height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /></div>
                                </div>
                                <div className="field"><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email <span style={{ color: '#ef4444' }}>*</span></label><input type="email" value={profileForm.email} onChange={handleProfileChange('email')} placeholder="e.g. name@company.com" style={{ ...(validationErrors['email'] ? { borderColor: '#ef4444' } : {}), height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />{validationErrors['email'] && <span style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{validationErrors['email']}</span>}</div>
                                <div className="field"><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contact Number</label><input type="tel" value={profileForm.contactNumber} onChange={handleProfileChange('contactNumber')} placeholder="e.g. 09170000000" style={{ ...(validationErrors['contactNumber'] ? { borderColor: '#ef4444' } : {}), height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />{validationErrors['contactNumber'] && <span style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{validationErrors['contactNumber']}</span>}</div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                                    <button className="btn" style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8 }} onClick={() => { setEditingProfile(false); setProfileError(''); setProfileForm({ firstName: storedFirstName, middleName: storedMiddleName, lastName: storedLastName, suffix: storedSuffix, contactNumber: employeeContact, email: storedEmail }); }} disabled={profileSaving}>Cancel</button>
                                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8 }} onClick={handleProfileSave} disabled={profileSaving}>
                                        {profileSaving ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Save size={13} /> Save Changes</>}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                                {[
                                    { icon: <Hash size={13} />, label: 'Employee ID', value: employeeId },
                                    { icon: <UserCircle2 size={13} />, label: 'First Name', value: profileForm.firstName },
                                    { icon: <UserCircle2 size={13} />, label: 'Last Name', value: profileForm.lastName },
                                    { icon: <UserCircle2 size={13} />, label: 'Middle Name', value: profileForm.middleName || '—' },
                                    { icon: <Mail size={13} />, label: 'Email', value: profileForm.email || '—' },
                                    { icon: <Phone size={13} />, label: 'Contact', value: displayContact || '—' },
                                ].map(({ icon, label, value }) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                        <div style={{ color: '#64748b', flexShrink: 0, display: 'flex' }}>{icon}</div>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{value || '—'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Security Settings ── */}
                <div className="card">
                    <div className="card-header-layout">
                        <h3>Security</h3>
                        {!editingPassword && (
                            <button className="btn btn-primary btn-sm" onClick={() => setEditingPassword(true)}>
                                <Lock size={12} /> Change Password
                            </button>
                        )}
                    </div>
                    {!editingPassword ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                            <div className="system-status-item" style={{ cursor: 'default' }}><div className="system-icon bg-success"><CheckCircle2 size={16} /></div><div className="system-info"><span className="system-name">Password</span><span className="system-detail">Last updated recently</span></div><span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: 'rgba(5,150,105,0.1)', padding: '3px 10px', borderRadius: 999 }}>Secure</span></div>
                            <div style={{ height: 1, background: '#e2e8f0' }} />
                            <div className="system-status-item" style={{ cursor: 'default' }}><div className="system-icon bg-primary"><Shield size={16} /></div><div className="system-info"><span className="system-name">Role Permissions</span><span className="system-detail">Full system access granted</span></div><span style={{ fontSize: 11, fontWeight: 600, color: '#4318ff', background: 'rgba(67,24,255,0.1)', padding: '3px 10px', borderRadius: 999 }}>Admin</span></div>
                            <div style={{ height: 1, background: '#e2e8f0' }} />
                            <div className="system-status-item" style={{ cursor: 'default' }}><div className="system-icon bg-warning"><AlertCircle size={16} /></div><div className="system-info"><span className="system-name">Active Session</span><span className="system-detail">Logged in on this device</span></div><span style={{ fontSize: 11, fontWeight: 600, color: '#d97706', background: 'rgba(217,119,6,0.1)', padding: '3px 10px', borderRadius: 999 }}>Live</span></div>
                        </div>
                    ) : (
                        <div className="modal-form" style={{ padding: '4px 0 0' }}>
                            {pwError && <ErrorBanner message={pwError} />}
                            <div className="field" style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Password</label><div style={{ position: 'relative' }}><input type={showCurrent ? 'text' : 'password'} value={pwForm.current} onChange={handlePwChange('current')} placeholder="Enter current password" style={{ height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 40px 0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /><button type="button" onClick={() => setShowCurrent(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }} tabIndex={-1}>{showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
                            <div className="field" style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>New Password</label><div style={{ position: 'relative' }}><input type={showNext ? 'text' : 'password'} value={pwForm.next} onChange={handlePwChange('next')} placeholder="At least 6 characters" style={{ height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 40px 0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /><button type="button" onClick={() => setShowNext(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }} tabIndex={-1}>{showNext ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
                            <div className="field" style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confirm New Password</label><div style={{ position: 'relative' }}><input type={showConfirm ? 'text' : 'password'} value={pwForm.confirm} onChange={handlePwChange('confirm')} placeholder="Re-enter new password" style={{ height: 38, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 40px 0 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /><button type="button" onClick={() => setShowConfirm(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }} tabIndex={-1}>{showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button className="btn btn-sm" onClick={() => { setEditingPassword(false); setPwError(''); setPwForm({ current: '', next: '', confirm: '' }); }} disabled={pwSaving}>Cancel</button>
                                <button className="btn btn-primary btn-sm" onClick={handlePwSave} disabled={pwSaving}>
                                    {pwSaving ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Save size={13} /> Update Password</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
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
                            <div className="system-info"><span className="system-name">{name}</span><span className="system-detail">{detail}</span></div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#2b3674', background: '#eef2ff', padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>Full Access</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Profile/Password Confirmation Modal ── */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                variant={confirmModal.variant}
                title={confirmModal.title}
                description={confirmModal.description}
                notice={confirmModal.notice}
                confirmLabel={confirmModal.confirmLabel}
                cancelLabel={confirmModal.cancelLabel}
                isLoading={confirmModal.isLoading || gateLoading || pwSaving}
                extraContent={confirmModal.isOpen && confirmModal.title === 'Confirm your identity' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="gate-pw-input"
                                type={showGatePassword ? 'text' : 'password'}
                                placeholder="Enter your current password"
                                style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box', height: 38, borderRadius: 8, border: `1.5px solid ${gateError ? '#dc2626' : '#e2e8f0'}`, padding: '0 40px 0 12px', fontSize: 13, outline: 'none' }}
                                autoFocus
                                onChange={e => { setGatePassword(e.target.value); setGateError(''); }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        const btn = document.getElementById('gate-confirm-btn');
                                        btn?.click();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowGatePassword(p => !p)}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                                tabIndex={-1}
                            >
                                {showGatePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                        {gateError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#dc2626' }}>
                                <AlertCircle size={12} />{gateError}
                            </div>
                        )}
                    </div>
                ) : undefined}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(CONFIRM_CLOSED)}
            />
        </div>
    );
}



// ─── Government Records Tab ────────────────────────────────────────────────────

// [GovernmentRecordsTab — removed per system update]

// ─── Root Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
    const navigate = useNavigate();
    const { success, error } = useToast();
    const [employeeName, setEmployeeName] = useState(() => {
        const storedFirst = localStorage.getItem('firstName') ?? '';
        const storedMiddle = localStorage.getItem('middleName') ?? '';
        const storedLast = localStorage.getItem('lastName') ?? '';
        const storedSuffix = localStorage.getItem('suffix') ?? '';
        return buildDisplayName(storedFirst, storedMiddle, storedLast, storedSuffix) || localStorage.getItem('employeeName') || '';
    });
    const currentEmployeeId = localStorage.getItem('employeeId') || '';
    usePreventBackNav();

    const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
    // Close any open task detail/edit panels when navigating via the sidebar
    // so they don't linger over a different page.
    const handleNavChange = useCallback((tab: NavTab) => {
        setActiveTab(tab);
        setTmDetailTask(null);
        setTmEditingTask(null);
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
        { label: 'Manage Employee', onClick: () => handleNavChange('employees'), active: activeTab === 'employees' },
        { label: 'Task Management', onClick: () => handleNavChange('tasks'), active: activeTab === 'tasks' },
        { label: 'Reports', onClick: () => handleNavChange('reports'), active: activeTab === 'reports' },
        { label: 'Role Management', onClick: () => handleNavChange('roles'), active: activeTab === 'roles' },
        { label: 'Org Structure', onClick: () => handleNavChange('org-structure'), active: activeTab === 'org-structure' },
        { label: 'Activity Logs', onClick: () => handleNavChange('activity_logs'), active: activeTab === 'activity_logs' },
        ...(AI_ANALYTICS_ENABLED ? [{ label: 'Biomarker Scan', onClick: () => handleNavChange('biomarker'), active: activeTab === 'biomarker' }] : []),
        ],
        },
        {
        label: 'Delivery Management System',
        icon: 'ti ti-truck-delivery',
        subItems: [
        { label: 'Delivery Summary', onClick: () => handleNavChange('delivery'), active: activeTab === 'delivery' },
        ],
        },
        {
        label: 'Financial Management System',
        icon: 'ti ti-currency-dollar',
        subItems: [
        { label: 'Finance', onClick: () => handleNavChange('finance'), active: activeTab === 'finance' },
        ],
        },
        {
        label: 'General',
        icon: 'ti ti-settings',
        subItems: [
        { label: 'Announcements', onClick: () => handleNavChange('announcements'), active: activeTab === 'announcements' },
        { label: 'Settings', onClick: () => handleNavChange('settings'), active: activeTab === 'settings' },
        { label: 'Notifications', onClick: () => handleNavChange('notifications'), active: activeTab === 'notifications' },
        ],
        },
        ],
        },
    ], [activeTab, handleNavChange]);
    const [rolesList, setRolesList] = useState<string[]>(['Manager', 'Coordinator', 'Dispatcher', 'Encoder', 'Courier', 'Accountant']);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<RecentEmployee | null>(null);
    const [empModalEditMode, setEmpModalEditMode] = useState(false);
    const [archiveConfirmEmp, setarchiveConfirmEmp] = useState<RecentEmployee | null>(null);
    const [archiveSubmitting, setarchiveSubmitting] = useState(false);
    const [selectedPanelEmployee, setSelectedPanelEmployee] = useState<RecentEmployee | null>(null);
    const [detailPanelInitialSection, setDetailPanelInitialSection] = useState<'overview'>('overview');
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);


    // ── Employees ──
    const [employees, setEmployees] = useState<RecentEmployee[]>([]);
    const [recentEmployees, setRecentEmployees] = useState<RecentEmployee[]>([]);
    const [empLoading, setEmpLoading] = useState(true);
    const [empPage, setEmpPage] = useState(1);
    const [empTotalPages, setEmpTotalPages] = useState(1);

    // ── Task Management ──
    const [tmTasks, setTmTasks] = useState<any[]>([]);
    const [tmLoading, setTmLoading] = useState(false);
    const [showNewTask, setShowNewTask] = useState(false);
    const [taskSubTab, setTaskSubTab] = useState<'list' | 'create'>('list');
    const [tmDetailTask, setTmDetailTask] = useState<TaskViewTask | null>(null);
    const [tmEditingTask, setTmEditingTask] = useState<TaskViewTask | null>(null);
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

    const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', priority: '', deadline: '', classification: '', isConfidential: false, assignmentScope: 'SingleEmployee', assignedDepartmentId: '', assignedTo: '', assignedUserIds: [] as string[], supportingEvidenceUrl: '' });
    const [newTaskErrors, setNewTaskErrors] = useState<Record<string, string>>({});
    const [newTaskSubmitting, setNewTaskSubmitting] = useState(false);
    const [newTaskApiError, setNewTaskApiError] = useState('');
    const [editForm, setEditForm] = useState({ title: '', description: '', priority: '', deadline: '', classification: '', isConfidential: false, assignmentScope: 'SingleEmployee', assignedDepartmentId: '', assignedTo: '', assignedUserIds: [] as string[], supportingEvidenceUrl: '' });
    const [editErrors, setEditErrors] = useState<Record<string, string>>({});
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editApiError, setEditApiError] = useState('');
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [newTaskEligibleEmployees, setNewTaskEligibleEmployees] = useState<WorkloadInfo[]>([]);
    const [rawApiKeys, setRawApiKeys] = useState<string>('');
    const [editEligibleEmployees, setEditEligibleEmployees] = useState<WorkloadInfo[]>([]);
    const [newTaskRecommendation, setNewTaskRecommendation] = useState<{ employeeName: string; accountId: string; availabilityStatus: string; workload: number; reason: string } | null>(null);
    const [editTaskRecommendation, setEditTaskRecommendation] = useState<{ employeeName: string; accountId: string; availabilityStatus: string; workload: number; reason: string } | null>(null);
    const [newTaskSingleSearch, setNewTaskSingleSearch] = useState('');
    const [newTaskTeamSearch, setNewTaskTeamSearch] = useState('');
    const [newTaskSupportingEvidence, setNewTaskSupportingEvidence] = useState<File[]>([]);
    const newTaskFileRef = useRef<HTMLInputElement>(null);
    const [editTaskSingleSearch, setEditTaskSingleSearch] = useState('');
    const [editTaskTeamSearch, setEditTaskTeamSearch] = useState('');
    const [editTaskSupportingEvidence, setEditTaskSupportingEvidence] = useState<File[]>([]);
    const editTaskFileRef = useRef<HTMLInputElement>(null);
    const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };
    const PRIORITY_NUM_FROM_LABEL: Record<string, number> = { Low: 0, Medium: 1, High: 2, Urgent: 3 };
    const STATUS_LABELS: Record<number, string> = { 0: 'Not Started', 1: 'In Progress', 2: 'Done/Pending Review', 3: 'Completed', 4: 'On Hold', 5: 'Cancelled' };

    const toLocalDateTimeInput = (iso: string | null | undefined): string => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch { return ''; }
    };

    const mapManagerTaskToView = (t: any): TaskViewTask => {
        const statusNum = t.status;
        const mappedStatus = STATUS_LABELS[statusNum] ?? 'Not Started';
        const assignees = t.assignees ?? [];
        const firstAssignee = assignees[0];
        return {
            taskId: t.id ?? t.taskId ?? '',
            taskTitle: t.title ?? t.taskTitle ?? '',
            taskDescription: t.description ?? t.taskDescription ?? '',
            priority: ({ 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' } as Record<number, any>)[t.priorityLevel] ?? 'Medium',
            dueAt: t.deadline ?? t.dueAt ?? null,
            taskStatus: mappedStatus as TaskViewTask['taskStatus'],
            taskRemarks: t.remarks ?? t.taskRemarks ?? '',
            assignedEmployee: firstAssignee?.fullName ?? t.assignedEmployee ?? 'Unassigned',
            createdByEmployee: t.createdByName ?? t.createdByEmployee ?? localStorage.getItem('employeeName') ?? 'Manager',
            assignedTo: firstAssignee?.userId ?? t.assignedTo ?? '',
            assignees: assignees.map((a: any) => ({
                fullName: a.fullName ?? a.FullName ?? '',
                completionPercentage: a.completionPercentage ?? a.CompletionPercentage ?? 0,
            })),
            createdAt: t.createdAt ?? new Date().toISOString(),
            isConfidential: t.isConfidential ?? false,
            classification: t.classification === 1 ? 'special' : 'routine',
            isSLALocked: t.isSLALocked ?? false,
            assignmentScope: t.assignmentScope ?? t.AssignmentScope ?? 0,
            assignedDepartmentId: t.assignedDepartmentId ?? t.AssignedDepartmentId ?? '',
            assignedDepartmentName: t.assignedDepartmentName ?? t.AssignedDepartmentName ?? '',
            taskReferenceNumber: t.taskReferenceNumber ?? t.referenceNumber ?? '',
        };
    };

    const fetchManagerTasks = async (silent: boolean = false) => {
        if (!silent) setTmLoading(true);
        try {
            const res = await api.get('/api/Task', { pageNumber: 1, pageSize: 500 });
            const json = res.data;
            const raw = Array.isArray(json) ? json : (Array.isArray(json?.data?.items) ? json.data.items : (Array.isArray(json?.data) ? json.data : []));
            setTmTasks(raw.map((t: any) => ({
                id: t.id ?? t.taskId,
                name: t.title ?? t.taskTitle ?? '',
                referenceNumber: t.taskReferenceNumber ?? '',
                classification: t.classification === 1 ? 'special' : 'routine',
                project: t.classification === 1 ? 'SpecialTask' : '',
                assignee: t.assignees?.length ? { id: t.assignees[0].userId ?? '', name: t.assignees[0].fullName ?? '' } : undefined,
                priority: ({ 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' } as Record<number, any>)[t.priorityLevel] || 'Medium',
                status: ({ 0: 'To do', 1: 'In progress', 2: 'In review', 3: 'Done', 4: 'On hold', 5: 'Cancelled' } as Record<number, any>)[t.status] || 'Backlog',
                dueDate: t.deadline ?? t.dueAt ?? undefined,
                progress: t.status === 3 ? 100 : t.status === 1 ? 50 : t.status === 2 ? 80 : t.status === 0 ? 10 : 0,
                isArchived: false,
                isConfidential: t.isConfidential ?? false,
                isSLALocked: t.isSLALocked ?? false,
                assignmentScope: t.assignmentScope ?? t.AssignmentScope ?? 0,
            })));
        } catch { setTmTasks([]); }
        if (!silent) setTmLoading(false);
    };

    useEffect(() => { if (activeTab === 'tasks') { fetchManagerTasks(); } }, [activeTab]);

    useEffect(() => {
        api.get('/api/Department')
            .then(res => {
                const json = res.data;
                const items = json?.data?.items ?? (Array.isArray(json.data) ? json.data : []);
                if (json?.isSuccess && items.length > 0) {
                    setDepartments(items.map((d: any) => ({ id: d.id, name: d.name })));
                }
            })
            .catch(() => {});
    }, []);

    const fetchAssignableEmployees = async (setter: (list: WorkloadInfo[]) => void, setRec: (r: any) => void) => {
        try {
            const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=50');
            const json = res.data;
            const list: any[] = json.isSuccess && Array.isArray(json.data?.items) ? json.data.items : (json.isSuccess && Array.isArray(json.data) ? json.data : (Array.isArray(json.data?.data) ? json.data.data : []));
            if (list.length > 0) {
                const sample = list[0];
                console.debug('[TaskForm] ALL KEYS of first item:', Object.keys(sample));
                console.debug('[TaskForm] Raw first item:', JSON.stringify(sample, null, 2));
                console.debug('[TaskForm] Full JSON response (truncated):', JSON.stringify(json).slice(0, 2000));
                setRawApiKeys(Object.keys(sample).join(', ') + '\n\n' + JSON.stringify(sample, null, 2).slice(0, 800));
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
                setter(mapped);
                const activeEmployees = mapped.filter(e => e.isAvailable);
                if (activeEmployees.length > 0) {
                    const best = activeEmployees.reduce((a, b) => a.workload <= b.workload ? a : b);
                    setRec({
                        employeeName: best.employeeName || 'Recommended Employee',
                        accountId: best.accountId,
                        availabilityStatus: best.availabilityStatus,
                        workload: best.workload,
                        reason: 'Available for assignment',
                    });
                }
            }
        } catch (err) {
            console.warn('[TaskForm] fetchAssignableEmployees error:', err);
        }
    };

    useEffect(() => { if (showNewTask) { fetchAssignableEmployees(setNewTaskEligibleEmployees, setNewTaskRecommendation); } }, [showNewTask]);
    useEffect(() => { if (tmEditingTask) { fetchAssignableEmployees(setEditEligibleEmployees, setEditTaskRecommendation); } }, [tmEditingTask]);

    const handleManagerTaskArchive = async (ids: string[]) => {
        for (const id of ids) {
            try {
                await api.patch(`/api/Task/${id}/archive`);
            } catch { /* ignore individual failures */ }
        }
        success(`${ids.length} task${ids.length !== 1 ? 's' : ''} archived.`);
        fetchManagerTasks();
    };

    const handleManagerTaskRestore = async (ids: string[]) => {
        for (const id of ids) {
            try {
                await api.patch(`/api/Task/${id}/restore`);
            } catch { /* ignore individual failures */ }
        }
        success(`${ids.length} task${ids.length !== 1 ? 's' : ''} restored.`);
        fetchManagerTasks();
    };

    const handleManagerTaskDelete = async (ids: string[]) => {
        for (const id of ids) {
            try {
                await api.delete(`/api/Task/${id}`);
            } catch { /* ignore individual failures */ }
        }
        success(`${ids.length} task${ids.length !== 1 ? 's' : ''} deleted.`);
        fetchManagerTasks();
    };

    const handleManagerTaskMarkDone = async (ids: string[]) => {
        for (const id of ids) {
            try {
                await api.patch(`/api/Task/${id}/status`, { status: 3 });
            } catch { /* ignore individual failures */ }
        }
        success(`${ids.length} task${ids.length !== 1 ? 's' : ''} marked done.`);
        fetchManagerTasks();
    };

    const handleManagerTaskView = (id: string) => {
        const found = tmTasks.find(t => t.id === id);
        if (!found) return;
        // The list view flattens the task; reconstruct a TaskViewTask from the raw data
        // by re-fetching the full record so we get description, remarks, etc.
        api.get(`/api/Task/${id}`)
            .then(res => {
                const json = res.data;
                const raw = json?.data ?? json;
                if (raw) {
                    setTmDetailTask(mapManagerTaskToView(raw));
                } else {
                    // Fallback: map from the list summary
                    setTmDetailTask({
                        taskId: found.id,
                        taskTitle: found.name,
                        taskDescription: '',
                        priority: found.priority,
                        dueAt: found.dueDate ?? null,
                        taskStatus: found.status === 'Done' ? 'Completed' : 'In Progress',
                        assignedEmployee: found.assignee?.name ?? 'Unassigned',
                        createdByEmployee: localStorage.getItem('employeeName') ?? 'Manager',
                        assignedTo: found.assignee?.id ?? '',
                        createdAt: new Date().toISOString(),
                        assignmentScope: found.assignmentScope ?? found.AssignmentScope ?? 0,
                    });
                }
            })
            .catch(() => {
                setTmDetailTask({
                    taskId: found.id,
                    taskTitle: found.name,
                    taskDescription: '',
                    priority: found.priority,
                    dueAt: found.dueDate ?? null,
                    taskStatus: found.status === 'Done' ? 'Completed' : 'In Progress',
                    assignedEmployee: found.assignee?.name ?? 'Unassigned',
                    createdByEmployee: localStorage.getItem('employeeName') ?? 'Manager',
                    assignedTo: found.assignee?.id ?? '',
                    createdAt: new Date().toISOString(),
                });
            });
    };

    useEffect(() => {
        if (tmEditingTask) {
            setEditForm({
                title: tmEditingTask.taskTitle ?? '',
                description: tmEditingTask.taskDescription ?? '',
                priority: tmEditingTask.priority ?? '',
                deadline: toLocalDateTimeInput(tmEditingTask.dueAt),
                classification: tmEditingTask.classification ?? '',
                isConfidential: tmEditingTask.isConfidential ?? false,
                assignmentScope: (tmEditingTask.assignmentScope !== undefined ? ['SingleEmployee', 'Team', 'Department'][tmEditingTask.assignmentScope] : 'SingleEmployee') as string,
                assignedDepartmentId: tmEditingTask.assignedDepartmentId ?? '',
                assignedTo: '',
                assignedUserIds: [],
                supportingEvidenceUrl: '',
            });
            setEditErrors({});
            setEditApiError('');
        }
    }, [tmEditingTask]);

    useEffect(() => {
        if (!showNewTask) {
            setNewTaskForm({ title: '', description: '', priority: '', deadline: '', classification: '', isConfidential: false, assignmentScope: 'SingleEmployee', assignedDepartmentId: '', assignedTo: '', assignedUserIds: [], supportingEvidenceUrl: '' });
            setNewTaskErrors({});
            setNewTaskApiError('');
            setNewTaskEligibleEmployees([]);
            setNewTaskRecommendation(null);
        }
    }, [showNewTask]);

    // -- Delete a task attachment --
    const handleManagerDeleteAttachment = async (attachmentId: string) => {
        try {
            await api.delete(`/api/attachments/${attachmentId}`);
            success('Attachment deleted.');
            setTmDetailTask(prev => prev ? { ...prev, attachmentCount: Math.max(0, (prev.attachmentCount ?? 0) - 1) } : prev);
            fetchManagerTasks();
        } catch (err: any) {
            error(err.response?.data?.message || err.response?.data?.Message || 'Failed to delete attachment.');
            throw err;
        }
    };

    const handleManagerCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        const t = newTaskForm.title.trim();
        if (!t) errs.title = 'Title is required.';
        else if (t.length < 3) errs.title = 'Title must be at least 3 characters.';
        else if (t.length > 150) errs.title = 'Title must not exceed 150 characters.';
        const d = newTaskForm.description.trim();
        if (!d) errs.description = 'Description is required.';
        else if (d.length > 2000) errs.description = 'Description must not exceed 2,000 characters.';
        if (!newTaskForm.priority) errs.priority = 'Priority is required.';
        if (!newTaskForm.deadline) errs.deadline = 'Deadline is required.';
        if (!newTaskForm.classification) errs.classification = 'Classification is required.';
        if (!newTaskForm.assignmentScope) errs.assignmentScope = 'Assignment scope is required.';
        if (newTaskForm.assignmentScope === 'SingleEmployee' && !newTaskForm.assignedTo) errs.assignedTo = 'Please select an employee to assign.';
        if (newTaskForm.assignmentScope === 'Team' && newTaskForm.assignedUserIds.length === 0) errs.assignedUserIds = 'Please select at least one team member.';
        if (newTaskForm.assignmentScope === 'Department' && !newTaskForm.assignedDepartmentId) errs.assignedDepartmentId = 'Department is required for Department scope.';
        if (Object.keys(errs).length) { setNewTaskErrors(errs); return; }
        setNewTaskErrors({});

        const SCOPE_MAP: Record<string, number> = { SingleEmployee: 0, Team: 1, Department: 2 };
        const scopeNum = SCOPE_MAP[newTaskForm.assignmentScope] ?? 0;

        setNewTaskSubmitting(true);
        setNewTaskApiError('');
        try {
            const userIds = scopeNum === 0
                ? (newTaskForm.assignedTo ? [newTaskForm.assignedTo] : [])
                : scopeNum === 1
                    ? newTaskForm.assignedUserIds
                    : [];
            const createPayload: Record<string, any> = {
                title: t,
                description: d,
                priorityLevel: PRIORITY_NUM_FROM_LABEL[newTaskForm.priority] ?? 1,
                classification: newTaskForm.classification === 'special' ? 1 : 0,
                assignmentScope: scopeNum,
                isConfidential: newTaskForm.isConfidential,
                assignedUserIds: userIds.length > 0 ? userIds : undefined,
                assignedDepartmentId: scopeNum === 2 ? newTaskForm.assignedDepartmentId || undefined : undefined,
            };
            if (newTaskForm.priority !== 'Urgent') {
                createPayload.deadline = new Date(newTaskForm.deadline).toISOString();
            }
            const res = await api.post('/api/Task', createPayload);
            const created = res.data;
            const taskId = created?.data?.id ?? created?.id ?? created?.data?.Id;
            const createdTitle = created?.data?.title ?? created?.title ?? created?.data?.Title ?? t;

            // Upload supporting documents (one or more files) if provided
            if (taskId && newTaskSupportingEvidence.length > 0) {
                const results = await Promise.allSettled(newTaskSupportingEvidence.map(async (file) => {
                    const fileFormData = new FormData();
                    fileFormData.append('file', file);
                    await api.upload(`/api/tasks/${taskId}/attachments`, fileFormData);
                }));
                const failed = results.filter(r => r.status === 'rejected').length;
                const uploaded = results.length - failed;
                setNewTaskSupportingEvidence([]);
                if (failed > 0) {
                    setNewTaskApiError(`${uploaded} attachment(s) uploaded, ${failed} failed.`);
                }
            }
            success(`Task "${createdTitle}" created successfully.`);
            setShowNewTask(false);
            fetchManagerTasks();
        } catch (err: any) {
            setNewTaskApiError(err.response?.data?.message || err.response?.data?.Message || err.message || 'Failed to create task.');
        } finally {
            setNewTaskSubmitting(false);
        }
    };

    const handleManagerEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tmEditingTask) return;
        const errs: Record<string, string> = {};
        const t = editForm.title.trim();
        if (!t) errs.title = 'Title is required.';
        else if (t.length < 3) errs.title = 'Title must be at least 3 characters.';
        else if (t.length > 150) errs.title = 'Title must not exceed 150 characters.';
        const d = editForm.description.trim();
        if (!d) errs.description = 'Description is required.';
        else if (d.length > 2000) errs.description = 'Description must not exceed 2,000 characters.';
        if (!editForm.priority) errs.priority = 'Priority is required.';
        if (!editForm.deadline) errs.deadline = 'Deadline is required.';
        if (!editForm.classification) errs.classification = 'Classification is required.';
        if (Object.keys(errs).length) { setEditErrors(errs); return; }
        setEditErrors({});

        const SCOPE_MAP: Record<string, number> = { SingleEmployee: 0, Team: 1, Department: 2 };
        const scopeNum = SCOPE_MAP[editForm.assignmentScope] ?? 0;

        setEditSubmitting(true);
        setEditApiError('');
        try {
            const editUserIds = scopeNum === 0
                ? (editForm.assignedTo ? [editForm.assignedTo] : [])
                : scopeNum === 1
                    ? editForm.assignedUserIds
                    : [];
            const updatePayload: Record<string, any> = {
                title: t,
                description: d,
                priorityLevel: PRIORITY_NUM_FROM_LABEL[editForm.priority] ?? 1,
                classification: editForm.classification === 'special' ? 1 : 0,
                assignmentScope: scopeNum,
                isConfidential: editForm.isConfidential,
                assignedUserIds: editUserIds.length > 0 ? editUserIds : undefined,
                assignedDepartmentId: scopeNum === 2 ? editForm.assignedDepartmentId || undefined : undefined,
            };
            if (!tmEditingTask.isSLALocked) {
                updatePayload.deadline = new Date(editForm.deadline).toISOString();
            }
            await api.put(`/api/Task/${tmEditingTask.taskId}`, updatePayload);

            // Upload supporting documents (one or more files) if provided
            if (editTaskSupportingEvidence.length > 0) {
                const results = await Promise.allSettled(editTaskSupportingEvidence.map(async (file) => {
                    const fileFormData = new FormData();
                    fileFormData.append('file', file);
                    await api.upload(`/api/tasks/${tmEditingTask.taskId}/attachments`, fileFormData);
                }));
                const failed = results.filter(r => r.status === 'rejected').length;
                const uploaded = results.length - failed;
                setEditTaskSupportingEvidence([]);
                if (failed > 0) {
                    setEditApiError(`${uploaded} attachment(s) uploaded, ${failed} failed.`);
                }
            }
            success(editForm.isConfidential !== (tmEditingTask.isConfidential ?? false)
                ? 'Confidentiality updated successfully.'
                : 'Task updated successfully.');
            setTmEditingTask(null);
            fetchManagerTasks();
        } catch (err: any) {
            setEditApiError(err.response?.data?.message || err.response?.data?.Message || err.message || 'Failed to update task.');
        } finally {
            setEditSubmitting(false);
        }
    };

    // ── Activity Logs ──
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [activityLogPage, setActivityLogPage] = useState(1);
    const [activityLogTotalPages, setActivityLogTotalPages] = useState(1);
    const [activityLogTotalCount, setActivityLogTotalCount] = useState(0);
    const [activityLogLoading, setActivityLogLoading] = useState(false);
    const ACTIVITY_LOG_PAGE_SIZE = 15;
    const [activityLogSearch, setActivityLogSearch] = useState('');

    // ── Notifications ──
    const NOTIF_TYPE_MAP: Record<number, string> = { 0: 'TaskAssigned', 1: 'TaskUpdated', 2: 'TaskOverdue', 3: 'DeadlineWarning', 4: 'PushBack', 5: 'TaskCancelled', 6: 'TaskResumed', 7: 'TaskOnHold', 8: 'TaskCompleted', 9: 'TemplateTaskUnassigned' };
    const [allNotifications, setAllNotifications] = useState<any[]>([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifPage, setNotifPage] = useState(1);
    const [notifTotalPages, setNotifTotalPages] = useState(1);
    const [notifTotalRecords, setNotifTotalRecords] = useState(0);
    const NOTIF_PAGE_SIZE = 10;
    const [headerNotifications, setHeaderNotifications] = useState<import('../../components/GlobalHeader/GlobalHeader').NotificationItem[]>([]);

    const mapToHeaderNotification = (n: any): import('../../components/GlobalHeader/GlobalHeader').NotificationItem => {
        const typeLabels: Record<string, 'alert' | 'success' | 'info' | 'system'> = {
            TaskAssigned: 'info', TaskUpdated: 'info', TaskOverdue: 'alert', DeadlineWarning: 'alert',
            PushBack: 'warning' as any, TaskCancelled: 'system', TaskResumed: 'info', TaskOnHold: 'warning' as any,
            TaskCompleted: 'success', TemplateTaskUnassigned: 'system',
        };
        const type = typeof n.type === 'number' ? NOTIF_TYPE_MAP[n.type] || 'Unknown' : n.type || '';
        const createdAt = n.createdAt ?? '';
        const now = new Date();
        const createdDate = new Date(createdAt);
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
    };

    const fetchHeaderNotifications = async () => {
        try {
            const res = await api.get('/api/Notification', { pageNumber: 1, pageSize: 10 });
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setHeaderNotifications(d.items.map(mapToHeaderNotification));
            }
        } catch {
            // silently fall back to dummy data
        }
    };

    const fetchAllNotifications = async (page: number) => {
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
    };

    useEffect(() => { fetchHeaderNotifications(); }, []);
    useEffect(() => {
        if (activeTab === 'notifications') {
            fetchAllNotifications(1);
        }
    }, [activeTab]);

    // ── Awaiting Review + Overdue (derived from task status/deadlines) ──
    const [awaitingReviewNotifs, setAwaitingReviewNotifs] = useState<import('../../components/GlobalHeader/GlobalHeader').NotificationItem[]>([]);
    const [overdueNotifs, setOverdueNotifs] = useState<import('../../components/GlobalHeader/GlobalHeader').NotificationItem[]>([]);

    const fetchAwaitingReview = async () => {
        try {
            const res = await api.get('/api/Task', { pageNumber: 1, pageSize: 500 });
            const json = res.data;
            const raw = Array.isArray(json) ? json : (Array.isArray(json?.data?.items) ? json.data.items : (Array.isArray(json?.data) ? json.data : []));
            const now = new Date();
            const reviewNotifs: import('../../components/GlobalHeader/GlobalHeader').NotificationItem[] = [];
            const overdueNotifsList: import('../../components/GlobalHeader/GlobalHeader').NotificationItem[] = [];
            raw.forEach((t: any) => {
                const taskId = t.id ?? t.taskId;
                const rawTitle = t.title ?? t.taskTitle ?? '';
                const title = rawTitle.length > 50 ? rawTitle.slice(0, 50) + '...' : rawTitle;
                const createdDate = new Date(t.updatedAt ?? t.createdAt ?? new Date().toISOString());
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
                        createdAt: t.updatedAt ?? t.createdAt ?? new Date().toISOString(),
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
                        createdAt: t.updatedAt ?? t.createdAt ?? new Date().toISOString(),
                        read: false,
                        type: 'alert',
                        category: 'system',
                        isToday,
                        source: 'System',
                        relatedEntityId: taskId,
                        relatedEntityType: 'task',
                    });
                }
            });
            setAwaitingReviewNotifs(reviewNotifs);
            setOverdueNotifs(overdueNotifsList);
        } catch { /* silent */ }
    };

    useEffect(() => { fetchAwaitingReview(); }, []);
    useEffect(() => {
        const interval = setInterval(() => {
            fetchHeaderNotifications();
            fetchAwaitingReview();
            if (activeTab === 'tasks') fetchManagerTasks(true);
            if (activeTab === 'dashboard') fetchActivityLogs(1, true);
            // Keep presence (Online/Offline) fresh on the dashboard and the
            // Manage Employees list.
            if (activeTab === 'dashboard' || activeTab === 'employees') {
                fetchEmployees(1, undefined, true);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [activeTab]);

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

    const openManagerTaskById = (id: string) => {
        api.get(`/api/Task/${id}`)
            .then(res => {
                const json = res.data;
                const raw = json?.data ?? json;
                if (raw) {
                    setActiveTab('tasks');
                    setTmDetailTask(mapManagerTaskToView(raw));
                }
            })
            .catch(() => {});
    };
    const [activityLogEmployee, setActivityLogEmployee] = useState('');
    const [activityLogType, setActivityLogType] = useState('');
    const [activityLogDateFrom, setActivityLogDateFrom] = useState('');

    // ── Report tab: employee list for dropdowns ────────────────────────────────
    const [reportTeamMembers, setReportTeamMembers] = useState<{ accountId: string; employeeName: string }[]>([]);

    useEffect(() => {
        api.get('/api/reports/filter-options')
            .then(res => {
                const data = res.data;
                if (data?.isSuccess && data?.data?.employees) {
                    setReportTeamMembers(
                        (data.data.employees as { id: string; name: string }[]).map(e => ({
                            accountId: e.id,
                            employeeName: e.name,
                        }))
                    );
                }
            })
            .catch(() => { /* non-fatal */ });
    }, []);
    const [activityLogDateTo, setActivityLogDateTo] = useState('');

    const fetchActivityLogs = async (page: number, silent: boolean = false) => {
        if (!silent) setActivityLogLoading(true);
        try {
            const params: Record<string, any> = { pageNumber: page, pageSize: ACTIVITY_LOG_PAGE_SIZE };
            if (activityLogSearch) params.search = activityLogSearch;
            if (activityLogEmployee) {
                const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(activityLogEmployee)}`).catch(() => null);
                const lookupData = lookupRes?.data;
                const empUserId = lookupData?.data?.id ?? lookupData?.id;
                if (empUserId) params.userId = empUserId;
            }
            if (activityLogType) params.actionType = activityLogType;
            if (activityLogDateFrom) params.dateRangeStart = activityLogDateFrom;
            if (activityLogDateTo) params.dateRangeEnd = activityLogDateTo;
            const res = await api.get('/api/audit-logs', params);
            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                setActivityLogs(d.items.map((log: any) => ({
                    activityLogId: log.id ?? log.activityLogId,
                    userId: log.userId ?? log.accountId ?? '',
                    accountId: log.userId ?? log.accountId ?? '',
                    firstName: log.actorName?.split(' ')[0] ?? log.firstName ?? '',
                    middleName: log.middleName ?? '',
                    lastName: log.actorName?.split(' ').slice(1).join(' ') ?? log.lastName ?? '',
                    activityType: log.actionType ?? log.activityType ?? '',
                    description: log.description ?? '',
                    createdAt: log.timestamp ?? log.createdAt ?? '',
                    actorRole: log.actorRole ?? '',
                    targetEntity: log.targetEntity ?? '',
                    targetEntityId: log.targetEntityId ?? '',
                    ipAddress: log.ipAddress ?? '',
                    oldValue: log.oldValue ?? null,
                    newValue: log.newValue ?? null,
                })));
                setActivityLogPage(d.pageNumber || page);
                setActivityLogTotalPages(d.totalPages || 1);
                setActivityLogTotalCount(d.totalCount ?? d.items.length);
            } else {
                setActivityLogs([]);
                setActivityLogTotalPages(1);
                setActivityLogTotalCount(0);
            }
        } catch {
            setActivityLogs([]);
        } finally {
            if (!silent) setActivityLogLoading(false);
        }
    };

    // Real audit logs only — newest first (server already sorts by timestamp
    // descending; this re-sort guarantees recency ordering regardless of source).
    const allActivityLogs = useMemo(() =>
        [...activityLogs].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activityLogs]);

    // Re-fetch activity logs when the tab becomes active or any filter changes
    useEffect(() => {
        if (activeTab === 'activity_logs' || activeTab === 'dashboard') {
            const timer = setTimeout(() => fetchActivityLogs(1), 400);
            return () => clearTimeout(timer);
        }
    }, [activeTab, activityLogSearch, activityLogEmployee, activityLogType, activityLogDateFrom, activityLogDateTo]);

    // Poll activity logs while the Activity Logs tab is open so new entries
    // appear without reloading the page (silent refresh keeps the filters)
    useEffect(() => {
        if (activeTab !== 'activity_logs' && activeTab !== 'dashboard') return;
        const interval = setInterval(() => {
            fetchActivityLogs(activityLogPage, true);
        }, 15000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, activityLogPage]);

    const fetchBackendRoles = async () => {
        try {
            const res = await api.get('/api/Role');
            const data = res.data;
            const raw = Array.isArray(data) ? data : data.data ?? data.$values ?? [];
            const roleNames = raw.map((r: any) => toDisplayRole(r.displayName ?? r.DisplayName ?? r.name ?? r.Name));
            setRolesList(roleNames);
        } catch (err) {
            console.error('Failed to fetch backend roles:', err);
        }
    };

    const fetchEmployees = (page: number = 1, filters: { search: string; role: string; status: string } = { search: '', role: '', status: '' }, silent: boolean = false) => {
        if (!silent) setEmpLoading(true);
        const params: Record<string, any> = { PageNumber: String(page), PageSize: String(PAGE_SIZE) };
        if (filters.search) params.search = filters.search;
        if (filters.role) params.role = toBackendRole(filters.role);
        if (filters.status) params.status = filters.status;
        api.get('/api/User', params)
            .then(res => {
                const result = res.data;
                if (!result.isSuccess) throw new Error(result.message ?? 'Failed to fetch');
                const raw: any[] = Array.isArray(result.data?.items) ? result.data.items : (Array.isArray(result.data) ? result.data : []);
                const list: RecentEmployee[] = raw.map((e: any) => ({
                    employeeNumber: e.employeeNumber,
                    firstName: e.firstName ?? '',
                    middleName: e.middleName ?? '',
                    lastName: e.lastName ?? '',
                    suffix: e.suffix ?? '',
                    employeeName: e.employeeName ?? buildDisplayName(e.firstName ?? '', e.middleName ?? '', e.lastName ?? '', e.suffix ?? ''),
                    contactNumber: e.contactNumber,
                    role: e.role,
                    accountStatus: e.isDeactivated ? 'Deactivated' : (e.isActive !== false ? 'Active' : 'Inactive'),
                    presenceStatus: e.presenceStatus ?? 'Offline',
                    email: e.email ?? '',
                    departmentName: e.departmentName ?? e.DepartmentName ?? '',
                    employmentStatus: e.employmentStatus ?? 'Regular',
                    hireDate: e.hireDate ?? null,
                    attachments: e.attachments ?? [],
                })).filter((e: RecentEmployee) => e.accountStatus !== 'Deleted' && e.employeeNumber !== currentEmployeeId);
                setEmployees(list);
                setRecentEmployees(list);
                setEmpTotalPages(result.data?.totalPages ?? 1);
                setEmpPage(page);
            })
            .catch((err: any) => {
                console.error('Error fetching employees:', err);
                setEmployees([]);
                setRecentEmployees([]);
            })
            .finally(() => { if (!silent) setEmpLoading(false); });
    };

    useEffect(() => {
        fetchEmployees(1);

        // Fetch profile to sync name/contact info to localStorage
        api.get('/api/Auth/me')
            .then(res => {
                const result = res.data;
                if (!result || !result.isSuccess || !result.data) return;
                const p = result.data;
                const firstName = p.firstName ?? '';
                const middleName = p.middleName ?? '';
                const lastName = p.lastName ?? '';
                const suffix = p.suffix ?? '';
                const fullName = buildDisplayName(firstName, middleName, lastName, suffix);

                localStorage.setItem('firstName', firstName);
                localStorage.setItem('middleName', middleName);
                localStorage.setItem('lastName', lastName);
                localStorage.setItem('suffix', suffix);
                localStorage.setItem('contactNumber', p.contactNumber ?? '');
                localStorage.setItem('email', p.email ?? '');
                localStorage.setItem('employeeName', fullName);

                setEmployeeName(fullName);
            })
            .catch((err) => console.error('Profile fetch error:', err));
    }, []);

    useEffect(() => {
        fetchBackendRoles();
    }, [activeTab]);

    // ── Logout ────────────────────────────────────────────────────────────────
    const handleLogout = () => setLogoutConfirm(true);

    const doLogout = async () => {
        setLogoutLoading(true);
        try {
            await api.post('/api/Auth/logout').catch(() => { });
            ['employeeId', 'refreshToken', 'authToken', 'employeeName', 'firstName', 'middleName', 'lastName', 'suffix', 'contactNumber', 'role'].forEach(k => localStorage.removeItem(k));
            navigate('/');
        } finally {
            setLogoutLoading(false);
            setLogoutConfirm(false);
        }
    };

    const handleEmployeeUpdated = (updated: RecentEmployee) => {
        if (updated.accountStatus === '__deleted__') {
            setEmployees(prev => prev.filter(e => e.employeeNumber !== updated.employeeNumber));
            setRecentEmployees(prev => prev.filter(e => e.employeeNumber !== updated.employeeNumber));
        } else {
            setEmployees(prev => prev.map(e => e.employeeNumber === updated.employeeNumber ? updated : e));
            setRecentEmployees(prev => prev.map(e => e.employeeNumber === updated.employeeNumber ? updated : e));
        }
    };

    const pageTitles: Record<NavTab, string> = {
        dashboard: 'Dashboard', employees: 'Manage Employee',
        delivery: 'Delivery Summary', finance: 'Financial Overview', settings: 'Settings',
        roles: 'Role Management', reports: 'Reports', announcements: 'Announcements', notifications: 'Notifications', activity_logs: 'Activity Logs', profile: 'My Profile',
        tasks: 'Task Manager',
        'org-structure': 'Organizational Structure',
        biomarker: 'Biomarker Alert Dashboard'
    };

    return (
        <div className="dashboard-container">
            <Sidebar
                logoUrl={SpeedexLogo}
                logoText="SPEEDEX"
                navGroups={SIDEBAR_NAV_GROUPS}
                profile={{
                    name: employeeName || 'Manager',
                    role: 'MANAGER',
                    avatarInitials: getInitials(employeeName || 'Manager'),
                }}
                onProfileClick={() => handleNavChange('profile')}
                onLogout={handleLogout}
            />

            <main className="main-viewport">
                {!(activeTab === 'employees' && selectedPanelEmployee) && (
                    <GlobalHeader
                        title={pageTitles[activeTab]}
                        breadcrumbs={[{ label: 'Manager' }, { label: pageTitles[activeTab] }]}
                        notifications={mergedHeaderNotifications}
                        profile={{
                            name: employeeName || 'Manager',
                            role: 'MANAGER',
                            avatarInitials: getInitials(employeeName || 'Manager'),
                        }}
                        onSettings={() => handleNavChange('settings')}
                        onLogout={handleLogout}
                        onViewAllNotifications={() => handleNavChange('notifications')}
                        onNotificationsUpdate={(items) => {
                            // GlobalHeader pushes back the full merged list (derived
                            // pins + real notifications). Keep only the real rows to
                            // avoid duplicating the pins when the list is re-merged.
                            setHeaderNotifications((items as import('../../components/GlobalHeader/GlobalHeader').NotificationItem[]).filter(n => {
                                const id = String(n.id ?? '');
                                return !id.startsWith('review-') && !id.startsWith('overdue-');
                            }));
                        }}
                        onNotificationAction={n => {
                            if (n.relatedEntityId && n.relatedEntityType === 'task') {
                                openManagerTaskById(n.relatedEntityId);
                            } else if (n.relatedEntityType === 'announcement') handleNavChange('announcements');
                            else handleNavChange('notifications');
                        }}
                    />
                )}

                {activeTab === 'dashboard' && (
                    <>
                        <div className="dashboard-content" style={{ paddingBottom: 0, marginBottom: -10 }}>
                            <AnnouncementBanner onNavigateToAnnouncements={() => handleNavChange('announcements')} />
                        </div>
                        <DashboardTab
                            employees={employees}
                            recentEmployees={recentEmployees}
                            activityLogs={activityLogs}
                            loading={empLoading}
                            onSelectEmployee={emp => { setEmpModalEditMode(false); setSelectedEmployee(emp); }}
                            onEditEmployee={emp => { setEmpModalEditMode(true); setSelectedEmployee(emp); }}
                            onViewAll={() => { handleNavChange('employees'); setSelectedPanelEmployee(null); }}
                            onAddEmployee={() => setShowAddModal(true)}
                            rolesCount={rolesList.length}
                            activityLogPage={activityLogPage}
                            activityLogTotalPages={activityLogTotalPages}
                            onActivityLogPageChange={fetchActivityLogs}
                        />
                    </>
                )}


                {activeTab === 'employees' && (
                    selectedPanelEmployee ? (
                        <EmployeeDetailPanel
                            employee={selectedPanelEmployee}
                            initialSection={detailPanelInitialSection}
                            onBack={() => setSelectedPanelEmployee(null)}
                            onEmployeeUpdated={updated => {
                                handleEmployeeUpdated(updated);
                                if (updated.accountStatus === '__deleted__') setSelectedPanelEmployee(null);
                                else setSelectedPanelEmployee(updated);
                            }}
                            rolesList={rolesList}
                        />
                    ) : (
                        <ManageEmployeesTab
                            employees={employees} loading={empLoading}
                            onSelectEmployee={emp => { setSelectedPanelEmployee(emp); setDetailPanelInitialSection('overview'); }}
                            onAddEmployee={() => setShowAddModal(true)}
                            empPage={empPage} empTotalPages={empTotalPages} onEmpPageChange={fetchEmployees}
                            onEditEmployee={emp => { setEmpModalEditMode(true); setSelectedEmployee(emp); }}
                            onArchiveEmployee={emp => setarchiveConfirmEmp(emp)}
                            onViewEmployee={emp => { setSelectedPanelEmployee(emp); setDetailPanelInitialSection('overview'); }}

                            rolesList={rolesList}
                        />
                    )
                )}

                {(activeTab === 'profile' || activeTab === 'settings') && <ProfileTab onProfileUpdate={setEmployeeName} />}

                {activeTab === 'roles' && <RoleManagementTab />}

                {activeTab === 'org-structure' && <OrgStructureTab />}
                {activeTab === 'biomarker' && AI_ANALYTICS_ENABLED && <BiomarkerDashboard />}

                {activeTab === 'announcements' && <AnnouncementsTab canCreate={true} />}

                {activeTab === 'notifications' && (
                    <div className="dashboard-content">
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
                                            const type = typeof n.notificationType === 'number' ? NOTIF_TYPE_MAP[n.notificationType] || 'Unknown' : n.notificationType || 'Unknown';
                                            switch (type) {
                                                case 'TaskAssigned': return { label: 'Assigned', cls: 'task-assigned' };
                                                case 'TaskUpdated': return { label: 'Updated', cls: 'task-assigned' };
                                                case 'TaskOverdue': return { label: 'Overdue', cls: 'deadline' };
                                                case 'DeadlineWarning': return { label: 'Deadline', cls: 'deadline' };
                                                case 'PushBack': return { label: 'Pushed back', cls: 'default' };
                                                case 'TaskCancelled': return { label: 'Cancelled', cls: 'default' };
                                                case 'TaskAwaitingReview': return { label: 'Awaiting Review', cls: 'task-assigned' };
                                                default: return { label: type, cls: 'default' };
                                            }
                                        })();
                                        return (
                                            <tr key={n.notificationId} onClick={() => {
                                                if (n.taskId) {
                                                    const found = tmTasks.find(t => t.id === n.taskId);
                                                    if (found) setTmDetailTask(mapManagerTaskToView(found));
                                                    else openManagerTaskById(n.taskId);
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

                {activeTab === 'tasks' && (
                    <>
                        {tmDetailTask ? (
                            <div className="dashboard-content">
                                <TaskView
                                    task={tmDetailTask}
                                    onEdit={() => { setTmEditingTask(tmDetailTask); setTmDetailTask(null); }}
                                    onReopen={async () => {
                                        error('Reopen is not supported by the backend FSM. Use Cancel to reset the task lifecycle.');
                                    }}
                                    onClose={() => setTmDetailTask(null)}
                                    onApprove={async (id) => {
                                        try {
                                            await api.patch(`/api/Task/${id}/review`, { isApproved: true, remarks: null });
                                            success('Task approved.');
                                            setTmDetailTask(null);
                                            fetchManagerTasks();
                                        } catch {
                                            error('Failed to approve task.');
                                        }
                                    }}
                                    onReject={async (id, reason) => {
                                        try {
                                            await api.patch(`/api/Task/${id}/review`, { isApproved: false, remarks: reason });
                                            success('Task returned for rework.');
                                            setTmDetailTask(null);
                                            fetchManagerTasks();
                                        } catch {
                                            error('Failed to reject task.');
                                        }
                                    }}
                                    onDeleteAttachment={handleManagerDeleteAttachment}
                                    onUpdate={(updated) => {
                                        setTmDetailTask(updated);
                                        fetchManagerTasks();
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="dashboard-content" style={{ paddingBottom: 0 }}>
                                    <SubTabNav
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
                                            teamMembers={[]}
                                            onNewTask={() => setTaskSubTab('create')}
                                            onEdit={id => {
                                                const found = tmTasks.find(t => t.id === id);
                                                if (found) {
                                                    setTmEditingTask(mapManagerTaskToView(found));
                                                }
                                            }}
                                            onView={handleManagerTaskView}
                                            onArchive={ids => handleManagerTaskArchive(ids)}
                                            onRestore={ids => handleManagerTaskRestore(ids)}
                                            onDelete={ids => handleManagerTaskDelete(ids)}
                                            onMarkDone={ids => handleManagerTaskMarkDone(ids)}
                                        />
                                    </div>
                                )}
                                {taskSubTab === 'create' && (
                                    <div className="dashboard-content">
                                        <AIAssignmentView />
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
                {activeTab === 'reports' && (
                    <ReportsTab teamMembers={reportTeamMembers} />
                )}

                {activeTab === 'delivery' && <div className="dashboard-content"><div className="card"><EmptyState icon={<Truck size={32} />} message="Delivery module coming soon." /></div></div>}
                {activeTab === 'finance' && <div className="dashboard-content"><div className="card"><EmptyState icon={<BarChart3 size={32} />} message="Finance module coming soon." /></div></div>}

                {activeTab === 'activity_logs' && (
                    <div className="dashboard-content" style={{ padding: 0 }}>
                        <DataTable
                            title=""
                            headers={['User ID', 'Action', 'Timestamp', 'Affected Record', 'IP Address']}
                            searchQuery={activityLogSearch}
                            onSearchChange={val => setActivityLogSearch(val)}
                            searchPlaceholder="Search by user, action, or record…"
                            filterElements={
                                <>
                                    {/* Filter: User */}
                                    <select
                                        value={activityLogEmployee}
                                        onChange={e => setActivityLogEmployee(e.target.value)}
                                        style={{ height: 36, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 13, minWidth: 160, boxSizing: 'border-box', outline: 'none', cursor: 'pointer', background: '#fff' }}
                                        aria-label="Filter by user"
                                    >
                                        <option value="">All Users</option>
                                        {recentEmployees.slice(0, 100).map(emp => (
                                            <option key={emp.employeeNumber} value={emp.employeeNumber}>
                                                {getEmployeeDisplayName(emp)}
                                            </option>
                                        ))}
                                    </select>

                                    {/* Filter: Action Type */}
                                    <select
                                        value={activityLogType}
                                        onChange={e => setActivityLogType(e.target.value)}
                                        style={{ height: 36, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 13, minWidth: 150, boxSizing: 'border-box', outline: 'none', cursor: 'pointer', background: '#fff' }}
                                        aria-label="Filter by action type"
                                    >
                                        <option value="">All Action Types</option>
                                        {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>

                                    {/* Filter: Single Unified Date Range Calendar Filter */}
                                    <DateRangePicker
                                        startDate={activityLogDateFrom}
                                        endDate={activityLogDateTo}
                                        onChange={(start, end) => {
                                            setActivityLogDateFrom(start);
                                            setActivityLogDateTo(end);
                                        }}
                                        onClear={() => {
                                            setActivityLogDateFrom('');
                                            setActivityLogDateTo('');
                                        }}
                                        placeholder="Filter by date range…"
                                        ariaLabel="Filter audit logs by date range"
                                    />

                                    {/* Clear all filters */}
                                    {(activityLogSearch || activityLogEmployee || activityLogType || activityLogDateFrom || activityLogDateTo) && (
                                        <button
                                            className="btn btn-sm"
                                            onClick={() => {
                                                setActivityLogSearch('');
                                                setActivityLogEmployee('');
                                                setActivityLogType('');
                                                setActivityLogDateFrom('');
                                                setActivityLogDateTo('');
                                            }}
                                            style={{ height: 36, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            <X size={13} /> Clear Filters
                                        </button>
                                    )}
                                </>
                            }
                            loading={activityLogLoading}
                            emptyMessage="No audit logs found."
                            emptyIcon={<Activity size={24} />}
                            totalRecords={activityLogTotalCount}
                            currentPage={activityLogPage}
                            totalPages={activityLogTotalPages}
                            onPageChange={p => fetchActivityLogs(p)}
                        >
                            {/* Rows are already sorted newest-first by allActivityLogs (server + client re-sort) */}
                            {allActivityLogs.map(log => {
                                const isBiomarker = log.activityLogId.startsWith('bio-');
                                const badge = getAuditBadgeStyle(log.activityType, isBiomarker);

                                // ── User ID cell ─────────────────────────────────────────
                                // Show the actor's name as primary text, with the UUID truncated
                                // below it so auditors can quickly cross-reference by ID.
                                const empName = [log.firstName, log.middleName, log.lastName, log.suffix]
                                    .filter(Boolean).join(' ');
                                const displayName = isBiomarker ? 'System (Biomarker)' : (empName || 'System');
                                const shortId = log.userId
                                    ? log.userId.slice(0, 8) + '…'
                                    : '—';

                                // ── Affected Record cell ─────────────────────────────────
                                // Combine entity type + entity ID when available
                                const affectedRecord = (() => {
                                    const parts: string[] = [];
                                    if (log.targetEntity) parts.push(log.targetEntity);
                                    if (log.targetEntityId) parts.push(log.targetEntityId.slice(0, 8) + '…');
                                    return parts.length ? parts : null;
                                })();

                                return (
                                    <tr key={log.activityLogId}>

                                        {/* ── User ID ── */}
                                        <td style={{ fontSize: 13 }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {displayName}
                                                {log.actorRole && (
                                                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>
                                                        · {log.actorRole}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                                                {shortId}
                                            </div>
                                        </td>

                                        {/* ── Action ── */}
                                        <td>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '3px 10px', borderRadius: 999,
                                                fontSize: '0.72rem', fontWeight: 700,
                                                background: badge.background, color: badge.color,
                                            }}>
                                                {formatActionType(log.activityType)}
                                            </span>
                                        </td>

                                        {/* ── Timestamp ── */}
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            {log.createdAt ? (
                                                <>
                                                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                                                        {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                        {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </div>
                                                </>
                                            ) : '—'}
                                        </td>

                                        {/* ── Affected Record ── */}
                                        <td style={{ fontSize: 13 }}>
                                            {affectedRecord ? (
                                                <>
                                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                                        {affectedRecord[0]}
                                                    </div>
                                                    {affectedRecord[1] && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                                                            ID: {affectedRecord[1]}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>

                                        {/* ── IP Address ── */}
                                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: log.ipAddress ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                            {log.ipAddress || '—'}
                                        </td>

                                    </tr>
                                );
                            })}
                        </DataTable>
                    </div>
                )}
            </main>

            {showAddModal && (
                <AddEmployeeModal onClose={() => setShowAddModal(false)} onSuccess={newEmp => {
                    setEmployees(prev => [newEmp, ...prev]);
                    setRecentEmployees(prev => [newEmp, ...prev]);
                    fetchActivityLogs(1);
                }} />
            )}

            {selectedEmployee && (
                <EmployeeDetailModal
                    employee={selectedEmployee}
                    onClose={() => setSelectedEmployee(null)}
                    onUpdated={handleEmployeeUpdated}
                    initialEditMode={empModalEditMode}
                    rolesList={rolesList}
                />
            )}

            {/* ── Archive employee Confirmation Modal ── */}
            <ConfirmationModal
                isOpen={!!archiveConfirmEmp}
                variant="danger"
                title="Archive employee account?"
                description={
                    archiveConfirmEmp ? (
                        <>
                            This will permanently remove <strong>{getEmployeeDisplayName(archiveConfirmEmp)}</strong> and all associated
                            data. This action cannot be undone.
                        </>
                    ) : null
                }
                notice="All leave records, tasks, and activity logs for this employee will also be archived."
                confirmLabel="Archive employee"
                cancelLabel="Cancel"
                isLoading={archiveSubmitting}
                onConfirm={async () => {
                    if (!archiveConfirmEmp) return;
                    setarchiveSubmitting(true);
                    try {
                        const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(archiveConfirmEmp.employeeNumber)}`);
                        const lookupData = lookupRes.data;
                        const userId = lookupData?.data?.id ?? lookupData?.id;
                        if (!userId) throw new Error('Employee not found.');
                        await api.patch(`/api/User/${userId}/deactivate`);
                        success(`${getEmployeeDisplayName(archiveConfirmEmp)} has been archived.`);
                        setEmployees(prev => prev.filter(e => e.employeeNumber !== archiveConfirmEmp.employeeNumber));
                        setRecentEmployees(prev => prev.filter(e => e.employeeNumber !== archiveConfirmEmp.employeeNumber));
                    } catch (err: any) {
                        error(err.response?.data?.message || err.response?.data?.Message || err.message || 'Failed to Archive employee.');
                    } finally {
                        setarchiveSubmitting(false);
                        setarchiveConfirmEmp(null);
                    }
                }}
                onCancel={() => setarchiveConfirmEmp(null)}
            />

            {/* ── Logout Confirmation Modal ── */}
            <ConfirmationModal
                isOpen={logoutConfirm}
                variant="neutral"
                title="Log out of STARS?"
                description="You will be signed out of your current session. Any unsaved changes will be lost."
                confirmLabel="Log out"
                cancelLabel="Stay"
                isLoading={logoutLoading}
                onConfirm={doLogout}
                onCancel={() => setLogoutConfirm(false)}
            />



            {/* ── New Task Modal ── */}
            {showNewTask && (
                <FormModal
                    isOpen={true}
                    onClose={() => setShowNewTask(false)}
                    title="Create New Task"
                    subtitle="Fill in the details to create a new task."
                    apiError={newTaskApiError}
                    onSubmit={handleManagerCreateTask}
                    isSubmitting={newTaskSubmitting}
                    size="md"
                    submitLabel="Create Task"
                >
                    <div className="fm-section">
                        <h5 className="fm-section-title">Task Information</h5>
                        <div className="fm-field">
                            <label className="fm-label">Task Title <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <input
                                className="fm-input"
                                value={newTaskForm.title}
                                onChange={e => setNewTaskForm(p => ({ ...p, title: e.target.value }))}
                                maxLength={150}
                                placeholder="Enter task title"
                            />
                            {newTaskErrors.title && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{newTaskErrors.title}
                                </span>
                            )}
                            {!newTaskErrors.title && newTaskForm.title.trim().length >= 3 && (() => {
                                const preview = resolveIncrementalTitlePreview(newTaskForm.title, (tmTasks || []).map(taskItem => taskItem.name || ''));
                                if (preview && preview !== newTaskForm.title.trim()) {
                                    return (
                                        <span style={{ fontSize: 11, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            <Info size={11} /> Existing title found: will create as &quot;<strong>{preview}</strong>&quot;
                                        </span>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Description <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <textarea
                                className="fm-input"
                                rows={4}
                                value={newTaskForm.description}
                                onChange={e => setNewTaskForm(p => ({ ...p, description: e.target.value }))}
                                maxLength={2000}
                                placeholder="Describe the task…"
                            />
                            {newTaskErrors.description && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{newTaskErrors.description}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="fm-section">
                        <h5 className="fm-section-title">Classification</h5>
                        <div className="fm-field">
                            <label className="fm-label">Task Classification <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <select
                                className="fm-input"
                                value={newTaskForm.classification}
                                onChange={e => setNewTaskForm(p => ({ ...p, classification: e.target.value }))}
                            >
                                <option value="">Select classification</option>
                                <option value="routine">Routine Daily Task</option>
                                <option value="special">Special Task</option>
                            </select>
                            {newTaskErrors.classification && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{newTaskErrors.classification}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="fm-section">
                        <h5 className="fm-section-title">Schedule &amp; Priority</h5>
                        <div className="fm-field-grid">
                            <div className="fm-field">
                                <label className="fm-label">Priority <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select
                                    className="fm-select"
                                    value={newTaskForm.priority}
                                    onChange={e => setNewTaskForm(p => ({ ...p, priority: e.target.value }))}
                                >
                                    <option value="">Select priority</option>
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">🔴 Urgent</option>
                                </select>
                                {newTaskErrors.priority && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{newTaskErrors.priority}
                                    </span>
                                )}
                                {!newTaskErrors.priority && newTaskForm.priority === 'Urgent' && (
                                    <span style={{ fontSize: 11, color: '#7c1d1d', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Lock size={11} /> Urgent — deadline auto-set to 24h from creation (SLA enforced)
                                    </span>
                                )}
                            </div>
                            <div className="fm-field">
                                <label className="fm-label">
                                    Deadline <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span>
                                    {newTaskForm.priority === 'Urgent' && (
                                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#7c1d1d', background: '#fef2f2', padding: '1px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
                                            <Lock size={10} /> SLA LOCKED
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="datetime-local"
                                    className="fm-input"
                                    value={newTaskForm.deadline}
                                    onChange={e => setNewTaskForm(p => ({ ...p, deadline: e.target.value }))}
                                    disabled={newTaskForm.priority === 'Urgent'}
                                    min={new Date().toISOString().slice(0, 16)}
                                    style={newTaskForm.priority === 'Urgent' ? { background: '#f1f5f9', cursor: 'not-allowed', opacity: 0.7 } : {}}
                                />
                                {newTaskErrors.deadline && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{newTaskErrors.deadline}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="fm-section">
                        <h5 className="fm-section-title">Assignment Scope</h5>
                        <div className="fm-field">
                            <label className="fm-label">Scope <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                {/* Team scope hidden until the team management feature is planned and tested. */}
                                {['SingleEmployee', 'Department'].map(scope => (
                                    <label key={scope} onClick={() => setNewTaskForm(p => ({
                                        ...p, assignmentScope: scope, assignedDepartmentId: '',
                                        assignedTo: '', assignedUserIds: [],
                                    }))}
                                        style={{
                                            flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                                            fontSize: 12, fontWeight: 600, border: `2px solid ${newTaskForm.assignmentScope === scope ? 'var(--primary)' : 'var(--border)'}`,
                                            background: newTaskForm.assignmentScope === scope ? 'rgba(67,24,255,0.06)' : '#fff',
                                            color: newTaskForm.assignmentScope === scope ? 'var(--primary)' : 'var(--text-secondary)',
                                        }}
                                    >
                                        <input type="radio" name="scope" value={scope}
                                            checked={newTaskForm.assignmentScope === scope}
                                            onChange={() => {}} style={{ display: 'none' }} />
                                        {scope === 'SingleEmployee' ? 'Single' : 'Department'}
                                    </label>
                                ))}
                            </div>
                            {newTaskErrors.assignmentScope && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{newTaskErrors.assignmentScope}
                                </span>
                            )}
                        </div>
                        {newTaskForm.assignmentScope === 'Department' && (
                            <div className="fm-field">
                                <label className="fm-label">Target Department <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select className="fm-input"
                                    value={newTaskForm.assignedDepartmentId}
                                    onChange={e => setNewTaskForm(p => ({ ...p, assignedDepartmentId: e.target.value }))}
                                >
                                    <option value="">Select department</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                                {newTaskErrors.assignedDepartmentId && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{newTaskErrors.assignedDepartmentId}
                                    </span>
                                )}
                            </div>
                        )}

                        {newTaskForm.assignmentScope === 'SingleEmployee' && (
                            <div className="fm-field" style={{ marginTop: 10 }}>
                                <label className="fm-label">Assign To <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                {newTaskRecommendation && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'linear-gradient(135deg, rgba(0,169,157,0.06), rgba(0,169,157,0.02))', border: '1px solid rgba(0,169,157,0.15)', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                                        <Lightbulb size={12} />
                                        <span>Recommended: <strong style={{ color: 'var(--primary)' }}>{newTaskRecommendation.employeeName}</strong> — {newTaskRecommendation.reason}</span>
                                    </div>
                                )}
                                {rawApiKeys && (
                                    <details style={{ fontSize: 10, color: '#666', marginBottom: 4, background: '#f5f5f5', padding: '4px 8px', borderRadius: 4, maxHeight: 120, overflow: 'auto' }}>
                                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>API Debug: keys of first item</summary>
                                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{rawApiKeys}</pre>
                                    </details>
                                )}
                                <input type="text" className="emp-picker-search" placeholder="Search employees…" value={newTaskSingleSearch}
                                    onChange={e => setNewTaskSingleSearch(e.target.value)} />
                                {newTaskEligibleEmployees.length > 0 ? (
                                    <div className="emp-picker-list">
                                        {(newTaskSingleSearch ? newTaskEligibleEmployees.filter(e => (e.employeeName || '').toLowerCase().includes(newTaskSingleSearch.toLowerCase())) : newTaskEligibleEmployees).map(e => {
                                            const isSelected = newTaskForm.assignedTo === e.accountId;
                                            const disabled = !e.isAvailable;
                                            const isRecommended = newTaskRecommendation?.accountId === e.accountId;
                                            const status = e.availabilityStatus || 'Unknown';
                                            const statusDot = e.isAvailable ? 'active' : status === 'Offline' ? 'offline' : 'leave';
                                            return (
                                                <div key={e.accountId}
                                                    className={`emp-picker-row${isSelected ? ' selected' : ''}${isRecommended && !isSelected ? ' recommended' : ''}${disabled ? ' disabled' : ''}`}
                                                    onClick={() => { if (disabled) return; setNewTaskForm(p => ({ ...p, assignedTo: e.accountId })); }}
                                                >
                                                    <input type="radio" name="newTaskAssignee" className="emp-picker-radio" checked={isSelected} disabled={disabled} onChange={() => {}} />
                                                    <div className="emp-picker-info">
                                                        <span className="emp-picker-name">{e.employeeName || `ID: ${e.accountId || '?'}`}</span>
                                                        <div className="emp-picker-meta">
                                                            <span className={`emp-picker-dot ${statusDot}`} />
                                                            <span>{status}</span>
                                                            <span>{typeof e.workload === 'number' ? e.workload : 0} tasks</span>
                                                        </div>
                                                    </div>
                                                    {isRecommended && <span className="emp-picker-tag best">Best pick</span>}
                                                    {isSelected && <span className="emp-picker-tag selected-tag"><CheckCircle2 size={11} /> Selected</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="emp-picker-empty">No eligible employees found.</div>
                                )}
                                {newTaskErrors.assignedTo && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{newTaskErrors.assignedTo}
                                    </span>
                                )}
                            </div>
                        )}

                        {newTaskForm.assignmentScope === 'Team' && (
                            <div className="fm-field" style={{ marginTop: 10 }}>
                                <label className="fm-label">Select Team Members <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                {newTaskRecommendation && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'linear-gradient(135deg, rgba(0,169,157,0.06), rgba(0,169,157,0.02))', border: '1px solid rgba(0,169,157,0.15)', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                                        <Lightbulb size={12} />
                                        <span>Recommended: <strong style={{ color: 'var(--primary)' }}>{newTaskRecommendation.employeeName}</strong> — {newTaskRecommendation.reason}</span>
                                    </div>
                                )}
                                <input type="text" className="emp-picker-search" placeholder="Search employees…" value={newTaskTeamSearch}
                                    onChange={e => setNewTaskTeamSearch(e.target.value)} />
                                {newTaskEligibleEmployees.length > 0 ? (
                                    <div className="emp-picker-list">
                                        {(newTaskTeamSearch ? newTaskEligibleEmployees.filter(e => (e.employeeName || '').toLowerCase().includes(newTaskTeamSearch.toLowerCase())) : newTaskEligibleEmployees).map(e => {
                                            const selected = newTaskForm.assignedUserIds.includes(e.accountId);
                                            const disabled = !e.isAvailable;
                                            const status = e.availabilityStatus || 'Unknown';
                                            const statusDot = e.isAvailable ? 'active' : status === 'Offline' ? 'offline' : 'leave';
                                            return (
                                                <div key={e.accountId}
                                                    className={`emp-picker-row${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                                                    onClick={() => {
                                                        if (disabled) return;
                                                        setNewTaskForm(p => ({
                                                            ...p,
                                                            assignedUserIds: selected ? p.assignedUserIds.filter(id => id !== e.accountId) : [...p.assignedUserIds, e.accountId],
                                                        }));
                                                    }}
                                                >
                                                    <input type="checkbox" className="emp-picker-checkbox" checked={selected} disabled={disabled} onChange={() => {}} />
                                                    <div className="emp-picker-info">
                                                        <span className="emp-picker-name">{e.employeeName || `ID: ${e.accountId || '?'}`}</span>
                                                        <div className="emp-picker-meta">
                                                            <span className={`emp-picker-dot ${statusDot}`} />
                                                            <span>{status}</span>
                                                            <span>{typeof e.workload === 'number' ? e.workload : 0} tasks</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="emp-picker-empty">No eligible employees found.</div>
                                )}
                                {newTaskForm.assignedUserIds.length > 0 && (
                                    <span className="emp-picker-confirm"><CheckCircle2 size={12} /> {newTaskForm.assignedUserIds.length} team member(s) selected</span>
                                )}
                                {newTaskErrors.assignedUserIds && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{newTaskErrors.assignedUserIds}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Supporting Document ── */}
                    <div className="fm-section">
                        <h5 className="fm-section-title">Attachment</h5>
                        <div className="fm-field">
                            <label className="fm-label">Supporting Document <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(optional) — select one or more files</span></label>
                            {newTaskForm.supportingEvidenceUrl && newTaskSupportingEvidence.length === 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '8px 12px', background: 'rgba(0,169,157,0.04)', border: '1px solid rgba(0,169,157,0.15)', borderRadius: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, color: 'var(--primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {(newTaskForm.supportingEvidenceUrl.split('/').pop() || '').replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '')}
                                    </span>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <input ref={newTaskFileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                                    onChange={e => {
                                        const files = Array.from(e.target.files ?? []);
                                        if (newTaskFileRef.current) newTaskFileRef.current.value = '';
                                        if (files.length === 0) return;
                                        const allowed = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png'];
                                        for (const file of files) {
                                            const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
                                            if (!allowed.includes(ext)) { setNewTaskApiError('Invalid file format. Allowed: PDF, DOCX, XLSX, JPG, PNG.'); return; }
                                            if (file.size > 20 * 1024 * 1024) { setNewTaskApiError('File size must not exceed 20MB.'); return; }
                                        }
                                        setNewTaskApiError('');
                                        const existingKeys = new Set(newTaskSupportingEvidence.map(f => `${f.name}-${f.size}`));
                                        const newUnique = files.filter(f => !existingKeys.has(`${f.name}-${f.size}`));
                                        setNewTaskSupportingEvidence(prev => [...prev, ...newUnique]);
                                    }}
                                    style={{ display: newTaskSupportingEvidence.length > 0 ? 'none' : 'block', flex: 1, fontSize: 13 }} />
                            </div>
                            {newTaskSupportingEvidence.length > 0 && (
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {newTaskSupportingEvidence.map((file, idx) => (
                                            <div key={`${file.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,169,157,0.05)', border: '1px solid rgba(0,169,157,0.18)', borderRadius: 6 }}>
                                                <span style={{ fontSize: 11, color: 'var(--status-active)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = newTaskSupportingEvidence.filter((_, i) => i !== idx);
                                                        setNewTaskSupportingEvidence(next);
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
                                            onClick={() => newTaskFileRef.current?.click()}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--primary, #0284c7)', background: 'rgba(2, 132, 199, 0.08)', border: '1px dashed rgba(2, 132, 199, 0.4)', borderRadius: 6, cursor: 'pointer' }}
                                        >
                                            <Plus size={13} /> Upload more
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNewTaskSupportingEvidence([]);
                                                if (newTaskFileRef.current) newTaskFileRef.current.value = '';
                                            }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ee5d50', padding: 4, fontSize: 11, fontWeight: 600 }}
                                        >
                                            Clear all
                                        </button>
                                    </div>
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                        {newTaskSupportingEvidence.length} file{newTaskSupportingEvidence.length === 1 ? '' : 's'} selected — uploaded after the task is saved.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="fm-section">
                        <h5 className="fm-section-title">Visibility</h5>
                        <label className={`conf-card${newTaskForm.isConfidential ? ' active' : ''}`}>
                            <input type="checkbox" checked={newTaskForm.isConfidential}
                                onChange={e => setNewTaskForm(p => ({ ...p, isConfidential: e.target.checked }))} />
                            <div className="conf-card-body">
                                <div className="conf-label-row">
                                    <span className="conf-icon">
                                        <Lock size={14} color={newTaskForm.isConfidential ? '#ee5d50' : 'var(--text-secondary)'} />
                                    </span>
                                    <span className="conf-title">Confidential Task</span>
                                    {newTaskForm.isConfidential && <span className="conf-badge">Restricted</span>}
                                </div>
                                <span className="conf-desc">
                                    {newTaskForm.isConfidential ? (
                                        <>Only <strong>Coordinators</strong> &amp; <strong>Manager</strong> can view this task</>
                                    ) : (
                                        'Restrict visibility to Coordinators and Manager only'
                                    )}
                                </span>
                            </div>
                        </label>
                    </div>
                </FormModal>
            )}

            {/* ── Edit Task Modal ── */}
            {tmEditingTask && (
                <FormModal
                    isOpen={true}
                    onClose={() => setTmEditingTask(null)}
                    title="Edit Task"
                    subtitle="Update the task details below."
                    apiError={editApiError}
                    onSubmit={handleManagerEditSave}
                    isSubmitting={editSubmitting}
                    size="md"
                    submitLabel="Save Changes"
                >
                    <div className="fm-section">
                        <h5 className="fm-section-title">Task Information</h5>
                        <div className="fm-field">
                            <label className="fm-label">Task Title <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <input
                                className="fm-input"
                                value={editForm.title}
                                onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                                maxLength={150}
                                placeholder="Enter task title"
                            />
                            {editErrors.title && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{editErrors.title}
                                </span>
                            )}
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Description <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <textarea
                                className="fm-input"
                                rows={4}
                                value={editForm.description}
                                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                                maxLength={2000}
                                placeholder="Describe the task…"
                            />
                            {editErrors.description && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{editErrors.description}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="fm-section">
                        <h5 className="fm-section-title">Classification</h5>
                        <div className="fm-field">
                            <label className="fm-label">Task Classification <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <select
                                className="fm-input"
                                value={editForm.classification}
                                onChange={e => setEditForm(p => ({ ...p, classification: e.target.value }))}
                            >
                                <option value="">Select classification</option>
                                <option value="routine">Routine Daily Task</option>
                                <option value="special">Special Task</option>
                            </select>
                            {editErrors.classification && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                    <AlertCircle size={11} />{editErrors.classification}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="fm-section">
                        <h5 className="fm-section-title">Schedule &amp; Priority</h5>
                        <div className="fm-field-grid">
                            <div className="fm-field">
                                <label className="fm-label">Priority <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select
                                    className="fm-select"
                                    value={editForm.priority}
                                    onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))}
                                >
                                    <option value="">Select priority</option>
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">🔴 Urgent</option>
                                </select>
                                {editErrors.priority && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{editErrors.priority}
                                    </span>
                                )}
                                {!editErrors.priority && editForm.priority === 'Urgent' && (
                                    <span style={{ fontSize: 11, color: '#7c1d1d', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Lock size={11} /> Urgent — deadline auto-set to 24h (SLA enforced)
                                    </span>
                                )}
                            </div>
                            <div className="fm-field">
                                <label className="fm-label">
                                    Deadline <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span>
                                    {(editForm.priority === 'Urgent' || tmEditingTask?.isSLALocked) && (
                                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#7c1d1d', background: '#fef2f2', padding: '1px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
                                            <Lock size={10} /> SLA LOCKED
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="datetime-local"
                                    className="fm-input"
                                    value={editForm.deadline}
                                    onChange={e => setEditForm(p => ({ ...p, deadline: e.target.value }))}
                                    disabled={editForm.priority === 'Urgent' || (tmEditingTask?.isSLALocked ?? false)}
                                    min={new Date().toISOString().slice(0, 16)}
                                    style={(editForm.priority === 'Urgent' || tmEditingTask?.isSLALocked) ? { background: '#f1f5f9', cursor: 'not-allowed', opacity: 0.7 } : {}}
                                />
                                {editErrors.deadline && (
                                    <span style={{ fontSize: 11, color: 'var(--status-failed, #ee5d50)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <AlertCircle size={11} />{editErrors.deadline}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="fm-section">
                        <h5 className="fm-section-title">Assignment Scope</h5>
                        <div className="fm-field">
                            <label className="fm-label">Scope <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                {/* Team scope hidden until the team management feature is planned and tested. */}
                                {['SingleEmployee', 'Department'].map(scope => (
                                    <label key={scope} onClick={() => setEditForm(p => ({
                                        ...p, assignmentScope: scope, assignedDepartmentId: '',
                                        assignedTo: '', assignedUserIds: [],
                                    }))}
                                        style={{
                                            flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                                            fontSize: 12, fontWeight: 600, border: `2px solid ${editForm.assignmentScope === scope ? 'var(--primary)' : 'var(--border)'}`,
                                            background: editForm.assignmentScope === scope ? 'rgba(67,24,255,0.06)' : '#fff',
                                            color: editForm.assignmentScope === scope ? 'var(--primary)' : 'var(--text-secondary)',
                                        }}
                                    >
                                        <input type="radio" name="editScope" value={scope}
                                            checked={editForm.assignmentScope === scope}
                                            onChange={() => {}} style={{ display: 'none' }} />
                                        {scope === 'SingleEmployee' ? 'Single' : 'Department'}
                                    </label>
                                ))}
                            </div>
                        </div>
                        {editForm.assignmentScope === 'Department' && (
                            <div className="fm-field">
                                <label className="fm-label">Target Department <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                <select className="fm-input"
                                    value={editForm.assignedDepartmentId}
                                    onChange={e => setEditForm(p => ({ ...p, assignedDepartmentId: e.target.value }))}
                                >
                                    <option value="">Select department</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {editForm.assignmentScope === 'SingleEmployee' && (
                            <div className="fm-field" style={{ marginTop: 10 }}>
                                <label className="fm-label">Assign To <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                {editTaskRecommendation && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'linear-gradient(135deg, rgba(0,169,157,0.06), rgba(0,169,157,0.02))', border: '1px solid rgba(0,169,157,0.15)', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                                        <Lightbulb size={12} />
                                        <span>Recommended: <strong style={{ color: 'var(--primary)' }}>{editTaskRecommendation.employeeName}</strong> — {editTaskRecommendation.reason}</span>
                                    </div>
                                )}
                                <input type="text" className="emp-picker-search" placeholder="Search employees…" value={editTaskSingleSearch}
                                    onChange={e => setEditTaskSingleSearch(e.target.value)} />
                                {editEligibleEmployees.length > 0 ? (
                                    <div className="emp-picker-list">
                                        {(editTaskSingleSearch ? editEligibleEmployees.filter(e => (e.employeeName || '').toLowerCase().includes(editTaskSingleSearch.toLowerCase())) : editEligibleEmployees).map(e => {
                                            const isSelected = editForm.assignedTo === e.accountId;
                                            const disabled = !e.isAvailable;
                                            const isRecommended = editTaskRecommendation?.accountId === e.accountId;
                                            const status = e.availabilityStatus || 'Unknown';
                                            const statusDot = e.isAvailable ? 'active' : status === 'Offline' ? 'offline' : 'leave';
                                            return (
                                                <div key={e.accountId}
                                                    className={`emp-picker-row${isSelected ? ' selected' : ''}${isRecommended && !isSelected ? ' recommended' : ''}${disabled ? ' disabled' : ''}`}
                                                    onClick={() => { if (disabled) return; setEditForm(p => ({ ...p, assignedTo: e.accountId })); }}
                                                >
                                                    <input type="radio" name="editTaskAssignee" className="emp-picker-radio" checked={isSelected} disabled={disabled} onChange={() => {}} />
                                                    <div className="emp-picker-info">
                                                        <span className="emp-picker-name">{e.employeeName || `ID: ${e.accountId || '?'}`}</span>
                                                        <div className="emp-picker-meta">
                                                            <span className={`emp-picker-dot ${statusDot}`} />
                                                            <span>{status}</span>
                                                            <span>{typeof e.workload === 'number' ? e.workload : 0} tasks</span>
                                                        </div>
                                                    </div>
                                                    {isRecommended && <span className="emp-picker-tag best">Best pick</span>}
                                                    {isSelected && <span className="emp-picker-tag selected-tag"><CheckCircle2 size={11} /> Selected</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="emp-picker-empty">No eligible employees found.</div>
                                )}
                            </div>
                        )}

                        {newTaskForm.assignmentScope === 'Team' && (
                            <div className="fm-field" style={{ marginTop: 10 }}>
                                <label className="fm-label">Select Team Members <span style={{ color: 'var(--status-failed, #ee5d50)' }}>*</span></label>
                                {editTaskRecommendation && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'linear-gradient(135deg, rgba(0,169,157,0.06), rgba(0,169,157,0.02))', border: '1px solid rgba(0,169,157,0.15)', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                                        <Lightbulb size={12} />
                                        <span>Recommended: <strong style={{ color: 'var(--primary)' }}>{editTaskRecommendation.employeeName}</strong> — {editTaskRecommendation.reason}</span>
                                    </div>
                                )}
                                <input type="text" className="emp-picker-search" placeholder="Search employees…" value={editTaskTeamSearch}
                                    onChange={e => setEditTaskTeamSearch(e.target.value)} />
                                {editEligibleEmployees.length > 0 ? (
                                    <div className="emp-picker-list">
                                        {(editTaskTeamSearch ? editEligibleEmployees.filter(e => (e.employeeName || '').toLowerCase().includes(editTaskTeamSearch.toLowerCase())) : editEligibleEmployees).map(e => {
                                            const selected = editForm.assignedUserIds.includes(e.accountId);
                                            const disabled = !e.isAvailable;
                                            const status = e.availabilityStatus || 'Unknown';
                                            const statusDot = e.isAvailable ? 'active' : status === 'Offline' ? 'offline' : 'leave';
                                            return (
                                                <div key={e.accountId}
                                                    className={`emp-picker-row${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                                                    onClick={() => {
                                                        if (disabled) return;
                                                        setEditForm(p => ({
                                                            ...p,
                                                            assignedUserIds: selected ? p.assignedUserIds.filter(id => id !== e.accountId) : [...p.assignedUserIds, e.accountId],
                                                        }));
                                                    }}
                                                >
                                                    <input type="checkbox" className="emp-picker-checkbox" checked={selected} disabled={disabled} onChange={() => {}} />
                                                    <div className="emp-picker-info">
                                                        <span className="emp-picker-name">{e.employeeName || `ID: ${e.accountId || '?'}`}</span>
                                                        <div className="emp-picker-meta">
                                                            <span className={`emp-picker-dot ${statusDot}`} />
                                                            <span>{status}</span>
                                                            <span>{typeof e.workload === 'number' ? e.workload : 0} tasks</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="emp-picker-empty">No eligible employees found.</div>
                                )}
                                {editForm.assignedUserIds.length > 0 && (
                                    <span className="emp-picker-confirm"><CheckCircle2 size={12} /> {editForm.assignedUserIds.length} team member(s) selected</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Supporting Document (Edit) ── */}
                    <div className="fm-section">
                        <h5 className="fm-section-title">Attachment</h5>
                        <div className="fm-field">
                            <label className="fm-label">Supporting Document <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(optional) — select one or more files</span></label>
                            {editForm.supportingEvidenceUrl && editTaskSupportingEvidence.length === 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '8px 12px', background: 'rgba(0,169,157,0.04)', border: '1px solid rgba(0,169,157,0.15)', borderRadius: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, color: 'var(--primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {(editForm.supportingEvidenceUrl.split('/').pop() || '').replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '')}
                                    </span>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <input ref={editTaskFileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                                    onChange={e => {
                                        const files = Array.from(e.target.files ?? []);
                                        if (editTaskFileRef.current) editTaskFileRef.current.value = '';
                                        if (files.length === 0) return;
                                        const allowed = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png'];
                                        for (const file of files) {
                                            const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
                                            if (!allowed.includes(ext)) { setEditApiError('Invalid file format. Allowed: PDF, DOCX, XLSX, JPG, PNG.'); return; }
                                            if (file.size > 20 * 1024 * 1024) { setEditApiError('File size must not exceed 20MB.'); return; }
                                        }
                                        setEditApiError('');
                                        setEditTaskSupportingEvidence(files);
                                    }}
                                    style={{ flex: 1, fontSize: 13 }} />
                                {editTaskSupportingEvidence.length > 0 && (
                                    <button type="button" onClick={() => { setEditTaskSupportingEvidence([]); if (editTaskFileRef.current) editTaskFileRef.current.value = ''; }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ee5d50', padding: 4 }}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            {editTaskSupportingEvidence.length > 0 && (
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {editTaskSupportingEvidence.map((file, idx) => (
                                        <div key={`${file.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,169,157,0.05)', border: '1px solid rgba(0,169,157,0.18)', borderRadius: 6 }}>
                                            <span style={{ fontSize: 11, color: 'var(--status-active)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = editTaskSupportingEvidence.filter((_, i) => i !== idx);
                                                    setEditTaskSupportingEvidence(next);
                                                }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ee5d50', padding: 2 }}
                                                aria-label={`Remove ${file.name}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                        {editTaskSupportingEvidence.length} file{editTaskSupportingEvidence.length === 1 ? '' : 's'} selected — uploaded after the task is saved.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="fm-section">
                        <h5 className="fm-section-title">Visibility</h5>
                        <label className={`conf-card${editForm.isConfidential ? ' active' : ''}`}>
                            <input type="checkbox" checked={editForm.isConfidential}
                                onChange={e => setEditForm(p => ({ ...p, isConfidential: e.target.checked }))} />
                            <div className="conf-card-body">
                                <div className="conf-label-row">
                                    <span className="conf-icon">
                                        <Lock size={14} color={editForm.isConfidential ? '#ee5d50' : 'var(--text-secondary)'} />
                                    </span>
                                    <span className="conf-title">Confidential Task</span>
                                    {editForm.isConfidential && <span className="conf-badge">Restricted</span>}
                                </div>
                                <span className="conf-desc">
                                    {editForm.isConfidential ? (
                                        <>Only <strong>Coordinators</strong> &amp; <strong>Manager</strong> can view this task</>
                                    ) : (
                                        'Restrict visibility to Coordinators and Manager only'
                                    )}
                                </span>
                            </div>
                        </label>
                    </div>
                </FormModal>
            )}
        </div>
    );
}
