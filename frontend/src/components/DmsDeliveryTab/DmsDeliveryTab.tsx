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
    ArrowLeft,
    ExternalLink,
    Package,
    Navigation,
    Calendar,
    ChevronRight,
    Loader2,
    X,
    Filter,
    Activity,
    Download,
    FileText,
    ChevronDown,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import StatusCard from '../StatusCard/StatusCard';
import Pagination from '../ui/Pagination';
import DeliveryAnalyticsCharts from './DeliveryAnalyticsCharts';
import {
    downloadDeliveryPdfReport,
    downloadDeliveryCsvReport,
} from './DeliveryReportExport';
import './DmsDeliveryTab.css';

export interface DmsDeliveryItem {
    taskId: string;
    taskTitle: string;
    taskNumber?: string;
    taskReferenceNumber?: string;
    recipientName: string;
    recipientContact: string;
    deliveryAddress: string;
    area?: string;
    packageDescription?: string;
    senderAddress?: string;
    specialInstructions?: string;
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
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [selectedDelivery, setSelectedDelivery] = useState<DmsDeliveryItem | null>(null);
    const [copiedWaybill, setCopiedWaybill] = useState<string | null>(null);
    const [autoSync, setAutoSync] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const exportMenuRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter]);

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
                setShowExportMenu(false);
            }
        };
        if (showExportMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showExportMenu]);

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

            // 1. Fetch all deliveries directly from the dedicated deliveries endpoint
            try {
                const res = await api.get('/api/dms-integration/deliveries');
                const list = res?.data?.data ?? res?.data;
                if (Array.isArray(list)) {
                    const sorted = [...list].sort((a, b) => {
                        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        if (dateB !== dateA) return dateB - dateA;
                        return (b.dmsOrderId || 0) - (a.dmsOrderId || 0);
                    });
                    setDeliveries(sorted);
                    return;
                }
            } catch {
                // Fall back to candidate tasks if endpoint unavailable
            }

            // Fallback: candidate tasks from props or fetch from task list
            let sourceTasks = tasks;
            if (!sourceTasks || sourceTasks.length === 0) {
                const res = await api.get('/api/Task?pageNumber=1&pageSize=100');
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
                                taskNumber: (t as any).taskNumber || (t as any).taskReferenceNumber,
                                taskReferenceNumber: (t as any).taskNumber || t.taskReferenceNumber || t.referenceNumber,
                                recipientName: d.recipientName || 'Operations Dispatch',
                                recipientContact: d.recipientContact || '—',
                                deliveryAddress: d.deliveryAddress || 'Metro Manila',
                                area: d.area || '',
                                packageDescription: d.packageDescription || t.taskTitle || '',
                                senderAddress: d.senderAddress,
                                specialInstructions: d.specialInstructions,
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
                .map(r => (r as PromiseFulfilledResult<DmsDeliveryItem>).value)
                .sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    if (dateB !== dateA) return dateB - dateA;
                    return (b.dmsOrderId || 0) - (a.dmsOrderId || 0);
                });

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
        if (!taskId) {
            toastError('Operational task must be created in STARS before running DMS integration.');
            return;
        }
        setSyncingId(taskId);
        try {
            await api.post(`/api/dms-integration/tasks/${taskId}/sync`, {});
            toastSuccess('Re-synced with DMS successfully.');
            await fetchDeliveries();
        } catch (err: any) {
            try {
                await api.post(`/api/dms-integration/tasks/${taskId}/resend`, {});
                toastSuccess('Dispatched and re-synced with DMS.');
                await fetchDeliveries();
            } catch (fallbackErr: any) {
                const msg = fallbackErr?.response?.data?.message || err?.response?.data?.message || err?.message || 'Re-sync failed.';
                toastError(msg);
            }
        } finally {
            setSyncingId(null);
        }
    };

    const handleSyncSelected = async () => {
        if (!selectedDelivery?.taskId) return;
        setSyncingId(selectedDelivery.taskId);
        try {
            await api.post(`/api/dms-integration/tasks/${selectedDelivery.taskId}/sync`, {});
            const res = await api.get<any>(`/api/dms-integration/tasks/${selectedDelivery.taskId}/delivery-details`);
            const data = res?.data?.data ?? res?.data;
            if (data) {
                setSelectedDelivery(prev => prev ? { ...prev, ...data } : null);
            }
            toastSuccess('Re-synced with DMS successfully.');
            await fetchDeliveries();
        } catch (err: any) {
            try {
                await api.post(`/api/dms-integration/tasks/${selectedDelivery.taskId}/resend`, {});
                const res = await api.get<any>(`/api/dms-integration/tasks/${selectedDelivery.taskId}/delivery-details`);
                const data = res?.data?.data ?? res?.data;
                if (data) {
                    setSelectedDelivery(prev => prev ? { ...prev, ...data } : null);
                }
                toastSuccess('Dispatched and re-synced with DMS.');
                await fetchDeliveries();
            } catch (fallbackErr: any) {
                const msg = fallbackErr?.response?.data?.message || err?.response?.data?.message || err?.message || 'Re-sync failed.';
                toastError(msg);
            }
        } finally {
            setSyncingId(null);
        }
    };

    // Filter, search, and sort (most recent created record first)
    const filteredDeliveries = useMemo(() => {
        const list = deliveries.filter(d => {
            // Status filter
            const s = (d.dmsStatus || '').toLowerCase();
            if (statusFilter === 'transit' && !(s.includes('transit') || s.includes('pickup') || s.includes('route') || s.includes('out'))) return false;
            if (statusFilter === 'delivered' && !(s.includes('delivered') || s.includes('completed'))) return false;
            if (statusFilter === 'failed' && !(s.includes('fail') || s.includes('cancel') || d.syncStatus === 'Failed')) return false;
            if (statusFilter === 'pending' && !(s.includes('pending') || !d.dmsWaybillNo)) return false;

            // Search query
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            const qClean = q.replace(/[\s-_]/g, '');
            const wbClean = (d.dmsWaybillNo || '').toLowerCase().replace(/[\s-_]/g, '');
            return (
                (d.dmsWaybillNo && d.dmsWaybillNo.toLowerCase().includes(q)) ||
                (qClean.length > 2 && wbClean.includes(qClean)) ||
                (d.taskTitle && d.taskTitle.toLowerCase().includes(q)) ||
                (d.recipientName && d.recipientName.toLowerCase().includes(q)) ||
                (d.deliveryAddress && d.deliveryAddress.toLowerCase().includes(q)) ||
                (d.area && d.area.toLowerCase().includes(q)) ||
                (d.courierEmployeeId && d.courierEmployeeId.toLowerCase().includes(q)) ||
                (d.dmsStatus && d.dmsStatus.toLowerCase().includes(q))
            );
        });

        // Always sort with most recent created record on top
        return list.sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (timeB !== timeA) return timeB - timeA;

            const orderA = a.dmsOrderId ?? 0;
            const orderB = b.dmsOrderId ?? 0;
            if (orderB !== orderA) return orderB - orderA;

            const numA = parseInt(String(a.taskNumber || a.taskReferenceNumber || '0').replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(String(b.taskNumber || b.taskReferenceNumber || '0').replace(/\D/g, ''), 10) || 0;
            return numB - numA;
        });
    }, [deliveries, statusFilter, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredDeliveries.length / pageSize));
    const paginatedDeliveries = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredDeliveries.slice(start, start + pageSize);
    }, [filteredDeliveries, currentPage, pageSize]);

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

    const getJourneyStepIndex = (status?: string, rawStatus?: string) => {
        const s = `${rawStatus || ''} ${status || ''}`.toLowerCase();
        if (s.includes('delivered') || s.includes('completed')) return 6;
        if (s.includes('out for delivery') || s.includes('doorstep')) return 5;
        if (s.includes('transit')) return 4;
        if (s.includes('picked up') || s.includes('pickup') || s.includes('pickedup')) return 3;
        if (s.includes('assigned') || s.includes('for pickup')) return 2;
        if (s.includes('processing') || s.includes('preparing')) return 1;
        return 0;
    };

    if (selectedDelivery) {
        const activeIdx = getJourneyStepIndex(selectedDelivery.dmsStatus, selectedDelivery.dmsRawStatus);
        const isDelivered = (selectedDelivery.dmsRawStatus || selectedDelivery.dmsStatus || '').toLowerCase().includes('delivered') || (selectedDelivery.dmsRawStatus || selectedDelivery.dmsStatus || '').toLowerCase().includes('completed');
        const progressPct = isDelivered ? 100 : (Math.min(activeIdx, 6) / 6) * 100;

        const journeySteps = [
            { title: 'Pending', desc: 'Order Created' },
            { title: 'Processing', desc: 'Preparing Dispatch' },
            { title: 'Assigned', desc: 'Driver Assigned' },
            { title: 'Picked Up', desc: 'Driver Collected' },
            { title: 'In Transit', desc: 'En Route to Hub' },
            { title: 'Out for Delivery', desc: 'Final Mile Delivery' },
            { title: 'Delivered (POD)', desc: 'Proof Confirmed' },
        ];

        return (
            <div className="dms-tab-container dms-detail-view-page">
                {/* ── Breadcrumb & Top Navigation Bar ── */}
                <div className="dms-detail-top-bar">
                    <div className="dms-detail-nav-left">
                        <button
                            type="button"
                            className="dms-detail-back-btn"
                            onClick={() => setSelectedDelivery(null)}
                        >
                            <ArrowLeft size={15} />
                            <span>Back to Deliveries</span>
                        </button>
                        <div className="dms-detail-breadcrumbs">
                            <span className="dms-breadcrumb-root">Delivery Management</span>
                            <span className="dms-breadcrumb-sep">/</span>
                            <span className="dms-breadcrumb-current">
                                Waybill: {selectedDelivery.dmsWaybillNo || `#${selectedDelivery.dmsOrderId || selectedDelivery.taskId}`}
                            </span>
                        </div>
                    </div>

                    <div className="dms-detail-nav-actions">
                        <button
                            type="button"
                            className="dms-action-btn"
                            disabled={syncingId === selectedDelivery.taskId}
                            onClick={handleSyncSelected}
                            title="Re-sync telemetry with DMS cloud"
                        >
                            <RefreshCw size={13} className={syncingId === selectedDelivery.taskId ? 'spin' : ''} />
                            <span>{syncingId === selectedDelivery.taskId ? 'Syncing...' : 'Sync with DMS'}</span>
                        </button>
                        <button
                            type="button"
                            className="dms-detail-primary-btn"
                            onClick={() => onViewTask(selectedDelivery.taskId)}
                        >
                            <span>Open STARS Task Details</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>

                {/* ── Hero Status Card ── */}
                <div className="dms-detail-hero-card">
                    <div className="dms-detail-hero-main">
                        <div className="dms-detail-hero-icon">
                            <Truck size={24} />
                        </div>
                        <div className="dms-detail-hero-content">
                            <div className="dms-detail-hero-title-row">
                                <h3 className="dms-detail-hero-title">Live Delivery Tracker</h3>
                                {getStatusPill(selectedDelivery.dmsStatus, selectedDelivery.syncStatus)}
                            </div>
                            <div className="dms-detail-hero-pills">
                                <div className="dms-detail-waybill-pill">
                                    <span className="dms-detail-pill-label">WAYBILL:</span>
                                    <span className="dms-detail-pill-code">{selectedDelivery.dmsWaybillNo || 'Pending Creation'}</span>
                                    {selectedDelivery.dmsWaybillNo && (
                                        <button
                                            type="button"
                                            className="dms-detail-copy-btn"
                                            onClick={() => handleCopy(selectedDelivery.dmsWaybillNo!)}
                                            title="Copy Waybill"
                                        >
                                            {copiedWaybill === selectedDelivery.dmsWaybillNo ? (
                                                <Check size={11} color="#059669" />
                                            ) : (
                                                <Copy size={11} />
                                            )}
                                            <span>{copiedWaybill === selectedDelivery.dmsWaybillNo ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    )}
                                </div>

                                {(selectedDelivery.taskNumber || selectedDelivery.taskReferenceNumber) && (
                                    <span className="dms-detail-task-tag">
                                        STARS #{selectedDelivery.taskNumber || selectedDelivery.taskReferenceNumber}
                                    </span>
                                )}

                                {selectedDelivery.dmsOrderId && (
                                    <span className="dms-detail-order-tag">
                                        DMS Order #{selectedDelivery.dmsOrderId}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="dms-detail-hero-pulse-wrap">
                        <span className="dms-detail-pulse-beacon" />
                        <span className="dms-detail-pulse-text">Live DMS Dispatch Active</span>
                    </div>
                </div>

                {/* ── 7-Stage Milestone Tracker (Full-Width, Single-Page, No-Scroll) ── */}
                <div className="dms-detail-stepper-card">
                    <div className="dms-detail-stepper-header">
                        <h4 className="dms-detail-section-title">Delivery Journey & Milestone Progression</h4>
                        <span className="dms-detail-stepper-summary">
                            Stage {isDelivered ? 7 : Math.min(activeIdx + 1, 7)} of 7: <strong>{selectedDelivery.dmsStatus}</strong>
                        </span>
                    </div>

                    <div className="dms-detail-stepper-track-wrap">
                        <div className="dms-detail-stepper-inner">
                        <div className="dms-detail-stepper-track">
                            <div
                                className="dms-detail-stepper-progress"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>

                        <div className="dms-detail-stepper">
                            {journeySteps.map((step, idx) => {
                                const isDone = isDelivered ? true : idx < activeIdx;
                                const isCurrent = !isDelivered && idx === activeIdx;
                                const isUpcoming = idx > activeIdx;

                                return (
                                    <div
                                        key={idx}
                                        className={`dms-detail-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isUpcoming ? 'upcoming' : ''}`}
                                    >
                                        <div className="dms-detail-step-dot">
                                            {isDone ? (
                                                <Check size={16} strokeWidth={2.8} />
                                            ) : isCurrent ? (
                                                <Clock size={16} strokeWidth={2.5} />
                                            ) : (
                                                <span>{idx + 1}</span>
                                            )}
                                        </div>
                                        <div className="dms-detail-step-text">
                                            <span className="dms-detail-step-title">{step.title}</span>
                                            <span className="dms-detail-step-desc">{step.desc}</span>
                                            {isCurrent && (
                                                <span className="dms-detail-step-badge current">In Progress</span>
                                            )}
                                            {isDone && (
                                                <span className="dms-detail-step-badge done">Completed</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </div>
                    </div>
                </div>

                {/* ── Failure / Exception Alert if Any ── */}
                {selectedDelivery.dmsFailureReason && (
                    <div className="dms-detail-alert-box">
                        <AlertCircle size={18} className="dms-detail-alert-icon" />
                        <div>
                            <strong className="dms-detail-alert-title">Delivery Issue / Exception Reported:</strong>
                            <p className="dms-detail-alert-msg">{selectedDelivery.dmsFailureReason}</p>
                        </div>
                    </div>
                )}

                {/* ── Comprehensive Details Grid (3 Polished Cards) ── */}
                <div className="dms-detail-grid">
                    {/* Card 1: Recipient & Destination */}
                    <div className="dms-detail-card">
                        <div className="dms-detail-card-header">
                            <MapPin size={16} className="dms-detail-card-icon" />
                            <h5>Recipient & Destination</h5>
                        </div>
                        <div className="dms-detail-card-body">
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Recipient Name</span>
                                <span className="dms-detail-val dms-detail-val-highlight">{selectedDelivery.recipientName || '—'}</span>
                            </div>
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Contact Number</span>
                                <span className="dms-detail-val">{selectedDelivery.recipientContact || '—'}</span>
                            </div>
                            <div className="dms-detail-row dms-detail-row-full">
                                <span className="dms-detail-label">Delivery Destination</span>
                                <span className="dms-detail-val dms-detail-addr">
                                    <MapPin size={13} style={{ flexShrink: 0, color: 'var(--primary, #00A99D)' }} />
                                    <span>
                                        {selectedDelivery.deliveryAddress || '—'}
                                        {selectedDelivery.area && <strong style={{ marginLeft: 4 }}>({selectedDelivery.area})</strong>}
                                    </span>
                                </span>
                            </div>
                            {selectedDelivery.packageDescription && (
                                <div className="dms-detail-row dms-detail-row-full">
                                    <span className="dms-detail-label">Package Description</span>
                                    <span className="dms-detail-val">{selectedDelivery.packageDescription}</span>
                                </div>
                            )}
                            {selectedDelivery.specialInstructions && (
                                <div className="dms-detail-row dms-detail-row-full">
                                    <span className="dms-detail-label">Special Delivery Instructions</span>
                                    <span className="dms-detail-val dms-detail-instructions">{selectedDelivery.specialInstructions}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card 2: Logistics & Dispatch Operations */}
                    <div className="dms-detail-card">
                        <div className="dms-detail-card-header">
                            <Truck size={16} className="dms-detail-card-icon" />
                            <h5>Logistics & Carrier Operations</h5>
                        </div>
                        <div className="dms-detail-card-body">
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Assigned Courier</span>
                                <span className="dms-detail-val">
                                    {selectedDelivery.courierEmployeeId ? (
                                        <span className="dms-detail-driver-badge">{selectedDelivery.courierEmployeeId}</span>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>Auto-assigned by DMS pool</span>
                                    )}
                                </span>
                            </div>
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Linked STARS Task</span>
                                <span className="dms-detail-val">
                                    <button
                                        type="button"
                                        className="dms-detail-inline-task-btn"
                                        onClick={() => onViewTask(selectedDelivery.taskId)}
                                    >
                                        <span>{selectedDelivery.taskTitle}</span>
                                        <ExternalLink size={11} />
                                    </button>
                                </span>
                            </div>
                            {selectedDelivery.senderAddress && (
                                <div className="dms-detail-row dms-detail-row-full">
                                    <span className="dms-detail-label">Sender Pickup Address</span>
                                    <span className="dms-detail-val">{selectedDelivery.senderAddress}</span>
                                </div>
                            )}
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Fulfillment Channel</span>
                                <span className="dms-detail-val">DMS Express Dispatch</span>
                            </div>
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Created At</span>
                                <span className="dms-detail-val">
                                    {selectedDelivery.createdAt ? new Date(selectedDelivery.createdAt).toLocaleString() : '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Real-Time Telemetry & Tracking */}
                    <div className="dms-detail-card">
                        <div className="dms-detail-card-header">
                            <Activity size={16} className="dms-detail-card-icon" />
                            <h5>Live Telemetry & Tracking</h5>
                        </div>
                        <div className="dms-detail-card-body">
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Current Status</span>
                                <span className="dms-detail-val">
                                    <strong>{selectedDelivery.dmsStatus}</strong>
                                    {selectedDelivery.dmsRawStatus && selectedDelivery.dmsRawStatus !== selectedDelivery.dmsStatus && (
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>
                                            ({selectedDelivery.dmsRawStatus})
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="dms-detail-row">
                                <span className="dms-detail-label">Cloud Sync State</span>
                                <span className="dms-detail-val">
                                    <span className={`dms-sync-badge ${selectedDelivery.syncStatus?.toLowerCase() || ''}`}>
                                        {selectedDelivery.syncStatus || 'Synced'}
                                    </span>
                                </span>
                            </div>
                            <div className="dms-detail-row dms-detail-row-full">
                                <span className="dms-detail-label">Live GPS Coordinates</span>
                                <span className="dms-detail-val">
                                    {selectedDelivery.dmsLatitude && selectedDelivery.dmsLongitude ? (
                                        <a
                                            href={`https://www.google.com/maps?q=${selectedDelivery.dmsLatitude},${selectedDelivery.dmsLongitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="dms-detail-gps-link"
                                        >
                                            <Navigation size={13} />
                                            <span>{selectedDelivery.dmsLatitude.toFixed(4)}, {selectedDelivery.dmsLongitude.toFixed(4)}</span>
                                            <ExternalLink size={12} />
                                        </a>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No GPS ping recorded</span>
                                    )}
                                </span>
                            </div>
                            <div className="dms-detail-row dms-detail-row-full">
                                <span className="dms-detail-label">Last Synced Ping</span>
                                <span className="dms-detail-val">
                                    {selectedDelivery.dmsLastSyncedAt ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={12} color="var(--sidebar-text)" />
                                            {new Date(selectedDelivery.dmsLastSyncedAt).toLocaleString()}
                                        </span>
                                    ) : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Action Footer Bar ── */}
                <div className="dms-detail-footer">
                    <button
                        type="button"
                        className="dms-detail-footer-btn-secondary"
                        onClick={() => setSelectedDelivery(null)}
                    >
                        <ArrowLeft size={14} />
                        <span>Return to Deliveries List</span>
                    </button>
                    <button
                        type="button"
                        className="dms-detail-footer-btn-primary"
                        onClick={() => onViewTask(selectedDelivery.taskId)}
                    >
                        <span>Open STARS Task Details</span>
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        );
    }

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
                    {/* Download Report Button & Dropdown */}
                    <div className="dms-export-wrapper" ref={exportMenuRef}>
                        <button
                            type="button"
                            className="dms-export-btn"
                            onClick={() => setShowExportMenu(v => !v)}
                            disabled={isExporting}
                            title="Download Delivery Summary Report"
                        >
                            <Download size={13} />
                            <span>Download Report</span>
                            <ChevronDown
                                size={12}
                                style={{
                                    transform: showExportMenu ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.15s ease',
                                }}
                            />
                        </button>

                        {showExportMenu && (
                            <div className="dms-export-dropdown">
                                <button
                                    type="button"
                                    className="dms-export-item"
                                    onClick={() => {
                                        try {
                                            setIsExporting(true);
                                            const targetList = filteredDeliveries.length > 0 ? filteredDeliveries : deliveries;
                                            const scope = filteredDeliveries.length < deliveries.length && filteredDeliveries.length > 0
                                                ? `Filtered (${filteredDeliveries.length} items)`
                                                : `All (${deliveries.length} items)`;
                                            downloadDeliveryPdfReport(targetList, performance, stats, scope);
                                            toastSuccess('Delivery summary PDF report downloaded successfully!');
                                        } catch (err) {
                                            toastError('Failed to generate PDF report.');
                                        } finally {
                                            setIsExporting(false);
                                            setShowExportMenu(false);
                                        }
                                    }}
                                >
                                    <div className="dms-export-icon-box pdf">
                                        <FileText size={15} />
                                    </div>
                                    <div className="dms-export-text">
                                        <span className="dms-export-title">Executive PDF Report</span>
                                        <span className="dms-export-desc">Formatted document with KPIs & tables</span>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    className="dms-export-item"
                                    onClick={() => {
                                        try {
                                            setIsExporting(true);
                                            const targetList = filteredDeliveries.length > 0 ? filteredDeliveries : deliveries;
                                            const scope = filteredDeliveries.length < deliveries.length && filteredDeliveries.length > 0
                                                ? `Filtered (${filteredDeliveries.length} items)`
                                                : `All (${deliveries.length} items)`;
                                            downloadDeliveryCsvReport(targetList, performance, stats, scope);
                                            toastSuccess('Delivery summary CSV report downloaded successfully!');
                                        } catch (err) {
                                            toastError('Failed to generate CSV report.');
                                        } finally {
                                            setIsExporting(false);
                                            setShowExportMenu(false);
                                        }
                                    }}
                                >
                                    <div className="dms-export-icon-box csv">
                                        <FileText size={15} />
                                    </div>
                                    <div className="dms-export-text">
                                        <span className="dms-export-title">Spreadsheet CSV Data</span>
                                        <span className="dms-export-desc">Full shipment registry for Excel</span>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

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
                <StatusCard
                    icon={<Package size={20} strokeWidth={2.3} />}
                    variant="teal"
                    label="Total Shipments"
                    value={stats.total}
                    subtext="Linked with STARS tasks"
                />
                <StatusCard
                    icon={<Truck size={20} strokeWidth={2.3} />}
                    variant="warning"
                    label="Active in Transit"
                    value={stats.inTransit}
                    subtext="Driver on road / Out for Delivery"
                />
                <StatusCard
                    icon={<CheckCircle2 size={20} strokeWidth={2.3} />}
                    variant="success"
                    label="Delivered (POD)"
                    value={stats.delivered}
                    subtext="Proof of Delivery confirmed"
                />
                <StatusCard
                    icon={<Clock size={20} strokeWidth={2.3} />}
                    variant="teal"
                    label="On-Time Rate"
                    value={`${performance.onTimePercentage}%`}
                    subtext="DMS SLA Performance Target"
                />
            </div>

            {/* ── Delivery Analytics & Visual Graphs ── */}
            <DeliveryAnalyticsCharts
                deliveries={deliveries}
                performance={performance}
                stats={stats}
            />

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
                    <>
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
                            {paginatedDeliveries.map(item => (
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
                                            {(item.taskNumber || item.taskReferenceNumber) && (
                                                <span className="dms-task-ref">#{item.taskNumber || item.taskReferenceNumber}</span>
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
                                                className="dms-table-btn dms-table-track-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDelivery(item);
                                                }}
                                                title="View Live Delivery Tracker"
                                            >
                                                <Truck size={12} />
                                                <span>Track</span>
                                            </button>
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
                    {filteredDeliveries.length > 0 && (
                        <div className="dms-pagination-bar">
                            <span className="dms-pagination-info">
                                Showing {filteredDeliveries.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredDeliveries.length)} of {filteredDeliveries.length} shipments
                            </span>
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
                        </div>
                    )}
                    </>
                )}
            </div>
        </div>
    );
};

export default DmsDeliveryTab;
