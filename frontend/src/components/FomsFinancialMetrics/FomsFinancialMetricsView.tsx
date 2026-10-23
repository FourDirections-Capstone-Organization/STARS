import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    DollarSign,
    AlertCircle,
    CheckCircle2,
    Clock,
    FileText,
    RefreshCw,
    Search,
    Copy,
    Check,
    TrendingUp,
    Building,
    Eye,
    X,
    Calendar,
    Activity,
    Sparkles,
    ShieldAlert,
    CreditCard,
    ExternalLink,
    Zap,
    FileCheck,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import api from '../../api';
import { FomsDashboardFinancialSummary, FomsClientFinancialSummaryItem, FomsFinancialMetricsViewProps } from './types';
import FomsGraphRoutingPanel from './FomsGraphRoutingPanel';
import FomsEndorsementPanel from './FomsEndorsementPanel';
import FormModal from '../FormModal/FormModal';
import '../ui/DataTable.css';
import './FomsFinancialMetricsView.css';

// Initial empty dataset before live FOMS synchronization
const EMPTY_FINANCIAL_SUMMARY: FomsDashboardFinancialSummary = {
    totalOutstandingBalance: 0,
    totalOverdueBalance: 0,
    totalInvoicesTracked: 0,
    overdueInvoicesCount: 0,
    paidInvoicesCount: 0,
    pendingInvoicesCount: 0,
    lastUpdatedAt: new Date().toISOString(),
    topOutstandingClients: [],
};

export const FomsFinancialMetricsView: React.FC<FomsFinancialMetricsViewProps> = ({
    embedded = false,
    showHeader = true,
    pollingInterval = 30000,
    initialTab = 'balances',
    onViewClientTasks,
    onOpenTask,
}) => {
    const [activeHubTab, setActiveHubTab] = useState<'balances' | 'routing' | 'endorsement'>(initialTab || 'balances');
    const [liveData, setLiveData] = useState<FomsDashboardFinancialSummary | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);

    // Filter and Sort states
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'with_balance' | 'paid' | 'pending'>('all');
    const [sortBy, setSortBy] = useState<'balance_desc' | 'balance_asc' | 'overdue_desc' | 'name_asc' | 'date_asc'>('balance_desc');

    // Pagination state
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 8;

    // UI Interactive States
    const [selectedClient, setSelectedClient] = useState<FomsClientFinancialSummaryItem | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Fetch FOMS dashboard summary from the backend
    const fetchFomsSummary = useCallback(async (silent = false) => {
        if (!silent) setRefreshing(true);
        try {
            const res = await api.get('/api/integration/foms/dashboard-summary');
            const data: FomsDashboardFinancialSummary = res.data?.data || res.data;

            if (data) {
                setLiveData(data);
                setError(null);
                setLastSyncedTime(new Date());
            }
        } catch (err: any) {
            console.warn('[FOMS] Failed to fetch live financial summary from backend:', err?.message || err);
            setError(err?.response?.data?.message || 'Unable to synchronize with FOMS financial service.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial load and periodic silent polling (near-real-time update per FR-038)
    useEffect(() => {
        fetchFomsSummary(false);

        const interval = setInterval(() => {
            fetchFomsSummary(true);
        }, pollingInterval);

        return () => clearInterval(interval);
    }, [fetchFomsSummary, pollingInterval]);

    // Active dataset strictly from live FOMS integration
    const activeSummary = useMemo(() => {
        return liveData || EMPTY_FINANCIAL_SUMMARY;
    }, [liveData]);

    // Copy Account ID Helper
    const handleCopyAccountId = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Currency Formatter
    const formatCurrency = (val: number | undefined | null) => {
        const num = val ?? 0;
        return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Relative Time Helper
    const getRelativeSyncTime = () => {
        if (!lastSyncedTime) return 'Just now';
        const diffSec = Math.floor((Date.now() - lastSyncedTime.getTime()) / 1000);
        if (diffSec < 5) return 'Just now';
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        return `${diffMin}m ago`;
    };

    // Relative Due Date Helper
    const formatDueDateRelative = (dateStr: string | null) => {
        if (!dateStr) return { text: 'Settled', isOverdue: false, isUpcoming: false };
        const due = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return {
                text: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`,
                isOverdue: true,
                isUpcoming: false,
            };
        }
        if (diffDays === 0) {
            return { text: 'Due today', isOverdue: true, isUpcoming: false };
        }
        return {
            text: `Due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`,
            isOverdue: false,
            isUpcoming: true,
        };
    };

    // Filter & Sort clients list
    const filteredClients = useMemo(() => {
        const clients = activeSummary.topOutstandingClients || [];
        const query = searchQuery.trim().toLowerCase();

        return clients
            .filter(client => {
                // Search match
                if (query) {
                    const matchName = client.clientName.toLowerCase().includes(query);
                    const matchId = client.clientAccountId.toLowerCase().includes(query);
                    if (!matchName && !matchId) return false;
                }

                // Status chip filter
                if (statusFilter === 'overdue') {
                    return client.overdueInvoicesCount > 0 || client.latestStatus.toLowerCase() === 'overdue';
                }
                if (statusFilter === 'with_balance') {
                    return client.outstandingBalance > 0;
                }
                if (statusFilter === 'paid') {
                    return client.latestStatus.toLowerCase() === 'paid' || client.outstandingBalance === 0;
                }
                if (statusFilter === 'pending') {
                    const st = client.latestStatus.toLowerCase();
                    return st === 'sent' || st === 'approved' || st === 'draft' || st === 'pending';
                }
                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'balance_desc') return b.outstandingBalance - a.outstandingBalance;
                if (sortBy === 'balance_asc') return a.outstandingBalance - b.outstandingBalance;
                if (sortBy === 'overdue_desc') return b.overdueInvoicesCount - a.overdueInvoicesCount;
                if (sortBy === 'name_asc') return a.clientName.localeCompare(b.clientName);
                if (sortBy === 'date_asc') {
                    if (!a.nextDueDate) return 1;
                    if (!b.nextDueDate) return -1;
                    return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
                }
                return 0;
            });
    }, [activeSummary, searchQuery, statusFilter, sortBy]);

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
    const paginatedClients = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredClients.slice(startIndex, startIndex + pageSize);
    }, [filteredClients, currentPage, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    // Donut Chart Data for Invoice Statuses
    const chartData = useMemo(() => {
        const paid = activeSummary.paidInvoicesCount || 0;
        const overdue = activeSummary.overdueInvoicesCount || 0;
        const pending = activeSummary.pendingInvoicesCount || 0;

        return [
            { name: 'Paid / Settled', value: paid, color: '#059669' },
            { name: 'Pending / In-Term', value: pending, color: '#D97706' },
            { name: 'Overdue Invoices', value: overdue, color: '#DC2626' },
        ].filter(d => d.value > 0);
    }, [activeSummary]);

    // Proportional exposure calculations
    const totalTracked = activeSummary.totalInvoicesTracked || 1;
    const paidPct = Math.round(((activeSummary.paidInvoicesCount || 0) / totalTracked) * 100);
    const overduePct = Math.round(((activeSummary.overdueInvoicesCount || 0) / totalTracked) * 100);
    const pendingPct = Math.max(0, 100 - paidPct - overduePct);

    // Collection rate percentage
    const collectionRate = totalTracked > 0 ? Math.round(((activeSummary.paidInvoicesCount || 0) / totalTracked) * 100) : 0;

    return (
        <div className={`foms-container ${embedded ? 'foms-embedded' : ''}`}>
            {/* ── Live Integration Error Notice (if sync fails) ── */}
            {error && (
                <div
                    className="foms-demo-banner"
                    style={{
                        background: '#fef2f2',
                        borderColor: '#fecaca',
                        color: '#991b1b',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <AlertCircle size={16} color="#dc2626" />
                        <span style={{ fontWeight: 600 }}>Sync Notice:</span>
                        <span>{error}</span>
                    </div>
                    <button
                        type="button"
                        className="foms-btn-action"
                        onClick={() => fetchFomsSummary(false)}
                        style={{ background: '#ffffff', borderColor: '#fca5a5', color: '#991b1b' }}
                    >
                        Retry Sync
                    </button>
                </div>
            )}

            {/* ── Live Stream Header Bar ── */}
            {showHeader && (
                <div className="foms-header-bar">
                    <div className="foms-header-title-group">
                        <div className="foms-title-row">
                            <h2 className="foms-title">FOMS Financial & Invoice Operations</h2>
                            <span className="foms-badge-m2m">
                                <Activity size={12} /> M2M Stream
                            </span>
                        </div>
                        <p className="foms-subtitle">
                            Real-time client balance tracking & invoice settlement visibility from Finance Operations Management System
                        </p>
                    </div>

                    <div className="foms-header-actions">
                        <div className="foms-live-beacon">
                            <span className="foms-beacon-dot" />
                            <span>Live FOMS Feed</span>
                        </div>
                        <span className="foms-sync-time">Synced {getRelativeSyncTime()}</span>
                        <button
                            type="button"
                            className="foms-btn-sync"
                            onClick={() => fetchFomsSummary(false)}
                            disabled={refreshing}
                            title="Manually query FOMS for the latest payment statuses"
                        >
                            <RefreshCw size={13} className={refreshing ? 'foms-spin' : ''} />
                            <span>{refreshing ? 'Syncing...' : 'Sync Now'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Sub-Navigation Tab Bar: Balances vs Collection Graph Routing vs Physical Endorsement ── */}
            <div className="foms-hub-nav">
                <button
                    type="button"
                    className={`foms-hub-tab ${activeHubTab === 'balances' ? 'active' : ''}`}
                    onClick={() => setActiveHubTab('balances')}
                >
                    <Building size={14} />
                    <span>Client Financial Balances</span>
                </button>
                <button
                    type="button"
                    className={`foms-hub-tab ${activeHubTab === 'routing' ? 'active' : ''}`}
                    onClick={() => setActiveHubTab('routing')}
                >
                    <Zap size={14} className="foms-pulse-icon" />
                    <span>Collection Alerts &amp; Graph Routing</span>
                    <span className="foms-tab-badge">Automated</span>
                </button>
                <button
                    type="button"
                    className={`foms-hub-tab ${activeHubTab === 'endorsement' ? 'active' : ''}`}
                    onClick={() => setActiveHubTab('endorsement')}
                >
                    <FileCheck size={14} />
                    <span>Physical Invoice Endorsement</span>
                    <span className="foms-tab-badge badge-endorsement">30-Day Term</span>
                </button>
            </div>

            {activeHubTab === 'endorsement' ? (
                <FomsEndorsementPanel
                    onOpenTask={onOpenTask}
                    onViewClientTasks={onViewClientTasks}
                />
            ) : activeHubTab === 'routing' ? (
                <FomsGraphRoutingPanel
                    onOpenTask={onOpenTask}
                    onViewClientTasks={onViewClientTasks}
                />
            ) : (
                <>
                    {/* ── 6 Status KPI Cards Grid ── */}
                    <div className="foms-kpi-grid foms-balances-kpi-grid">
                {/* 1. Total Outstanding Balance */}
                <div className="foms-kpi-card variant-outstanding">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Total Outstanding</span>
                        <div className="foms-kpi-icon">
                            <DollarSign size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{formatCurrency(activeSummary.totalOutstandingBalance)}</div>
                        <div className="foms-kpi-subtext">
                            <TrendingUp size={12} style={{ color: 'var(--teal, #00A99D)' }} />
                            <span>Active billing across all clients</span>
                        </div>
                    </div>
                </div>

                {/* 2. Total Overdue Balance Exposure */}
                <div className="foms-kpi-card variant-overdue">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Overdue Exposure</span>
                        <div className="foms-kpi-icon">
                            <AlertCircle size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#DC2626' }}>
                            {formatCurrency(activeSummary.totalOverdueBalance)}
                        </div>
                        <div className="foms-kpi-subtext">
                            <ShieldAlert size={12} style={{ color: '#DC2626' }} />
                            <span>Requires collection follow-up</span>
                        </div>
                    </div>
                </div>

                {/* 3. Total Invoices Tracked */}
                <div className="foms-kpi-card variant-tracked">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Tracked Invoices</span>
                        <div className="foms-kpi-icon">
                            <FileText size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{activeSummary.totalInvoicesTracked}</div>
                        <div className="foms-kpi-subtext">
                            <span>Synchronized from FOMS</span>
                        </div>
                    </div>
                </div>

                {/* 4. Overdue Invoices Count */}
                <div className="foms-kpi-card variant-overdue">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Overdue Invoices</span>
                        <div className="foms-kpi-icon">
                            <Clock size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#DC2626' }}>
                            {activeSummary.overdueInvoicesCount}
                        </div>
                        <div className="foms-kpi-subtext">
                            <span style={{ color: '#DC2626', fontWeight: 600 }}>Past payment terms</span>
                        </div>
                    </div>
                </div>

                {/* 5. Paid Invoices Count */}
                <div className="foms-kpi-card variant-paid foms-kpi-card-expanded">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Settled / Paid</span>
                        <div className="foms-kpi-icon">
                            <CheckCircle2 size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#059669' }}>
                            {activeSummary.paidInvoicesCount}
                        </div>
                        <div className="foms-kpi-subtext">
                            <span style={{ color: '#059669', fontWeight: 600 }}>{collectionRate}% settlement rate</span>
                        </div>
                    </div>
                </div>

                {/* 6. Pending Invoices Count */}
                <div className="foms-kpi-card variant-pending foms-kpi-card-expanded">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">In-Term / Pending</span>
                        <div className="foms-kpi-icon">
                            <CreditCard size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#D97706' }}>
                            {activeSummary.pendingInvoicesCount}
                        </div>
                        <div className="foms-kpi-subtext">
                            <span>Awaiting client payment</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Analytics & Exposure Distribution Row ── */}
            <div className="foms-analytics-grid">
                {/* Visual Donut Chart: Invoice Settlement Statuses */}
                <div className="foms-panel-card">
                    <div className="foms-panel-header">
                        <h3 className="foms-panel-title">
                            <FileText size={16} style={{ color: 'var(--teal, #00A99D)' }} />
                            <span>Invoice Status Breakdown</span>
                        </h3>
                        <span className="foms-panel-subtitle">{activeSummary.totalInvoicesTracked} total invoices</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minHeight: 180 }}>
                        <div style={{ width: 170, height: 170, position: 'relative', flexShrink: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={75}
                                        paddingAngle={3}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: 8,
                                            border: '1px solid #E2E8F0',
                                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                                            fontSize: 12,
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    pointerEvents: 'none',
                                }}
                            >
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tp, #0F172A)' }}>
                                    {activeSummary.totalInvoicesTracked}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--tt, #6B7280)', fontWeight: 600 }}>
                                    INVOICES
                                </span>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {chartData.map(item => {
                                const pct = Math.round((item.value / totalTracked) * 100);
                                return (
                                    <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--ts, #374151)' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                                                {item.name}
                                            </span>
                                            <span style={{ fontWeight: 700, color: 'var(--tp, #0F172A)' }}>
                                                {item.value} ({pct}%)
                                            </span>
                                        </div>
                                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Receivables & Overdue Risk Exposure */}
                <div className="foms-panel-card">
                    <div className="foms-panel-header">
                        <h3 className="foms-panel-title">
                            <ShieldAlert size={16} style={{ color: '#DC2626' }} />
                            <span>Receivables Risk & Settlement Health</span>
                        </h3>
                        <span className="foms-panel-subtitle">Health Index</span>
                    </div>

                    <div className="foms-exposure-container">
                        <div className="foms-exposure-bar-wrap">
                            <div
                                className="foms-exposure-bar-segment foms-exposure-bar-paid"
                                style={{ width: `${paidPct}%` }}
                                title={`Settled: ${paidPct}%`}
                            />
                            <div
                                className="foms-exposure-bar-segment foms-exposure-bar-pending"
                                style={{ width: `${pendingPct}%` }}
                                title={`Pending: ${pendingPct}%`}
                            />
                            <div
                                className="foms-exposure-bar-segment foms-exposure-bar-overdue"
                                style={{ width: `${overduePct}%` }}
                                title={`Overdue: ${overduePct}%`}
                            />
                        </div>

                        <div className="foms-exposure-legend">
                            <div className="foms-exposure-legend-item">
                                <span className="foms-legend-dot" style={{ background: '#059669' }} />
                                <span>Paid ({paidPct}%)</span>
                            </div>
                            <div className="foms-exposure-legend-item">
                                <span className="foms-legend-dot" style={{ background: '#D97706' }} />
                                <span>In-Term ({pendingPct}%)</span>
                            </div>
                            <div className="foms-exposure-legend-item">
                                <span className="foms-legend-dot" style={{ background: '#DC2626' }} />
                                <span>Overdue ({overduePct}%)</span>
                            </div>
                        </div>

                        <div className="foms-exposure-stat-box">
                            <div className="foms-stat-metric">
                                <span className="foms-stat-label">Collection Rate</span>
                                <span className="foms-stat-val" style={{ color: '#059669' }}>
                                    {collectionRate}%
                                </span>
                            </div>
                            <div className="foms-stat-metric">
                                <span className="foms-stat-label">Overdue Ratio</span>
                                <span className="foms-stat-val" style={{ color: overduePct > 15 ? '#DC2626' : '#D97706' }}>
                                    {overduePct}%
                                </span>
                            </div>
                            <div className="foms-stat-metric">
                                <span className="foms-stat-label">Delinquent Clients</span>
                                <span className="foms-stat-val" style={{ color: '#DC2626' }}>
                                    {activeSummary.topOutstandingClients.filter(c => c.overdueInvoicesCount > 0).length}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Client Financial Statuses Monitoring Table ── */}
            <div className="table-card foms-table-card">
                <div className="table-card-header">
                    <div>
                        <h3 className="table-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Building size={18} style={{ color: 'var(--teal, #008B8B)' }} />
                            <span>Client Financial Statuses &amp; Aging Monitor</span>
                        </h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--tt, #6B7280)', margin: '0.25rem 0 0' }}>
                            Live account balances, payment status tags, and overdue alerts routed from FOMS
                        </p>
                    </div>
                    <span className="table-card-results-info">
                        {filteredClients.length} of {activeSummary.topOutstandingClients.length} accounts
                    </span>
                </div>

                {/* Toolbar using standard filter bar */}
                <div className="table-card-filter-bar" style={{ padding: '0 20px 14px' }}>
                    <div className="table-card-search-input-wrap">
                        <Search size={14} className="table-card-search-icon" />
                        <input
                            type="text"
                            className="table-card-search-input"
                            placeholder="Search client name or account ID..."
                            value={searchQuery}
                            onChange={e => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    <div className="foms-filter-chips">
                        <button
                            type="button"
                            className={`foms-filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('all');
                                setCurrentPage(1);
                            }}
                        >
                            <span>All</span>
                            <span className="foms-filter-chip-count">{activeSummary.topOutstandingClients.length}</span>
                        </button>
                        <button
                            type="button"
                            className={`foms-filter-chip chip-overdue ${statusFilter === 'overdue' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('overdue');
                                setCurrentPage(1);
                            }}
                        >
                            <span>Overdue Only</span>
                            <span className="foms-filter-chip-count">{activeSummary.topOutstandingClients.filter(c => c.overdueInvoicesCount > 0).length}</span>
                        </button>
                        <button
                            type="button"
                            className={`foms-filter-chip ${statusFilter === 'with_balance' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('with_balance');
                                setCurrentPage(1);
                            }}
                        >
                            <span>With Balance</span>
                            <span className="foms-filter-chip-count">{activeSummary.topOutstandingClients.filter(c => c.outstandingBalance > 0).length}</span>
                        </button>
                        <button
                            type="button"
                            className={`foms-filter-chip chip-success ${statusFilter === 'paid' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('paid');
                                setCurrentPage(1);
                            }}
                        >
                            <span>Paid / Settled</span>
                            <span className="foms-filter-chip-count">{activeSummary.topOutstandingClients.filter(c => c.latestStatus.toLowerCase() === 'paid').length}</span>
                        </button>
                    </div>

                    <select
                        className="dt-filter-select"
                        value={sortBy}
                        onChange={e => {
                            setSortBy(e.target.value as any);
                            setCurrentPage(1);
                        }}
                        style={{ marginLeft: 'auto' }}
                    >
                        <option value="balance_desc">Highest Outstanding Balance</option>
                        <option value="balance_asc">Lowest Outstanding Balance</option>
                        <option value="overdue_desc">Most Overdue Invoices</option>
                        <option value="name_asc">Client Name (A-Z)</option>
                        <option value="date_asc">Nearest Due Date</option>
                    </select>
                </div>

                {/* Table */}
                <div className="table-card-wrap">
                    <table className="table-card-data-table foms-table" style={{ width: '100%', minWidth: 800 }}>
                        <thead>
                            <tr>
                                <th>Client / Account</th>
                                <th>Latest Payment Status</th>
                                <th>Outstanding Balance</th>
                                <th>Overdue Invoices</th>
                                <th>Next Payment Due</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedClients.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--tt, #6B7280)' }}>
                                        {activeSummary.topOutstandingClients.length === 0 ? (
                                            <>
                                                <Building size={32} style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.35 }} />
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--tp, #0F172A)' }}>No Client Financial Records Available</div>
                                                <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Real-time client balances and invoice payment statuses will appear here once synchronized from FOMS.</div>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle size={24} style={{ margin: '0 auto 0.5rem', display: 'block', opacity: 0.5 }} />
                                                No client accounts match the selected search or filter criteria.
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                paginatedClients.map(client => {
                                    const statusLower = client.latestStatus.toLowerCase();
                                    const dueMeta = formatDueDateRelative(client.nextDueDate);
                                    const hasOverdue = client.overdueInvoicesCount > 0;

                                    return (
                                        <tr key={client.clientAccountId}>
                                            {/* Client Name & Account ID */}
                                            <td>
                                                <div className="foms-client-name-group">
                                                    <span className="foms-client-title">{client.clientName}</span>
                                                    <span className="foms-account-id-row">
                                                        <span>{client.clientAccountId}</span>
                                                        <button
                                                            type="button"
                                                            className="foms-copy-btn"
                                                            onClick={e => handleCopyAccountId(client.clientAccountId, e)}
                                                            title="Copy Account ID"
                                                        >
                                                            {copiedId === client.clientAccountId ? (
                                                                <Check size={11} style={{ color: '#059669' }} />
                                                            ) : (
                                                                <Copy size={11} />
                                                            )}
                                                        </button>
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Latest Status Pill */}
                                            <td>
                                                <span
                                                    className={`foms-status-pill status-${statusLower}`}
                                                >
                                                    {statusLower === 'overdue' && <AlertCircle size={11} />}
                                                    {statusLower === 'paid' && <CheckCircle2 size={11} />}
                                                    {(statusLower === 'sent' || statusLower === 'approved') && <Clock size={11} />}
                                                    <span>{client.latestStatus}</span>
                                                </span>
                                            </td>

                                            {/* Outstanding Balance */}
                                            <td>
                                                <span className="foms-balance-amount" style={client.outstandingBalance > 0 ? { color: '#0F172A' } : { color: '#6B7280' }}>
                                                    {formatCurrency(client.outstandingBalance)}
                                                </span>
                                            </td>

                                            {/* Overdue Count */}
                                            <td>
                                                {hasOverdue ? (
                                                    <span className="foms-overdue-chip">
                                                        <AlertCircle size={13} />
                                                        <span>{client.overdueInvoicesCount} overdue</span>
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#059669', fontSize: '0.78rem', fontWeight: 500 }}>
                                                        0 overdue
                                                    </span>
                                                )}
                                            </td>

                                            {/* Next Due Date */}
                                            <td>
                                                <div className="foms-due-date-cell">
                                                    <span className="foms-due-date-text">
                                                        {client.nextDueDate
                                                            ? new Date(client.nextDueDate).toLocaleDateString('en-US', {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                year: 'numeric',
                                                            })
                                                            : 'No pending dues'}
                                                    </span>
                                                    <span
                                                        className={`foms-due-relative ${
                                                            dueMeta.isOverdue
                                                                ? 'is-overdue'
                                                                : dueMeta.isUpcoming
                                                                ? 'is-upcoming'
                                                                : ''
                                                        }`}
                                                    >
                                                        {dueMeta.text}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Quick Action Button */}
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    className="foms-btn-action"
                                                    onClick={() => setSelectedClient(client)}
                                                >
                                                    <Eye size={12} />
                                                    <span>Details</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Bar */}
                {filteredClients.length > 0 && (
                    <div className="table-card-pagination-bar">
                        <span className="table-card-pagination-info">
                            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredClients.length)} to {Math.min(currentPage * pageSize, filteredClients.length)} of {filteredClients.length} accounts
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

            {/* ── Client Detail Modal / Drawer ── */}
            {selectedClient && (
                <FormModal
                    isOpen={!!selectedClient}
                    onClose={() => setSelectedClient(null)}
                    title={selectedClient.clientName}
                    subtitle={`Account #${selectedClient.clientAccountId} • Real-time Financial Exposure`}
                    size="md"
                    footer={
                        <>
                            <button
                                type="button"
                                className="fm-btn fm-btn-cancel"
                                onClick={() => setSelectedClient(null)}
                            >
                                Close
                            </button>
                            {onViewClientTasks && (
                                <button
                                    type="button"
                                    className="fm-btn fm-btn-primary"
                                    onClick={() => {
                                        onViewClientTasks(selectedClient.clientName, selectedClient.clientAccountId);
                                        setSelectedClient(null);
                                    }}
                                >
                                    <ExternalLink size={13} />
                                    <span>Find Related Tasks</span>
                                </button>
                            )}
                        </>
                    }
                >
                    <div className="view-modal-meta foms-view-modal-meta">
                        <div className="view-modal-meta-item">
                            <span className="view-modal-label">Outstanding Balance</span>
                            <span className="view-modal-meta-value" style={{ color: 'var(--teal, #00A99D)', fontSize: '1.05rem' }}>
                                {formatCurrency(selectedClient.outstandingBalance)}
                            </span>
                        </div>
                        <div className="view-modal-meta-item">
                            <span className="view-modal-label">Overdue Invoices</span>
                            <span
                                className="view-modal-meta-value"
                                style={{
                                    color: selectedClient.overdueInvoicesCount > 0 ? 'var(--status-failed, #DC2626)' : 'var(--status-active, #059669)',
                                    fontSize: '1.05rem',
                                }}
                            >
                                {selectedClient.overdueInvoicesCount}
                            </span>
                        </div>
                        <div className="view-modal-meta-item">
                            <span className="view-modal-label">Payment Status</span>
                            <span className="view-modal-meta-value">
                                {selectedClient.latestStatus}
                            </span>
                        </div>
                        <div className="view-modal-meta-item">
                            <span className="view-modal-label">Next Payment Due</span>
                            <span className="view-modal-meta-value">
                                {selectedClient.nextDueDate
                                    ? new Date(selectedClient.nextDueDate).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })
                                    : 'None / Settled'}
                            </span>
                        </div>
                    </div>

                    {/* Operational Recommendation Box */}
                    {selectedClient.overdueInvoicesCount > 0 ? (
                        <div className="foms-modal-advice-box risk-high" style={{ marginTop: 14 }}>
                            <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div style={{ fontWeight: 700, marginBottom: 2 }}>High Exposure Alert</div>
                                <div>
                                    This client has {selectedClient.overdueInvoicesCount} overdue invoice(s) totaling{' '}
                                    <strong>{formatCurrency(selectedClient.outstandingBalance)}</strong>. A Collection Follow-up task in STARS may be required or already routed to an Operations Coordinator.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="foms-modal-advice-box risk-ok" style={{ marginTop: 14 }}>
                            <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div style={{ fontWeight: 700, marginBottom: 2 }}>Good Financial Standing</div>
                                <div>
                                    Account has 0 overdue invoices. Outstanding amounts are within standard settlement credit terms.
                                </div>
                            </div>
                        </div>
                    )}
                </FormModal>
            )}
                </>
            )}
        </div>
    );
};

export default FomsFinancialMetricsView;
