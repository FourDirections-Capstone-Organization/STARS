import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import SpeedexLogo from '../../assets/SpeedexLogo.jpg';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, User, Lock, Phone, Sparkles, ShieldCheck, Eye, EyeOff, Check, X } from 'lucide-react';
import { getStoredRedirectUri, redirectToExternalPortal } from '../../components/Auth/authRedirect';

type Step = 'profile' | 'password' | 'done';

const NAME_REGEX = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\s'\-\.]+$/;
const SUFFIX_REGEX = /^[A-Za-z.\s]+$/;
const PH_MOBILE_REGEX = /^09\d{9}$/;

const passwordRules = [
    { test: (p: string) => p.length >= 15, label: '15+ characters' },
    { test: (p: string) => /[A-Z]/.test(p), label: 'Uppercase letter' },
    { test: (p: string) => /[a-z]/.test(p), label: 'Lowercase letter' },
    { test: (p: string) => /[0-9]/.test(p), label: 'Number' },
    { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'Special character' },
];

// ─── Module-level styled components (stable identity across renders) ────────

const sInput: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px', fontSize: 14, fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1.5px solid var(--border)',
    borderRadius: 'var(--radius-sm)', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
};
const sInputIcon: React.CSSProperties = { ...sInput, paddingLeft: 42 };
const sLabel: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em',
    textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4,
};
const sFieldErr: React.CSSProperties = {
    fontSize: 11, color: 'var(--status-failed)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
};
const sIconWrap: React.CSSProperties = {
    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none',
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
    return (
        <label style={sLabel}>
            {label} {required && <span style={{ color: 'var(--status-failed)' }}>*</span>}
        </label>
    );
}

function FieldError({ msg }: { msg?: string }) {
    return msg ? <span style={sFieldErr}><AlertCircle size={11} /> {msg}</span> : null;
}

function StyledInput({ icon, value, onChange, placeholder, type = 'text', maxLength, error, rightSlot }: {
    icon?: React.ReactNode; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string; type?: string; maxLength?: number; error?: string; rightSlot?: React.ReactNode;
}) {
    return (
        <div style={{ position: 'relative' }}>
            {icon && <span style={sIconWrap}>{icon}</span>}
            <input
                type={type} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength}
                style={{
                    ...(icon ? sInputIcon : sInput),
                    ...(rightSlot ? { paddingRight: 42 } : {}),
                    borderColor: error ? 'var(--status-failed)' : 'var(--border)',
                    boxShadow: error ? '0 0 0 3px rgba(220,38,38,0.08)' : 'none',
                }}
            />
            {rightSlot}
        </div>
    );
}

function PrimaryButton({ onClick, disabled, children }: {
    onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
    return (
        <button
            type="button" onClick={onClick} disabled={disabled}
            style={{
                width: '100%', height: 46, border: 'none', borderRadius: 'var(--radius-md)',
                background: disabled ? 'rgba(0, 169, 157, 0.4)' : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                color: 'white', fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit', marginTop: 8,
                boxShadow: disabled ? 'none' : '0 4px 14px rgba(0, 169, 157, 0.25)',
            }}
        >
            {children}
        </button>
    );
}

function ToggleBtn({ visible, setter }: { visible: boolean; setter: (v: boolean) => void }) {
    return (
        <button type="button" onClick={() => setter(!visible)}
            style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 4,
            }}>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
    );
}

function StepPill({ index, label, state }: { index: number; label: string; state: 'done' | 'active' | 'pending' }) {
    const bg = state === 'active' ? 'var(--primary)' : state === 'done' ? 'var(--status-active)' : 'transparent';
    const color = state === 'active' || state === 'done' ? 'white' : 'var(--text-muted)';
    const borderCls = state === 'pending' ? '1.5px solid rgba(255,255,255,0.15)' : '1.5px solid transparent';
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
            borderRadius: 'var(--radius-full)', background: bg, color,
            border: borderCls,
            fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: state === 'active' ? '0 4px 12px rgba(0,169,157,0.3)' : 'none',
            transition: 'all 0.2s ease',
        }}>
            <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: state === 'pending' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                color: state === 'pending' ? 'var(--text-muted)' : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
            }}>
                {state === 'done' ? <Check size={13} /> : index}
            </span>
            {label}
        </div>
    );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isFresh = searchParams.get('fresh') === 'true';

    useEffect(() => {
        if (!isFresh) navigate('/', { replace: true });
    }, [isFresh, navigate]);

    if (!isFresh) return null;

    const [step, setStep] = useState<Step>('profile');
    const [apiError, setApiError] = useState('');
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState({ firstName: '', middleName: '', lastName: '', suffix: '', contactNumber: '' });
    const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchExistingProfile = async () => {
            try {
                const res = await axios.get('/api/Auth/me');
                const data = res.data?.data;
                if (data) {
                    setProfile({
                        firstName: data.firstName ?? '',
                        middleName: data.middleName ?? '',
                        lastName: data.lastName ?? '',
                        suffix: data.suffix ?? '',
                        contactNumber: data.contactNumber ?? '',
                    });
                    if (data.firstName) localStorage.setItem('firstName', data.firstName);
                    if (data.lastName) localStorage.setItem('lastName', data.lastName);
                    if (data.middleName) localStorage.setItem('middleName', data.middleName);
                    if (data.suffix) localStorage.setItem('suffix', data.suffix);
                    if (data.contactNumber) localStorage.setItem('contactNumber', data.contactNumber);
                    const fullName = [data.firstName, data.middleName, data.lastName, data.suffix].filter(Boolean).join(' ').trim();
                    if (fullName) localStorage.setItem('employeeName', fullName);
                }
            } catch { /* silently ignore */ }
        };
        fetchExistingProfile();
    }, []);

    const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
    const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
    const [showCur, setShowCur] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const validateField = (key: string, value: string): string => {
        if ((key === 'firstName' || key === 'lastName') && !value.trim()) {
            return `${key === 'firstName' ? 'First name' : 'Last name'} is required.`;
        }
        if (key !== 'contactNumber' && value.trim() && !NAME_REGEX.test(value.trim())) return 'Invalid characters.';
        return '';
    };

    const handleProfileSave = async () => {
        const errs: Record<string, string> = {};
        (['firstName', 'lastName', 'contactNumber'] as const).forEach(k => {
            const err = validateField(k, profile[k]);
            if (err) errs[k] = err;
        });
        if (Object.keys(errs).length > 0) { setProfileErrors(errs); return; }
        if (profile.contactNumber && !PH_MOBILE_REGEX.test(profile.contactNumber)) {
            setProfileErrors(p => ({ ...p, contactNumber: 'Enter a valid 11-digit mobile number (09XXXXXXXXX).' }));
            return;
        }
        setSaving(true);
        setApiError('');
        try {
            const empNo = localStorage.getItem('employeeId');
            if (!empNo) throw new Error('Session expired.');
            const lookupRes = await axios.get(`/api/User/employee-number/${encodeURIComponent(empNo)}`);
            const userId = lookupRes.data?.data?.id ?? lookupRes.data?.id;
            if (!userId) throw new Error('Profile not found.');
            await axios.put(`/api/User/${userId}`, {
                firstName: profile.firstName.trim(), middleName: profile.middleName.trim(),
                lastName: profile.lastName.trim(), suffix: profile.suffix.trim(), contactNumber: profile.contactNumber,
            });
            localStorage.setItem('firstName', profile.firstName.trim());
            localStorage.setItem('middleName', profile.middleName.trim());
            localStorage.setItem('lastName', profile.lastName.trim());
            localStorage.setItem('suffix', profile.suffix.trim());
            localStorage.setItem('contactNumber', profile.contactNumber);
            const fullName = [profile.firstName, profile.middleName, profile.lastName, profile.suffix].filter(Boolean).join(' ').trim();
            localStorage.setItem('employeeName', fullName);
            setStep('password');
        } catch (err: any) {
            setApiError(err?.response?.data?.message || err?.message || 'Something went wrong.');
        } finally { setSaving(false); }
    };

    const getDashboardRoute = (): string => {
        let role = localStorage.getItem('userRole') ?? '';
        if (!role) {
            try {
                const token = localStorage.getItem('authToken');
                if (token) {
                    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '');
                    const payload = JSON.parse(atob(b64));
                    const claim = payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || payload.role || '';
                    role = ({ Manager: 'Manager', Coordinator: 'Coordinator', Dispatcher: 'Dispatcher', Encoder: 'Encoder', Courier: 'Courier', Accountant: 'Accountant' } as Record<string, string>)[claim] || '';
                }
            } catch {}
        }
        const routes: Record<string, string> = {
            Manager: '/SystemAdmin_Dashboard', Coordinator: '/OpAdmin_Dashboard',
            Dispatcher: '/OpEmployee_Dashboard', Encoder: '/OpEmployee_Dashboard', Courier: '/OpEmployee_Dashboard', Accountant: '/OpEmployee_Dashboard',
        };
        return routes[role] || '/';
    };

    const goToDashboard = () => navigate(getDashboardRoute(), { replace: true });

    const handlePasswordSave = async () => {
        const errs: Record<string, string> = {};
        if (!pw.current) errs.current = 'Current password is required.';
        if (!pw.next || pw.next.length < 15) errs.next = 'Must be at least 15 characters.';
        if (pw.next !== pw.confirm) errs.confirm = 'Passwords do not match.';
        if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }
        setSaving(true);
        setApiError('');
        try {
            const res = await axios.post('/api/Auth/change-password', {
                currentPassword: pw.current, newPassword: pw.next, confirmPassword: pw.confirm,
            });
            if (!res.data?.isSuccess) throw new Error(res.data?.message || 'Failed to set password.');
            localStorage.setItem('isPasswordChanged', 'true');
            const hasTerms = localStorage.getItem('hasAcceptedTerms') === 'true';
            const termsVer = localStorage.getItem('termsVersionAccepted');
            if (!hasTerms || termsVer !== 'v1.0') {
                navigate('/terms-and-conditions', { replace: true });
            } else {
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
            }
        } catch (err: any) {
            setApiError(err?.response?.data?.message || err?.message || 'Something went wrong.');
        } finally { setSaving(false); }
    };

    const allChecksPassed = passwordRules.every(r => r.test(pw.next));
    const passwordStrength = passwordRules.filter(r => r.test(pw.next)).length;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0B1437 0%, #1B254B 50%, #0B1437 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Montserrat', 'Inter', sans-serif", padding: '24px 16px',
            position: 'relative', overflow: 'hidden',
        }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin-icon { animation: spin 1s linear infinite; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400,
                borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,169,157,0.08), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -100, left: -100, width: 400, height: 400,
                borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.08), transparent)', pointerEvents: 'none' }} />

            <div style={{ width: '100%', maxWidth: 580, position: 'relative', zIndex: 1 }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                        borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)',
                    }}>
                        <img src={SpeedexLogo} alt="Speedex" style={{ height: 28, objectFit: 'contain' }} />
                        <span style={{ color: 'white', fontWeight: 700, fontSize: 14, letterSpacing: '0.05em' }}>STARS</span>
                    </div>
                </div>

                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                    {step !== 'done' && (
                        <div style={{ background: 'linear-gradient(135deg, #0B1437 0%, #1B254B 100%)', padding: '24px 32px 22px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, justifyContent: 'center' }}>
                                <StepPill index={1} label="Profile" state={step === 'profile' ? 'active' : 'done'} />
                                <div style={{ width: 28, height: 2, background: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
                                <StepPill index={2} label="Password" state={step === 'password' ? 'active' : 'pending'} />
                            </div>
                        </div>
                    )}

                    {step === 'profile' && (
                        <div className="fade-in" style={{ padding: '32px 32px 28px' }}>
                            <div style={{ marginBottom: 24, textAlign: 'center' }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 12, boxShadow: '0 6px 16px rgba(0, 169, 157, 0.25)',
                                }}><User size={26} color="white" /></div>
                                <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Set Up Your Profile</h2>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>Tell us a bit about yourself to personalize your account.</p>
                            </div>
                            {apiError && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                                    borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--status-failed)', marginBottom: 16, fontWeight: 500,
                                }}><AlertCircle size={14} /> {apiError}</div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div>
                                        <FieldLabel label="First Name" required />
                                        <StyledInput icon={<User size={15} />} value={profile.firstName}
                                            onChange={e => { setProfile(p => ({ ...p, firstName: e.target.value })); setProfileErrors(prev => ({ ...prev, firstName: validateField('firstName', e.target.value) })); }}
                                            placeholder="Juan" error={profileErrors.firstName} />
                                        <FieldError msg={profileErrors.firstName} />
                                    </div>
                                    <div>
                                        <FieldLabel label="Last Name" required />
                                        <StyledInput icon={<User size={15} />} value={profile.lastName}
                                            onChange={e => { setProfile(p => ({ ...p, lastName: e.target.value })); setProfileErrors(prev => ({ ...prev, lastName: validateField('lastName', e.target.value) })); }}
                                            placeholder="Dela Cruz" error={profileErrors.lastName} />
                                        <FieldError msg={profileErrors.lastName} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div>
                                        <FieldLabel label="Middle Name" />
                                        <StyledInput icon={<User size={15} />} value={profile.middleName}
                                            onChange={e => { setProfile(p => ({ ...p, middleName: e.target.value })); setProfileErrors(prev => ({ ...prev, middleName: validateField('middleName', e.target.value) })); }}
                                            placeholder="Santos" error={profileErrors.middleName} />
                                        <FieldError msg={profileErrors.middleName} />
                                    </div>
                                    <div>
                                        <FieldLabel label="Suffix" />
                                        <StyledInput value={profile.suffix}
                                            onChange={e => { setProfile(p => ({ ...p, suffix: e.target.value })); setProfileErrors(prev => ({ ...prev, suffix: validateField('suffix', e.target.value) })); }}
                                            placeholder="Jr., III" error={profileErrors.suffix} />
                                        <FieldError msg={profileErrors.suffix} />
                                    </div>
                                </div>
                                <div>
                                    <FieldLabel label="Contact Number" required />
                                    <StyledInput icon={<Phone size={15} />} type="tel" value={profile.contactNumber}
                                        onChange={e => { const val = e.target.value.replace(/\D/g, ''); setProfile(p => ({ ...p, contactNumber: val })); setProfileErrors(p => ({ ...p, contactNumber: val && !PH_MOBILE_REGEX.test(val) ? 'Enter a valid 11-digit mobile number (09XXXXXXXXX).' : '' })); }}
                                        placeholder="09123456789" maxLength={11} error={profileErrors.contactNumber} />
                                    <FieldError msg={profileErrors.contactNumber} />
                                </div>
                                <PrimaryButton onClick={handleProfileSave} disabled={saving}>
                                    {saving ? <><Loader2 size={16} className="spin-icon" /> Saving…</> : <>Save & Continue <ArrowRight size={16} /></>}
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {step === 'password' && (
                        <div className="fade-in" style={{ padding: '32px 32px 28px' }}>
                            <div style={{ marginBottom: 24, textAlign: 'center' }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 12, boxShadow: '0 6px 16px rgba(0, 169, 157, 0.25)',
                                }}><Lock size={26} color="white" /></div>
                                <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Secure Your Account</h2>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>Enter your temporary password and set a new strong one.</p>
                            </div>
                            {apiError && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                                    borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--status-failed)', marginBottom: 16, fontWeight: 500,
                                }}><AlertCircle size={14} /> {apiError}</div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <FieldLabel label="Current Password" required />
                                    <StyledInput icon={<Lock size={15} />} type={showCur ? 'text' : 'password'} value={pw.current}
                                        onChange={e => { setPw(p => ({ ...p, current: e.target.value })); setPwErrors(p => ({ ...p, current: '' })); }}
                                        placeholder="Your temporary password" error={pwErrors.current}
                                        rightSlot={<ToggleBtn visible={showCur} setter={setShowCur} />} />
                                    <FieldError msg={pwErrors.current} />
                                </div>
                                <div>
                                    <FieldLabel label="New Password" required />
                                    <StyledInput icon={<ShieldCheck size={15} />} type={showNext ? 'text' : 'password'} value={pw.next}
                                        onChange={e => { setPw(p => ({ ...p, next: e.target.value })); setPwErrors(p => ({ ...p, next: '' })); }}
                                        placeholder="At least 15 characters" error={pwErrors.next}
                                        rightSlot={<ToggleBtn visible={showNext} setter={setShowNext} />} />
                                    {pw.next && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                                                {[1, 2, 3, 4, 5].map(level => (
                                                    <div key={level} style={{
                                                        flex: 1, height: 4, borderRadius: 2,
                                                        background: passwordStrength >= level
                                                            ? (passwordStrength <= 2 ? 'var(--status-failed)' : passwordStrength <= 3 ? 'var(--status-pending)' : 'var(--status-active)')
                                                            : 'var(--border)',
                                                        transition: 'background 0.2s',
                                                    }} />
                                                ))}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {passwordRules.map(rule => {
                                                    const passed = rule.test(pw.next);
                                                    return (
                                                        <span key={rule.label} style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            padding: '3px 8px', borderRadius: 'var(--radius-full)',
                                                            fontSize: 10, fontWeight: 600,
                                                            background: passed ? 'rgba(5,150,105,0.1)' : 'var(--bg-main)',
                                                            color: passed ? 'var(--status-active)' : 'var(--text-muted)',
                                                            border: `1px solid ${passed ? 'rgba(5,150,105,0.3)' : 'var(--border)'}`,
                                                        }}>
                                                            {passed ? <Check size={10} /> : <X size={10} />} {rule.label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <FieldError msg={pwErrors.next} />
                                </div>
                                <div>
                                    <FieldLabel label="Confirm Password" required />
                                    <StyledInput icon={<ShieldCheck size={15} />} type={showConfirm ? 'text' : 'password'} value={pw.confirm}
                                        onChange={e => { setPw(p => ({ ...p, confirm: e.target.value })); setPwErrors(p => ({ ...p, confirm: '' })); }}
                                        placeholder="Re-enter your password" error={pwErrors.confirm}
                                        rightSlot={<ToggleBtn visible={showConfirm} setter={setShowConfirm} />} />
                                    {pw.confirm && pw.next === pw.confirm && (
                                        <span style={{ fontSize: 11, color: 'var(--status-active)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                                            <Check size={11} /> Passwords match
                                        </span>
                                    )}
                                    <FieldError msg={pwErrors.confirm} />
                                </div>
                                <PrimaryButton onClick={handlePasswordSave} disabled={saving || !allChecksPassed}>
                                    {saving
                                        ? <><Loader2 size={16} className="spin-icon" /> Setting password…</>
                                        : <><Sparkles size={16} /> Set Password & Enter Dashboard <ArrowRight size={16} /></>}
                                </PrimaryButton>
                            </div>
                        </div>
                    )}

                    {step === 'done' && (
                        <div style={{ padding: '48px 32px', textAlign: 'center' }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--status-active), #047857)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: 20, boxShadow: '0 8px 24px rgba(5,150,105,0.3)',
                            }}><CheckCircle2 size={36} color="white" /></div>
                            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>You're all set!</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>Your profile and password have been updated. Redirecting to your dashboard...</p>
                            <Loader2 size={24} className="spin-icon" color="var(--primary)" style={{ margin: '0 auto' }} />
                        </div>
                    )}
                </div>

                <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    &copy; {new Date().getFullYear()} Speedex Courier Inc. All rights reserved.
                </p>
            </div>
        </div>
    );
}
