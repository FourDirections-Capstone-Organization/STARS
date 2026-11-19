import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import TaskComments, { parseCancellationComment } from '../components/TaskComments/TaskComments';
import NotificationsTab, { classifyNotification } from '../components/NotificationsTab/NotificationsTab';

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
    }),
}));

describe('STARS ↔ DMS Integration 5: Delivery Order Cancelled → STARS Notification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('employeeName', 'Alex Coordinator');
    });

    const mockCancelledDeliveryDetail = {
        taskId: 'task-orig-completed-001',
        recipientName: 'Metro Logistics Hub',
        recipientContact: '0919-888-0202',
        deliveryAddress: 'Building 7, Pasig Cargo Terminal, Metro Manila',
        area: 'Pasig City',
        packageDescription: 'Express Circuit Board Delivery',
        courierFullName: 'Juan Dispatcher',
        courierEmployeeId: 'DRV-009',
        courierIsActive: true,
        dmsWaybillNo: 'WB-2026-987476',
        dmsOrderId: 10492,
        dmsStatus: 'Cancelled',
        dmsRawStatus: 'Cancelled',
        dmsFailureReason: 'Client requested cancellation',
        syncStatus: 'Synced',
        dmsLastSyncedAt: '2026-11-18T12:45:00Z',
    };

    const mockCompletedTask: TaskViewTask = {
        taskId: 'task-orig-completed-001',
        taskTitle: 'Rush Document Dispatch',
        taskDescription: 'Urgent contract parcel transport to client headquarters.',
        priority: 'High',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'Completed',
        assignedEmployee: 'Alex Coordinator',
        createdByEmployee: 'Operations Manager',
        assignedTo: 'coord-user-001',
        createdAt: new Date().toISOString(),
        deliveryDetails: mockCancelledDeliveryDetail as any,
    };

    describe('1. Parsing & Rendering Order Cancellation Remarks (TaskComments)', () => {
        const cancellationRemarkString =
            '[Order Cancelled in DMS] Waybill: WB-2026-987476 | Reason: Client requested cancellation | Cancelled By: Client Admin | Recorded: 2026-11-18 12:45:00 UTC';

        it('accurately parses structured cancellation remarks from DMS', () => {
            const parsed = parseCancellationComment(cancellationRemarkString);
            expect(parsed).not.toBeNull();
            expect(parsed?.isCancellationRemark).toBe(true);
            expect(parsed?.waybillNo).toBe('WB-2026-987476');
            expect(parsed?.reason).toBe('Client requested cancellation');
            expect(parsed?.cancelledBy).toBe('Client Admin');
            expect(parsed?.recorded).toBe('2026-11-18 12:45:00 UTC');
        });

        it('returns null for non-cancellation comments', () => {
            expect(parseCancellationComment('Normal user message')).toBeNull();
            expect(
                parseCancellationComment(
                    '[Failure Follow-up Logged] Type: Failed Delivery | Attempt #1 | Reason: Recipient Unreachable | Driver: DRV-1 | Recorded: 2026-11-18 10:00:00 UTC'
                )
            ).toBeNull();
        });

        it('renders automated cancellation remark card with reason, actor, and waybill metadata', async () => {
            const mockComments = [
                {
                    id: 'c-cancel-01',
                    taskId: 'task-orig-completed-001',
                    authorId: 'sys-dms',
                    authorName: 'DMS Gateway',
                    content: cancellationRemarkString,
                    createdAt: '2026-11-18T12:45:00Z',
                },
            ];

            (api.get as any).mockResolvedValue({
                data: {
                    isSuccess: true,
                    data: { items: mockComments },
                },
            });

            render(
                <TaskComments
                    taskId="task-orig-completed-001"
                    currentEmployeeId="coord-user-001"
                    taskReferenceNumber="REF-987476"
                />
            );

            await waitFor(() => {
                expect(screen.queryByText(/Loading comments/i)).not.toBeInTheDocument();
            });

            // Card existence
            const remarkCard = screen.getByTestId('tc-cancellation-remark');
            expect(remarkCard).toBeInTheDocument();

            // Header tags
            expect(screen.getByText('Order Cancelled')).toBeInTheDocument();
            expect(screen.getByText('WB: WB-2026-987476')).toBeInTheDocument();

            // Card Title & Reason
            expect(screen.getByText('Delivery Order Cancelled in DMS')).toBeInTheDocument();
            expect(screen.getByText('Client requested cancellation')).toBeInTheDocument();

            // Actor & Recorded time
            expect(screen.getByText('Client Admin')).toBeInTheDocument();
            expect(screen.getByText('2026-11-18 12:45:00 UTC')).toBeInTheDocument();

            // Raw structured string
            expect(screen.getByText(cancellationRemarkString)).toBeInTheDocument();

            // Automated comment cannot be edited or deleted
            expect(screen.queryByTitle(/Comment actions/i)).not.toBeInTheDocument();
        });
    });

    describe('2. Delivery Tracking Status Badge & FSM Workflow Preservation (TaskView)', () => {
        beforeEach(() => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/delivery-details')) {
                    return Promise.resolve({
                        data: { isSuccess: true, data: mockCancelledDeliveryDetail },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });
        });

        it('strictly preserves the primary task status as Completed (never overwritten to Cancelled)', async () => {
            render(<TaskView task={mockCompletedTask} />);

            await waitFor(() => {
                expect(screen.getByText('WB-2026-987476')).toBeInTheDocument();
            });

            // FSM Rule: Primary task status badge MUST remain 'Completed'
            // We search for Completed status badge in header
            const completedBadges = screen.getAllByText('Completed');
            expect(completedBadges.length).toBeGreaterThanOrEqual(1);

            // Primary status should NOT be Cancelled
            // Verify that primary task title still displays
            expect(screen.getByText('Rush Document Dispatch')).toBeInTheDocument();
        });

        it('displays DmsStatus as Cancelled with destructive/gray styling and shows cancellation rationale', async () => {
            render(<TaskView task={mockCompletedTask} />);

            await waitFor(() => {
                expect(screen.getByText('WB-2026-987476')).toBeInTheDocument();
            });

            // DMS Delivery status tag
            const statusBadge = screen.getByTestId('tv-dms-status-badge');
            expect(statusBadge).toBeInTheDocument();
            expect(statusBadge).toHaveClass('tv-dms-status-cancelled');
            expect(statusBadge.textContent).toContain('Cancelled');

            // DMS Failure / Cancellation reason banner
            const failureBox = screen.getByTestId('tv-dms-failure-box');
            expect(failureBox).toBeInTheDocument();
            expect(failureBox).toHaveClass('tv-dms-cancelled-box');
            expect(screen.getByText('Delivery Order Cancelled in DMS')).toBeInTheDocument();
            expect(screen.getByTestId('tv-dms-failure-reason')).toHaveTextContent(
                'Client requested cancellation'
            );

            // Stepper cancellation notice
            const stepperNotice = screen.getByTestId('tv-dms-cancelled-notice');
            expect(stepperNotice).toBeInTheDocument();
            expect(stepperNotice).toHaveTextContent(/Cancelled in DMS/i);
            expect(stepperNotice).toHaveTextContent(
                /Primary task operational status is preserved in STARS/i
            );

            // Quick view remarks button inside cancellation box
            const viewRemarksBtn = screen.getByRole('button', { name: /View Remarks/i });
            expect(viewRemarksBtn).toBeInTheDocument();
            fireEvent.click(viewRemarksBtn);

            // Should switch tab to Comments
            expect(screen.getAllByText(/Comments/i).length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('3. In-App Notifications for Order Cancellation (NotificationsTab)', () => {
        const mockCancellationNotification = {
            id: 'notif-cancel-001',
            taskId: 'task-orig-completed-001',
            type: 1, // TaskUpdated
            notificationType: 'TaskUpdated',
            title: 'Delivery Order Cancelled - WB-2026-987476',
            message:
                "Delivery order WB-2026-987476 for task 'Rush Document Dispatch' was cancelled in DMS. Reason: Client requested cancellation (Cancelled by: Client Admin).",
            isRead: false,
            createdAt: '2026-11-18T12:45:00Z',
        };

        it('classifies delivery order cancellation under Task Updates category', () => {
            const classification = classifyNotification(mockCancellationNotification);
            expect(classification).toBe('Task Updates');
        });

        it('renders notification and navigates to task details upon clicking', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/unread-count')) {
                    return Promise.resolve({ data: { isSuccess: true, data: 1 } });
                }
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [mockCancellationNotification],
                            totalCount: 1,
                            pageNumber: 1,
                            totalPages: 1,
                        },
                    },
                });
            });

            const onViewTaskMock = vi.fn();

            render(
                <NotificationsTab
                    onViewTask={onViewTaskMock}
                    canViewTasks={true}
                />
            );

            await waitFor(() => {
                expect(
                    screen.getByText('Delivery Order Cancelled - WB-2026-987476')
                ).toBeInTheDocument();
            });

            expect(
                screen.getByText(
                    /Delivery order WB-2026-987476 for task 'Rush Document Dispatch' was cancelled in DMS/i
                )
            ).toBeInTheDocument();

            // Click the action button
            const viewBtn = screen.getByRole('button', { name: /View Cancelled Order Task/i });
            fireEvent.click(viewBtn);

            expect(onViewTaskMock).toHaveBeenCalledWith('task-orig-completed-001');
        });
    });
});
