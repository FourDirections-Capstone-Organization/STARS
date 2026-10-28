import React from 'react';
import {
    ArrowLeft,
    Building2,
    Briefcase,
    Mail,
    Hash,
    Shield,
    GitBranch,
    ClipboardList,
    CheckCircle2,
    Clock,
    AlertCircle,
    UserCheck,
    UserX,
    RefreshCw,
    Activity,
    Crown
} from 'lucide-react';
import RoleBadge from '../../../../components/ui/RoleBadge';
import StatusCard from '../../../../components/StatusCard/StatusCard';
import {
    EmployeeDashboardData,
    EmployeeReportsTo
} from '../../../../services/employeeDashboardService';
import './EmployeeHeader.css';

// ── Types & Interfaces ────────────────────────────────────────────────────────

export interface EmployeeProfileInfo {
    id?: string;
    employeeId?: string;
    employeeNumber?: string;
    fullName?: string;
    email?: string;
    role?: string;
    departmentName?: string | null;
    jobPositionName?: string | null;
    availabilityStatus?: string;
    presenceStatus?: string;
    isActive?: boolean;
}

export interface EmployeeKPIInfo {
    totalAssignedTasks?: number;
    totalCreatedTasks?: number;
    completedCount?: number;
    inProgressCount?: number;
    pendingCount?: number;
    overdueCount?: number;
}

export interface EmployeeHeaderProps {
    data?: EmployeeDashboardData | null;
    employee?: EmployeeProfileInfo;
    reportsTo?: EmployeeReportsTo | null;
    kpis?: EmployeeKPIInfo;
    onBack?: () => void;
    onRefresh?: () => void;
    isLoading?: boolean;
    className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getInitials(name?: string | null): string {
    if (!name || !name.trim()) return '—';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isTopLevelManagement(
    role?: string | null,
    reportingRelation?: string | null,
    supervisorName?: string | null
): boolean {
    const normRole = (role || '').trim().toLowerCase();
    const normRel = (reportingRelation || '').trim().toLowerCase();
    const normSup = (supervisorName || '').trim().toLowerCase();

    return (
        normRole === 'manager' ||
        normRel.includes('executive') ||
        normRel.includes('board') ||
        normSup.includes('executive') ||
        normSup.includes('board') ||
        (!supervisorName && !reportingRelation)
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export const EmployeeHeader: React.FC<EmployeeHeaderProps> = ({
    data,
    employee: propEmployee,
    reportsTo: propReportsTo,
    kpis: propKpis,
    onBack,
    onRefresh,
    isLoading = false,
    className = '',
}) => {
    // 1. Resolve unified employee profile
    const empId = data?.employeeId || propEmployee?.employeeId || propEmployee?.id || '';
    const fullName = data?.fullName || propEmployee?.fullName || 'Unknown Employee';
    const employeeNumber = data?.employeeNumber || propEmployee?.employeeNumber || '—';
    const email = data?.email || propEmployee?.email || '';
    const role = data?.role || propEmployee?.role || 'Staff';
    const departmentName = data?.departmentName ?? propEmployee?.departmentName ?? null;
    const jobPositionName = data?.jobPositionName ?? propEmployee?.jobPositionName ?? null;
    const availabilityStatus = data?.availabilityStatus || propEmployee?.availabilityStatus || 'Available';
    const presenceStatus = data?.presenceStatus || propEmployee?.presenceStatus || 'Offline';
    const isActive = data ? data.isActive : (propEmployee?.isActive ?? true);

    // 2. Resolve supervisor & reporting line
    const reportsTo: EmployeeReportsTo = data?.reportsTo || propReportsTo || {
        supervisorId: null,
        supervisorName: data?.supervisorName || 'Executive Board',
        supervisorRole: data?.supervisorRole || 'Executive Management',
        supervisorEmployeeNumber: data?.supervisorEmployeeNumber || null,
        reportingRelation: data?.reportingRelation || 'Executive Board',
    };

    const supervisorName = reportsTo.supervisorName || data?.supervisorName || 'Executive Board';
    const supervisorRole = reportsTo.supervisorRole || data?.supervisorRole || 'Executive Management';
    const supervisorEmployeeNumber = reportsTo.supervisorEmployeeNumber || data?.supervisorEmployeeNumber;
    const reportingRelation = reportsTo.reportingRelation || data?.reportingRelation || 'Executive Board';

    const isTopLevel = isTopLevelManagement(role, reportingRelation, supervisorName);

    // 3. Resolve KPI metrics
    const totalAssigned = data?.totalAssignedTasks ?? propKpis?.totalAssignedTasks ?? 0;
    const totalCreated = data?.totalCreatedTasks ?? propKpis?.totalCreatedTasks ?? 0;
    const totalWorkload = totalAssigned + totalCreated;
    const completedCount = data?.completedCount ?? propKpis?.completedCount ?? 0;
    const inProgressCount = data?.inProgressCount ?? propKpis?.inProgressCount ?? 0;
    const overdueCount = data?.overdueCount ?? propKpis?.overdueCount ?? 0;

    const initials = getInitials(fullName);
    const isOnline = presenceStatus.toLowerCase() === 'online';

    return (
        <header className={`eh-container ${className}`.trim()} aria-label="Employee Profile and Performance Header">

            {/* ── 1. Top Navigation Bar ───────────────────────────────────── */}
            <nav className="eh-nav-bar" aria-label="Breadcrumb and Actions">
                <div className="eh-nav-left">
                    <button
                        type="button"
                        className="eh-back-btn"
                        onClick={onBack}
                        aria-label="Back to Org Structure"
                        data-testid="eh-back-btn"
                    >
                        <ArrowLeft size={16} />
                        <span>Back to Org Structure</span>
                    </button>
                    <span className="eh-nav-divider" aria-hidden="true">/</span>
                    <span className="eh-nav-context">Employee Performance Dashboard</span>
                </div>

                <div className="eh-nav-right">
                    {isActive ? (
                        <span className="eh-status-pill eh-status-active" data-testid="eh-account-status">
                            <UserCheck size={13} />
                            <span>Active Account</span>
                        </span>
                    ) : (
                        <span className="eh-status-pill eh-status-inactive" data-testid="eh-account-status">
                            <UserX size={13} />
                            <span>Deactivated</span>
                        </span>
                    )}

                    {onRefresh && (
                        <button
                            type="button"
                            className="eh-refresh-btn"
                            onClick={onRefresh}
                            disabled={isLoading}
                            aria-label="Refresh employee dashboard data"
                            data-testid="eh-refresh-btn"
                            title="Refresh Dashboard"
                        >
                            <RefreshCw size={14} className={isLoading ? 'eh-spinning' : ''} />
                            <span>Refresh</span>
                        </button>
                    )}
                </div>
            </nav>

            {/* ── 2. Profile Hero & Reports-To Split Section ──────────────── */}
            <div className="eh-hero-row">

                {/* Profile Hero Main Card */}
                <div className="eh-profile-card" data-testid="eh-profile-card">
                    <div className="eh-avatar-wrap">
                        <div className="eh-avatar-circle" data-testid="eh-avatar">
                            {initials}
                        </div>
                        <span
                            className={`eh-presence-dot ${isOnline ? 'eh-online' : 'eh-offline'}`}
                            title={`Presence: ${presenceStatus}`}
                            data-testid="eh-presence-dot"
                        />
                    </div>

                    <div className="eh-profile-body">
                        {/* Name & Identity Badges */}
                        <div className="eh-name-row">
                            <h1 className="eh-full-name" data-testid="eh-full-name">{fullName}</h1>
                            <div className="eh-identity-badges">
                                <span className="eh-emp-no-badge" data-testid="eh-emp-number">
                                    <Hash size={12} />
                                    <span>{employeeNumber}</span>
                                </span>
                                <span data-testid="eh-role-badge">
                                    <RoleBadge role={role} />
                                </span>
                                <span
                                    className={`eh-presence-badge ${isOnline ? 'eh-presence-online' : 'eh-presence-offline'}`}
                                    data-testid="eh-presence-badge"
                                >
                                    <span className="eh-presence-indicator" />
                                    <span>{presenceStatus}</span>
                                </span>
                            </div>
                        </div>

                        {/* Metadata Details Row */}
                        <div className="eh-meta-grid">
                            <div className="eh-meta-item">
                                <Building2 size={15} className="eh-meta-icon" />
                                <div className="eh-meta-content">
                                    <span className="eh-meta-label">Department</span>
                                    <span className="eh-meta-value" data-testid="eh-department">
                                        {departmentName || 'Corporate Operations'}
                                    </span>
                                </div>
                            </div>

                            <div className="eh-meta-item">
                                <Briefcase size={15} className="eh-meta-icon" />
                                <div className="eh-meta-content">
                                    <span className="eh-meta-label">Job Position</span>
                                    <span className="eh-meta-value" data-testid="eh-position">
                                        {jobPositionName || 'Personnel'}
                                    </span>
                                </div>
                            </div>

                            {email && (
                                <div className="eh-meta-item">
                                    <Mail size={15} className="eh-meta-icon" />
                                    <div className="eh-meta-content">
                                        <span className="eh-meta-label">Email Address</span>
                                        <a href={`mailto:${email}`} className="eh-meta-value eh-meta-link" data-testid="eh-email">
                                            {email}
                                        </a>
                                    </div>
                                </div>
                            )}

                            <div className="eh-meta-item">
                                <Activity size={15} className="eh-meta-icon" />
                                <div className="eh-meta-content">
                                    <span className="eh-meta-label">Availability</span>
                                    <span className="eh-meta-value eh-avail-tag" data-testid="eh-availability">
                                        {availabilityStatus}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── 3. Dedicated "Reports To" Supervisor Card ───────────── */}
                <aside className="eh-supervisor-card" data-testid="eh-supervisor-card" aria-label="Supervisor Reporting Information">
                    <div className="eh-supervisor-header">
                        <div className="eh-supervisor-icon-box">
                            <GitBranch size={16} />
                        </div>
                        <div>
                            <span className="eh-supervisor-kicker">Reporting Line</span>
                            <h2 className="eh-supervisor-heading">Reports To</h2>
                        </div>
                        <span className="eh-relation-pill" data-testid="eh-reporting-relation">
                            {reportingRelation}
                        </span>
                    </div>

                    <div className="eh-supervisor-content">
                        {isTopLevel ? (
                            /* Top-Level Management / Executive Board Fallback */
                            <div className="eh-exec-fallback" data-testid="eh-exec-fallback">
                                <div className="eh-exec-badge-wrap">
                                    <div className="eh-exec-avatar">
                                        <Crown size={22} className="eh-crown-icon" />
                                    </div>
                                    <div className="eh-exec-info">
                                        <h3 className="eh-exec-name" data-testid="eh-supervisor-name">
                                            {supervisorName || 'Executive Board'}
                                        </h3>
                                        <span className="eh-exec-role" data-testid="eh-supervisor-role">
                                            Executive Management · Top Level
                                        </span>
                                    </div>
                                </div>
                                <p className="eh-exec-note">
                                    Reports directly to the Executive Board as Level 1 Executive Leadership.
                                </p>
                            </div>
                        ) : (
                            /* Standard Supervisor (Coordinator / Team Leader / Manager) */
                            <div className="eh-supervisor-details" data-testid="eh-supervisor-details">
                                <div className="eh-supervisor-profile">
                                    <div className="eh-supervisor-avatar" data-testid="eh-supervisor-avatar">
                                        {getInitials(supervisorName)}
                                    </div>
                                    <div className="eh-supervisor-info">
                                        <h3 className="eh-supervisor-name" data-testid="eh-supervisor-name">
                                            {supervisorName}
                                        </h3>
                                        <span className="eh-supervisor-role" data-testid="eh-supervisor-role">
                                            {supervisorRole}
                                        </span>
                                        {supervisorEmployeeNumber && (
                                            <span className="eh-supervisor-emp-no" data-testid="eh-supervisor-emp-no">
                                                #{supervisorEmployeeNumber}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="eh-relation-note">
                                    <span>Direct supervisor assigned via organizational hierarchy</span>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

            </div>

            {/* ── 4. KPI Summary Status Cards Grid ───────────────────────── */}
            <section className="eh-kpi-grid" aria-label="Task Performance Key Indicators" data-testid="eh-kpi-grid">
                <StatusCard
                    icon={<ClipboardList size={18} strokeWidth={2.2} />}
                    label="TOTAL WORKLOAD"
                    value={totalWorkload}
                    subtext={`${totalAssigned} assigned · ${totalCreated} created`}
                    variant="teal"
                />
                <StatusCard
                    icon={<CheckCircle2 size={18} strokeWidth={2.2} />}
                    label="COMPLETED"
                    value={completedCount}
                    subtext={totalAssigned > 0 ? `${Math.round((completedCount / totalAssigned) * 100)}% completion rate` : 'No tasks assigned'}
                    variant="success"
                />
                <StatusCard
                    icon={<Clock size={18} strokeWidth={2.2} />}
                    label="IN PROGRESS"
                    value={inProgressCount}
                    subtext="Currently active"
                    variant="warning"
                />
                <StatusCard
                    icon={<AlertCircle size={18} strokeWidth={2.2} />}
                    label="OVERDUE"
                    value={overdueCount}
                    subtext={overdueCount > 0 ? 'Action required immediately' : 'No overdue tasks'}
                    variant="danger"
                />
            </section>

        </header>
    );
};

export default EmployeeHeader;
