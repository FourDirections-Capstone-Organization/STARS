import React, { useEffect, useState, useRef } from 'react';
import {
    Megaphone, Plus, X, Loader2, AlertCircle, CheckCircle2, Clock, Users,
    Calendar, MessageSquare, ThumbsUp, Send, Paperclip, Download, FileText,
    Image as ImageIcon, Eye, Edit3, Bold, Italic, List, ListOrdered, Heading, Quote,
    AlertTriangle, Globe, Lock, UserCheck, Copy, Check
} from 'lucide-react';
import FormModal from '../FormModal/FormModal';
import api from '../../api';
import AnnouncementDetailModal, { AnnouncementItem, AcknowledgmentUserDTO, CommentDTO } from './AnnouncementDetailModal';

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
                <blockquote key={idx} style={{ margin: '6px 0', paddingLeft: 12, borderLeft: '3px solid var(--primary)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    {line.slice(2)}
                </blockquote>
            );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
                <div key={idx} style={{ display: 'flex', gap: 6, margin: '2px 0 2px 8px' }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>•</span>
                    <span>{line.slice(2)}</span>
                </div>
            );
        }
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
            return (
                <div key={idx} style={{ display: 'flex', gap: 6, margin: '2px 0 2px 8px' }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 600, minWidth: 16 }}>{numMatch[1]}.</span>
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

const AnnouncementsTab: React.FC<AnnouncementsTabProps> = ({ canCreate }) => {
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

    const filteredAnnouncements = announcements.filter(a => {
        const matchesPriority = filterPriority === 'All' || a.priority === filterPriority;
        const matchesSearch = !searchTerm ||
            a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.createdByName.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesPriority && matchesSearch;
    });

    return (
        <div className="dashboard-content">
            {/* Header / Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 700, margin: 0 }}>
                        <Megaphone size={22} style={{ color: 'var(--primary)' }} /> Announcements & Bulletin
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                        Official company-wide notices, operational updates, and role-specific bulletins.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {canCreate && (
                        <button
                            className="btn"
                            onClick={() => setShowCreate(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#06b6d4',
                                color: '#ffffff',
                                border: '1px solid #0891b2',
                                fontWeight: 600,
                                fontSize: 13,
                                padding: '8px 16px',
                                borderRadius: 8,
                                boxShadow: '0 2px 6px rgba(6, 182, 212, 0.35)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#0891b2'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#06b6d4'; }}
                        >
                            <Plus size={16} /> New Announcement
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
                    <input
                        type="text"
                        placeholder="Search announcements by title, content, or author..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            fontSize: 13,
                            background: 'var(--bg-main)',
                            color: 'var(--text-primary)',
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Priority:</span>
                    {['All', 'Urgent', 'Important', 'Normal'].map(p => (
                        <button
                            key={p}
                            className={`btn btn-sm ${filterPriority === p ? 'btn-primary' : ''}`}
                            onClick={() => setFilterPriority(p)}
                            style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                height: 30,
                                background: filterPriority === p ? undefined : 'var(--bg-main)',
                            }}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--status-failed)' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="card">
                    <div className="empty-state">
                        <Loader2 size={24} className="spin" />
                        <p>Loading announcements...</p>
                    </div>
                </div>
            ) : filteredAnnouncements.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Megaphone size={32} style={{ color: 'var(--text-muted)' }} />
                        <p style={{ marginTop: 10, fontWeight: 600 }}>No announcements found</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {searchTerm || filterPriority !== 'All' ? 'Try adjusting your search or priority filter.' : 'New announcements will appear here once published.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {filteredAnnouncements.map(a => {
                        const isUrgent = a.priority === 'Urgent';
                        const isImportant = a.priority === 'Important';
                        const borderLeftColor = isUrgent ? 'var(--status-failed, #ef4444)' : isImportant ? 'var(--status-pending, #f59e0b)' : 'var(--primary)';
                        const isPublisher = currentUserRole === 'Manager' || currentUserRole === 'Coordinator' || (a.createdById && a.createdById === currentUserId);
                        const commentCount = a.comments?.length || 0;

                        return (
                            <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div
                                    style={{
                                        padding: '20px 24px 16px',
                                        borderLeft: `4px solid ${borderLeftColor}`,
                                        background: isUrgent
                                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, transparent 100%)'
                                            : isImportant
                                            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, transparent 100%)'
                                            : 'linear-gradient(135deg, rgba(67, 24, 255, 0.03) 0%, transparent 100%)',
                                    }}
                                >
                                    {/* Top Row: Title + Badges + Date + System Reference */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: 260 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                {/* Priority Badge */}
                                                <span
                                                    className={`badge ${isUrgent ? 'badge-red' : isImportant ? 'badge-yellow' : 'badge-blue'}`}
                                                    style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}
                                                >
                                                    {isUrgent && <AlertCircle size={10} style={{ marginRight: 3, verticalAlign: -1 }} />}
                                                    {isImportant && <AlertTriangle size={10} style={{ marginRight: 3, verticalAlign: -1 }} />}
                                                    {a.priority || 'Normal'}
                                                </span>

                                                {/* Target Audience Badge */}
                                                {a.isPublic ? (
                                                    <span className="badge badge-green" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <Globe size={10} /> Public View
                                                    </span>
                                                ) : a.targetRoles ? (
                                                    <span className="badge badge-blue" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <Lock size={10} /> {a.targetRoles}
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-green" style={{ fontSize: 10 }}>All Users</span>
                                                )}

                                                {/* Ref ID Badge */}
                                                <span
                                                    onClick={(e) => handleCopyId(a.id, e)}
                                                    title="Click to copy Announcement ID"
                                                    style={{
                                                        cursor: 'pointer',
                                                        fontSize: 10,
                                                        color: 'var(--text-muted)',
                                                        background: 'var(--bg-main)',
                                                        padding: '2px 6px',
                                                        borderRadius: 4,
                                                        border: '1px solid var(--border)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 3,
                                                        fontFamily: 'monospace',
                                                    }}
                                                >
                                                    ID: {a.id.slice(0, 8)} {copiedId === a.id ? <Check size={10} style={{ color: 'var(--status-active)' }} /> : <Copy size={10} />}
                                                </span>
                                            </div>

                                            <h4 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                                                {a.title}
                                            </h4>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Users size={12} /> {a.createdByName} <span style={{ opacity: 0.7 }}>({a.createdByRole})</span>
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Calendar size={12} /> Effective: {fmtDate(a.effectiveDate)}
                                                </span>
                                                {a.expiryDate && (
                                                    <span
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            color: isExpiringSoon(a.expiryDate) ? 'var(--status-pending)' : undefined,
                                                            fontWeight: isExpiringSoon(a.expiryDate) ? 600 : undefined,
                                                        }}
                                                    >
                                                        <Clock size={12} /> Expires: {fmtDate(a.expiryDate)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                Posted {fmtDateTime(a.createdAt)}
                                            </span>
                                            <button
                                                className="btn btn-sm"
                                                onClick={() => setSelectedDetail(a)}
                                                style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                                            >
                                                <Eye size={12} /> View Full Notice
                                            </button>
                                        </div>
                                    </div>

                                    {/* Content Card */}
                                    <div
                                        style={{
                                            marginTop: 14,
                                            padding: '16px 18px',
                                            background: 'var(--bg-card)',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            fontSize: 14,
                                            lineHeight: 1.65,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {renderFormattedText(a.content)}
                                    </div>

                                    {/* Attachment Display (if present) */}
                                    {a.attachmentFileName && (
                                        <div
                                            style={{
                                                marginTop: 12,
                                                padding: '10px 14px',
                                                background: 'var(--bg-main)',
                                                borderRadius: 8,
                                                border: '1px dashed var(--border)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div
                                                    style={{
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius: 6,
                                                        background: 'var(--primary)',
                                                        color: '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    {a.attachmentFileName.toLowerCase().endsWith('.pdf') ? <FileText size={16} /> : <ImageIcon size={16} />}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {a.attachmentFileName}
                                                    </div>
                                                    {a.attachmentSizeBytes && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                            {formatFileSize(a.attachmentSizeBytes)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                className="btn btn-sm"
                                                onClick={() => handleDownloadAttachment(a.id)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                            >
                                                <Download size={12} /> Download
                                            </button>
                                        </div>
                                    )}

                                    {/* Acknowledge + Comment actions */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                                        <button
                                            className={`btn btn-sm ${a.isAcknowledged ? 'btn-success' : ''}`}
                                            onClick={() => !a.isAcknowledged && handleAcknowledge(a.id)}
                                            disabled={a.isAcknowledged || acknowledging[a.id]}
                                            style={a.isAcknowledged ? { cursor: 'default' } : {}}
                                            title={a.isAcknowledged ? 'You have already acknowledged this announcement' : 'Click to acknowledge'}
                                        >
                                            {acknowledging[a.id] ? (
                                                <Loader2 size={12} className="spin" />
                                            ) : a.isAcknowledged ? (
                                                <CheckCircle2 size={12} />
                                            ) : (
                                                <ThumbsUp size={12} />
                                            )}
                                            {' '}{a.isAcknowledged ? 'Acknowledged' : 'Acknowledge'}
                                            {a.acknowledgmentCount > 0 && (
                                                <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>
                                                    {a.acknowledgmentCount}
                                                </span>
                                            )}
                                        </button>

                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            <MessageSquare size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                            {commentCount} comment{commentCount !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {/* Publisher View: Acknowledgments list */}
                                    {isPublisher && a.acknowledgments && a.acknowledgments.length > 0 && (
                                        <details style={{ marginTop: 12, fontSize: 12 }}>
                                            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                <UserCheck size={13} style={{ marginRight: 4, verticalAlign: -2, color: 'var(--status-active)' }} />
                                                Acknowledged by {a.acknowledgments.length} user{a.acknowledgments.length !== 1 ? 's' : ''}
                                            </summary>
                                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                                                {a.acknowledgments.map((ack, idx) => (
                                                    <div
                                                        key={ack.userId || idx}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '4px 10px',
                                                            background: 'var(--bg-main)',
                                                            borderRadius: 6,
                                                            border: '1px solid var(--border)',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontWeight: 500 }}>{ack.fullName}</span>
                                                            {ack.role && <span className="badge badge-blue" style={{ fontSize: 9 }}>{ack.role}</span>}
                                                        </div>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{fmtDateTime(ack.acknowledgedAt)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    {/* Comments thread */}
                                    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                                        {a.comments && a.comments.map(c => (
                                            <div
                                                key={c.id}
                                                style={{
                                                    display: 'flex',
                                                    gap: 10,
                                                    padding: '8px 0',
                                                    borderBottom: '1px solid var(--border)',
                                                    fontSize: 13,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: '50%',
                                                        background: c.userId === currentUserId ? 'var(--status-active)' : 'var(--primary)',
                                                        color: '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {c.fullName.charAt(0).toUpperCase()}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontWeight: 600, fontSize: 12 }}>
                                                            {c.fullName}
                                                        </span>
                                                        {c.role && (
                                                            <span className="badge badge-blue" style={{ fontSize: 9 }}>
                                                                {c.role}
                                                            </span>
                                                        )}
                                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>
                                                            {fmtDateTime(c.createdAt)}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginTop: 2, lineHeight: 1.45, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                                        {c.content}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* In-card Comment Form (max 500 characters) */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <input
                                                    type="text"
                                                    placeholder="Write a comment or question (max 500 chars)..."
                                                    value={commentText[a.id] || ''}
                                                    maxLength={500}
                                                    onChange={e => setCommentText(prev => ({ ...prev, [a.id]: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleComment(a.id); }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px 12px',
                                                        borderRadius: 8,
                                                        border: '1px solid var(--border)',
                                                        fontSize: 13,
                                                        outline: 'none',
                                                        fontFamily: 'inherit',
                                                        background: 'var(--bg-main)',
                                                        color: 'var(--text-primary)',
                                                    }}
                                                    disabled={sendingComment[a.id]}
                                                />
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handleComment(a.id)}
                                                    disabled={!commentText[a.id]?.trim() || sendingComment[a.id]}
                                                >
                                                    {sendingComment[a.id] ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                                                </button>
                                            </div>
                                            {(commentText[a.id]?.length || 0) > 0 && (
                                                <div style={{ alignSelf: 'flex-end', fontSize: 10, color: (commentText[a.id]?.length || 0) > 450 ? 'var(--status-failed)' : 'var(--text-muted)' }}>
                                                    {commentText[a.id]?.length || 0}/500
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Announcement Modal */}
            {showCreate && (
                <CreateAnnouncementModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        fetchAnnouncements();
                    }}
                />
            )}

            {/* Detail Announcement Modal */}
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
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isAllAudience, setIsAllAudience] = useState(true);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [effectiveDate, setEffectiveDate] = useState(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    });
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
                        <span style={{ color: 'var(--status-active)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={16} /> {successMessage}
                        </span>
                    ) : null}
                    <button className="btn" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button
                        className="btn"
                        onClick={handleSubmit}
                        disabled={submitting || !!successMessage}
                        style={{
                            background: '#06b6d4',
                            color: '#ffffff',
                            border: '1px solid #0891b2',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: submitting || !!successMessage ? 'not-allowed' : 'pointer',
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
                        Announcement Title <span style={{ color: 'var(--status-failed)' }}>*</span>
                    </label>
                    <span style={{ fontSize: 11, color: title.length > 180 ? 'var(--status-failed)' : 'var(--text-muted)' }}>
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
                        Priority Level <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>
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
                        Target Audience <span style={{ color: 'var(--status-failed)' }}>*</span>
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
                        Select Target Roles: <span style={{ color: 'var(--status-failed)' }}>*</span>
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
                        Announcement Content <span style={{ color: 'var(--status-failed)' }}>*</span>
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
                        Effective Date <span style={{ color: 'var(--status-failed)' }}>*</span>
                    </label>
                    <input
                        type="datetime-local"
                        value={effectiveDate}
                        onChange={e => setEffectiveDate(e.target.value)}
                    />
                </div>
                <div className="field">
                    <label style={{ fontWeight: 600 }}>
                        Expiry Date <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>
                    </label>
                    <input
                        type="datetime-local"
                        value={expiryDate}
                        onChange={e => setExpiryDate(e.target.value)}
                        min={effectiveDate}
                    />
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
                                    style={{ background: 'none', border: 'none', color: 'var(--status-failed)', cursor: 'pointer', padding: 2 }}
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
