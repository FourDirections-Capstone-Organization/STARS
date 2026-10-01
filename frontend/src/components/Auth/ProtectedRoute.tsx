import { Navigate, Outlet } from 'react-router-dom';
import { normalizeRole } from './authRedirect';

interface ProtectedRouteProps {
    allowedRoles?: string[];
}

function getStoredRole(): string {
    const stored = localStorage.getItem('userRole') || localStorage.getItem('role');
    if (stored) return normalizeRole(stored) || stored;
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return '';
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
        const payload = JSON.parse(atob(padded));
        const claim = payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || payload.role || payload.roles;
        return normalizeRole(claim) || claim || '';
    } catch {
        return '';
    }
}

function isTokenValid(): boolean {
    const token = localStorage.getItem('authToken');
    if (!token) return false;
    try {
        if (token.includes('.')) {
            const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
            JSON.parse(atob(padded));
        }
        return true;
    } catch {
        return !!token;
    }
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
    if (!isTokenValid()) {
        return <Navigate to="/" replace />;
    }

    const role = getStoredRole();
    if (allowedRoles && !allowedRoles.some(r => r.toLowerCase() === role.toLowerCase())) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
