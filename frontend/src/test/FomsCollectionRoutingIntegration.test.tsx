import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CollectionAlertsView from '../components/FomsFinancialMetrics/CollectionAlertsView';
import CollectionFollowUpList from '../components/FomsFinancialMetrics/CollectionFollowUpList';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import TaskDetailModal from '../components/TaskDetailModal/TaskDetailModal';
import TaskComments, { parseFomsOverdueAlertComment } from '../components/TaskComments/TaskComments';
import NotificationsTab, { classifyNotification } from '../components/NotificationsTab/NotificationsTab';
import GlobalHeader, { NotificationItem } from '../components/GlobalHeader/GlobalHeader';
import api from '../api';

// Mock Recharts
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock api
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
        patch: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
        post: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
    },
}));

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

describe('Integration 3: Overdue Accounts Collection Routing (STARS Frontend)', () => {
    const mockAlerts = [
        {
            id: 'stars-task-col-01',
            invoiceNumber: 'INV-2026-9481',
            clientAccountId: 'CLI-TRANSPAC-02',
            clientName: 'Trans-Pacific Express Cargo',
            clientContactPerson: 'Victor Ramos',
            clientContactNumber: '09201234567',
            clientAddress: 'Km 18, West Service Road, Parañaque City',
            amountDue: 145000.0,
            dueDate: '2026-09-14T00:00:00Z',
            daysOverdue: 35,
            agingStatus: '31-60',
            alertTimestamp: new Date().toISOString(),
            remarks: 'Account severely overdue (35 days). Immediate field collection routing required.',
            starsTaskId: 'col-01',
            starsTaskNumber: 'TK-COLLECT-01',
            assignedCoordinatorName: 'Jane Coordinator',
            taskStatus: 'InProgress',
            priorityLevel: 'Urgent',
            workloadAtRouting: 2,
            routingStatus: 'Routed & Assigned',
        },
        {
            id: 'stars-task-col-02',
            invoiceNumber: 'INV-2026-9482',
            clientAccountId: 'CLI-HORIZON-01',
            clientName: 'Horizon Retail Holdings',
            clientContactPerson: 'Maria Santos',
            clientContactNumber: '09171234567',
            clientAddress: 'Bonifacio Global City, Taguig',
            amountDue: 45000.0,
            dueDate: '2026-10-10T00:00:00Z',
            daysOverdue: 10,
            agingStatus: '1-30',
            alertTimestamp: new Date().toISOString(),
            remarks: 'Standard overdue follow-up.',
            starsTaskId: 'col-02',
            starsTaskNumber: 'TK-COLLECT-02',
            assignedCoordinatorName: 'John Doe',
            taskStatus: 'InProgress',
            priorityLevel: 'High',
            workloadAtRouting: 3,
            routingStatus: 'Routed & Assigned',
        },
    ];

    const mockCollectionTask: TaskViewTask = {
        taskId: 'col-01',
        taskTitle: '[Collection Follow-up] Invoice INV-2026-9481 - Trans-Pacific Express Cargo',
        taskDescription:
            'Automated collection follow-up routed from FOMS.\n' +
            'Invoice: INV-2026-9481\n' +
            'Amount Due: ₱145,000.00\n' +
            'Aging: 31-60 (35 days overdue)\n' +
            'Due Date: 2026-09-14\n' +
            'Client Account: CLI-TRANSPAC-02 (Trans-Pacific Express Cargo)\n' +
            'Contact: Mr. Victor Ramos (09201234567)\n' +
            'Email: victor.ramos@transpacific.com\n' +
            'Address: Km 18, West Service Road, Parañaque City\n' +
            'Remarks: Account severely overdue (35 days). Immediate field collection routing required.',
        priority: 'Urgent',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'In Progress',
        assignedEmployee: 'Jane Coordinator',
        createdByEmployee: 'FOMS System Webhook',
        assignedTo: 'Jane Coordinator',
        createdAt: new Date().toISOString(),
        assignees: [
            {
                fullName: 'Jane Coordinator',
                completionPercentage: 20,
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/foms-integration/collection-alerts')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockAlerts,
                    },
                });
            }
            if (url.includes('/api/Task/col-01')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'col-01',
                            title: '[Collection Follow-up] Invoice INV-2026-9481 - Trans-Pacific Express Cargo',
                            description: mockCollectionTask.taskDescription,
                            priorityLevel: 3,
                            status: 1,
                            assignments: [{ assignedUser: { firstName: 'Jane', lastName: 'Coordinator' } }],
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
    });

    describe('1. CollectionFollowUpList & CollectionAlertsView', () => {
        it('fetches and renders collection follow-up tasks from /api/foms-integration/collection-alerts', async () => {
            render(<CollectionAlertsView />);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith('/api/foms-integration/collection-alerts');
            });

            // Verify KPI Stats
            expect(screen.getByTestId('kpi-total-alerts')).toHaveTextContent('2');
            expect(screen.getByTestId('kpi-urgent-alerts')).toHaveTextContent('1');

            // Verify Task Title Prefix
            expect(screen.getByText(/\[Collection Follow-up\] Invoice INV-2026-9481 - Trans-Pacific Express Cargo/i)).toBeInTheDocument();
            expect(screen.getByText(/\[Collection Follow-up\] Invoice INV-2026-9482 - Horizon Retail Holdings/i)).toBeInTheDocument();

            // Verify Urgent Priority Pill for >= 30 days overdue task
            const urgentPills = screen.getAllByTestId('foms-urgent-priority-pill');
            expect(urgentPills.length).toBeGreaterThanOrEqual(1);
            expect(urgentPills[0]).toHaveTextContent('Urgent');

            // Verify Coordinator Workload and routing
            expect(screen.getByText('Jane Coordinator')).toBeInTheDocument();
        });

        it('filters collection follow-up tasks by aging bracket', async () => {
            render(<CollectionFollowUpList alerts={mockAlerts} showFilters={true} />);

            expect(screen.getByTestId('collection-row-INV-2026-9481')).toBeInTheDocument();
            expect(screen.getByTestId('collection-row-INV-2026-9482')).toBeInTheDocument();

            // Filter to 31-60 days
            const select = screen.getByTestId('collection-aging-filter');
            fireEvent.change(select, { target: { value: '31_60' } });

            expect(screen.getByTestId('collection-row-INV-2026-9481')).toBeInTheDocument();
            expect(screen.queryByTestId('collection-row-INV-2026-9482')).not.toBeInTheDocument();
        });

        it('opens Outcome Submission Modal and enforces mandatory Promised Payment Date for "Promised to Pay"', async () => {
            render(<CollectionFollowUpList alerts={mockAlerts} showFilters={true} />);

            const recordBtn = screen.getByTestId('record-outcome-btn-INV-2026-9481');
            fireEvent.click(recordBtn);

            // Modal should be visible
            expect(screen.getByText(/Submit Collection Follow-up Outcome/i)).toBeInTheDocument();

            // Clear date to test validation
            const dateInput = screen.getByTestId('promised-date-input');
            fireEvent.change(dateInput, { target: { value: '' } });

            // Attempt submit
            const submitBtn = screen.getByTestId('submit-outcome-confirm-btn');
            fireEvent.click(submitBtn);

            expect(screen.getByText(/Promised payment date is required when outcome is Promised to Pay/i)).toBeInTheDocument();
            expect(api.post).not.toHaveBeenCalled();
        });

        it('successfully submits collection outcome via POST /api/foms-integration/tasks/{taskId}/collection-outcome', async () => {
            (api.post as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    message: 'Outcome recorded',
                },
            });

            render(<CollectionFollowUpList alerts={mockAlerts} showFilters={true} />);

            const recordBtn = screen.getByTestId('record-outcome-btn-INV-2026-9481');
            fireEvent.click(recordBtn);

            // Fill form
            const outcomeSelect = screen.getByTestId('outcome-type-select');
            fireEvent.change(outcomeSelect, { target: { value: 'Promised to Pay' } });

            const dateInput = screen.getByTestId('promised-date-input');
            fireEvent.change(dateInput, { target: { value: '2026-11-25' } });

            const actionInput = screen.getByTestId('action-taken-input');
            fireEvent.change(actionInput, { target: { value: 'Direct Phone Call with CFO' } });

            const notesInput = screen.getByTestId('outcome-notes-textarea');
            fireEvent.change(notesInput, { target: { value: 'CFO confirmed check dispatch by Wednesday morning.' } });

            const submitBtn = screen.getByTestId('submit-outcome-confirm-btn');
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/tasks/col-01/collection-outcome',
                    expect.objectContaining({
                        outcome: 'Promised to Pay',
                        actionTaken: 'Direct Phone Call with CFO',
                        notes: 'CFO confirmed check dispatch by Wednesday morning.',
                    })
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Collection outcome "Promised to Pay" recorded and dispatched')
            );
        });
    });

    describe('2. TaskView.tsx & TaskDetailModal.tsx', () => {
        it('displays task title prefix and Urgent Priority Pill in TaskView', () => {
            render(<TaskView task={mockCollectionTask} />);

            // Task title
            expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
                '[Collection Follow-up] Invoice INV-2026-9481 - Trans-Pacific Express Cargo'
            );

            // Urgent Priority Pill in meta chip and stats banner
            expect(screen.getByTestId('tv-urgent-priority-pill')).toHaveTextContent('Urgent');
            expect(screen.getByTestId('foms-urgent-priority-badge')).toHaveTextContent('Urgent');
        });

        it('opens Outcome Submission Modal in TaskView and submits outcome callback', async () => {
            (api.post as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    message: 'Outcome callback dispatched to FOMS',
                },
            });

            render(<TaskView task={mockCollectionTask} />);

            const recordOutcomeBtn = screen.getByTestId('tv-record-collection-outcome-btn');
            fireEvent.click(recordOutcomeBtn);

            expect(screen.getByTestId('tv-collection-outcome-modal')).toBeInTheDocument();

            const outcomeSelect = screen.getByTestId('tv-outcome-type-select');
            fireEvent.change(outcomeSelect, { target: { value: 'Disputed' } });

            const actionInput = screen.getByTestId('tv-action-taken-input');
            fireEvent.change(actionInput, { target: { value: 'Demand Letter Delivered' } });

            const notesInput = screen.getByTestId('tv-outcome-notes-textarea');
            fireEvent.change(notesInput, { target: { value: 'Client claims goods damaged in transit.' } });

            const submitBtn = screen.getByTestId('tv-submit-outcome-btn');
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/tasks/col-01/collection-outcome',
                    expect.objectContaining({
                        outcome: 'Disputed',
                        actionTaken: 'Demand Letter Delivered',
                        notes: 'Client claims goods damaged in transit.',
                    })
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Collection follow-up outcome recorded and dispatched to FOMS')
            );
        });

        it('renders TaskDetailModal and allows viewing task and closing modal', () => {
            const handleClose = vi.fn();
            render(<TaskDetailModal isOpen={true} onClose={handleClose} task={mockCollectionTask} />);

            expect(screen.getByTestId('task-detail-modal')).toBeInTheDocument();
            expect(screen.getByText(/FOMS Automated Collection & Workload Graph Routing/i)).toBeInTheDocument();

            const closeBtn = screen.getByLabelText(/close modal/i);
            fireEvent.click(closeBtn);
            expect(handleClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('3. TaskComments - Duplicate Remark Thread (FR-044)', () => {
        it('correctly parses [FOMS Overdue Alert] duplicate remark content', () => {
            const content = '[FOMS Overdue Alert] Duplicate overdue alert received for invoice INV-2026-9481 (35 days overdue, ₱145,000.00). Existing open task retained per FR-044.';
            const parsed = parseFomsOverdueAlertComment(content);

            expect(parsed).not.toBeNull();
            expect(parsed?.isFomsOverdueRemark).toBe(true);
            expect(parsed?.invoiceNumber).toBe('INV-2026-9481');
            expect(parsed?.daysOverdue).toBe(35);
            expect(parsed?.amountDue).toBe('145,000.00');
        });

        it('renders duplicate alert remark thread in the task audit discussion feed per FR-044', async () => {
            const mockComment = {
                taskCommentId: 'tc-dup-01',
                taskId: 'col-01',
                employeeId: 'foms-bot',
                authorName: 'FOMS System Integration',
                message: '[FOMS Overdue Alert] Duplicate overdue alert received for invoice INV-2026-9481 (35 days overdue, ₱145,000.00). Existing open task retained per FR-044.',
                createdAt: new Date().toISOString(),
            };

            (api.get as any).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: [mockComment],
                },
            });

            render(<TaskComments taskId="col-01" currentEmployeeId="user-01" />);

            await waitFor(() => {
                expect(screen.getByTestId('tc-foms-overdue-duplicate-remark')).toBeInTheDocument();
            });

            expect(screen.getByText('Duplicate Overdue Alert')).toBeInTheDocument();
            expect(screen.getByText('INV: INV-2026-9481')).toBeInTheDocument();
            expect(screen.getByText(/Existing open task retained per single-active task idempotency \(FR-044\)/i)).toBeInTheDocument();
            expect(screen.getByText(/Automated M2M Overdue Alert Audit Remark/i)).toBeInTheDocument();
        });
    });

    describe('4. Coordinator Notification Drawer & Navigation', () => {
        it('classifies "URGENT: Overdue Collection Task Assigned" under "Task Overdues" and labels button "View Collection Task"', async () => {
            const overdueNotif = {
                id: 'notif-col-01',
                title: 'URGENT: Overdue Collection Task Assigned',
                message: 'Collection follow-up for Trans-Pacific Express Cargo (Invoice INV-2026-9481, ₱145,000.00) has been routed to you.',
                createdAt: new Date().toISOString(),
                isRead: false,
                taskId: 'col-01',
            };

            const category = classifyNotification(overdueNotif);
            expect(category).toBe('Task Overdues');

            const onViewTask = vi.fn();
            render(<NotificationsTab extraNotifications={[overdueNotif]} onViewTask={onViewTask} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /view collection task/i })).toBeInTheDocument();
            });

            const actionBtn = screen.getByRole('button', { name: /view collection task/i });
            fireEvent.click(actionBtn);
            expect(onViewTask).toHaveBeenCalledWith('col-01');
        });

        it('GlobalHeader notification drawer renders "View Collection Task →" action button', () => {
            const collectionNotif: NotificationItem = {
                id: 'notif-gh-01',
                title: 'URGENT: Overdue Collection Task Assigned',
                description: 'Collection follow-up for Trans-Pacific Express Cargo (Invoice INV-2026-9481, ₱145,000.00) has been routed to you.',
                timestamp: '5m ago',
                date: 'Today',
                read: false,
                type: 'alert',
                category: 'finance',
                isToday: true,
                taskId: 'col-01',
            };

            const onAction = vi.fn();
            render(
                <GlobalHeader
                    notifications={[collectionNotif]}
                    onNotificationAction={onAction}
                />
            );

            // Open notification dropdown
            const bellBtn = screen.getByRole('button', { name: /notifications/i });
            fireEvent.click(bellBtn);

            const actionBtn = screen.getByRole('button', { name: /view collection task →/i });
            expect(actionBtn).toBeInTheDocument();

            fireEvent.click(actionBtn);
            expect(onAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'notif-gh-01',
                    actionLabel: 'View Collection Task',
                })
            );
        });
    });
});
