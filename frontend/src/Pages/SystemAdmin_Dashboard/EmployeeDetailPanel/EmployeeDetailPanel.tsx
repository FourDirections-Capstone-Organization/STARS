import { useEffect, useState, useRef } from 'react';
import {
    User,
    Phone,
    Shield,
    Hash,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Pencil,
    Save,
    X,
    ClipboardList,
    ToggleLeft,
    ToggleRight,
    Trash2,
    ChevronLeft,
    Eye,
    EyeOff,
    Lock,
    Mail,
    Download,
    FileText,
    Clock,
    Package,
    Truck,
    Activity,
    Lightbulb,
    Building,
    Briefcase,
    Calendar,
} from 'lucide-react';
import './EmployeeDetailPanel.css';
import { useToast } from '../../../components/Toast/Toast';
import FormModal from '../../../components/FormModal/FormModal';
import ConfirmationModal from '../../../components/ConfirmationModal/ConfirmationModal';
import DataTable from '../../../components/ui/DataTable';
import Pagination from '../../../components/ui/Pagination';
import api from '../../../api';

interface ConfirmModalState {
    isOpen: boolean;
    variant: 'neutral' | 'danger' | 'warning' | 'info' | 'success';
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
    onConfirm: () => {},
};

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface DeliveryRecord {
    deliveryId: string;
    trackingNumber: string;
    recipient: string;
    destination: string;
    status: string;
    deliveredAt: string | null;
    assignedAt: string;
}

interface ActivityLog {
    id: number;
    description: string;
    timestamp: string;
    activityType?: string;
    actorName?: string;
    actorRole?: string;
    targetEntity?: string;
    oldValue?: string | null;
    newValue?: string | null;
}

interface RecommendationRecord {
    id: string;
    taskTitle: string;
    coordinatorName: string;
    category: string;
    notes: string;
    createdAt: string;
}

const REC_CATEGORY_LABELS: Record<number, string> = {
    0: 'Timeliness',
    1: 'Work Quality',
    2: 'Communication',
    3: 'Other',
};

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const ROLES = [
    'Manager',
    'Coordinator',
    'Dispatcher',
    'Encoder',
    'Courier',
    'Accountant',
];

const toBackendRole = (role: string) => {
    const roleMap: Record<string, number> = {
        Manager: 0, Coordinator: 1, Dispatcher: 2,
        Encoder: 3, Courier: 4, Accountant: 5,
    };
    return roleMap[role] ?? 3;
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

const fmtDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

const fmtDateTime = (d: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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

const deliveryStatusClass = (s: string) => {
    const map: Record<string, string> = {
        delivered: 'ds-delivered',
        'in-transit': 'ds-transit',
        pending: 'ds-pending',
        failed: 'ds-failed',
        returned: 'ds-returned',
    };
    return map[s?.toLowerCase()] ?? 'ds-pending';
};

function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
    return <div className="skel" style={{ width: w, height: h }} />;
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
    profile: RecentEmployee;
    onClose: () => void;
    onSaved: (updated: RecentEmployee) => void;
    rolesList?: string[];
}

function EditProfileModal({ profile, onClose, onSaved, rolesList }: EditModalProps) {
    const [form, setForm] = useState({
        firstName: profile.firstName ?? '',
        middleName: profile.middleName ?? '',
        lastName: profile.lastName ?? '',
        suffix: profile.suffix ?? '',
        contactNumber: profile.contactNumber,
        role: toDisplayRole(profile.role),
        accountStatus: profile.accountStatus,
        email: profile.email ?? '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const { success, error } = useToast();
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(CONFIRM_CLOSED);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [showGatePassword, setShowGatePassword] = useState(false);
    const [gateConsent, setGateConsent] = useState(false);
    const gateConsentRef = useRef(false);

    const initialValues = {
        firstName: profile.firstName ?? '',
        middleName: profile.middleName ?? '',
        lastName: profile.lastName ?? '',
        suffix: profile.suffix ?? '',
        contactNumber: profile.contactNumber,
        role: toDisplayRole(profile.role),
        accountStatus: profile.accountStatus,
        email: profile.email ?? '',
    };
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialValues);

    const handleClose = () => {
        onClose();
    };

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm(prev => ({ ...prev, [key]: e.target.value }));
        setApiError('');
    };

    const doSave = async () => {
        setSubmitting(true);
        try {
            // Look up user GUID by employee number
            const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(profile.employeeNumber)}`);
            const lookupData = lookupRes.data;
            const userId = lookupData?.data?.id ?? lookupData?.id;
            if (!userId) throw new Error('Employee not found.');

            // When deactivating: update personal details FIRST (while still active), then deactivate
            const statusChanged = form.accountStatus !== profile.accountStatus;
            if (statusChanged && form.accountStatus === 'Active') {
                await api.patch(`/api/User/${userId}/activate`);
            }

            // Update personal details
            await api.put(`/api/User/${userId}`, {
                firstName: form.firstName.trim(),
                middleName: form.middleName.trim(),
                lastName: form.lastName.trim(),
                suffix: form.suffix.trim(),
                contactNumber: form.contactNumber,
                email: form.email.trim(),
            });

            // Deactivate AFTER updating personal details (backend blocks PUT on deactivated users)
            if (statusChanged && form.accountStatus !== 'Active') {
                await api.patch(`/api/User/${userId}/deactivate`);
            }

            // Update role if changed
            const newRoleVal = toBackendRole(form.role);
            const oldRoleVal = typeof profile.role === 'number' ? profile.role : parseInt(profile.role, 10);
            if (newRoleVal !== oldRoleVal) {
                await api.patch(`/api/Role/user/${userId}/role`, { newRole: newRoleVal, reason: 'Role updated via admin panel' });
            }

            const newEmployeeName = [form.firstName.trim(), form.middleName.trim(), form.lastName.trim()].filter(Boolean).join(' ');
            onSaved({
                ...profile,
                firstName: form.firstName.trim(),
                middleName: form.middleName.trim(),
                lastName: form.lastName.trim(),
                suffix: form.suffix.trim(),
                employeeName: newEmployeeName || form.lastName.trim(),
                contactNumber: form.contactNumber,
                role: String(toBackendRole(form.role)),
                accountStatus: form.accountStatus,
                email: form.email.trim(),
            });
            success('Employee details updated successfully!');
            onClose();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err.message;
            error(msg ?? 'Something went wrong.');
            setApiError(msg ?? 'Something went wrong.');
        } finally {
            setSubmitting(false);
            setConfirmModal(CONFIRM_CLOSED);
        }
    };

    const handleSave = () => {
        if (!form.firstName.trim() || !form.lastName.trim()) {
            setApiError('First name and last name are required.');
            return;
        }
        setGatePassword('');
        setGateError('');
        setShowGatePassword(false);
        setGateConsent(false);
        gateConsentRef.current = false;
        const isStatusChanging = form.accountStatus !== profile.accountStatus;
        const isDeactivating = isStatusChanging && form.accountStatus !== 'Active';
        setConfirmModal({
            isOpen: true,
            variant: isStatusChanging ? (form.accountStatus === 'Active' ? 'success' : 'warning') : 'info',
            title: isStatusChanging
                ? `${form.accountStatus === 'Active' ? 'Activate' : 'Deactivate'} Account`
                : 'Confirm your identity',
            description: isStatusChanging
                ? `You are about to ${form.accountStatus === 'Active' ? 'activate' : 'deactivate'} ${[profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.employeeName}. Enter your password to confirm.`
                : 'Enter your password to save these changes.',
            confirmLabel: 'Verify & save',
            isLoading: false,
            onConfirm: async () => {
                if (isDeactivating && !gateConsentRef.current) {
                    setGateError('You must agree to the archiving of historical data before deactivating.');
                    return;
                }
                const pw = (document.getElementById('gate-pw-input') as HTMLInputElement)?.value ?? gatePassword;
                if (!pw) { setGateError('Please enter your password.'); return; }
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                setGateError('');
                try {
                    const adminId = localStorage.getItem('employeeId') ?? '';
                    const verifyRes = await api.post('/api/Auth/verify-password', { employeeID: adminId, password: pw });
                    const verifyData = verifyRes.data;
                    if (!verifyData.isSuccess) { throw new Error(verifyData.message || verifyData.Message || 'Incorrect password. Please try again.'); }
                    setConfirmModal(CONFIRM_CLOSED);
                    await doSave();
                } catch (err: any) {
                    const msg = err?.response?.data?.message || err.message;
                    setGateError(msg ?? 'Incorrect password. Please try again.');
                    setConfirmModal(prev => ({ ...prev, isLoading: false }));
                }
            },
        });
    };

    const infoCard = {
        avatarText: [form.firstName, form.lastName].filter(Boolean).join(' ') || '?',
        title: [form.firstName, form.middleName, form.lastName, form.suffix].filter(Boolean).join(' ') || 'Employee',
        subtitle: `Employee No. ${profile.employeeNumber}`,
        badgeText: form.accountStatus ?? 'Active',
        badgeStatus: form.accountStatus ?? 'Active'
    };

    return (
        <>
            <FormModal
                isOpen={true}
                onClose={handleClose}
                title="Edit Employee"
                subtitle={`Update details for ${profile.employeeName}`}
                infoCard={infoCard}
                apiError={apiError}
                onSubmit={handleSave}
                isSubmitting={submitting}
                size="md"
                confirmOnCancel={true}
                dirty={isDirty}
            >
                <div className="fm-section">
                    <h5 className="fm-section-title">Personal Information</h5>
                    <div className="fm-field-grid">
                        <div className="fm-field">
                            <label className="fm-label">First Name <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                            <input type="text" value={form.firstName} onChange={set('firstName')} className="fm-input" maxLength={50} placeholder="e.g. Juan" />
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Middle Initial <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                            <input type="text" value={form.middleName} onChange={set('middleName')} className="fm-input" maxLength={50} placeholder="e.g. S" />
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Last Name <span style={{ color: 'var(--status-failed)' }}>*</span></label>
                            <input type="text" value={form.lastName} onChange={set('lastName')} className="fm-input" maxLength={50} placeholder="e.g. Dela Cruz" />
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Suffix <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                            <input type="text" value={form.suffix} onChange={set('suffix')} className="fm-input" maxLength={10} placeholder="e.g. Jr., III" />
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Email</label>
                            <input type="email" value={form.email} onChange={set('email')} className="fm-input" />
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Contact Number</label>
                            <input type="tel" value={form.contactNumber} onChange={set('contactNumber')} className="fm-input" />
                        </div>
                    </div>
                </div>

                <div className="fm-section">
                    <h5 className="fm-section-title">Account</h5>
                    <div className="fm-field-grid">
                        <div className="fm-field">
                            <label className="fm-label">Role</label>
                            <select value={form.role} onChange={set('role')} className="fm-select">
                                {(rolesList && rolesList.length > 0 ? rolesList : ROLES).map(r => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="fm-field">
                            <label className="fm-label">Account Status</label>
                            <select value={form.accountStatus} onChange={set('accountStatus')} className="fm-select">
                                <option value="Active">Active</option>
                                <option value="Deactivated">Deactivated</option>
                                {profile.accountStatus === 'On Leave' && <option value="On Leave">On Leave</option>}
                                {profile.accountStatus === 'Emergency Overriden' && <option value="Emergency Overriden">Emergency Overriden</option>}
                            </select>
                        </div>
                    </div>
                </div>
            </FormModal>

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                variant={confirmModal.variant}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmLabel={confirmModal.confirmLabel}
                cancelLabel={confirmModal.cancelLabel}
                isLoading={confirmModal.isLoading}
                extraContent={confirmModal.isOpen ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                            <input id="gate-pw-input" type={showGatePassword ? 'text' : 'password'} placeholder="Enter your current password" style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box', height: 38, borderRadius: 8, border: `1.5px solid ${gateError ? '#dc2626' : '#e2e8f0'}`, padding: '0 40px 0 12px', fontSize: 13, outline: 'none' }} autoFocus onChange={e => { setGatePassword(e.target.value); setGateError(''); }} onKeyDown={e => { if (e.key === 'Enter') document.getElementById('gate-confirm-btn')?.click(); }} />
                            <button type="button" onClick={() => setShowGatePassword(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }} tabIndex={-1}>{showGatePassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                        </div>
                        {gateError && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#dc2626' }}><AlertCircle size={12} />{gateError}</div>}
                    </div>
                ) : undefined}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(CONFIRM_CLOSED)}
            />
        </>
    );
}

// ─── Main Panel Component ────────────────────────────────────────────────────

interface EmployeeDetailPanelProps {
    employee: RecentEmployee;
    initialSection?: 'overview' | 'activity' | 'recommendations';
    onBack: () => void;
    onEmployeeUpdated: (updated: RecentEmployee) => void;
    rolesList?: string[];
}

export default function EmployeeDetailPanel({
    employee,
    initialSection = 'overview',
    onBack,
    onEmployeeUpdated,
    rolesList,
}: EmployeeDetailPanelProps) {
    const [profile, setProfile] = useState<RecentEmployee>(employee);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [activityLogPage, setActivityLogPage] = useState(1);
    const activityLogPageSize = 10;

    const [loadingLogs, setLoadingLogs] = useState(true);
    const [showEdit, setShowEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [activeSection, setActiveSection] = useState<'overview' | 'activity' | 'recommendations'>(initialSection);
    const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
    const [loadingDeliveries, setLoadingDeliveries] = useState(false);
    const [recommendations, setRecommendations] = useState<RecommendationRecord[]>([]);
    const [recLoading, setRecLoading] = useState(false);
    const [recPage, setRecPage] = useState(1);
    const [recTotalPages, setRecTotalPages] = useState(1);
    const [recTotalCount, setRecTotalCount] = useState(0);
    const REC_PAGE_SIZE = 6;
    const { success, error } = useToast();
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(CONFIRM_CLOSED);

    // Sync active section if initialSection prop changes
    useEffect(() => {
        setActiveSection(initialSection);
    }, [initialSection]);

    // Sync profile state if employee prop changes
    useEffect(() => {
        setProfile(employee);
    }, [employee]);

    // Fetch Activity Logs
    useEffect(() => {
        const fetchLogs = async () => {
            setLoadingLogs(true);
            try {
                // Look up user GUID first
                const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(profile.employeeNumber)}`);
                const lookupData = lookupRes.data;
                const userId = lookupData?.data?.id ?? lookupData?.id;
                if (userId) {
                    const res = await api.get('/api/audit-logs', { userId, pageSize: 50 });
                    const json = res.data;
                    const items = json?.isSuccess && json?.data?.items ? json.data.items : [];
                    setActivityLogs(items.map((log: any) => ({
                        id: log.id ?? log.activityLogId,
                        description: log.description ?? '',
                        timestamp: log.timestamp ?? log.createdAt ?? '',
                        activityType: log.actionType ?? log.activityType ?? '',
                        actorName: log.actorName ?? '',
                        actorRole: log.actorRole ?? '',
                        targetEntity: log.targetEntity ?? '',
                        oldValue: log.oldValue ?? null,
                        newValue: log.newValue ?? null,
                    })));
                } else {
                    setActivityLogs([]);
                }
            } catch {
                setActivityLogs([]);
            } finally {
                setLoadingLogs(false);
            }
        };
        fetchLogs();
    }, [profile.employeeNumber]);

    // Reset to page 1 when viewing a different employee
    useEffect(() => {
        setRecPage(1);
    }, [profile.employeeNumber]);

    // Fetch Recommendation History
    useEffect(() => {
        const fetchRecommendations = async () => {
            setRecLoading(true);
            try {
                const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(profile.employeeNumber)}`);
                const lookupData = lookupRes.data;
                const userId = lookupData?.data?.id ?? lookupData?.id;
                if (userId) {
                    const res = await api.get(`/api/users/${userId}/recommendations`, { pageNumber: recPage, pageSize: REC_PAGE_SIZE });
                    const json = res.data;
                    const d = json?.data;
                    const items = json?.isSuccess && Array.isArray(d?.items) ? d.items : [];
                    setRecommendations(items.map((r: any) => ({
                        id: r.id ?? r.recommendationId ?? '',
                        taskTitle: r.taskTitle ?? '',
                        coordinatorName: r.coordinatorName ?? '',
                        category: REC_CATEGORY_LABELS[r.category as number] ?? String(r.category ?? ''),
                        notes: r.notes ?? '',
                        createdAt: r.createdAt ?? '',
                    })));
                    setRecTotalPages(d?.totalPages || 1);
                    setRecTotalCount(d?.totalCount ?? items.length);
                } else {
                    setRecommendations([]);
                    setRecTotalPages(1);
                    setRecTotalCount(0);
                }
            } catch {
                setRecommendations([]);
                setRecTotalPages(1);
                setRecTotalCount(0);
            } finally {
                setRecLoading(false);
            }
        };
        fetchRecommendations();
    }, [profile.employeeNumber, recPage]);

    // Password gate helpers
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');
    const [gateLoading, setGateLoading] = useState(false);
    const [showGatePassword, setShowGatePassword] = useState(false);
    const [gateConsent, setGateConsent] = useState(false);
    const gateConsentRef = useRef(false);
    const [pendingAction, setPendingAction] = useState<{ type: 'archive' | 'toggle'; nextStatus?: string } | null>(null);

    const showPasswordGate = (title: string, description: string, variant: 'danger' | 'warning' | 'info', action: { type: 'archive' | 'toggle'; nextStatus?: string }) => {
        setGatePassword('');
        setGateError('');
        setShowGatePassword(false);
        gateConsentRef.current = false;
        setPendingAction(action);
        setConfirmModal({
            isOpen: true,
            variant,
            title,
            description: (<> <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{description}</p> </>),
            isLoading: false,
            confirmLabel: 'Verify & proceed',
            onConfirm: async () => {
                const isDeactivation = action.type === 'archive' || (action.type === 'toggle' && action.nextStatus !== 'Active');
                if (isDeactivation && !gateConsentRef.current) {
                    setGateError('You must agree to the archiving of historical data before deactivating.');
                    return;
                }
                const pw = (document.getElementById('gate-pw-input') as HTMLInputElement)?.value ?? gatePassword;
                if (!pw) { setGateError('Please enter your password.'); return; }
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                setGateError('');
                try {
                    const adminId = localStorage.getItem('employeeId') ?? '';
                    const verifyRes = await api.post('/api/Auth/verify-password', { employeeID: adminId, password: pw });
                    const verifyData = verifyRes.data;
                    if (!verifyData.isSuccess) { throw new Error(verifyData.message || verifyData.Message || 'Incorrect password.'); }
                    setConfirmModal(CONFIRM_CLOSED);
                    const lookupRes = await api.get(`/api/User/employee-number/${encodeURIComponent(profile.employeeNumber)}`);
                    const lookupData = lookupRes.data;
                    const userId = lookupData?.data?.id ?? lookupData?.id;
                    if (!userId) throw new Error('Employee not found.');

                    if (action.type === 'archive') {
                        setDeleting(true);
                        try {
                            await api.patch(`/api/User/${userId}/deactivate`);
                            success(`Successfully archived ${profile.employeeName}.`);
                            onEmployeeUpdated({ ...profile, accountStatus: '__deleted__' });
                        } catch (err: any) {
                            const msg = err?.response?.data?.message || err.message;
                            error(msg);
                        } finally {
                            setDeleting(false);
                        }
                    } else {
                        const next = action.nextStatus!;
                        const isActive = next === 'Active';
                        try {
                            await api.patch(`/api/User/${userId}/${isActive ? 'activate' : 'deactivate'}`);
                            const updatedProfile = { ...profile, accountStatus: next };
                            setProfile(updatedProfile);
                            onEmployeeUpdated(updatedProfile);
                            success(`Successfully ${next === 'Active' ? 'activated' : 'deactivated'} ${profile.employeeName}.`);
                        } catch (err: any) {
                            const msg = err?.response?.data?.message || err.message;
                            error(msg);
                        }
                    }
                } catch (err: any) {
                    const msg = err?.response?.data?.message || err.message;
                    setGateError(msg ?? 'Incorrect password.');
                } finally {
                    setConfirmModal(prev => ({ ...prev, isLoading: false }));
                }
            },
        });
    };

    // Archive Employee
    const handleDelete = () => {
        showPasswordGate('Archive Employee', `Are you sure you want to permanently archive ${profile.employeeName}? This action cannot be undone.`, 'danger', { type: 'archive' });
    };

    // Toggle status (Activate/Deactivate)
    const handleToggleStatus = () => {
        const isActive = ['Active', 'On Leave', 'Emergency Overriden'].includes(profile.accountStatus);
        const next = isActive ? 'Deactivated' : 'Active';
        showPasswordGate(`${next === 'Active' ? 'Activate' : 'Deactivate'} Employee`, `Are you sure you want to ${next === 'Deactivated' ? 'deactivate' : 'activate'} ${profile.employeeName}?`, 'warning', { type: 'toggle', nextStatus: next });
    };

    const completedCount = deliveries.filter(d => d.status?.toLowerCase() === 'delivered').length;
    const transitCount = deliveries.filter(d => d.status?.toLowerCase() === 'in-transit').length;
    const failedCount = deliveries.filter(d => ['failed', 'returned'].includes(d.status?.toLowerCase())).length;

    return (
        <div className="ed-main" style={{ minHeight: 'calc(100vh - 84px)', display: 'flex', flexDirection: 'column' }}>
            {/* Top actions bar */}
            <div className="ed-topbar">
                <button className="ed-btn ed-btn-ghost" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronLeft size={16} /> Back to Employees
                </button>
                <div className="ed-topbar-actions">
                    <button
                        className={`ed-btn ed-btn-ghost ${['Active', 'On Leave', 'Emergency Overriden'].includes(profile.accountStatus) ? 'deactivate' : 'activate'}`}
                        onClick={handleToggleStatus}
                    >
                        {['Active', 'On Leave', 'Emergency Overriden'].includes(profile.accountStatus) ? (
                            <>
                                <ToggleLeft size={15} /> Deactivate
                            </>
                        ) : (
                            <>
                                <ToggleRight size={15} /> Activate
                            </>
                        )}
                    </button>
                    <button className="ed-btn ed-btn-secondary" onClick={() => setShowEdit(true)}>
                        <Pencil size={14} /> Edit Profile
                    </button>
                    <button className="ed-btn ed-btn-danger" onClick={handleDelete} disabled={deleting}>
                        {deleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />} Delete
                    </button>
                </div>
            </div>

            {/* Hero banner */}
            <div className="ed-hero">
                <div className="ed-hero-inner">
                    <div className="ed-hero-avatar">{profile.employeeName.charAt(0).toUpperCase()}</div>
                    <div className="ed-hero-info">
                        <div className="ed-hero-name-row">
                            <h1>{profile.employeeName}</h1>
                            <span className={`ed-status-pill ${profile.accountStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                                {profile.accountStatus}
                            </span>
                        </div>
                        <div className="ed-hero-meta">
                            <span>
                                <Hash size={13} /> {profile.employeeNumber}
                            </span>
                            <span>
                                <Mail size={13} /> {profile.email || '—'}
                            </span>
                            <span>
                                <Shield size={13} /> {toDisplayRole(profile.role)}
                            </span>
                            <span>
                                <Phone size={13} /> {profile.contactNumber || '—'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="ed-hero-stats">
                    {[
                        { label: 'Total Deliveries', value: deliveries.length, cls: '' },
                        { label: 'Completed', value: completedCount, cls: 'green' },
                        { label: 'In Transit', value: transitCount, cls: 'amber' },
                        { label: 'Failed / Returned', value: failedCount, cls: 'red' },
                        { label: 'Activity Logs', value: activityLogs.length, cls: '' },
                    ].map(({ label, value, cls }) => (
                        <div key={label} className="ed-hero-stat">
                            <span className={`ed-hero-stat-value ${cls}`}>
                                {loadingDeliveries ? '—' : value}
                            </span>
                            <span className="ed-hero-stat-label">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Section tabs */}
            <div className="ed-section-tabs">
                {([
                    { key: 'overview', icon: User, label: 'Overview' },
                    { key: 'deliveries', icon: Truck, label: 'Deliveries' },
                    { key: 'activity', icon: ClipboardList, label: 'Activity Logs' },
                    { key: 'recommendations', icon: Lightbulb, label: 'Recommendations' },
                ] as const).map(({ key, icon: Icon, label }) => (
                    <button
                        key={key}
                        className={`ed-section-tab ${activeSection === key ? 'active' : ''}`}
                        onClick={() => setActiveSection(key)}
                    >
                        <Icon size={15} /> {label}
                    </button>
                ))}
            </div>

            {/* Body content */}
            <div className="ed-body" style={{ flex: 1 }}>
                {activeSection === 'overview' && (
                    <div className="ed-overview-grid">
                        {/* Personal Information */}
                        <div className="ed-card">
                            <div className="ed-card-header">
                                <h3>
                                    <User size={15} /> Personal Information
                                </h3>
                            </div>
                            <div className="ed-field-list">
                                {[
                                    { label: 'Employee Number', value: profile.employeeNumber, icon: Hash },
                                    { label: 'Full Name', value: profile.employeeName, icon: User },
                                    { label: 'Email', value: profile.email || '—', icon: Mail },
                                    { label: 'Contact Number', value: profile.contactNumber || '—', icon: Phone },
                                    { label: 'Role', value: toDisplayRole(profile.role), icon: Shield },
                                    { label: 'Department', value: profile.departmentName || '—', icon: Building },
                                    { label: 'Employment Status', value: profile.employmentStatus || 'Regular', icon: Briefcase },
                                    { label: 'Hire Date', value: fmtDate(profile.hireDate ?? null), icon: Calendar },
                                    { label: 'Account Status', value: profile.accountStatus, icon: CheckCircle2 },
                                ].map(({ label, value, icon: Icon }) => (
                                    <div key={label} className="ed-info-row">
                                        <span className="ed-info-label">
                                            <Icon size={12} /> {label}
                                        </span>
                                        <span
                                            className={`ed-info-value ${label === 'Account Status' ? `status-${value.toLowerCase()}` : ''
                                                }`}
                                        >
                                            {value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="ed-card">
                            <div className="ed-card-header">
                                <h3>
                                    <Clock size={15} /> Recent Activity
                                </h3>
                                <button className="ed-view-all" onClick={() => setActiveSection('activity')}>
                                    View all →
                                </button>
                            </div>
                            {loadingLogs ? (
                                <div className="ed-log-list">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="ed-log-item">
                                            <Skeleton w="70%" />
                                            <Skeleton w="25%" />
                                        </div>
                                    ))}
                                </div>
                            ) : activityLogs.length === 0 ? (
                                <div className="ed-empty">
                                    <ClipboardList size={18} />
                                    <p>No activity recorded</p>
                                </div>
                            ) : (
                                <div className="ed-log-list">
                                    {activityLogs.slice(0, 5).map(log => (
                                        <div key={log.id} className="ed-log-item">
                                            <span className="ed-log-dot" />
                                            <span className="ed-log-desc">{log.description}</span>
                                            <span className="ed-log-time">{fmtDateTime(log.timestamp)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Uploaded Documents */}
                        <div className="ed-card ed-card-full" style={{ marginTop: 20 }}>
                            <div className="ed-card-header">
                                <h3>
                                    <FileText size={15} /> Uploaded Documents / Attachments
                                </h3>
                                <span className="ed-badge-count">
                                    {profile.attachments?.length ?? 0} files
                                </span>
                            </div>
                            <div style={{ padding: '20px' }}>
                                {!profile.attachments || profile.attachments.length === 0 ? (
                                    <div className="ed-empty" style={{ padding: '24px 0' }}>
                                        <FileText size={20} />
                                        <p>No documents uploaded yet</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                                        {profile.attachments.map(att => {
                                            const sizeMB = (att.fileSize / (1024 * 1024)).toFixed(2);
                                            return (
                                                <div key={att.employeeAttachmentId} style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(67, 24, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <FileText size={16} color="var(--primary)" />
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.fileName}>
                                                                {att.fileName}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                                {sizeMB} MB
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: '1.5px solid var(--border)', color: 'var(--text-secondary)', transition: 'all 0.15s ease' }} title="Download / Open file">
                                                        <Download size={14} />
                                                    </a>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'deliveries' && (
                    <div className="ed-card">
                        <div className="ed-card-header">
                            <h3>
                                <Truck size={15} /> Delivery History
                            </h3>
                        </div>
                        <div className="ed-empty" style={{ padding: '48px 24px' }}>
                            <Package size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                Delivery tracking is coming soon.
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                This feature will be available in a future update.
                            </p>
                        </div>
                    </div>
                )}

                {activeSection === 'activity' && (
                    <div className="ed-card">
                        <div className="ed-card-header">
                            <h3>
                                <ClipboardList size={15} /> Activity Logs
                            </h3>
                            <span className="ed-badge-count">{activityLogs.length} entries</span>
                        </div>
                        {loadingLogs ? (
                            <div className="ed-empty">
                                <Loader2 size={22} className="spin" />
                                <p>Loading logs…</p>
                            </div>
                        ) : (
                            <DataTable
                                headers={['Date & Time', 'Action', 'Affected Employee / Entity', 'Description', 'Changes (Old → New)']}
                                loading={false}
                                emptyMessage="No activity logs found"
                                emptyIcon={<Activity size={24} />}
                                totalRecords={activityLogs.length}
                                currentPage={activityLogPage}
                                totalPages={Math.max(1, Math.ceil(activityLogs.length / activityLogPageSize))}
                                onPageChange={p => setActivityLogPage(p)}
                            >
                                {activityLogs
                                    .slice((activityLogPage - 1) * activityLogPageSize, activityLogPage * activityLogPageSize)
                                    .map(log => {
                                        const badge = getAuditBadgeStyle(log.activityType ?? '');
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
                                                {formatActionType(log.activityType)}
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
                        )}
                    </div>
                )}

                {activeSection === 'recommendations' && (
                    <div className="ed-card">
                        <div className="ed-card-header">
                            <h3>
                                <Lightbulb size={15} /> Recommendation History
                            </h3>
                            <span className="ed-badge-count">{recTotalCount} entries</span>
                        </div>
                        {recLoading ? (
                            <div className="ed-empty">
                                <Loader2 size={22} className="spin" />
                                <p>Loading recommendations…</p>
                            </div>
                        ) : recommendations.length === 0 ? (
                            <div className="ed-empty">
                                <Lightbulb size={22} />
                                <p>No recommendations found</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 8 }}>
                                {recommendations.map(r => (
                                    <div key={r.id} style={{ padding: '12px 14px', background: 'var(--bg-main)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(67, 24, 255, 0.08)', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                                {r.category}
                                            </span>
                                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {r.createdAt ? fmtDateTime(r.createdAt) : ''}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{r.notes}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span><User size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{r.coordinatorName || '—'}</span>
                                            <span>·</span>
                                            <span>Task: {r.taskTitle || '—'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!recLoading && recommendations.length > 0 && (
                            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
                                <Pagination currentPage={recPage} totalPages={recTotalPages} onPageChange={setRecPage} />
                            </div>
                        )}
                    </div>
                )}

            </div>

            {showEdit && (
                <EditProfileModal
                    profile={profile}
                    rolesList={rolesList}
                    onClose={() => setShowEdit(false)}
                    onSaved={updated => {
                        setProfile(updated);
                        onEmployeeUpdated(updated);
                        setShowEdit(false);
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
                isLoading={confirmModal.isLoading}
                extraContent={confirmModal.extraContent ?? (pendingAction ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(pendingAction.type === 'archive' || (pendingAction.type === 'toggle' && pendingAction.nextStatus !== 'Active')) && (
                            <div style={{ padding: '10px 12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--status-failed)' }}>Warning:</strong> Historical tasks, comment logs, and recommendations will be archived in a read-only state.
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, cursor: 'pointer', fontWeight: 500 }}>
                                    <input type="checkbox" checked={gateConsent} onChange={e => { setGateConsent(e.target.checked); gateConsentRef.current = e.target.checked; setGateError(''); }} style={{ marginTop: 2, accentColor: 'var(--status-failed)' }} />
                                    <span>I understand and agree to proceed with deactivation.</span>
                                </label>
                            </div>
                        )}
                        <div style={{ position: 'relative' }}>
                            <input id="gate-pw-input" type={showGatePassword ? 'text' : 'password'} placeholder="Enter your current password" style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box', height: 38, borderRadius: 8, border: `1.5px solid ${gateError ? '#dc2626' : '#e2e8f0'}`, padding: '0 40px 0 12px', fontSize: 13, outline: 'none' }} autoFocus onChange={e => { setGatePassword(e.target.value); setGateError(''); }} onKeyDown={e => { if (e.key === 'Enter') document.getElementById('gate-confirm-btn')?.click(); }} />
                            <button type="button" onClick={() => setShowGatePassword(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }} tabIndex={-1}>{showGatePassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                        </div>
                        {gateError && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#dc2626' }}><AlertCircle size={12} />{gateError}</div>}
                    </div>
                ) : undefined)}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(CONFIRM_CLOSED)}
            />
        </div>
    );
}
