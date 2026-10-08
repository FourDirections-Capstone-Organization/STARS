import { ReactNode } from 'react';

interface StatusBadgeProps {
    status: string;
    size?: 'sm' | 'md';
    className?: string;
    icon?: ReactNode;
}

const BADGE_CLASSES: Record<string, string> = {
    Draft: 'badge badge-gray',
    Pending: 'badge badge-blue',
    Assigned: 'badge badge-purple',
    'Not Started': 'badge badge-purple',
    'In Progress': 'badge badge-amber',
    Done: 'badge badge-blue',
    'Pending Admin Review': 'badge badge-purple',
    'Done/Pending Review': 'badge badge-purple',
    Completed: 'badge badge-green',
    'On Hold': 'badge badge-amber',
    'On hold': 'badge badge-amber',
    'on-hold': 'badge badge-amber',
    Cancelled: 'badge badge-gray',
    Overdue: 'badge badge-red',
    Active: 'status-badge active',
    Deactivated: 'status-badge deactivated',
    'On Leave': 'status-badge pending-badge',
    Locked: 'status-badge locked',
    Successful: 'status-badge active',
    Failed: 'status-badge deactivated',
    Approved: 'badge badge-green',
    Rejected: 'badge badge-red',
    'Pending Review': 'badge badge-amber',
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
    Urgent: 'badge badge-red',
    High: 'badge badge-red',
    Medium: 'badge badge-amber',
    Low: 'badge badge-green',
    Backlog: 'badge badge-gray',
    'To do': 'badge badge-blue',
    'In progress': 'badge badge-amber',
    'In review': 'badge badge-purple',
};

export default function StatusBadge({ status, size = 'md', className = '', icon }: StatusBadgeProps) {
    const cls = BADGE_CLASSES[status] ?? 'badge badge-blue';
    const style = size === 'sm' ? { fontSize: '0.65rem', padding: '1px 8px' } : undefined;
    return (
        <span className={`${cls} ${className}`} style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: icon ? 4 : undefined }}>
            {icon}{status}
        </span>
    );
}
