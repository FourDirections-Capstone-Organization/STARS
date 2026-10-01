/**
 * Utility to manage redirection and token handoff between STARS and external portals (e.g. speedex-system.vercel.app).
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
        // Allow http for localhost only, otherwise require https
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
            return false;
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
 * Retrieves any stored redirect URL from sessionStorage.
 */
export function getStoredRedirectUri(): string | null {
    if (typeof window === 'undefined') return null;
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

export interface AuthHandoffPayload {
    token: string;
    refreshToken?: string;
    role?: string;
    employeeId?: string;
    employeeName?: string;
}

/**
 * Redirects the browser to the external portal with authentication parameters passed via hash fragment.
 */
export function redirectToExternalPortal(targetUrl: string, authData: AuthHandoffPayload): void {
    clearStoredRedirectUri();
    
    // Construct clean URL and append hash fragment
    const url = new URL(targetUrl);
    const hashParams = new URLSearchParams();
    
    hashParams.set('token', authData.token);
    if (authData.refreshToken) hashParams.set('refreshToken', authData.refreshToken);
    if (authData.role) hashParams.set('role', authData.role);
    if (authData.employeeId) hashParams.set('employeeId', authData.employeeId);
    if (authData.employeeName) hashParams.set('employeeName', authData.employeeName);

    url.hash = hashParams.toString();
    window.location.href = url.toString();
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
    Accountant: '/OpEmployee_Dashboard',
};

/**
 * Inspects incoming URL hash to see if authentication was handed back from speedex-system
 * (e.g. when clicking the STARS subsystem card).
 * Populates localStorage and wipes the hash if tokens are found.
 */
export function bootstrapIncomingAuthHash(): { authenticated: boolean; role?: string } {
    if (typeof window === 'undefined') return { authenticated: false };

    const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
    if (!hash) return { authenticated: false };

    const params = new URLSearchParams(hash);
    const token = params.get('token') || params.get('accessToken');

    if (!token) return { authenticated: false };

    const refreshToken = params.get('refreshToken');
    const role = params.get('role');
    const employeeId = params.get('employeeId');
    const employeeName = params.get('employeeName');

    localStorage.setItem('authToken', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    if (role) localStorage.setItem('userRole', role);
    if (employeeId) localStorage.setItem('employeeId', employeeId);
    if (employeeName) localStorage.setItem('employeeName', decodeURIComponent(employeeName));
    localStorage.setItem('isPasswordChanged', 'true');
    localStorage.setItem('hasAcceptedTerms', 'true');
    localStorage.setItem('termsVersionAccepted', 'v1.0');

    // Clean hash from URL for a clean browser address bar
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);

    return { authenticated: true, role: role || undefined };
}
