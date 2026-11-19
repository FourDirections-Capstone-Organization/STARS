import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ShieldAlert,
    AlertCircle,
    CheckCircle2,
    Clock,
    Search,
    Filter,
    X,
    ExternalLink,
    FileCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    Check,
    Sparkles,
    Calendar,
    Phone,
    Building,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import api from '../../api';
import { FomsOverdueAlertItem, CollectionFollowUpListProps, SubmitCollectionOutcomePayload } from './types';
import FormModal from '../FormModal/FormModal';
import { useToast } from '../Toast/Toast';
import { ActionsDropdown } from '../ui/DataTable';
import '../ui/DataTable.css';
import './FomsFinancialMetricsView.css';

export const CollectionFollowUpList: React.FC<CollectionFollowUpListProps> = ({
    alerts: propAlerts,
    loading: propLoading,
    onRefresh: propOnRefresh,
    onOpenTask,
    onOutcomeSubmitted,
    showFilters = true,
}) => {
    const { success: toastSuccess, error: toastError } = useToast();

    // Internal state if alerts not passed as props
    const [internalAlerts, setInternalAlerts] = useState<FomsOverdueAlertItem[]>([]);
    const [internalLoading, setInternalLoading] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [agingFilter, setAgingFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 6;

    // Outcome Modal State
    const [selectedAlertForOutcome, setSelectedAlertForOutcome] = useState<FomsOverdueAlertItem | null>(null);
    const [outcomeType, setOutcomeType] = useState<string>('Promised to Pay');
    const [promisedPaymentDate, setPromisedPaymentDate] = useState<string>('');
    const [actionTaken, setActionTaken] = useState<string>('Phone Call');
    const [outcomeNotes, setOutcomeNotes] = useState<string>('');
    const [submittingOutcome, setSubmittingOutcome] = useState<boolean>(false);
    const [outcomeError, setOutcomeError] = useState<string>('');

    // Fetch alerts if not supplied
    const fetchAlerts = useCallback(async () => {
        if (propAlerts !== undefined) return;
        setInternalLoading(true);
        try {
            const res = await api.get('/api/foms-integration/collection-alerts');
            const data = res.data;
            if (data.isSuccess && Array.isArray(data.data)) {
                setInternalAlerts(data.data as FomsOverdueAlertItem[]);
            } else {
                setInternalAlerts([]);
            }
        } catch {
            setInternalAlerts([]);
        } finally {
            setInternalLoading(false);
        }
    }, [propAlerts]);

    useEffect(() => {
        fetchAlerts();
    }, [fetchAlerts]);

    const alerts = propAlerts !== undefined ? propAlerts : internalAlerts;
    const isLoading = propLoading !== undefined ? propLoading : internalLoading;

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

    // Filtered alerts
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

            if (priorityFilter !== 'all') {
                const isUrgent = a.daysOverdue >= 30 || a.agingStatus.includes('60') || a.agingStatus.includes('90') || a.priorityLevel === 'Urgent';
                if (priorityFilter === 'urgent' && !isUrgent) return false;
                if (priorityFilter === 'high' && isUrgent) return false;
            }

            if (agingFilter === 'all') return true;
            if (agingFilter === 'due_soon') return a.agingStatus.toLowerCase().includes('due') || a.daysOverdue <= 0;
            if (agingFilter === '1_30') return a.agingStatus.includes('1-30') || (a.daysOverdue >= 1 && a.daysOverdue <= 30);
            if (agingFilter === '31_60') return a.agingStatus.includes('31-60') || (a.daysOverdue >= 31 && a.daysOverdue <= 60);
            if (agingFilter === '61_90') return a.agingStatus.includes('61-90') || (a.daysOverdue >= 61 && a.daysOverdue <= 90);
            if (agingFilter === '90_plus') return a.agingStatus.includes('90+') || a.daysOverdue > 90;
            return true;
        });
    }, [alerts, searchQuery, agingFilter, priorityFilter]);

    // Pagination
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

    // Outcome Modal Handlers
    const handleOpenOutcomeModal = (alert: FomsOverdueAlertItem) => {
        setSelectedAlertForOutcome(alert);
        setOutcomeType('Promised to Pay');
        // Default promised date to 3 business days from now
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        setPromisedPaymentDate(defaultDate.toISOString().split('T')[0]);
        setActionTaken('Phone Call');
        setOutcomeNotes('');
        setOutcomeError('');
    };

    const handleCloseOutcomeModal = () => {
        setSelectedAlertForOutcome(null);
        setOutcomeError('');
        setSubmittingOutcome(false);
    };

    const handleSubmitOutcome = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAlertForOutcome) return;

        if (outcomeType === 'Promised to Pay' && !promisedPaymentDate) {
            setOutcomeError('Promised payment date is required when outcome is Promised to Pay.');
            return;
        }

        const taskId = selectedAlertForOutcome.starsTaskId;
        if (!taskId) {
            setOutcomeError('Target STARS Task ID is not associated with this collection alert.');
            return;
        }

        setSubmittingOutcome(true);
        setOutcomeError('');

        const payload: SubmitCollectionOutcomePayload = {
            outcome: outcomeType,
            promisedPaymentDate: outcomeType === 'Promised to Pay' && promisedPaymentDate ? new Date(promisedPaymentDate).toISOString() : null,
            actionTaken: actionTaken.trim() || 'Client Contact',
            notes: outcomeNotes.trim() || null,
        };

        try {
            const res = await api.post(`/api/foms-integration/tasks/${taskId}/collection-outcome`, payload);
            if (res.data?.isSuccess) {
                toastSuccess(`Collection outcome "${outcomeType}" recorded and dispatched to FOMS callback.`);
                if (onOutcomeSubmitted) {
                    onOutcomeSubmitted(taskId, payload);
                }
                handleCloseOutcomeModal();
                if (propOnRefresh) {
                    propOnRefresh();
                } else {
                    fetchAlerts();
                }
            } else {
                const errMsg = res.data?.message || 'Failed to submit collection outcome to FOMS.';
                setOutcomeError(errMsg);
                toastError(errMsg);
            }
        } catch (err: any) {
            const errMsg = err?.response?.data?.message || err?.message || 'Network error while transmitting collection outcome.';
            setOutcomeError(errMsg);
            toastError(errMsg);
        } finally {
            setSubmittingOutcome(false);
        }
    };

    return (
        <div className="table-card foms-table-card collection-followup-list-card" data-testid="collection-followup-list">
            <div className="table-card-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShieldAlert size={18} style={{ color: 'var(--urgent, #FF6D00)' }} />
                        <h3 className="table-card-title">Collection Follow-up Tasks &amp; Routed Alerts</h3>
                        <span className="foms-live-beacon" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}>
                            <span className="foms-beacon-dot" /> FOMS FR-031 / STARS FR-019
                        </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--tt, #6B7280)', margin: '0.25rem 0 0' }}>
                        Delinquent invoices routed into dedicated STARS <strong>[Collection Follow-up]</strong> tasks with single-active idempotency (FR-044).
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="table-card-results-info">
                        {filteredAlerts.length} follow-up task{filteredAlerts.length !== 1 ? 's' : ''}
                    </span>
                    <button
                        type="button"
                        className="foms-btn-sync"
                        onClick={() => {
                            if (propOnRefresh) propOnRefresh();
                            else fetchAlerts();
                        }}
                        disabled={isLoading}
                        title="Refresh collection follow-ups"
                    >
                        <RefreshCw size={12} className={isLoading ? 'foms-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {showFilters && (
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
                            data-testid="collection-search-input"
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
                            data-testid="collection-aging-filter"
                        >
                            <option value="all">All Aging Brackets</option>
                            <option value="due_soon">Due Soon (&lt;= 0d)</option>
                            <option value="1_30">1-30 Days Overdue</option>
                            <option value="31_60">31-60 Days Overdue</option>
                            <option value="61_90">61-90 Days Overdue</option>
                            <option value="90_plus">90+ Days Overdue</option>
                        </select>
                        <ChevronDown size={14} className="foms-filter-chevron" />
                    </div>

                    {/* Priority filter dropdown */}
                    <div className="foms-filter-dropdown-wrap">
                        <select
                            className="foms-filter-dropdown-select"
                            value={priorityFilter}
                            onChange={e => {
                                setPriorityFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            aria-label="Filter by Priority"
                            data-testid="collection-priority-filter"
                        >
                            <option value="all">All Priorities</option>
                            <option value="urgent">Urgent (&gt;= 30d)</option>
                            <option value="high">High Priority</option>
                        </select>
                        <ChevronDown size={14} className="foms-filter-chevron" />
                    </div>
                </div>
            )}

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--tt, #6B7280)' }}>
                    <Loader2 size={28} className="foms-spin" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading collection follow-up tasks from STARS...</p>
                </div>
            ) : filteredAlerts.length === 0 ? (
                <div className="table-card-empty-state" data-testid="collection-empty-state">
                    <AlertCircle size={32} style={{ opacity: 0.5, color: 'var(--tt, #6B7280)' }} />
                    <h4 style={{ margin: '8px 0 4px', fontSize: '0.95rem', fontWeight: 600, color: 'var(--tp, #0F172A)' }}>
                        No collection follow-up tasks found
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--tt, #6B7280)' }}>
                        Overdue invoice collection tasks routed from FOMS will be displayed here.
                    </p>
                    {(searchQuery || agingFilter !== 'all' || priorityFilter !== 'all') && (
                        <button
                            type="button"
                            className="foms-btn-primary"
                            style={{ marginTop: 12 }}
                            onClick={() => {
                                setSearchQuery('');
                                setAgingFilter('all');
                                setPriorityFilter('all');
                                setCurrentPage(1);
                            }}
                        >
                            Reset Filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="table-card-wrap">
                    <table className="table-card-data-table foms-table" style={{ width: '100%', minWidth: 950 }}>
                        <thead>
                            <tr>
                                <th>TASK TITLE &amp; CLIENT</th>
                                <th>AMOUNT DUE</th>
                                <th>AGING BRACKET</th>
                                <th>PRIORITY</th>
                                <th>GRAPH ROUTED COORDINATOR</th>
                                <th>STATUS</th>
                                <th style={{ textAlign: 'right' }}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedAlerts.map(alert => {
                                const isUrgent = alert.daysOverdue >= 30 || alert.agingStatus.includes('60') || alert.agingStatus.includes('90') || alert.priorityLevel === 'Urgent';
                                const taskTitleDisplay = `[Collection Follow-up] Invoice ${alert.invoiceNumber} - ${alert.clientName}`;

                                return (
                                    <tr key={alert.id} className="foms-table-row" data-testid={`collection-row-${alert.invoiceNumber}`}>
                                        {/* Task Title & Client */}
                                        <td>
                                            <div className="foms-client-cell">
                                                <span className="foms-task-title" style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--tp, #0F172A)' }}>
                                                    {taskTitleDisplay}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                    <span className="foms-invoice-badge">{alert.invoiceNumber}</span>
                                                    <button
                                                        type="button"
                                                        className="foms-btn-icon-sm"
                                                        title="Copy Invoice Number"
                                                        onClick={() => handleCopy(alert.invoiceNumber, `inv-${alert.id}`)}
                                                    >
                                                        {copiedKey === `inv-${alert.id}` ? <Check size={12} color="#00A99D" /> : <Copy size={12} />}
                                                    </button>
                                                    <span className="foms-client-id">{alert.clientAccountId}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Amount Due */}
                                        <td>
                                            <div className="foms-amount-val" style={{ fontWeight: 700 }}>
                                                {formatCurrency(alert.amountDue)}
                                            </div>
                                            <span className="foms-amount-sub">
                                                {isUrgent ? 'Delinquent balance' : 'Active exposure'}
                                            </span>
                                        </td>

                                        {/* Aging Bracket */}
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <span className={`foms-aging-pill ${isUrgent ? 'critical' : alert.daysOverdue <= 0 ? 'duesoon' : 'moderate'}`}>
                                                    {isUrgent && <ShieldAlert size={11} />}
                                                    {alert.daysOverdue <= 0 && <Clock size={11} />}
                                                    {alert.agingStatus} ({alert.daysOverdue}d overdue)
                                                </span>
                                                <span className="foms-due-relative">
                                                    {alert.dueDate ? `Due: ${new Date(alert.dueDate).toLocaleDateString()}` : 'N/A'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Priority: Urgent Priority Pill */}
                                        <td>
                                            {isUrgent ? (
                                                <span
                                                    className="foms-priority-pill foms-urgent-priority-pill"
                                                    data-testid="foms-urgent-priority-pill"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        background: '#fee2e2',
                                                        color: '#b91c1c',
                                                        border: '1px solid #f87171',
                                                        borderRadius: 9999,
                                                        padding: '3px 8px',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <ShieldAlert size={12} color="#dc2626" /> Urgent
                                                </span>
                                            ) : (
                                                <span
                                                    className="foms-priority-pill foms-high-priority-pill"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        background: '#fff7ed',
                                                        color: '#c2410c',
                                                        border: '1px solid #fdba74',
                                                        borderRadius: 9999,
                                                        padding: '3px 8px',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    High
                                                </span>
                                            )}
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
                                                        <Sparkles size={10} /> Min Workload Routing
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Task Status */}
                                        <td>
                                            <span className={`foms-status-pill ${alert.taskStatus === 'Completed' ? 'status-paid' : 'status-unpaid'}`}>
                                                {alert.taskStatus === 'Completed' ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                                                <span>{alert.taskStatus || 'In Progress'}</span>
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {alert.starsTaskId && onOpenTask && (
                                                    <button
                                                        type="button"
                                                        className="tv-btn tv-btn-outline-sm"
                                                        onClick={() => onOpenTask(alert.starsTaskId!)}
                                                        title="Open STARS Task Detail"
                                                    >
                                                        <ExternalLink size={12} /> Open Task
                                                    </button>
                                                )}
                                                {alert.taskStatus !== 'Completed' && (
                                                    <button
                                                        type="button"
                                                        className="tv-btn tv-btn-primary-sm"
                                                        onClick={() => handleOpenOutcomeModal(alert)}
                                                        title="Record collection follow-up outcome"
                                                        data-testid={`record-outcome-btn-${alert.invoiceNumber}`}
                                                    >
                                                        <FileCheck size={12} /> Record Outcome
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination Controls */}
            {filteredAlerts.length > 0 && (
                <div className="table-card-pagination-bar">
                    <span className="table-card-pagination-info">
                        Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAlerts.length)} to {Math.min(currentPage * pageSize, filteredAlerts.length)} of {filteredAlerts.length} follow-up tasks
                    </span>
                    <div className="table-card-pagination-controls">
                        <div className="dt-page-btns" role="group" aria-label="Page navigation">
                            <button
                                type="button"
                                className="dt-page-btn dt-page-btn--icon"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                aria-label="Previous page"
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
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Coordinator Outcome Submission Modal (FOMS FR-033 / Integration 3) ── */}
            {selectedAlertForOutcome && (
                <FormModal
                    isOpen={!!selectedAlertForOutcome}
                    onClose={handleCloseOutcomeModal}
                    title="Submit Collection Follow-up Outcome"
                    subtitle={`Dispatches outcome callback to FOMS (FR-033) • Invoice ${selectedAlertForOutcome.invoiceNumber}`}
                    size="md"
                    footer={
                        <>
                            <button
                                type="button"
                                className="fm-btn fm-btn-cancel"
                                onClick={handleCloseOutcomeModal}
                                disabled={submittingOutcome}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="fm-btn fm-btn-primary"
                                onClick={handleSubmitOutcome}
                                disabled={submittingOutcome}
                                data-testid="submit-outcome-confirm-btn"
                            >
                                {submittingOutcome ? (
                                    <>
                                        <Loader2 size={13} className="foms-spin" /> Transmitting Callback...
                                    </>
                                ) : (
                                    <>
                                        <FileCheck size={13} /> Submit Outcome to FOMS
                                    </>
                                )}
                            </button>
                        </>
                    }
                >
                    <form onSubmit={handleSubmitOutcome} className="foms-outcome-modal-form" data-testid="collection-outcome-form">
                        {outcomeError && (
                            <div className="foms-modal-error-box" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 6, marginBottom: 14, color: '#dc2626', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertCircle size={15} />
                                <span>{outcomeError}</span>
                            </div>
                        )}

                        {/* Top Meta Card */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', fontWeight: 700 }}>Client Account</div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{selectedAlertForOutcome.clientName}</div>
                                    <div style={{ fontSize: '0.76rem', color: '#64748b' }}>Account: {selectedAlertForOutcome.clientAccountId}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', fontWeight: 700 }}>Amount Due</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#dc2626' }}>{formatCurrency(selectedAlertForOutcome.amountDue)}</div>
                                    <div style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 600 }}>{selectedAlertForOutcome.daysOverdue} days overdue</div>
                                </div>
                            </div>
                        </div>

                        {/* Outcome Dropdown */}
                        <div className="fm-field-group" style={{ marginBottom: 14 }}>
                            <label className="fm-label" htmlFor="foms-outcome-select" style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                                Collection Follow-up Outcome <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <select
                                id="foms-outcome-select"
                                className="fm-select"
                                value={outcomeType}
                                onChange={e => {
                                    setOutcomeType(e.target.value);
                                    setOutcomeError('');
                                }}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                data-testid="outcome-type-select"
                            >
                                <option value="Promised to Pay">Promised to Pay</option>
                                <option value="Disputed">Disputed</option>
                                <option value="Unreachable">Unreachable</option>
                            </select>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3, display: 'block' }}>
                                FOMS updates accounts receivable status and logs immutable audit trail based on this outcome.
                            </span>
                        </div>

                        {/* Promised Payment Date (Mandatory if Promised to Pay) */}
                        {outcomeType === 'Promised to Pay' && (
                            <div className="fm-field-group" style={{ marginBottom: 14 }}>
                                <label className="fm-label" htmlFor="foms-promised-date" style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                                    Promised Settlement Date <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="foms-promised-date"
                                    type="date"
                                    className="fm-input"
                                    value={promisedPaymentDate}
                                    onChange={e => {
                                        setPromisedPaymentDate(e.target.value);
                                        setOutcomeError('');
                                    }}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                    data-testid="promised-date-input"
                                    required
                                />
                                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3, display: 'block' }}>
                                    Expected date when client committed to release payment or issue check.
                                </span>
                            </div>
                        )}

                        {/* Action Taken */}
                        <div className="fm-field-group" style={{ marginBottom: 14 }}>
                            <label className="fm-label" htmlFor="foms-action-taken" style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                                Action Taken <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                                id="foms-action-taken"
                                type="text"
                                className="fm-input"
                                placeholder="e.g. Phone Call, Demand Letter Delivered, On-site Visit"
                                value={actionTaken}
                                onChange={e => setActionTaken(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                data-testid="action-taken-input"
                                required
                            />
                        </div>

                        {/* Notes */}
                        <div className="fm-field-group" style={{ marginBottom: 8 }}>
                            <label className="fm-label" htmlFor="foms-outcome-notes" style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                                Follow-up Notes &amp; Discussion Details
                            </label>
                            <textarea
                                id="foms-outcome-notes"
                                className="fm-textarea"
                                rows={3}
                                placeholder="Provide context regarding conversation with client representative, payment schedule, or dispute reasons..."
                                value={outcomeNotes}
                                onChange={e => setOutcomeNotes(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical' }}
                                data-testid="outcome-notes-textarea"
                            />
                        </div>
                    </form>
                </FormModal>
            )}
        </div>
    );
};

export default CollectionFollowUpList;
