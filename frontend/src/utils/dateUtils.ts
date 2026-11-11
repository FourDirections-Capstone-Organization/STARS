export interface FormatDeadlineOptions {
    isEffectivelyOverdue?: boolean;
    isCompleted?: boolean;
}

/**
 * Safely parses a date string into a local Date object.
 * Prevents UTC day-shift for YYYY-MM-DD date-only strings and UTC midnight ISO timestamps.
 */
export function parseLocalDate(d?: string | null): Date | null {
    if (!d) return null;
    const trimmed = String(d).trim();
    if (!trimmed) return null;

    // Fast path: date-only format or UTC/local midnight timestamp (e.g. 2026-11-13 or 2026-11-13T00:00:00Z)
    const midnightMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00(?::00(?:\.000)?)?(?:Z|[+-]00:?00)?)?$/);
    if (midnightMatch) {
        const [, year, month, day] = midnightMatch.map(Number);
        return new Date(year, month - 1, day);
    }

    const dt = new Date(trimmed);
    return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Formats a date string or Date object into the standard DD/MM/YYYY format (e.g. "13/11/2026").
 * Prevents UTC midnight shifts across timezones (e.g., UTC midnight '2026-11-13T00:00:00Z'
 * remaining '13/11/2026' regardless of browser timezone).
 *
 * Returns '—' if input is null, undefined, empty, or invalid.
 */
export function formatDateOnly(d?: string | Date | null): string {
    if (!d) return '—';

    if (d instanceof Date) {
        if (isNaN(d.getTime())) return '—';
        // If constructed from UTC midnight and local isn't midnight, preserve UTC calendar date
        if (
            d.getUTCHours() === 0 &&
            d.getUTCMinutes() === 0 &&
            d.getUTCSeconds() === 0 &&
            (d.getHours() !== 0 || d.getMinutes() !== 0)
        ) {
            const day = String(d.getUTCDate()).padStart(2, '0');
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}/${month}/${year}`;
        }
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    const trimmed = String(d).trim();
    if (!trimmed || trimmed === '—') return '—';

    // Fast path: ISO or YYYY-MM-DD string
    const isoMatch = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
    );
    if (isoMatch) {
        const [, yStr, mStr, dStr] = isoMatch;
        const year = Number(yStr);
        const month = Number(mStr);
        const day = Number(dStr);

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            // Guard against invalid calendar dates (e.g. 2026-02-30)
            const check = new Date(year, month - 1, day);
            if (
                check.getFullYear() === year &&
                check.getMonth() === month - 1 &&
                check.getDate() === day
            ) {
                return `${dStr}/${mStr}/${yStr}`;
            }
        }
        return '—';
    }

    const dt = new Date(trimmed);
    if (isNaN(dt.getTime())) return '—';

    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Formats a date into YYYY-MM-DD for date inputs (<input type="date">).
 * Prevents UTC timezone day-shift.
 */
export function formatDateToIsoDate(d?: string | Date | null): string {
    if (!d) return '';
    if (d instanceof Date) {
        if (isNaN(d.getTime())) return '';
        if (
            d.getUTCHours() === 0 &&
            d.getUTCMinutes() === 0 &&
            (d.getHours() !== 0 || d.getMinutes() !== 0)
        ) {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    const trimmed = String(d).trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const dt = new Date(trimmed);
    if (isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Computes calendar days difference between target deadline and current local date.
 * Returns null if invalid date.
 * Positive number = days in the future (e.g. 30 = 30 days left)
 * 0 = due today
 * Negative number = days in the past (e.g. -2 = 2 days overdue)
 */
export function getDeadlineDiffDays(deadline?: string | null): number | null {
    const target = parseLocalDate(deadline);
    if (!target) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDay = new Date(target);
    targetDay.setHours(0, 0, 0, 0);

    return Math.round((targetDay.getTime() - today.getTime()) / 86400000);
}

/**
 * Formats a deadline date to include the exact date and remaining days.
 * Example: "November 21, 2026 (30 days left)"
 */
export function formatDeadlineWithRemaining(
    deadline?: string | null,
    options?: FormatDeadlineOptions
): string {
    if (!deadline) return '—';

    const target = parseLocalDate(deadline);
    if (!target) return deadline || '—';

    const dateFormatted = target.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    const diff = getDeadlineDiffDays(deadline);
    if (diff === null) return dateFormatted;

    // If task is completed / done / cancelled, do not mark as overdue
    if (options?.isCompleted) {
        if (diff >= 0) {
            const label = diff === 0
                ? 'Due today'
                : diff === 1
                    ? '1 day left'
                    : `${diff} days left`;
            return `${dateFormatted} (${label})`;
        }
        return dateFormatted;
    }

    // Overdue handling
    if (options?.isEffectivelyOverdue || diff < 0) {
        const daysOverdue = Math.abs(diff);
        if (daysOverdue === 0) {
            return `${dateFormatted} (Due today)`;
        }
        return `${dateFormatted} (${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue)`;
    }

    // Due today
    if (diff === 0) {
        return `${dateFormatted} (Due today)`;
    }

    // Due tomorrow
    if (diff === 1) {
        return `${dateFormatted} (1 day left)`;
    }

    // Due in multiple days
    return `${dateFormatted} (${diff} days left)`;
}
