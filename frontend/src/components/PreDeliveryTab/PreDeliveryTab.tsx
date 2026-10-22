import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ClipboardCheck,
    Search,
    RefreshCw,
    Package,
    MapPin,
    Calendar,
    Clock,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    Copy,
    Check,
    PlusCircle,
    ExternalLink,
    FileText,
    Truck,
    ShieldAlert,
    Filter
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import StatusCard from '../StatusCard/StatusCard';
import Pagination from '../ui/Pagination';
import { formatDeadlineWithRemaining } from '../../utils/dateUtils';
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
    driverEmployeeId?: string;
}

interface PreDeliveryTabProps {
    tasks?: any[];
    onCreateTaskForOrder: (order: DmsPendingOrder) => void;
    onViewTask?: (taskId: string) => void;
}

export const PreDeliveryTab: React.FC<PreDeliveryTabProps> = ({
    tasks = [],
    onCreateTaskForOrder,
    onViewTask,
}) => {
    const { success: toastSuccess, error: toastError } = useToast();
    const [pendingOrders, setPendingOrders] = useState<DmsPendingOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<'pending' | 'in_validation'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [copiedWaybill, setCopiedWaybill] = useState<string | null>(null);

    const fetchPendingOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/dms-integration/pending-orders');
            const data = res?.data?.data ?? res?.data;
            if (Array.isArray(data)) {
                setPendingOrders(data);
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

    useEffect(() => {
        fetchPendingOrders();
    }, [fetchPendingOrders]);

    const handleCopy = (waybill: string) => {
        navigator.clipboard.writeText(waybill);
        setCopiedWaybill(waybill);
        toastSuccess(`Waybill ${waybill} copied!`);
        setTimeout(() => setCopiedWaybill(null), 2500);
    };

    // Filter pending orders
    const filteredPending = useMemo(() => {
        return pendingOrders.filter(o => {
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
    }, [pendingOrders, priorityFilter, searchQuery]);

    // Active operational tasks in pre-delivery validation
    const operationalValidationTasks = useMemo(() => {
        return tasks.filter(t => {
            const isDelivery = t.taskCategory === 'Delivery Operations' ||
                (t.taskTitle && t.taskTitle.toLowerCase().includes('delivery')) ||
                t.deliveryDetails;
            return isDelivery;
        });
    }, [tasks]);

    const filteredValidationTasks = useMemo(() => {
        return operationalValidationTasks.filter(t => {
            if (priorityFilter !== 'all' && (t.priority || '').toLowerCase() !== priorityFilter.toLowerCase()) {
                return false;
            }
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (t.taskNumber && t.taskNumber.toLowerCase().includes(q)) ||
                (t.taskTitle && t.taskTitle.toLowerCase().includes(q)) ||
                (t.assignedEmployee && t.assignedEmployee.toLowerCase().includes(q)) ||
                (t.status && t.status.toLowerCase().includes(q))
            );
        });
    }, [operationalValidationTasks, priorityFilter, searchQuery]);

    const [pendingPage, setPendingPage] = useState(1);
    const [validationPage, setValidationPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        setPendingPage(1);
        setValidationPage(1);
    }, [searchQuery, priorityFilter, activeSubTab]);

    const pendingTotalPages = Math.max(1, Math.ceil(filteredPending.length / pageSize));
    const validationTotalPages = Math.max(1, Math.ceil(filteredValidationTasks.length / pageSize));

    const pagedPending = useMemo(() => {
        const start = (pendingPage - 1) * pageSize;
        return filteredPending.slice(start, start + pageSize);
    }, [filteredPending, pendingPage, pageSize]);

    const pagedValidationTasks = useMemo(() => {
        const start = (validationPage - 1) * pageSize;
        return filteredValidationTasks.slice(start, start + pageSize);
    }, [filteredValidationTasks, validationPage, pageSize]);

    // Stats calculations
    const stats = useMemo(() => {
        const totalPending = pendingOrders.length;
        const urgentOrHigh = pendingOrders.filter(o => {
            const p = (o.priority || '').toLowerCase();
            return p === 'urgent' || p === 'high';
        }).length;
        const inValidationCount = operationalValidationTasks.filter(t => {
            const s = (t.status || '').toLowerCase();
            return s !== 'completed' && s !== 'done' && s !== 'cancelled';
        }).length;
        const completedValidationCount = operationalValidationTasks.filter(t => {
            const s = (t.status || '').toLowerCase();
            return s === 'completed' || s === 'done';
        }).length;

        return { totalPending, urgentOrHigh, inValidationCount, completedValidationCount };
    }, [pendingOrders, operationalValidationTasks]);

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
                        onClick={fetchPendingOrders}
                        disabled={loading}
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                        Refresh Orders
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="pre-delivery-kpi-grid">
                <StatusCard
                    icon={<Clock size={20} strokeWidth={2.3} />}
                    variant="warning"
                    label="Pending Validation"
                    value={stats.totalPending}
                    subtext="DMS orders awaiting STARS task"
                />
                <StatusCard
                    icon={<ShieldAlert size={20} strokeWidth={2.3} />}
                    variant="danger"
                    label="Urgent / High Priority"
                    value={stats.urgentOrHigh}
                    subtext="Requires immediate dispatch"
                />
                <StatusCard
                    icon={<ClipboardCheck size={20} strokeWidth={2.3} />}
                    variant="teal"
                    label="Tasks in Validation"
                    value={stats.inValidationCount}
                    subtext="Active operational validation"
                />
                <StatusCard
                    icon={<CheckCircle2 size={20} strokeWidth={2.3} />}
                    variant="success"
                    label="Validated & Dispatched"
                    value={stats.completedValidationCount}
                    subtext="Completed validation tasks"
                />
            </div>

            {/* Sub-navigation Tabs */}
            <div className="pre-delivery-nav-tabs">
                <button
                    className={`pre-delivery-tab-btn ${activeSubTab === 'pending' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('pending')}
                >
                    <Package size={16} />
                    Awaiting STARS Task
                    <span className="pre-delivery-tab-count">{pendingOrders.length}</span>
                </button>
                <button
                    className={`pre-delivery-tab-btn ${activeSubTab === 'in_validation' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('in_validation')}
                >
                    <ClipboardCheck size={16} />
                    Active Validation Tasks
                    <span className="pre-delivery-tab-count">{operationalValidationTasks.length}</span>
                </button>
            </div>

            {/* Controls Bar */}
            <div className="pre-delivery-controls">
                <div className="pre-delivery-search-wrapper">
                    <Search size={16} className="pre-delivery-search-icon" />
                    <input
                        type="text"
                        className="pre-delivery-search-input"
                        placeholder={activeSubTab === 'pending' ? "Search by waybill, recipient, area, package..." : "Search tasks by title, number, assignee..."}
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
                {activeSubTab === 'pending' ? (
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
                                                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    Due: {order.expectedDelivery ? new Date(order.expectedDelivery).toLocaleDateString() : 'N/A'}
                                                </div>
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
                ) : (
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
                                            <tr key={t.taskId || t.id}>
                                                <td>
                                                    <span style={{ fontWeight: 600, color: 'var(--teal, #00A99D)', fontFamily: 'monospace' }}>
                                                        {t.taskNumber || t.taskReferenceNumber || t.taskId?.slice(0, 8)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{t.taskTitle || t.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {t.taskCategory || 'Delivery Operations'}
                                                    </div>
                                                </td>
                                                <td>
                                                    {t.assignedEmployee || t.assignedTo ? (
                                                        <span>{t.assignedEmployee || 'Assigned'}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unassigned</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`priority-badge ${getPriorityClass(t.priority)}`}>
                                                        {t.priority || 'Medium'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="status-badge-active">
                                                        {t.status || 'Active'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem' }}>
                                                    {t.dueAt ? formatDeadlineWithRemaining(t.dueAt, { isCompleted: t.status === 'Completed' || t.status === 'Done' }) : 'N/A'}
                                                </td>
                                                <td>
                                                    {onViewTask && (
                                                        <button
                                                            className="pre-delivery-btn pre-delivery-btn-secondary"
                                                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                            onClick={() => onViewTask(t.taskId || t.id)}
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
            </div>
        </div>
    );
};

export default PreDeliveryTab;
