import React from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, ArrowLeft, Package, AlertCircle, UserX, Clock } from 'lucide-react';
import { getCentralLoginUrl } from '../../components/Auth/authRedirect';
import './account_locked.css';

function FeatureItem({ title, description }: { title: string; description: string }) {
    return (
        <div className="feature-item">
            <strong>{title}</strong>
            <span>{description}</span>
        </div>
    );
}

function getReasonMeta(reason: string): {
    icon: React.ReactNode;
    title: string;
    description: string;
    why: string;
    type: 'failed' | 'leave' | 'deactivated';
} {
    const r = reason.toLowerCase();

    if (r.includes('3 consecutive') || r.includes('failed login') || r.includes('attempts')) {
        return {
            icon: <Lock size={18} />,
            title: 'Too Many Failed Attempts',
            description: 'Your account has been locked due to 3 consecutive failed login attempts.',
            why: 'The system automatically locks accounts after 3 failed login attempts to prevent unauthorized access.',
            type: 'failed',
        };
    }

    if (r.includes('leave')) {
        return {
            icon: <Clock size={18} />,
            title: 'Account On Leave',
            description: 'Your account is currently on leave and cannot be accessed.',
            why: 'Access is restricted while your account is in leave status. Contact your administrator for emergency access.',
            type: 'leave',
        };
    }

    return {
        icon: <UserX size={18} />,
        title: 'Account Deactivated',
        description: 'Your account has been deactivated by a Manager.',
        why: 'An administrator has manually deactivated your account. Please contact them directly for reactivation.',
        type: 'deactivated',
    };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AccountLocked() {
    const navigate = useNavigate();
    const location = useLocation();
    const params = new URLSearchParams(location.search);

    const state = location.state as {
        employeeNumber?: string;
        employeeName?: string;
        reason?: string;
    } | null;

    const employeeNumber = state?.employeeNumber || params.get('employeeNumber') || '—';
    const employeeName = state?.employeeName || `Employee #${employeeNumber}`;
    const reason = state?.reason || '';
    const meta = getReasonMeta(reason);

    const initials = employeeName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <div className="locked-page">

            {/* LEFT PANEL */}
            <aside className="locked-left">
                <div className="locked-left-content">
                    <div className="login-brand">
                        <div className="brand-icon"><Package size={20} /></div>
                        <div>
                            <h1 className="brand-name">Speedex</h1>
                            <p className="brand-sub">COURIER & FORWARDER, INC.</p>
                        </div>
                    </div>
                    <div className="login-headline">
                        <h2>
                            Secure access,<br />
                            <span className="headline-accent">protected operations.</span>
                        </h2>
                        <p className="headline-body">
                            Your account security is our priority.
                            Multiple failed attempts trigger protection mechanisms.
                        </p>
                    </div>
                    <p className="brand-sub">HOW TO UNLOCK YOUR ACCOUNT?</p>
                    <div className="feature-list">
                        <FeatureItem title="STEP 1" description="Contact your Manager." />
                        <FeatureItem title="STEP 2" description="A Manager will verify your identity and reactivate your account." />
                        <FeatureItem title="STEP 3" description="You will receive a new system-generated password." />
                    </div>
                </div>
            </aside>

            {/* RIGHT PANEL */}
            <div className="locked-right">
                <div className="locked-card">
                    <div className="locked-header">
                        <div className="locked-icon-wrapper"><Lock size={32} /></div>
                        <span className="locked-label label" style={{ color: 'var(--status-failed)' }}>
                            ACCOUNT LOCKED
                        </span>
                        <h2 className="locked-title">Access Restricted</h2>
                        <p className="locked-text">{meta.description}</p>
                    </div>

                    <div className="locked-info-box">
                        <div className="locked-info-icon"><AlertCircle size={18} /></div>
                        <div>
                            <strong>{meta.title}</strong>
                            <p>{meta.why}</p>
                        </div>
                    </div>

                    <div className="locked-user-card">
                        <div className="locked-user-avatar">{initials}</div>
                        <div className="locked-user-info">
                            <strong>{employeeNumber}</strong>
                            <span>{employeeName !== 'Employee' ? employeeName : '—'}</span>
                        </div>
                        <span className="locked-user-badge">
                            {meta.icon}
                            {meta.title}
                        </span>
                    </div>

                    <button
                        type="button"
                        className="locked-back-link"
                        onClick={() => {
                            window.location.href = getCentralLoginUrl();
                        }}
                    >
                        <ArrowLeft size={16} />
                        Back to Login
                    </button>

                    <div className="locked-footer">
                        © 2026{' '}
                        <a href="#">Speedex Courier & Forwarder, Inc.</a>
                        {' '}· All rights reserved.
                    </div>
                </div>
            </div>

        </div>
    );
}