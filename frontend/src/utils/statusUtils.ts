/**
 * Canonical Title Case display outputs for task statuses.
 */
export type TaskStatusDisplay =
    | 'To Do'
    | 'In Progress'
    | 'Pending Review'
    | 'Completed'
    | 'On Hold'
    | 'Cancelled'
    | 'Overdue';

/**
 * Normalized lookup dictionary mapping all known raw status inputs
 * (integers, numeric strings, enum names, kebab-case, snake_case, sentence-case)
 * to canonical Title Case display labels.
 */
export const TASK_STATUS_MAP: Record<string, TaskStatusDisplay> = {
    // 0 / To Do / Not Started / Backlog
    '0': 'To Do',
    'notstarted': 'To Do',
    'not started': 'To Do',
    'not-started': 'To Do',
    'not_started': 'To Do',
    'todo': 'To Do',
    'to do': 'To Do',
    'to-do': 'To Do',
    'to_do': 'To Do',
    'backlog': 'To Do',

    // 1 / In Progress
    '1': 'In Progress',
    'inprogress': 'In Progress',
    'in progress': 'In Progress',
    'in-progress': 'In Progress',
    'in_progress': 'In Progress',

    // 2 / Pending Review / DonePendingReview / In review
    '2': 'Pending Review',
    'donependingreview': 'Pending Review',
    'done pending review': 'Pending Review',
    'done/pending review': 'Pending Review',
    'done-pending-review': 'Pending Review',
    'done_pending_review': 'Pending Review',
    'pendingadminreview': 'Pending Review',
    'pending admin review': 'Pending Review',
    'pending-admin-review': 'Pending Review',
    'pending_admin_review': 'Pending Review',
    'pendingreview': 'Pending Review',
    'pending review': 'Pending Review',
    'pending-review': 'Pending Review',
    'pending_review': 'Pending Review',
    'inreview': 'Pending Review',
    'in review': 'Pending Review',
    'in-review': 'Pending Review',
    'in_review': 'Pending Review',

    // 3 / Completed
    '3': 'Completed',
    'completed': 'Completed',
    'done': 'Completed',

    // 4 / On Hold
    '4': 'On Hold',
    'onhold': 'On Hold',
    'on hold': 'On Hold',
    'on-hold': 'On Hold',
    'on_hold': 'On Hold',

    // 5 / Cancelled
    '5': 'Cancelled',
    'cancelled': 'Cancelled',
    'canceled': 'Cancelled',
    'cancel': 'Cancelled',

    // Overdue
    'overdue': 'Overdue',
};

/**
 * Badge CSS class mapping for standard status displays across STARS.
 */
export const STATUS_BADGE_CLASSES: Record<string, string> = {
    // Standard Task Statuses (Title Case)
    'To Do': 'badge badge-blue',
    'To do': 'badge badge-blue',
    'In Progress': 'badge badge-amber',
    'In progress': 'badge badge-amber',
    'On Hold': 'badge badge-amber',
    'On hold': 'badge badge-amber',
    'on-hold': 'badge badge-amber',
    'Pending Review': 'badge badge-purple',
    'In review': 'badge badge-purple',
    'Done/Pending Review': 'badge badge-purple',
    'Pending Admin Review': 'badge badge-purple',
    Completed: 'badge badge-green',
    Cancelled: 'badge badge-gray',
    Canceled: 'badge badge-gray',
    Overdue: 'badge badge-red',

    // Other Task/Lifecycle Statuses
    Draft: 'badge badge-gray',
    Pending: 'badge badge-blue',
    Assigned: 'badge badge-purple',
    'Not Started': 'badge badge-purple',
    Done: 'badge badge-green',
    Backlog: 'badge badge-gray',

    // Account & System Statuses
    Active: 'status-badge active',
    Inactive: 'status-badge inactive',
    inactive: 'status-badge inactive',
    'Pending Verification': 'status-badge inactive',
    Deactivated: 'status-badge deactivated',
    'On Leave': 'status-badge pending-badge',
    Locked: 'status-badge locked',
    Successful: 'status-badge active',
    Failed: 'status-badge deactivated',
    Approved: 'badge badge-green',
    Rejected: 'badge badge-red',

    // Employment / Role Statuses
    'Interview Scheduled': 'badge badge-purple',
    'Job Offered': 'badge badge-green',
    Regular: 'badge badge-green',
    Probationary: 'badge badge-amber',
    Contractual: 'badge badge-blue',
    'Part-time': 'badge badge-gray',
    Archived: 'badge badge-gray',
    Verified: 'badge badge-green',
    Unverified: 'badge badge-red',
    Synced: 'badge badge-green',
    'Pending Sync': 'badge badge-amber',

    // Priority Statuses
    Urgent: 'badge badge-urgent',
    'Urgent Alert': 'badge badge-urgent',
    High: 'badge badge-red',
    Medium: 'badge badge-amber',
    Low: 'badge badge-green',

    // Delivery Statuses (from DesignSystem.tsx)
    Processing: 'badge badge-blue',
    Preparing: 'badge badge-blue',
    'Ready for Pickup': 'badge badge-purple',
    'In Transit': 'badge badge-blue',
    'Out for Delivery': 'badge badge-blue',
    Delivered: 'badge badge-green',
    'Picked Up': 'badge badge-blue',
    Returning: 'badge badge-amber',
    Returned: 'badge badge-gray',

    // Account/System / Other (from DesignSystem.tsx)
    New: 'badge badge-blue',
    Alert: 'badge badge-red',
    System: 'badge badge-purple',
    Custom: 'badge badge-blue',
    Success: 'badge badge-green',
    Excellent: 'badge badge-green',
    Submitted: 'badge badge-green',
    'Not Submitted': 'badge badge-amber',
    'No POT': 'badge badge-gray',
};

/**
 * Converts a string into Title Case (e.g., "in progress" -> "In Progress", "on-hold" -> "On Hold").
 */
export function toTitleCase(input?: string | null): string {
    if (!input) return '';
    return input
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Formats any raw status input (number, enum, or string) into a canonical Title Case task status.
 * Defaults to 'To Do' if input is null, undefined, or empty.
 */
export function formatTaskStatus(status?: string | number | null): TaskStatusDisplay {
    if (status === undefined || status === null || String(status).trim() === '') {
        return 'To Do';
    }
    const str = String(status).trim();
    const normalized = str.toLowerCase();
    if (TASK_STATUS_MAP[normalized]) {
        return TASK_STATUS_MAP[normalized];
    }
    return 'To Do';
}

/**
 * Centralized status formatting helper.
 * If the input maps to a known task status, returns the canonical Title Case task status.
 * If input is an account, system, or other status string, normalizes or preserves its Title Case representation.
 */
export function formatStatus(status?: string | number | null): string {
    if (status === undefined || status === null) return '';
    const str = String(status).trim();
    if (!str) return '';

    const normalized = str.toLowerCase();
    if (TASK_STATUS_MAP[normalized]) {
        return TASK_STATUS_MAP[normalized];
    }

    // Preserve mixed/Title Case strings (e.g., 'Active', 'Interview Scheduled', 'No POT')
    if (/[A-Z]/.test(str) && !/^[A-Z_]+$/.test(str)) {
        return str;
    }

    return toTitleCase(str);
}

/**
 * Returns the appropriate badge CSS class for a given raw or formatted status.
 */
export function getStatusBadgeClass(status?: string | number | null): string {
    const formatted = formatStatus(status);
    return STATUS_BADGE_CLASSES[formatted] ?? STATUS_BADGE_CLASSES[String(status ?? '')] ?? 'badge badge-blue';
}

