import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FomsFinancialMetricsView from '../components/FomsFinancialMetrics/FomsFinancialMetricsView';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import TaskComments, { parseFomsPaymentNotificationComment } from '../components/TaskComments/TaskComments';
import NotificationsTab, { classifyNotification } from '../components/NotificationsTab/NotificationsTab';
import api from '../api';

// Mock Recharts ResponsiveContainer to render children cleanly in jsdom
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

describe('Integration 2: FOMS Payment Status → STARS Dashboard Visibility', () => {
    const mockSummaryWithRecentInvoices = {
        totalOutstandingBalance: 485000.0,
        totalOverdueBalance: 145000.0,
        totalInvoicesTracked: 12,
        overdueInvoicesCount: 2,
        paidInvoicesCount: 8,
        pendingInvoicesCount: 2,
        disputedInvoicesCount: 1,
        dueSoonInvoicesCount: 1,
        lastUpdatedAt: new Date().toISOString(),
        topOutstandingClients: [
            {
                clientAccountId: 'CLI-TRANSPAC-02',
                clientName: 'Trans-Pacific Express Cargo',
                outstandingBalance: 145000.0,
                overdueInvoicesCount: 1,
                latestStatus: 'Overdue',
                nextDueDate: new Date(Date.now() - 5 * 86400000).toISOString(),
            },
            {
                clientAccountId: 'CLI-HORIZON-01',
                clientName: 'Horizon Retail Holdings Inc.',
                outstandingBalance: 0.0,
                overdueInvoicesCount: 0,
                latestStatus: 'Paid',
                nextDueDate: null,
            },
            {
                clientAccountId: 'CLI-DISPUTED-03',
                clientName: 'Pacific Maritime Corp',
                outstandingBalance: 120000.0,
                overdueInvoicesCount: 0,
                latestStatus: 'Disputed',
                nextDueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
            },
            {
                clientAccountId: 'CLI-DUESOON-04',
                clientName: 'Sunrise Express Logistics',
                outstandingBalance: 220000.0,
                overdueInvoicesCount: 0,
                latestStatus: 'Due Soon',
                nextDueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
            },
        ],
        recentInvoices: [
            {
                invoiceNumber: 'INV-2026-9481',
                clientAccountId: 'CLI-TRANSPAC-02',
                clientName: 'Trans-Pacific Express Cargo',
                invoiceStatus: 'Overdue',
                paymentStatus: 'Unpaid',
                dueStatus: 'Overdue',
                agingBucket: '31-60',
                outstandingBalance: 145000.0,
                dueDate: new Date(Date.now() - 5 * 86400000).toISOString(),
            },
            {
                invoiceNumber: 'INV-2026-9482',
                clientAccountId: 'CLI-HORIZON-01',
                clientName: 'Horizon Retail Holdings Inc.',
                invoiceStatus: 'Paid',
                paymentStatus: 'Paid',
                dueStatus: 'Normal',
                agingBucket: 'Current',
                outstandingBalance: 0.0,
                dueDate: new Date(Date.now() + 20 * 86400000).toISOString(),
            },
            {
                invoiceNumber: 'INV-2026-9483',
                clientAccountId: 'CLI-DISPUTED-03',
                clientName: 'Pacific Maritime Corp',
                invoiceStatus: 'Disputed',
                paymentStatus: 'Unpaid',
                dueStatus: 'Normal',
                agingBucket: 'Current',
                outstandingBalance: 120000.0,
                dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('dashboard-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockSummaryWithRecentInvoices,
                    },
                });
            }
            if (url.includes('/comments')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [
                                {
                                    taskCommentId: 'comm-payment-001',
                                    message: '[FOMS Payment Notification] Full payment settled for invoice INV-2026-9481. Outstanding balance cleared. Follow-up concluded.',
                                    createdAt: new Date().toISOString(),
                                    authorName: 'FOMS System Webhook',
                                    authorRole: 'System',
                                    authorId: 'sys-01',
                                },
                            ],
                        },
                    },
                });
            }
            if (url.includes('/Notification/unread-count')) {
                return Promise.resolve({ data: { isSuccess: true, data: 2 } });
            }
            if (url.includes('/Notification')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [
                                {
                                    id: 'notif-overdue-001',
                                    taskId: 'col-01',
                                    type: 2, // TaskOverdue
                                    notificationType: 'TaskOverdue',
                                    title: 'Invoice Overdue Alert',
                                    message: 'Invoice INV-2026-9481 for Trans-Pacific Express Cargo is now overdue (Outstanding: ₱145,000.00).',
                                    isRead: false,
                                    createdAt: '2026-11-19T10:00:00Z',
                                },
                                {
                                    id: 'notif-paid-002',
                                    taskId: 'col-01',
                                    type: 8, // TaskCompleted
                                    notificationType: 'TaskCompleted',
                                    title: 'Invoice Payment Settled',
                                    message: 'Invoice INV-2026-9481 for Trans-Pacific Express Cargo has been settled in full.',
                                    isRead: false,
                                    createdAt: '2026-11-19T11:00:00Z',
                                },
                            ],
                            totalCount: 2,
                            pageNumber: 1,
                            totalPages: 1,
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
    });

    afterEach(() => {
        localStorage.clear();
    });

    // ─── 1. Scoped Metrics Presentation (FR-011 / FR-012) ────────────────────

    describe('1. Scoped Metrics Presentation (FomsFinancialMetricsView)', () => {
        it('renders Coordinator role-scoped indicator badge and scoped subtitle when logged in as Coordinator (FR-011)', async () => {
            localStorage.setItem('userRole', 'Coordinator');
            render(<FomsFinancialMetricsView />);

            await waitFor(() => {
                expect(screen.getByTestId('foms-role-scope-badge')).toBeInTheDocument();
            });

            expect(screen.getByTestId('foms-role-scope-badge')).toHaveTextContent(/Assigned Clients Scope \(Coordinator\)/i);
            expect(screen.getByText(/scoped to your assigned clients/i)).toBeInTheDocument();
            expect(api.get).toHaveBeenCalledWith('/api/integration/foms/dashboard-summary');
        });

        it('renders Manager company-wide scope indicator badge when logged in as Manager (FR-012)', async () => {
            localStorage.setItem('userRole', 'Manager');
            render(<FomsFinancialMetricsView />);

            await waitFor(() => {
                expect(screen.getByTestId('foms-role-scope-badge')).toBeInTheDocument();
            });

            expect(screen.getByTestId('foms-role-scope-badge')).toHaveTextContent(/Company-Wide Financial Scope \(Manager\)/i);
            expect(screen.getByText(/client balance tracking & invoice settlement visibility/i)).toBeInTheDocument();
        });

        it('displays all specified financial metric fields in KPI cards', async () => {
            localStorage.setItem('userRole', 'Manager');
            render(<FomsFinancialMetricsView />);

            await waitFor(() => {
                expect(screen.getByText('₱485,000.00')).toBeInTheDocument(); // totalOutstandingBalance
                expect(screen.getAllByText('₱145,000.00').length).toBeGreaterThanOrEqual(1); // totalOverdueBalance
            });

            // KPI card metrics
            expect(screen.getByTestId('kpi-disputed-invoices')).toHaveTextContent('1'); // disputedInvoicesCount
            expect(screen.getByTestId('kpi-due-soon-invoices')).toHaveTextContent('1'); // dueSoonInvoicesCount
            expect(screen.getAllByText('Overdue Invoices').length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('Settled / Paid')).toBeInTheDocument();
        });

        it('enforces Strict Binary Payment Status (FR-039): displays Paid for zero balance and Unpaid for positive balance', async () => {
            localStorage.setItem('userRole', 'Manager');
            render(<FomsFinancialMetricsView />);

            await waitFor(() => {
                expect(screen.getByText('Horizon Retail Holdings Inc.')).toBeInTheDocument();
            });

            // Horizon Retail has 0 balance and Paid status -> should have status-paid pill
            const paidPills = screen.getAllByTestId('foms-payment-status-paid');
            expect(paidPills.length).toBeGreaterThanOrEqual(1);
            expect(paidPills[0]).toHaveTextContent('Paid');

            // Trans-Pacific has positive balance -> should have status-unpaid/overdue pill
            const unpaidPills = screen.getAllByTestId('foms-payment-status-unpaid');
            expect(unpaidPills.length).toBeGreaterThanOrEqual(1);
        });

        it('filters client accounts using Disputed and Due Soon filter chips', async () => {
            localStorage.setItem('userRole', 'Manager');
            render(<FomsFinancialMetricsView />);

            await waitFor(() => {
                expect(screen.getByText('Pacific Maritime Corp')).toBeInTheDocument();
            });

            // Filter by Disputed
            const disputedChip = screen.getByRole('button', { name: /^Disputed/i });
            fireEvent.click(disputedChip);

            expect(screen.getByText('Pacific Maritime Corp')).toBeInTheDocument();
            expect(screen.queryByText('Trans-Pacific Express Cargo')).not.toBeInTheDocument();
            expect(screen.queryByText('Horizon Retail Holdings Inc.')).not.toBeInTheDocument();

            // Filter by Due Soon
            const dueSoonChip = screen.getByRole('button', { name: /^Due Soon/i });
            fireEvent.click(dueSoonChip);

            expect(screen.getByText('Sunrise Express Logistics')).toBeInTheDocument();
            expect(screen.queryByText('Pacific Maritime Corp')).not.toBeInTheDocument();
        });

        it('supports switching to Recent Invoices sub-tab and renders recent invoice stream', async () => {
            localStorage.setItem('userRole', 'Manager');
            render(<FomsFinancialMetricsView />);

            await waitFor(() => {
                expect(screen.getByTestId('foms-tab-recent-invoices')).toBeInTheDocument();
            });

            // Click Recent Invoices toggle
            fireEvent.click(screen.getByTestId('foms-tab-recent-invoices'));

            // Table displays recent invoices
            expect(screen.getByText('INV-2026-9481')).toBeInTheDocument();
            expect(screen.getByText('INV-2026-9482')).toBeInTheDocument();
            expect(screen.getByText('INV-2026-9483')).toBeInTheDocument();

            const rows = screen.getAllByTestId('foms-recent-invoice-row');
            expect(rows.length).toBe(3);
        });
    });

    // ─── 2. Collection Follow-up Auto-Conclusion Remark ──────────────────────

    describe('2. Collection Follow-up Auto-Conclusion Remark & Badge Styling', () => {
        const completedCollectionTask: TaskViewTask = {
            taskId: 'col-task-completed-01',
            taskTitle: '[Collection Follow-up] Invoice INV-2026-9481 - Trans-Pacific Express Cargo',
            taskDescription:
                'Automated collection follow-up routed from FOMS.\n' +
                'Invoice: INV-2026-9481\n' +
                'Amount Due: ₱145,000.00\n' +
                'Aging: 31-60 (35 days overdue)\n' +
                'Due Date: 2026-09-14\n' +
                'Client Account: CLI-TRANSPAC-02 (Trans-Pacific Express Cargo)',
            priority: 'Urgent',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            taskStatus: 'Completed',
            assignedEmployee: 'Jane Coordinator',
            createdByEmployee: 'FOMS System Webhook',
            assignedTo: 'Jane Coordinator',
            createdAt: new Date().toISOString(),
            assignees: [{ fullName: 'Jane Coordinator', completionPercentage: 100 }],
        };

        it('parses FOMS payment notification comment correctly', () => {
            const rawComment =
                '[FOMS Payment Notification] Full payment settled for invoice INV-2026-9481. Outstanding balance cleared. Follow-up concluded.';
            const parsed = parseFomsPaymentNotificationComment(rawComment);

            expect(parsed).not.toBeNull();
            expect(parsed?.isFomsPaymentRemark).toBe(true);
            expect(parsed?.invoiceNumber).toBe('INV-2026-9481');
        });

        it('renders specialized payment settlement comment card in TaskComments thread', async () => {
            render(
                <TaskComments
                    taskId="col-task-completed-01"
                    currentEmployeeId="coord-01"
                    taskReferenceNumber="TK-COLLECT"
                />
            );

            await waitFor(() => {
                expect(screen.getByTestId('tc-foms-payment-remark')).toBeInTheDocument();
            });

            expect(screen.getByText('Payment Settlement Concluded')).toBeInTheDocument();
            expect(screen.getByText('INV: INV-2026-9481')).toBeInTheDocument();
            expect(
                screen.getByText(/Full payment settled for invoice INV-2026-9481/i)
            ).toBeInTheDocument();
            expect(screen.getByText(/Outstanding balance cleared in full/i)).toBeInTheDocument();
        });

        it('renders Completed badge with badge-green accent and auto-concluded settlement banner in TaskView', () => {
            render(<TaskView task={completedCollectionTask} />);

            // Task badge displays Completed
            const completedBadge = screen.getByText('Completed');
            expect(completedBadge).toBeInTheDocument();
            expect(completedBadge).toHaveClass('badge-green');

            // Header settled pill
            expect(screen.getByTestId('foms-collection-settled-pill')).toBeInTheDocument();
            expect(screen.getByTestId('foms-collection-settled-pill')).toHaveTextContent(/Settled & Concluded/i);

            // Settlement banner in collection card
            const settlementBanner = screen.getByTestId('foms-collection-auto-concluded-banner');
            expect(settlementBanner).toBeInTheDocument();
            expect(settlementBanner).toHaveTextContent(
                '[FOMS Payment Notification] Full payment settled for invoice INV-2026-9481. Outstanding balance cleared. Follow-up concluded.'
            );

            // Outstanding amount indicates settled
            expect(screen.getByText('₱0.00 (Settled)')).toBeInTheDocument();

            // Coordinator follow-up concluded note replaces action buttons
            expect(screen.getByTestId('foms-followup-concluded-note')).toHaveTextContent(
                /Collection follow-up concluded — payment settled in full/i
            );
        });
    });

    // ─── 3. In-App Notification Alerts (FR-033) ──────────────────────────────

    describe('3. In-App Notification Alerts (NotificationsTab)', () => {
        const overdueNotification = {
            id: 'notif-overdue-001',
            taskId: 'col-01',
            type: 2, // TaskOverdue
            notificationType: 'TaskOverdue',
            title: 'Invoice Overdue Alert',
            message: 'Invoice INV-2026-9481 for Trans-Pacific Express Cargo is now overdue (Outstanding: ₱145,000.00).',
            isRead: false,
            createdAt: '2026-11-19T10:00:00Z',
        };

        const settledNotification = {
            id: 'notif-paid-002',
            taskId: 'col-01',
            type: 8, // TaskCompleted
            notificationType: 'TaskCompleted',
            title: 'Invoice Payment Settled',
            message: 'Invoice INV-2026-9481 for Trans-Pacific Express Cargo has been settled in full.',
            isRead: false,
            createdAt: '2026-11-19T11:00:00Z',
        };

        it('classifies Invoice Overdue Alert under Task Overdues', () => {
            const classification = classifyNotification(overdueNotification);
            expect(classification).toBe('Task Overdues');
        });

        it('classifies Invoice Payment Settled under Task Completions', () => {
            const classification = classifyNotification(settledNotification);
            expect(classification).toBe('Task Completions');
        });

        it('renders notifications in NotificationsTab and triggers onViewTask on clicking action button', async () => {
            const handleViewTask = vi.fn();
            render(<NotificationsTab onViewTask={handleViewTask} canViewTasks={true} />);

            await waitFor(() => {
                expect(screen.getByText('Invoice Overdue Alert')).toBeInTheDocument();
                expect(screen.getByText('Invoice Payment Settled')).toBeInTheDocument();
            });

            expect(
                screen.getByText(
                    'Invoice INV-2026-9481 for Trans-Pacific Express Cargo is now overdue (Outstanding: ₱145,000.00).'
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    'Invoice INV-2026-9481 for Trans-Pacific Express Cargo has been settled in full.'
                )
            ).toBeInTheDocument();

            // Click View Collection Task
            const viewCollectionBtn = screen.getByRole('button', { name: /View Collection Task/i });
            fireEvent.click(viewCollectionBtn);
            expect(handleViewTask).toHaveBeenCalledWith('col-01');

            // Click View Settled Task
            const viewSettledBtn = screen.getByRole('button', { name: /View Settled Task/i });
            fireEvent.click(viewSettledBtn);
            expect(handleViewTask).toHaveBeenCalledWith('col-01');
        });
    });
});
