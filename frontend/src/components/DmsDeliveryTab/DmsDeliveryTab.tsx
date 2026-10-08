import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Truck,
    Search,
    RefreshCw,
    MapPin,
    Copy,
    Check,
    CheckCircle2,
    Clock,
    AlertCircle,
    ArrowRight,
    ExternalLink,
    Package,
    Navigation,
    Calendar,
    ChevronRight,
    Loader2,
    X,
    Filter,
    Activity,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import './DmsDeliveryTab.css';

export interface DmsDeliveryItem {
    taskId: string;
    taskTitle: string;
    taskReferenceNumber?: string;
    recipientName: string;
    recipientContact: string;
    deliveryAddress: string;
    area?: string;
    packageDescription?: string;
    courierEmployeeId?: string;
    dmsWaybillNo?: string;
    dmsOrderId?: number;
    dmsStatus: string;
    dmsRawStatus?: string;
    dmsLastSyncedAt?: string;
    dmsFailureReason?: string;
    dmsLatitude?: number;
    dmsLongitude?: number;
    syncStatus: string;
    createdAt?: string;
}

interface PerformanceSummary {
    totalDeliveries: number;
    onTimeCount: number;
    lateCount: number;
    onTimePercentage: number;
}

interface DmsDeliveryTabProps {
    tasks?: any[];
    onViewTask: (taskId: string) => void;
}

export const DmsDeliveryTab: React.FC<DmsDeliveryTabProps> = ({ tasks = [], onViewTask }) => {
    const [deliveries, setDeliveries] = useState<DmsDeliveryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [performance, setPerformance] = useState<PerformanceSummary>({
        totalDeliveries: 0,
        onTimeCount: 0,
        lateCount: 0,
        onTimePercentage: 100,
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedDelivery, setSelectedDelivery] = useState<DmsDeliveryItem | null>(null);
    const [copiedWaybill, setCopiedWaybill] = useState<string | null>(null);
    const [autoSync, setAutoSync] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const { success: toastSuccess, error: toastError } = useToast();

    // Fetch Performance Summary from Backend
    const fetchPerformance = useCallback(async () => {
        try {
            const res = await api.get('/api/integration/dms/performance-summary');
            const data = res?.data?.data ?? res?.data;
            if (data && typeof data.totalDeliveries === 'number') {
                setPerformance({
                    totalDeliveries: data.totalDeliveries,
                    onTimeCount: data.onTimeCount,
                    lateCount: data.lateCount,
                    onTimePercentage: data.onTimePercentage,
                });
            }
        } catch {
            // Keep existing or default
        }
    }, []);

    // Load delivery details for all relevant tasks
    const fetchDeliveries = useCallback(async () => {
        setLoading(true);
        try {
            await fetchPerformance();

            // Candidate tasks: tasks from props or fetch from task list
            let sourceTasks = tasks;
            if (!sourceTasks || sourceTasks.length === 0) {
                const res = await api.get('/api/Task', { pageNumber: 1, pageSize: 100 });
                const json = res.data;
                sourceTasks = json?.data?.items ?? json?.data ?? (Array.isArray(json) ? json : []);
            }

            // Fetch delivery details for tasks in parallel
            const targetTasks = sourceTasks.slice(0, 50); // Fetch top 50 tasks
            const results = await Promise.allSettled(
                targetTasks.map(async (t: any) => {
                    const taskId = t.taskId || t.id;
                    if (!taskId) return null;
                    try {
                        const res = await api.get(`/api/dms-integration/tasks/${taskId}/delivery-details`);
                        const d = res?.data?.data ?? res?.data;
                        if (d && (d.dmsWaybillNo || d.recipientName || d.dmsStatus)) {
                            return {
                                taskId: taskId,
                                taskTitle: t.taskTitle || t.title || t.name || 'Delivery Task',
                                taskReferenceNumber: t.taskReferenceNumber || t.referenceNumber,
                                recipientName: d.recipientName || 'Operations Dispatch',
                                recipientContact: d.recipientContact || '—',
                                deliveryAddress: d.deliveryAddress || 'Metro Manila',
                                area: d.area || '',
                                packageDescription: d.packageDescription || t.taskTitle || '',
                                courierEmployeeId: d.courierEmployeeId || '',
                                dmsWaybillNo: d.dmsWaybillNo,
                                dmsOrderId: d.dmsOrderId,
                                dmsStatus: d.dmsStatus || 'Pending',
                                dmsRawStatus: d.dmsRawStatus || d.dmsStatus || 'Pending',
                                dmsLastSyncedAt: d.dmsLastSyncedAt,
                                dmsFailureReason: d.dmsFailureReason,
                                dmsLatitude: d.dmsLatitude,
                                dmsLongitude: d.dmsLongitude,
                                syncStatus: d.syncStatus || 'Synced',
                                createdAt: d.createdAt || t.createdAt,
                            } as DmsDeliveryItem;
                        }
                    } catch {
                        return null;
                    }
                    return null;
                })
            );

            const fetchedDeliveries = results
                .filter(r => r.status === 'fulfilled' && r.value !== null)
                .map(r => (r as PromiseFulfilledResult<DmsDeliveryItem>).value);

            setDeliveries(fetchedDeliveries);
        } catch {
            // Silently handle
        } finally {
            setLoading(false);
        }
    }, [tasks, fetchPerformance]);

    useEffect(() => {
        fetchDeliveries();
    }, [fetchDeliveries]);

    // Live Auto-Refresh polling (every 20s if enabled)
    useEffect(() => {
        if (!autoSync) return;
        const interval = setInterval(() => {
            fetchDeliveries();
        }, 20000);
        return () => clearInterval(interval);
    }, [autoSync, fetchDeliveries]);

    const handleCopy = (waybill: string) => {
        navigator.clipboard.writeText(waybill);
        setCopiedWaybill(waybill);
        toastSuccess(`Waybill ${waybill} copied!`);
        setTimeout(() => setCopiedWaybill(null), 2500);
    };

    const handleManualResend = async (taskId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSyncingId(taskId);
        try {
            await api.post(`/api/dms-integration/tasks/${taskId}/resend`, {});
            toastSuccess('Re-synced with DMS successfully.');
            await fetchDeliveries();
        } catch (err: any) {
            toastError(err?.response?.data?.message || err?.message || 'Re-sync failed.');
        } finally {
            setSyncingId(null);
        }
    };

    // Filter and search
    const filteredDeliveries = useMemo(() => {
        return deliveries.filter(d => {
            // Status filter
            const s = (d.dmsStatus || '').toLowerCase();
            if (statusFilter === 'transit' && !(s.includes('transit') || s.includes('pickup') || s.includes('route') || s.includes('out'))) return false;
            if (statusFilter === 'delivered' && !(s.includes('delivered') || s.includes('completed'))) return false;
            if (statusFilter === 'failed' && !(s.includes('fail') || s.includes('cancel') || d.syncStatus === 'Failed')) return false;
            if (statusFilter === 'pending' && !(s.includes('pending') || !d.dmsWaybillNo)) return false;

            // Search query
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (d.dmsWaybillNo && d.dmsWaybillNo.toLowerCase().includes(q)) ||
                (d.taskTitle && d.taskTitle.toLowerCase().includes(q)) ||
                (d.recipientName && d.recipientName.toLowerCase().includes(q)) ||
                (d.deliveryAddress && d.deliveryAddress.toLowerCase().includes(q)) ||
                (d.area && d.area.toLowerCase().includes(q)) ||
                (d.courierEmployeeId && d.courierEmployeeId.toLowerCase().includes(q)) ||
                (d.dmsStatus && d.dmsStatus.toLowerCase().includes(q))
            );
        });
    }, [deliveries, statusFilter, searchQuery]);

    // Computed Stats
    const stats = useMemo(() => {
        const total = deliveries.length;
        const inTransit = deliveries.filter(d => {
            const s = (d.dmsStatus || '').toLowerCase();
            return s.includes('transit') || s.includes('pickup') || s.includes('route') || s.includes('out');
        }).length;
        const delivered = deliveries.filter(d => {
            const s = (d.dmsStatus || '').toLowerCase();
            return s.includes('delivered') || s.includes('completed');
        }).length;
        const failed = deliveries.filter(d => {
            const s = (d.dmsStatus || '').toLowerCase();
            return s.includes('fail') || s.includes('cancel') || d.syncStatus === 'Failed';
        }).length;

        return { total, inTransit, delivered, failed };
    }, [deliveries]);

    const getStatusPill = (status: string, syncState?: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('delivered') || s.includes('completed')) {
            return <span className="dms-status-pill dms-status-delivered"><CheckCircle2 size={11} /> Delivered (POD)</span>;
        }
        if (s.includes('out') || s.includes('transit') || s.includes('pickup')) {
            return <span className="dms-status-pill dms-status-transit"><Truck size={11} /> In Transit</span>;
        }
        if (s.includes('fail') || s.includes('cancel') || syncState === 'Failed') {
            return <span className="dms-status-pill dms-status-failed"><AlertCircle size={11} /> Delivery Issue</span>;
        }
        return <span className="dms-status-pill dms-status-pending"><Clock size={11} /> Ready / Dispatched</span>;
    };

    const getJourneyStepIndex = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('delivered') || s.includes('completed')) return 3;
        if (s.includes('out') || s.includes('transit')) return 2;
        if (s.includes('pickup')) return 1;
        return 0;
    };

    return (
        <div className="dms-tab-container">
            {/* ── Top Header ── */}
            <div className="dms-tab-header">
                <div className="dms-tab-title-area">
                    <div className="dms-tab-icon-box">
                        <Truck size={22} className="dms-tab-main-icon" />
                    </div>
                    <div>
                        <h2 className="dms-tab-title">Delivery Management (DMS Integration)</h2>
                        <p className="dms-tab-subtitle">
                            Real-time parcel tracking, Waybill management, and driver telemetry linked with STARS tasks.
                        </p>
                    </div>
                </div>

                <div className="dms-tab-actions">
                    <button
                        type="button"
                        className={`dms-action-btn ${autoSync ? 'active' : ''}`}
                        onClick={() => setAutoSync(v => !v)}
                        title={autoSync ? 'Live Auto-Sync Active (every 20s)' : 'Live Auto-Sync Paused'}
                    >
                        <Activity size={13} />
                        <span>{autoSync ? 'Live Sync ON' : 'Live Sync OFF'}</span>
                    </button>
                    <button
                        type="button"
                        className="dms-action-btn dms-refresh-btn"
                        onClick={() => fetchDeliveries()}
                        disabled={loading}
                    >
                        <RefreshCw size={13} className={loading ? 'spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ── KPI Stat Cards ── */}
            <div className="dms-kpi-grid">
                <div className="dms-kpi-card">
                    <div className="dms-kpi-header">
                        <span className="dms-kpi-label">Total Shipments</span>
                        <Package size={16} className="dms-kpi-icon blue" />
                    </div>
                    <div className="dms-kpi-value">{stats.total}</div>
                    <div className="dms-kpi-hint">Linked with STARS tasks</div>
                </div>

                <div className="dms-kpi-card">
                    <div className="dms-kpi-header">
                        <span className="dms-kpi-label">Active in Transit</span>
                        <Truck size={16} className="dms-kpi-icon amber" />
                    </div>
                    <div className="dms-kpi-value" style={{ color: '#d97706' }}>
                        {stats.inTransit}
                        {stats.inTransit > 0 && <span className="dms-pulse-dot" />}
                    </div>
                    <div className="dms-kpi-hint">Driver on road / Out for Delivery</div>
                </div>

                <div className="dms-kpi-card">
                    <div className="dms-kpi-header">
                        <span className="dms-kpi-label">Delivered (POD)</span>
                        <CheckCircle2 size={16} className="dms-kpi-icon green" />
                    </div>
                    <div className="dms-kpi-value" style={{ color: '#059669' }}>{stats.delivered}</div>
                    <div className="dms-kpi-hint">Proof of Delivery confirmed</div>
                </div>

                <div className="dms-kpi-card">
                    <div className="dms-kpi-header">
                        <span className="dms-kpi-label">On-Time Rate</span>
                        <Clock size={16} className="dms-kpi-icon teal" />
                    </div>
                    <div className="dms-kpi-value" style={{ color: 'var(--primary, #00A99D)' }}>
                        {performance.onTimePercentage}%
                    </div>
                    <div className="dms-kpi-hint">DMS SLA Performance Target</div>
                </div>
            </div>

            {/* ── Filters & Search ── */}
            <div className="dms-controls-bar">
                <div className="dms-search-box">
                    <Search size={15} className="dms-search-icon" />
                    <input
                        type="text"
                        placeholder="Search by Waybill, Recipient, Task, Address, Driver ID..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="dms-search-input"
                    />
                    {searchQuery && (
                        <button type="button" className="dms-search-clear" onClick={() => setSearchQuery('')}>
                            <X size={13} />
                        </button>
                    )}
                </div>

                <div className="dms-filter-pills">
                    {[
                        { id: 'all', label: `All (${deliveries.length})` },
                        { id: 'transit', label: `In Transit (${stats.inTransit})` },
                        { id: 'delivered', label: `Delivered (${stats.delivered})` },
                        { id: 'failed', label: `Exceptions (${stats.failed})` },
                        { id: 'pending', label: 'Pending' },
                    ].map(f => (
                        <button
                            key={f.id}
                            type="button"
                            className={`dms-filter-btn ${statusFilter === f.id ? 'active' : ''}`}
                            onClick={() => setStatusFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Shipments Table ── */}
            <div className="dms-table-container">
                {loading && deliveries.length === 0 ? (
                    <div className="dms-empty-state">
                        <Loader2 size={24} className="spin" />
                        <p>Loading delivery shipments from DMS...</p>
                    </div>
                ) : filteredDeliveries.length === 0 ? (
                    <div className="dms-empty-state">
                        <Truck size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No delivery orders match the criteria.</p>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Completed tasks configured with delivery destinations automatically appear here.
                        </span>
                    </div>
                ) : (
                    <table className="dms-table">
                        <thead>
                            <tr>
                                <th>Waybill No</th>
                                <th>STARS Task</th>
                                <th>Recipient & Address</th>
                                <th>Driver ID</th>
                                <th>DMS Status</th>
                                <th>GPS Location</th>
                                <th>Last Ping</th>
                                <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDeliveries.map(item => (
                                <tr
                                    key={item.taskId}
                                    className="dms-table-row"
                                    onClick={() => setSelectedDelivery(item)}
                                >
                                    <td>
                                        {item.dmsWaybillNo ? (
                                            <div className="dms-waybill-cell">
                                                <span className="dms-waybill-text">{item.dmsWaybillNo}</span>
                                                <button
                                                    type="button"
                                                    className="dms-copy-icon-btn"
                                                    onClick={(e) => { e.stopPropagation(); handleCopy(item.dmsWaybillNo!); }}
                                                    title="Copy Waybill"
                                                >
                                                    {copiedWaybill === item.dmsWaybillNo ? (
                                                        <Check size={11} color="#059669" />
                                                    ) : (
                                                        <Copy size={11} />
                                                    )}
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="dms-no-waybill">Pending Creation</span>
                                        )}
                                    </td>

                                    <td>
                                        <div className="dms-task-cell">
                                            <span className="dms-task-title" title={item.taskTitle}>{item.taskTitle}</span>
                                            {item.taskReferenceNumber && (
                                                <span className="dms-task-ref">#{item.taskReferenceNumber}</span>
                                            )}
                                        </div>
                                    </td>

                                    <td>
                                        <div className="dms-recipient-cell">
                                            <span className="dms-recipient-name">{item.recipientName}</span>
                                            <span className="dms-recipient-addr" title={item.deliveryAddress}>
                                                <MapPin size={10} style={{ flexShrink: 0 }} />
                                                {item.deliveryAddress}
                                                {item.area && <strong style={{ marginLeft: 2 }}>({item.area})</strong>}
                                            </span>
                                        </div>
                                    </td>

                                    <td>
                                        {item.courierEmployeeId ? (
                                            <span className="dms-driver-badge">{item.courierEmployeeId}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Auto / Pool</span>
                                        )}
                                    </td>

                                    <td>
                                        {getStatusPill(item.dmsStatus, item.syncStatus)}
                                    </td>

                                    <td>
                                        {item.dmsLatitude && item.dmsLongitude ? (
                                            <a
                                                href={`https://www.google.com/maps?q=${item.dmsLatitude},${item.dmsLongitude}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="dms-gps-link"
                                                onClick={e => e.stopPropagation()}
                                                title="View live GPS location in Maps"
                                            >
                                                <Navigation size={11} />
                                                <span>{item.dmsLatitude.toFixed(3)}, {item.dmsLongitude.toFixed(3)}</span>
                                                <ExternalLink size={10} style={{ opacity: 0.7 }} />
                                            </a>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No GPS ping</span>
                                        )}
                                    </td>

                                    <td>
                                        <span className="dms-time-cell">
                                            {item.dmsLastSyncedAt ? new Date(item.dmsLastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <button
                                                type="button"
                                                className="dms-table-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onViewTask(item.taskId);
                                                }}
                                                title="Open Task Details"
                                            >
                                                <span>Details</span>
                                                <ChevronRight size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Shipment Journey Details Drawer / Modal ── */}
            {selectedDelivery && (
                <div className="dms-modal-overlay" onClick={() => setSelectedDelivery(null)}>
                    <div className="dms-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="dms-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="dms-modal-icon-wrap">
                                    <Truck size={18} />
                                </div>
                                <div>
                                    <h4 className="dms-modal-title">Live Delivery Tracker</h4>
                                    <span className="dms-modal-waybill">
                                        Waybill: {selectedDelivery.dmsWaybillNo || 'Pending'}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="dms-modal-close"
                                onClick={() => setSelectedDelivery(null)}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="dms-modal-body">
                            {/* Milestone Tracker */}
                            <div className="dms-stepper">
                                {[
                                    { title: 'Order Dispatched', desc: 'STARS Task Completed' },
                                    { title: 'Picked Up', desc: 'Driver assigned' },
                                    { title: 'In Transit', desc: 'Approaching destination' },
                                    { title: 'Delivered (POD)', desc: 'Proof of Delivery' },
                                ].map((step, idx) => {
                                    const activeIdx = getJourneyStepIndex(selectedDelivery.dmsStatus);
                                    const isDone = idx <= activeIdx;
                                    const isCurrent = idx === activeIdx;
                                    return (
                                        <div key={idx} className={`dms-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                                            <div className="dms-step-dot">
                                                {isDone ? <Check size={11} /> : idx + 1}
                                            </div>
                                            <div className="dms-step-info">
                                                <span className="dms-step-title">{step.title}</span>
                                                <span className="dms-step-desc">{step.desc}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Failure reason if any */}
                            {selectedDelivery.dmsFailureReason && (
                                <div className="dms-modal-alert">
                                    <AlertCircle size={14} style={{ color: '#ee5d50', flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                        <strong>Delivery Issue:</strong> {selectedDelivery.dmsFailureReason}
                                    </div>
                                </div>
                            )}

                            {/* Details Grid */}
                            <div className="dms-modal-grid">
                                <div className="dms-modal-field">
                                    <label>Recipient Name</label>
                                    <span>{selectedDelivery.recipientName}</span>
                                </div>
                                <div className="dms-modal-field">
                                    <label>Contact Number</label>
                                    <span>{selectedDelivery.recipientContact}</span>
                                </div>
                                <div className="dms-modal-field dms-modal-full">
                                    <label>Delivery Address</label>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <MapPin size={12} color="var(--primary)" />
                                        {selectedDelivery.deliveryAddress}
                                        {selectedDelivery.area && <strong>({selectedDelivery.area})</strong>}
                                    </span>
                                </div>
                                <div className="dms-modal-field">
                                    <label>Assigned Driver</label>
                                    <span>{selectedDelivery.courierEmployeeId || 'Not assigned'}</span>
                                </div>
                                <div className="dms-modal-field">
                                    <label>Current Status</label>
                                    <span>{selectedDelivery.dmsStatus}</span>
                                </div>
                                {selectedDelivery.dmsLatitude && selectedDelivery.dmsLongitude && (
                                    <div className="dms-modal-field dms-modal-full">
                                        <label>Live GPS Telemetry</label>
                                        <a
                                            href={`https://www.google.com/maps?q=${selectedDelivery.dmsLatitude},${selectedDelivery.dmsLongitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="dms-gps-link"
                                            style={{ marginTop: 2, display: 'inline-flex' }}
                                        >
                                            <Navigation size={12} />
                                            <span>Latitude: {selectedDelivery.dmsLatitude}, Longitude: {selectedDelivery.dmsLongitude}</span>
                                            <ExternalLink size={11} />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="dms-modal-footer">
                            <button
                                type="button"
                                className="dms-modal-secondary-btn"
                                onClick={() => setSelectedDelivery(null)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="dms-modal-primary-btn"
                                onClick={() => {
                                    const tId = selectedDelivery.taskId;
                                    setSelectedDelivery(null);
                                    onViewTask(tId);
                                }}
                            >
                                <span>Open STARS Task Details</span>
                                <ArrowRight size={13} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DmsDeliveryTab;
