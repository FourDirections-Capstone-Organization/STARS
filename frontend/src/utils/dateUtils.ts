export interface FormatDeadlineOptions {
    isEffectivelyOverdue?: boolean;
    isCompleted?: boolean;
}

/**
 * Safely parses a date string into a local Date object.
 * Prevents UTC day-shift for YYYY-MM-DD date-only strings.
 */
export function parseLocalDate(d?: string | null): Date | null {
    if (!d) return null;
    const trimmed = String(d).trim();
    if (!trimmed) return null;

    // Check if it's a date-only format like YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    const dt = new Date(trimmed);
    return isNaN(dt.getTime()) ? null : dt;
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
