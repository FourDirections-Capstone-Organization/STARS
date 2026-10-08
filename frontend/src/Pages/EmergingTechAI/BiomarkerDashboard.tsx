import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    AlertTriangle, Clock, Users, Activity, Shield,
    RefreshCw, Loader2, Calendar, CheckCircle2, XCircle,
    AlertCircle, UserCheck, RotateCcw, BarChart3, Filter,
    Radio
} from 'lucide-react';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import './BiomarkerDashboard.css';
import StatusCard from '../../components/StatusCard/StatusCard';
import DataTable, { DataTableColumn, DataTableTab } from '../../components/ui/DataTable';
import Select from '../../components/ui/Select';
import DateRangePicker from '../../components/ui/DateRangePicker';
import api from '../../api';
import { useBiomarker, useBiomarkerCharts, AnalyticsStatusBadge } from '../../components/Analytics';
import {
    ViolationType, Severity, ViolationStatus,
    BiomarkerViolation
} from '../../services/analyticsService';

type FilterTab = 'all' | 'sla_breach' | 'workload_overload' | 'biomarker_flag';

// ─── Helpers ─────────────────────────────────────────────────────────────

const severityClass = (s: Severity) =>
    ({ Critical: 'sev-critical', High: 'sev-high', Medium: 'sev-medium', Low: 'sev-low' }[s]);

const typeLabel = (t: ViolationType): string =>
    ({ sla_breach: 'SLA Breach', workload_overload: 'Workload Overload', biomarker_flag: 'Biomarker Flag' }[t]);

const typeIcon = (t: ViolationType) => {
    if (t === 'sla_breach') return <Clock size={14} />;
    if (t === 'workload_overload') return <Users size={14} />;
    return <Activity size={14} />;
};

const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getTimeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

function ViolationBadge({ type }: { type: ViolationType }) {
    const cls = type === 'sla_breach' ? 'badge badge-red' :
        type === 'workload_overload' ? 'badge badge-amber' : 'badge badge-purple';
    return (
        <span className={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
            {typeIcon(type)}{typeLabel(type)}
        </span>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function BiomarkerDashboard() {
    // ── Filter state ──
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterTeam, setFilterTeam] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    // ── Build server-side filters object ──
    const filters = useMemo(() => ({
        type: activeFilter !== 'all' ? activeFilter : undefined,
        employeeNumber: filterEmployee || undefined,
        departmentId: filterDepartment || undefined,
        team: filterTeam || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        search: searchQuery || undefined,
    }), [activeFilter, filterEmployee, filterDepartment, filterTeam, filterDateFrom, filterDateTo, searchQuery]);

    const {
        violations, scanMeta, nextScan, scanStatus,
        scanning, analyticsStatus, lastRefresh, triggerScan,
        totalCount, totalPages, currentPage, setPage, summary,
    } = useBiomarker(filters);
    const safeScanMeta = scanMeta ?? { batchId: 'N/A', scannedAt: '', duration: '—', totalViolations: 0 };

    // ── Full employee/department/team lists (unfiltered, for dropdown options) ──
    const [employeeOptions, setEmployeeOptions] = useState<{ value: string; label: string }[]>([]);
    const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([]);
    const [teamOptions, setTeamOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        // Fetch all departments
        api.get('/api/Department', { pageSize: 100 }).then((res: any) => {
            const payload = res.data;
            const depts = payload?.data?.items ?? (Array.isArray(payload) ? payload : []);
            setDepartmentOptions(
                depts
                    .filter((d: any) => d.isActive !== false)
                    .map((d: any) => ({ value: d.id ?? d.Id, label: d.name ?? d.Name }))
                    .sort((a: any, b: any) => a.label.localeCompare(b.label))
            );
        }).catch(() => {});

        // Fetch all teams
        api.get('/api/Team?pageNumber=1&pageSize=200').then((res: any) => {
            const raw = res.data?.data?.items ?? (Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data?.data : []));
            setTeamOptions(
                raw
                    .filter((t: any) => t.isActive !== false)
                    .map((t: any) => ({ value: t.name ?? t.Name ?? t.id, label: t.name ?? t.Name }))
                    .sort((a: any, b: any) => a.label.localeCompare(b.label))
            );
        }).catch(() => {});

        // Fetch users, filter to non-manager couriers with employee numbers
        api.get('/api/User', { pageNumber: 1, pageSize: 200 }).then((res: any) => {
            const raw: any[] = res.data?.data?.items ?? (Array.isArray(res.data) ? res.data : []);
            setEmployeeOptions(
                raw
                    .filter((u: any) => u.employeeNumber && u.employeeNumber !== '-' && u.isActive !== false && !u.isDeactivated)
                    .map((u: any) => ({
                        value: u.employeeNumber,
                        label: `${u.employeeName ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`} (${u.employeeNumber})`
                    }))
                    .sort((a: any, b: any) => a.label.localeCompare(b.label))
            );
        }).catch(() => {});
    }, []);

    // ── Reset page when filters change ──
    useEffect(() => {
        setPage(1);
    }, [activeFilter, searchQuery, filterEmployee, filterDepartment, filterTeam, filterDateFrom, filterDateTo, setPage]);

    // ── Counts ──
    const newCount = useMemo(() => violations.filter(v => v.status === 'New').length, [violations]);

    // ── Filtered violations ──
    const filteredViolations = violations;

    // ── Chart dataset (larger filtered fetch, aggregated client-side) ──
    const chart = useBiomarkerCharts(filters);
    const chartRows = chart.violations;

    const TYPE_COLORS: Record<ViolationType, string> = {
        sla_breach: '#dc2626',
        workload_overload: '#d97706',
        biomarker_flag: '#7c3aed',
    };
    const SEVERITY_COLORS: Record<Severity, string> = {
        Critical: '#dc2626',
        High: '#ea580c',
        Medium: '#ca8a04',
        Low: '#16a34a',
    };
    const chartTooltipProps = {
        contentStyle: { borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--s1)' },
        labelStyle: { fontWeight: 700 },
        itemStyle: { fontSize: 12 },
    };

    const byTypeData = useMemo(() => {
        const counts: Record<ViolationType, number> = { sla_breach: 0, workload_overload: 0, biomarker_flag: 0 };
        chartRows.forEach(v => { counts[v.type] += 1; });
        return ([
            { name: 'SLA Breach', key: 'sla_breach' as ViolationType, value: counts.sla_breach },
            { name: 'Workload Overload', key: 'workload_overload' as ViolationType, value: counts.workload_overload },
            { name: 'Biomarker Flag', key: 'biomarker_flag' as ViolationType, value: counts.biomarker_flag },
        ]).filter(d => d.value > 0);
    }, [chartRows]);

    const bySeverityData = useMemo(() => {
        const counts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        chartRows.forEach(v => { counts[v.severity] += 1; });
        return (Object.keys(counts) as Severity[])
            .map(s => ({ name: s, value: counts[s] }))
            .filter(d => d.value > 0);
    }, [chartRows]);

    const byDepartmentData = useMemo(() => {
        const map = new Map<string, number>();
        chartRows.forEach(v => {
            const dept = v.department || 'Unassigned';
            map.set(dept, (map.get(dept) ?? 0) + 1);
        });
        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [chartRows]);

    const trendData = useMemo(() => {
        const days: { key: string; label: string }[] = [];
        const now = new Date();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            days.push({
                key: d.toLocaleDateString('en-CA'),
                label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            });
        }
        const buckets = new Map(days.map(d => [d.key, { sla_breach: 0, workload_overload: 0, biomarker_flag: 0 }]));
        chartRows.forEach(v => {
            const key = new Date(v.detectedAt).toLocaleDateString('en-CA');
            const b = buckets.get(key);
            if (b) b[v.type] += 1;
        });
        return days.map(d => {
            const b = buckets.get(d.key)!;
            return { label: d.label, 'SLA Breach': b.sla_breach, 'Workload Overload': b.workload_overload, 'Biomarker Flag': b.biomarker_flag };
        });
    }, [chartRows]);

    const workloadData = useMemo(() => {
        const map = new Map<string, { name: string; current: number; threshold: number }>();
        chartRows.forEach(v => {
            if (v.type !== 'workload_overload' || (v.currentValue ?? 0) <= 0) return;
            const key = v.employeeName || v.employeeNumber || v.id;
            const current = v.currentValue ?? 0;
            const threshold = v.thresholdValue ?? 0;
            const existing = map.get(key);
            if (existing) {
                existing.current = Math.max(existing.current, current);
                existing.threshold = Math.max(existing.threshold, threshold);
            } else {
                map.set(key, { name: v.employeeName || v.employeeNumber || 'Unknown', current, threshold });
            }
        });
        return Array.from(map.values()).sort((a, b) => b.current - a.current).slice(0, 8);
    }, [chartRows]);

    // ── Handlers ──
    const handleManualScan = useCallback(async () => {
        await triggerScan();
    }, [triggerScan]);

    const handleResetFilters = useCallback(() => {
        setSearchQuery('');
        setFilterEmployee('');
        setFilterDepartment('');
        setFilterTeam('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setActiveFilter('all');
    }, []);

    const hasActiveFilters = !!(searchQuery || filterEmployee || filterDepartment || filterTeam || filterDateFrom || filterDateTo || activeFilter !== 'all');

    // ── Columns ──
    const columns: DataTableColumn<BiomarkerViolation>[] = useMemo(() => [
        {
            header: '',
            accessor: v => <span className={`sev-dot ${severityClass(v.severity)}`} title={v.severity} />,
            width: '24px',
        },
        {
            header: 'Type',
            accessor: v => <ViolationBadge type={v.type} />,
            width: '105px',
        },
        {
            header: 'Description',
            accessor: v => <span className="bd-desc-text">{v.description}</span>,
        },
        {
            header: 'Employee',
            accessor: v => (
                <span className="bd-employee-cell">
                    <span className="bd-employee-name">{v.employeeName}</span>
                    <span className="bd-employee-num">{v.employeeNumber}</span>
                </span>
            ),
            width: '130px',
        },
        {
            header: 'Department',
            accessor: v => <span className="bd-dept-badge">{v.department}</span>,
            width: '80px',
        },
        {
            header: 'Task Ref',
            accessor: v => <code className="bd-ref">{v.taskReference}</code>,
            width: '70px',
        },
        {
            header: 'Detected',
            accessor: v => <span className="bd-time-cell">{getTimeAgo(v.detectedAt)}</span>,
            width: '72px',
        },
        {
            header: 'Status',
            accessor: v => (
                <span className={`bd-status ${v.status.toLowerCase()}`}>
                    {v.status === 'New' && <AlertCircle size={12} />}
                    {v.status === 'Acknowledged' && <UserCheck size={12} />}
                    {v.status === 'Resolved' && <CheckCircle2 size={12} />}
                    {v.status}
                </span>
            ),
            width: '80px',
        },
    ], []);

    // ── Tabs ──
    const tabs: DataTableTab[] = useMemo(() => [
        { key: 'all', label: 'All Violations', badge: summary.slaBreaches + summary.workloadOverloads + summary.biomarkerFlags },
        { key: 'sla_breach', label: 'SLA Breaches', badge: summary.slaBreaches },
        { key: 'workload_overload', label: 'Workload Overloads', badge: summary.workloadOverloads },
        { key: 'biomarker_flag', label: 'Biomarker Flags', badge: summary.biomarkerFlags },
    ], [summary.slaBreaches, summary.workloadOverloads, summary.biomarkerFlags]);

    // ── Filter elements ──
    const filterElements = useMemo(() => (
        <div className="bd-dt-filters">
            <Select
                value={filterEmployee}
                onChange={v => { setFilterEmployee(v); setPage(1); }}
                options={employeeOptions}
                placeholder="All Employees"
            />
            <Select
                value={filterDepartment}
                onChange={v => { setFilterDepartment(v); setPage(1); }}
                options={departmentOptions}
                placeholder="All Departments"
            />
            <Select
                value={filterTeam}
                onChange={v => { setFilterTeam(v); setPage(1); }}
                options={teamOptions}
                placeholder="All Teams"
            />
            <DateRangePicker
                startDate={filterDateFrom}
                endDate={filterDateTo}
                onChange={(start, end) => {
                    setFilterDateFrom(start);
                    setFilterDateTo(end);
                    setPage(1);
                }}
                onClear={() => {
                    setFilterDateFrom('');
                    setFilterDateTo('');
                    setPage(1);
                }}
                placeholder="Filter by date range…"
                ariaLabel="Filter biomarker scan alerts by date range"
            />
            {hasActiveFilters && (
                <button className="bd-dt-reset-btn" onClick={handleResetFilters} title="Reset all filters">
                    <RotateCcw size={13} /> Reset
                </button>
            )}
        </div>
    ), [filterEmployee, filterDepartment, filterTeam, filterDateFrom, filterDateTo, employeeOptions, departmentOptions, teamOptions, hasActiveFilters, handleResetFilters, setPage]);

    return (
        <div className="biomarker-dashboard">
            {/* ── Scan Status Header ── */}
            <div className="bd-scan-header">
                <div className="bd-scan-header-left">
                    <div className="bd-scan-icon-wrap">
                        <Activity size={28} />
                    </div>
                    <div className="bd-scan-info">
                        <h3>Biomarker Scan Engine <span className="bd-live-badge"><Radio size={10} /> LIVE</span> <AnalyticsStatusBadge status={analyticsStatus} /></h3>
                        <div className="bd-scan-meta">
                            <span className={`bd-scan-status-badge ${scanStatus.toLowerCase()}`}>
                                <span className="bd-status-dot" />
                                {scanStatus === 'Running' ? 'Scanning...' : scanStatus}
                            </span>
                            <span className="bd-scan-divider">|</span>
                            <span className="bd-scan-label">
                                <Calendar size={12} /> {safeScanMeta.batchId}
                            </span>
                            <span className="bd-scan-divider">|</span>
                            <span className="bd-scan-label">
                                <Clock size={12} /> Scanned: {formatTime(safeScanMeta.scannedAt)}
                            </span>
                            <span className="bd-scan-divider">|</span>
                            <span className="bd-scan-label">
                                <Clock size={12} /> Duration: {safeScanMeta.duration}
                            </span>
                            <span className="bd-scan-divider">|</span>
                            <span className="bd-scan-label">
                                Next: {formatTime(nextScan)}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    className="bd-run-scan-btn"
                    onClick={handleManualScan}
                    disabled={scanning}
                    title="Trigger immediate biomarker scan across all operations"
                >
                    {scanning ? (
                        <><Loader2 size={16} className="spin" /> Scanning...</>
                    ) : (
                        <><RefreshCw size={16} /> Run Scan Now</>
                    )}
                </button>
            </div>

            {/* ── Summary Cards ── */}
            <div className="bd-cards-row">
                <StatusCard
                    label="Total Violations"
                    value={summary.slaBreaches + summary.workloadOverloads + summary.biomarkerFlags}
                    icon={<AlertTriangle size={18} />}
                    variant="danger"
                    subtext={`${newCount} new • Latest scan`}
                />
                <StatusCard
                    label="SLA Breaches"
                    value={summary.slaBreaches}
                    icon={<Clock size={18} />}
                    variant="warning"
                    subtext="Tasks past SLA deadline"
                />
                <StatusCard
                    label="Workload Overloads"
                    value={summary.workloadOverloads}
                    icon={<Users size={18} />}
                    variant="teal"
                    subtext="Couriers exceeding threshold"
                />
                <StatusCard
                    label="Biomarker Flags"
                    value={summary.biomarkerFlags}
                    icon={<Activity size={18} />}
                    variant="info"
                    subtext="Compound flags generated"
                />
            </div>

            {/* ── Analytics Overview ── */}
            <div className="bd-section">
                <div className="bd-section-header">
                    <h4>Analytics Overview</h4>
                    <span className="bd-chart-meta">
                        {hasActiveFilters && <span className="bd-chart-filter-note"><Filter size={11} /> Based on current filters</span>}
                        <span className="bd-chart-updated">
                            {chart.loading ? 'Loading…' : `Updated ${new Date(chart.lastRefresh).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                    </span>
                </div>
                {!chart.online ? (
                    <div className="bd-chart-empty">
                        <AlertTriangle size={22} />
                        <p>Analytics service is offline. Charts will appear once the biomarker engine is reachable.</p>
                    </div>
                ) : chartRows.length === 0 ? (
                    <div className="bd-chart-empty">
                        <BarChart3 size={22} />
                        <p>No violation data to chart. Run a scan or adjust your filters.</p>
                    </div>
                ) : (
                    <div className="bd-chart-grid">
                        <div className="bd-chart-card">
                            <div className="bd-chart-card-header">
                                <span className="bd-chart-card-title">Violations by Type</span>
                                <span className="bd-chart-card-count">{chartRows.length} total</span>
                            </div>
                            <div className="bd-chart-body">
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={byTypeData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                                            {byTypeData.map(entry => (
                                                <Cell key={entry.key} fill={TYPE_COLORS[entry.key]} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...chartTooltipProps} />
                                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bd-chart-card">
                            <div className="bd-chart-card-header">
                                <span className="bd-chart-card-title">Violations by Severity</span>
                                <span className="bd-chart-card-count">{chartRows.length} total</span>
                            </div>
                            <div className="bd-chart-body">
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={bySeverityData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                                            {bySeverityData.map(entry => (
                                                <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name]} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...chartTooltipProps} />
                                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bd-chart-card">
                            <div className="bd-chart-card-header">
                                <span className="bd-chart-card-title">Top Departments</span>
                                <span className="bd-chart-card-count">{byDepartmentData.length} dept(s)</span>
                            </div>
                            <div className="bd-chart-body">
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={byDepartmentData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={135}
                                            tick={{ fontSize: 11 }}
                                            tickFormatter={(val: string) => val.length > 20 ? val.slice(0, 18) + '…' : val}
                                        />
                                        <Tooltip {...chartTooltipProps} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                                        <Bar dataKey="value" name="Violations" fill="#00A99D" radius={[0, 4, 4, 0]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bd-chart-card">
                            <div className="bd-chart-card-header">
                                <span className="bd-chart-card-title">Daily Trend — Last 14 Days</span>
                                <span className="bd-chart-card-count">by type</span>
                            </div>
                            <div className="bd-chart-body">
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={trendData} margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                                        <Tooltip {...chartTooltipProps} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                                        <Bar dataKey="SLA Breach" stackId="trend" fill={TYPE_COLORS.sla_breach} barSize={12} />
                                        <Bar dataKey="Workload Overload" stackId="trend" fill={TYPE_COLORS.workload_overload} barSize={12} />
                                        <Bar dataKey="Biomarker Flag" stackId="trend" fill={TYPE_COLORS.biomarker_flag} barSize={12} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {workloadData.length > 0 && (
                            <div className="bd-chart-card">
                                <div className="bd-chart-card-header">
                                    <span className="bd-chart-card-title">Workload vs Threshold</span>
                                    <span className="bd-chart-card-count">{workloadData.length} employee(s)</span>
                                </div>
                                <div className="bd-chart-body">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <BarChart data={workloadData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                width={125}
                                                tick={{ fontSize: 11 }}
                                                tickFormatter={(val: string) => val.length > 18 ? val.slice(0, 16) + '…' : val}
                                            />
                                            <Tooltip {...chartTooltipProps} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                                            <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                                            <Bar dataKey="current" name="Current" fill="#ea580c" radius={[0, 4, 4, 0]} barSize={8} />
                                            <Bar dataKey="threshold" name="Threshold" fill="#9ca3af" radius={[0, 4, 4, 0]} barSize={8} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Violations DataTable ── */}
            <DataTable<BiomarkerViolation>
                title={`Detected Violations (${safeScanMeta.batchId})`}
                columns={columns}
                data={filteredViolations}
                tabs={tabs}
                activeTab={activeFilter}
                onTabChange={key => setActiveFilter(key as FilterTab)}
                searchQuery={searchQuery}
                onSearchChange={val => { setSearchQuery(val); setPage(1); }}
                searchPlaceholder="Search by name, ID, department, team, or violation…"
                filterElements={filterElements}
                emptyMessage="No violations match your filter."
                emptyIcon={<CheckCircle2 size={24} />}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
                totalRecords={totalCount}
                pageSize={10}
            />

            {/* ── Biomarker Flags Summary ── */}
            <div className="bd-section">
                <div className="bd-section-header">
                    <h4>Biomarker Flag Summary — {safeScanMeta.batchId}</h4>
                </div>
                <div className="bd-flags-summary">
                    <StatusCard
                        variant="danger"
                        label="Red Flags"
                        value={summary.redFlags}
                        icon={<XCircle size={18} />}
                        subtext="Immediate action required — compound violations"
                    />
                    <StatusCard
                        variant="warning"
                        label="Amber Flags"
                        value={summary.amberFlags}
                        icon={<AlertTriangle size={18} />}
                        subtext="Requires monitoring — recurring or trending patterns"
                    />
                    <StatusCard
                        variant="success"
                        label="Green Flags"
                        value={summary.greenFlags}
                        icon={<CheckCircle2 size={18} />}
                        subtext="Positive resolution — conditions normalized"
                    />
                </div>
            </div>

            {/* ── Compliance Note ── */}
            <div className="bd-compliance-note">
                <Shield size={14} />
                <span>
                    Automated scan runs daily at 12:00 AM. Dashboard reflects the latest completed scan ({safeScanMeta.batchId}).
                    Viewing biomarker alerts does not modify any task or audit log records.
                    Dashboard refreshes automatically every 30 seconds.
                </span>
            </div>
        </div>
    );
}
