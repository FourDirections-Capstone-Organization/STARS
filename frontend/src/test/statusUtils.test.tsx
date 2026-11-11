import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    formatTaskStatus,
    formatStatus,
    getStatusBadgeClass,
    toTitleCase,
    TASK_STATUS_MAP,
} from '../utils/statusUtils';
import StatusBadge from '../components/ui/StatusBadge';

describe('statusUtils — Centralized Status Label Mapping', () => {
    describe('Title Case display outputs for all raw task status inputs', () => {
        it('maps all raw inputs for "To Do" correctly', () => {
            const rawInputs = [
                0,
                '0',
                'NotStarted',
                'notstarted',
                'Not Started',
                'not started',
                'not-started',
                'not_started',
                'todo',
                'to do',
                'to-do',
                'to_do',
                'To do',
                'To Do',
                'TODO',
                'TO DO',
                'backlog',
                'Backlog',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('To Do');
                expect(formatStatus(input)).toBe('To Do');
            });
        });

        it('maps all raw inputs for "In Progress" correctly', () => {
            const rawInputs = [
                1,
                '1',
                'InProgress',
                'inprogress',
                'In Progress',
                'in progress',
                'in-progress',
                'in_progress',
                'In progress',
                'IN_PROGRESS',
                'IN PROGRESS',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('In Progress');
                expect(formatStatus(input)).toBe('In Progress');
            });
        });

        it('maps all raw inputs for "Pending Review" correctly', () => {
            const rawInputs = [
                2,
                '2',
                'DonePendingReview',
                'donependingreview',
                'Done Pending Review',
                'done pending review',
                'Done/Pending Review',
                'done/pending review',
                'done-pending-review',
                'done_pending_review',
                'PendingAdminReview',
                'pendingadminreview',
                'Pending Admin Review',
                'pending admin review',
                'pending-admin-review',
                'pending_admin_review',
                'PendingReview',
                'pendingreview',
                'Pending Review',
                'pending review',
                'pending-review',
                'pending_review',
                'InReview',
                'inreview',
                'In Review',
                'in review',
                'in-review',
                'in_review',
                'Done',
                'done',
                'DONE',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('Pending Review');
                expect(formatStatus(input)).toBe('Pending Review');
            });
        });

        it('maps all raw inputs for "Completed" correctly', () => {
            const rawInputs = [
                3,
                '3',
                'Completed',
                'completed',
                'COMPLETED',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('Completed');
                expect(formatStatus(input)).toBe('Completed');
            });
        });

        it('maps all raw inputs for "On Hold" correctly', () => {
            const rawInputs = [
                4,
                '4',
                'OnHold',
                'onhold',
                'On Hold',
                'on hold',
                'on-hold',
                'on_hold',
                'On hold',
                'ON_HOLD',
                'ON HOLD',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('On Hold');
                expect(formatStatus(input)).toBe('On Hold');
            });
        });

        it('maps all raw inputs for "Cancelled" correctly', () => {
            const rawInputs = [
                5,
                '5',
                'Cancelled',
                'cancelled',
                'Canceled',
                'canceled',
                'CANCELLED',
                'CANCELED',
                'cancel',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('Cancelled');
                expect(formatStatus(input)).toBe('Cancelled');
            });
        });

        it('maps all raw inputs for "Overdue" correctly', () => {
            const rawInputs = [
                'Overdue',
                'overdue',
                'OVERDUE',
            ];

            rawInputs.forEach(input => {
                expect(formatTaskStatus(input)).toBe('Overdue');
                expect(formatStatus(input)).toBe('Overdue');
            });
        });
    });

    describe('Edge cases, null/undefined, and fallback handling', () => {
        it('formatTaskStatus defaults to "To Do" for null, undefined, and empty string', () => {
            expect(formatTaskStatus(null)).toBe('To Do');
            expect(formatTaskStatus(undefined)).toBe('To Do');
            expect(formatTaskStatus('')).toBe('To Do');
            expect(formatTaskStatus('   ')).toBe('To Do');
        });

        it('formatStatus returns empty string for null, undefined, or empty string', () => {
            expect(formatStatus(null)).toBe('');
            expect(formatStatus(undefined)).toBe('');
            expect(formatStatus('')).toBe('');
            expect(formatStatus('   ')).toBe('');
        });

        it('preserves or Title Cases non-task system and employee statuses', () => {
            expect(formatStatus('Active')).toBe('Active');
            expect(formatStatus('Inactive')).toBe('Inactive');
            expect(formatStatus('Draft')).toBe('Draft');
            expect(formatStatus('Assigned')).toBe('Assigned');
            expect(formatStatus('Interview Scheduled')).toBe('Interview Scheduled');
            expect(formatStatus('No POT')).toBe('No POT');
            expect(formatStatus('deactivated')).toBe('Deactivated');
            expect(formatStatus('part-time')).toBe('Part Time');
        });

        it('toTitleCase converts various casings accurately', () => {
            expect(toTitleCase('hello world')).toBe('Hello World');
            expect(toTitleCase('kebab-case-string')).toBe('Kebab Case String');
            expect(toTitleCase('snake_case_string')).toBe('Snake Case String');
            expect(toTitleCase('')).toBe('');
            expect(toTitleCase(null)).toBe('');
        });
    });

    describe('getStatusBadgeClass helper', () => {
        it('returns badge badge-blue for To Do and raw 0', () => {
            expect(getStatusBadgeClass('To Do')).toBe('badge badge-blue');
            expect(getStatusBadgeClass(0)).toBe('badge badge-blue');
            expect(getStatusBadgeClass('notstarted')).toBe('badge badge-blue');
        });

        it('returns badge badge-amber for In Progress and On Hold', () => {
            expect(getStatusBadgeClass('In Progress')).toBe('badge badge-amber');
            expect(getStatusBadgeClass(1)).toBe('badge badge-amber');
            expect(getStatusBadgeClass('On Hold')).toBe('badge badge-amber');
            expect(getStatusBadgeClass(4)).toBe('badge badge-amber');
        });

        it('returns badge badge-purple for Pending Review and raw 2', () => {
            expect(getStatusBadgeClass('Pending Review')).toBe('badge badge-purple');
            expect(getStatusBadgeClass(2)).toBe('badge badge-purple');
            expect(getStatusBadgeClass('DonePendingReview')).toBe('badge badge-purple');
        });

        it('returns badge badge-green for Completed and raw 3', () => {
            expect(getStatusBadgeClass('Completed')).toBe('badge badge-green');
            expect(getStatusBadgeClass(3)).toBe('badge badge-green');
        });

        it('returns badge badge-gray for Cancelled and raw 5', () => {
            expect(getStatusBadgeClass('Cancelled')).toBe('badge badge-gray');
            expect(getStatusBadgeClass(5)).toBe('badge badge-gray');
        });

        it('returns status-badge inactive for Inactive', () => {
            expect(getStatusBadgeClass('Inactive')).toBe('status-badge inactive');
        });

        it('returns status-badge active for Active', () => {
            expect(getStatusBadgeClass('Active')).toBe('status-badge active');
        });
    });
});

describe('StatusBadge Component with Centralized Mapping', () => {
    it('renders "To Do" with badge-blue for raw inputs (0, "0", "NotStarted", "To do")', () => {
        const { unmount } = render(<StatusBadge status={0} />);
        const badge1 = screen.getByText('To Do');
        expect(badge1).toHaveClass('badge-blue');
        unmount();

        render(<StatusBadge status="NotStarted" />);
        const badge2 = screen.getByText('To Do');
        expect(badge2).toHaveClass('badge-blue');
    });

    it('renders "In Progress" with badge-amber for raw inputs (1, "in-progress", "In progress")', () => {
        const { unmount } = render(<StatusBadge status={1} />);
        const badge1 = screen.getByText('In Progress');
        expect(badge1).toHaveClass('badge-amber');
        unmount();

        render(<StatusBadge status="in-progress" />);
        const badge2 = screen.getByText('In Progress');
        expect(badge2).toHaveClass('badge-amber');
    });

    it('renders "Pending Review" with badge-purple for raw inputs (2, "DonePendingReview", "In review", "Done")', () => {
        const { unmount } = render(<StatusBadge status={2} />);
        const badge1 = screen.getByText('Pending Review');
        expect(badge1).toHaveClass('badge-purple');
        unmount();

        render(<StatusBadge status="DonePendingReview" />);
        const badge2 = screen.getByText('Pending Review');
        expect(badge2).toHaveClass('badge-purple');
    });

    it('renders "Completed" with badge-green for raw inputs (3, "completed")', () => {
        const { unmount } = render(<StatusBadge status={3} />);
        const badge1 = screen.getByText('Completed');
        expect(badge1).toHaveClass('badge-green');
        unmount();

        render(<StatusBadge status="completed" />);
        const badge2 = screen.getByText('Completed');
        expect(badge2).toHaveClass('badge-green');
    });

    it('renders "On Hold" with badge-amber for raw inputs (4, "on-hold")', () => {
        const { unmount } = render(<StatusBadge status={4} />);
        const badge1 = screen.getByText('On Hold');
        expect(badge1).toHaveClass('badge-amber');
        unmount();

        render(<StatusBadge status="on-hold" />);
        const badge2 = screen.getByText('On Hold');
        expect(badge2).toHaveClass('badge-amber');
    });

    it('renders "Cancelled" with badge-gray for raw inputs (5, "cancelled", "canceled")', () => {
        const { unmount } = render(<StatusBadge status={5} />);
        const badge1 = screen.getByText('Cancelled');
        expect(badge1).toHaveClass('badge-gray');
        unmount();

        render(<StatusBadge status="canceled" />);
        const badge2 = screen.getByText('Cancelled');
        expect(badge2).toHaveClass('badge-gray');
    });

    it('renders non-task status like "Inactive" with status-badge inactive class', () => {
        const { container } = render(<StatusBadge status="Inactive" />);
        const badge = container.querySelector('.status-badge.inactive');
        expect(badge).not.toBeNull();
        expect(badge?.textContent).toBe('Inactive');
    });

    it('applies small size styling when size="sm" is passed', () => {
        const { container } = render(<StatusBadge status="In Progress" size="sm" />);
        const span = container.querySelector('span');
        expect(span?.style.fontSize).toBe('0.65rem');
        expect(span?.style.padding).toBe('1px 8px');
    });

    it('renders custom icon alongside status text', () => {
        render(<StatusBadge status="Completed" icon={<span data-testid="test-icon">✓</span>} />);
        expect(screen.getByTestId('test-icon')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
    });
});

