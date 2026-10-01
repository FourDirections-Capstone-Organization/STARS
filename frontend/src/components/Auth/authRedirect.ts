/**
 * Utility to manage redirection and token handoff between STARS and external portals (e.g. speedex-system.vercel.app / Speedex Central Portal).
 */

const REDIRECT_STORAGE_KEY = 'speedex_redirect_uri';

// Whitelist of allowed destination hosts to prevent open redirect vulnerabilities
const ALLOWED_HOSTNAMES = [
    'speedex-system.vercel.app',
    'localhost',
    '127.0.0.1',
];

/**
 * Validates whether a given URL is safe and belongs to an allowed origin.
 */
export function isValidRedirectUrl(url: string | null): boolean {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        // Allow http for localhost/127.0.0.1 and speedex origins
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return false;
        }
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return true;
        }
        return ALLOWED_HOSTNAMES.some(allowed => parsed.hostname === allowed || parsed.hostname.endsWith(`.${allowed}`));
    } catch {
        return false;
    }
}

/**
 * Captures redirect_uri from URL query parameters (if present and valid) and persists it in sessionStorage.
 */
export function captureRedirectUriFromQuery(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get('redirect_uri') || params.get('redirect_url') || params.get('return_to') || params.get('returnUrl');

    if (redirectParam && isValidRedirectUrl(redirectParam)) {
        sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectParam);
        return redirectParam;
    }
    return null;
}

/**
 * Retrieves any stored redirect URL from URL search query or sessionStorage.
 */
export function getStoredRedirectUri(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('redirect_uri') || params.get('redirect_url') || params.get('return_to') || params.get('returnUrl');
    if (fromQuery && isValidRedirectUrl(fromQuery)) {
        return fromQuery;
    }

    const stored = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
    if (stored && isValidRedirectUrl(stored)) {
        return stored;
    }
    return null;
}

/**
 * Clears the stored redirect URL from sessionStorage.
 */
export function clearStoredRedirectUri(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
}

/**
 * Resolves the public website URL from stored redirect_uri or default domain.
 */
export function getPublicWebsiteUrl(): string {
    const stored = getStoredRedirectUri();
    if (stored) {
        try {
            const u = new URL(stored);
            return u.origin;
        } catch {
            return stored;
        }
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return 'http://localhost:5173';
    }
    return 'https://speedex-system.vercel.app';
}

/**
 * Resolves the Speedex Central Portal URL from stored redirect_uri or default portal URL.
 */
export function getSystemPortalUrl(): string {
    const stored = getStoredRedirectUri();
    if (stored) {
        try {
            const u = new URL(stored);
            if (u.pathname && (u.pathname.includes('portal') || u.pathname.length > 1)) {
                return stored;
            }
            return `${u.origin}/portal`;
        } catch {
            return stored;
        }
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return 'http://localhost:5173/portal';
    }
    return 'https://speedex-system.vercel.app/portal';
}

/**
 * Navigates back to the Speedex Central Portal with current authentication payload so the user can reselect a subsystem.
 */
export function navigateToSystemPortal(): void {
    const portalUrl = getSystemPortalUrl();
    const token = localStorage.getItem('authToken') || '';
    const refreshToken = localStorage.getItem('refreshToken') || '';
    const role = localStorage.getItem('userRole') || localStorage.getItem('role') || '';
    const employeeId = localStorage.getItem('employeeId') || '';
    const employeeName = localStorage.getItem('employeeName') || '';

    if (token) {
        redirectToExternalPortal(portalUrl, {
            token,
            refreshToken,
            role,
            employeeId,
            employeeName,
        });
    } else {
        window.location.href = portalUrl;
    }
}

export interface AuthHandoffPayload {
    token: string;
    refreshToken?: string;
    role?: string;
    employeeId?: string;
    employeeName?: string;
}

/**
 * Redirects the browser to the external portal with authentication parameters passed via hash fragment:
 * `${redirect_uri}#token=${token}&refreshToken=${refreshToken}&role=${role}&employeeId=${employeeId}&employeeName=${encodeURIComponent(employeeName)}`
 */
export function redirectToExternalPortal(targetUrl: string, authData: AuthHandoffPayload): void {
    clearStoredRedirectUri();
    
    const token = authData.token || '';
    const refreshToken = authData.refreshToken || '';
    const role = authData.role || '';
    const employeeId = authData.employeeId || '';
    const employeeName = authData.employeeName || '';

    // Strip existing hash fragment if any
    const baseTarget = targetUrl.split('#')[0];
    const hashFragment = `token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}&role=${encodeURIComponent(role)}&employeeId=${encodeURIComponent(employeeId)}&employeeName=${encodeURIComponent(employeeName)}`;

    window.location.href = `${baseTarget}#${hashFragment}`;
}

export type NormalizedUserRole =
    | 'Manager'
    | 'Coordinator'
    | 'Dispatcher'
    | 'Encoder'
    | 'Courier'
    | 'Accountant';

/**
 * Normalizes role variations to canonical STARS roles.
 */
export function normalizeRole(role: string): NormalizedUserRole | '' {
    if (!role) return '';
    const clean = role.toLowerCase().trim().replace(/[\s_-]+/g, '');
    const map: Record<string, NormalizedUserRole> = {
        manager: 'Manager',
        admin: 'Manager',
        systemadmin: 'Manager',
        sysadmin: 'Manager',
        coordinator: 'Coordinator',
        opadmin: 'Coordinator',
        operationsadmin: 'Coordinator',
        dispatcher: 'Dispatcher',
        encoder: 'Encoder',
        courier: 'Courier',
        driver: 'Courier',
        rider: 'Courier',
        accountant: 'Accountant',
        finance: 'Accountant',
    };
    return map[clean] ?? (role as NormalizedUserRole);
}

/**
 * Role-to-dashboard routes for STARS
 */
export const dashboardRoutes: Record<string, string> = {
    Manager: '/SystemAdmin_Dashboard',
    Coordinator: '/OpAdmin_Dashboard',
    Dispatcher: '/OpEmployee_Dashboard',
    Encoder: '/OpEmployee_Dashboard',
    Courier: '/OpEmployee_Dashboard',
    Driver: '/OpEmployee_Dashboard',
    Rider: '/OpEmployee_Dashboard',
    Accountant: '/OpEmployee_Dashboard',
};

/**
 * Resolves the destination dashboard URL for a given role.
 */
export function getDashboardRoute(role?: string): string {
    if (!role) return '/';
    const normalized = normalizeRole(role);
    return (normalized && dashboardRoutes[normalized]) || dashboardRoutes[role] || '/OpEmployee_Dashboard';
}

export interface IncomingAuthResult {
    authenticated: boolean;
    token?: string;
    refreshToken?: string;
    role?: string;
    employeeId?: string;
    employeeName?: string;
    targetRoute?: string;
}

/**
 * Inspects incoming URL (search query parameters and hash fragment) to see if authentication
 * credentials were provided during SSO handshake from Speedex Central Portal.
 *
 * If credentials are present:
 * - Saves token, refreshToken, role, employeeId, and employeeName into localStorage
 * - Cleans the URL query/hash from the address bar using `window.history.replaceState(null, '', window.location.pathname)`
 * - Returns authenticated status and target role-based route.
 */
export function bootstrapIncomingAuth(): IncomingAuthResult {
    if (typeof window === 'undefined') return { authenticated: false };

    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
    const hashParams = new URLSearchParams(hash);

    const getParam = (...keys: string[]): string | null => {
        for (const k of keys) {
            const val = hashParams.get(k) ?? searchParams.get(k);
            if (val !== null && val !== undefined && val !== '') return val;
        }
        return null;
    };

    const token = getParam('token', 'authToken', 'accessToken', 'access_token');
    if (!token) return { authenticated: false };

    const refreshToken = getParam('refreshToken', 'refresh_token') || '';
    let role = getParam('role', 'userRole', 'roles') || '';
    const employeeId = getParam('employeeId', 'employeeNumber', 'userId', 'id') || '';
    const employeeNameRaw = getParam('employeeName', 'name', 'fullName', 'userName') || '';

    // If role wasn't explicitly provided, attempt decoding from JWT payload
    if (!role && token.includes('.')) {
        try {
            const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
            const payload = JSON.parse(atob(padded));
            role = payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || payload.role || payload.roles || '';
        } catch {
            // ignore decoding error
        }
    }

    const normalizedRole = normalizeRole(role) || role;
    let employeeName = employeeNameRaw;
    try {
        employeeName = decodeURIComponent(employeeNameRaw);
    } catch {
        // Keep raw if already decoded or malformed
    }

    // Save credentials into localStorage
    localStorage.setItem('authToken', token);
    if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
    }
    if (normalizedRole) {
        localStorage.setItem('userRole', normalizedRole);
        localStorage.setItem('role', normalizedRole);
    }
    if (employeeId) {
        localStorage.setItem('employeeId', employeeId);
    }
    if (employeeName) {
        localStorage.setItem('employeeName', employeeName);
    }
    localStorage.setItem('isPasswordChanged', 'true');
    localStorage.setItem('hasAcceptedTerms', 'true');
    localStorage.setItem('termsVersionAccepted', 'v1.0');

    // Clean the URL query/hash from the address bar as required
    window.history.replaceState(null, '', window.location.pathname);

    const targetRoute = getDashboardRoute(normalizedRole);

    return {
        authenticated: true,
        token,
        refreshToken,
        role: normalizedRole,
        employeeId,
        employeeName,
        targetRoute,
    };
}

/**
 * Backward compatibility alias for bootstrapIncomingAuth
 */
export const bootstrapIncomingAuthHash = bootstrapIncomingAuth;
