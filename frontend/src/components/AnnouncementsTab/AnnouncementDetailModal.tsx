import React, { useState } from 'react';
import {
    Megaphone, X, Clock, Users, Calendar, MessageSquare, ThumbsUp,
    Send, Paperclip, Download, FileText, Image as ImageIcon, CheckCircle2,
    AlertCircle, AlertTriangle, Globe, Lock, Copy, Check, UserCheck, Loader2
} from 'lucide-react';
import FormModal from '../FormModal/FormModal';
import api from '../../api';

export interface CommentDTO {
    id: string;
    userId: string;
    fullName: string;
    role?: string;
    content: string;
    createdAt: string;
}

export interface AcknowledgmentUserDTO {
    userId: string;
    fullName: string;
    role?: string;
    acknowledgedAt: string;
}

export interface AnnouncementItem {
    id: string;
    title: string;
    content: string;
    targetRoles?: string;
    effectiveDate: string;
    expiryDate?: string;
    priority: string;
    isPublic: boolean;
    attachmentFileName?: string;
    attachmentContentType?: string;
    attachmentSizeBytes?: number;
    hasAttachment?: boolean;
    createdById?: string;
    createdByName: string;
    createdByRole: string;
    createdAt: string;
    isAcknowledged: boolean;
    acknowledgmentCount: number;
    acknowledgments?: AcknowledgmentUserDTO[];
    comments?: CommentDTO[];
}

interface AnnouncementDetailModalProps {
    announcement: AnnouncementItem;
    onClose: () => void;
    onUpdated?: () => void;
}

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

export const AnnouncementDetailModal: React.FC<AnnouncementDetailModalProps> = ({ announcement, onClose, onUpdated }) => {
    const [item, setItem] = useState<AnnouncementItem>(announcement);
    const [commentContent, setCommentContent] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [acknowledging, setAcknowledging] = useState(false);
    const [copiedId, setCopiedId] = useState(false);
    const [commentError, setCommentError] = useState('');
    const [ackError, setAckError] = useState('');

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

    const isPublisher = currentUserRole === 'Manager' || currentUserRole === 'Coordinator' || (item.createdById && item.createdById === currentUserId);

    const handleCopyId = () => {
        navigator.clipboard.writeText(item.id);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
    };

    const handleAcknowledge = async () => {
        if (item.isAcknowledged || acknowledging) return;
        setAcknowledging(true);
        setAckError('');
        try {
            const res = await api.post(`/api/Announcement/${item.id}/acknowledge`);
            if (res.data?.isSuccess) {
                setItem(prev => ({
                    ...prev,
                    isAcknowledged: true,
                    acknowledgmentCount: prev.acknowledgmentCount + 1,
                    acknowledgments: [
                        ...(prev.acknowledgments || []),
                        {
                            userId: currentUserId,
                            fullName: 'You',
                            role: currentUserRole,
                            acknowledgedAt: new Date().toISOString(),
                        }
                    ]
                }));
                onUpdated?.();
            } else {
                setAckError(res.data?.message || 'Failed to acknowledge announcement');
            }
        } catch (err: any) {
            setAckError(err.response?.data?.message || 'Failed to acknowledge announcement');
        } finally {
            setAcknowledging(false);
        }
    };

    const handleAddComment = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = commentContent.trim();
        if (!trimmed) return;
        if (trimmed.length > 500) {
            setCommentError('Comment must not exceed 500 characters.');
            return;
        }

        setSubmittingComment(true);
        setCommentError('');
        try {
            const res = await api.post(`/api/Announcement/${item.id}/comments`, { content: trimmed });
            if (res.data?.isSuccess && res.data?.data) {
                const newComment: CommentDTO = res.data.data;
                setItem(prev => ({
                    ...prev,
                    comments: [...(prev.comments || []), newComment]
                }));
                setCommentContent('');
                onUpdated?.();
            } else {
                setCommentError(res.data?.message || 'Failed to post comment.');
            }
        } catch (err: any) {
            setCommentError(err.response?.data?.message || 'Failed to post comment.');
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleDownloadAttachment = () => {
        const baseUrl = api.defaults.baseURL || '';
        const downloadUrl = `${baseUrl}/api/Announcement/${item.id}/attachment`;
        window.open(downloadUrl, '_blank');
    };

    const isUrgent = item.priority === 'Urgent';
    const isImportant = item.priority === 'Important';
    const borderLeftColor = isUrgent ? 'var(--status-failed, #ef4444)' : isImportant ? 'var(--status-pending, #f59e0b)' : 'var(--primary)';

    return (
        <FormModal
            isOpen
            onClose={onClose}
            title="Announcement Details"
            subtitle="Full notice details, attachments, acknowledgments, and discussion thread."
            size="lg"
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    {/* Read-only System ID Reference */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span>Ref ID:</span>
                        <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                            {item.id.slice(0, 8)}...{item.id.slice(-4)}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopyId}
                            title="Copy Announcement ID"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId ? 'var(--status-active)' : 'var(--text-muted)', padding: 2 }}
                        >
                            {copiedId ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                    </div>

                    <button className="btn" onClick={onClose}>
                        Close
                    </button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header Card */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderRadius: 8,
                        borderLeft: `4px solid ${borderLeftColor}`,
                        background: isUrgent
                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, var(--bg-card) 100%)'
                            : isImportant
                            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, var(--bg-card) 100%)'
                            : 'linear-gradient(135deg, rgba(67, 24, 255, 0.04) 0%, var(--bg-card) 100%)',
                        border: '1px solid var(--border)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span
                            className={`badge ${isUrgent ? 'badge-red' : isImportant ? 'badge-yellow' : 'badge-blue'}`}
                            style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}
                        >
                            {isUrgent && <AlertCircle size={10} style={{ marginRight: 3, verticalAlign: -1 }} />}
                            {isImportant && <AlertTriangle size={10} style={{ marginRight: 3, verticalAlign: -1 }} />}
                            {item.priority || 'Normal'}
                        </span>

                        {item.isPublic ? (
                            <span className="badge badge-green" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Globe size={10} /> Public View
                            </span>
                        ) : item.targetRoles ? (
                            <span className="badge badge-blue" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Lock size={10} /> {item.targetRoles}
                            </span>
                        ) : (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>All Users</span>
                        )}
                    </div>

                    <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {item.title}
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users size={12} /> Published by <strong>{item.createdByName}</strong> ({item.createdByRole})
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={12} /> Effective: {fmtDate(item.effectiveDate)}
                        </span>
                        {item.expiryDate && (
                            <span
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: isExpiringSoon(item.expiryDate) ? 'var(--status-pending)' : undefined,
                                    fontWeight: isExpiringSoon(item.expiryDate) ? 600 : undefined,
                                }}
                            >
                                <Clock size={12} /> Expires: {fmtDate(item.expiryDate)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div
                    style={{
                        padding: '16px 20px',
                        background: 'var(--bg-main)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {renderFormattedText(item.content)}
                </div>

                {/* Attachment (if present) */}
                {item.attachmentFileName && (
                    <div
                        style={{
                            padding: '12px 16px',
                            background: 'var(--bg-card)',
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
                                    width: 34,
                                    height: 34,
                                    borderRadius: 6,
                                    background: 'var(--primary)',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {item.attachmentFileName.toLowerCase().endsWith('.pdf') ? <FileText size={18} /> : <ImageIcon size={18} />}
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {item.attachmentFileName}
                                </div>
                                {item.attachmentSizeBytes && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {formatFileSize(item.attachmentSizeBytes)}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            className="btn btn-sm"
                            onClick={handleDownloadAttachment}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                        >
                            <Download size={13} /> Download File
                        </button>
                    </div>
                )}

                {/* Acknowledgment Bar */}
                <div
                    style={{
                        padding: '14px 18px',
                        background: 'var(--bg-card)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            className={`btn ${item.isAcknowledged ? 'btn-success' : 'btn-primary'}`}
                            onClick={handleAcknowledge}
                            disabled={item.isAcknowledged || acknowledging}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, height: 36 }}
                        >
                            {acknowledging ? (
                                <Loader2 size={14} className="spin" />
                            ) : item.isAcknowledged ? (
                                <CheckCircle2 size={15} />
                            ) : (
                                <ThumbsUp size={15} />
                            )}
                            {item.isAcknowledged ? 'Acknowledged by You' : 'Acknowledge Announcement'}
                        </button>

                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Total Acknowledgments: <strong>{item.acknowledgmentCount}</strong>
                        </span>
                    </div>

                    {ackError && (
                        <div style={{ color: 'var(--status-failed)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertCircle size={13} /> {ackError}
                        </div>
                    )}
                </div>

                {/* Publisher Insights: List of who acknowledged */}
                {isPublisher && item.acknowledgments && item.acknowledgments.length > 0 && (
                    <details style={{ background: 'var(--bg-main)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <UserCheck size={15} style={{ color: 'var(--status-active)' }} />
                            Acknowledged by {item.acknowledgments.length} team member{item.acknowledgments.length !== 1 ? 's' : ''}
                        </summary>
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                            {item.acknowledgments.map((ack, idx) => (
                                <div
                                    key={ack.userId || idx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '6px 12px',
                                        background: 'var(--bg-card)',
                                        borderRadius: 6,
                                        border: '1px solid var(--border)',
                                        fontSize: 12,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ack.fullName}</span>
                                        {ack.role && <span className="badge badge-blue" style={{ fontSize: 10 }}>{ack.role}</span>}
                                    </div>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{fmtDateTime(ack.acknowledgedAt)}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                {/* Comments Section */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MessageSquare size={16} /> Comments & Feedback ({item.comments?.length || 0})
                        </h4>
                    </div>

                    {/* Chronological comment thread */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 250, overflowY: 'auto', paddingRight: 4 }}>
                        {(!item.comments || item.comments.length === 0) ? (
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                No comments yet. Be the first to leave feedback or ask a question.
                            </p>
                        ) : (
                            item.comments.map(c => (
                                <div
                                    key={c.id}
                                    style={{
                                        display: 'flex',
                                        gap: 10,
                                        padding: '10px 12px',
                                        background: 'var(--bg-main)',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        fontSize: 13,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 30,
                                            height: 30,
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
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
                                        <div style={{ lineHeight: 1.45, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                            {c.content}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Add Comment Form (Max 500 characters) */}
                    <form onSubmit={handleAddComment}>
                        {commentError && (
                            <div className="form-api-error" style={{ marginBottom: 8, fontSize: 12 }}>
                                <AlertCircle size={13} /> <span>{commentError}</span>
                            </div>
                        )}
                        <div className="field" style={{ margin: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <label style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
                                    Add a Comment / Question <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional, max 500 characters)</span>
                                </label>
                                <span style={{ fontSize: 11, color: commentContent.length > 450 ? 'var(--status-failed)' : 'var(--text-muted)' }}>
                                    {commentContent.length}/500
                                </span>
                            </div>
                            <textarea
                                value={commentContent}
                                onChange={e => setCommentContent(e.target.value)}
                                placeholder="Type your comment or question here..."
                                rows={2}
                                maxLength={500}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    fontSize: 13,
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    background: 'var(--bg-main)',
                                    color: 'var(--text-primary)',
                                    marginBottom: 8,
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    type="submit"
                                    className="btn btn-primary btn-sm"
                                    disabled={!commentContent.trim() || submittingComment}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    {submittingComment ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                                    Post Comment
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </FormModal>
    );
};

export default AnnouncementDetailModal;
