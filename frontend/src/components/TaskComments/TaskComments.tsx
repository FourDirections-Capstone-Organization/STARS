import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Send, X, Paperclip, Loader2, AlertCircle, CheckCircle2,
    Pencil, Trash2, FileText, Download,
} from 'lucide-react';
import { useToast } from '../Toast/Toast';
import EmptyState from '../ui/EmptyState';
import { ActionsDropdown } from '../ui/DataTable';
import api from '../../api';
import axios from 'axios';
import './TaskComments.css';

interface CommentAttachmentDTO {
    id: string;
    fileName: string;
    fileSize?: number;
    fileType?: string;
}

interface CommentDTO {
    taskCommentId: string;
    taskId: string;
    employeeId: string;
    accountId?: string;
    authorName: string;
    message: string;
    attachmentFileName?: string;
    attachments?: CommentAttachmentDTO[];
    createdAt: string;
    updatedAt?: string;
}

interface TaskCommentsProps {
    taskId: string;
    currentEmployeeId: string;
    taskReferenceNumber?: string;
}

const fmtDateTime = (d: string): string => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' · ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const getCurrentAccountId = (): string => {
    const token = localStorage.getItem('authToken');
    if (!token) return '';
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '')));
        return payload[
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'
        ] ?? payload.sub ?? payload.nameid ?? '';
    } catch { return ''; }
};

const TaskComments: React.FC<TaskCommentsProps> = ({
    taskId,
    currentEmployeeId: _propId,
    taskReferenceNumber,
}) => {
    const currentUserId = getCurrentAccountId();
    const currentEmployeeId = currentUserId || _propId;
    const [comments, setComments] = useState<CommentDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const { success } = useToast();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editMessage, setEditMessage] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const threadRef = useRef<HTMLDivElement>(null);

    const fetchComments = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get<any>(`/api/tasks/${taskId}/comments`);
            const json = res.data;
            const list: any[] = json.isSuccess && Array.isArray(json.data?.items) ? json.data.items : (json.isSuccess && Array.isArray(json.data) ? json.data : []);
            setComments(list.map((c: any) => ({
                taskCommentId: c.id ?? c.taskCommentId,
                taskId: c.taskId ?? taskId,
                employeeId: c.authorId ?? c.employeeId ?? '',
                accountId: c.authorId ?? c.accountId ?? '',
                authorName: c.authorName ?? '',
                message: c.content ?? c.message ?? '',
                attachmentFileName: c.attachmentFileName ?? '',
                attachments: Array.isArray(c.attachments)
                    ? c.attachments.map((a: any) => ({
                        // Zero-GUID marks a legacy single-file comment with no
                        // attachment record; route its download via the legacy endpoint.
                        id: (a.id && a.id !== '00000000-0000-0000-0000-000000000000') ? a.id : '',
                        fileName: a.fileName ?? '',
                        fileSize: a.fileSize,
                        fileType: a.fileType,
                    }))
                    : (c.attachmentFileName ? [{ id: '', fileName: c.attachmentFileName }] : []),
                createdAt: c.createdAt ?? '',
                updatedAt: c.updatedAt ?? undefined,
            })));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load comments.');
            setComments([]);
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => { fetchComments(); }, [fetchComments]);

    useEffect(() => {
        const el = threadRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [comments]);

    const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (e.target.value) e.target.value = '';
        if (files.length === 0) return;
        for (const file of files) {
            if (file.size > 20 * 1024 * 1024) { setError('Attachment exceeds maximum size of 20MB.'); return; }
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (!['pdf', 'docx', 'xlsx', 'jpg', 'png', 'jpeg'].includes(ext ?? '')) {
                setError('Allowed file types: PDF, DOCX, XLSX, JPG, PNG.');
                return;
            }
        }
        setAttachments(files);
        setError('');
    };

    const handleDownloadAttachment = async (commentId: string, attachmentId: string, fileName: string) => {
        const token = localStorage.getItem('authToken');
        try {
            // Multi-file comments use the per-attachment endpoint; legacy
            // single-file comments (no attachment id) use the comment-level endpoint.
            const url = attachmentId
                ? `/api/tasks/${taskId}/comments/${commentId}/attachments/${attachmentId}/download`
                : `/api/tasks/${taskId}/comments/${commentId}/attachment/download`;
            const res = await axios.get(url, {
                responseType: 'blob',
                headers: { Authorization: `Bearer ${token}` },
            });
            const blob = res.data;
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        } catch {
            setError('Unable to download attachment. The file may no longer be available.');
        }
    };

    const handleSend = async () => {
        // A comment can be sent with only an attachment (no typed message).
        if (!newMessage.trim() && attachments.length === 0) { setError('Comment content is required.'); return; }
        setError('');
        setSending(true);
        try {
            const fd = new FormData();
            fd.append('content', newMessage.trim());
            attachments.forEach(file => fd.append('attachments', file));
            await api.upload(`/api/tasks/${taskId}/comments`, fd);
            setNewMessage('');
            setAttachments([]);
            success('Comment added successfully.');
            await fetchComments();
        } catch (err: any) {
            setError(err.response?.data?.message || err.response?.data?.Message || err.message || 'Failed to send comment.');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const startEdit = (c: CommentDTO) => {
        setEditingId(c.taskCommentId);
        setEditMessage(c.message);
        setError('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditMessage('');
        setError('');
    };

    const saveEdit = async () => {
        if (!editMessage.trim()) { setError('Comment content is required.'); return; }
        setError('');
        setSavingEdit(true);
        try {
            await api.put(`/api/tasks/${taskId}/comments/${editingId}`, { content: editMessage.trim() });
            cancelEdit();
            success('Comment updated successfully.');
            await fetchComments();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSavingEdit(false);
        }
    };

    const deleteComment = async (commentId: string) => {
        if (!window.confirm('Are you sure you want to delete this comment?')) return;
        try {
            await api.delete(`/api/tasks/${taskId}/comments/${commentId}`);
            success('Comment deleted successfully.');
            await fetchComments();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const isOwnComment = (c: CommentDTO) =>
        c.accountId === currentUserId || c.accountId?.toUpperCase() === currentUserId.toUpperCase();

    return (
        <div className="tc-container">
            <div className="tc-header">
                <span className="tc-title">Comments</span>
                <span className="tc-count">{comments.length}</span>
            </div>

            {error && (
                <div className="tc-error"><AlertCircle size={14} /> {error}</div>
            )}

            <div className="tc-thread" ref={threadRef}>
                {loading ? (
                    <div className="tc-loading"><Loader2 size={18} className="tc-spin" /> Loading comments...</div>
                ) : comments.length === 0 ? (
                    <EmptyState icon={<FileText size={22} strokeWidth={1.5} />} title="No comments yet." description="Start the conversation below." />
                ) : comments.map(c => {
                    const isMe = isOwnComment(c);
                    const isEditing = editingId === c.taskCommentId;
                    return (
                        <div key={c.taskCommentId} className={`tc-msg${isMe ? ' tc-msg-mine' : ' tc-msg-theirs'}`}>
                            {!isMe && <div className="tc-avatar">{c.authorName.charAt(0).toUpperCase()}</div>}
                            <div className="tc-body">
                                {!isMe && <span className="tc-author">{c.authorName}</span>}
                                {isEditing ? (
                                    <div className="tc-edit-box">
                                        <textarea
                                            className="tc-edit-textarea"
                                            value={editMessage}
                                            maxLength={1000}
                                            onChange={e => setEditMessage(e.target.value)}
                                            autoFocus
                                        />
                                        <div className="tc-edit-actions">
                                            <span className="tc-char-count">{editMessage.length}/1000</span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="tc-btn tc-btn-sm" onClick={cancelEdit} disabled={savingEdit}>
                                                    Cancel
                                                </button>
                                                <button className="tc-btn tc-btn-primary tc-btn-sm" onClick={saveEdit} disabled={savingEdit || !editMessage.trim()}>
                                                    {savingEdit ? <><Loader2 size={12} className="tc-spin" /> Saving...</> : 'Save'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`tc-bubble${isMe ? ' tc-bubble-mine' : ' tc-bubble-theirs'}`}>
                                            {c.message}
                                        </div>
                                        {(c.attachments && c.attachments.length > 0) && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                                                {c.attachments.map(a => (
                                                    <button
                                                        key={a.id || a.fileName}
                                                        className="tc-attachment-link"
                                                        onClick={() => handleDownloadAttachment(c.taskCommentId, a.id, a.fileName)}
                                                        title="Download attachment"
                                                    >
                                                        <Paperclip size={12} /> {a.fileName}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="tc-meta">
                                            <span className="tc-time">{fmtDateTime(c.createdAt)}</span>
                                            {c.updatedAt && <span className="tc-edited">(edited)</span>}
                                            {isMe && (
                                                <div className="tc-actions">
                                                    <ActionsDropdown
                                                        triggerTitle="Comment actions"
                                                        actions={[
                                                            { label: 'Edit Comment', icon: <Pencil size={13} />, onClick: () => startEdit(c) },
                                                            { label: 'Delete Comment', icon: <Trash2 size={13} />, onClick: () => deleteComment(c.taskCommentId), variant: 'danger' }
                                                        ]}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            {isMe && !isEditing && (
                                <div className="tc-avatar tc-avatar-self">{c.authorName.charAt(0).toUpperCase()}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="tc-input-area">
                {taskReferenceNumber && (
                    <div className="tc-task-ref" style={{ padding: '8px 12px', marginBottom: 8, background: '#f8f9fa', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>Task ID:</span>
                        <span style={{ fontFamily: 'monospace', color: '#1e293b' }}>{taskReferenceNumber}</span>
                    </div>
                )}
                <div className="tc-input-row">
                    <div className="tc-self-avatar">
                        {localStorage.getItem('employeeName')?.charAt(0)?.toUpperCase() ?? 'U'}
                    </div>
                    <div className="tc-input-box">
                        <textarea
                            className="tc-textarea"
                            placeholder="Write a comment… (Enter to send)"
                            value={newMessage}
                            maxLength={1000}
                            onChange={e => { setNewMessage(e.target.value); setError(''); }}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            disabled={sending}
                        />
                        <div className="tc-input-actions">
                            <label className="tc-attach-btn" title="Attach one or more files (PDF, DOCX, XLSX, JPG, PNG, max 20MB each)">
                                <Paperclip size={14} />
                                <input type="file" hidden multiple accept=".pdf,.docx,.xlsx,.jpg,.png,.jpeg" onChange={handleAttachmentChange} />
                            </label>
                            <span className="tc-char-count">{newMessage.length}/1000</span>
                            <button className="tc-send-btn" onClick={handleSend}
                                disabled={(!newMessage.trim() && attachments.length === 0) || sending} aria-label="Send">
                                {sending ? <Loader2 size={14} className="tc-spin" /> : <Send size={14} />}
                            </button>
                        </div>
                    </div>
                </div>
                {attachments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                        {attachments.map((file, idx) => (
                            <div className="tc-attach-preview" key={`${file.name}-${idx}`}>
                                <Paperclip size={12} />
                                <span>{file.name}</span>
                                <button
                                    className="tc-attach-remove"
                                    onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                                    aria-label={`Remove ${file.name}`}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {attachments.length} file{attachments.length === 1 ? '' : 's'} selected
                        </span>
                    </div>
                )}
                <p className="tc-hint">Shift + Enter for new line</p>
            </div>
        </div>
    );
};

export default TaskComments;