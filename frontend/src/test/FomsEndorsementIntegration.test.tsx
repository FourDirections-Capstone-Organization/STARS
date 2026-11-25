import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FomsFinancialMetricsView from '../components/FomsFinancialMetrics/FomsFinancialMetricsView';
import FomsEndorsementPanel from '../components/FomsFinancialMetrics/FomsEndorsementPanel';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import TaskComments from '../components/TaskComments/TaskComments';
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
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(() => Promise.resolve({ data: { isSuccess: true } })),
    },
}));

// Mock Toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: mockToastSuccess,
        error: mockToastError,
        info: mockToastInfo,
    }),
}));

describe('FOMS Physical Invoice Endorsement & 30-Day Payment Term (Integration 1)', () => {
    const mockEndorsementTasks = [
        {
            id: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
            taskNumber: 'TK82C101',
            title: '[FOMS Endorsement] Invoice INV-2026-8810 - Horizon Retail Holdings Inc.',
            description: 'Deliver finalized invoice INV-2026-8810 to client Horizon Retail Holdings Inc. for official receiving endorsement and signature.\nAmount: ₱89,500.00\nDue Date: 30 days upon receipt\nAddress: 7th Floor, Commerce Tower, Ortigas Center, Pasig City\nContact: Atty. Fernando Gomez (09181234567)\nDocument: https://stars.blob.core.windows.net/invoices/INV-2026-8810.pdf\nRemarks: Delivered and endorsed with client wet signature and receiving stamp.',
            status: 3,
            deadline: new Date(Date.now() + 26 * 86400000).toISOString(),
            assignees: [{ fullName: 'Jane Coordinator' }],
            createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
        {
            id: 'c201a9e3-4f2b-42e1-884b-703c90e22002',
            taskNumber: 'TK82C102',
            title: '[FOMS Endorsement] Invoice INV-2026-8811 - Trans-Pacific Express Cargo',
            description: 'Deliver finalized invoice INV-2026-8811 to client Trans-Pacific Express Cargo for official receiving endorsement and signature.\nAmount: ₱145,000.00\nDue Date: 30 days upon receipt\nAddress: Km 18, West Service Road, Parañaque City\nContact: Mr. Victor Ramos (09201234567)\nDocument: https://stars.blob.core.windows.net/invoices/INV-2026-8811.pdf',
            status: 0,
            deadline: new Date(Date.now() + 29 * 86400000).toISOString(),
            assignees: [{ fullName: 'Elena Bautista' }],
            createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
            updatedAt: null,
        },
        {
            id: 'c201a9e3-4f2b-42e1-884b-703c90e22004',
            taskNumber: 'TK82C104',
            title: '[FOMS Endorsement] Invoice INV-2026-8813 - Bayan Logistics & Supply Corp.',
            description: 'Deliver finalized invoice INV-2026-8813 to client Bayan Logistics & Supply Corp. for official receiving endorsement and signature.\nAmount: ₱320,000.00\nDue Date: 30 days upon receipt\nAddress: Block 4, South Expressway Industrial Estate, Biñan, Laguna\nContact: Mr. Eduardo Garcia (09171122334)\nDocument: https://stars.blob.core.windows.net/invoices/INV-2026-8813.pdf',
            status: 1,
            deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
            assignees: [{ fullName: 'Jane Coordinator' }],
            createdAt: new Date().toISOString(),
            updatedAt: null,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('[FOMS Endorsement]')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: { items: mockEndorsementTasks },
                    },
                });
            }
            if (url.includes('dashboard-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalOutstandingBalance: 500000,
                            totalOverdueBalance: 100000,
                            totalInvoicesTracked: 10,
                            overdueInvoicesCount: 1,
                            paidInvoicesCount: 7,
                            pendingInvoicesCount: 2,
                            lastUpdatedAt: new Date().toISOString(),
                            topOutstandingClients: [],
                        },
                    },
                });
            }
            return Promise.resolve({
                data: {
                    isSuccess: true,
                    data: [],
                },
            });
        });
        (api.post as any).mockResolvedValue({
            data: {
                isSuccess: true,
                message: 'Success',
            },
        });
        (api.put as any).mockResolvedValue({
            data: {
                isSuccess: true,
                message: 'Endorsed',
            },
        });
    });

    describe('FomsFinancialMetricsView - Tab Navigation & Endorsement Panel', () => {
        it('renders the 3rd tab for Invoice Endorsement and switches to it', async () => {
            render(<FomsFinancialMetricsView />);

            // Tab button exists
            const endorsementTab = screen.getByRole('button', { name: /invoice endorsement/i });
            expect(endorsementTab).toBeInTheDocument();
            expect(screen.getByText('30-Day Term')).toBeInTheDocument();

            // Click the tab
            fireEvent.click(endorsementTab);

            // Endorsement panel renders
            expect(screen.getByRole('heading', { level: 2, name: /finalized invoice endorsement/i })).toBeInTheDocument();
        });

        it('directly mounts with initialTab="endorsement"', async () => {
            render(<FomsFinancialMetricsView initialTab="endorsement" />);

            expect(screen.getByRole('heading', { level: 2, name: /finalized invoice endorsement/i })).toBeInTheDocument();
            await waitFor(() => {
                expect(screen.getAllByText('Pending Client Sign-off').length).toBeGreaterThanOrEqual(1);
            });
            expect(screen.getByText('Endorsed & Transmitted')).toBeInTheDocument();
            expect(screen.getByText('Total Delivery Exposure')).toBeInTheDocument();
        });

        it('displays incoming FOMS endorsements in Awaiting STARS Task tab with Create STARS Task button', async () => {
            const mockCreateTask = vi.fn();
            render(<FomsEndorsementPanel onCreateTaskForEndorsement={mockCreateTask} />);

            // Awaiting STARS Task sub-tab is displayed first
            expect(screen.getByRole('button', { name: /awaiting stars task/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /active endorsement tasks/i })).toBeInTheDocument();

            // Incoming pending endorsement (INV-2026-8811) appears awaiting task
            await waitFor(() => {
                expect(screen.getByText('INV-2026-8811')).toBeInTheDocument();
            });

            // "Create STARS Task" button is present (like in DMS)
            const createTaskBtns = screen.getAllByRole('button', { name: /create stars task/i });
            expect(createTaskBtns.length).toBeGreaterThanOrEqual(1);

            // Click Create STARS Task
            fireEvent.click(createTaskBtns[0]);

            // Callback triggered with endorsement details
            await waitFor(() => {
                expect(mockCreateTask).toHaveBeenCalledWith(
                    expect.objectContaining({
                        invoiceNumber: expect.stringMatching(/INV-2026-8811|INV-2026-8821/),
                    })
                );
            });
        });

        it('filters active endorsement items using status chips and search input', async () => {
            render(<FomsEndorsementPanel initialSubTab="active" />);

            // Active items present
            await waitFor(() => {
                expect(screen.getByText('INV-2026-8810')).toBeInTheDocument();
            });
            expect(screen.getByText('INV-2026-8813')).toBeInTheDocument();

            // Filter to pending sign-off only
            const pendingChip = screen.getByRole('button', { name: /pending sign-off/i });
            fireEvent.click(pendingChip);

            // INV-2026-8813 is pending sign-off, INV-2026-8810 is already endorsed
            expect(screen.getByText('INV-2026-8813')).toBeInTheDocument();
            expect(screen.queryByText('INV-2026-8810')).not.toBeInTheDocument();

            // Switch back to all
            const allChip = screen.getByRole('button', { name: /all invoices/i });
            fireEvent.click(allChip);

            // Search by invoice number
            const searchInput = screen.getByPlaceholderText(/search invoice, client, or courier/i);
            fireEvent.change(searchInput, { target: { value: '8813' } });

            expect(screen.getByText('INV-2026-8813')).toBeInTheDocument();
            expect(screen.queryByText('INV-2026-8810')).not.toBeInTheDocument();
        });

        it('opens sign-off modal and records client receiving endorsement', async () => {
            render(<FomsEndorsementPanel initialSubTab="active" />);

            await waitFor(() => {
                expect(screen.getByText('INV-2026-8813')).toBeInTheDocument();
            });

            // Click Record Sign-off on active item (INV-2026-8813)
            const actionsBtns = screen.getAllByRole('button', { name: /actions/i });
            fireEvent.click(actionsBtns[1]);
            const signBtn = screen.getByRole('button', { name: /record sign-off/i });
            fireEvent.click(signBtn);

            expect(screen.getByText(/Record Client Receiving Endorsement/i)).toBeInTheDocument();
            expect(screen.getByText(/Calculated 30-Day Payment Due Date/i)).toBeInTheDocument();

            // Submit the form in FomsEndorsementPanel
            const submitBtn = screen.getByRole('button', { name: /confirm endorsement & sync to foms/i });
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(mockToastSuccess).toHaveBeenCalledWith(
                    expect.stringContaining('Signed copy recorded! 30-day payment clock triggered')
                );
            });
        });

        it('fetches from GET /api/foms-integration/endorsements and renders calculatedPaymentDueDate and assigned coordinator in the endorsement table', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/foms-integration/endorsements')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                {
                                    id: 'live-endorse-c201a9e3-4f2b-42e1-884b-703c90e22001',
                                    taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
                                    taskNumber: 'TK82C101',
                                    invoiceNumber: 'INV-2026-8810',
                                    clientName: 'Horizon Retail Holdings Inc.',
                                    invoiceAmount: 89500,
                                    billingDate: '2026-11-01T00:00:00Z',
                                    actualReceivedDate: '2026-11-10T00:00:00Z',
                                    calculatedPaymentDueDate: '2026-12-10T00:00:00Z',
                                    endorsementStatus: 'Completed',
                                    fomsSyncStatus: 'Synced',
                                    assignedCoordinatorName: 'Jane Coordinator',
                                    taskStatus: 'Completed',
                                },
                            ],
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<FomsEndorsementPanel initialSubTab="active" />);

            await waitFor(() => {
                expect(screen.getByText('INV-2026-8810')).toBeInTheDocument();
            });
            expect(screen.getByText('Jane Coordinator')).toBeInTheDocument();
            expect(screen.getByTestId('calculated-payment-due-date')).toHaveTextContent(/12\/10\/2026|Dec 10, 2026/);
        });

        it('displays sync failure banner, warning badge, and handles Retry Sync to FOMS for failed endorsements', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/foms-integration/endorsements')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                {
                                    id: 'live-endorse-c201a9e3-4f2b-42e1-884b-703c90e22001',
                                    taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
                                    taskNumber: 'TK82C101',
                                    invoiceNumber: 'INV-2026-8810',
                                    clientName: 'Horizon Retail Holdings Inc.',
                                    invoiceAmount: 89500,
                                    actualReceivedDate: '2026-11-10T00:00:00Z',
                                    calculatedPaymentDueDate: '2026-12-10T00:00:00Z',
                                    endorsementStatus: 'Completed',
                                    fomsSyncStatus: 'Failed',
                                    lastSyncError: 'FOMS gateway timeout on callback',
                                    assignedCoordinatorName: 'Jane Coordinator',
                                    taskStatus: 'Completed',
                                },
                            ],
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<FomsEndorsementPanel initialSubTab="active" />);

            // Banner is visible
            await waitFor(() => {
                expect(screen.getByTestId('foms-sync-failure-banner')).toBeInTheDocument();
            });
            expect(screen.getByTestId('foms-sync-failed-badge')).toBeInTheDocument();

            // Retry button is available
            const retryBtn = screen.getByTestId('retry-sync-to-foms-btn-INV-2026-8810');
            expect(retryBtn).toBeInTheDocument();

            // Click retry button
            fireEvent.click(retryBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/tasks/c201a9e3-4f2b-42e1-884b-703c90e22001/resend',
                    {}
                );
            });
            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Sent endorsement completion callback to FOMS')
            );
        });
    });

    describe('TaskView - [FOMS Endorsement] Task Detection & Operations', () => {
        const regularTask: TaskViewTask = {
            taskId: 'tk-reg-01',
            taskTitle: 'Standard Office Inventory Check',
            taskDescription: 'Count inventory supplies.',
            priority: 'Low',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            taskStatus: 'In Progress',
            assignedEmployee: 'John Doe',
            createdAt: new Date().toISOString(),
        };

        const endorsementTask: TaskViewTask = {
            taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
            taskTitle: '[FOMS Endorsement] Invoice INV-2026-8810 - Horizon Retail Holdings Inc.',
            taskDescription:
                'Deliver finalized invoice INV-2026-8810 to client Horizon Retail Holdings Inc.\n' +
                'Amount: ₱89,500.00\n' +
                'Address: 7th Floor, Commerce Tower, Ortigas Center, Pasig City\n' +
                'Contact: Atty. Fernando Gomez (09181234567)\n' +
                'Email: fernando.gomez@horizonretail.ph\n' +
                'Document: https://stars.blob.core.windows.net/invoices/INV-2026-8810.pdf\n\n' +
                'Remarks: Finalized commercial invoice requiring physical delivery and wet-ink sign-off.',
            priority: 'High',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            taskStatus: 'In Progress',
            assignedEmployee: 'Jane Coordinator',
            assignedTo: 'Jane Coordinator',
            createdAt: new Date().toISOString(),
        };

        it('does not render FOMS Endorsement section for non-endorsement tasks', () => {
            render(<TaskView task={regularTask} />);

            expect(screen.queryByText(/FOMS Physical Invoice Delivery & Endorsement/i)).not.toBeInTheDocument();
        });

        it('renders the FOMS Endorsement section with parsed invoice, address, and client info', () => {
            render(<TaskView task={endorsementTask} />);

            // Section header
            expect(screen.getByText('FOMS Physical Invoice Delivery & Endorsement')).toBeInTheDocument();
            expect(screen.getByText(/Physical Delivery \/ Pending Sign-off/i)).toBeInTheDocument();

            // Stats banner
            expect(screen.getByText('INVOICE AMOUNT')).toBeInTheDocument();
            expect(screen.getByText('₱89,500.00')).toBeInTheDocument();
            expect(screen.getByText('INV-2026-8810')).toBeInTheDocument();
            expect(screen.getByText('30-DAY PAYMENT DUE')).toBeInTheDocument();
            expect(screen.getByText(/Triggers on client sign-off/i)).toBeInTheDocument();

            // Client & delivery details
            expect(screen.getByText('Horizon Retail Holdings Inc.')).toBeInTheDocument();
            expect(screen.getByText('Atty. Fernando Gomez')).toBeInTheDocument();
            expect(screen.getByText('09181234567')).toBeInTheDocument();
            expect(screen.getByText('fernando.gomez@horizonretail.ph')).toBeInTheDocument();
            expect(screen.getByText('7th Floor, Commerce Tower, Ortigas Center, Pasig City')).toBeInTheDocument();

            // Action button
            expect(screen.getByRole('button', { name: /record signed copy & trigger 30-day term/i })).toBeInTheDocument();
        });

        it('opens modal from TaskView and records signed copy triggering 30-day payment term', async () => {
            render(<TaskView task={endorsementTask} />);

            // Click button to open modal
            const recordBtn = screen.getByRole('button', { name: /record signed copy & trigger 30-day term/i });
            fireEvent.click(recordBtn);

            // Modal elements
            expect(screen.getByText('Record Client Receiving Endorsement')).toBeInTheDocument();
            expect(screen.getByText(/Calculated 30-Day Payment Term Due Date/i)).toBeInTheDocument();

            // Submit form in TaskView
            const submitBtn = screen.getByRole('button', { name: /record & transmit to foms/i });
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(mockToastSuccess).toHaveBeenCalledWith(
                    expect.stringContaining('Signed receiving copy recorded! 30-day payment term activated in FOMS')
                );
            });
        });

        it('displays sync failure banner, warning badge, and handles Retry Sync to FOMS when callback fails', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/foms-integration/tasks/')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
                                invoiceNumber: 'INV-2026-8810',
                                clientName: 'Horizon Retail Holdings Inc.',
                                invoiceAmount: 89500,
                                actualReceivedDate: '2026-11-10T00:00:00Z',
                                calculatedPaymentDueDate: '2026-12-10T00:00:00Z',
                                endorsementStatus: 'Completed',
                                fomsSyncStatus: 'Failed',
                                lastSyncError: 'Connection refused to FOMS callback endpoint',
                            },
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<TaskView task={endorsementTask} />);

            await waitFor(() => {
                expect(screen.getByTestId('foms-sync-failure-banner')).toBeInTheDocument();
            });
            expect(screen.getByTestId('foms-sync-failed-badge')).toBeInTheDocument();
            expect(screen.getByTestId('tv-calculated-due-date')).toBeInTheDocument();

            const retryBtn = screen.getByTestId('retry-sync-to-foms-btn');
            expect(retryBtn).toBeInTheDocument();

            fireEvent.click(retryBtn);

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/tasks/c201a9e3-4f2b-42e1-884b-703c90e22001/resend',
                    {}
                );
            });
            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Endorsement completion callback transmitted to FOMS')
            );
        });

        it('displays 30-Day Payment Clock Active when taskStatus is Completed instead of remaining pending sign-off', async () => {
            render(
                <TaskView
                    task={{
                        ...endorsementTask,
                        taskStatus: 'Completed',
                    }}
                    onClose={vi.fn()}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('30-Day Payment Clock Active')).toBeInTheDocument();
                expect(screen.queryByText('Physical Delivery / Pending Sign-off')).not.toBeInTheDocument();
            });
        });

        it('dispatches endorsement completion transmission to FOMS upon approving an endorsement task', async () => {
            localStorage.setItem('userRole', 'Coordinator');
            render(
                <TaskView
                    task={{
                        ...endorsementTask,
                        taskStatus: 'Done/Pending Review',
                    }}
                    onClose={vi.fn()}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: /approve/i }));

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    expect.stringContaining('/api/foms-integration/tasks/c201a9e3-4f2b-42e1-884b-703c90e22001/resend'),
                    {}
                );
            });
        });
    });

    describe('TaskComments - [FOMS Endorsement Sync] Audit Remarks', () => {
        it('renders duplicate remark comment [FOMS Endorsement Sync] in the task discussion thread', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/comments')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                {
                                    id: 'tc-foms-dup-01',
                                    taskCommentId: 'tc-foms-dup-01',
                                    taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
                                    authorId: 'foms-system',
                                    authorName: 'FOMS Integration',
                                    content: '[FOMS Endorsement Sync] Duplicate endorsement request received from FOMS for invoice INV-2026-8810. Details verified and acknowledged.',
                                    message: '[FOMS Endorsement Sync] Duplicate endorsement request received from FOMS for invoice INV-2026-8810. Details verified and acknowledged.',
                                    createdAt: new Date().toISOString(),
                                },
                            ],
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <TaskComments
                    taskId="c201a9e3-4f2b-42e1-884b-703c90e22001"
                    currentEmployeeId="user-01"
                    taskReferenceNumber="TK82C101"
                />
            );

            expect(await screen.findByTestId('tc-foms-duplicate-remark')).toBeInTheDocument();
            expect(screen.getByText('Duplicate Endorsement Sync')).toBeInTheDocument();
            expect(
                screen.getByText(/\[FOMS Endorsement Sync\] Duplicate endorsement request received from FOMS for invoice INV-2026-8810/i)
            ).toBeInTheDocument();
        });
    });

    describe('Defect 2: Backend Ground Truth for Invoice & Client Contact Details', () => {
        it('prioritizes backend endorsement details for client enterprise, receiving contact, phone, email, and amount', async () => {
            const taskWithHyphenatedTitle: TaskViewTask = {
                taskId: 'task-foms-defect-2',
                taskNumber: 'TK-FOMS-DEF2',
                taskTitle: '[FOMS Endorsement] Invoice INV-2026-8821 - Megaworld Corporation - Global Tower',
                taskDescription: 'Deliver finalized invoice INV-2026-8821 to client Generic Corp for official receiving endorsement.\nAmount: ₱10,000.00\nAddress: Old Address\nContact: Old Contact (09000000000)\nEmail: old@corp.com\nDocument: https://stars.blob.core.windows.net/invoices/INV-2026-8821.pdf',
                taskStatus: 'InProgress',
                taskCategory: 'Financial Operations',
                priority: 'High',
            };

            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/endorsement-details')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: 'task-foms-defect-2',
                                invoiceNumber: 'INV-2026-8821',
                                clientName: 'Megaworld Corporation - Global Tower',
                                clientContactPerson: 'Maria Santos',
                                clientContactNumber: '+63 917 123 4567',
                                clientEmail: 'msantos@megaworldcorp.com',
                                clientAddress: '30th Floor, Alliance Global Tower, Uptown Bonifacio, Taguig City',
                                invoiceAmount: 185000.00,
                                invoiceDocumentUrl: 'https://stars.blob.core.windows.net/invoices/INV-2026-8821.pdf',
                                endorsementStatus: 'PendingEndorsement',
                                fomsSyncStatus: 'Pending',
                            },
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <TaskView
                    task={taskWithHyphenatedTitle}
                    currentUserId="user-01"
                    currentUserRole="OperationsManager"
                    onClose={vi.fn()}
                    onStatusChange={vi.fn()}
                />
            );

            // Wait for endorsement detail to load and verify backend truth is displayed
            await waitFor(() => {
                expect(screen.getByText('Megaworld Corporation - Global Tower')).toBeInTheDocument();
                expect(screen.getByText('Maria Santos')).toBeInTheDocument();
                expect(screen.getByText('+63 917 123 4567')).toBeInTheDocument();
                expect(screen.getByText('msantos@megaworldcorp.com')).toBeInTheDocument();
                expect(screen.getByText('30th Floor, Alliance Global Tower, Uptown Bonifacio, Taguig City')).toBeInTheDocument();
                expect(screen.getByText('₱185,000.00')).toBeInTheDocument();
            });

            // Ensure old fallback text is NOT displayed
            expect(screen.queryByText('Generic Corp')).not.toBeInTheDocument();
            expect(screen.queryByText('Old Contact')).not.toBeInTheDocument();
            expect(screen.queryByText('old@corp.com')).not.toBeInTheDocument();
        });
    });

    describe('Defect 4: Remove Live Delivery Tracker button on Invoice Tasks', () => {
        it('does not render Live Delivery Tracker button for invoice tasks even when delivery details exist', async () => {
            const invoiceTask: TaskViewTask = {
                taskId: 'task-foms-invoice-tracker-test',
                taskNumber: 'TK-FOMS-INV01',
                taskTitle: '[FOMS Endorsement] Invoice INV-2026-9901 - Enterprise Solutions',
                taskDescription: 'Deliver finalized invoice INV-2026-9901 to client Enterprise Solutions for official receiving endorsement.',
                taskStatus: 'InProgress',
                taskCategory: 'Financial Operations',
                priority: 'High',
            };

            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/delivery-details')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: 'task-foms-invoice-tracker-test',
                                dmsOrderId: 'dms-ord-01',
                                dmsWaybillNo: 'WB-FOMS-9901',
                                recipientName: 'Enterprise Solutions',
                                deliveryAddress: 'BGC, Taguig',
                                syncStatus: 'Synced',
                            },
                        },
                    });
                }
                if (url.includes('/endorsement-details')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: 'task-foms-invoice-tracker-test',
                                invoiceNumber: 'INV-2026-9901',
                                clientName: 'Enterprise Solutions',
                                endorsementStatus: 'PendingEndorsement',
                            },
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(
                <TaskView
                    task={invoiceTask}
                    currentUserId="user-01"
                    currentUserRole="OperationsManager"
                    onClose={vi.fn()}
                    onStatusChange={vi.fn()}
                    onNavigateToDmsTracker={vi.fn()}
                />
            );

            // Verify Live Delivery Tracker button is NOT present for invoice task
            expect(screen.queryByTestId('tv-dms-tracker-btn')).not.toBeInTheDocument();
            expect(screen.queryByTestId('tv-dms-pending-tracker-btn')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Live Delivery Tracker/i })).not.toBeInTheDocument();
        });
    });

    describe('Defect 5: Invoice Endorsement Automatically Creates STARS Task Assigned to Test Coordinator', () => {
        it('automatically dispatches task creation assigned to Test Coordinator upon clicking Create STARS Task', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/assignable-users')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                items: [
                                    {
                                        userId: 'crd-test-001',
                                        fullName: 'Test Coordinator',
                                        employeeNumber: 'CRD001',
                                        role: 'Coordinator',
                                    },
                                ],
                            },
                        },
                    });
                }
                if (url.includes('/endorsements')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                {
                                    id: 'live-pending-8850',
                                    taskId: '',
                                    taskNumber: 'PENDING',
                                    invoiceNumber: 'INV-2026-8850',
                                    clientName: 'Megaworld Corp',
                                    invoiceAmount: 75000,
                                    endorsementStatus: 'PendingEndorsement',
                                    fomsSyncStatus: 'Pending',
                                    dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
                                },
                            ],
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            (api.post as any).mockImplementation((url: string, payload: any) => {
                if (url === '/api/Task') {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                id: 'new-stars-task-8850',
                                title: payload.title,
                            },
                        },
                    });
                }
                if (url.includes('/link-endorsement')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true } });
            });

            render(<FomsEndorsementPanel initialSubTab="pending" />);

            // Wait for pending item to appear
            await waitFor(() => {
                expect(screen.getByText('INV-2026-8850')).toBeInTheDocument();
            });

            const createBtn = screen.getByRole('button', { name: /create stars task/i });
            expect(createBtn).toBeInTheDocument();

            // Click Create STARS Task
            fireEvent.click(createBtn);

            // Verify task was automatically posted to /api/Task with Test Coordinator assigned
            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/Task',
                    expect.objectContaining({
                        title: expect.stringContaining('INV-2026-8850'),
                        assignedUserIds: ['crd-test-001'],
                        category: 'Financial Operations',
                        priority: 'High',
                    })
                );
            });

            // Verify endorsement was automatically linked
            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    '/api/foms-integration/tasks/link-endorsement',
                    expect.objectContaining({
                        taskId: 'new-stars-task-8850',
                        invoiceNumber: 'INV-2026-8850',
                    })
                );
            });

            // Success toast was emitted
            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.stringMatching(/assigned to Test Coordinator/i)
            );
        });
    });
});
