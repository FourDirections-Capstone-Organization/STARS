import React, { useState } from 'react';
import './forgotpassword_page.css';
import { Link } from 'react-router-dom';
import { Package, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
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

export default function ForgotPassword() {
    const [employeeNumber, setEmployeeNumber] = useState('');
    const [email, setEmail] = useState('');
    const [step, setStep] = useState<'email' | 'sent'>('email');
    const [status, setStatus] = useState<{ type: 'info' | 'error' | 'success'; message: string } | null>(null);
    const [loading, setLoading] = useState(false);

    /* ── Email validation ── */
    const isValidEmail = (value: string) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const handleSendResetLink = async () => {
        if (!employeeNumber.trim()) {
            setStatus({ type: 'error', message: 'Please enter your Employee ID / Number.' });
            return;
        }
        if (!email.trim()) {
            setStatus({ type: 'error', message: 'Please enter your registered email address.' });
            return;
        }
        if (!isValidEmail(email.trim())) {
            setStatus({ type: 'error', message: 'Please enter a valid email address.' });
            return;
        }

        setLoading(true);
        setStatus({ type: 'info', message: 'Verifying employee credentials and sending reset link...' });

        try {
            const res = await api.post('/api/Auth/forgot-password', {
                employeeNumber: employeeNumber.trim(),
                email: email.trim(),
            });

            if (res.data?.isSuccess) {
                setStep('sent');
                setStatus(null);
            } else {
                setStatus({ type: 'error', message: res.data?.message || 'Failed to send reset link.' });
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err.message || 'Something went wrong. Please check your credentials.';
            setStatus({ type: 'error', message: msg });
        } finally {
            setLoading(false);
        }
    };

    const handleResend = () => {
        setStep('email');
        setStatus(null);
    };

    return (
        <div className="forgot-page">

            {/* LEFT PANEL */}
            <aside className="login-left">
                <div className="login-left-content">

                    <div className="login-brand">
                        <div className="brand-icon">
                            <Package size={20} />
                        </div>
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
                        <FeatureItem
                            title="Real-Time Delivery Tracking"
                            description="Live shipment visibility and updates"
                        />
                        <FeatureItem
                            title="STARS"
                            description="Personalized and organized task workflow experience"
                        />
                        <FeatureItem
                            title="Courier Management"
                            description="Secured and efficient management of courier operations"
                        />
                    </div>

                </div>
            </aside>

            {/* RIGHT PANEL */}
            <div className="forgot-right">
                <div className="forgot-card">

                    {/* ── STEP: Employee Number & Email entry ── */}
                    {step === 'email' && (
                        <>
                            <div className="forgot-header">
                                <div className="forgot-icon-wrap">
                                    <Mail size={22} />
                                </div>
                                <h2 className="forgot-title">Forgot Password</h2>
                                <p className="forgot-subtitle">
                                    Enter your Employee ID and registered email address to verify your identity and receive a secure password reset link.
                                </p>
                            </div>

                            {status && (
                                <div className={`status-bar ${status.type}`}>
                                    {status.type === 'error' && <AlertCircle size={14} />}
                                    {status.message}
                                </div>
                            )}

                            <form
                                className="forgot-form"
                                onSubmit={(e) => { e.preventDefault(); handleSendResetLink(); }}
                            >
                                <div className="field-group">
                                    <label className="field-label">Employee ID / Number</label>
                                    <input
                                        className={`forgot-input${status?.type === 'error' && !employeeNumber ? ' input-error' : ''}`}
                                        type="text"
                                        placeholder="e.g. 0001 or MGR001"
                                        value={employeeNumber}
                                        onChange={(e) => { setEmployeeNumber(e.target.value); setStatus(null); }}
                                        autoFocus
                                    />
                                </div>

                                <div className="field-group">
                                    <label className="field-label">Registered Email Address</label>
                                    <input
                                        className={`forgot-input${status?.type === 'error' && !email ? ' input-error' : ''}`}
                                        type="email"
                                        placeholder="e.g. employee@speedex.com"
                                        value={email}
                                        onChange={(e) => { setEmail(e.target.value); setStatus(null); }}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className={`submit-btn${loading ? ' loading' : ''}`}
                                    disabled={loading}
                                >
                                    {loading
                                        ? <><Loader2 size={15} className="spin" /> Verifying & Sending…</>
                                        : 'Send Reset Link'
                                    }
                                </button>
                            </form>

                            <div className="right-footer">
                                Remembered your password?{' '}
                                <Link className="login-link" to="/">Login here</Link>
                            </div>
                        </>
                    )}

                    {/* ── STEP: Email sent confirmation ── */}
                    {step === 'sent' && (
                        <>
                            <div className="forgot-header">
                                <div className="forgot-icon-wrap success">
                                    <CheckCircle size={22} />
                                </div>
                                <h2 className="forgot-title">Check Your Email</h2>
                                <p className="forgot-subtitle">
                                    We've verified Employee ID <strong>{employeeNumber}</strong> and sent a password reset link to:
                                </p>
                                <p className="sent-email">{email}</p>
                                <p className="forgot-subtitle" style={{ marginTop: 8 }}>
                                    Click the link in the email to reset your password.
                                    The link will expire in 1 hour for your security.
                                </p>
                            </div>

                            <div className="sent-notice">
                                <AlertCircle size={13} />
                                <span>Didn't receive it? Check your spam folder or request a new link.</span>
                            </div>

                            <button className="submit-btn outline" onClick={handleResend}>
                                Request Another Link
                            </button>

                            <div className="right-footer">
                                <Link className="login-link" to="/">← Back to Login</Link>
                            </div>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}