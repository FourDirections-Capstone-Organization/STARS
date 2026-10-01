import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getStoredRedirectUri, redirectToExternalPortal } from '../../components/Auth/authRedirect';

export default function SetPasswordPage() {
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCur, setShowCur] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const passwordRules = [
        { test: (p: string) => p.length >= 15, label: 'At least 15 characters' },
        { test: (p: string) => /[A-Z]/.test(p), label: 'At least one uppercase letter' },
        { test: (p: string) => /[a-z]/.test(p), label: 'At least one lowercase letter' },
        { test: (p: string) => /[0-9]/.test(p), label: 'At least one number' },
        { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'At least one special character' },
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('Please fill in all fields.');
            return;
        }

        const failed = passwordRules.filter(r => !r.test(newPassword));
        if (failed.length > 0) {
            setError(`Password must include: ${failed.map(r => r.label).join(', ')}.`);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await axios.post('/api/Auth/change-password',
                { currentPassword, newPassword, confirmPassword },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const d = res.data;
            if (!d.isSuccess) throw new Error(d.message || 'Failed to set password.');
            localStorage.setItem('isPasswordChanged', 'true');
            const employeeId = localStorage.getItem('employeeId');
            const role = localStorage.getItem('userRole');
            const hasTerms = localStorage.getItem('hasAcceptedTerms') === 'true';
            const termsVer = localStorage.getItem('termsVersionAccepted');
            if (employeeId === '0000' && role === 'Manager') {
                if (!hasTerms || termsVer !== 'v1.0') {
                    navigate('/terms-and-conditions', { replace: true });
                } else {
                    const storedRedirect = getStoredRedirectUri();
                    if (storedRedirect) {
                        const token = localStorage.getItem('authToken') || '';
                        const refreshToken = localStorage.getItem('refreshToken') || '';
                        const employeeName = localStorage.getItem('employeeName') || '';
                        redirectToExternalPortal(storedRedirect, {
                            token,
                            refreshToken,
                            role: role || '',
                            employeeId: employeeId || '',
                            employeeName,
                        });
                        return;
                    }
                    navigate('/SystemAdmin_Dashboard', { replace: true });
                }
            } else {
                navigate('/onboarding?fresh=true', { replace: true });
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.data) {
                const d = err.response.data as { message?: string };
                const isDown = err.response.status >= 502;
                setError(isDown ? 'System not available at the moment. Please try again later.' : (d.message || 'Failed to set password.'));
            } else {
                setError('System not available at the moment. Please try again later.');
            }
        } finally {
            setLoading(false);
        }
    };

    const strength = passwordRules.filter(r => r.test(newPassword)).length;

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f4f7fe', fontFamily: "'Montserrat', 'Inter', sans-serif", padding: 24
        }}>
            <div style={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 24, padding: '40px 36px',
                boxShadow: '0 8px 40px rgba(15,23,42,0.08)', width: '100%', maxWidth: 460
            }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: 14, background: '#f8fafc',
                        border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 16px'
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4318ff" strokeWidth="2" strokeLinecap="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                        Set Your Password
                    </h2>
                    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                        Create a strong password for your account.
                    </p>
                </div>

                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: '#fef2f2', border: '1px solid #fecaca',
                        borderRadius: 10, padding: '12px 16px', marginBottom: 20,
                        fontSize: 13, color: '#dc2626', fontWeight: 500
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                            Current Password <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showCur ? 'text' : 'password'}
                                placeholder="Enter your current password"
                                value={currentPassword}
                                onChange={e => { setCurrentPassword(e.target.value); setError(''); }}
                                style={{
                                    height: 42, borderRadius: 10, border: '1px solid #e2e8f0',
                                    padding: '0 40px 0 14px', fontSize: 13, color: '#0f172a',
                                    background: 'white', outline: 'none', width: '100%',
                                    boxSizing: 'border-box', fontFamily: 'inherit'
                                }}
                            />
                            <button type="button" onClick={() => setShowCur(v => !v)} style={{
                                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4
                            }}>
                                {showCur ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                            New Password <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showNew ? 'text' : 'password'}
                                placeholder="At least 15 characters"
                                value={newPassword}
                                onChange={e => { setNewPassword(e.target.value); setError(''); }}
                                style={{
                                    height: 42, borderRadius: 10, border: '1px solid #e2e8f0',
                                    padding: '0 40px 0 14px', fontSize: 13, color: '#0f172a',
                                    background: 'white', outline: 'none', width: '100%',
                                    boxSizing: 'border-box', fontFamily: 'inherit'
                                }}
                            />
                            <button type="button" onClick={() => setShowNew(v => !v)} style={{
                                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4
                            }}>
                                {showNew ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        {newPassword && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {passwordRules.map((rule, i) => (
                                    <span key={i} style={{
                                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                                        background: rule.test(newPassword) ? 'rgba(1,181,116,0.1)' : 'rgba(227,26,26,0.08)',
                                        color: rule.test(newPassword) ? '#01B574' : '#E31A1A'
                                    }}>
                                        {rule.test(newPassword) ? '✓' : '○'} {rule.label}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 2, transition: 'all 0.2s',
                                width: `${(strength / passwordRules.length) * 100}%`,
                                background: strength <= 2 ? '#ef4444' : strength <= 3 ? '#f59e0b' : '#01B574'
                            }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                            Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                placeholder="Re-enter your password"
                                value={confirmPassword}
                                onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                                style={{
                                    height: 42, borderRadius: 10, border: '1px solid #e2e8f0',
                                    padding: '0 40px 0 14px', fontSize: 13, color: '#0f172a',
                                    background: 'white', outline: 'none', width: '100%',
                                    boxSizing: 'border-box', fontFamily: 'inherit'
                                }}
                            />
                            <button type="button" onClick={() => setShowConfirm(v => !v)} style={{
                                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4
                            }}>
                                {showConfirm ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        {confirmPassword && newPassword !== confirmPassword && (
                            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500 }}>Passwords do not match.</span>
                        )}
                    </div>

                    <button type="submit" disabled={loading} style={{
                        width: '100%', marginTop: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        background: loading ? '#a5b4fc' : '#4318ff', color: 'white', fontWeight: 700, fontSize: 15,
                        border: 'none', borderRadius: 12, padding: '15px 20px', cursor: loading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 20px rgba(67,24,255,0.2)', fontFamily: 'inherit'
                    }}>
                        {loading ? 'Setting password\u2026' : 'Set Password & Continue \u2192'}
                    </button>
                </form>
            </div>
        </div>
    );
}
