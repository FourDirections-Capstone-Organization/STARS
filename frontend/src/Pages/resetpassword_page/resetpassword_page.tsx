import React, { useState } from 'react';
import '../forgotpassword_page/forgotpassword_page.css';
import './resetpassword_page.css';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Package, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, XCircle } from 'lucide-react';
import api from '../../api';

/* ── Reusable Feature Item ── */
function FeatureItem({ title, description }: { title: string; description: string }) {
    return (
        <div className="feature-item">
            <strong>{title}</strong>
            <span>{description}</span>
        </div>
    );
}

/* ── OWASP password rules ── */
const PW_RULES = {
    minLength: 15,
    hasUppercase: /[A-Z]/,
    hasLowercase: /[a-z]/,
    hasNumber: /[0-9]/,
    hasSpecial: /[^A-Za-z0-9]/,
};

const getPwChecks = (pw: string) => ({
    length: pw.length >= PW_RULES.minLength,
    uppercase: PW_RULES.hasUppercase.test(pw),
    lowercase: PW_RULES.hasLowercase.test(pw),
    number: PW_RULES.hasNumber.test(pw),
    special: PW_RULES.hasSpecial.test(pw),
});

const isPasswordValid = (pw: string) => Object.values(getPwChecks(pw)).every(Boolean);

const getStrength = (pw: string): { level: 0 | 1 | 2 | 3; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' };
    const passed = Object.values(getPwChecks(pw)).filter(Boolean).length;
    if (passed <= 2) return { level: 1, label: 'Weak', color: 'var(--status-failed)' };
    if (passed <= 4) return { level: 2, label: 'Fair', color: 'var(--status-pending)' };
    return { level: 3, label: 'Strong', color: 'var(--status-active)' };
};

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = (searchParams.get('token') ?? '').trim();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    // Track which fields the user has left (blurred) at least once
    const [touchedNew, setTouchedNew] = useState(false);
    const [touchedConfirm, setTouchedConfirm] = useState(false);

    const tokenMissing = !token;
    const strength = getStrength(newPassword);
    const checks = getPwChecks(newPassword);

    // Per-field errors — only visible after the field has been touched
    const newPasswordError: string = (() => {
        if (!touchedNew) return '';
        if (!newPassword) return 'Please enter a new password.';
        if (!isPasswordValid(newPassword)) return 'Password does not meet all requirements below.';
        return '';
    })();

    const confirmPasswordError: string = (() => {
        if (!touchedConfirm) return '';
        if (!confirmPassword) return 'Please confirm your password.';
        if (newPassword !== confirmPassword) return 'Passwords do not match.';
        return '';
    })();

    const handleReset = async () => {
        // Force-touch both fields so all errors surface on submit
        setTouchedNew(true);
        setTouchedConfirm(true);

        if (!newPassword) {
            setStatus({ type: 'error', message: 'Please enter a new password.' });
            return;
        }
        if (!isPasswordValid(newPassword)) {
            setStatus({ type: 'error', message: 'Password does not meet the requirements below.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', message: 'Passwords do not match.' });
            return;
        }

        setLoading(true);
        setStatus(null);

        try {
            const res = await api.post<any>('/api/Auth/reset-password', { token, newPassword, confirmPassword });
            if (!res.data.isSuccess) {
                throw new Error(res.data.message || 'Failed to reset password. The link may have expired.');
            }

            setDone(true);
            setStatus(null);
            setTimeout(() => navigate('/'), 3000);
        } catch (err: any) {
            const msg = err?.response?.data?.message || err.message || 'Something went wrong. Please try again.';
            setStatus({ type: 'error', message: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="forgot-page">

            {/* LEFT PANEL */}
            <aside className="login-left">
                <div className="login-left-content">
                    <div className="login-brand">
                        <div className="brand-icon"><Package size={20} /></div>
                        <div>
                            <h1 className="brand-name">Speedex</h1>
                            <p className="brand-sub">COURIER & FORWARDER, INC.</p>
                        </div>
                    </div>
                    <div className="login-headline">
                        <h2>
                            Fast deliveries,<br />
                            <span className="headline-accent">smarter logistics.</span>
                        </h2>
                        <p className="headline-body">
                            Manage shipments, monitor deliveries, and access your dashboard.
                        </p>
                    </div>
                    <div className="feature-list">
                        <FeatureItem title="Real-Time Delivery Tracking" description="Live shipment visibility and updates" />
                        <FeatureItem title="STARS" description="Personalized and organized task workflow experience" />
                        <FeatureItem title="Courier Management" description="Secured and efficient management of courier operations" />
                    </div>
                </div>
            </aside>

            {/* RIGHT PANEL */}
            <div className="forgot-right">
                <div className="forgot-card">

                    {/* ── Invalid / missing token ── */}
                    {tokenMissing && (
                        <>
                            <div className="forgot-header">
                                <div className="forgot-icon-wrap danger"><XCircle size={22} /></div>
                                <h2 className="forgot-title">Invalid Reset Link</h2>
                                <p className="forgot-subtitle">
                                    This password reset link is invalid or has already been used.
                                    Please request a new one.
                                </p>
                            </div>
                            <Link to="/forgotpassword_page" className="submit-btn" style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none' }}>
                                Request New Link
                            </Link>
                            <div className="right-footer">
                                <Link className="login-link" to="/">← Back to Login</Link>
                            </div>
                        </>
                    )}

                    {/* ── Reset form ── */}
                    {!tokenMissing && !done && (
                        <>
                            <div className="forgot-header">
                                <div className="forgot-icon-wrap"><Lock size={22} /></div>
                                <h2 className="forgot-title">Reset Password</h2>
                                <p className="forgot-subtitle">
                                    Create a strong password that meets all the requirements below.
                                </p>
                            </div>

                            {/* Top-level API error */}
                            {status && (
                                <div className={`status-bar ${status.type}`}>
                                    <AlertCircle size={14} />
                                    {status.message}
                                </div>
                            )}

                            <form
                                className="forgot-form"
                                onSubmit={(e) => { e.preventDefault(); handleReset(); }}
                            >
                                {/* ── New Password ── */}
                                <div className="field-group">
                                    <label className="field-label">New Password</label>
                                    <div className="password-wrap">
                                        <input
                                            className={`forgot-input${newPasswordError ? ' input-error' : touchedNew && isPasswordValid(newPassword) ? ' input-success' : ''}`}
                                            type={showNew ? 'text' : 'password'}
                                            placeholder="At least 15 characters"
                                            value={newPassword}
                                            onChange={(e) => { setNewPassword(e.target.value); setStatus(null); }}
                                            onBlur={() => setTouchedNew(true)}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            className="pw-toggle"
                                            onClick={() => setShowNew(p => !p)}
                                            tabIndex={-1}
                                        >
                                            {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>

                                    {/* Per-field error */}
                                    {newPasswordError && (
                                        <span className="field-hint error">
                                            <AlertCircle size={11} /> {newPasswordError}
                                        </span>
                                    )}
                                    {/* Success hint */}
                                    {touchedNew && isPasswordValid(newPassword) && (
                                        <span className="field-hint success">✓ Password meets all requirements</span>
                                    )}

                                    {/* Strength meter — visible once user starts typing */}
                                    {newPassword.length > 0 && (
                                        <div className="strength-wrap">
                                            <div className="strength-bars">
                                                {[1, 2, 3].map(lvl => (
                                                    <div
                                                        key={lvl}
                                                        className="strength-bar"
                                                        style={{ background: strength.level >= lvl ? strength.color : 'var(--border)' }}
                                                    />
                                                ))}
                                            </div>
                                            <span className="strength-label" style={{ color: strength.color }}>
                                                {strength.label}
                                            </span>
                                        </div>
                                    )}

                                    {/* OWASP checklist — visible once user starts typing */}
                                    {newPassword.length > 0 && (
                                        <div className="pw-checklist">
                                            {([
                                                { key: 'length', label: 'At least 15 characters' },
                                                { key: 'uppercase', label: 'One uppercase letter (A–Z)' },
                                                { key: 'lowercase', label: 'One lowercase letter (a–z)' },
                                                { key: 'number', label: 'One number (0–9)' },
                                                { key: 'special', label: 'One special character (!@#$…)' },
                                            ] as const).map(({ key, label }) => (
                                                <div key={key} className={`pw-check-item${checks[key] ? ' pass' : ''}`}>
                                                    <span className="pw-check-icon">
                                                        {checks[key] ? '✓' : '○'}
                                                    </span>
                                                    {label}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── Confirm Password ── */}
                                <div className="field-group">
                                    <label className="field-label">Confirm New Password</label>
                                    <div className="password-wrap">
                                        <input
                                            className={`forgot-input${confirmPasswordError ? ' input-error' : touchedConfirm && confirmPassword && newPassword === confirmPassword ? ' input-success' : ''}`}
                                            type={showConfirm ? 'text' : 'password'}
                                            placeholder="Re-enter new password"
                                            value={confirmPassword}
                                            onChange={(e) => { setConfirmPassword(e.target.value); setStatus(null); }}
                                            onBlur={() => setTouchedConfirm(true)}
                                        />
                                        <button
                                            type="button"
                                            className="pw-toggle"
                                            onClick={() => setShowConfirm(p => !p)}
                                            tabIndex={-1}
                                        >
                                            {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>

                                    {/* Per-field error */}
                                    {confirmPasswordError && (
                                        <span className="field-hint error">
                                            <AlertCircle size={11} /> {confirmPasswordError}
                                        </span>
                                    )}
                                    {/* Success hint */}
                                    {touchedConfirm && confirmPassword && newPassword === confirmPassword && (
                                        <span className="field-hint success">✓ Passwords match</span>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    className={`submit-btn${loading ? ' loading' : ''}`}
                                    disabled={loading}
                                >
                                    {loading
                                        ? <><Loader2 size={15} className="spin" /> Resetting…</>
                                        : 'Reset Password'
                                    }
                                </button>
                            </form>

                            <div className="right-footer">
                                <Link className="login-link" to="/">← Back to Login</Link>
                            </div>
                        </>
                    )}

                    {/* ── Success state ── */}
                    {done && (
                        <>
                            <div className="forgot-header">
                                <div className="forgot-icon-wrap success"><CheckCircle size={22} /></div>
                                <h2 className="forgot-title">Password Reset!</h2>
                                <p className="forgot-subtitle">
                                    Your password has been updated successfully.
                                    You'll be redirected to the login page in a moment.
                                </p>
                            </div>
                            <div className="sent-notice success">
                                <CheckCircle size={13} />
                                <span>Redirecting you to login…</span>
                            </div>
                            <Link to="/" className="submit-btn" style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none' }}>
                                Go to Login
                            </Link>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}