import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FomsFinancialMetricsView from '../components/FomsFinancialMetrics/FomsFinancialMetricsView';
import FomsEndorsementPanel from '../components/FomsFinancialMetrics/FomsEndorsementPanel';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
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
        it('renders the 3rd tab for Physical Invoice Endorsement and switches to it', async () => {
            render(<FomsFinancialMetricsView />);

            // Tab button exists
            const endorsementTab = screen.getByRole('button', { name: /physical invoice endorsement/i });
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
            expect(mockCreateTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    invoiceNumber: expect.stringMatching(/INV-2026-8811|INV-2026-8821/),
                })
            );
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
    });
});
