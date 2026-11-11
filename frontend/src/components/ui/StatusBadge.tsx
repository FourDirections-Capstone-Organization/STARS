import { ReactNode } from 'react';
import { formatStatus, STATUS_BADGE_CLASSES } from '../../utils/statusUtils';

export interface StatusBadgeProps {
    status?: string | number | null;
    size?: 'sm' | 'md';
    className?: string;
    icon?: ReactNode;
}

export const BADGE_CLASSES: Record<string, string> = STATUS_BADGE_CLASSES;

export default function StatusBadge({ status, size = 'md', className = '', icon }: StatusBadgeProps) {
    const rawStr = status !== undefined && status !== null ? String(status) : '';
    const formatted = formatStatus(status);
    const displayLabel = formatted || rawStr;
    const cls = BADGE_CLASSES[displayLabel] ?? BADGE_CLASSES[rawStr] ?? 'badge badge-blue';
    const style = size === 'sm' ? { fontSize: '0.65rem', padding: '1px 8px' } : undefined;

    return (
        <span className={`${cls} ${className}`} style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: icon ? 4 : undefined }}>
            {icon}{displayLabel}
        </span>
    );
}
