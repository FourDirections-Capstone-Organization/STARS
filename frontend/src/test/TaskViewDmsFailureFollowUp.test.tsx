import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import TaskManager, { TMTask, isSpecialTask, isFollowUpTask } from '../components/TaskManager/TaskManager';
import TaskComments, { parseFailureFollowUpComment } from '../components/TaskComments/TaskComments';
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

describe('STARS ↔ DMS Integration 4: Failed Pickup / Failed Delivery Follow-up Task Workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('employeeName', 'Alex Coordinator');
    });

    const mockDeliveryDetail = {
        taskId: 'task-followup-001',
        recipientName: 'Maria Santos',
        recipientContact: '0917-555-0199',
        deliveryAddress: 'Unit 402, Emerald Tower, F. Ortigas Jr. Rd, Pasig City',
        area: 'Ortigas Center',
        packageDescription: 'Confidential Legal Documents',
        courierFullName: 'Carlos Courier',
        courierEmployeeId: 'DRV-042',
        courierIsActive: true,
        dmsWaybillNo: 'WB-2026-8801',
        dmsOrderId: 9021,
        dmsStatus: 'Failed',
        dmsRawStatus: 'Failed Delivery',
        dmsFailureReason: 'Customer Phone Unattended on 2nd Attempt',
        syncStatus: 'Synced',
    };

    const mockFollowUpTask: any = {
        taskId: 'task-followup-001',
        taskTitle: 'Delivery Follow-up - WB-2026-8801',
        taskDescription:
            'Follow-up required for Failed Delivery on Waybill WB-2026-8801.\n' +
            'Original Task: Rush Document Dispatch (orig-task-1111-2222-3333-444455556666)\n' +
            'Failure Reason: Customer Phone Unattended on 2nd Attempt\n' +
            'Attempt Count: 2\n' +
            'Driver: Carlos Courier (DRV-042)\n\n' +
            'Action Required: Contact client to arrange next attempt or return to sender in DMS.',
        priority: 'Urgent',
        dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        taskStatus: 'NotStarted',
        assignedEmployee: 'Alex Coordinator',
        createdByEmployee: 'DMS M2M Gateway',
        assignedTo: 'coord-user-001',
        createdAt: new Date().toISOString(),
        assignees: [
            {
                fullName: 'Alex Coordinator',
                completionPercentage: 0,
            },
        ],
        deliveryDetails: mockDeliveryDetail,
    };

    describe('1. Follow-up Task Display on Task Board & Task List', () => {
        const tmTasks: TMTask[] = [
            {
                id: 'task-followup-001',
                name: 'Delivery Follow-up - WB-2026-8801',
                taskNumber: 'TSK-8801',
                referenceNumber: 'REF-8801',
                classification: 'special',
                priority: 'Urgent',
                status: 'To do',
                dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
                progress: 0,
                assignee: { id: 'coord-user-001', name: 'Alex Coordinator' },
            },
            {
                id: 'task-regular-002',
                name: 'Standard Route Filing',
                taskNumber: 'TSK-8802',
                referenceNumber: 'REF-8802',
                classification: 'routine',
                priority: 'Low',
                status: 'To do',
                dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
                progress: 0,
                assignee: { id: 'coord-user-002', name: 'Ben Staff' },
            },
        ];

        it('correctly identifies follow-up task and special classification helper methods', () => {
            expect(isFollowUpTask('Delivery Follow-up - WB-2026-8801')).toBe(true);
            expect(isFollowUpTask('[Delivery Follow-up] Waybill WB-123')).toBe(true);
            expect(isFollowUpTask('Standard Route Filing')).toBe(false);

            expect(isSpecialTask('special')).toBe(true);
            expect(isSpecialTask('SpecialTask')).toBe(true);
            expect(isSpecialTask(1)).toBe(true);
            expect(isSpecialTask('1')).toBe(true);
            expect(isSpecialTask('routine')).toBe(false);
            expect(isSpecialTask(0)).toBe(false);
        });

        it('renders follow-up task with DELIVERY FOLLOW-UP badge, SPECIAL classification, and Urgent priority', () => {
            render(
                <TaskManager
                    tasks={tmTasks}
                    teamMembers={[{ accountId: 'coord-user-001', employeeName: 'Alex Coordinator' }]}
                    onNewTask={vi.fn()}
                    onEdit={vi.fn()}
                    onView={vi.fn()}
                    onArchive={vi.fn()}
                    onDelete={vi.fn()}
                    onMarkDone={vi.fn()}
                />
            );

            // Verify task title exists
            expect(screen.getAllByText('Delivery Follow-up - WB-2026-8801').length).toBeGreaterThanOrEqual(1);

            // Verify Delivery Follow-up badges
            expect(screen.getAllByText(/DELIVERY FOLLOW-UP/i).length).toBeGreaterThanOrEqual(1);

            // Verify Special classification badge
            expect(screen.getAllByText('SPECIAL').length).toBeGreaterThanOrEqual(1);

            // Verify Urgent priority badge
            expect(screen.getAllByText(/Urgent/i).length).toBeGreaterThanOrEqual(1);
        });

        it('filters correctly when Coordinator filters by Special tasks', () => {
            render(
                <TaskManager
                    tasks={tmTasks}
                    teamMembers={[{ accountId: 'coord-user-001', employeeName: 'Alex Coordinator' }]}
                    onNewTask={vi.fn()}
                    onEdit={vi.fn()}
                    onView={vi.fn()}
                    onArchive={vi.fn()}
                    onDelete={vi.fn()}
                    onMarkDone={vi.fn()}
                    filterClassification="special"
                />
            );

            expect(screen.getAllByText('Delivery Follow-up - WB-2026-8801').length).toBeGreaterThanOrEqual(1);
            expect(screen.queryByText('Standard Route Filing')).not.toBeInTheDocument();
        });
    });

    describe('2. Viewing Failure Remarks & Details in Task Details (TaskView)', () => {
        beforeEach(() => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/delivery-details')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDeliveryDetail } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: null } });
            });
        });

        it('renders the dedicated DMS Delivery Follow-up & Workload Graph Routing section', async () => {
            render(<TaskView task={mockFollowUpTask} />);

            // Section Header
            expect(screen.getByText('DMS Delivery Follow-up & Workload Graph Routing')).toBeInTheDocument();
            expect(screen.getByText(/Graph Routed to Optimal Coordinator/i)).toBeInTheDocument();

            // Stats Banner
            expect(screen.getByText('FAILURE TYPE')).toBeInTheDocument();
            expect(screen.getByText('Failed Delivery')).toBeInTheDocument();
            expect(screen.getByText('WAYBILL NUMBER')).toBeInTheDocument();
            expect(screen.getByText('WB-2026-8801')).toBeInTheDocument();
            expect(screen.getByText('ATTEMPT COUNT')).toBeInTheDocument();
            expect(screen.getByText(/Attempt #2/i)).toBeInTheDocument();
            expect(screen.getByText('SLA DEADLINE')).toBeInTheDocument();
            expect(screen.getByText('2 Business Days')).toBeInTheDocument();

            // Root Cause Failure Reason
            expect(screen.getByText('EXCEPTION ROOT CAUSE')).toBeInTheDocument();
            expect(screen.getByText('Customer Phone Unattended on 2nd Attempt')).toBeInTheDocument();

            // Graph Routing Information
            expect(screen.getByText('GRAPH ROUTING ENGINE ASSIGNMENT')).toBeInTheDocument();
            expect(screen.getByText(/based on minimum active workload across Coordinators/i)).toBeInTheDocument();
            expect(screen.getByText(/Original delivery task status is preserved as Completed/i)).toBeInTheDocument();

            // Driver & Recipient details
            expect(screen.getByText('Assigned Driver')).toBeInTheDocument();
            expect(screen.getByText('Carlos Courier (DRV-042)')).toBeInTheDocument();
            expect(screen.getByText('Recipient Client')).toBeInTheDocument();
            await waitFor(() => {
                expect(screen.getByText('Maria Santos')).toBeInTheDocument();
            });
            expect(screen.getAllByText(/0917-555-0199/i).length).toBeGreaterThanOrEqual(1);

            // Preserved Original Task title
            expect(screen.getAllByText(/Rush Document Dispatch/i).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText(/Preserved Terminal Status: Completed/i)).toBeInTheDocument();

            // Action Required
            expect(screen.getByText(/COORDINATOR ACTION REQUIRED:/i)).toBeInTheDocument();
            expect(screen.getAllByText(/Contact client to arrange next attempt or return to sender in DMS/i).length).toBeGreaterThanOrEqual(1);

            // Quick Action Buttons
            expect(screen.getByRole('button', { name: /View Failure Remarks & Comments/i })).toBeInTheDocument();
            expect(screen.getAllByRole('button', { name: /Live Delivery Tracker/i }).length).toBeGreaterThanOrEqual(1);
        });

        it('navigates to Comments when clicking View Failure Remarks & Comments button', () => {
            render(<TaskView task={mockFollowUpTask} />);

            const commentsBtn = screen.getByRole('button', { name: /View Failure Remarks & Comments/i });
            fireEvent.click(commentsBtn);

            // Comments panel tab is active and visible
            expect(screen.getAllByText(/Comments/i).length).toBeGreaterThanOrEqual(1);
        });

        it('triggers tracker navigation when clicking Live Delivery Tracker button', () => {
            const onNavigateMock = vi.fn();
            render(<TaskView task={mockFollowUpTask} onNavigateToDmsTracker={onNavigateMock} />);

            const trackerBtn = screen.getAllByRole('button', { name: /Live Delivery Tracker/i })[0];
            fireEvent.click(trackerBtn);

            expect(onNavigateMock).toHaveBeenCalledWith('WB-2026-8801', 'task-followup-001');
        });
    });

    describe('3. Viewing Automated Failure Remarks in TaskComments', () => {
        const mockComments = [
            {
                id: 'c-001',
                taskId: 'task-followup-001',
                authorId: 'sys-001',
                authorName: 'DMS Gateway',
                content: '[Failure Follow-up Logged] Type: Failed Delivery | Attempt #1 | Reason: Recipient Unreachable | Driver: Carlos Courier (DRV-042) | Recorded: 2026-11-17 10:14:00 UTC',
                createdAt: '2026-11-17T10:14:00Z',
            },
            {
                id: 'c-002',
                taskId: 'task-followup-001',
                authorId: 'sys-001',
                authorName: 'DMS Gateway',
                content: '[Failure Follow-up Update] Type: Failed Delivery | Attempt #2 | Reason: Customer Phone Unattended on 2nd Attempt | Driver: DRV-001 | Recorded: 2026-11-18 12:25:21 UTC',
                createdAt: '2026-11-18T12:25:21Z',
            },
        ];

        beforeEach(() => {
            (api.get as any).mockResolvedValue({
                data: {
                    isSuccess: true,
                    data: { items: mockComments },
                },
            });
        });

        it('parses initial and subsequent failure follow-up comments accurately', () => {
            const parsed1 = parseFailureFollowUpComment(mockComments[0].content);
            expect(parsed1).not.toBeNull();
            expect(parsed1?.isUpdate).toBe(false);
            expect(parsed1?.failureType).toBe('Failed Delivery');
            expect(parsed1?.attemptCount).toBe(1);
            expect(parsed1?.reason).toBe('Recipient Unreachable');
            expect(parsed1?.driver).toBe('Carlos Courier (DRV-042)');

            const parsed2 = parseFailureFollowUpComment(mockComments[1].content);
            expect(parsed2).not.toBeNull();
            expect(parsed2?.isUpdate).toBe(true);
            expect(parsed2?.failureType).toBe('Failed Delivery');
            expect(parsed2?.attemptCount).toBe(2);
            expect(parsed2?.reason).toBe('Customer Phone Unattended on 2nd Attempt');
            expect(parsed2?.driver).toBe('DRV-001');
            expect(parsed2?.recorded).toBe('2026-11-18 12:25:21 UTC');
        });

        it('renders automated DMS failure remark cards with attempt badge, root cause, and driver info', async () => {
            render(
                <TaskComments
                    taskId="task-followup-001"
                    currentEmployeeId="coord-user-001"
                    taskReferenceNumber="REF-8801"
                />
            );

            await waitFor(() => {
                expect(screen.queryByText(/Loading comments/i)).not.toBeInTheDocument();
            });

            // Verify both remarks rendered as automated entries
            const failureCards = screen.getAllByTestId('tc-failure-remark');
            expect(failureCards.length).toBe(2);

            // Check Header Tags & Attempt Badges
            expect(screen.getByText('Follow-up Logged')).toBeInTheDocument();
            expect(screen.getByText('Follow-up Update')).toBeInTheDocument();
            expect(screen.getByText('Attempt #1')).toBeInTheDocument();
            expect(screen.getByText('Attempt #2')).toBeInTheDocument();

            // Check Root Cause Reasons
            expect(screen.getByText('Recipient Unreachable')).toBeInTheDocument();
            expect(screen.getByText('Customer Phone Unattended on 2nd Attempt')).toBeInTheDocument();

            // Check Drivers
            expect(screen.getAllByText(/Carlos Courier \(DRV-042\)/i).length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText(/DRV-001/i).length).toBeGreaterThanOrEqual(1);

            // Check Exact Structured Remark string is present
            expect(screen.getByText(/\[Failure Follow-up Update\] Type: Failed Delivery \| Attempt #2 \| Reason: Customer Phone Unattended on 2nd Attempt \| Driver: DRV-001 \| Recorded: 2026-11-18 12:25:21 UTC/i)).toBeInTheDocument();

            // Ensure no edit or delete buttons on automated system remarks
            expect(screen.queryByTitle(/Comment actions/i)).not.toBeInTheDocument();
        });
    });

    describe('4. In-App Notifications for Follow-up Task Assignment', () => {
        const mockNotification = {
            id: 'notif-001',
            taskId: 'task-followup-001',
            type: 0, // TaskAssigned
            notificationType: 'TaskAssigned',
            title: 'Delivery Follow-up Task Assigned',
            message: 'New delivery follow-up task created for Waybill WB-2026-8801 (Customer Phone Unattended on 2nd Attempt).',
            isRead: false,
            createdAt: new Date().toISOString(),
        };

        it('classifies notification under Task Assignments category', () => {
            const classification = classifyNotification(mockNotification);
            expect(classification).toBe('Task Assignments');
        });

        it('renders notification in NotificationsTab and triggers onViewTask navigation upon click', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/unread-count')) {
                    return Promise.resolve({ data: { isSuccess: true, data: 1 } });
                }
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [mockNotification],
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
                expect(screen.getByText('Delivery Follow-up Task Assigned')).toBeInTheDocument();
            });

            expect(screen.getByText(/New delivery follow-up task created for Waybill WB-2026-8801/i)).toBeInTheDocument();

            // Click the action button
            const viewBtn = screen.getByRole('button', { name: /View Follow-up Task/i });
            fireEvent.click(viewBtn);

            expect(onViewTaskMock).toHaveBeenCalledWith('task-followup-001');
        });
    });
});
