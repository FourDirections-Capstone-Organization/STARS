import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// 15-minute inactivity timeout based on real user UI interaction
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const HEARTBEAT_INTERVAL = 5 * 60 * 1000;
const RESET_THROTTLE = 1000;
// Real user activity (scroll/click/navigate) pings the backend so its
// LastActivityAt stays fresh — throttled to avoid hammering the API.
const ACTIVITY_PING_THROTTLE = 60 * 1000;

const ACTIVITY_EVENTS = [
    'mousedown', 'mousemove', 'click', 'keydown',
    'touchstart', 'touchmove', 'pointerdown', 'pointermove',
    'wheel', 'scroll', 'input', 'focus',
];

export function useSessionTimeout() {
    const navigate = useNavigate();
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const heartbeatTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const lastReset = useRef(0);
    const lastActivityPing = useRef(0);
    const logoutRef = useRef<(() => void) | undefined>(undefined);

    const logout = useCallback(() => {
        localStorage.clear();
        navigate('/?reason=inactivity', { replace: true });
    }, [navigate]);

    logoutRef.current = logout;

    const refreshToken = useCallback(async () => {
        const token = localStorage.getItem('refreshToken');
        if (!token) return;

        try {
            const { data: raw } = await axios.post(
                '/api/Auth/refresh-token',
                { refreshToken: token },
                { headers: { 'X-Heartbeat': 'true' } as any }
            );
            const d = raw?.data ?? raw;
            if (d?.accessToken) localStorage.setItem('authToken', d.accessToken);
            if (d?.refreshToken) localStorage.setItem('refreshToken', d.refreshToken);
        } catch (err) {
            console.warn('[SessionTimeout] Heartbeat token refresh failed:', (err as any)?.message ?? err);
        }
    }, []);

    // Best-effort keep-alive ping: updates the backend's LastActivityAt so the
    // session timeout check is satisfied by real user activity. Uses an
    // authenticated read endpoint (no token rotation, no side effects).
    const pingBackend = useCallback(() => {
        axios.get('/api/Auth/me', {
            headers: { 'X-Heartbeat': 'true' } as any,
        }).catch(() => {/* best-effort — token refresh covers expiry */});
    }, []);

    const resetTimer = useCallback(() => {
        const now = Date.now();
        if (now - lastReset.current < RESET_THROTTLE) return;
        lastReset.current = now;

        // Scrolling/clicking/navigating is activity: tell the backend about it
        // (throttled) so the 15-minute inactivity check never trips while the
        // user is actually using the app.
        if (now - lastActivityPing.current >= ACTIVITY_PING_THROTTLE) {
            lastActivityPing.current = now;
            pingBackend();
        }

        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        inactivityTimer.current = setTimeout(() => {
            logoutRef.current?.();
        }, INACTIVITY_TIMEOUT);
    }, [pingBackend]);

    useEffect(() => {
        const handleActivity = () => resetTimer();

        ACTIVITY_EVENTS.forEach(event =>
            window.addEventListener(event, handleActivity, { capture: true })
        );

        resetTimer();

        heartbeatTimer.current = setInterval(refreshToken, HEARTBEAT_INTERVAL);

        return () => {
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
            ACTIVITY_EVENTS.forEach(event =>
                window.removeEventListener(event, handleActivity, { capture: true })
            );
        };
    }, [resetTimer, refreshToken]);
}
