import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './global.css'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import axios from 'axios'

axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'https://stars-h8bgfbhghzbdc9fd.southeastasia-01.azurewebsites.net';

axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) reject(error);
        else resolve(token);
    });
    failedQueue = [];
};

axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Don't retry or handle errors from heartbeat refresh requests
        if (originalRequest.headers?.['X-Heartbeat']) {
            return Promise.reject(error);
        }

        // Note: a backend SESSION_TIMEOUT (inactivity) is NOT fatal here — the
        // refresh token is valid for 7 days and refresh resets LastActivityAt,
        // so an active user is recovered by the normal refresh path below.
        // True AFK timeout is enforced by the frontend inactivity timer.

        // Handle deactivated/locked account — only for 401 from SessionTimeoutMiddleware
        if (error.response?.status === 401) {
            const msg = error.response?.data?.message ?? '';
            if (msg.toLowerCase().includes('deactivated') || msg.toLowerCase().includes('locked')) {
                const empNum = localStorage.getItem('employeeId') || '';
                localStorage.clear();
                appNavigate(`/account_locked?employeeNumber=${encodeURIComponent(empNum)}`);
                return Promise.reject(error);
            }
        }

        if (error.response?.status !== 401 || originalRequest._retry) {
            return Promise.reject(error);
        }

        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            localStorage.clear();
            appNavigate('/');
            return Promise.reject(error);
        }

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return axios(originalRequest);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const { data: raw } = await axios.post('/api/Auth/refresh-token', {
                refreshToken,
            });

            const d = raw?.data ?? raw;
            const newAccessToken = d.accessToken;
            const newRefreshToken = d.refreshToken;

            localStorage.setItem('authToken', newAccessToken);
            localStorage.setItem('refreshToken', newRefreshToken);

            processQueue(null, newAccessToken);

            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return axios(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            localStorage.clear();
            appNavigate('/');
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

import LoginPage from './Pages/login_page/login'
import SystemAdmin_Dashboard from './Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard'
import ForgotPasswordPage from './Pages/forgotpassword_page/forgotpassword_page'
import ResetPasswordPage from './Pages/resetpassword_page/resetpassword_page'
import OpAdmin_Dashboard from './Pages/OpAdmin_Dashboard/OpAdmin_Dashboard'
import OpEmployee_Dashboard from './Pages/OpEmployee_Dashboard/OpEmployee_Dashboard'
import AccountLocked from './Pages/account_locked/account_locked'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import ChangePassword from './Pages/change_password/change_password'
import EmailVerificationPage from './Pages/email_verification_page/email_verification_page'
import SetPasswordPage from './Pages/set_password_page/set_password_page'
import { ToastProvider } from './components/Toast/Toast'
import AuthSyncWatcher from './components/Auth/AuthSyncWatcher'
import SessionTimeoutWatcher from './components/Auth/SessionTimeoutWatcher'
import { appNavigate } from './components/Auth/useAppNavigate'
import OnboardingPage from './Pages/onboarding_page/onboarding_page'

function PasswordChangedGuard() {
    const hasToken = !!localStorage.getItem('authToken');
    if (!hasToken) return <Navigate to="/" replace />;
    const isPasswordChanged = localStorage.getItem('isPasswordChanged') === 'true';
    if (!isPasswordChanged) {
        const employeeId = localStorage.getItem('employeeId');
        if (employeeId === '0000') {
            return <Navigate to="/set-password" replace />;
        }
        return <Navigate to="/onboarding?fresh=true" replace />;
    }
    return <Outlet />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <AuthSyncWatcher />
                <SessionTimeoutWatcher />
                <Routes>
                    {/* Public routes */}
                    <Route path="/" element={<LoginPage />} />
                    <Route path="/forgotpassword_page" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/account_locked" element={<AccountLocked />} />
                    <Route path="/change-password" element={<ChangePassword />} />
                    <Route path="/set-password" element={<SetPasswordPage />} />
                    <Route path="/verify-email" element={<EmailVerificationPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />

                    {/* Manager routes */}
                    <Route element={<ProtectedRoute allowedRoles={['Manager']} />}>
                        <Route element={<PasswordChangedGuard />}>
                            <Route path="/SystemAdmin_Dashboard" element={<SystemAdmin_Dashboard />} />
                        </Route>
                    </Route>

                    {/* Coordinator & Manager routes (Manager has full access per FR-012) */}
                    <Route element={<ProtectedRoute allowedRoles={['Manager', 'Coordinator']} />}>
                        <Route element={<PasswordChangedGuard />}>
                            <Route path="/OpAdmin_Dashboard" element={<OpAdmin_Dashboard />} />
                        </Route>
                    </Route>

                    {/* Encoder / Dispatcher / Courier / Accountant routes */}
                    <Route element={<ProtectedRoute allowedRoles={['Encoder', 'Dispatcher', 'Courier', 'Accountant']} />}>
                        <Route element={<PasswordChangedGuard />}>
                            <Route path="/OpEmployee_Dashboard" element={<OpEmployee_Dashboard />} />
                        </Route>
                    </Route>

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </ToastProvider>
        </BrowserRouter>
    </React.StrictMode>
)
// Trigger language stats refresh

