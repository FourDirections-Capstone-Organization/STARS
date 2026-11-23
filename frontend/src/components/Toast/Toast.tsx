import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import './Toast.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface ToastOptions {
    /** Visual style */
    variant?: ToastVariant;
    /** Auto-dismiss duration in ms (0 = never). Defaults: confirm=0, others=4000 */
    duration?: number;
    /** Confirm / secondary action label (only for variant="confirm") */
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

interface ToastItem extends Required<Omit<ToastOptions, 'onConfirm' | 'onCancel'>> {
    id: number;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    exiting: boolean;
}

interface ToastContextValue {
    toast: (message: string, options?: ToastOptions) => void;
    /** Shorthand helpers */
    success: (message: string, options?: Omit<ToastOptions, 'variant'>) => void;
    error: (message: string, options?: Omit<ToastOptions, 'variant'>) => void;
    warning: (message: string, options?: Omit<ToastOptions, 'variant'>) => void;
    info: (message: string, options?: Omit<ToastOptions, 'variant'>) => void;
    /** Returns a Promise<boolean> — true if confirmed, false if cancelled */
    confirm: (message: string, options?: Omit<ToastOptions, 'variant'>) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

let _uid = 0;
const uid = () => ++_uid;

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
    const activeToastKeys = useRef<Map<string, number>>(new Map()); // "message|variant" -> id

    const dismiss = useCallback((id: number) => {
        // Remove from active keys
        for (const [key, tid] of activeToastKeys.current) {
            if (tid === id) { activeToastKeys.current.delete(key); break; }
        }
        // Start exit animation
        setToasts(prev =>
            prev.map(t => (t.id === id ? { ...t, exiting: true } : t))
        );
        // Remove after animation
        const t = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
            timers.current.delete(id);
        }, 320);
        timers.current.set(id, t);
    }, []);

    const push = useCallback(
        (message: string, options: ToastOptions = {}): number => {
            const variant = options.variant ?? 'info';
            const duration = options.duration ?? (variant === 'confirm' ? 0 : 4000);
            const key = `${message}|${variant}`;

            // Dedup: if the same message+variant is already visible, renew its timer
            const existingId = activeToastKeys.current.get(key);
            if (existingId !== undefined) {
                const existingTimer = timers.current.get(existingId);
                if (existingTimer) clearTimeout(existingTimer);
                if (duration > 0) {
                    const t = setTimeout(() => dismiss(existingId), duration);
                    timers.current.set(existingId, t);
                }
                return existingId;
            }

            const id = uid();
            const confirmLabel = options.confirmLabel ?? 'Confirm';
            const cancelLabel = options.cancelLabel ?? 'Cancel';

            const item: ToastItem = {
                id, message, variant, duration,
                confirmLabel, cancelLabel,
                onConfirm: options.onConfirm,
                onCancel: options.onCancel,
                exiting: false,
            };

            activeToastKeys.current.set(key, id);
            setToasts(prev => [...prev, item]);

            if (duration > 0) {
                const t = setTimeout(() => dismiss(id), duration);
                timers.current.set(id, t);
            }

            return id;
        },
        [dismiss]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            timers.current.forEach(clearTimeout);
        };
    }, []);

    const toast = useCallback((msg: string, opts?: ToastOptions) => { push(msg, opts); }, [push]);
    const success = useCallback((msg: string, opts?: Omit<ToastOptions, 'variant'>) => { push(msg, { ...opts, variant: 'success' }); }, [push]);
    const error = useCallback((msg: string, opts?: Omit<ToastOptions, 'variant'>) => { push(msg, { ...opts, variant: 'error' }); }, [push]);
    const warning = useCallback((msg: string, opts?: Omit<ToastOptions, 'variant'>) => { push(msg, { ...opts, variant: 'warning' }); }, [push]);
    const info = useCallback((msg: string, opts?: Omit<ToastOptions, 'variant'>) => { push(msg, { ...opts, variant: 'info' }); }, [push]);

    const confirm = useCallback(
        (msg: string, opts?: Omit<ToastOptions, 'variant'>): Promise<boolean> => {
            return new Promise<boolean>(resolve => {
                push(msg, {
                    ...opts,
                    variant: 'confirm',
                    duration: 0,
                    onConfirm: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
        },
        [push]
    );

    const value: ToastContextValue = { toast, success, error, warning, info, confirm };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

const noopToastContext: ToastContextValue = {
    toast: () => { },
    success: () => { },
    error: () => { },
    warning: () => { },
    info: () => { },
    confirm: async () => false,
};

export const useToast = (): ToastContextValue => {
    const ctx = useContext(ToastContext);
    if (!ctx) return noopToastContext;
    return ctx;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const ICONS: Record<ToastVariant, React.ReactNode> = {
    success: (
        <svg viewBox="0 0 20 20" fill="none" className="toast-svg">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M6 10.5l2.5 2.5L14 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    error: (
        <svg viewBox="0 0 20 20" fill="none" className="toast-svg">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    warning: (
        <svg viewBox="0 0 20 20" fill="none" className="toast-svg">
            <path d="M10 2.5L18 17H2L10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 8v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="10" cy="14.5" r="0.8" fill="currentColor" />
        </svg>
    ),
    info: (
        <svg viewBox="0 0 20 20" fill="none" className="toast-svg">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="10" cy="6.5" r="0.8" fill="currentColor" />
        </svg>
    ),
    confirm: (
        <svg viewBox="0 0 20 20" fill="none" className="toast-svg">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 6v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="10" cy="13.5" r="0.8" fill="currentColor" />
        </svg>
    ),
};

// ─── Single Toast ─────────────────────────────────────────────────────────────

const ToastItem_: React.FC<{
    item: ToastItem;
    onDismiss: (id: number) => void;
}> = ({ item, onDismiss }) => {
    const handleConfirm = () => {
        item.onConfirm?.();
        onDismiss(item.id);
    };
    const handleCancel = () => {
        item.onCancel?.();
        onDismiss(item.id);
    };

    return (
        <div
            className={`toast toast-${item.variant}${item.exiting ? ' toast-exit' : ''}`}
            role={item.variant === 'error' ? 'alert' : 'status'}
            aria-live="polite"
        >
            {/* Progress bar for auto-dismiss */}
            {item.duration > 0 && (
                <div
                    className="toast-progress"
                    style={{ animationDuration: `${item.duration}ms` }}
                />
            )}

            <div className="toast-body">
                <span className="toast-icon">{ICONS[item.variant]}</span>
                <span className="toast-message">{item.message}</span>

                {item.variant !== 'confirm' && (
                    <button
                        className="toast-close"
                        onClick={() => onDismiss(item.id)}
                        aria-label="Dismiss"
                    >
                        <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                )}
            </div>

            {item.variant === 'confirm' && (
                <div className="toast-actions">
                    <button className="toast-btn toast-btn-cancel" onClick={handleCancel}>
                        {item.cancelLabel}
                    </button>
                    <button className="toast-btn toast-btn-confirm" onClick={handleConfirm}>
                        {item.confirmLabel}
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Container ────────────────────────────────────────────────────────────────

const ToastContainer: React.FC<{
    toasts: ToastItem[];
    onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;
    return (
        <div className="toast-container" aria-label="Notifications">
            {toasts.map(t => (
                <ToastItem_ key={t.id} item={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
};