import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ClipboardCheck,
    Search,
    RefreshCw,
    Package,
    MapPin,
    Clock,
    CheckCircle2,
    Copy,
    Check,
    PlusCircle,
    ExternalLink,
    Truck,
    ShieldAlert,
    Filter
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import StatusCard from '../StatusCard/StatusCard';
import Pagination from '../ui/Pagination';
import { formatDeadlineWithRemaining, formatDateOnly } from '../../utils/dateUtils';
import { formatDriverDisplay } from '../../utils/driverUtils';
import { formatStatus } from '../../utils/statusUtils';
import { getCreatedDmsOrderKeys } from '../../utils/dmsSyncUtils';
import './PreDeliveryTab.css';

export interface DmsPendingOrder {
    orderId: number;
    waybillNo: string;
    clientName: string;
    clientType: string;
    contactNumber: string;
    senderAddress: string;
    recipientName: string;
    recipientContact: string;
    recipientAddress: string;
    area: string;
    route: string;
    status: string;
    taskType: string;
    packageType: string;
    packageDescription: string;
    itemCount: number;
    weight: string;
    priority: string;
    specialInstructions?: string;
    orderDate: string;
    expectedDelivery: string;
    expectedDeliveryDate?: string;
    driverEmployeeId?: string;
    driverName?: string;
    courierFullName?: string;
    driverIsActive?: boolean;
}

interface PreDeliveryTabProps {
    tasks?: any[];
    onCreateTaskForOrder: (order: DmsPendingOrder) => void;
    onViewTask?: (taskId: string) => void;
    onNavigateToDeliveryTracker?: () => void;
}

// Helpers to detect mock data and sort newly created records to the top
const isMockOrder = (o: any): boolean => {
    if (!o) return false;
    if (o.isMock || o.mock) return true;
    const testPattern = /\b(mock|sample|dummy|test\s*order|test\s*recipient|dummy\s*data)\b/i;
    const checkFields = [
        o.recipientName,
        o.clientName,
        o.waybillNo,
        o.packageDescription,
        o.specialInstructions,
    ];
    return checkFields.some(f => typeof f === 'string' && testPattern.test(f));
};

const isMockTask = (t: any): boolean => {
    if (!t) return false;
    if (t.isMock || t.mock) return true;
    const testPattern = /\b(mock|sample|dummy|demo\s*task|test\s*task|dummy\s*data)\b/i;
    const checkFields = [
        t.taskTitle,
        t.title,
        t.name,
        t.taskDescription,
        t.description,
        t.assignedEmployee,
    ];
    return checkFields.some(f => typeof f === 'string' && testPattern.test(f));
};

const parseOrderTimestamp = (order: any): number => {
    const raw = order.orderDate || order.createdAt || order.order_date || order.created_at;
    if (raw) {
        const time = new Date(raw).getTime();
        if (!isNaN(time) && time > 0) return time;
    }
    return 0;
};

const extractOrderId = (order: any): number => {
    if (typeof order.orderId === 'number') return order.orderId;
    if (typeof order.id === 'number') return order.id;
    const num = parseInt(String(order.orderId || order.id || '0').replace(/\D/g, ''), 10);
    return isNaN(num) ? 0 : num;
};

const sortPendingOrdersDesc = (orders: DmsPendingOrder[]): DmsPendingOrder[] => {
    return [...orders].sort((a, b) => {
        const timeA = parseOrderTimestamp(a);
        const timeB = parseOrderTimestamp(b);
        const idA = extractOrderId(a);
        const idB = extractOrderId(b);

        // Sort by creation timestamp (most recent first)
        if (timeB !== timeA) return timeB - timeA;
        // Newly created orders in DMS with higher auto-increment IDs appear on top
        return idB - idA;
    });
};

const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };
const STATUS_LABELS: Record<number, string> = {
    0: 'Assigned',
    1: 'In Progress',
    2: 'Pending Admin Review',
    3: 'Completed',
    4: 'On Hold',
    5: 'Cancelled',
};

const normalizeTaskStatusValue = (rawStatus: any): string => {
    if (typeof rawStatus === 'number') {
        return STATUS_LABELS[rawStatus] ?? 'Assigned';
    }
    if (typeof rawStatus === 'string') {
        const lower = rawStatus.trim().toLowerCase();
        if (lower === 'completed' || lower === 'done') return 'Completed';
        if (lower === 'cancelled' || lower === 'canceled') return 'Cancelled';
        if (lower === 'onhold' || lower === 'on hold') return 'On Hold';
        if (lower === 'inprogress' || lower === 'in progress') return 'In Progress';
        if (lower === 'donependingreview' || lower === 'pending admin review' || lower === 'pending review' || lower === 'in review') {
            return 'Pending Admin Review';
        }
        if (lower === 'notstarted' || lower === 'assigned' || lower === 'to do' || lower === 'backlog' || lower === 'pending') {
            return 'Assigned';
        }
        if (rawStatus.trim()) return rawStatus.trim();
    }
    return 'Assigned';
};

const normalizePriorityValue = (rawPriority: any): string => {
    if (typeof rawPriority === 'number') {
        return PRIORITY_LABELS[rawPriority] ?? 'Medium';
    }
    if (typeof rawPriority === 'string' && rawPriority.trim()) {
        return rawPriority.trim();
    }
    return 'Medium';
};

export const PreDeliveryTab: React.FC<PreDeliveryTabProps> = ({
    tasks = [],
    onCreateTaskForOrder,
    onViewTask,
    onNavigateToDeliveryTracker,
}) => {
    const { success: toastSuccess } = useToast();
    const [pendingOrders, setPendingOrders] = useState<DmsPendingOrder[]>([]);
    const [liveOperationalTasks, setLiveOperationalTasks] = useState<any[]>([]);
    const [liveDeliveries, setLiveDeliveries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<'pending' | 'in_validation' | 'completed'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [copiedWaybill, setCopiedWaybill] = useState<string | null>(null);
    const [createdOrderKeys, setCreatedOrderKeys] = useState<Set<string>>(() => getCreatedDmsOrderKeys());

    const fetchPendingOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/dms-integration/pending-orders');
            const data = res?.data?.data ?? res?.data;
            if (Array.isArray(data)) {
                const nonMock = data.filter(o => !isMockOrder(o));
                const sorted = sortPendingOrdersDesc(nonMock);
                setPendingOrders(sorted);
            } else {
                setPendingOrders([]);
            }
        } catch (err: any) {
            console.error('Failed to load pending DMS orders', err);
            // Fallback gracefully so page remains operational
            setPendingOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchLiveOperationalTasks = useCallback(async () => {
        try {
            const [taskRes, delRes] = await Promise.allSettled([
                api.get('/api/Task?pageNumber=1&pageSize=100'),
                api.get('/api/dms-integration/deliveries'),
            ]);
            if (taskRes.status === 'fulfilled') {
                const json = taskRes.value?.data;
                const data = json?.items ?? json?.data?.items ?? json?.data ?? json;
                if (Array.isArray(data)) {
                    // Guard against generic test mocks that return DmsPendingOrder[]
                    const validTasks = data.filter(
                        (item: any) => item && (item.id || item.taskId) && (item.title || item.taskTitle || item.name)
                    );
                    setLiveOperationalTasks(validTasks);
                }
            }
            if (delRes.status === 'fulfilled') {
                const json = delRes.value?.data;
                const data = json?.data ?? json;
                if (Array.isArray(data)) {
                    const validDeliveries = data.filter(
                        (item: any) => item && item.taskId !== undefined && (item.dmsWaybillNo || item.dmsOrderId)
                    );
                    setLiveDeliveries(validDeliveries);
                }
            }
        } catch {
            // prop tasks fallback
        }
    }, []);

    useEffect(() => {
        fetchPendingOrders();
        fetchLiveOperationalTasks();
    }, [fetchPendingOrders, fetchLiveOperationalTasks]);

    // Listen for DMS task creation or completion events to keep tabs immediately in sync
    useEffect(() => {
        const handleDmsTaskCreated = (e: any) => {
            const detail = e.detail;
            if (detail?.orderId || detail?.waybillNo) {
                setCreatedOrderKeys(prev => {
                    const next = new Set(prev);
                    if (detail.orderId && String(detail.orderId) !== '0') next.add(String(detail.orderId));
                    if (detail.waybillNo) next.add(String(detail.waybillNo).toLowerCase().trim());
                    return next;
                });
            }
            fetchPendingOrders();
            fetchLiveOperationalTasks();
            setActiveSubTab('in_validation');
        };
        const handleDmsTaskUpdated = () => {
            setCreatedOrderKeys(getCreatedDmsOrderKeys());
            fetchPendingOrders();
            fetchLiveOperationalTasks();
        };
        window.addEventListener('stars:dms-task-created', handleDmsTaskCreated);
        window.addEventListener('stars:dms-task-updated', handleDmsTaskUpdated);
        return () => {
            window.removeEventListener('stars:dms-task-created', handleDmsTaskCreated);
            window.removeEventListener('stars:dms-task-updated', handleDmsTaskUpdated);
        };
    }, [fetchPendingOrders, fetchLiveOperationalTasks]);

    const handleCopy = (waybill: string) => {
        navigator.clipboard.writeText(waybill);
        setCopiedWaybill(waybill);
        toastSuccess(`Waybill ${waybill} copied!`);
        setTimeout(() => setCopiedWaybill(null), 2500);
    };

    const linkedTaskIds = useMemo(() => {
        const set = new Set<string>();
        liveDeliveries.forEach(d => {
            if (d.taskId) set.add(String(d.taskId));
        });
        return set;
    }, [liveDeliveries]);

    // Combine prop tasks and live operational tasks (prop tasks take precedence for immediate local updates)
    const allKnownTasks = useMemo(() => {
        const map = new Map<string, any>();
        [...tasks, ...liveOperationalTasks].forEach(t => {
            const id = String(t.taskId || t.id || '');
            if (!id) return;
            if (!map.has(id)) {
                map.set(id, {
                    ...t,
                    _id: id,
                    _title: t.taskTitle || t.title || t.name || '',
                    _desc: t.taskDescription || t.description || '',
                    _category: t.taskCategory || t.project || '',
                    _number: t.taskNumber || t.taskReferenceNumber || t.referenceNumber || '',
                    _assignee:
                        t.assignedEmployee ||
                        t.assignee?.name ||
                        (Array.isArray(t.assignees) && t.assignees[0]?.fullName) ||
                        (t.assignedTo ? 'Assigned' : ''),
                    _priority: normalizePriorityValue(t.priority ?? t.priorityLevel),
                    _status: normalizeTaskStatusValue(t.taskStatus ?? t.status),
                    _dueAt: t.dueAt || t.dueDate || t.revisedDeadline || t.deadline || null,
                });
            }
        });
        return Array.from(map.values());
    }, [tasks, liveOperationalTasks]);

    // Detect if a DMS pending order has already been created as a task in STARS
    const isOrderCreatedAsTask = useCallback((o: DmsPendingOrder): boolean => {
        const orderIdStr = String(o.orderId || '');
        const wbLower = (o.waybillNo || '').toLowerCase().trim();
        if (orderIdStr && orderIdStr !== '0' && createdOrderKeys.has(orderIdStr)) return true;
        if (wbLower && createdOrderKeys.has(wbLower)) return true;

        if (liveDeliveries.some(d =>
            d.taskId &&
            d.taskId !== '00000000-0000-0000-0000-000000000000' &&
            ((o.orderId && d.dmsOrderId === o.orderId) ||
             (wbLower && (d.dmsWaybillNo || '').toLowerCase().trim() === wbLower))
        )) {
            return true;
        }

        return allKnownTasks.some(t => {
            if (isMockTask(t) || t._status === 'Cancelled' || t.deleted || t.isDeleted) return false;
            const del = t.deliveryDetails;
            if (del) {
                if (o.orderId && del.dmsOrderId === o.orderId) return true;
                if (wbLower && (del.dmsWaybillNo || '').toLowerCase().trim() === wbLower) return true;
            }
            const title = (t._title || '').toLowerCase();
            const desc = (t._desc || '').toLowerCase();
            if (wbLower && (title.includes(wbLower) || desc.includes(wbLower))) return true;
            return false;
        });
    }, [createdOrderKeys, liveDeliveries, allKnownTasks]);

    // Filter pending orders (mock data excluded, already-created orders excluded, newest first)
    const filteredPending = useMemo(() => {
        const nonMock = pendingOrders.filter(o => !isMockOrder(o) && !isOrderCreatedAsTask(o));
        const sorted = sortPendingOrdersDesc(nonMock);
        return sorted.filter(o => {
            if (priorityFilter !== 'all' && (o.priority || '').toLowerCase() !== priorityFilter.toLowerCase()) {
                return false;
            }
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (o.waybillNo && o.waybillNo.toLowerCase().includes(q)) ||
                (o.recipientName && o.recipientName.toLowerCase().includes(q)) ||
                (o.recipientAddress && o.recipientAddress.toLowerCase().includes(q)) ||
                (o.area && o.area.toLowerCase().includes(q)) ||
                (o.packageDescription && o.packageDescription.toLowerCase().includes(q)) ||
                (o.clientName && o.clientName.toLowerCase().includes(q))
            );
        });
    }, [pendingOrders, priorityFilter, searchQuery, isOrderCreatedAsTask]);

    // Operational tasks in pre-delivery validation (mock data excluded, most recently created task on top)
    const operationalValidationTasks = useMemo(() => {
        const list = allKnownTasks.filter(t => {
            if (isMockTask(t) || t.deleted || t.isDeleted) return false;
            const isDelivery = t._category === 'Delivery Operations' ||
                t._title.toLowerCase().includes('delivery') ||
                t._desc.toLowerCase().includes('pre-delivery') ||
                Boolean(t.deliveryDetails) ||
                linkedTaskIds.has(t._id);
            return isDelivery;
        });
        return [...list].sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (dateB !== dateA) return dateB - dateA;
            const idA = extractOrderId(a);
            const idB = extractOrderId(b);
            if (idB !== idA) return idB - idA;
            return String(b._id).localeCompare(String(a._id));
        });
    }, [allKnownTasks, linkedTaskIds]);

    // Strictly separate active validation tasks from completed/cancelled ones
    const activeValidationTasks = useMemo(() => {
        return operationalValidationTasks.filter(t => {
            const s = (t._status || '').toLowerCase();
            return s !== 'completed' && s !== 'done' && s !== 'cancelled' && s !== 'canceled';
        });
    }, [operationalValidationTasks]);

    const completedValidationTasks = useMemo(() => {
        return operationalValidationTasks.filter(t => {
            const s = (t._status || '').toLowerCase();
            return s === 'completed' || s === 'done';
        });
    }, [operationalValidationTasks]);

    const filteredValidationTasks = useMemo(() => {
        return activeValidationTasks.filter(t => {
            if (priorityFilter !== 'all' && (t._priority || '').toLowerCase() !== priorityFilter.toLowerCase()) {
                return false;
            }
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (t._number && t._number.toLowerCase().includes(q)) ||
                (t._title && t._title.toLowerCase().includes(q)) ||
                (t._assignee && t._assignee.toLowerCase().includes(q)) ||
                (t._status && t._status.toLowerCase().includes(q))
            );
        });
    }, [activeValidationTasks, priorityFilter, searchQuery]);

    const filteredCompletedTasks = useMemo(() => {
        return completedValidationTasks.filter(t => {
            if (priorityFilter !== 'all' && (t._priority || '').toLowerCase() !== priorityFilter.toLowerCase()) {
                return false;
            }
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (t._number && t._number.toLowerCase().includes(q)) ||
                (t._title && t._title.toLowerCase().includes(q)) ||
                (t._assignee && t._assignee.toLowerCase().includes(q)) ||
                (t._status && t._status.toLowerCase().includes(q))
            );
        });
    }, [completedValidationTasks, priorityFilter, searchQuery]);

    const [pendingPage, setPendingPage] = useState(1);
    const [validationPage, setValidationPage] = useState(1);
    const [completedPage, setCompletedPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        setPendingPage(1);
        setValidationPage(1);
        setCompletedPage(1);
    }, [searchQuery, priorityFilter, activeSubTab]);

    const pendingTotalPages = Math.max(1, Math.ceil(filteredPending.length / pageSize));
    const validationTotalPages = Math.max(1, Math.ceil(filteredValidationTasks.length / pageSize));
    const completedTotalPages = Math.max(1, Math.ceil(filteredCompletedTasks.length / pageSize));

    const pagedPending = useMemo(() => {
        const start = (pendingPage - 1) * pageSize;
        return filteredPending.slice(start, start + pageSize);
    }, [filteredPending, pendingPage, pageSize]);

    const pagedValidationTasks = useMemo(() => {
        const start = (validationPage - 1) * pageSize;
        return filteredValidationTasks.slice(start, start + pageSize);
    }, [filteredValidationTasks, validationPage, pageSize]);

    const pagedCompletedTasks = useMemo(() => {
        const start = (completedPage - 1) * pageSize;
        return filteredCompletedTasks.slice(start, start + pageSize);
    }, [filteredCompletedTasks, completedPage, pageSize]);

    // Stats calculations
    const stats = useMemo(() => {
        const unlinkedPending = pendingOrders.filter(o => !isMockOrder(o) && !isOrderCreatedAsTask(o));
        const totalPending = unlinkedPending.length;
        const urgentOrHigh = unlinkedPending.filter(o => {
            const p = (o.priority || '').toLowerCase();
            return p === 'urgent' || p === 'high';
        }).length;
        const inValidationCount = activeValidationTasks.length;
        const completedValidationCount = completedValidationTasks.length;

        return { totalPending, urgentOrHigh, inValidationCount, completedValidationCount };
    }, [pendingOrders, isOrderCreatedAsTask, activeValidationTasks, completedValidationTasks]);

    const getPriorityClass = (priority: string) => {
        const p = (priority || '').toLowerCase();
        if (p === 'urgent') return 'priority-urgent';
        if (p === 'high') return 'priority-high';
        if (p === 'low') return 'priority-low';
        return 'priority-medium';
    };

    return (
        <div className="pre-delivery-container">
            {/* Header */}
            <div className="pre-delivery-header">
                <div className="pre-delivery-title-area">
                    <span className="pre-delivery-title-badge">
                        <Truck size={14} /> DMS Operational Integration
                    </span>
                    <h2 className="pre-delivery-title">Pre-Delivery Operational Task Validation</h2>
                    <p className="pre-delivery-subtitle">
                        Identify delivery orders from DMS that have not yet been assigned to an operational task in STARS,
                        create the necessary STARS task, and validate the order prior to dispatch.
                    </p>
                </div>
                <div className="pre-delivery-actions">
                    <button
                        className="pre-delivery-btn pre-delivery-btn-secondary"
                        onClick={() => {
                            fetchPendingOrders();
                            fetchLiveOperationalTasks();
                        }}
                        disabled={loading}
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                        Refresh Orders
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="pre-delivery-kpi-grid">
                <div onClick={() => setActiveSubTab('pending')} style={{ cursor: 'pointer' }}>
                    <StatusCard
                        icon={<Clock size={20} strokeWidth={2.3} />}
                        variant="warning"
                        label="Pending Validation"
                        value={stats.totalPending}
                        subtext="DMS orders awaiting STARS task"
                    />
                </div>
                <StatusCard
                    icon={<ShieldAlert size={20} strokeWidth={2.3} />}
                    variant="danger"
                    label="Urgent / High Priority"
                    value={stats.urgentOrHigh}
                    subtext="Requires immediate dispatch"
                />
                <div onClick={() => setActiveSubTab('in_validation')} style={{ cursor: 'pointer' }}>
                    <StatusCard
                        icon={<ClipboardCheck size={20} strokeWidth={2.3} />}
                        variant="teal"
                        label="Tasks in Validation"
                        value={stats.inValidationCount}
                        subtext="Active operational validation"
                    />
                </div>
                <div onClick={() => setActiveSubTab('completed')} style={{ cursor: 'pointer' }}>
                    <StatusCard
                        icon={<CheckCircle2 size={20} strokeWidth={2.3} />}
                        variant="success"
                        label="Validated & Dispatched"
                        value={stats.completedValidationCount}
                        subtext="Completed validation tasks"
                    />
                </div>
            </div>

            {/* Sub-navigation Tabs */}
            <div className="pre-delivery-nav-tabs">
                <button
                    className={`pre-delivery-tab-btn ${activeSubTab === 'pending' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('pending')}
                >
                    <Package size={16} />
                    Awaiting STARS Task
                    <span className="pre-delivery-tab-count">{stats.totalPending}</span>
                </button>
                <button
                    className={`pre-delivery-tab-btn ${activeSubTab === 'in_validation' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('in_validation')}
                >
                    <ClipboardCheck size={16} />
                    Active Validation Tasks
                    <span className="pre-delivery-tab-count">{activeValidationTasks.length}</span>
                </button>
                <button
                    className={`pre-delivery-tab-btn ${activeSubTab === 'completed' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('completed')}
                >
                    <CheckCircle2 size={16} />
                    Completed Tasks
                    <span className="pre-delivery-tab-count">{completedValidationTasks.length}</span>
                </button>
            </div>

            {/* Controls Bar */}
            <div className="pre-delivery-controls">
                <div className="pre-delivery-search-wrapper">
                    <Search size={16} className="pre-delivery-search-icon" />
                    <input
                        type="text"
                        className="pre-delivery-search-input"
                        placeholder={
                            activeSubTab === 'pending'
                                ? "Search by waybill, recipient, area, package..."
                                : "Search tasks by title, number, assignee..."
                        }
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="pre-delivery-filters">
                    <Filter size={15} color="var(--text-secondary)" />
                    <select
                        className="pre-delivery-select"
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value)}
                    >
                        <option value="all">All Priorities</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>
            </div>

            {/* Content Table */}
            <div className="pre-delivery-table-card">
                {activeSubTab === 'pending' && (
                    <div className="pre-delivery-table-wrapper">
                        {filteredPending.length === 0 ? (
                            <div className="empty-state">
                                <Package className="empty-state-icon" />
                                <h3 className="empty-state-title">No Pending Pre-Delivery Orders</h3>
                                <p className="empty-state-desc">
                                    All delivery orders from the Delivery Management System have been linked to operational tasks or validated.
                                </p>
                            </div>
                        ) : (
                            <>
                                <table className="pre-delivery-table">
                                    <thead>
                                        <tr>
                                            <th>Waybill No</th>
                                            <th>Recipient & Contact</th>
                                            <th>Delivery Location</th>
                                            <th>Package / Item</th>
                                            <th>Priority</th>
                                            <th>Order Date</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedPending.map(order => (
                                            <tr key={order.orderId || order.waybillNo}>
                                                <td>
                                                    <div className="waybill-cell">
                                                        <span>{order.waybillNo}</span>
                                                        <button
                                                            className="copy-btn"
                                                            title="Copy Waybill"
                                                            onClick={() => handleCopy(order.waybillNo)}
                                                        >
                                                            {copiedWaybill === order.waybillNo ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{order.recipientName}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{order.recipientContact}</div>
                                                </td>
                                                <td>
                                                    <div>{order.recipientAddress}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <MapPin size={12} /> {order.area || order.route || 'Unassigned Area'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div>{order.packageDescription || 'Parcel'}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {order.weight || '1.0 kg'} • {order.packageType || 'Standard'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`priority-badge ${getPriorityClass(order.priority)}`}>
                                                        {order.priority || 'Medium'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: '0.8125rem' }}>
                                                        {order.orderDate ? formatDateOnly(order.orderDate) : 'N/A'}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} data-testid="pre-delivery-due-date">
                                                        Due: {order.expectedDeliveryDate || order.expectedDelivery ? formatDateOnly(order.expectedDeliveryDate || order.expectedDelivery) : 'N/A'}
                                                    </div>
                                                    {(order.driverEmployeeId || order.driverName || order.courierFullName) && (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }} data-testid="pre-delivery-driver">
                                                            Driver: {formatDriverDisplay(order.driverName || order.courierFullName, order.driverEmployeeId, order.driverIsActive, { layout: 'id-first' }).displayText}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className="status-badge-pending">
                                                        <Clock size={12} /> Awaiting STARS Task
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        className="create-task-action-btn"
                                                        title="Create operational validation task in STARS"
                                                        onClick={() => onCreateTaskForOrder(order)}
                                                    >
                                                        <PlusCircle size={14} /> Create STARS Task
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredPending.length > 0 && (
                                    <div className="pre-delivery-pagination-bar">
                                        <span className="pre-delivery-pagination-info">
                                            Showing {filteredPending.length === 0 ? 0 : (pendingPage - 1) * pageSize + 1}–{Math.min(pendingPage * pageSize, filteredPending.length)} of {filteredPending.length} orders
                                        </span>
                                        <Pagination
                                            currentPage={pendingPage}
                                            totalPages={pendingTotalPages}
                                            onPageChange={setPendingPage}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {activeSubTab === 'in_validation' && (
                    /* Active Tasks in Validation View */
                    <div className="pre-delivery-table-wrapper">
                        {filteredValidationTasks.length === 0 ? (
                            <div className="empty-state">
                                <ClipboardCheck className="empty-state-icon" />
                                <h3 className="empty-state-title">No Active Validation Tasks</h3>
                                <p className="empty-state-desc">
                                    No operational tasks are currently in pre-delivery validation. Create tasks from pending DMS orders above.
                                </p>
                            </div>
                        ) : (
                            <>
                                <table className="pre-delivery-table">
                                    <thead>
                                        <tr>
                                            <th>Task Number</th>
                                            <th>Title & Details</th>
                                            <th>Assigned Employee</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                            <th>Due Date</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedValidationTasks.map(t => (
                                            <tr key={t._id}>
                                                <td>
                                                    <span style={{ fontWeight: 600, color: 'var(--teal, #00A99D)', fontFamily: 'monospace' }}>
                                                        {t._number || t._id.slice(0, 8)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{t._title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {t._category || 'Delivery Operations'}
                                                    </div>
                                                </td>
                                                <td>
                                                    {t._assignee ? (
                                                        <span>{t._assignee}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unassigned</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`priority-badge ${getPriorityClass(t._priority)}`}>
                                                        {t._priority || 'Medium'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="status-badge-active">
                                                        {formatStatus(t._status || 'Active')}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem' }}>
                                                    {t._dueAt ? (
                                                        <div>
                                                            <div>{formatDeadlineWithRemaining(t._dueAt, { isCompleted: false })}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                Target: {formatDateOnly(t._dueAt)}
                                                            </div>
                                                        </div>
                                                    ) : 'N/A'}
                                                </td>
                                                <td>
                                                    {onViewTask && (
                                                        <button
                                                            className="pre-delivery-btn pre-delivery-btn-secondary"
                                                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                            onClick={() => onViewTask(t._id)}
                                                        >
                                                            <ExternalLink size={13} /> View Task
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredValidationTasks.length > 0 && (
                                    <div className="pre-delivery-pagination-bar">
                                        <span className="pre-delivery-pagination-info">
                                            Showing {filteredValidationTasks.length === 0 ? 0 : (validationPage - 1) * pageSize + 1}–{Math.min(validationPage * pageSize, filteredValidationTasks.length)} of {filteredValidationTasks.length} tasks
                                        </span>
                                        <Pagination
                                            currentPage={validationPage}
                                            totalPages={validationTotalPages}
                                            onPageChange={setValidationPage}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {activeSubTab === 'completed' && (
                    /* Completed Validation Tasks View */
                    <div className="pre-delivery-table-wrapper">
                        {filteredCompletedTasks.length === 0 ? (
                            <div className="empty-state">
                                <CheckCircle2 className="empty-state-icon" />
                                <h3 className="empty-state-title">No Completed Tasks</h3>
                                <p className="empty-state-desc">
                                    Validated pre-delivery tasks will appear here once approved or completed in STARS, where you can monitor delivery progress.
                                </p>
                            </div>
                        ) : (
                            <>
                                <table className="pre-delivery-table">
                                    <thead>
                                        <tr>
                                            <th>Task Number</th>
                                            <th>Title & Details</th>
                                            <th>Assigned Employee</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                            <th>Completed / Due Date</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedCompletedTasks.map(t => (
                                            <tr key={t._id}>
                                                <td>
                                                    <span style={{ fontWeight: 600, color: 'var(--teal, #00A99D)', fontFamily: 'monospace' }}>
                                                        {t._number || t._id.slice(0, 8)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{t._title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {t._category || 'Delivery Operations'}
                                                    </div>
                                                </td>
                                                <td>
                                                    {t._assignee ? (
                                                        <span>{t._assignee}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unassigned</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`priority-badge ${getPriorityClass(t._priority)}`}>
                                                        {t._priority || 'Medium'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className="status-badge-active"
                                                        style={{
                                                            background: 'rgba(22, 163, 74, 0.12)',
                                                            color: '#16a34a',
                                                            border: '1px solid rgba(22, 163, 74, 0.3)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4
                                                        }}
                                                    >
                                                        <CheckCircle2 size={12} /> Completed
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 500, color: '#16a34a' }}>Validation Completed</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                            {t._dueAt ? `Target: ${formatDateOnly(t._dueAt)}` : 'Closed'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                        {onViewTask && (
                                                            <button
                                                                className="pre-delivery-btn pre-delivery-btn-secondary"
                                                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                                onClick={() => onViewTask(t._id)}
                                                            >
                                                                <ExternalLink size={13} /> View
                                                            </button>
                                                        )}
                                                        {onNavigateToDeliveryTracker && (
                                                            <button
                                                                className="pre-delivery-btn pre-delivery-btn-secondary"
                                                                style={{
                                                                    padding: '4px 10px',
                                                                    fontSize: '0.8rem',
                                                                    borderColor: 'var(--teal, #00A99D)',
                                                                    color: 'var(--teal, #00A99D)'
                                                                }}
                                                                title="Track delivery progress in Delivery Management System Tracker"
                                                                onClick={() => onNavigateToDeliveryTracker()}
                                                            >
                                                                <Truck size={13} /> Track Delivery
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredCompletedTasks.length > 0 && (
                                    <div className="pre-delivery-pagination-bar">
                                        <span className="pre-delivery-pagination-info">
                                            Showing {filteredCompletedTasks.length === 0 ? 0 : (completedPage - 1) * pageSize + 1}–{Math.min(completedPage * pageSize, filteredCompletedTasks.length)} of {filteredCompletedTasks.length} tasks
                                        </span>
                                        <Pagination
                                            currentPage={completedPage}
                                            totalPages={completedTotalPages}
                                            onPageChange={setCompletedPage}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PreDeliveryTab;
