import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../../api";
import "./email_verification_page.css";

type VerifyState = "verifying" | "success" | "error";

function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const [state, setState] = useState<VerifyState>("verifying");
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [resendEmail, setResendEmail] = useState("");
    const [resending, setResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [resendError, setResendError] = useState("");
    const navigate = useNavigate();
    const hasVerified = useRef(false);

    useEffect(() => {
        if (hasVerified.current) return; 
        hasVerified.current = true;    

        const verifyEmail = async () => {
            const rawToken = searchParams.get("token");
            const token = rawToken?.trim();
            if (!token) {
                setErrorMessage("No verification token was provided in the link.");
                setState("error");
                return;
            }
            try {
                const res = await api.post('/api/email-verification/verify', { token });
                if (res.data?.isSuccess) {
                    setState("success");
                } else {
                    setErrorMessage(res.data?.message || "Verification failed. The link may have expired or is invalid.");
                    setState("error");
                }
            } catch (error: any) {
                const msg = error.response?.data?.message || error.message || "We couldn't verify your email address. The link may be invalid or expired.";
                setErrorMessage(msg);
                setState("error");
            }
        };
        verifyEmail();
    }, [searchParams]);

    const handleResend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resendEmail.trim()) return;
        setResending(true);
        setResendError("");
        setResendSuccess(false);
        try {
            const val = resendEmail.trim();
            await api.post('/api/email-verification/resend', {
                identifier: val,
                employeeID: val,
                email: val.includes('@') ? val : undefined,
            });
            setResendSuccess(true);
        } catch (err: any) {
            setResendError(err.response?.data?.message || err.message || "Failed to resend verification email.");
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="ev-page">
            <div className="ev-wrapper">

                {/* Brand */}
                <div className="ev-brand">
                    <div className="ev-brand-logo">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" fill="#00A99D" opacity="0.2" />
                            <path d="M8 12l3 3 5-5" stroke="#00A99D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Speedex</span>
                    </div>
                </div>

                <div className="ev-card">

                    {/* Header */}
                    <div className={`ev-card-header ev-card-header--${state}`}>
                        <div className="ev-header-orb ev-header-orb--tr" />
                        <div className="ev-header-orb ev-header-orb--bl" />

                        <div className={`ev-icon-ring ev-icon-ring--${state}`}>
                            {state === "verifying" && (
                                <svg className="ev-icon-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="9" stroke="rgba(0,169,157,0.3)" strokeWidth="2" />
                                    <path d="M12 3a9 9 0 0 1 9 9" stroke="#00A99D" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            )}
                            {state === "success" && (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                                    <path
                                        className="ev-check-draw"
                                        d="M5 13l4 4L19 7"
                                        stroke="#01B574"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeDasharray="40"
                                        strokeDashoffset="40"
                                    />
                                </svg>
                            )}
                            {state === "error" && (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 9v4m0 4h.01" stroke="#E31A1A" strokeWidth="2.5" strokeLinecap="round" />
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#E31A1A" strokeWidth="2" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>

                        <h2 className="ev-header-title">
                            {state === "verifying" && "Verifying Your Email"}
                            {state === "success" && "Email Verified!"}
                            {state === "error" && "Verification Failed"}
                        </h2>
                        <p className="ev-header-sub">
                            {state === "verifying" && "Please wait while we confirm your address…"}
                            {state === "success" && "Your account is now fully activated."}
                            {state === "error" && "We couldn't verify your email address."}
                        </p>
                    </div>

                    {/* Body */}
                    <div className="ev-card-body">

                        {state === "verifying" && (
                            <div className="ev-state ev-state--verifying">
                                <div className="ev-loading-row">
                                    <span className="ev-pulse-dot" />
                                    <span className="ev-loading-text">Validating token…</span>
                                </div>
                            </div>
                        )}

                        {state === "success" && (
                            <div className="ev-state ev-state--success">
                                <div className="ev-alert ev-alert--success">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="ev-alert-icon">
                                        <circle cx="12" cy="12" r="10" fill="#01B574" opacity="0.15" />
                                        <path d="M8 12l3 3 5-5" stroke="#01B574" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <div>
                                        <p className="ev-alert-title">Verification Successful</p>
                                        <p className="ev-alert-desc">Your email address has been confirmed.</p>
                                    </div>
                                </div>
                                <button className="ev-btn ev-btn--primary" onClick={() => navigate('/')}>
                                    Continue to Login
                                </button>
                            </div>
                        )}

                        {state === "error" && (
                            <div className="ev-state ev-state--error">
                                <div className="ev-alert ev-alert--error">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="ev-alert-icon">
                                        <path d="M12 9v4m0 4h.01" stroke="#E31A1A" strokeWidth="2.5" strokeLinecap="round" />
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#E31A1A" strokeWidth="2" strokeLinejoin="round" />
                                    </svg>
                                    <div>
                                        <p className="ev-alert-title">Verification Failed</p>
                                        <p className="ev-alert-desc">{errorMessage || "The link may be invalid or expired."}</p>
                                    </div>
                                </div>

                                <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 12 }}>
                                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        Need a new verification link? Enter your email or employee ID:
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="text"
                                            value={resendEmail}
                                            onChange={e => setResendEmail(e.target.value)}
                                            placeholder="e.g. employee@company.com or 0001"
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                borderRadius: 6,
                                                border: '1px solid var(--border)',
                                                fontSize: 13,
                                                background: 'var(--bg-input)',
                                                color: 'var(--text-primary)'
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={resending || !resendEmail.trim()}
                                            className="ev-btn ev-btn--primary"
                                            style={{ padding: '8px 14px', fontSize: 12, width: 'auto', whiteSpace: 'nowrap' }}
                                        >
                                            {resending ? 'Sending...' : 'Resend'}
                                        </button>
                                    </div>
                                    {resendSuccess && (
                                        <span style={{ fontSize: 12, color: '#01B574' }}>
                                            ✓ Verification email resent! Please check your inbox.
                                        </span>
                                    )}
                                    {resendError && (
                                        <span style={{ fontSize: 12, color: '#E31A1A' }}>
                                            {resendError}
                                        </span>
                                    )}
                                </form>

                                <div className="ev-btn-group">
                                    <a href="/" className="ev-btn ev-btn--outline">
                                        Back to Login
                                    </a>
                                </div>
                            </div>
                        )}

                        <div className="ev-footer">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--text-tertiary)" strokeWidth="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            <span>Secured with end-to-end encryption</span>
                        </div>
                    </div>
                </div>

                <p className="ev-support">
                    Need help?{" "}
                    <a href="/support" className="ev-support-link">Contact Support</a>
                </p>
            </div>
        </div>
    );
}

export default VerifyEmail;
