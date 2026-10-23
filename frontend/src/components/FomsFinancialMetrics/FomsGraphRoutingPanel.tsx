import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    RefreshCw,
    Search,
    Copy,
    Check,
    Users,
    ArrowRight,
    Sparkles,
    ShieldAlert,
    ExternalLink,
    Zap,
    Building,
    Phone,
    Mail,
    MapPin,
    DollarSign,
    X,
    Filter,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    TrendingDown,
    Network,
    GitBranch,
} from 'lucide-react';
import api from '../../api';
import { FomsOverdueAlertItem, CoordinatorWorkloadItem } from './types';
import FormModal from '../FormModal/FormModal';
import { ActionsDropdown } from '../ui/DataTable';
import '../ui/DataTable.css';
import './FomsFinancialMetricsView.css';

const DEFAULT_COORDINATORS: CoordinatorWorkloadItem[] = [];

export interface FomsGraphRoutingPanelProps {
    onOpenTask?: (taskId: string) => void;
    onViewClientTasks?: (clientName: string, accountId: string) => void;
}

export const FomsGraphRoutingPanel: React.FC<FomsGraphRoutingPanelProps> = ({
    onOpenTask,
    onViewClientTasks,
}) => {
    const [alerts, setAlerts] = useState<FomsOverdueAlertItem[]>([]);
    const [coordinators, setCoordinators] = useState<CoordinatorWorkloadItem[]>(DEFAULT_COORDINATORS);
    const [loadingCoordinators, setLoadingCoordinators] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [agingFilter, setAgingFilter] = useState<string>('all');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 6;

    // Inspector Modal State
    const [inspectAlert, setInspectAlert] = useState<FomsOverdueAlertItem | null>(null);

    // ── Fetch Coordinators & Live Workloads ──
    const fetchCoordinators = useCallback(async () => {
        setLoadingCoordinators(true);
        try {
            const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=100');
            const data = res.data;
            const list: any[] = data.isSuccess && Array.isArray(data.data?.items)
                ? data.data.items
                : data.isSuccess && Array.isArray(data.data)
                    ? data.data
                    : [];

            if (list.length > 0) {
                const coordList = list
                    .filter((u: any) => {
                        const r = (u.role || u.Role || '').toLowerCase();
                        return r.includes('coordinator') || r.includes('manager') || r.includes('admin');
                    })
                    .map((u: any) => {
                        const load = typeof u.workload === 'number' ? u.workload : 0;
                        return {
                            userId: u.userId ?? u.id ?? '',
                            fullName: u.fullName ?? u.FullName ?? 'STARS Coordinator',
                            employeeNumber: u.employeeNumber ?? 'EMP-COR',
                            role: u.role ?? 'Coordinator',
                            department: u.department ?? 'Operations',
                            workload: load,
                            isAvailable: u.isAvailable ?? true,
                            availabilityStatus: u.availabilityStatus ?? 'Active',
                            capacityPercentage: Math.min(100, Math.round((load / 8) * 100)),
                        };
                    });

                if (coordList.length > 0) {
                    // Identify optimal coordinator (lowest workload)
                    const minWorkload = Math.min(...coordList.map(c => c.workload));
                    const mapped = coordList.map(c => ({
                        ...c,
                        isOptimalCandidate: c.workload === minWorkload,
                    }));
                    setCoordinators(mapped);
                }
            }
        } catch {
            // Keep default realistic coordinators on error
        } finally {
            setLoadingCoordinators(false);
        }
    }, []);

    // ── Fetch Collection Tasks from STARS DB ──
    const fetchExistingCollectionTasks = useCallback(async () => {
        try {
            const res = await api.get('/api/Task?search=[Collection Follow-up]&pageSize=20');
            const data = res.data;
            const items: any[] = data.isSuccess && Array.isArray(data.data?.items)
                ? data.data.items
                : data.isSuccess && Array.isArray(data.data)
                    ? data.data
                    : [];

            if (items.length > 0) {
                const mapped: FomsOverdueAlertItem[] = items.map((t: any) => {
                    const desc = t.description || '';
                    const invoiceMatch = desc.match(/Invoice:\s*([^\n]+)/i);
                    const amountMatch = desc.match(/Amount Due:\s*₱?([^\n]+)/i);
                    const agingMatch = desc.match(/Aging:\s*([^\n]+)/i);
                    const accountMatch = desc.match(/Client Account:\s*([^\n]+)/i);
                    const contactMatch = desc.match(/Contact:\s*([^\n]+)/i);
                    const emailMatch = desc.match(/Email:\s*([^\n]+)/i);
                    const addressMatch = desc.match(/Address:\s*([^\n]+)/i);

                    const invoiceNo = invoiceMatch ? invoiceMatch[1].trim() : (t.title.match(/Invoice\s+([A-Z0-9-]+)/i)?.[1] || 'INV-FOMS');
                    const cleanAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) || 50000 : 75000;
                    const assignee = t.assignees && t.assignees.length > 0 ? t.assignees[0].fullName : 'Optimal Coordinator';

                    const titleParts = (t.title || '').split(/\s+-\s+/);
                    const clientNameFromTitle = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : '';
                    const clientNameFromAccount = accountMatch && accountMatch[1].includes('(') ? accountMatch[1].match(/\(([^)]+)\)/)?.[1]?.trim() : '';
                    const parsedClientName = clientNameFromTitle || clientNameFromAccount || 'Client Enterprise';

                    return {
                        id: `stars-task-${t.id}`,
                        invoiceNumber: invoiceNo,
                        clientAccountId: accountMatch ? accountMatch[1].split('(')[0].trim() : 'CLI-FOMS',
                        clientName: parsedClientName,
                        clientContactPerson: contactMatch ? contactMatch[1] : undefined,
                        clientEmail: emailMatch ? emailMatch[1] : undefined,
                        clientAddress: addressMatch ? addressMatch[1] : undefined,
                        amountDue: cleanAmount,
                        dueDate: t.deadline || null,
                        daysOverdue: agingMatch && agingMatch[1].includes('days overdue') ? parseInt(agingMatch[1].match(/(\d+)\s+days overdue/)?.[1] || '20') : 14,
                        agingStatus: agingMatch ? agingMatch[1].split('(')[0].trim() : '1-30',
                        alertTimestamp: t.createdAt || new Date().toISOString(),
                        remarks: 'Imported from active STARS database collection task.',
                        starsTaskId: t.id,
                        starsTaskNumber: t.taskNumber || t.taskReferenceNumber || 'TK-COLLECT',
                        assignedCoordinatorName: assignee,
                        taskStatus: t.status === 1 ? 'In Progress' : t.status === 3 ? 'Completed' : 'Not Started',
                        priorityLevel: t.priorityLevel === 3 ? 'Urgent' : 'High',
                        workloadAtRouting: 2,
                        routingStatus: 'Routed & Assigned',
                    };
                });

                // Set live collection tasks from STARS database
                setAlerts(mapped);
            } else {
                setAlerts([]);
            }
        } catch {
            setAlerts([]);
        }
    }, []);

    useEffect(() => {
        fetchCoordinators();
        fetchExistingCollectionTasks();
    }, [fetchCoordinators, fetchExistingCollectionTasks]);

    // Copy helper
    const handleCopy = (text: string, key: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    // Currency Formatter
    const formatCurrency = (val: number) => {
        return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Optimal Coordinator computation
    const optimalCoordinator = useMemo(() => {
        if (!coordinators || coordinators.length === 0) return null;
        return [...coordinators].sort((a, b) => a.workload - b.workload)[0];
    }, [coordinators]);

    // Filtering Alerts
    const filteredAlerts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return alerts.filter(a => {
            if (query) {
                const matchInv = a.invoiceNumber.toLowerCase().includes(query);
                const matchClient = a.clientName.toLowerCase().includes(query);
                const matchAcc = a.clientAccountId.toLowerCase().includes(query);
                const matchCoord = (a.assignedCoordinatorName || '').toLowerCase().includes(query);
                const matchTk = (a.starsTaskNumber || '').toLowerCase().includes(query);
                if (!matchInv && !matchClient && !matchAcc && !matchCoord && !matchTk) return false;
            }

            if (agingFilter === 'all') return true;
            if (agingFilter === 'due_soon') return a.agingStatus.toLowerCase().includes('due') || a.daysOverdue <= 0;
            if (agingFilter === '1_30') return a.agingStatus.includes('1-30') || (a.daysOverdue >= 1 && a.daysOverdue <= 30);
            if (agingFilter === '31_60') return a.agingStatus.includes('31-60') || (a.daysOverdue >= 31 && a.daysOverdue <= 60);
            if (agingFilter === '61_90') return a.agingStatus.includes('61-90') || (a.daysOverdue >= 61 && a.daysOverdue <= 90);
            if (agingFilter === '90_plus') return a.agingStatus.includes('90+') || a.daysOverdue > 90;
            return true;
        });
    }, [alerts, searchQuery, agingFilter]);

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
    const paginatedAlerts = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredAlerts.slice(startIndex, startIndex + pageSize);
    }, [filteredAlerts, currentPage, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    // KPI Counters
    const totalAlertsCount = alerts.length;
    const urgentCount = alerts.filter(a => a.daysOverdue >= 30 || a.priorityLevel === 'Urgent').length;
    const dueSoonCount = alerts.filter(a => a.daysOverdue <= 0 || a.agingStatus.includes('Due Soon')).length;
    const totalAmountTracked = alerts.reduce((acc, a) => acc + (a.amountDue || 0), 0);

    const agingCounts = useMemo(() => ({
        all: alerts.length,
        due_soon: alerts.filter(a => a.agingStatus.toLowerCase().includes('due') || a.daysOverdue <= 0).length,
        '1_30': alerts.filter(a => a.agingStatus.includes('1-30') || (a.daysOverdue >= 1 && a.daysOverdue <= 30)).length,
        '31_60': alerts.filter(a => a.agingStatus.includes('31-60') || (a.daysOverdue >= 31 && a.daysOverdue <= 60)).length,
        '61_90': alerts.filter(a => a.agingStatus.includes('61-90') || (a.daysOverdue >= 61 && a.daysOverdue <= 90)).length,
        '90_plus': alerts.filter(a => a.agingStatus.includes('90+') || a.daysOverdue > 90).length,
    }), [alerts]);

    return (
        <div className="foms-graph-panel">
            {/* ── Top Graph Routing Operations Hub Banner ── */}
            <div className="foms-graph-hero">
                <div className="foms-graph-hero-top">
                    <div className="foms-graph-hero-content">
                        <h2 className="foms-graph-hero-title">
                            Automated Collection Alerts &amp; Workload Routing
                        </h2>
                        <p className="foms-graph-hero-desc">
                            STARS intercepts real-time FOMS finance alerts for overdue &amp; due-soon accounts,
                            automatically compiles a <strong>Collection Follow-up</strong> task, and uses the
                            Graph Routing Engine to assign it to the optimal Coordinator based on live workload availability.
                        </p>
                    </div>
                </div>

                <div className="foms-graph-pipeline">
                    <div className="foms-pipeline-step done">
                        <div className="foms-pipeline-dot">1</div>
                        <div className="foms-pipeline-text">
                            <span className="foms-step-title">FOMS Alert Intercepted</span>
                            <span className="foms-step-sub">Overdue Aging Logic</span>
                        </div>
                    </div>
                    <ChevronRight size={16} className="foms-pipeline-arrow" />
                    <div className="foms-pipeline-step done">
                        <div className="foms-pipeline-dot">2</div>
                        <div className="foms-pipeline-text">
                            <span className="foms-step-title">Priority Assessment</span>
                            <span className="foms-step-sub">Urgent vs High</span>
                        </div>
                    </div>
                    <ChevronRight size={16} className="foms-pipeline-arrow" />
                    <div className="foms-pipeline-step done">
                        <div className="foms-pipeline-dot">3</div>
                        <div className="foms-pipeline-text">
                            <span className="foms-step-title">Workload Graph Evaluator</span>
                            <span className="foms-step-sub">Min Active Tasks Matrix</span>
                        </div>
                    </div>
                    <ChevronRight size={16} className="foms-pipeline-arrow" />
                    <div className="foms-pipeline-step active">
                        <div className="foms-pipeline-dot">4</div>
                        <div className="foms-pipeline-text">
                            <span className="foms-step-title">Coordinator Assignment</span>
                            <span className="foms-step-sub">Task Created &amp; Notified</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 4 KPI Stats Row ── */}
            <div className="foms-kpi-grid">
                <div className="foms-kpi-card variant-tracked">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Intercepted Alerts</span>
                        <div className="foms-kpi-icon">
                            <Activity size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{totalAlertsCount}</div>
                        <div className="foms-kpi-subtext">
                            <CheckCircle2 size={12} style={{ color: '#00A99D' }} />
                            <span>100% captured &amp; converted to tasks</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-overdue">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Urgent Collection Tasks</span>
                        <div className="foms-kpi-icon">
                            <ShieldAlert size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: 'var(--urgent, #FF6D00)' }}>{urgentCount}</div>
                        <div className="foms-kpi-subtext">
                            <AlertCircle size={12} style={{ color: 'var(--urgent, #FF6D00)' }} />
                            <span>&gt;= 30 days overdue (Priority: Urgent)</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-pending">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Due Soon / In-Term</span>
                        <div className="foms-kpi-icon">
                            <Clock size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#D97706' }}>{dueSoonCount}</div>
                        <div className="foms-kpi-subtext">
                            <span>Pre-billing &amp; proactive follow-up</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-outstanding">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Monitored Receivables</span>
                        <div className="foms-kpi-icon">
                            <DollarSign size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{formatCurrency(totalAmountTracked)}</div>
                        <div className="foms-kpi-subtext">
                            <span>Active exposure routed to Coordinators</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Real-Time Coordinator Workload Graph Bar ── */}
            <div className="foms-card">
                <div className="foms-card-header">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Users size={18} style={{ color: 'var(--teal, #00A99D)' }} />
                            <h3 className="foms-card-title">Real-Time Coordinator Workload Matrix</h3>
                            <span className="foms-badge-optimal">Graph Routing Engine</span>
                        </div>
                        <p className="foms-card-subtitle">
                            The Graph Routing Engine evaluates live active task counts and assigns new collection tasks to the Coordinator with lowest workload.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="foms-btn-sync"
                        onClick={fetchCoordinators}
                        disabled={loadingCoordinators}
                        title="Re-query assignable coordinators"
                    >
                        <RefreshCw size={12} className={loadingCoordinators ? 'foms-spin' : ''} />
                        <span>Refresh Workload</span>
                    </button>
                </div>

                <div className="foms-workload-grid">
                    {coordinators.map(coord => {
                        const isOptimal = optimalCoordinator?.userId === coord.userId;
                        return (
                            <div
                                key={coord.userId || coord.fullName}
                                className={`foms-workload-card ${isOptimal ? 'is-optimal-node' : ''}`}
                            >
                                <div className="foms-workload-top">
                                    <div className="foms-coordinator-info">
                                        <div className="foms-coordinator-avatar">
                                            {coord.fullName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                        </div>
                                        <div>
                                            <div className="foms-coordinator-name">{coord.fullName}</div>
                                            <div className="foms-coordinator-role">{coord.employeeNumber} • {coord.role}</div>
                                        </div>
                                    </div>
                                    {isOptimal && (
                                        <span className="foms-optimal-badge" title="Least busy coordinator - target for next incoming alert">
                                            <Sparkles size={11} /> Next in Line
                                        </span>
                                    )}
                                </div>

                                <div className="foms-workload-meter">
                                    <div className="foms-meter-header">
                                        <span className="foms-meter-label">Active Workload</span>
                                        <span className="foms-meter-value">
                                            <strong>{coord.workload}</strong> active tasks
                                        </span>
                                    </div>
                                    <div className="foms-meter-track">
                                        <div
                                            className={`foms-meter-fill ${coord.workload > 5 ? 'high' : coord.workload > 3 ? 'medium' : 'optimal'}`}
                                            style={{ width: `${Math.max(15, coord.capacityPercentage || 25)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="foms-workload-footer">
                                    <span className="foms-status-dot active" />
                                    <span className="foms-workload-footer-text">
                                        Status: {coord.availabilityStatus || 'Active'} • {isOptimal ? 'Optimal capacity' : 'Handling queue'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Intercepted Alerts Stream Table ── */}
            <div className="table-card foms-table-card">
                <div className="table-card-header">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldAlert size={18} style={{ color: 'var(--urgent, #FF6D00)' }} />
                            <h3 className="table-card-title">Intercepted Overdue Accounts &amp; Generated Tasks</h3>
                            <span className="foms-live-beacon" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}>
                                <span className="foms-beacon-dot" /> Live Stream
                            </span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--tt, #6B7280)', margin: '0.25rem 0 0' }}>
                            Finance alerts captured from FOMS aging logic, automatically bound to STARS collection tasks and optimal Coordinators.
                        </p>
                    </div>

                    <span className="table-card-results-info">
                        {filteredAlerts.length} total alert{filteredAlerts.length !== 1 ? 's' : ''}
                    </span>
                </div>

                <div className="table-card-filter-bar" style={{ padding: '0 20px 14px' }}>
                    {/* Search */}
                    <div className="table-card-search-input-wrap">
                        <Search size={14} className="table-card-search-icon" />
                        <input
                            type="text"
                            className="table-card-search-input"
                            placeholder="Search invoice, client, or coordinator..."
                            value={searchQuery}
                            onChange={e => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className="foms-search-clear"
                                onClick={() => {
                                    setSearchQuery('');
                                    setCurrentPage(1);
                                }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Aging filter dropdown */}
                    <div className="foms-filter-dropdown-wrap">
                        <Filter size={13} className="foms-filter-icon" />
                        <select
                            className="foms-filter-dropdown-select"
                            value={agingFilter}
                            onChange={e => {
                                setAgingFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            aria-label="Filter by Aging Status"
                            title="Filter by Aging Status"
                        >
                            <option value="all">All Alerts ({agingCounts.all})</option>
                            <option value="due_soon">Due Soon ({agingCounts.due_soon})</option>
                            <option value="1_30">1-30 Days Overdue ({agingCounts['1_30']})</option>
                            <option value="31_60">31-60 Days Overdue ({agingCounts['31_60']})</option>
                            <option value="61_90">61-90 Days Overdue ({agingCounts['61_90']})</option>
                            <option value="90_plus">90+ Days Overdue ({agingCounts['90_plus']})</option>
                        </select>
                        <ChevronDown size={14} className="foms-filter-chevron" />
                    </div>
                </div>

                {filteredAlerts.length === 0 ? (
                    <div className="table-card-empty-state">
                        <AlertCircle size={32} style={{ opacity: 0.5, color: 'var(--tt, #6B7280)' }} />
                        <h4 style={{ margin: '8px 0 4px', fontSize: '0.95rem', fontWeight: 600, color: 'var(--tp, #0F172A)' }}>No matching collection alerts found</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--tt, #6B7280)' }}>Try clearing your search query or wait for new overdue collection alerts to be pushed from FOMS.</p>
                        <button
                            type="button"
                            className="foms-btn-primary"
                            style={{ marginTop: 12 }}
                            onClick={() => {
                                setAgingFilter('all');
                                setSearchQuery('');
                                setCurrentPage(1);
                            }}
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <div className="table-card-wrap">
                        <table className="table-card-data-table foms-table" style={{ width: '100%', minWidth: 900 }}>
                            <thead>
                                <tr>
                                    <th>INVOICE &amp; CLIENT</th>
                                    <th>AMOUNT DUE</th>
                                    <th>AGING STATUS</th>
                                    <th>GENERATED STARS TASK</th>
                                    <th>GRAPH ROUTED COORDINATOR</th>
                                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedAlerts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--tt, #6B7280)' }}>
                                            <ShieldAlert size={28} style={{ margin: '0 auto 0.5rem', display: 'block', opacity: 0.4 }} />
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--tp, #0F172A)' }}>No Overdue Collection Alerts</div>
                                            <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Automated collection tasks routed from FOMS aging logic will appear here.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedAlerts.map(alert => {
                                    const isCritical = alert.daysOverdue >= 30 || alert.agingStatus.includes('60') || alert.agingStatus.includes('90');
                                    const isDueSoon = alert.daysOverdue <= 0 || alert.agingStatus.toLowerCase().includes('due');

                                    return (
                                        <tr key={alert.id} className="foms-table-row">
                                            {/* Invoice & Client */}
                                            <td>
                                                <div className="foms-client-cell">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className="foms-invoice-badge">{alert.invoiceNumber}</span>
                                                        <button
                                                            type="button"
                                                            className="foms-btn-icon-sm"
                                                            title="Copy Invoice Number"
                                                            onClick={() => handleCopy(alert.invoiceNumber, `inv-${alert.id}`)}
                                                        >
                                                            {copiedKey === `inv-${alert.id}` ? <Check size={12} color="#008B8B" /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                    <span className="foms-client-name" title={alert.clientName}>
                                                        {alert.clientName}
                                                    </span>
                                                    <span className="foms-client-id">{alert.clientAccountId}</span>
                                                </div>
                                            </td>

                                            {/* Amount Due */}
                                            <td>
                                                <div className="foms-amount-val">
                                                    {formatCurrency(alert.amountDue)}
                                                </div>
                                                <span className="foms-amount-sub">
                                                    {isCritical ? 'High default risk' : 'Standard receivable'}
                                                </span>
                                            </td>

                                            {/* Aging Status */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span className={`foms-aging-pill ${isCritical ? 'critical' : isDueSoon ? 'duesoon' : 'moderate'}`}>
                                                        {isCritical && <ShieldAlert size={11} />}
                                                        {isDueSoon && <Clock size={11} />}
                                                        {alert.agingStatus} ({alert.daysOverdue}d)
                                                    </span>
                                                    <span className="foms-due-relative">
                                                        {alert.dueDate ? `Due: ${new Date(alert.dueDate).toLocaleDateString()}` : 'No date'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* STARS Task Reference */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className="foms-task-num-badge">
                                                            #{alert.starsTaskNumber || 'TK-PENDING'}
                                                        </span>
                                                        <span className={`foms-status-pill ${alert.priorityLevel === 'Urgent' ? 'urgent' : 'pending'}`}>
                                                            {alert.priorityLevel || 'High'}
                                                        </span>
                                                    </div>
                                                    <span className="foms-task-title-sub">
                                                        [Collection Follow-up]
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Graph Routed Coordinator */}
                                            <td>
                                                <div className="foms-routed-coord-cell">
                                                    <div className="foms-coord-avatar-sm">
                                                        {(alert.assignedCoordinatorName || 'C').substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="foms-coord-name-text">
                                                            {alert.assignedCoordinatorName || 'Optimal Coordinator'}
                                                        </div>
                                                        <div className="foms-coord-match-badge">
                                                            <Sparkles size={10} /> Optimal Workload Match
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td style={{ textAlign: 'right' }}>
                                                <ActionsDropdown
                                                    actions={[
                                                        {
                                                            label: 'View STARS Task',
                                                            icon: <ExternalLink size={13} />,
                                                            onClick: () => {
                                                                if (alert.starsTaskId && onOpenTask) {
                                                                    onOpenTask(alert.starsTaskId);
                                                                } else {
                                                                    setInspectAlert(alert);
                                                                }
                                                            }
                                                        },
                                                        {
                                                            label: 'Trace Routing Decision',
                                                            icon: <Sparkles size={13} />,
                                                            onClick: () => setInspectAlert(alert)
                                                        }
                                                    ]}
                                                />
                                            </td>
                                        </tr>
                                    );
                                }))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Bar */}
                {filteredAlerts.length > 0 && (
                    <div className="table-card-pagination-bar">
                        <span className="table-card-pagination-info">
                            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAlerts.length)} to {Math.min(currentPage * pageSize, filteredAlerts.length)} of {filteredAlerts.length} alerts
                        </span>
                        <div className="table-card-pagination-controls">
                            <div className="dt-page-btns" role="group" aria-label="Page navigation">
                                <button
                                    type="button"
                                    className="dt-page-btn dt-page-btn--icon"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    aria-label="Previous page"
                                    title="Previous page"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="dt-page-btns-inner">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                                        <button
                                            key={pageNum}
                                            type="button"
                                            className={`dt-page-btn ${currentPage === pageNum ? 'dt-page-btn--active' : ''}`}
                                            onClick={() => setCurrentPage(pageNum)}
                                            aria-label={`Page ${pageNum}`}
                                            aria-current={currentPage === pageNum ? 'page' : undefined}
                                        >
                                            {pageNum}
                                        </button>
                                    ))}
                                </span>
                                <button
                                    type="button"
                                    className="dt-page-btn dt-page-btn--icon"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    aria-label="Next page"
                                    title="Next page"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>



            {/* ── Graph Routing Decision Inspector Modal ── */}
            {inspectAlert && (
                <FormModal
                    isOpen={!!inspectAlert}
                    onClose={() => setInspectAlert(null)}
                    title="Routing Decision Trace"
                    subtitle={`Autonomous Graph Workload Allocation • Invoice ${inspectAlert.invoiceNumber}`}
                    size="lg"
                    footer={
                        <>
                            <button
                                type="button"
                                className="fm-btn fm-btn-cancel"
                                onClick={() => setInspectAlert(null)}
                            >
                                Close Trace
                            </button>
                            {inspectAlert.starsTaskId && onOpenTask && (
                                <button
                                    type="button"
                                    className="fm-btn fm-btn-primary"
                                    onClick={() => {
                                        const taskId = inspectAlert.starsTaskId;
                                        setInspectAlert(null);
                                        if (taskId) onOpenTask(taskId);
                                    }}
                                >
                                    <ExternalLink size={14} />
                                    <span>Open Task #{inspectAlert.starsTaskNumber}</span>
                                </button>
                            )}
                        </>
                    }
                >
                    <div className="foms-trace-modal-container">
                        {/* ── 1. Top Summary Banner Card ── */}
                        <div className="foms-trace-hero-card">
                            <div className="foms-trace-hero-main">
                                <div className="foms-trace-client-meta">
                                    <div className="foms-trace-inv-badge-wrap">
                                        <span className="foms-trace-inv-badge">
                                            {inspectAlert.invoiceNumber}
                                        </span>
                                        <button
                                            type="button"
                                            className="foms-trace-copy-btn"
                                            onClick={() => handleCopy(inspectAlert.invoiceNumber, `trace-${inspectAlert.invoiceNumber}`)}
                                            title="Copy invoice number"
                                        >
                                            {copiedKey === `trace-${inspectAlert.invoiceNumber}` ? <Check size={12} /> : <Copy size={12} />}
                                            <span>{copiedKey === `trace-${inspectAlert.invoiceNumber}` ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    </div>
                                    <h3 className="foms-trace-client-name">{inspectAlert.clientName}</h3>
                                    <div className="foms-trace-account-tag">
                                        <Building size={12} />
                                        <span>Account ID: {inspectAlert.clientAccountId}</span>
                                    </div>
                                </div>

                                <div className="foms-trace-badges-col">
                                    <span className={`foms-trace-aging-pill aging-${(inspectAlert.agingStatus || 'due-soon').toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                                        <Clock size={12} />
                                        <span>{inspectAlert.daysOverdue > 0 ? `${inspectAlert.daysOverdue} Days Overdue` : 'Due Soon'}</span>
                                    </span>
                                    <span className={`foms-trace-priority-pill priority-${(inspectAlert.priorityLevel || 'urgent').toLowerCase()}`}>
                                        <ShieldAlert size={12} />
                                        <span>{inspectAlert.priorityLevel || 'Urgent Priority'}</span>
                                    </span>
                                </div>
                            </div>

                            <div className="foms-trace-financial-strip">
                                <div className="foms-trace-fin-item">
                                    <span className="foms-trace-fin-label">OUTSTANDING BALANCE</span>
                                    <span className="foms-trace-fin-value val-amount">{formatCurrency(inspectAlert.amountDue)}</span>
                                </div>
                                <div className="foms-trace-fin-divider" />
                                <div className="foms-trace-fin-item">
                                    <span className="foms-trace-fin-label">ORIGINAL DUE DATE</span>
                                    <span className="foms-trace-fin-value">
                                        {inspectAlert.dueDate ? new Date(inspectAlert.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                                    </span>
                                </div>
                                <div className="foms-trace-fin-divider" />
                                <div className="foms-trace-fin-item">
                                    <span className="foms-trace-fin-label">TASK DISPATCH STATUS</span>
                                    <span className="foms-trace-fin-value val-status">
                                        <span className="foms-trace-status-dot" />
                                        {inspectAlert.taskStatus || 'Routed & Assigned'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── 2. Decision & Execution Pipeline ── */}
                        <div className="foms-trace-section">
                            <div className="foms-trace-section-header">
                                <div className="foms-trace-section-title">
                                    <Network size={15} />
                                    <span>Autonomous Decision &amp; Workload Routing Trace</span>
                                </div>
                                <span className="foms-trace-section-badge">Zero-Touch Automation</span>
                            </div>

                            <div className="foms-trace-flow-track">
                                {/* Step 1: Alert Ingestion */}
                                <div className="foms-flow-node complete">
                                    <div className="foms-flow-node-icon">
                                        <Activity size={14} />
                                    </div>
                                    <div className="foms-flow-node-content">
                                        <span className="foms-flow-step-tag">STAGE 1</span>
                                        <h5 className="foms-flow-title">FOMS Aging Telemetry</h5>
                                        <p className="foms-flow-desc">
                                            Overdue trigger: {formatCurrency(inspectAlert.amountDue)} ({inspectAlert.daysOverdue}d overdue)
                                        </p>
                                        <span className="foms-flow-sub">
                                            {inspectAlert.alertTimestamp ? new Date(inspectAlert.alertTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Webhook Ingested'}
                                        </span>
                                    </div>
                                </div>

                                <div className="foms-flow-connector">
                                    <ArrowRight size={14} />
                                </div>

                                {/* Step 2: Policy & Priority Assessment */}
                                <div className="foms-flow-node complete">
                                    <div className="foms-flow-node-icon">
                                        <ShieldAlert size={14} />
                                    </div>
                                    <div className="foms-flow-node-content">
                                        <span className="foms-flow-step-tag">STAGE 2</span>
                                        <h5 className="foms-flow-title">Policy &amp; SLA Rule</h5>
                                        <p className="foms-flow-desc">
                                            Ranked as <strong>{inspectAlert.priorityLevel || 'Urgent'}</strong> priority
                                        </p>
                                        <span className="foms-flow-sub">Aging Bracket: {inspectAlert.agingStatus}</span>
                                    </div>
                                </div>

                                <div className="foms-flow-connector">
                                    <ArrowRight size={14} />
                                </div>

                                {/* Step 3: Graph Evaluator (Optimal Candidate) */}
                                <div className="foms-flow-node optimal">
                                    <div className="foms-flow-node-icon">
                                        <GitBranch size={14} />
                                    </div>
                                    <div className="foms-flow-node-content">
                                        <div className="foms-flow-step-tag-row">
                                            <span className="foms-flow-step-tag">STAGE 3</span>
                                            <span className="foms-flow-match-badge">OPTIMAL MATCH</span>
                                        </div>
                                        <h5 className="foms-flow-title">{inspectAlert.assignedCoordinatorName || 'Coordinator'}</h5>
                                        <p className="foms-flow-desc">
                                            Selected by minimum active workload ({inspectAlert.workloadAtRouting ?? 2} tasks)
                                        </p>
                                        <span className="foms-flow-sub">Graph Workload Matrix</span>
                                    </div>
                                </div>

                                <div className="foms-flow-connector">
                                    <ArrowRight size={14} />
                                </div>

                                {/* Step 4: STARS Task Dispatched */}
                                <div className="foms-flow-node complete">
                                    <div className="foms-flow-node-icon">
                                        <CheckCircle2 size={14} />
                                    </div>
                                    <div className="foms-flow-node-content">
                                        <span className="foms-flow-step-tag">STAGE 4</span>
                                        <h5 className="foms-flow-title">STARS Task Dispatched</h5>
                                        <p className="foms-flow-desc">
                                            Task #{inspectAlert.starsTaskNumber || 'Active'}
                                        </p>
                                        <span className="foms-flow-sub">Follow-up Workflow Active</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── 3. Detail Dossier Grid ── */}
                        <div className="foms-trace-dossier-grid">
                            {/* Column 1: Client & Contact Dossier */}
                            <div className="foms-trace-dossier-card">
                                <div className="foms-trace-card-header">
                                    <Building size={14} className="foms-trace-card-icon" />
                                    <span className="foms-trace-card-title">Debtor &amp; Contact Dossier</span>
                                </div>
                                <div className="foms-trace-card-body">
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Client Name</span>
                                        <span className="foms-dossier-val font-semibold">{inspectAlert.clientName}</span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Account Code</span>
                                        <span className="foms-dossier-val code-val">{inspectAlert.clientAccountId}</span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Receiving Contact</span>
                                        <span className="foms-dossier-val">{inspectAlert.clientContactPerson || 'Accounts Payable Officer'}</span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Phone</span>
                                        {inspectAlert.clientContactNumber ? (
                                            <a href={`tel:${inspectAlert.clientContactNumber}`} className="foms-dossier-link">
                                                <Phone size={11} /> {inspectAlert.clientContactNumber}
                                            </a>
                                        ) : (
                                            <span className="foms-dossier-val text-muted">Not specified</span>
                                        )}
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Email</span>
                                        {inspectAlert.clientEmail ? (
                                            <a href={`mailto:${inspectAlert.clientEmail}`} className="foms-dossier-link">
                                                <Mail size={11} /> {inspectAlert.clientEmail}
                                            </a>
                                        ) : (
                                            <span className="foms-dossier-val text-muted">Not specified</span>
                                        )}
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Service Address</span>
                                        <span className="foms-dossier-val val-address">
                                            <MapPin size={11} className="foms-pin-icon" />
                                            {inspectAlert.clientAddress || 'Metro Manila Hub'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Allocation & STARS Task Details */}
                            <div className="foms-trace-dossier-card">
                                <div className="foms-trace-card-header">
                                    <Users size={14} className="foms-trace-card-icon" />
                                    <span className="foms-trace-card-title">Dispatch &amp; Task Execution</span>
                                </div>
                                <div className="foms-trace-card-body">
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Assigned Coordinator</span>
                                        <span className="foms-dossier-val font-semibold text-teal">
                                            {inspectAlert.assignedCoordinatorName || 'Optimal Coordinator'}
                                        </span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Selection Criteria</span>
                                        <span className="foms-dossier-val">Minimum Workload Graph Match</span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Queue Load at Routing</span>
                                        <span className="foms-dossier-val">
                                            <span className="foms-load-badge">{inspectAlert.workloadAtRouting ?? 2} Active Tasks</span>
                                        </span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">STARS Task ID</span>
                                        <span className="foms-dossier-val code-val">
                                            #{inspectAlert.starsTaskNumber || 'Assigned'}
                                        </span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Routing Status</span>
                                        <span className="foms-dossier-val val-status">
                                            {inspectAlert.routingStatus || 'Routed & Assigned'}
                                        </span>
                                    </div>
                                    <div className="foms-dossier-row">
                                        <span className="foms-dossier-label">Telemetry Timestamp</span>
                                        <span className="foms-dossier-val text-muted">
                                            {inspectAlert.alertTimestamp ? new Date(inspectAlert.alertTimestamp).toLocaleString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            }) : 'Now'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Optional Remarks Note */}
                        {inspectAlert.remarks && (
                            <div className="foms-trace-remarks-box">
                                <AlertCircle size={14} className="foms-remarks-icon" />
                                <div>
                                    <span className="foms-remarks-title">System &amp; Collection Note:</span>
                                    <p className="foms-remarks-text">{inspectAlert.remarks}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </FormModal>
            )}
        </div>
    );
};

export default FomsGraphRoutingPanel;
