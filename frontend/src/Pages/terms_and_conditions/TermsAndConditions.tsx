import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { getStoredRedirectUri, redirectToExternalPortal, performLogout } from '../../components/Auth/authRedirect';

export const CURRENT_TERMS_VERSION = 'v1.0';

const dashboardRoutes: Record<string, string> = {
    Manager: '/SystemAdmin_Dashboard',
    Coordinator: '/OpAdmin_Dashboard',
    Encoder: '/OpEmployee_Dashboard',
    Dispatcher: '/OpEmployee_Dashboard',
    Courier: '/OpEmployee_Dashboard',
    Accountant: '/OpEmployee_Dashboard',
};

const TermsAndConditions: React.FC = () => {
    const navigate = useNavigate();
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!localStorage.getItem('authToken')) {
            navigate('/', { replace: true });
        }
    }, [navigate]);

    const getDashboardRoute = (): string => {
        const role = localStorage.getItem('userRole') || localStorage.getItem('role') || '';
        return dashboardRoutes[role] || '/';
    };

    const handleAccept = async () => {
        if (!agreed || submitting) return;
        setSubmitting(true);
        setErrorMsg('');

        try {
            const res = await api.post('/api/Auth/accept-terms', {
                termsVersion: CURRENT_TERMS_VERSION,
            });

            if (res.data?.isSuccess) {
                localStorage.setItem('hasAcceptedTerms', 'true');
                localStorage.setItem('termsVersionAccepted', CURRENT_TERMS_VERSION);

                const storedRedirect = getStoredRedirectUri();
                if (storedRedirect) {
                    const token = localStorage.getItem('authToken') || '';
                    const refreshToken = localStorage.getItem('refreshToken') || '';
                    const role = localStorage.getItem('userRole') || localStorage.getItem('role') || '';
                    const employeeId = localStorage.getItem('employeeId') || '';
                    const employeeName = localStorage.getItem('employeeName') || '';

                    redirectToExternalPortal(storedRedirect, {
                        token,
                        refreshToken,
                        role,
                        employeeId,
                        employeeName,
                    });
                    return;
                }

                navigate(getDashboardRoute(), { replace: true });
            } else {
                setErrorMsg(res.data?.message || 'Failed to accept terms. Please try again.');
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Something went wrong. Please try again.';
            setErrorMsg(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogout = async () => {
        await performLogout();
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f4f7fe',
            fontFamily: "'Montserrat', 'Inter', sans-serif",
            padding: '32px 16px',
            boxSizing: 'border-box'
        }}>
            <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 24,
                padding: '36px 32px',
                boxShadow: '0 8px 40px rgba(15,23,42,0.08)',
                width: '100%',
                maxWidth: 640,
                boxSizing: 'border-box'
            }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4318ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                        Terms & Conditions
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                        Speedex Task & Automated Routing System (STARS) — Version {CURRENT_TERMS_VERSION}
                    </p>
                </div>

                {errorMsg && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 10,
                        padding: '12px 16px',
                        marginBottom: 18,
                        fontSize: 13,
                        color: '#dc2626',
                        fontWeight: 500
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {errorMsg}
                    </div>
                )}

                <div style={{
                    maxHeight: 340,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '20px 22px',
                    background: '#fafbfd',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: '#334155',
                    marginBottom: 20
                }}>
                    <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 14, fontWeight: 700 }}>
                        1. Introduction & Acceptance
                    </h4>
                    <p style={{ margin: '0 0 16px' }}>
                        Welcome to the Speedex Task & Automated Routing System (STARS). By logging into and using this system, you agree to comply with and be bound by the following terms, conditions, and privacy guidelines. If you do not agree to these terms, you may not access or use the application.
                    </p>

                    <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 14, fontWeight: 700 }}>
                        2. Information We Collect (What We Collect)
                    </h4>
                    <p style={{ margin: '0 0 6px' }}>
                        To provide effective operational tracking, task distribution, and employee collaboration, STARS collects and processes the following data:
                    </p>
                    <ul style={{ margin: '0 0 16px', paddingLeft: 20 }}>
                        <li><strong>Personal & Employment Details:</strong> Full name, employee ID number, work email address, department, job role, and contact number.</li>
                        <li><strong>Task & Operational Activities:</strong> Task assignments, status transitions, attachments, workflow comments, and completion timestamps.</li>
                        <li><strong>Presence & Availability Status:</strong> Real-time work status (Active, Offline, On-Leave) used for workload balancing and automated task routing.</li>
                        <li><strong>Audit & Security Logs:</strong> Login timestamps, IP addresses, session duration, and administrative actions for security verification.</li>
                    </ul>

                    <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 14, fontWeight: 700 }}>
                        3. Purpose of Collection (Why We Collect It)
                    </h4>
                    <p style={{ margin: '0 0 6px' }}>
                        The collected information is used solely for corporate business operations:
                    </p>
                    <ul style={{ margin: '0 0 16px', paddingLeft: 20 }}>
                        <li><strong>Automated Workload Routing:</strong> Fairly distributing tasks among active personnel using automated round-robin algorithms to prevent employee overload.</li>
                        <li><strong>Service Level Agreement (SLA) Tracking:</strong> Ensuring deadline adherence, priority handling, and timely operational handoffs.</li>
                        <li><strong>Accountability & Traceability:</strong> Maintaining audit logs to meet organizational transparency and internal control requirements.</li>
                    </ul>

                    <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 14, fontWeight: 700 }}>
                        4. User Responsibilities & Data Protection
                    </h4>
                    <p style={{ margin: '0 0 16px' }}>
                        You are responsible for keeping your login credentials confidential. Do not share your account or password with others. Any sensitive internal information accessed within STARS must be treated with strict confidentiality.
                    </p>

                    <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 14, fontWeight: 700 }}>
                        5. Updates to Terms
                    </h4>
                    <p style={{ margin: 0 }}>
                        These terms may be updated periodically to accommodate operational or policy changes. When updates are published, you will be required to re-acknowledge and accept the updated terms upon your next login.
                    </p>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    marginBottom: 24,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                }}>
                    <input
                        id="terms-checkbox"
                        type="checkbox"
                        checked={agreed}
                        onChange={e => setAgreed(e.target.checked)}
                        style={{
                            marginTop: 3,
                            width: 16,
                            height: 16,
                            accentColor: '#4318ff',
                            cursor: 'pointer'
                        }}
                    />
                    <label htmlFor="terms-checkbox" style={{
                        fontSize: 13,
                        color: '#1e293b',
                        fontWeight: 600,
                        cursor: 'pointer',
                        lineHeight: 1.4
                    }}>
                        I have read, understood, and agree to the Terms & Conditions and Privacy Policy ({CURRENT_TERMS_VERSION}).
                    </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                        type="button"
                        onClick={handleAccept}
                        disabled={!agreed || submitting}
                        style={{
                            width: '100%',
                            height: 44,
                            borderRadius: 12,
                            background: agreed && !submitting ? '#4318ff' : '#a5b4fc',
                            color: 'white',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: agreed && !submitting ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit',
                            transition: 'background 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8
                        }}
                    >
                        {submitting ? 'Submitting...' : 'Agree & Continue'}
                    </button>

                    <button
                        type="button"
                        onClick={handleLogout}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '6px 0',
                            fontFamily: 'inherit',
                            textDecoration: 'underline'
                        }}
                    >
                        Log out / Decline
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TermsAndConditions;
