import React, { useEffect, useState } from 'react';
import { Megaphone, AlertTriangle, AlertCircle, Info, ChevronRight, CheckCircle2, Paperclip, ThumbsUp, Loader2 } from 'lucide-react';
import api from '../../api';

interface AnnouncementItem {
    id: string;
    title: string;
    content: string;
    targetRoles?: string;
    effectiveDate: string;
    expiryDate?: string;
    priority: string;
    isPublic: boolean;
    attachmentFileName?: string;
    hasAttachment?: boolean;
    createdByName: string;
    createdByRole: string;
    createdAt: string;
    isAcknowledged: boolean;
    acknowledgmentCount: number;
}

interface AnnouncementBannerProps {
    onNavigateToAnnouncements?: () => void;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ onNavigateToAnnouncements }) => {
    const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [acknowledging, setAcknowledging] = useState<Record<string, boolean>>({});

    const fetchActive = async () => {
        try {
            const res = await api.get('/api/Announcement/active');
            if (res.data?.isSuccess && Array.isArray(res.data?.data)) {
                setAnnouncements(res.data.data);
            }
        } catch {
            // Non-blocking
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActive();
    }, []);

    const handleAcknowledge = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setAcknowledging(prev => ({ ...prev, [id]: true }));
        try {
            await api.post(`/api/Announcement/${id}/acknowledge`);
            setAnnouncements(prev =>
                prev.map(a => (a.id === id ? { ...a, isAcknowledged: true, acknowledgmentCount: a.acknowledgmentCount + 1 } : a))
            );
        } catch {
            // Ignore error
        } finally {
            setAcknowledging(prev => ({ ...prev, [id]: false }));
        }
    };

    if (loading || announcements.length === 0) return null;

    // Show top active announcements (up to 3 latest/urgent)
    const displayList = announcements.slice(0, 3);

    return (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayList.map(a => {
                const isUrgent = a.priority === 'Urgent';
                const isImportant = a.priority === 'Important';

                const borderLeftColor = isUrgent
                    ? 'var(--status-failed, #ef4444)'
                    : isImportant
                    ? 'var(--status-pending, #f59e0b)'
                    : 'var(--primary, #4318ff)';

                const bgGradient = isUrgent
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, var(--bg-card) 100%)'
                    : isImportant
                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, var(--bg-card) 100%)'
                    : 'linear-gradient(135deg, rgba(67, 24, 255, 0.06) 0%, var(--bg-card) 100%)';

                return (
                    <div
                        key={a.id}
                        className="card"
                        style={{
                            margin: 0,
                            padding: '14px 18px',
                            borderLeft: `4px solid ${borderLeftColor}`,
                            background: bgGradient,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                            flexWrap: 'wrap',
                            boxShadow: isUrgent ? '0 4px 14px rgba(239, 68, 68, 0.12)' : undefined,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: isUrgent
                                        ? 'rgba(239, 68, 68, 0.15)'
                                        : isImportant
                                        ? 'rgba(245, 158, 11, 0.15)'
                                        : 'rgba(67, 24, 255, 0.12)',
                                    color: isUrgent ? '#ef4444' : isImportant ? '#f59e0b' : 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                {isUrgent ? <AlertCircle size={18} /> : isImportant ? <AlertTriangle size={18} /> : <Megaphone size={18} />}
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                                    <span
                                        className={`badge ${
                                            isUrgent ? 'badge-red' : isImportant ? 'badge-yellow' : 'badge-blue'
                                        }`}
                                        style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}
                                    >
                                        {a.priority || 'Normal'}
                                    </span>
                                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {a.title}
                                    </h4>
                                    {a.attachmentFileName && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                                            <Paperclip size={11} /> Attachment
                                        </span>
                                    )}
                                </div>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, maxHeight: 38, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {a.content.replace(/[#*_`]/g, '')}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                className={`btn btn-sm ${a.isAcknowledged ? 'btn-success' : ''}`}
                                onClick={(e) => !a.isAcknowledged && handleAcknowledge(a.id, e)}
                                disabled={a.isAcknowledged || acknowledging[a.id]}
                                style={{ fontSize: 12, padding: '5px 10px', height: 32 }}
                                title={a.isAcknowledged ? 'You acknowledged this announcement' : 'Click to acknowledge'}
                            >
                                {acknowledging[a.id] ? (
                                    <Loader2 size={12} className="spin" />
                                ) : a.isAcknowledged ? (
                                    <CheckCircle2 size={13} />
                                ) : (
                                    <ThumbsUp size={13} />
                                )}
                                {' '}{a.isAcknowledged ? 'Acknowledged' : 'Acknowledge'}
                            </button>

                            {onNavigateToAnnouncements && (
                                <button
                                    className="btn btn-sm"
                                    onClick={onNavigateToAnnouncements}
                                    style={{ fontSize: 12, padding: '5px 10px', height: 32 }}
                                >
                                    View Board <ChevronRight size={13} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default AnnouncementBanner;
