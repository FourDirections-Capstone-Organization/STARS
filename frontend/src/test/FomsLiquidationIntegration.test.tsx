import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LiquidationCorrectionsView from '../components/LiquidationCorrections/LiquidationCorrectionsView';
import LiquidationTasksList from '../components/LiquidationCorrections/LiquidationTasksList';
import SubmitCorrectionModal from '../components/LiquidationCorrections/SubmitCorrectionModal';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import FomsFinancialMetricsView from '../components/FomsFinancialMetrics/FomsFinancialMetricsView';
import NotificationsTab from '../components/NotificationsTab/NotificationsTab';
import { LiquidationTaskItem } from '../components/LiquidationCorrections/types';
import api from '../api';

// Mock Recharts
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock API
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
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

describe('Integration 5: FOMS Late/Invalid Liquidation → STARS Liquidation Correction Task (STARS Frontend)', () => {
    const mockLiquidationTasks: LiquidationTaskItem[] = [
        {
            id: 'e44d852a-39f2-494b-99f3-8ea873fb2a1d',
            taskId: 'fe2174c6-dfc7-4daf-9268-af451765f55d',
            taskNumber: 'KDTYBBT2',
            requestId: 'LIQ-2026-LIVE-9921',
            liquidationId: 105,
            requester: 'Maria Santos (Courier)',
            requesterEmployeeId: 'EMP-005',
            deliveryReference: 'WB-2026-NCR-8841',
            liquidationStatus: 'For Correction',
            correctionReason: 'Missing official fuel receipt from Shell station',
            dueDate: '2026-11-20T17:00:00Z',
            amount: 1450.00,
            correctionStatus: 'InProgress',
            correctedReceiptsUrl: 'https://speedex.blob.core.windows.net/receipts/LIQ-2026-LIVE-9921-receipt.pdf',
            resolutionRemarks: 'Obtained official duplicate BIR receipt from Shell station.',
            fomsSyncStatus: 'CallbackSuccess',
            lastSyncedAt: '2026-11-19T06:29:53Z',
            lastSyncError: null,
            createdAt: '2026-11-19T06:29:50Z',
            updatedAt: '2026-11-19T06:29:53Z',
            taskStatus: 'InProgress',
            priorityLevel: 'High',
        },
        {
            id: 'a11b223c-44d5-66e7-88f9-001122334455',
            taskId: 'task-rejected-9922',
            taskNumber: 'REJ88219',
            requestId: 'LIQ-2026-REJ-9922',
            liquidationId: 106,
            requester: 'Juan Dela Cruz (Driver)',
            requesterEmployeeId: 'EMP-012',
            deliveryReference: 'WB-2026-LUZ-1002',
            liquidationStatus: 'Rejected',
            correctionReason: 'Toll fee ticket was unreadable / smudged; needs verified RFID log statement',
            dueDate: '2026-11-18T10:00:00Z', // Overdue
            amount: 2850.50,
            correctionStatus: 'PendingCorrection',
            correctedReceiptsUrl: null,
            resolutionRemarks: null,
            fomsSyncStatus: 'Failed',
            lastSyncedAt: null,
            lastSyncError: 'FOMS returned HTTP 500: Internal server timeout',
            createdAt: '2026-11-18T08:00:00Z',
            updatedAt: '2026-11-18T08:00:00Z',
            taskStatus: 'InProgress',
            priorityLevel: 'Urgent',
        },
        {
            id: 'c22d334e-55f6-77a8-99b0-112233445566',
            taskId: 'task-review-9923',
            taskNumber: 'REV55102',
            requestId: 'LIQ-2026-REV-9923',
            liquidationId: 107,
            requester: 'Arnel Mendoza',
            requesterEmployeeId: 'EMP-020',
            deliveryReference: 'WB-2026-VIS-5521',
            liquidationStatus: 'For Correction',
            correctionReason: 'Maintenance receipt missing VAT breakdown',
            dueDate: '2026-11-25T12:00:00Z',
            amount: 3200.00,
            correctionStatus: 'Corrected',
            correctedReceiptsUrl: 'https://speedex.blob.core.windows.net/receipts/LIQ-2026-REV-9923-vat.pdf',
            resolutionRemarks: 'Provided revised invoice with VAT breakdown itemized.',
            fomsSyncStatus: 'Pending',
            lastSyncedAt: null,
            lastSyncError: null,
            createdAt: '2026-11-19T01:00:00Z',
            updatedAt: '2026-11-19T03:00:00Z',
            taskStatus: 'DonePendingReview',
            priorityLevel: 'High',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('employeeName', 'Jane Coordinator');
        localStorage.setItem('employeeId', 'EMP-COORD-01');

        (api.get as any).mockImplementation((url: string) => {
            if (url === '/api/foms-integration/liquidation-tasks') {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockLiquidationTasks,
                    },
                });
            }
            if (url.startsWith('/api/foms-integration/liquidation-tasks/')) {
                const taskId = url.split('/').pop();
                const found = mockLiquidationTasks.find(t => t.taskId === taskId || t.id === taskId);
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: found || mockLiquidationTasks[0],
                    },
                });
            }
            if (url === '/api/foms-integration/clients') {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url === '/api/foms-integration/endorsements') {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url === '/api/foms-integration/collection-alerts') {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url === '/api/foms-integration/dashboard-financial-summary') {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalOutstandingBalance: 125000,
                            totalOverdueBalance: 45000,
                            overdueInvoicesCount: 3,
                            criticalOverdueAccountsCount: 1,
                            agingBuckets: [],
                            clientSummaries: [],
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        (api.post as any).mockResolvedValue({
            data: { isSuccess: true, message: 'Success' },
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Query Liquidation Correction Tasks & Presentation
    // ─────────────────────────────────────────────────────────────
    describe('1. Query Liquidation Correction Tasks & Visual Presentation', () => {
        it('queries GET /api/foms-integration/liquidation-tasks and renders KPI summary metrics', async () => {
            render(<LiquidationCorrectionsView />);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith('/api/foms-integration/liquidation-tasks');
            });

            // Check KPI values: Total: 3, For Correction: 2, Rejected: 1, CallbackSuccess: 1, Sync Failed: 1
            expect(screen.getByTestId('kpi-total-requests')).toHaveTextContent('3');
            expect(screen.getByTestId('kpi-for-correction')).toHaveTextContent('2');
            expect(screen.getByTestId('kpi-rejected')).toHaveTextContent('1');
            expect(screen.getByTestId('kpi-callback-success')).toHaveTextContent('1');
            expect(screen.getByTestId('kpi-sync-failed')).toHaveTextContent('1');
        });

        it('renders correct status badges (orange for "For Correction", red for "Rejected")', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} />);

            const statusBadges = screen.getAllByTestId('liquidation-status-badge');
            expect(statusBadges.length).toBe(3);

            // Row 0 is "For Correction"
            expect(statusBadges[0]).toHaveTextContent(/For Correction/i);
            expect(statusBadges[0]).toHaveClass('liq-badge-for-correction');

            // Row 1 is "Rejected"
            expect(statusBadges[1]).toHaveTextContent(/Rejected/i);
            expect(statusBadges[1]).toHaveClass('liq-badge-rejected');
        });

        it('renders red "Urgent" priority badge for Rejected or overdue liquidations', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} />);

            const priorityBadges = screen.getAllByTestId('priority-badge');
            expect(priorityBadges.length).toBe(3);

            // Row 1 is Rejected and overdue -> Urgent
            expect(priorityBadges[1]).toHaveTextContent(/Urgent/i);
            expect(priorityBadges[1]).toHaveClass('liq-badge-urgent');

            // Row 0 is High
            expect(priorityBadges[0]).toHaveTextContent(/High/i);
        });

        it('displays Requester name, Employee ID, and Delivery Reference in table drawer cells', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} />);

            const metadataCells = screen.getAllByTestId('requester-metadata-cell');
            expect(metadataCells.length).toBe(3);

            // Row 0
            expect(metadataCells[0]).toHaveTextContent('Maria Santos (Courier)');
            expect(metadataCells[0]).toHaveTextContent('EMP-005');
            expect(metadataCells[0]).toHaveTextContent('WB-2026-NCR-8841');

            // Row 1
            expect(metadataCells[1]).toHaveTextContent('Juan Dela Cruz (Driver)');
            expect(metadataCells[1]).toHaveTextContent('EMP-012');
            expect(metadataCells[1]).toHaveTextContent('WB-2026-LUZ-1002');
        });

        it('renders Correction Reason callout box highlighting the Finance Manager reason', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} />);

            const reasonCallouts = screen.getAllByTestId('table-correction-reason-callout');
            expect(reasonCallouts[0]).toHaveTextContent('Missing official fuel receipt from Shell station');
            expect(reasonCallouts[1]).toHaveTextContent('Toll fee ticket was unreadable / smudged; needs verified RFID log statement');
        });

        it('renders green pill for "CallbackSuccess" and red pill with "Retry Sync" button for "Failed"', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} />);

            // Success pill
            expect(screen.getByTestId('sync-success-pill')).toHaveTextContent(/CallbackSuccess/i);

            // Failed pill
            expect(screen.getByTestId('sync-failed-pill')).toHaveTextContent(/Failed/i);

            // Retry Sync button on failed row
            expect(screen.getByTestId('retry-sync-btn')).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. FSM Action: Attach Corrected Receipts (SubmitCorrectionModal)
    // ─────────────────────────────────────────────────────────────
    describe('2. Submit Corrected Receipts & Resolution Remarks (SubmitCorrectionModal)', () => {
        it('renders "Attach Corrected Receipts" button when task is InProgress', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} />);

            const attachButtons = screen.getAllByTestId('attach-receipts-btn');
            expect(attachButtons.length).toBeGreaterThanOrEqual(1);
        });

        it('submits corrected receipts URL and remarks via POST /api/foms-integration/liquidation-tasks/{taskId}/submit-correction', async () => {
            const handleSuccess = vi.fn();
            const handleClose = vi.fn();

            render(
                <SubmitCorrectionModal
                    isOpen={true}
                    task={mockLiquidationTasks[1]} // task-rejected-9922
                    onClose={handleClose}
                    onSubmitSuccess={handleSuccess}
                />
            );

            expect(screen.getByTestId('submit-correction-modal')).toBeInTheDocument();
            expect(screen.getByTestId('requester-metadata-drawer')).toHaveTextContent('Juan Dela Cruz (Driver)');
            expect(screen.getByTestId('requester-metadata-drawer')).toHaveTextContent('EMP-012');
            expect(screen.getByTestId('correction-reason-callout')).toHaveTextContent('Toll fee ticket was unreadable / smudged');

            // Fill URL and remarks
            const urlInput = screen.getByTestId('corrected-receipts-url-input');
            fireEvent.change(urlInput, {
                target: { value: 'https://speedex.blob.core.windows.net/receipts/LIQ-2026-REJ-9922-rfid-statement.pdf' },
            });

            const remarksInput = screen.getByTestId('resolution-remarks-input');
            fireEvent.change(remarksInput, {
                target: { value: 'Generated verified RFID statement from Easytrip portal covering trip dates.' },
            });

            // Submit
            const confirmBtn = screen.getByTestId('submit-correction-confirm-btn');
            fireEvent.click(confirmBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/liquidation-tasks/task-rejected-9922/submit-correction',
                    expect.objectContaining({
                        correctedReceiptsUrl: 'https://speedex.blob.core.windows.net/receipts/LIQ-2026-REJ-9922-rfid-statement.pdf',
                        resolutionRemarks: 'Generated verified RFID statement from Easytrip portal covering trip dates.',
                    })
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Corrected receipts attached successfully')
            );
            expect(handleSuccess).toHaveBeenCalled();
            expect(handleClose).toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. FSM Action: Authorize Completion & Dispatch Callback (FR-024)
    // ─────────────────────────────────────────────────────────────
    describe('3. Authorize Completion & Dispatch FOMS Callback (FR-024)', () => {
        it('renders "Authorize Completion & Return to FOMS" button when task is PendingReview', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} userRole="Coordinator" />);

            const authBtn = screen.getByTestId('authorize-completion-btn');
            expect(authBtn).toBeInTheDocument();
            expect(authBtn).toHaveTextContent(/Authorize Completion & Return to FOMS/i);
        });

        it('dispatches POST /api/foms-integration/liquidation-tasks/{taskId}/callback when authorized', async () => {
            const handleRefresh = vi.fn();
            render(
                <LiquidationTasksList
                    tasks={mockLiquidationTasks}
                    userRole="Coordinator"
                    onRefresh={handleRefresh}
                />
            );

            const authBtn = screen.getByTestId('authorize-completion-btn');
            fireEvent.click(authBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/liquidation-tasks/task-review-9923/callback',
                    {}
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('authorized and synced to FOMS')
            );
            expect(handleRefresh).toHaveBeenCalled();
        });

        it('restricts authorization if user is Courier/Driver per FR-024', async () => {
            render(<LiquidationTasksList tasks={mockLiquidationTasks} userRole="Courier" />);

            // Authorization button is hidden or restricted for non-coordinators/non-managers
            expect(screen.queryByTestId('authorize-completion-btn')).not.toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Manual Retry on Failed Sync
    // ─────────────────────────────────────────────────────────────
    describe('4. Manual Retry Sync on Callback Failure', () => {
        it('dispatches POST /api/foms-integration/liquidation-tasks/{taskId}/retry when Retry Sync is clicked', async () => {
            const handleRefresh = vi.fn();
            render(
                <LiquidationTasksList
                    tasks={mockLiquidationTasks}
                    onRefresh={handleRefresh}
                />
            );

            const retryBtn = screen.getByTestId('retry-sync-btn');
            expect(retryBtn).toBeInTheDocument();

            fireEvent.click(retryBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/liquidation-tasks/task-rejected-9922/retry',
                    {}
                );
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('sync retry succeeded')
            );
            expect(handleRefresh).toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 5. TaskView Liquidation Integration
    // ─────────────────────────────────────────────────────────────
    describe('5. TaskView Dedicated Liquidation Remediation Section', () => {
        const mockTaskViewData: TaskViewTask = {
            taskId: 'fe2174c6-dfc7-4daf-9268-af451765f55d',
            taskTitle: '[Liquidation Correction] LIQ-2026-LIVE-9921 - Maria Santos (Courier)',
            taskDescription:
                'Automated liquidation correction routed from FOMS.\n' +
                'Request ID: LIQ-2026-LIVE-9921\n' +
                'Liquidation ID: 105\n' +
                'Requester: Maria Santos (Courier) (EMP-005)\n' +
                'Delivery/Trip Reference: WB-2026-NCR-8841\n' +
                'Status: For Correction\n' +
                'Correction Reason: Missing official fuel receipt from Shell station\n' +
                'Amount: ₱1,450.00\n' +
                'Due Date: 2026-11-20\n' +
                'Remarks: Please collect corrected receipts and resolve discrepancy with requester.',
            priority: 'High',
            taskStatus: 'In Progress',
            dueAt: '2026-11-20T17:00:00Z',
            assignedEmployee: 'Jane Coordinator',
            createdByEmployee: 'System (FOMS Integration)',
            createdAt: '2026-11-19T06:29:50Z',
        };

        it('renders dedicated FOMS Liquidation Correction card inside TaskView', async () => {
            render(
                <TaskView
                    task={mockTaskViewData}
                    onClose={vi.fn()}
                />
            );

            await waitFor(() => {
                expect(screen.getByTestId('foms-liquidation-section')).toBeInTheDocument();
            });

            expect(screen.getByText(/FOMS Expense Liquidation Correction/i)).toBeInTheDocument();
            expect(screen.getByTestId('liquidation-status-badge')).toHaveTextContent(/For Correction/i);
            expect(screen.getByTestId('requester-metadata-drawer')).toHaveTextContent('Maria Santos (Courier)');
            expect(screen.getByTestId('requester-metadata-drawer')).toHaveTextContent('EMP-005');
            expect(screen.getByTestId('requester-metadata-drawer')).toHaveTextContent('WB-2026-NCR-8841');
            expect(screen.getByTestId('correction-reason-callout')).toHaveTextContent('Missing official fuel receipt from Shell station');
            expect(screen.getByTestId('attach-receipts-btn')).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Coordinator Notification Drawer & View Link
    // ─────────────────────────────────────────────────────────────
    describe('6. Coordinator Notification Drawer', () => {
        it('renders notification and provides shortcut to view liquidation task', async () => {
            const handleViewTask = vi.fn();
            const mockNotifs = [
                {
                    id: 'notif-liq-01',
                    title: 'Liquidation Correction Task Assigned',
                    message: 'Liquidation correction task for LIQ-2026-LIVE-9921 (Maria Santos) has been routed to you.',
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    type: 'TaskAssigned',
                    taskId: 'fe2174c6-dfc7-4daf-9268-af451765f55d',
                },
            ];

            render(
                <NotificationsTab
                    extraNotifications={mockNotifs}
                    onViewTask={handleViewTask}
                />
            );

            await waitFor(() => {
                expect(screen.getByText(/Liquidation Correction Task Assigned/i)).toBeInTheDocument();
            });

            const linkBtn = screen.getByTestId('notification-view-task-btn');
            expect(linkBtn).toHaveTextContent(/View Liquidation Task/i);

            fireEvent.click(linkBtn);
            expect(handleViewTask).toHaveBeenCalledWith('fe2174c6-dfc7-4daf-9268-af451765f55d');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 7. FOMS Hub Navigation Tab
    // ─────────────────────────────────────────────────────────────
    describe('7. FomsFinancialMetricsView Liquidation Corrections Tab Navigation', () => {
        it('navigates to Liquidation Corrections tab and displays tasks view', async () => {
            render(<FomsFinancialMetricsView initialTab="liquidation" />);

            await waitFor(() => {
                expect(screen.getByTestId('liquidation-corrections-view')).toBeInTheDocument();
            });

            expect(screen.getByTestId('kpi-total-requests')).toBeInTheDocument();
            expect(screen.getByText('LIQ-2026-LIVE-9921')).toBeInTheDocument();
        });
    });
});
