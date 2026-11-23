import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Activity,
    ShieldAlert,
    Clock,
    DollarSign,
    CheckCircle2,
    RefreshCw,
    ExternalLink,
    AlertCircle,
} from 'lucide-react';
import api from '../../api';
import { FomsOverdueAlertItem, CollectionAlertsViewProps } from './types';
import CollectionFollowUpList from './CollectionFollowUpList';
import './FomsFinancialMetricsView.css';

export const CollectionAlertsView: React.FC<CollectionAlertsViewProps> = ({
    onOpenTask,
    onViewClientTasks,
}) => {
    const [alerts, setAlerts] = useState<FomsOverdueAlertItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCollectionAlerts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/foms-integration/collection-alerts');
            const data = res.data;
            if (data.isSuccess && Array.isArray(data.data)) {
                setAlerts(data.data as FomsOverdueAlertItem[]);
            } else {
                setAlerts([]);
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to load collection alerts from STARS backend.');
            setAlerts([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCollectionAlerts();
    }, [fetchCollectionAlerts]);

    // KPI Counters
    const totalAlertsCount = alerts.length;
    const urgentCount = useMemo(() => {
        return alerts.filter(a => a.daysOverdue >= 30 || a.priorityLevel === 'Urgent' || a.agingStatus.includes('60') || a.agingStatus.includes('90')).length;
    }, [alerts]);

    const dueSoonCount = useMemo(() => {
        return alerts.filter(a => a.daysOverdue <= 0 || a.agingStatus.toLowerCase().includes('due')).length;
    }, [alerts]);

    const totalAmountTracked = useMemo(() => {
        return alerts.reduce((acc, a) => acc + (a.amountDue || 0), 0);
    }, [alerts]);

    const formatCurrency = (val: number) => {
        return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="foms-graph-panel collection-alerts-view" data-testid="collection-alerts-view">
            {/* ── Top Hero Banner ── */}
            <div className="foms-graph-hero">
                <div className="foms-graph-hero-top">
                    <div className="foms-graph-hero-content">
                        <h2 className="foms-graph-hero-title">
                            Overdue Accounts Collection Routing (FOMS Integration 3)
                        </h2>
                        <p className="foms-graph-hero-desc">
                            Automated operational coordination between Financial Receivables (FOMS) and Field Operations (STARS).
                            Qualifying delinquent accounts automatically generate <strong>[Collection Follow-up]</strong> tasks,
                            evaluate live Coordinator workloads via the Graph Routing Engine (FR-019), enforce single-active idempotency (FR-044),
                            and transmit collection outcomes back to FOMS (FOMS FR-033).
                        </p>
                    </div>
                </div>
            </div>

            {/* Error sync notice */}
            {error && (
                <div className="foms-sync-notice" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 8, marginBottom: 14, color: '#dc2626', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* ── 4 KPI Stats Grid ── */}
            <div className="foms-kpi-grid">
                <div className="foms-kpi-card variant-tracked" data-testid="kpi-total-alerts">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Routed Collection Alerts</span>
                        <div className="foms-kpi-icon">
                            <Activity size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{totalAlertsCount}</div>
                        <div className="foms-kpi-subtext">
                            <CheckCircle2 size={12} style={{ color: '#00A99D' }} />
                            <span>Active [Collection Follow-up] tasks in STARS</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-overdue" data-testid="kpi-urgent-alerts">
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

                <div className="foms-kpi-card variant-pending" data-testid="kpi-duesoon-alerts">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Due Soon / In-Term</span>
                        <div className="foms-kpi-icon">
                            <Clock size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#D97706' }}>{dueSoonCount}</div>
                        <div className="foms-kpi-subtext">
                            <span>Pre-billing proactive follow-up</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-outstanding" data-testid="kpi-total-amount">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Monitored Delinquency</span>
                        <div className="foms-kpi-icon">
                            <DollarSign size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{formatCurrency(totalAmountTracked)}</div>
                        <div className="foms-kpi-subtext">
                            <span>Exposure assigned to STARS Coordinators</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Follow-Up List Component ── */}
            <CollectionFollowUpList
                alerts={alerts}
                loading={loading}
                onRefresh={fetchCollectionAlerts}
                onOpenTask={onOpenTask}
                onOutcomeSubmitted={() => fetchCollectionAlerts()}
            />
        </div>
    );
};

export default CollectionAlertsView;
