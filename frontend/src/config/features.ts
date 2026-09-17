/**
 * Frontend feature flags.
 *
 * Flags are build-time (Vite) environment variables. Defaults are chosen so
 * that optional / not-yet-integrated capabilities are OFF unless explicitly
 * enabled, which keeps the core system functional without them.
 */

const readFlag = (value: string | boolean | undefined, fallback = false): boolean => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

/**
 * AI & Analytics (Biomarker Scan, expert-system AI recommendations, SLA risk
 * prediction, stream analytics). Turned off for the meantime; the code and the
 * corresponding components remain in the repo, they are simply not surfaced.
 */
export const AI_ANALYTICS_ENABLED = readFlag(import.meta.env.VITE_AI_ANALYTICS_ENABLED, false);
