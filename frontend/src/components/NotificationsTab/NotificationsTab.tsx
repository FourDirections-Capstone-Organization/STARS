import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Bell,
    CheckCheck,
    Clock,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    RefreshCw,
    X,
    Search,
    ClipboardList,
    Info,
    Flame,
    Eye,
    Loader2,
    Layers,
    RotateCcw,
    FolderTree,
} from 'lucide-react';
import { StatusCard } from '../StatusCard/StatusCard';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import './NotificationsTab.css';

export interface NotificationRecord {
    id: string;
    notificationId?: string;
    taskId?: string | null;
    relatedTaskId?: string | null;
    notificationType?: string;
    type?: string | number;
    title?: string;
    message?: string;
    isRead: boolean;
    createdAt: string;
}

export type NotificationClassification =
    | 'Task Overdues'
    | 'Deadline Warnings'
    | 'Reviews & Push Backs'
    | 'Task Assignments'
    | 'Task Completions'
    | 'Task Updates'
    | 'General Notices';

export function classifyNotification(item: NotificationRecord): NotificationClassification {
    const title = (item.title || '').toLowerCase();
    const msg = (item.message || '').toLowerCase();
    const typeStr = String(item.notificationType || item.type || '').toLowerCase();

    if (title.includes('overdue') || msg.includes('overdue') || typeStr.includes('overdue')) {
        return 'Task Overdues';
    }
    if (title.includes('deadline') || msg.includes('deadline') || title.includes('approaching') || typeStr.includes('deadlinewarning')) {
        return 'Deadline Warnings';
    }
    if (
        title.includes('push back') || title.includes('rework') || title.includes('revision') || title.includes('review') ||
        typeStr.includes('pushback') || typeStr.includes('awaitingreview')
    ) {
        return 'Reviews & Push Backs';
    }
    if (title.includes('assigned') || title.includes('assignment') || typeStr.includes('taskassigned') || typeStr.includes('template')) {
        return 'Task Assignments';
    }
    if (title.includes('completed') || title.includes('marked done') || typeStr.includes('taskcompleted')) {
        return 'Task Completions';
    }
    if (
        title.includes('update') || title.includes('status') || title.includes('resumed') || title.includes('hold') ||
        typeStr.includes('taskupdated') || typeStr.includes('resumed') || typeStr.includes('onhold')
    ) {
        return 'Task Updates';
    }
    return 'General Notices';
}

interface NotificationsTabProps {
    onViewTask?: (taskId: string) => void;
    canViewTasks?: boolean;
    extraNotifications?: any[];
}

const NOTIF_TYPE_NAMES: Record<number, string> = {
    0: 'TaskAssigned',
    1: 'TaskUpdated',
    2: 'TaskOverdue',
    3: 'DeadlineWarning',
    4: 'PushBack',
    5: 'TaskCancelled',
    6: 'TaskResumed',
    7: 'TaskOnHold',
    8: 'TaskCompleted',
    9: 'TemplateTaskUnassigned',
};

export const NotificationsTab: React.FC<NotificationsTabProps> = ({
    onViewTask,
    canViewTasks = true,
    extraNotifications = [],
}) => {
    const { success, error } = useToast();

    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);

    const [activeFilter, setActiveFilter] = useState<
        'all' | 'unread' | 'overdue' | 'deadline' | 'review' | 'assigned' | 'completed' | 'update'
    >('all');
    const [groupByCategory, setGroupByCategory] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const PAGE_SIZE = 10;

    const mapExtraNotifications = useCallback((): NotificationRecord[] => {
        if (!Array.isArray(extraNotifications) || extraNotifications.length === 0) return [];
        return extraNotifications.map(n => {
            const tId = n.relatedEntityId || n.taskId || n.RelatedEntityId || n.TaskId ||
                (typeof n.id === 'string' && (n.id.startsWith('review-') || n.id.startsWith('overdue-'))
                    ? n.id.replace('review-', '').replace('overdue-', '')
                    : null);
            let rawType = n.type || n.notificationType || 'Notice';
            if (typeof n.id === 'string' && n.id.startsWith('review-')) rawType = 'TaskAwaitingReview';
            else if (typeof n.id === 'string' && n.id.startsWith('overdue-')) rawType = 'TaskOverdue';
            else if (n.type === 'alert') rawType = 'TaskOverdue';
            else if (n.type === 'info') rawType = 'TaskUpdated';
            else if (n.type === 'success') rawType = 'TaskCompleted';

            return {
                id: String(n.id || tId || Math.random()),
                taskId: tId,
                type: rawType,
                notificationType: rawType,
                title: n.title || n.message || 'Notification',
                message: n.description || n.message || n.title || '',
                isRead: Boolean(n.read ?? n.isRead),
                createdAt: n.createdAt || n.timestamp || new Date().toISOString(),
            };
        });
    }, [extraNotifications]);

    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await api.get('/api/Notification/unread-count');
            const extrasUnread = (extraNotifications || []).filter(n => !n.read && !n.isRead).length;
            if (res.data?.isSuccess && typeof res.data?.data === 'number') {
                setUnreadCount(res.data.data + extrasUnread);
            } else if (extrasUnread > 0) {
                setUnreadCount(extrasUnread);
            }
        } catch {
            const extrasUnread = (extraNotifications || []).filter(n => !n.read && !n.isRead).length;
            if (extrasUnread > 0) setUnreadCount(extrasUnread);
        }
    }, [extraNotifications]);

    const fetchNotifications = useCallback(async (targetPage: number, silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        const extraMapped = mapExtraNotifications();

        try {
            const res = await api.get('/api/Notification', {
                pageNumber: targetPage,
                pageSize: PAGE_SIZE,
            });

            const json = res.data;
            const d = json?.data;
            const rawItems: any[] = Array.isArray(d?.items)
                ? d.items
                : (Array.isArray(d?.Items)
                    ? d.Items
                    : (Array.isArray(d)
                        ? d
                        : (Array.isArray(json?.data)
                            ? json.data
                            : (Array.isArray(json) ? json : d?.$values ?? []))));

            const serverMapped: NotificationRecord[] = rawItems.map((n: any) => {
                const rawType = typeof n.type === 'number'
                    ? (NOTIF_TYPE_NAMES[n.type] || 'Unknown')
                    : (n.type || n.notificationType || n.Type || n.NotificationType || 'Unknown');
                return {
                    id: String(n.id || n.notificationId || n.Id || n.NotificationId || Math.random()),
                    taskId: n.relatedTaskId || n.taskId || n.RelatedTaskId || n.TaskId || null,
                    type: rawType,
                    notificationType: rawType,
                    title: n.title || n.message || n.Title || n.Message || 'Notification',
                    message: n.message || n.title || n.Message || n.Title || '',
                    isRead: Boolean(n.isRead ?? n.IsRead),
                    createdAt: n.createdAt || n.CreatedAt || new Date().toISOString(),
                };
            });

            // Merge extra derived notifications (e.g. Awaiting Review, Overdue) with server feed
            const seen = new Set<string>();
            const combined: NotificationRecord[] = [];
            for (const item of [...extraMapped, ...serverMapped]) {
                const key = item.id;
                if (!seen.has(key)) {
                    seen.add(key);
                    combined.push(item);
                }
            }

            setNotifications(combined);
            setPage(d?.pageNumber || d?.PageNumber || targetPage);
            setTotalPages(Math.max(1, d?.totalPages || d?.TotalPages || Math.ceil(combined.length / PAGE_SIZE)));
            setTotalRecords(d?.totalCount ?? d?.TotalCount ?? combined.length);
        } catch {
            if (extraMapped.length > 0) {
                setNotifications(extraMapped);
                setTotalRecords(extraMapped.length);
                setTotalPages(Math.max(1, Math.ceil(extraMapped.length / PAGE_SIZE)));
            } else {
                setNotifications([]);
                setTotalRecords(0);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [mapExtraNotifications]);

    useEffect(() => {
        fetchNotifications(1);
        fetchUnreadCount();
    }, [fetchNotifications, fetchUnreadCount]);

    const isRealNotificationId = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            if (isRealNotificationId(id)) {
                await api.patch(`/api/Notification/${id}/read`);
            }
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
            success('Notification marked as read.');
        } catch (err: any) {
            error(err?.message || 'Failed to mark as read.');
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await api.patch('/api/Notification/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
            success('All notifications marked as read.');
        } catch (err: any) {
            error(err?.message || 'Failed to mark all as read.');
        }
    };

    const handleNotificationClick = (item: NotificationRecord) => {
        if (!item.isRead) {
            handleMarkAsRead(item.id);
        }
        if (canViewTasks && item.taskId && onViewTask) {
            onViewTask(item.taskId);
        }
    };

    // Filter & Search Logic
    const filteredNotifications = useMemo(() => {
        return notifications.filter(item => {
            const classification = classifyNotification(item);
            let matchesFilter = true;
            if (activeFilter === 'unread') {
                matchesFilter = !item.isRead;
            } else if (activeFilter === 'overdue') {
                matchesFilter = classification === 'Task Overdues';
            } else if (activeFilter === 'deadline') {
                matchesFilter = classification === 'Deadline Warnings';
            } else if (activeFilter === 'review') {
                matchesFilter = classification === 'Reviews & Push Backs';
            } else if (activeFilter === 'assigned') {
                matchesFilter = classification === 'Task Assignments';
            } else if (activeFilter === 'completed') {
                matchesFilter = classification === 'Task Completions';
            } else if (activeFilter === 'update') {
                matchesFilter = classification === 'Task Updates';
            }

            const q = searchTerm.trim().toLowerCase();
            const matchesSearch = !q ||
                (item.title && item.title.toLowerCase().includes(q)) ||
                (item.message && item.message.toLowerCase().includes(q)) ||
                classification.toLowerCase().includes(q) ||
                String(item.notificationType || item.type || '').toLowerCase().includes(q);

            return matchesFilter && matchesSearch;
        });
    }, [notifications, activeFilter, searchTerm]);

    // Computed Counts by Classification for Chips & KPIs
    const classificationCounts = useMemo(() => {
        const counts = {
            overdue: 0,
            deadline: 0,
            review: 0,
            assigned: 0,
            completed: 0,
            update: 0,
            general: 0,
        };
        notifications.forEach(n => {
            const cat = classifyNotification(n);
            if (cat === 'Task Overdues') counts.overdue++;
            else if (cat === 'Deadline Warnings') counts.deadline++;
            else if (cat === 'Reviews & Push Backs') counts.review++;
            else if (cat === 'Task Assignments') counts.assigned++;
            else if (cat === 'Task Completions') counts.completed++;
            else if (cat === 'Task Updates') counts.update++;
            else counts.general++;
        });
        return counts;
    }, [notifications]);

    // Computed KPI Metrics
    const kpiMetrics = useMemo(() => {
        const total = totalRecords || notifications.length;
        const unread = unreadCount || notifications.filter(n => !n.isRead).length;
        const alertsCount = classificationCounts.overdue + classificationCounts.deadline;
        const tasksCount = classificationCounts.assigned + classificationCounts.review + classificationCounts.update;

        return { total, unread, alertsCount, tasksCount };
    }, [totalRecords, notifications, unreadCount, classificationCounts]);

    const getClassificationMeta = (classification: NotificationClassification) => {
        switch (classification) {
            case 'Task Overdues':
                return {
                    icon: <Flame size={16} strokeWidth={2.4} />,
                    bubbleCls: 'danger',
                    badgeCls: 'cat-badge-danger',
                    cardModifier: 'cat-overdue',
                    label: 'Task Overdue',
                };
            case 'Deadline Warnings':
                return {
                    icon: <AlertTriangle size={16} strokeWidth={2.4} />,
                    bubbleCls: 'warning',
                    badgeCls: 'cat-badge-warning',
                    cardModifier: 'cat-deadline',
                    label: 'Deadline Warning',
                };
            case 'Reviews & Push Backs':
                return {
                    icon: <RotateCcw size={16} strokeWidth={2.4} />,
                    bubbleCls: 'review',
                    badgeCls: 'cat-badge-review',
                    cardModifier: 'cat-review',
                    label: 'Push Back / Review',
                };
            case 'Task Assignments':
                return {
                    icon: <ClipboardList size={16} strokeWidth={2.4} />,
                    bubbleCls: 'teal',
                    badgeCls: 'cat-badge-teal',
                    cardModifier: 'cat-assigned',
                    label: 'Task Assignment',
                };
            case 'Task Completions':
                return {
                    icon: <CheckCircle2 size={16} strokeWidth={2.4} />,
                    bubbleCls: 'success',
                    badgeCls: 'cat-badge-success',
                    cardModifier: 'cat-completed',
                    label: 'Completed',
                };
            case 'Task Updates':
                return {
                    icon: <Info size={16} strokeWidth={2.4} />,
                    bubbleCls: 'info',
                    badgeCls: 'cat-badge-info',
                    cardModifier: 'cat-update',
                    label: 'Task Update',
                };
            default:
                return {
                    icon: <Bell size={16} strokeWidth={2.4} />,
                    bubbleCls: 'neutral',
                    badgeCls: 'cat-badge-neutral',
                    cardModifier: 'cat-general',
                    label: 'General Notice',
                };
        }
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '—';
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Grouping computation
    const groupedNotifications = useMemo(() => {
        const order: NotificationClassification[] = [
            'Task Overdues',
            'Deadline Warnings',
            'Reviews & Push Backs',
            'Task Assignments',
            'Task Updates',
            'Task Completions',
            'General Notices',
        ];
        const map = new Map<NotificationClassification, NotificationRecord[]>();
        order.forEach(cat => map.set(cat, []));

        filteredNotifications.forEach(item => {
            const cat = classifyNotification(item);
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(item);
        });

        return Array.from(map.entries()).filter(([_, items]) => items.length > 0);
    }, [filteredNotifications]);

    const renderCard = (item: NotificationRecord) => {
        const classification = classifyNotification(item);
        const meta = getClassificationMeta(classification);
        const isClickable = Boolean(canViewTasks && item.taskId && onViewTask);

        return (
            <div
                key={item.id}
                className={`notif-card ${meta.cardModifier} ${!item.isRead ? 'unread' : ''} ${isClickable ? 'clickable' : ''}`}
                onClick={() => handleNotificationClick(item)}
            >
                <div className={`notif-icon-bubble ${meta.bubbleCls}`}>
                    {meta.icon}
                </div>

                <div className="notif-card-main">
                    <div className="notif-card-header">
                        <div className="notif-card-title-group">
                            <h4 className="notif-card-title">{item.title}</h4>
                            {!item.isRead && <span className="notif-badge-new">New</span>}
                            <span className={`notif-badge-classification ${meta.badgeCls}`}>{meta.label}</span>
                        </div>

                        <span className="notif-card-time" title={item.createdAt}>
                            <Clock size={12} />
                            {formatTime(item.createdAt)}
                        </span>
                    </div>

                    <div className="notif-card-body">
                        {item.message}
                    </div>

                    {(item.taskId || !item.isRead) && (
                        <div className="notif-card-footer">
                            {canViewTasks && item.taskId && onViewTask ? (
                                <button
                                    type="button"
                                    className="notif-card-task-link"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!item.isRead) handleMarkAsRead(item.id);
                                        onViewTask(item.taskId!);
                                    }}
                                >
                                    View Linked Task <ArrowRight size={13} />
                                </button>
                            ) : <div />}

                            {!item.isRead && (
                                <button
                                    type="button"
                                    className="notif-card-mark-read"
                                    onClick={(e) => handleMarkAsRead(item.id, e)}
                                >
                                    <CheckCircle2 size={13} />
                                    Mark as read
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="notif-tab-container">
            {/* ── KPI Row ── */}
            <div className="notif-kpi-grid">
                <StatusCard
                    icon={<Bell size={20} strokeWidth={2.3} />}
                    variant="teal"
                    label="TOTAL NOTIFICATIONS"
                    value={kpiMetrics.total}
                    subtext="All alerts recorded"
                />
                <StatusCard
                    icon={<AlertCircle size={20} strokeWidth={2.3} />}
                    variant={kpiMetrics.unread > 0 ? 'danger' : 'success'}
                    label="UNREAD ALERTS"
                    value={kpiMetrics.unread}
                    subtext={kpiMetrics.unread > 0 ? 'Requires attention' : 'All caught up'}
                />
                <StatusCard
                    icon={<Flame size={20} strokeWidth={2.3} />}
                    variant="danger"
                    label="TASK OVERDUES"
                    value={classificationCounts.overdue}
                    subtext="Immediate review needed"
                />
                <StatusCard
                    icon={<AlertTriangle size={20} strokeWidth={2.3} />}
                    variant="warning"
                    label="DEADLINE WARNINGS"
                    value={classificationCounts.deadline}
                    subtext="Approaching target SLA"
                />
            </div>

            {/* ── Control Bar ── */}
            <div className="notif-controls-card">
                <div className="notif-controls-left">
                    <div className="notif-search-wrap">
                        <Search size={15} className="notif-search-icon" />
                        <input
                            type="text"
                            className="notif-search-input"
                            placeholder="Search by title, message, or category..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                className="notif-search-clear"
                                onClick={() => setSearchTerm('')}
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="notif-filter-chips">
                        <button
                            type="button"
                            className={`notif-chip ${activeFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('all')}
                        >
                            <span>All</span>
                            <span className="notif-chip-badge">{kpiMetrics.total}</span>
                        </button>
                        <button
                            type="button"
                            className={`notif-chip ${activeFilter === 'unread' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('unread')}
                        >
                            <span>Unread</span>
                            {kpiMetrics.unread > 0 && (
                                <span className="notif-chip-badge danger">{kpiMetrics.unread}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`notif-chip chip-overdue ${activeFilter === 'overdue' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('overdue')}
                        >
                            <Flame size={12} />
                            <span>Task Overdues</span>
                            {classificationCounts.overdue > 0 && (
                                <span className="notif-chip-badge danger">{classificationCounts.overdue}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`notif-chip chip-deadline ${activeFilter === 'deadline' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('deadline')}
                        >
                            <AlertTriangle size={12} />
                            <span>Deadline Warnings</span>
                            {classificationCounts.deadline > 0 && (
                                <span className="notif-chip-badge warning">{classificationCounts.deadline}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`notif-chip chip-review ${activeFilter === 'review' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('review')}
                        >
                            <RotateCcw size={12} />
                            <span>Reviews & Push Back</span>
                            {classificationCounts.review > 0 && (
                                <span className="notif-chip-badge info">{classificationCounts.review}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`notif-chip chip-assigned ${activeFilter === 'assigned' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('assigned')}
                        >
                            <ClipboardList size={12} />
                            <span>Assignments</span>
                            {classificationCounts.assigned > 0 && (
                                <span className="notif-chip-badge teal">{classificationCounts.assigned}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`notif-chip ${activeFilter === 'completed' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('completed')}
                        >
                            <CheckCircle2 size={12} />
                            <span>Completed</span>
                        </button>
                    </div>
                </div>

                <div className="notif-controls-right">
                    <button
                        type="button"
                        className={`notif-btn-grouping ${groupByCategory ? 'active' : ''}`}
                        onClick={() => setGroupByCategory(p => !p)}
                        title="Group notifications by title category"
                    >
                        <Layers size={14} />
                        <span>{groupByCategory ? 'Grouped by Category' : 'Group by Category'}</span>
                    </button>
                    <button
                        type="button"
                        className="notif-btn-readall"
                        onClick={handleMarkAllAsRead}
                        disabled={kpiMetrics.unread === 0 || loading}
                        title="Mark all notifications as read"
                    >
                        <CheckCheck size={16} />
                        <span>Mark All as Read</span>
                    </button>
                    <button
                        type="button"
                        className="notif-btn-refresh"
                        onClick={() => {
                            fetchNotifications(page, true);
                            fetchUnreadCount();
                        }}
                        disabled={loading || refreshing}
                        title="Refresh notifications"
                    >
                        <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />
                    </button>
                </div>
            </div>

            {/* ── Feed List ── */}
            {loading ? (
                <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <Loader2 size={28} className="spin-icon" style={{ color: 'var(--teal, #00A99D)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading notifications…</span>
                </div>
            ) : filteredNotifications.length === 0 ? (
                <div className="card" style={{ padding: '40px 20px', borderRadius: 'var(--r-md, 12px)' }}>
                    <EmptyState
                        icon={<Bell size={32} />}
                        message={searchTerm || activeFilter !== 'all' ? 'No notifications match your classification or search.' : 'You have no notifications at this time.'}
                    />
                </div>
            ) : groupByCategory ? (
                <div className="notif-grouped-container">
                    {groupedNotifications.map(([category, items]) => {
                        const meta = getClassificationMeta(category);
                        const unreadInGroup = items.filter(i => !i.isRead).length;

                        return (
                            <div key={category} className="notif-category-group">
                                <div className="notif-category-header">
                                    <div className="notif-category-title-wrap">
                                        <span className={`notif-category-icon ${meta.bubbleCls}`}>{meta.icon}</span>
                                        <span className="notif-category-title">{category}</span>
                                        <span className="notif-category-count">{items.length}</span>
                                        {unreadInGroup > 0 && (
                                            <span className="notif-category-unread">{unreadInGroup} new</span>
                                        )}
                                    </div>
                                    <div className="notif-category-divider" />
                                </div>
                                <div className="notif-feed-list">
                                    {items.map(renderCard)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="notif-feed-list">
                    {filteredNotifications.map(renderCard)}
                </div>
            )}

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <div className="notif-pagination-wrap">
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={p => fetchNotifications(p)}
                    />
                </div>
            )}
        </div>
    );
};

export default NotificationsTab;
