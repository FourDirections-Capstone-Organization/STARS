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
    Loader2
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

interface NotificationsTabProps {
    onViewTask?: (taskId: string) => void;
    canViewTasks?: boolean;
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
}) => {
    const { success, error } = useToast();

    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);

    const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'tasks' | 'alerts'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const PAGE_SIZE = 10;

    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await api.get('/api/Notification/unread-count');
            if (res.data?.isSuccess && typeof res.data?.data === 'number') {
                setUnreadCount(res.data.data);
            }
        } catch {
            /* ignore */
        }
    }, []);

    const fetchNotifications = useCallback(async (targetPage: number, silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        try {
            const res = await api.get('/api/Notification', {
                pageNumber: targetPage,
                pageSize: PAGE_SIZE,
            });

            const json = res.data;
            const d = json?.data;
            if (json?.isSuccess && d?.items) {
                const mapped: NotificationRecord[] = d.items.map((n: any) => {
                    const rawType = typeof n.type === 'number' ? (NOTIF_TYPE_NAMES[n.type] || 'Unknown') : (n.type || n.notificationType || 'Unknown');
                    return {
                        id: String(n.id || n.notificationId || Math.random()),
                        taskId: n.relatedTaskId || n.taskId || null,
                        type: rawType,
                        notificationType: rawType,
                        title: n.title || n.message || 'Notification',
                        message: n.message || n.title || '',
                        isRead: Boolean(n.isRead),
                        createdAt: n.createdAt || new Date().toISOString(),
                    };
                });
                setNotifications(mapped);
                setPage(d.pageNumber || targetPage);
                setTotalPages(d.totalPages || 1);
                setTotalRecords(d.totalCount ?? mapped.length);
            } else {
                setNotifications([]);
                setTotalRecords(0);
            }
        } catch {
            setNotifications([]);
            setTotalRecords(0);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications(1);
        fetchUnreadCount();
    }, [fetchNotifications, fetchUnreadCount]);

    const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            await api.patch(`/api/Notification/${id}/read`);
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
            const typeStr = String(item.notificationType || item.type || '');
            let matchesType = true;
            if (activeFilter === 'unread') {
                matchesType = !item.isRead;
            } else if (activeFilter === 'tasks') {
                matchesType = typeStr.startsWith('Task') || Boolean(item.taskId);
            } else if (activeFilter === 'alerts') {
                matchesType = typeStr === 'TaskOverdue' || typeStr === 'DeadlineWarning' || typeStr === 'PushBack';
            }

            const q = searchTerm.trim().toLowerCase();
            const matchesSearch = !q ||
                (item.title && item.title.toLowerCase().includes(q)) ||
                (item.message && item.message.toLowerCase().includes(q)) ||
                typeStr.toLowerCase().includes(q);

            return matchesType && matchesSearch;
        });
    }, [notifications, activeFilter, searchTerm]);

    // Computed KPI Metrics
    const kpiMetrics = useMemo(() => {
        const total = totalRecords || notifications.length;
        const unread = unreadCount || notifications.filter(n => !n.isRead).length;
        const alertsCount = notifications.filter(n => {
            const t = String(n.notificationType || n.type || '');
            return t === 'TaskOverdue' || t === 'DeadlineWarning';
        }).length;
        const tasksCount = notifications.filter(n => Boolean(n.taskId) || String(n.notificationType || '').startsWith('Task')).length;

        return { total, unread, alertsCount, tasksCount };
    }, [totalRecords, notifications, unreadCount]);

    const getNotificationVisuals = (type?: string | number) => {
        const t = String(type || '');
        switch (t) {
            case 'TaskOverdue':
                return {
                    icon: <Flame size={18} strokeWidth={2.4} />,
                    bubbleCls: 'danger',
                    badgeLabel: 'Overdue',
                };
            case 'DeadlineWarning':
                return {
                    icon: <AlertTriangle size={18} strokeWidth={2.4} />,
                    bubbleCls: 'warning',
                    badgeLabel: 'Deadline Warning',
                };
            case 'TaskAssigned':
                return {
                    icon: <ClipboardList size={18} strokeWidth={2.4} />,
                    bubbleCls: 'teal',
                    badgeLabel: 'Task Assigned',
                };
            case 'TaskUpdated':
                return {
                    icon: <Info size={18} strokeWidth={2.4} />,
                    bubbleCls: 'info',
                    badgeLabel: 'Task Updated',
                };
            case 'TaskCompleted':
                return {
                    icon: <CheckCircle2 size={18} strokeWidth={2.4} />,
                    bubbleCls: 'success',
                    badgeLabel: 'Completed',
                };
            case 'TaskAwaitingReview':
                return {
                    icon: <Eye size={18} strokeWidth={2.4} />,
                    bubbleCls: 'warning',
                    badgeLabel: 'In Review',
                };
            default:
                return {
                    icon: <Bell size={18} strokeWidth={2.4} />,
                    bubbleCls: 'neutral',
                    badgeLabel: t || 'Notice',
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
                    icon={<ClipboardList size={20} strokeWidth={2.3} />}
                    variant="info"
                    label="TASK UPDATES"
                    value={kpiMetrics.tasksCount}
                    subtext="Workflow activities"
                />
                <StatusCard
                    icon={<Flame size={20} strokeWidth={2.3} />}
                    variant="warning"
                    label="URGENT / OVERDUE"
                    value={kpiMetrics.alertsCount}
                    subtext="High priority alerts"
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
                            placeholder="Search by title, message, or type..."
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
                            className={`notif-chip ${activeFilter === 'tasks' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('tasks')}
                        >
                            <span>Tasks</span>
                        </button>
                        <button
                            type="button"
                            className={`notif-chip ${activeFilter === 'alerts' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('alerts')}
                        >
                            <span>Alerts</span>
                        </button>
                    </div>
                </div>

                <div className="notif-controls-right">
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
                        message={searchTerm || activeFilter !== 'all' ? 'No notifications match your filters.' : 'You have no notifications at this time.'}
                    />
                </div>
            ) : (
                <div className="notif-feed-list">
                    {filteredNotifications.map(item => {
                        const visual = getNotificationVisuals(item.notificationType || item.type);
                        const isClickable = Boolean(canViewTasks && item.taskId && onViewTask);

                        return (
                            <div
                                key={item.id}
                                className={`notif-card ${!item.isRead ? 'unread' : ''} ${isClickable ? 'clickable' : ''}`}
                                onClick={() => handleNotificationClick(item)}
                            >
                                <div className={`notif-icon-bubble ${visual.bubbleCls}`}>
                                    {visual.icon}
                                </div>

                                <div className="notif-card-main">
                                    <div className="notif-card-header">
                                        <div className="notif-card-title-group">
                                            <h4 className="notif-card-title">{item.title}</h4>
                                            {!item.isRead && <span className="notif-badge-new">New</span>}
                                            <span className="notif-badge-type">{visual.badgeLabel}</span>
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
                    })}
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
