import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, User, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '../../components/Toast/Toast';
import api from '../../api';
import './login.css';

/* ── Types ── */
type StatusType = 'success' | 'error' | 'info' | '';

type UserRole =
    | 'Manager'
    | 'Coordinator'
    | 'Dispatcher'
    | 'Encoder'
    | 'Courier'
    | 'Accountant';

interface LoginResponse {
    accessToken: string;
    role: UserRole;
    employeeName: string;
    employeeNumber: string;
    message?: string;
    isPasswordChanged: boolean;
}

/* ── Role helpers ── */
const normalizeRole = (role: string): UserRole | '' => {
    const map: Record<string, UserRole> = {
        manager: 'Manager',
        coordinator: 'Coordinator',
        dispatcher: 'Dispatcher',
        encoder: 'Encoder',
        courier: 'Courier',
        accountant: 'Accountant',
    };
    return map[role.toLowerCase()] ?? '';
};

const dashboardRoutes: Record<UserRole, string> = {
    Manager: '/SystemAdmin_Dashboard',
    Coordinator: '/OpAdmin_Dashboard',
    Dispatcher: '/OpEmployee_Dashboard',
    Encoder: '/OpEmployee_Dashboard',
    Courier: '/OpEmployee_Dashboard',
    Accountant: '/OpEmployee_Dashboard',
};

/* ══════════════════════════════════════════
   LOGIN PAGE
══════════════════════════════════════════ */
export default function Login() {
    const navigate = useNavigate();
    const { success } = useToast();

    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [statusType, setStatusType] = useState<StatusType>('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [employeeIdError, setEmployeeIdError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [pendingVerification, setPendingVerification] = useState(false);
    const [resending, setResending] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        ['authToken', 'refreshToken', 'employeeId', 'employeeName',
            'firstName', 'middleName', 'lastName', 'suffix',
            'contactNumber', 'email', 'role', 'isPasswordChanged', 'userRole']
            .forEach(k => localStorage.removeItem(k));

        const params = new URLSearchParams(window.location.search);
        if (params.get('reason') === 'inactivity') {
            updateStatus('You were logged out due to 15 minutes of inactivity.', 'info');
        }
    }, []);

    const updateStatus = (message: string, type: StatusType) => {
        setStatusMessage(message);
        setStatusType(type);
    };

    const validateEmployeeId = (value: string): string => {
        if (!value.trim()) return 'Employee ID or Email is required.';
        if (value.trim().length > 254) return 'Input too long.';
        return '';
    };

    const validatePassword = (value: string): string => {
        if (!value) return 'Password is required.';
        return '';
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const idErr = validateEmployeeId(employeeId);
        const pwErr = validatePassword(password);
        setEmployeeIdError(idErr);
        setPasswordError(pwErr);
        if (idErr || pwErr) return;

        setPendingVerification(false);
        setResending(false);
        setIsLoading(true);
        updateStatus('Authenticating...', 'info');

        try {
            const response = await api.post<any>('/api/Auth/login', {
                identifier: employeeId.trim(),
                password,
            });

            const data = response.data;

            if (!data.isSuccess) {
                const msg = data.message ?? data.Message ?? 'Login failed.';
                const msgLower = msg.toLowerCase();

                if (msgLower.includes('on leave') || msgLower.includes('onleave')) {
                    navigate('/account_locked', {
                        state: {
                            employeeNumber: employeeId.trim(),
                            employeeName: data.employeeName ?? data.EmployeeName ?? `Employee #${employeeId.trim()}`,
                            reason: msg,
                            overrideToken: data.overrideToken,
                            leaveId: data.leaveId,
                        }
                    });
                    return;
                }

                if (msgLower.includes('deactivated') || msgLower.includes('locked')) {
                    navigate('/account_locked', {
                        state: {
                            employeeNumber: employeeId.trim(),
                            employeeName: data.employeeName ?? data.EmployeeName ?? `Employee #${employeeId.trim()}`,
                            reason: msg,
                        }
                    });
                    return;
                }

                if (msgLower.includes('verified') || msgLower.includes('unverified') || msgLower.includes('verification') || msgLower.includes('verify your email') || msgLower.includes('email not verified')) {
                    updateStatus('Your account is not yet verified. Please check your email for the verification link, or request a new one below.', 'error');
                    setPendingVerification(true);
                    return;
                }

                updateStatus(msg || 'Invalid Employee ID or password.', 'error');
                return;
            }

            // Unwrap ApiResponseDTO wrapper
            const d = data.data ?? data;

            const roleMap: Record<number, string> = { 0: 'Manager', 1: 'Coordinator', 2: 'Dispatcher', 3: 'Encoder', 4: 'Courier', 5: 'Accountant' };
            const roleStr = roleMap[d.role] ?? d.role?.toString?.() ?? '';
            const normalizedRole = normalizeRole(roleStr);

            if (!normalizedRole) {
                updateStatus(`Unknown role: "${roleStr}". Contact your administrator.`, 'error');
                return;
            }

            localStorage.setItem('authToken', d.accessToken);
            if (d.refreshToken) {
                localStorage.setItem('refreshToken', d.refreshToken);
            }
            localStorage.setItem('userRole', normalizedRole);
            localStorage.setItem('employeeId', d.employeeNumber ?? employeeId.trim());
            localStorage.setItem('isPasswordChanged', (d.isPasswordChanged ?? false).toString());
            localStorage.setItem('email', d.email ?? '');

            // Fetch full profile to populate localStorage
            try {
                const meRes = await api.get<any>('/api/Auth/me');
                const me = meRes.data?.data ?? meRes.data;
                if (me) {
                    localStorage.setItem('contactNumber', me.contactNumber ?? '');
                    localStorage.setItem('firstName', me.firstName ?? '');
                    localStorage.setItem('middleName', me.middleName ?? '');
                    localStorage.setItem('lastName', me.lastName ?? '');
                    localStorage.setItem('suffix', me.suffix ?? '');
                    const fullName = [me.firstName, me.middleName, me.lastName, me.suffix]
                        .filter(Boolean).join(' ');
                    localStorage.setItem('employeeName', fullName || d.fullName || me.fullName || d.employeeName || '');
                }
            } catch {
                // Fallback: use login response values
                localStorage.setItem('employeeName', d.fullName || d.employeeName || '');
            }

            updateStatus('Login successful. Redirecting...', 'success');
            success('Login successful! Welcome back.');

            if (!d.isPasswordChanged) {
                const isSeededSysAdmin = employeeId.trim() === '0000';
                if (isSeededSysAdmin) {
                    navigate('/set-password', { replace: true });
                } else {
                    navigate('/onboarding?fresh=true', { replace: true });
                }
                return;
            }

            const target = dashboardRoutes[normalizedRole];
            if (target) {
                navigate(target, { replace: true });
            }

        } catch {
            updateStatus('System not available at the moment. Please try again later.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendVerification = async () => {
        setResending(true);
        try {
            await api.post('/api/email-verification/resend', { employeeID: employeeId.trim() });
            updateStatus('A new verification link has been sent to your email.', 'success');
        } catch (err: any) {
            const msg = err?.response?.data?.message || err.message || 'Failed to resend verification email.';
            updateStatus(msg, 'error');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className={`login-page${mounted ? ' mounted' : ''}`}>

            {/* ── LEFT PANEL ── */}
            <aside className="login-left">
                <div className="login-left-content">

                    {/* Brand */}
                    <div className="login-brand">
                        <div className="brand-icon">
                            <Package size={22} />
                        </div>
                        <div>
                            <h1 className="brand-name">Speedex</h1>
                            <p className="brand-sub">COURIER & FORWARDER, INC.</p>
                        </div>
                    </div>

                    {/* Headline */}
                    <div className="login-headline">
                        <h2>
                            Fast deliveries,<br />
                            <span className="headline-accent">smarter logistics.</span>
                        </h2>
                        <p className="headline-body">
                            Manage shipments, monitor deliveries, and access your
                            operational dashboard — all in one place.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="feature-list">
                        <FeatureItem
                            title="Real-Time Delivery Management System"
                            description="Live shipment visibility and updates"
                        />
                        <FeatureItem
                            title="SPEEDEX Automated Tracking System"
                            description="Personalized and organized task workflow experience"
                        />
                        <FeatureItem
                            title="Financial Management System"
                            description="Track and manage financial transactions"
                        />
                    </div>
                </div>
            </aside>

            {/* ── RIGHT PANEL ── */}
            <main className="login-right">
                <div className="login-card">

                    {/* Card header */}
                    <div className="card-header">
                        <span className="header-badge">LOGIN PORTAL</span>
                        <h1 className="card-title">Welcome!</h1>
                        <p className="card-subtitle">
                            Sign in to continue to your workspace.
                        </p>
                    </div>

                    {/* Status message */}
                    {statusMessage && (
                        <div className={`status-bar ${statusType}`} role="alert">
                            <StatusIcon type={statusType} />
                            {statusMessage}
                        </div>
                    )}
                    {pendingVerification && (
                        <button
                            type="button"
                            className="resend-btn"
                            onClick={handleResendVerification}
                            disabled={resending}
                            style={{
                                display: 'block', margin: '8px auto 0', padding: '8px 20px',
                                fontSize: 13, fontWeight: 600, borderRadius: 8,
                                border: '1px solid var(--primary)', background: 'transparent',
                                color: 'var(--primary)', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            {resending ? <Loader2 size={14} className="spin" style={{ marginRight: 6 }} /> : null}
                            {resending ? 'Sending...' : 'Resend Verification Email'}
                        </button>
                    )}

                    {/* Form */}
                    <form className="login-form" onSubmit={handleSubmit} noValidate>

                        {/* Employee ID */}
                        <div className="field-group">
                            <label htmlFor="employeeId" className="field-label">
                                Employee ID <span style={{ color: 'var(--status-failed, #E31A1A)' }}>*</span>
                            </label>
                            <div className={`field-wrapper${employeeIdError ? ' field-error' : employeeId && !employeeIdError ? ' field-success' : ''}`}>
                                <span className="field-icon">
                                    <User size={16} />
                                </span>
                                <input
                                    id="employeeId"
                                    type="text"
                                    className="field-input"
                                    placeholder="e.g. 0001"
                                    value={employeeId}
                                    onChange={(e) => {
                                        setEmployeeId(e.target.value);
                                        setEmployeeIdError(validateEmployeeId(e.target.value));
                                    }}
                                    disabled={isLoading}
                                    autoComplete="username"
                                    autoFocus
                                    maxLength={254}
                                    required
                                />
                            </div>
                            {employeeIdError && (
                                <span className="field-err-msg">{employeeIdError}</span>
                            )}
                        </div>

                        {/* Password */}
                        <div className="field-group">
                            <label htmlFor="password" className="field-label">
                                Password <span style={{ color: 'var(--status-failed, #E31A1A)' }}>*</span>
                            </label>
                            <div className={`field-wrapper${passwordError ? ' field-error' : password && !passwordError ? ' field-success' : ''}`}>
                                <span className="field-icon">
                                    <Lock size={16} />
                                </span>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="field-input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setPasswordError(validatePassword(e.target.value));
                                    }}
                                    disabled={isLoading}
                                    autoComplete="current-password"
                                    maxLength={100}
                                    required
                                />
                                <button
                                    type="button"
                                    className="toggle-pw"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {passwordError && (
                                <span className="field-err-msg">{passwordError}</span>
                            )}
                        </div>

                        {/* Remember me / Forgot password */}
                        <div className="form-options">
                            <label className="remember-label">
                                <input type="checkbox" />
                                Remember me
                            </label>
                            <Link to="/forgotpassword_page" className="forgot-link">
                                Forgot password?
                            </Link>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            className={`submit-btn${isLoading ? ' loading' : ''}`}
                            disabled={isLoading}
                        >
                            {isLoading
                                ? <Loader2 size={18} className="spin" />
                                : 'LOGIN'
                            }
                        </button>

                    </form>

                    {/* ── Applicant portal divider ── */}
                    <div className="login-terms">
                        By using this service, you understand and agree to the PUP Online Services{' '}
                        <a href="#" className="terms-link">Terms of Use</a> and{' '}
                        <a href="#" className="terms-link">Privacy Statement</a>.
                    </div>

                    <p className="right-footer">
                        © 2026 Speedex Courier &amp; Forwarder, Inc. All rights reserved.
                    </p>
                </div>
            </main>
        </div>
    );
}

/* ── Sub-components ── */

function FeatureItem({ title, description }: { title: string; description: string }) {
    return (
        <div className="feature-item">
            <strong>{title}</strong>
            <span>{description}</span>
        </div>
    );
}

function StatusIcon({ type }: { type: StatusType }) {
    if (type === 'error') return <AlertCircle size={16} style={{ flexShrink: 0 }} />;
    if (type === 'success') return <CheckCircle size={16} style={{ flexShrink: 0 }} />;
    return <AlertCircle size={16} style={{ flexShrink: 0 }} />;
}