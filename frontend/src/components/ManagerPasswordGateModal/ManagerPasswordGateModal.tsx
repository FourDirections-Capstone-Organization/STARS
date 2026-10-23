import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import api from '../../api';
import FormModal from '../FormModal/FormModal';

export interface ManagerPasswordGateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => Promise<void>;
    title?: string;
    subtitle?: string;
    confirmLabel?: string;
}

export const ManagerPasswordGateModal: React.FC<ManagerPasswordGateModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    title = 'Confirm Manager Password',
    subtitle = 'Enter your current password to authorize and safely apply these account and system changes.',
    confirmLabel = 'Verify & Save',
}) => {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleVerify = async () => {
        if (!password.trim()) {
            setError('Please enter your current account password.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const adminId = localStorage.getItem('employeeId') ?? '';
            const res = await api.post('/api/Auth/verify-password', {
                employeeID: adminId,
                password: password.trim(),
            });

            const data = res.data;
            if (!data.isSuccess) {
                throw new Error(data.message || data.Message || 'Incorrect password.');
            }

            // Successfully authenticated
            await onSuccess();
            setPassword('');
            setError('');
            onClose();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.response?.data?.Message || err.message || 'Incorrect password. Please try again.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <FormModal
            isOpen={isOpen}
            onClose={() => {
                if (loading) return;
                setPassword('');
                setError('');
                onClose();
            }}
            title={title}
            subtitle={subtitle}
            size="sm"
            footer={
                <>
                    <button
                        type="button"
                        className="fm-btn fm-btn-cancel"
                        onClick={() => {
                            setPassword('');
                            setError('');
                            onClose();
                        }}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="fm-btn fm-btn-primary"
                        onClick={handleVerify}
                        disabled={loading || !password.trim()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: loading || !password.trim() ? 0.6 : 1,
                            cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={13} className="fm-spin" /> Verifying…
                            </>
                        ) : (
                            <>
                                <ShieldCheck size={14} /> {confirmLabel}
                            </>
                        )}
                    </button>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                <div
                    style={{
                        padding: '10px 12px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <Lock size={16} style={{ color: 'var(--primary, #3b82f6)', flexShrink: 0 }} />
                    <span>For security and audit accountability, manager password verification is required.</span>
                </div>

                <div className="fm-field" style={{ position: 'relative' }}>
                    <label className="fm-label" htmlFor="manager-gate-password">
                        Current Account Password <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            id="manager-gate-password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => {
                                setPassword(e.target.value);
                                setError('');
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleVerify();
                                }
                            }}
                            placeholder="Enter your current password"
                            className="fm-input"
                            style={{
                                paddingRight: 40,
                                borderColor: error ? 'var(--status-failed, #ef4444)' : undefined,
                            }}
                            autoFocus
                            disabled={loading}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(p => !p)}
                            style={{
                                position: 'absolute',
                                right: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                padding: 4,
                            }}
                            tabIndex={-1}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {error && (
                        <span
                            className="field-error"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                color: 'var(--status-failed, #ef4444)',
                                fontSize: 11,
                                marginTop: 6,
                            }}
                        >
                            <AlertCircle size={12} /> {error}
                        </span>
                    )}
                </div>
            </div>
        </FormModal>
    );
};

export default ManagerPasswordGateModal;
