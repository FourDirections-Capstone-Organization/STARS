import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, {
    TaskViewTask,
    parseDmsFollowUp,
    isDateAfterToday,
    getTomorrowDateStr,
} from '../components/TaskView/TaskView';
import TaskComments, {
    parseFailureFollowUpComment,
    parseRecipientRedeliveryRequestComment,
    parseReturnToSenderComment,
    parseCoordinatorDecisionComment,
} from '../components/TaskComments/TaskComments';

// Mock api
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
        post: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
        patch: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
        upload: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
    },
}));

import api from '../api';

// Mock Toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: mockToastSuccess,
        error: mockToastError,
        info: vi.fn(),
        warning: vi.fn(),
    }),
}));

describe('STARS ↔ DMS Integration 4: Redelivery Decision Action & Failure Timeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('employeeName', 'Coordinator Juan Cruz');
    });

    const mockFollowUpTask: TaskViewTask = {
        taskId: 'task-followup-wb-001',
        taskTitle: 'Delivery Follow-up - WB-2026-000001',
        taskDescription:
            'Follow-up required for Failed Delivery on Waybill WB-2026-000001.\n' +
            'Original Task: Rush Document Dispatch (orig-1111)\n' +
            'Failure Reason: Customer Unreachable\n' +
            'Attempt Count: 1\n' +
            'Driver: Juan Dela Cruz (DRV-001)\n\n' +
            'Action Required: Contact client to arrange next attempt or return to sender in DMS.',
        priority: 'High',
        dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        taskStatus: 'Not Started',
        assignedEmployee: 'Coordinator Juan Cruz',
        createdByEmployee: 'DMS M2M Gateway',
        assignedTo: 'coord-user-001',
        createdAt: new Date().toISOString(),
        assignees: [
            {
                fullName: 'Coordinator Juan Cruz',
                completionPercentage: 0,
            },
        ],
    };

    const mockAttempt3Task: TaskViewTask = {
        taskId: 'task-followup-wb-003',
        taskTitle: 'Delivery Follow-up - WB-2026-000001',
        taskDescription:
            'Follow-up required for Failed Delivery on Waybill WB-2026-000001.\n' +
            'Original Task: Rush Document Dispatch (orig-1111)\n' +
            'Failure Reason: Consignee Refused Delivery\n' +
            'Attempt Count: 3\n' +
            'Driver: Juan Dela Cruz (DRV-001)\n\n' +
            '[Return to Sender] Attempt #3 reached maximum failure limit. Redelivery prohibited. Result set to Return to Sender in DMS.',
        priority: 'Urgent',
        dueAt: new Date().toISOString(),
        taskStatus: 'Completed',
        assignedEmployee: 'Coordinator Juan Cruz',
        createdByEmployee: 'DMS M2M Gateway',
        assignedTo: 'coord-user-001',
        createdAt: new Date().toISOString(),
        assignees: [
            {
                fullName: 'Coordinator Juan Cruz',
                completionPercentage: 100,
            },
        ],
    };

    describe('1. Date Validation Utilities (isDateAfterToday & getTomorrowDateStr)', () => {
        it('correctly identifies whether a selected date is strictly after today', () => {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;

            // Today should return false
            expect(isDateAfterToday(todayStr)).toBe(false);

            // Yesterday should return false
            const yesterday = new Date(Date.now() - 86400000);
            const yYesterday = yesterday.getFullYear();
            const mYesterday = String(yesterday.getMonth() + 1).padStart(2, '0');
            const dYesterday = String(yesterday.getDate()).padStart(2, '0');
            expect(isDateAfterToday(`${yYesterday}-${mYesterday}-${dYesterday}`)).toBe(false);

            // Tomorrow should return true
            const tomorrowStr = getTomorrowDateStr();
            expect(isDateAfterToday(tomorrowStr)).toBe(true);

            // Future date should return true
            expect(isDateAfterToday('2099-12-31')).toBe(true);

            // Empty or invalid string should return false
            expect(isDateAfterToday('')).toBe(false);
            expect(isDateAfterToday('invalid-date')).toBe(false);
        });

        it('returns tomorrow date in YYYY-MM-DD format', () => {
            const tomorrowStr = getTomorrowDateStr();
            expect(tomorrowStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(isDateAfterToday(tomorrowStr)).toBe(true);
        });
    });

    describe('2. Coordinator Redelivery Decision Action (Resolve Follow-up Card)', () => {
        it('renders Resolve Follow-up card with 3 decision options when viewing follow-up task', () => {
            render(<TaskView task={mockFollowUpTask} />);

            // Check Resolve Follow-up card exists
            const resolveCard = screen.getByTestId('tv-dms-resolve-card');
            expect(resolveCard).toBeInTheDocument();
            expect(screen.getByText('Resolve Follow-up')).toBeInTheDocument();
            expect(screen.getByText('Coordinator Decision')).toBeInTheDocument();

            // Check 3 options exist
            expect(screen.getByTestId('decision-option-approve')).toBeInTheDocument();
            expect(screen.getByTestId('decision-option-reject')).toBeInTheDocument();
            expect(screen.getByTestId('decision-option-rts')).toBeInTheDocument();

            expect(screen.getByText('Approve Redelivery')).toBeInTheDocument();
            expect(screen.getByText('Reject Redelivery')).toBeInTheDocument();
            expect(screen.getByText('Return to Sender')).toBeInTheDocument();
        });

        it('disables date selection of today or past dates via min attribute and validates date boundary on submit', async () => {
            render(<TaskView task={mockFollowUpTask} />);

            const approveBtn = screen.getByTestId('decision-option-approve');
            fireEvent.click(approveBtn);

            const datePicker = screen.getByTestId('redelivery-date-picker') as HTMLInputElement;
            expect(datePicker).toBeInTheDocument();

            // Verify min attribute is set to tomorrow's date
            const tomorrowStr = getTomorrowDateStr();
            expect(datePicker.getAttribute('min')).toBe(tomorrowStr);

            // Try submitting without date
            const submitBtn = screen.getByTestId('submit-decision-btn');
            fireEvent.click(submitBtn);

            // Should show validation error
            expect(screen.getByTestId('decision-error-message')).toHaveTextContent(/Please select a scheduled redelivery date/i);
            expect(api.post).not.toHaveBeenCalled();

            // Try submitting with today's date
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            fireEvent.change(datePicker, { target: { value: todayStr } });
            fireEvent.click(submitBtn);

            expect(screen.getByTestId('decision-error-message')).toHaveTextContent(/must be strictly after today/i);
            expect(api.post).not.toHaveBeenCalled();
        });

        it('submits Option 1: Approve Redelivery with date > today and valid payload', async () => {
            (api.post as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        waybillNo: 'WB-2026-000001',
                        decision: 'Approved',
                        redeliveryDate: '2026-11-27',
                        approver: 'Coordinator Juan Cruz',
                        dmsNotified: true,
                    },
                },
            });

            render(<TaskView task={mockFollowUpTask} />);

            // Select Approve Redelivery
            fireEvent.click(screen.getByTestId('decision-option-approve'));

            // Set date to 2099-11-27 (strictly after today)
            const datePicker = screen.getByTestId('redelivery-date-picker');
            fireEvent.change(datePicker, { target: { value: '2099-11-27' } });

            // Set remarks
            const remarksInput = screen.getByTestId('decision-remarks-input');
            fireEvent.change(remarksInput, { target: { value: 'Client confirmed available Friday afternoon' } });

            // Submit
            const submitBtn = screen.getByTestId('submit-decision-btn');
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/integration/dms/redelivery-decision',
                    {
                        waybillNo: 'WB-2026-000001',
                        decision: 'Approved',
                        redeliveryDate: '2099-11-27',
                        approver: 'Coordinator Juan Cruz',
                        remarks: 'Client confirmed available Friday afternoon',
                    }
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining("Redelivery decision 'Approved' processed and dispatched to DMS.")
            );
        });

        it('submits Option 2: Reject Redelivery with valid payload and updates task status', async () => {
            (api.post as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        waybillNo: 'WB-2026-000001',
                        decision: 'Rejected',
                        approver: 'Coordinator Juan Cruz',
                        dmsNotified: true,
                    },
                },
            });

            const onUpdateMock = vi.fn();
            render(<TaskView task={mockFollowUpTask} onUpdate={onUpdateMock} />);

            // Click Reject Redelivery
            fireEvent.click(screen.getByTestId('decision-option-reject'));

            // Redelivery date picker should not be shown for Reject
            expect(screen.queryByTestId('redelivery-date-picker')).not.toBeInTheDocument();

            // Set remarks
            const remarksInput = screen.getByTestId('decision-remarks-input');
            fireEvent.change(remarksInput, { target: { value: 'Client address out of reachable delivery coverage' } });

            // Submit
            fireEvent.click(screen.getByTestId('submit-decision-btn'));

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/integration/dms/redelivery-decision',
                    {
                        waybillNo: 'WB-2026-000001',
                        decision: 'Rejected',
                        approver: 'Coordinator Juan Cruz',
                        remarks: 'Client address out of reachable delivery coverage',
                    }
                );
            });

            expect(onUpdateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskId: 'task-followup-wb-001',
                    taskStatus: 'Completed',
                })
            );
        });

        it('submits Option 3: Return to Sender with valid payload and updates task status', async () => {
            (api.post as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        waybillNo: 'WB-2026-000001',
                        decision: 'Return to Sender',
                        approver: 'Coordinator Juan Cruz',
                        dmsNotified: true,
                    },
                },
            });

            const onUpdateMock = vi.fn();
            render(<TaskView task={mockFollowUpTask} onUpdate={onUpdateMock} />);

            // Click Return to Sender
            fireEvent.click(screen.getByTestId('decision-option-rts'));

            // Redelivery date picker should not be shown for Return to Sender
            expect(screen.queryByTestId('redelivery-date-picker')).not.toBeInTheDocument();

            // Set remarks
            const remarksInput = screen.getByTestId('decision-remarks-input');
            fireEvent.change(remarksInput, { target: { value: 'Customer requested package return' } });

            // Submit
            fireEvent.click(screen.getByTestId('submit-decision-btn'));

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/integration/dms/redelivery-decision',
                    {
                        waybillNo: 'WB-2026-000001',
                        decision: 'Return to Sender',
                        approver: 'Coordinator Juan Cruz',
                        remarks: 'Customer requested package return',
                    }
                );
            });

            expect(onUpdateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskId: 'task-followup-wb-001',
                    taskStatus: 'Completed',
                })
            );
        });
    });

    describe('3. Attempt Count >= 3 Prohibition & Timeline Display', () => {
        it('displays exact Return to Sender warning string when Attempt Count >= 3 and disables Approve option', () => {
            render(<TaskView task={mockAttempt3Task} />);

            // Expected exact string from Section B:
            // "[Return to Sender] Attempt #3 reached maximum failure limit. Redelivery prohibited. Result set to Return to Sender in DMS."
            const rtsAlert = screen.getByTestId('tv-dms-rts-alert');
            expect(rtsAlert).toBeInTheDocument();
            expect(rtsAlert).toHaveTextContent(
                '[Return to Sender] Attempt #3 reached maximum failure limit. Redelivery prohibited. Result set to Return to Sender in DMS.'
            );

            // In Resolve Follow-up card: Approve Redelivery must be disabled
            const approveBtn = screen.getByTestId('decision-option-approve');
            expect(approveBtn).toBeDisabled();

            // Notice about redelivery prohibition is visible
            expect(screen.getByTestId('resolve-rts-prohibited-notice')).toHaveTextContent(
                /Redelivery prohibited \(maximum failure limit reached: 3 attempts\)/i
            );

            // Default option is Return to Sender
            expect(screen.getByTestId('decision-option-rts')).toHaveClass('active-rts');
        });

        it('renders Failure Timeline displaying progression of failure and redelivery events', () => {
            render(<TaskView task={mockFollowUpTask} />);

            const timeline = screen.getByTestId('tv-dms-timeline');
            expect(timeline).toBeInTheDocument();
            expect(screen.getByText('Failure & Redelivery Timeline')).toBeInTheDocument();

            // Initial failure event
            expect(screen.getByText('Initial Failure Follow-up Logged')).toBeInTheDocument();
            expect(screen.getAllByText(/Customer Unreachable/i).length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText(/Juan Dela Cruz \(DRV-001\)/i).length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('4. TaskComments Audit Remarks Parsing & Rendering', () => {
        it('correctly parses and renders Recipient Redelivery Request remark card', async () => {
            const comment = '[Recipient Redelivery Request Received] Requested Date: 2026-11-27. Contact: 0917-555-0199. Remarks: Afternoon delivery.';
            const parsed = parseRecipientRedeliveryRequestComment(comment);

            expect(parsed).not.toBeNull();
            expect(parsed?.isRecipientRequest).toBe(true);
            expect(parsed?.requestedDate).toBe('2026-11-27');
            expect(parsed?.contact).toBe('0917-555-0199');
            expect(parsed?.remarks).toBe('Afternoon delivery.');

            // Render in TaskComments
            (api.get as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        items: [
                            {
                                id: 'comm-rec-01',
                                taskId: 'task-001',
                                authorName: 'Recipient Portal',
                                content: comment,
                                createdAt: new Date().toISOString(),
                            },
                        ],
                    },
                },
            });

            render(<TaskComments taskId="task-001" currentEmployeeId="coord-01" />);

            await waitFor(() => {
                expect(screen.getByTestId('tc-recipient-request-remark')).toBeInTheDocument();
            });

            expect(screen.getByText('Recipient Redelivery Request Received')).toBeInTheDocument();
            expect(screen.getAllByText(/2026-11-27/).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('Afternoon delivery.')).toBeInTheDocument();
            expect(screen.getAllByText(/0917-555-0199/i).length).toBeGreaterThanOrEqual(1);
        });

        it('correctly parses and renders Return to Sender terminal remark card', async () => {
            const comment = '[Return to Sender] Attempt #3 reached maximum failure limit. Redelivery prohibited. Result set to Return to Sender in DMS.';
            const parsed = parseReturnToSenderComment(comment);

            expect(parsed).not.toBeNull();
            expect(parsed?.isReturnToSender).toBe(true);
            expect(parsed?.attemptCount).toBe(3);
            expect(parsed?.message).toContain('Attempt #3 reached maximum failure limit');

            // Render in TaskComments
            (api.get as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        items: [
                            {
                                id: 'comm-rts-01',
                                taskId: 'task-001',
                                authorName: 'DMS Gateway',
                                content: comment,
                                createdAt: new Date().toISOString(),
                            },
                        ],
                    },
                },
            });

            render(<TaskComments taskId="task-001" currentEmployeeId="coord-01" />);

            await waitFor(() => {
                expect(screen.getByTestId('tc-return-to-sender-remark')).toBeInTheDocument();
            });

            expect(screen.getByText('Terminal Exception: Redelivery Prohibited')).toBeInTheDocument();
            expect(screen.getAllByText(comment).length).toBeGreaterThanOrEqual(1);
        });

        it('correctly parses and renders Coordinator Decision remark card', async () => {
            const comment = '[Coordinator Decision: Approved] Recorded by Coordinator Juan Cruz. Scheduled Date: 2026-11-27. Remarks: Client confirmed available Friday afternoon';
            const parsed = parseCoordinatorDecisionComment(comment);

            expect(parsed).not.toBeNull();
            expect(parsed?.isCoordinatorDecision).toBe(true);
            expect(parsed?.decision).toBe('Approved');
            expect(parsed?.approver).toBe('Coordinator Juan Cruz');
            expect(parsed?.scheduledDate).toBe('2026-11-27');
            expect(parsed?.remarks).toBe('Client confirmed available Friday afternoon');

            // Render in TaskComments
            (api.get as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: {
                        items: [
                            {
                                id: 'comm-coord-01',
                                taskId: 'task-001',
                                authorName: 'Coordinator Juan Cruz',
                                content: comment,
                                createdAt: new Date().toISOString(),
                            },
                        ],
                    },
                },
            });

            render(<TaskComments taskId="task-001" currentEmployeeId="coord-01" />);

            await waitFor(() => {
                expect(screen.getByTestId('tc-coordinator-decision-remark')).toBeInTheDocument();
            });

            expect(screen.getByText('Decision: Approved')).toBeInTheDocument();
            expect(screen.getByText('Coordinator Review Recorded: Approved')).toBeInTheDocument();
            expect(screen.getByText('Date: 2026-11-27')).toBeInTheDocument();
            expect(screen.getByText('Client confirmed available Friday afternoon')).toBeInTheDocument();
            expect(screen.getByText('Coordinator Juan Cruz')).toBeInTheDocument();
        });
    });
});
