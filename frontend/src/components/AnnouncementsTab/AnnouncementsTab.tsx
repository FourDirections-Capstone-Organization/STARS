import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
    Megaphone, Plus, X, Loader2, AlertCircle, CheckCircle2, Clock, Users,
    Calendar, MessageSquare, ThumbsUp, Send, Paperclip, Download, FileText,
    Image as ImageIcon, Eye, Edit3, Bold, Italic, List, ListOrdered, Heading, Quote,
    AlertTriangle, Globe, Lock, UserCheck, Copy, Check, Sparkles, Flame,
    ChevronDown, ChevronUp, Bell, ArrowUpRight, Search
} from 'lucide-react';
import StatusCard from '../StatusCard/StatusCard';
import FormModal from '../FormModal/FormModal';
import api from '../../api';
import AnnouncementDetailModal, { AnnouncementItem } from './AnnouncementDetailModal';
import './AnnouncementsTab.css';

interface AnnouncementsTabProps {
    canCreate: boolean;
}

const AVAILABLE_ROLES = [
    { value: 'Manager', label: 'Manager' },
    { value: 'Coordinator', label: 'Coordinator' },
    { value: 'Dispatcher', label: 'Dispatcher' },
    { value: 'Encoder', label: 'Encoder' },
    { value: 'Courier', label: 'Courier / Driver' },
    { value: 'Accountant', label: 'Accountant' },
];

const fmtDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getRelativeTimeString = (dateStr: string) => {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return fmtDate(dateStr);
};

const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isExpiringSoon = (d?: string) => {
    if (!d) return false;
    const diff = new Date(d).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
};

const getMinDateTimeLocal = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
};

const getInitials = (nameStr: string) => {
    const parts = (nameStr || '').split(' ').filter(Boolean);
    if (parts.length === 0) return 'ST';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarBg = (nameStr: string) => {
    const colors = ['#4318ff', '#00A99D', '#0891b2', '#059669', '#7c3aed', '#ea580c', '#2563eb'];
    let hash = 0;
    for (let i = 0; i < nameStr.length; i++) {
        hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

const renderFormattedText = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
        if (line.startsWith('### ')) {
            return <h4 key={idx} style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: 700 }}>{line.slice(4)}</h4>;
        }
        if (line.startsWith('## ')) {
            return <h3 key={idx} style={{ margin: '10px 0 6px', fontSize: 16, fontWeight: 700 }}>{line.slice(3)}</h3>;
        }
        if (line.startsWith('# ')) {
            return <h2 key={idx} style={{ margin: '12px 0 8px', fontSize: 18, fontWeight: 800 }}>{line.slice(2)}</h2>;
        }
        if (line.startsWith('> ')) {
            return (
                <blockquote key={idx}>
                    {line.slice(2)}
                </blockquote>
            );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
                <div key={idx} style={{ display: 'flex', gap: 6, margin: '3px 0 3px 8px' }}>
                    <span style={{ color: 'var(--primary, #4318ff)', fontWeight: 'bold' }}>•</span>
                    <span>{line.slice(2)}</span>
                </div>
            );
        }
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
            return (
                <div key={idx} style={{ display: 'flex', gap: 6, margin: '3px 0 3px 8px' }}>
                    <span style={{ color: 'var(--primary, #4318ff)', fontWeight: 600, minWidth: 18 }}>{numMatch[1]}.</span>
                    <span>{numMatch[2]}</span>
                </div>
            );
        }
        if (line.trim() === '') {
            return <div key={idx} style={{ height: 8 }} />;
        }
        return <div key={idx} style={{ marginBottom: 4 }}>{line}</div>;
    });
};

export const AnnouncementsTab: React.FC<AnnouncementsTabProps> = ({ canCreate }) => {
    const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState<AnnouncementItem | null>(null);
    const [commentText, setCommentText] = useState<Record<string, string>>({});
    const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});
    const [acknowledging, setAcknowledging] = useState<Record<string, boolean>>({});
    const [filterPriority, setFilterPriority] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

    const fetchAnnouncements = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/api/Announcement/active');
            const json = res.data;
            if (json?.isSuccess && json?.data) {
                setAnnouncements(json.data);
            } else {
                setAnnouncements([]);
            }
        } catch {
            setAnnouncements([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const handleAcknowledge = async (id: string) => {
        setAcknowledging(prev => ({ ...prev, [id]: true }));
        try {
            await api.post(`/api/Announcement/${id}/acknowledge`);
            await fetchAnnouncements();
        } catch {
            /* ignore */
        } finally {
            setAcknowledging(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleComment = async (id: string) => {
        const text = commentText[id]?.trim();
        if (!text) return;
        if (text.length > 500) return;

        setSendingComment(prev => ({ ...prev, [id]: true }));
        try {
            await api.post(`/api/Announcement/${id}/comments`, { content: text });
            setCommentText(prev => ({ ...prev, [id]: '' }));
            await fetchAnnouncements();
        } catch {
            /* ignore */
        } finally {
            setSendingComment(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleDownloadAttachment = (id: string) => {
        const baseUrl = api.defaults.baseURL || '';
        const downloadUrl = `${baseUrl}/api/Announcement/${id}/attachment`;
        window.open(downloadUrl, '_blank');
    };

    const handleCopyId = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleComments = (id: string) => {
        setExpandedComments(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const currentUserId = (() => {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return '';
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '')));
            return payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] || payload.sub || payload.nameid || '';
        } catch {
            return '';
        }
    })();

    const currentUserRole = (() => {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return '';
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '')));
            return payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || payload.role || '';
        } catch {
            return '';
        }
    })();

    // Summary statistics for KPIs
    const stats = useMemo(() => {
        const total = announcements.length;
        const urgentCount = announcements.filter(a => a.priority === 'Urgent').length;
        const importantCount = announcements.filter(a => a.priority === 'Important').length;
        const acknowledgedCount = announcements.filter(a => a.isAcknowledged).length;
        const expiringSoonCount = announcements.filter(a => isExpiringSoon(a.expiryDate)).length;

        return {
            total,
            urgentAndImportant: urgentCount + importantCount,
            acknowledged: acknowledgedCount,
            expiringSoon: expiringSoonCount,
        };
    }, [announcements]);

    // Filter Logic
    const filteredAnnouncements = useMemo(() => {
        return announcements.filter(a => {
            let matchesFilter = true;
            if (filterPriority === 'Urgent') matchesFilter = a.priority === 'Urgent';
            else if (filterPriority === 'Important') matchesFilter = a.priority === 'Important';
            else if (filterPriority === 'Normal') matchesFilter = a.priority === 'Normal';
            else if (filterPriority === 'Public') matchesFilter = a.isPublic;
            else if (filterPriority === 'Acknowledged') matchesFilter = a.isAcknowledged;

            const q = searchTerm.trim().toLowerCase();
            const matchesSearch = !q ||
                a.title.toLowerCase().includes(q) ||
                a.content.toLowerCase().includes(q) ||
                a.createdByName.toLowerCase().includes(q);

            return matchesFilter && matchesSearch;
        });
    }, [announcements, filterPriority, searchTerm]);

    return (
        <div className="ann-container">
            {/* ── Summary Cards Top Row ── */}
            <div className="ann-stats-grid">
                <StatusCard
                    icon={<Megaphone size={20} strokeWidth={2.3} />}
                    variant="teal"
                    label="TOTAL NOTICES"
                    value={stats.total}
                    subtext="Active bulletins"
                />
                <StatusCard
                    icon={<Flame size={20} strokeWidth={2.3} />}
                    variant="danger"
                    label="PRIORITY NOTICES"
                    value={stats.urgentAndImportant}
                    subtext="Urgent & Important"
                />
                <StatusCard
                    icon={<CheckCircle2 size={20} strokeWidth={2.3} />}
                    variant="success"
                    label="ACKNOWLEDGED"
                    value={stats.acknowledged}
                    subtext="Signed by you"
                />
                <StatusCard
                    icon={<Clock size={20} strokeWidth={2.3} />}
                    variant="warning"
                    label="EXPIRING SOON"
                    value={stats.expiringSoon}
                    subtext="Within 3 days"
                />
            </div>

            {/* ── Header Controls & Search Card ── */}
            <div className="ann-controls-card">
                <div className="ann-search-wrap">
                    <Search size={15} className="ann-search-icon" />
                    <input
                        type="text"
                        className="ann-search-input"
                        placeholder="Search bulletins by title, message, or author..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            className="ann-search-clear"
                            onClick={() => setSearchTerm('')}
                            aria-label="Clear search"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="ann-filter-chips">
                    {[
                        { key: 'All', label: 'All Notices' },
                        { key: 'Urgent', label: 'Urgent', className: 'urgent' },
                        { key: 'Important', label: 'Important', className: 'important' },
                        { key: 'Normal', label: 'Standard' },
                        { key: 'Public', label: 'Public' },
                        { key: 'Acknowledged', label: 'Acknowledged' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            className={`ann-chip ${tab.className || ''} ${filterPriority === tab.key ? 'active' : ''}`}
                            onClick={() => setFilterPriority(tab.key)}
                        >
                            {tab.key === 'Urgent' && <Flame size={12} />}
                            {tab.key === 'Important' && <Sparkles size={12} />}
                            {tab.key === 'Public' && <Globe size={12} />}
                            {tab.key === 'Acknowledged' && <CheckCircle2 size={12} />}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {canCreate && (
                    <button
                        type="button"
                        className="ann-btn-create"
                        onClick={() => setShowCreate(true)}
                    >
                        <Plus size={16} /> New Announcement
                    </button>
                )}
            </div>

            {/* ── Error Banner ── */}
            {error && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10,
                    color: '#ef4444', fontSize: 13
                }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* ── Content Area: Skeletons, Empty State, or Eye-Catching Cards ── */}
            {loading ? (
                <div className="ann-cards-list">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="ann-card" style={{ height: 180, opacity: 0.6 }}>
                            <div style={{ padding: 24 }}>
                                <div style={{ width: '40%', height: 16, background: '#e2e8f0', borderRadius: 4, marginBottom: 12 }}></div>
                                <div style={{ width: '80%', height: 20, background: '#e2e8f0', borderRadius: 4, marginBottom: 12 }}></div>
                                <div style={{ width: '60%', height: 14, background: '#e2e8f0', borderRadius: 4 }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : filteredAnnouncements.length === 0 ? (
                <div className="ann-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%', background: 'rgba(67, 24, 255, 0.08)',
                        color: 'var(--primary, #4318ff)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px'
                    }}>
                        <Megaphone size={26} />
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                        No announcements match
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 auto 16px', maxWidth: 360 }}>
                        {searchTerm || filterPriority !== 'All'
                            ? 'Try adjusting your search query or reset active filters.'
                            : 'No published announcements found at this time.'}
                    </p>
                    {(searchTerm || filterPriority !== 'All') && (
                        <button
                            type="button"
                            className="ann-btn-create"
                            style={{ margin: '0 auto' }}
                            onClick={() => {
                                setSearchTerm('');
                                setFilterPriority('All');
                            }}
                        >
                            Reset filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="ann-cards-list">
                    {filteredAnnouncements.map(a => {
                        const isUrgent = a.priority === 'Urgent';
                        const isImportant = a.priority === 'Important';
                        const priorityClass = isUrgent ? 'urgent' : isImportant ? 'important' : 'normal';
                        const isPublisher = currentUserRole === 'Manager' || currentUserRole === 'Coordinator' || (a.createdById && a.createdById === currentUserId);
                        const commentCount = a.comments?.length || 0;
                        const isCommentsOpen = !!expandedComments[a.id];
                        const expiryStatus = getExpiryStatus(a.expiryDate);

                        return (
                            <div key={a.id} className={`ann-card ${priorityClass}`}>
                                <div className="ann-card-body">
                                    {/* ── Top Row: Badges, Title, Meta ── */}
                                    <div className="ann-card-header">
                                        <div style={{ flex: 1, minWidth: 260 }}>
                                            <div className="ann-badges-row">
                                                {/* Priority Badge */}
                                                <span className={`ann-badge-priority ${priorityClass}`}>
                                                    {isUrgent && <Flame size={12} />}
                                                    {isImportant && <Sparkles size={12} />}
                                                    {!isUrgent && !isImportant && <Megaphone size={12} />}
                                                    {a.priority || 'Normal'}
                                                </span>

                                                {/* Target Audience Badge */}
                                                {a.isPublic ? (
                                                    <span className="ann-badge-audience public">
                                                        <Globe size={11} /> Public View
                                                    </span>
                                                ) : a.targetRoles && !a.targetRoles.includes('All') ? (
                                                    <span className="ann-badge-audience">
                                                        <Lock size={11} /> {a.targetRoles}
                                                    </span>
                                                ) : (
                                                    <span className="ann-badge-audience">
                                                        <Users size={11} /> All Company
                                                    </span>
                                                )}

                                                {/* Ref ID Badge */}
                                                <span
                                                    className="ann-badge-id"
                                                    onClick={e => handleCopyId(a.id, e)}
                                                    title="Click to copy Announcement ID"
                                                >
                                                    REF: {a.id.slice(0, 8)}
                                                    {copiedId === a.id ? (
                                                        <Check size={11} style={{ color: '#059669' }} />
                                                    ) : (
                                                        <Copy size={11} />
                                                    )}
                                                </span>
                                            </div>

                                            <h3 className="ann-card-title">
                                                {a.title}
                                            </h3>

                                            <div className="ann-meta-row">
                                                <div className="ann-author-chip">
                                                    <div
                                                        className="ann-avatar"
                                                        style={{ background: getAvatarBg(a.createdByName || 'Staff') }}
                                                    >
                                                        {getInitials(a.createdByName)}
                                                    </div>
                                                    <span>
                                                        <strong>{a.createdByName}</strong>
                                                        <span style={{ opacity: 0.7, marginLeft: 4 }}>({a.createdByRole || 'Staff'})</span>
                                                    </span>
                                                </div>

                                                <div className="ann-meta-item">
                                                    <Calendar size={13} style={{ color: 'var(--primary, #4318ff)' }} />
                                                    <span>Effective: <strong>{fmtDate(a.effectiveDate)}</strong></span>
                                                </div>

                                                {expiryStatus && (
                                                    <span className={`ann-expiry-pill ${expiryStatus.isUrgent ? 'urgent' : ''}`}>
                                                        <Clock size={11} />
                                                        {expiryStatus.label}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {getRelativeTimeString(a.createdAt)}
                                            </span>
                                            <button
                                                type="button"
                                                className="ann-btn-view-notice"
                                                onClick={() => setSelectedDetail(a)}
                                            >
                                                <Eye size={13} /> Full Notice
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Content Card Box ── */}
                                    <div className="ann-content-box">
                                        {renderFormattedText(a.content)}
                                    </div>

                                    {/* ── Attachment Display (if present) ── */}
                                    {a.attachmentFileName && (
                                        <div className="ann-attachment-card">
                                            <div className="ann-attach-info">
                                                <div className="ann-attach-icon">
                                                    {a.attachmentFileName.match(/\.(jpg|jpeg|png)$/i) ? (
                                                        <ImageIcon size={16} />
                                                    ) : (
                                                        <FileText size={16} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="ann-attach-name" title={a.attachmentFileName}>
                                                        {a.attachmentFileName}
                                                    </div>
                                                    <div className="ann-attach-size">
                                                        {formatFileSize(a.attachmentSizeBytes)}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className="ann-btn-download"
                                                onClick={() => handleDownloadAttachment(a.id)}
                                            >
                                                <Download size={13} /> Download
                                            </button>
                                        </div>
                                    )}

                                    {/* ── Actions & Engagement Bar ── */}
                                    <div className="ann-actions-bar">
                                        <div className="ann-left-actions">
                                            <button
                                                type="button"
                                                className={`ann-btn-ack ${a.isAcknowledged ? 'acknowledged' : ''}`}
                                                onClick={() => !a.isAcknowledged && handleAcknowledge(a.id)}
                                                disabled={a.isAcknowledged || acknowledging[a.id]}
                                                title={a.isAcknowledged ? 'You acknowledged this bulletin' : 'Click to acknowledge reading'}
                                            >
                                                {acknowledging[a.id] ? (
                                                    <Loader2 size={13} className="spin" />
                                                ) : a.isAcknowledged ? (
                                                    <CheckCircle2 size={14} />
                                                ) : (
                                                    <ThumbsUp size={14} />
                                                )}
                                                <span>{a.isAcknowledged ? 'Acknowledged' : 'Acknowledge'}</span>
                                                {a.acknowledgmentCount > 0 && (
                                                    <span className="ann-ack-count">
                                                        {a.acknowledgmentCount}
                                                    </span>
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                className="ann-btn-comment-toggle"
                                                onClick={() => toggleComments(a.id)}
                                            >
                                                <MessageSquare size={13} />
                                                <span>{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
                                                {isCommentsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Publisher Analytics / Roster ── */}
                                    {isPublisher && a.acknowledgments && a.acknowledgments.length > 0 && (
                                        <div className="ann-publisher-roster">
                                            <details>
                                                <summary className="ann-roster-summary">
                                                    <UserCheck size={14} color="#059669" />
                                                    <span>Roster: Acknowledged by {a.acknowledgments.length} team member{a.acknowledgments.length !== 1 ? 's' : ''}</span>
                                                </summary>
                                                <div className="ann-roster-list">
                                                    {a.acknowledgments.map((ack, idx) => (
                                                        <div key={ack.userId || idx} className="ann-roster-item">
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ fontWeight: 600 }}>{ack.fullName}</span>
                                                                {ack.role && <span className="ann-badge-audience" style={{ fontSize: 10 }}>{ack.role}</span>}
                                                            </div>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                                                {fmtDateTime(ack.acknowledgedAt)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        </div>
                                    )}

                                    {/* ── Inline Comments Section ── */}
                                    {isCommentsOpen && (
                                        <div className="ann-comments-section">
                                            {a.comments && a.comments.length > 0 ? (
                                                a.comments.map(c => (
                                                    <div key={c.id} className="ann-comment-bubble">
                                                        <div
                                                            className="ann-avatar"
                                                            style={{ background: getAvatarBg(c.fullName) }}
                                                        >
                                                            {getInitials(c.fullName)}
                                                        </div>
                                                        <div className="ann-comment-content">
                                                            <div className="ann-comment-author-row">
                                                                <span className="ann-comment-name">{c.fullName}</span>
                                                                {c.role && (
                                                                    <span className="ann-badge-audience" style={{ fontSize: 9 }}>
                                                                        {c.role}
                                                                    </span>
                                                                )}
                                                                <span className="ann-comment-time">
                                                                    {getRelativeTimeString(c.createdAt)}
                                                                </span>
                                                            </div>
                                                            <div className="ann-comment-text">
                                                                {c.content}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 10px' }}>
                                                    No comments yet. Start the conversation below.
                                                </p>
                                            )}

                                            {/* Comment Form Input */}
                                            <div className="ann-comment-form">
                                                <div className="ann-comment-input-row">
                                                    <input
                                                        type="text"
                                                        className="ann-comment-input"
                                                        placeholder="Post a reply or question (max 500 chars)..."
                                                        value={commentText[a.id] || ''}
                                                        maxLength={500}
                                                        onChange={e => setCommentText(prev => ({ ...prev, [a.id]: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') handleComment(a.id); }}
                                                        disabled={sendingComment[a.id]}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="ann-btn-send"
                                                        onClick={() => handleComment(a.id)}
                                                        disabled={!commentText[a.id]?.trim() || sendingComment[a.id]}
                                                        title="Post reply"
                                                    >
                                                        {sendingComment[a.id] ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                                                    </button>
                                                </div>
                                                {(commentText[a.id]?.length || 0) > 0 && (
                                                    <span style={{ alignSelf: 'flex-end', fontSize: 10, color: (commentText[a.id]?.length || 0) > 450 ? '#ef4444' : 'var(--text-muted)' }}>
                                                        {commentText[a.id]?.length || 0}/500
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Create Announcement Modal ── */}
            {showCreate && (
                <CreateAnnouncementModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        fetchAnnouncements();
                    }}
                />
            )}

            {/* ── Detail Announcement Modal ── */}
            {selectedDetail && (
                <AnnouncementDetailModal
                    announcement={selectedDetail}
                    onClose={() => setSelectedDetail(null)}
                    onUpdated={() => {
                        fetchAnnouncements();
                    }}
                />
            )}
        </div>
    );
};

// ─── Create Announcement Modal ─────────────────────────────────────────

interface CreateAnnouncementModalProps {
    onClose: () => void;
    onCreated: () => void;
}

const CreateAnnouncementModal: React.FC<CreateAnnouncementModalProps> = ({ onClose, onCreated }) => {
    const minDateTime = useMemo(() => getMinDateTimeLocal(), []);

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isAllAudience, setIsAllAudience] = useState(true);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [effectiveDate, setEffectiveDate] = useState(minDateTime);
    const [expiryDate, setExpiryDate] = useState('');
    const [priority, setPriority] = useState('Normal');
    const [isPublic, setIsPublic] = useState(false);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [activeEditorTab, setActiveEditorTab] = useState<'write' | 'preview'>('write');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const toggleRole = (roleValue: string) => {
        setSelectedRoles(prev => {
            if (prev.includes(roleValue)) {
                return prev.filter(r => r !== roleValue);
            } else {
                return [...prev, roleValue];
            }
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!allowedExts.includes(ext)) {
            setFormError('Only PDF, JPG, and PNG files are allowed as attachments.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setFormError('Attachment size must not exceed 10MB.');
            return;
        }

        setFormError('');
        setAttachment(file);
    };

    const insertFormatting = (prefix: string, suffix: string = '') => {
        if (!textareaRef.current) return;
        const ta = textareaRef.current;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selText = content.substring(start, end) || 'text';
        const newContent = content.substring(0, start) + prefix + selText + suffix + content.substring(end);
        setContent(newContent);
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(start + prefix.length, start + prefix.length + selText.length);
        }, 0);
    };

    const isEffectiveDatePast = useMemo(() => {
        if (!effectiveDate) return false;
        const selected = new Date(effectiveDate).getTime();
        const current = Date.now() - 2 * 60 * 1000; // 2 min grace
        return selected < current;
    }, [effectiveDate]);

    const handleSubmit = async () => {
        if (!title.trim()) {
            setFormError('Announcement title is required.');
            return;
        }
        if (title.length > 200) {
            setFormError('Announcement title must not exceed 200 characters.');
            return;
        }
        if (!content.trim()) {
            setFormError('Announcement content is required.');
            return;
        }
        if (!isAllAudience && selectedRoles.length === 0) {
            setFormError('Please select at least one target role, or choose All Users.');
            return;
        }
        if (!effectiveDate) {
            setFormError('Effective date is required.');
            return;
        }

        // Strict validation: Don't allow old dates
        const nowMs = Date.now() - 2 * 60 * 1000;
        if (new Date(effectiveDate).getTime() < nowMs) {
            setFormError('Effective date cannot be in the past. Please select the current date and time or a future date.');
            return;
        }

        if (expiryDate && new Date(expiryDate) < new Date(effectiveDate)) {
            setFormError('Expiry date must not precede the effective date.');
            return;
        }

        setFormError('');
        setSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('title', title.trim());
            formData.append('content', content.trim());
            formData.append('targetRoles', isAllAudience ? 'All Users' : selectedRoles.join(', '));
            formData.append('effectiveDate', new Date(effectiveDate).toISOString());
            if (expiryDate) {
                formData.append('expiryDate', new Date(expiryDate).toISOString());
            }
            formData.append('priority', priority);
            formData.append('isPublic', String(isPublic));
            if (attachment) {
                formData.append('attachment', attachment);
            }

            const res = await api.upload('/api/Announcement', formData);

            if (res.data?.isSuccess) {
                setSuccessMessage('Announcement published successfully! Notifying targeted users...');
                setTimeout(() => {
                    onCreated();
                }, 1000);
            } else {
                setFormError(res.data?.message || 'Failed to create announcement.');
                setSubmitting(false);
            }
        } catch (err: any) {
            const resp = err.response?.data;
            const msg = resp?.message || (resp?.errors ? Object.values(resp.errors).flat().join('. ') : '') || err.message || 'Failed to create announcement.';
            setFormError(msg);
            setSubmitting(false);
        }
    };

    return (
        <FormModal
            isOpen
            onClose={onClose}
            title="Create Announcement"
            subtitle="Publish an announcement with target audience filtering, priority, and attachments."
            size="lg"
            footer={
                <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {successMessage ? (
                        <span style={{ color: '#059669', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                            <CheckCircle2 size={16} /> {successMessage}
                        </span>
                    ) : null}
                    <button className="btn" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button
                        className="btn"
                        onClick={handleSubmit}
                        disabled={submitting || !!successMessage || isEffectiveDatePast}
                        style={{
                            background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: submitting || !!successMessage || isEffectiveDatePast ? 'not-allowed' : 'pointer',
                            opacity: isEffectiveDatePast ? 0.6 : 1,
                        }}
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={13} className="spin" /> Publishing...
                            </>
                        ) : (
                            <>
                                <Megaphone size={13} /> Publish Announcement
                            </>
                        )}
                    </button>
                </div>
            }
        >
            {formError && (
                <div className="form-api-error" style={{ marginBottom: 14 }}>
                    <AlertCircle size={15} />
                    <span>{formError}</span>
                </div>
            )}

            {/* Title */}
            <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ margin: 0, fontWeight: 600 }}>
                        Announcement Title <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span style={{ fontSize: 11, color: title.length > 180 ? '#ef4444' : 'var(--text-muted)' }}>
                        {title.length}/200
                    </span>
                </div>
                <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Critical System Maintenance & Dispatch Guidelines"
                    maxLength={200}
                />
            </div>

            {/* Priority & Target Audience Row */}
            <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Priority Level */}
                <div className="field">
                    <label style={{ fontWeight: 600 }}>
                        Priority Level
                    </label>
                    <select value={priority} onChange={e => setPriority(e.target.value)}>
                        <option value="Normal">Normal (Standard Bulletin)</option>
                        <option value="Important">Important (Elevated Notice)</option>
                        <option value="Urgent">Urgent (Immediate Attention Required)</option>
                    </select>
                </div>

                {/* Target Audience Quick Mode */}
                <div className="field">
                    <label style={{ fontWeight: 600 }}>
                        Target Audience <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: isAllAudience ? 'rgba(67, 24, 255, 0.1)' : 'var(--bg-main)',
                                color: isAllAudience ? 'var(--primary)' : 'var(--text-primary)',
                                fontWeight: isAllAudience ? 600 : 400,
                            }}
                        >
                            <input
                                type="radio"
                                name="audience_type"
                                checked={isAllAudience}
                                onChange={() => setIsAllAudience(true)}
                                style={{ display: 'none' }}
                            />
                            <Globe size={14} /> All Users
                        </label>

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: !isAllAudience ? 'rgba(67, 24, 255, 0.1)' : 'var(--bg-main)',
                                color: !isAllAudience ? 'var(--primary)' : 'var(--text-primary)',
                                fontWeight: !isAllAudience ? 600 : 400,
                            }}
                        >
                            <input
                                type="radio"
                                name="audience_type"
                                checked={!isAllAudience}
                                onChange={() => setIsAllAudience(false)}
                                style={{ display: 'none' }}
                            />
                            <Users size={14} /> Specific Roles
                        </label>
                    </div>
                </div>
            </div>

            {/* Role Multi-Select */}
            {!isAllAudience && (
                <div className="field" style={{ background: 'var(--bg-main)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'block' }}>
                        Select Target Roles: <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {AVAILABLE_ROLES.map(role => {
                            const isSelected = selectedRoles.includes(role.value);
                            return (
                                <button
                                    type="button"
                                    key={role.value}
                                    onClick={() => toggleRole(role.value)}
                                    className={`btn btn-sm ${isSelected ? 'btn-primary' : ''}`}
                                    style={{
                                        fontSize: 12,
                                        padding: '5px 12px',
                                        borderRadius: 20,
                                        background: isSelected ? undefined : 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    {isSelected ? <CheckCircle2 size={12} style={{ marginRight: 4 }} /> : null}
                                    {role.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Content Field with formatting and preview */}
            <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ margin: 0, fontWeight: 600 }}>
                        Announcement Content <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button
                            type="button"
                            className={`btn btn-sm ${activeEditorTab === 'write' ? 'btn-primary' : ''}`}
                            onClick={() => setActiveEditorTab('write')}
                            style={{ fontSize: 11, padding: '2px 8px', height: 24 }}
                        >
                            <Edit3 size={11} style={{ marginRight: 3 }} /> Write
                        </button>
                        <button
                            type="button"
                            className={`btn btn-sm ${activeEditorTab === 'preview' ? 'btn-primary' : ''}`}
                            onClick={() => setActiveEditorTab('preview')}
                            style={{ fontSize: 11, padding: '2px 8px', height: 24 }}
                        >
                            <Eye size={11} style={{ marginRight: 3 }} /> Preview
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                {activeEditorTab === 'write' && (
                    <div
                        style={{
                            display: 'flex',
                            gap: 4,
                            padding: '4px 8px',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            borderBottom: 'none',
                            borderTopLeftRadius: 8,
                            borderTopRightRadius: 8,
                            flexWrap: 'wrap',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => insertFormatting('**', '**')}
                            title="Bold"
                            style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', borderRadius: 4, color: 'var(--text-primary)' }}
                        >
                            <Bold size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertFormatting('*', '*')}
                            title="Italic"
                            style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', borderRadius: 4, color: 'var(--text-primary)' }}
                        >
                            <Italic size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertFormatting('## ')}
                            title="Heading"
                            style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', borderRadius: 4, color: 'var(--text-primary)' }}
                        >
                            <Heading size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertFormatting('- ')}
                            title="Bullet List"
                            style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', borderRadius: 4, color: 'var(--text-primary)' }}
                        >
                            <List size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertFormatting('1. ')}
                            title="Numbered List"
                            style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', borderRadius: 4, color: 'var(--text-primary)' }}
                        >
                            <ListOrdered size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertFormatting('> ')}
                            title="Quote"
                            style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', borderRadius: 4, color: 'var(--text-primary)' }}
                        >
                            <Quote size={13} />
                        </button>
                    </div>
                )}

                {activeEditorTab === 'write' ? (
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="Write your announcement details here. You can use Markdown formatting like bold, lists, and headings..."
                        rows={6}
                        maxLength={10000}
                        style={{
                            resize: 'vertical',
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            fontFamily: 'inherit',
                        }}
                    />
                ) : (
                    <div
                        style={{
                            minHeight: 140,
                            padding: '12px 14px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 14,
                            lineHeight: 1.6,
                        }}
                    >
                        {content.trim() ? renderFormattedText(content) : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview.</span>}
                    </div>
                )}
            </div>

            {/* Dates: Effective Date & Expiry Date */}
            <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="field">
                    <label style={{ fontWeight: 600 }}>
                        Effective Date <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="datetime-local"
                        value={effectiveDate}
                        min={minDateTime}
                        onChange={e => {
                            setEffectiveDate(e.target.value);
                            if (expiryDate && e.target.value && new Date(expiryDate) < new Date(e.target.value)) {
                                setExpiryDate('');
                            }
                        }}
                        style={{
                            borderColor: isEffectiveDatePast ? '#ef4444' : undefined,
                        }}
                    />
                    <span className={`ann-date-hint ${isEffectiveDatePast ? 'error' : 'valid'}`}>
                        {isEffectiveDatePast
                            ? '⚠ Cannot select dates in the past. Only current date/time and future dates allowed.'
                            : '✓ Date/time must be current or future scheduled date.'}
                    </span>
                </div>
                <div className="field">
                    <label style={{ fontWeight: 600 }}>
                        Expiry Date <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>
                    </label>
                    <input
                        type="datetime-local"
                        value={expiryDate}
                        min={effectiveDate || minDateTime}
                        onChange={e => setExpiryDate(e.target.value)}
                    />
                    <span className="ann-date-hint">
                        Automatically archives after this date/time.
                    </span>
                </div>
            </div>

            {/* Attachment & Public View Option Row */}
            <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, alignItems: 'center' }}>
                <div className="field">
                    <label style={{ fontWeight: 600 }}>
                        Attachment <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional, PDF/JPG/PNG, max 10MB)</span>
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <Paperclip size={13} /> Choose File
                        </button>
                        {attachment ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)' }}>
                                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {attachment.name}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>({formatFileSize(attachment.size)})</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAttachment(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                                    aria-label="Remove attachment"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No file chosen</span>
                        )}
                    </div>
                </div>

                <div className="field" style={{ paddingTop: 18 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, margin: 0 }}>
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={e => setIsPublic(e.target.checked)}
                            style={{ width: 16, height: 16 }}
                        />
                        <span style={{ fontWeight: 600 }}>Allow Public View</span>
                    </label>
                    <p style={{ margin: '2px 0 0 24px', fontSize: 11, color: 'var(--text-muted)' }}>
                        Visible to all roles even if target roles are configured.
                    </p>
                </div>
            </div>
        </FormModal>
    );
};

export default AnnouncementsTab;
