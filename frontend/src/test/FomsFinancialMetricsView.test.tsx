import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FomsFinancialMetricsView from '../components/FomsFinancialMetrics/FomsFinancialMetricsView';
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
    },
}));

describe('FomsFinancialMetricsView', () => {
    const mockSummary = {
        totalOutstandingBalance: 1250000.5,
        totalOverdueBalance: 350000.0,
        totalInvoicesTracked: 42,
        overdueInvoicesCount: 5,
        paidInvoicesCount: 28,
        pendingInvoicesCount: 9,
        lastUpdatedAt: new Date().toISOString(),
        topOutstandingClients: [
            {
                clientAccountId: 'CLI-TEST-01',
                clientName: 'Test Logistics Corp',
                outstandingBalance: 85000.0,
                overdueInvoicesCount: 2,
                latestStatus: 'Overdue',
                nextDueDate: new Date(Date.now() - 3 * 86400000).toISOString(),
            },
            {
                clientAccountId: 'CLI-TEST-02',
                clientName: 'Alpha Retail Partners',
                outstandingBalance: 0.0,
                overdueInvoicesCount: 0,
                latestStatus: 'Paid',
                nextDueDate: null,
            },
            {
                clientAccountId: 'CLI-TEST-03',
                clientName: 'Metro Express Inc',
                outstandingBalance: 120000.0,
                overdueInvoicesCount: 0,
                latestStatus: 'Sent',
                nextDueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
            },
        ],
    };

    const mockCoordinators = [
        {
            userId: 'user-coord-01',
            fullName: 'Jane Coordinator',
            role: 'Coordinator',
            department: 'Operations',
            workload: 2,
            isAvailable: true,
            availabilityStatus: 'Active',
            isOptimalCandidate: true,
        },
        {
            userId: 'user-coord-02',
            fullName: 'Mark Santos',
            role: 'Coordinator',
            department: 'Operations',
            workload: 4,
            isAvailable: true,
            availabilityStatus: 'Active',
            isOptimalCandidate: false,
        },
    ];

    const mockCollectionTasks = [
        {
            id: 'c102a9e3-4f2b-42e1-884b-703c90e21a01',
            taskNumber: 'TK48B901',
            title: '[Collection Follow-up] Invoice INV-2026-9481 - Trans-Pacific Express Cargo',
            description: 'Automated collection follow-up routed from FOMS.\nInvoice: INV-2026-9481\nAmount Due: ₱145,000.00\nAging: 31-60 (35 days overdue)\nDue Date: 2026-09-18\nClient Account: CLI-TRANSPAC-02 (Trans-Pacific Express Cargo)\nContact: Mr. Victor Ramos (09201234567)\nEmail: victor.ramos@transpacific.com\nAddress: Km 18, West Service Road, Parañaque City',
            priorityLevel: 3,
            status: 1,
            deadline: new Date(Date.now() - 35 * 86400000).toISOString(),
            assignees: [{ fullName: 'Jane Coordinator' }],
            createdAt: new Date().toISOString(),
        },
        {
            id: 'c102a9e3-4f2b-42e1-884b-703c90e21a02',
            taskNumber: 'TK71C342',
            title: '[Collection Follow-up] Invoice INV-2026-9482 - Horizon Retail Holdings Inc.',
            description: 'Automated collection follow-up routed from FOMS.\nInvoice: INV-2026-9482\nAmount Due: ₱89,500.00\nAging: 1-30 (15 days overdue)\nDue Date: 2026-10-08\nClient Account: CLI-HORIZON-01\nContact: Ms. Clara Dizon',
            priorityLevel: 2,
            status: 0,
            deadline: new Date(Date.now() - 15 * 86400000).toISOString(),
            assignees: [{ fullName: 'Mark Santos' }],
            createdAt: new Date().toISOString(),
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('dashboard-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockSummary,
                    },
                });
            }
            if (url.includes('[Collection Follow-up]')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: mockCollectionTasks,
                        },
                    },
                });
            }
            if (url.includes('assignable-users')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: mockCoordinators,
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
    });

    it('renders the FOMS header, live stream beacon, and KPI metrics', async () => {
        render(<FomsFinancialMetricsView />);

        // Header elements
        expect(screen.getByText('FOMS Financial & Invoice Operations')).toBeInTheDocument();
        expect(screen.getByText('Live FOMS Feed')).toBeInTheDocument();

        // Wait for sync to complete
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
            expect(screen.getByText('₱1,250,000.50')).toBeInTheDocument();
            expect(screen.getByText('₱350,000.00')).toBeInTheDocument();
        });

        // KPI card labels
        expect(screen.getByText('Total Outstanding')).toBeInTheDocument();
        expect(screen.getByText('Overdue Exposure')).toBeInTheDocument();
        expect(screen.getByText('Tracked Invoices')).toBeInTheDocument();
        expect(screen.getAllByText('Overdue Invoices').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Settled / Paid')).toBeInTheDocument();
        expect(screen.getByText('In-Term / Pending')).toBeInTheDocument();
    });

    it('renders the client financial status table with real-time rows', async () => {
        render(<FomsFinancialMetricsView />);

        await waitFor(() => {
            expect(screen.getByText('Test Logistics Corp')).toBeInTheDocument();
            expect(screen.getByText('CLI-TEST-01')).toBeInTheDocument();
            expect(screen.getByText('Alpha Retail Partners')).toBeInTheDocument();
            expect(screen.getByText('Metro Express Inc')).toBeInTheDocument();
        });

        // Overdue chip
        expect(screen.getByText(/2 overdue/i)).toBeInTheDocument();
    });

    it('filters client accounts when using search and status pills', async () => {
        render(<FomsFinancialMetricsView />);

        await waitFor(() => {
            expect(screen.getByText('Test Logistics Corp')).toBeInTheDocument();
        });

        // Search for "Alpha"
        const searchInput = screen.getByPlaceholderText(/search client name or account ID/i);
        fireEvent.change(searchInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha Retail Partners')).toBeInTheDocument();
        expect(screen.queryByText('Test Logistics Corp')).not.toBeInTheDocument();

        // Clear search
        fireEvent.change(searchInput, { target: { value: '' } });

        // Click "Overdue Only" filter chip
        const overdueChip = screen.getByRole('button', { name: /overdue only/i });
        fireEvent.click(overdueChip);

        expect(screen.getByText('Test Logistics Corp')).toBeInTheDocument();
        expect(screen.queryByText('Alpha Retail Partners')).not.toBeInTheDocument();
    });

    it('opens client details modal when clicking Details action for an overdue client', async () => {
        const handleViewTasks = vi.fn();
        render(<FomsFinancialMetricsView onViewClientTasks={handleViewTasks} />);

        await waitFor(() => {
            expect(screen.getByText('Test Logistics Corp')).toBeInTheDocument();
        });

        // Search for Test Logistics Corp to isolate its details button
        const searchInput = screen.getByPlaceholderText(/search client name or account ID/i);
        fireEvent.change(searchInput, { target: { value: 'Test Logistics' } });

        const detailBtn = screen.getByRole('button', { name: /details/i });
        fireEvent.click(detailBtn);

        // Modal should open with High Exposure Alert
        expect(screen.getByText('High Exposure Alert')).toBeInTheDocument();
        expect(screen.getByText(/A Collection Follow-up task in STARS may be required/i)).toBeInTheDocument();

        // Click Find Related Tasks
        const findTasksBtn = screen.getByRole('button', { name: /find related tasks/i });
        fireEvent.click(findTasksBtn);

        expect(handleViewTasks).toHaveBeenCalledWith('Test Logistics Corp', 'CLI-TEST-01');
    });

    it('handles manual sync button click', async () => {
        render(<FomsFinancialMetricsView />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
        });

        const syncBtn = screen.getByRole('button', { name: /sync now/i });
        fireEvent.click(syncBtn);

        expect(api.get).toHaveBeenCalledWith('/api/integration/foms/dashboard-summary');
    });

    it('switches to Collection Alerts & Graph Routing tab and renders workload matrix', async () => {
        render(<FomsFinancialMetricsView />);

        // Click the Graph Routing tab in the hub navigation
        const routingTab = screen.getByRole('button', { name: /collection alerts & graph routing/i });
        fireEvent.click(routingTab);

        // Verify Hero & Pipeline
        expect(screen.getByText('Automated Collection Alerts & Workload Routing')).toBeInTheDocument();
        expect(screen.getByText('FOMS Alert Intercepted')).toBeInTheDocument();
        expect(screen.getByText('Workload Graph Evaluator')).toBeInTheDocument();

        // Verify Coordinator Workload Matrix
        expect(screen.getByText('Real-Time Coordinator Workload Matrix')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getAllByText(/Jane Coordinator/i).length).toBeGreaterThanOrEqual(1);
        });
        expect(screen.getAllByText(/Optimal Workload Match/i).length).toBeGreaterThanOrEqual(1);

        // Verify Intercepted Overdue Accounts Table
        expect(screen.getByText('Intercepted Overdue Accounts & Generated Tasks')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('INV-2026-9481')).toBeInTheDocument();
        });
        expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
    });

    it('filters collection alerts by aging status dropdown in Graph Routing tab', async () => {
        render(<FomsFinancialMetricsView initialTab="routing" />);

        await waitFor(() => {
            expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
        });
        expect(screen.getByText('Horizon Retail Holdings Inc.')).toBeInTheDocument();

        // Select "31-60 Days Overdue" from dropdown
        const select = screen.getByRole('combobox', { name: /filter by aging status/i });
        fireEvent.change(select, { target: { value: '31_60' } });

        // Trans-Pacific is 35 days (31-60), Horizon is 15 days (1-30)
        expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
        expect(screen.queryByText('Horizon Retail Holdings Inc.')).not.toBeInTheDocument();
    });

    it('opens the FOMS Alert Simulator modal and applies preset scenarios', async () => {
        render(<FomsFinancialMetricsView initialTab="routing" />);

        const simBtn = screen.getByRole('button', { name: /simulate foms alert/i });
        fireEvent.click(simBtn);

        // Modal should be open
        expect(screen.getByText(/FOMS Alert Interception & Graph Routing Simulator/i)).toBeInTheDocument();
        expect(screen.getByText(/Quick Scenario Presets:/i)).toBeInTheDocument();

        // Apply a preset
        const criticalPreset = screen.getByRole('button', { name: /Critical 61-90/i });
        fireEvent.click(criticalPreset);

        // Amount due should be updated to 340000
        const amountInput = screen.getByDisplayValue('340000');
        expect(amountInput).toBeInTheDocument();
    });

    it('opens Graph Routing Engine Decision Trace modal', async () => {
        render(<FomsFinancialMetricsView initialTab="routing" />);

        await waitFor(() => {
            expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
        });

        const traceBtns = screen.getAllByRole('button', { name: /trace/i });
        fireEvent.click(traceBtns[0]);

        // Inspector modal open
        expect(screen.getByText(/Graph Routing Engine Decision Trace/i)).toBeInTheDocument();
        expect(screen.getByText('Execution Graph Architecture')).toBeInTheDocument();
        expect(screen.getByText('FOMS Aging Engine')).toBeInTheDocument();
        expect(screen.getByText('STARS Webhook Interceptor')).toBeInTheDocument();
    });

    it('calls onOpenTask when clicking View Task in the alerts stream', async () => {
        const handleOpenTask = vi.fn();
        render(<FomsFinancialMetricsView initialTab="routing" onOpenTask={handleOpenTask} />);

        await waitFor(() => {
            expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
        });

        const actionsBtns = screen.getAllByRole('button', { name: /actions/i });
        fireEvent.click(actionsBtns[0]);

        const viewTaskBtn = screen.getByRole('button', { name: /view stars task/i });
        fireEvent.click(viewTaskBtn);

        expect(handleOpenTask).toHaveBeenCalledWith('c102a9e3-4f2b-42e1-884b-703c90e21a01');
    });
});
