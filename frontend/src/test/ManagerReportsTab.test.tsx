import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SystemAdmin_Dashboard from '../Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard';
import { ReportsErrorBoundary } from '../components/ReportsErrorBoundary/ReportsErrorBoundary';

// Mock Recharts ResponsiveContainer to render children directly in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock KpiDrillDown to prevent unrelated drilldown queries during Reports tab render
vi.mock('../Pages/OpAdmin_Dashboard/KpiDrillDown', () => ({
    KpiDrillDownView: () => <div data-testid="mock-kpi-drilldown">KPI Drilldown View</div>,
}));

// Mock api
vi.mock('../api', () => ({
    default: {
        get: vi.fn((url: string) => {
            if (url.includes('/api/reports/filter-options')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            departments: [{ id: 'dept-1', name: 'Logistics' }],
                            employees: [{ id: 'emp-1', name: 'John Doe' }],
                        },
                    },
                });
            }
            if (url.includes('/api/Task')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: [],
                    },
                });
            }
            if (url.includes('/api/systemadmin/users')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: { items: [], totalPages: 1 },
                    },
                });
            }
            if (url.includes('/api/reports/task-completion')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalTasksCompleted: 10,
                            totalTasksInProgress: 5,
                            totalTasksPendingReview: 2,
                            totalOverdueTasks: 1,
                            tasks: [],
                            employeeCompletions: [],
                        },
                    },
                });
            }
            if (url.includes('/api/reports/operational-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalTasks: 20,
                            completedTasks: 15,
                            pendingTasks: 4,
                            overdueTasks: 1,
                            departmentSummaries: [],
                        },
                    },
                });
            }
            if (url.includes('/api/reports/performance')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalCompletedTasks: 12,
                            employeeKpis: [],
                        },
                    },
                });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: [],
                    },
                });
            }
            if (url.includes('/api/reports/financial')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalEndorsements: 5,
                            totalAmount: 10000,
                            records: [],
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        }),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

// Mock Toast
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
    ToastProvider: ({ children }: any) => <div>{children}</div>,
}));

describe('Manager Reports Tab White Screen Defect Fix', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('authToken', 'mock-token');
        localStorage.setItem('employeeRole', 'Manager');
        localStorage.setItem('role', 'Manager');
        localStorage.setItem('employeeName', 'Manager User');
    });

    it('renders Reports tab without crashing when clicking Reports in sidebar', async () => {
        render(
            <MemoryRouter>
                <SystemAdmin_Dashboard />
            </MemoryRouter>
        );

        // Find the Reports link in the sidebar
        const reportsButtons = screen.getAllByText('Reports');
        expect(reportsButtons.length).toBeGreaterThan(0);

        // Click Reports link
        fireEvent.click(reportsButtons[0]);

        // Verify Reports view is displayed and did not crash to white screen
        await waitFor(() => {
            expect(screen.getByText('KPI Tracking')).toBeInTheDocument();
            expect(screen.getByText('Task Completion')).toBeInTheDocument();
            expect(screen.getByText('Operational Report')).toBeInTheDocument();
            expect(screen.getByText('Performance Report')).toBeInTheDocument();
            expect(screen.getByText('Delivery Analytics')).toBeInTheDocument();
            expect(screen.getByText('Financial Report')).toBeInTheDocument();
        });
    });

    it('can switch across sub-tabs in Reports without crashing', async () => {
        render(
            <MemoryRouter>
                <SystemAdmin_Dashboard />
            </MemoryRouter>
        );

        // Click Reports link
        const reportsButtons = screen.getAllByText('Reports');
        fireEvent.click(reportsButtons[0]);

        await waitFor(() => {
            expect(screen.getByText('Task Completion')).toBeInTheDocument();
        });

        // Click Task Completion sub-tab
        fireEvent.click(screen.getByText('Task Completion'));
        await waitFor(() => {
            expect(screen.getByText(/Task Completion Reports/i)).toBeInTheDocument();
        });

        // Click Delivery Analytics sub-tab
        fireEvent.click(screen.getByText('Delivery Analytics'));
        await waitFor(() => {
            expect(screen.getByText(/DMS Delivery Completion/i)).toBeInTheDocument();
        });
    });

    it('ReportsErrorBoundary catches child errors without unmounting entire UI into a white screen', () => {
        const ThrowingChild = () => {
            throw new Error('Test report crash');
        };

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <ReportsErrorBoundary>
                <ThrowingChild />
            </ReportsErrorBoundary>
        );

        expect(screen.getByText('Unable to Display Reports')).toBeInTheDocument();
        expect(screen.getByText(/Test report crash/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();

        consoleSpy.mockRestore();
    });
});
