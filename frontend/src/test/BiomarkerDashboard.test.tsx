import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BiomarkerDashboard from '../Pages/EmergingTechAI/BiomarkerDashboard';
import { analyticsService, LatestBiomarkerResponse, BiomarkerAlertDTO } from '../services/analyticsService';
import api from '../api';

// Mock Recharts ResponsiveContainer for jsdom compatibility
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
    },
}));

vi.mock('../services/analyticsService', () => ({
    analyticsService: {
        checkHealth: vi.fn(),
        fetchLatestAlertsPaged: vi.fn(),
        triggerScan: vi.fn(),
        CHART_FETCH_LIMIT: 500,
    },
}));

describe('BiomarkerDashboard Component Integration', () => {
    const mockAlerts: BiomarkerAlertDTO[] = [
        {
            id: 'alert-101',
            scanDateTime: '2026-10-26T08:30:00Z',
            scanDate: '2026-10-26',
            departmentId: 'dept-alpha-001',
            departmentName: 'Delivery Fleet',
            employeeName: 'Carlos Rivera',
            employeeNumber: 'C-2001',
            metricName: 'OnTimeRate',
            currentValue: 72,
            thresholdValue: 90,
            severity: 'Critical',
            description: 'Carlos Rivera failed to meet SLA minimum on-time rate',
            isAcknowledged: false,
            createdAt: '2026-10-26T08:30:00Z',
        },
        {
            id: 'alert-102',
            scanDateTime: '2026-10-26T08:30:00Z',
            scanDate: '2026-10-26',
            departmentId: 'dept-beta-002',
            departmentName: 'Sorting Hub',
            employeeName: 'Diana Prince',
            employeeNumber: 'C-2002',
            metricName: 'HighWorkload',
            currentValue: 14,
            thresholdValue: 10,
            severity: 'Warning',
            description: 'High parcel backlog assigned to Diana Prince',
            isAcknowledged: true,
            createdAt: '2026-10-26T08:30:00Z',
        },
        {
            id: 'alert-103',
            scanDateTime: '2026-10-26T08:30:00Z',
            scanDate: '2026-10-26',
            departmentId: 'dept-alpha-001',
            departmentName: 'Delivery Fleet',
            metricName: 'InactiveEmployee',
            currentValue: 1,
            thresholdValue: 0,
            severity: 'Info',
            description: 'Employee Evan Wright (C-2003) inactive for over 10 days',
            isAcknowledged: true,
            createdAt: '2026-10-26T08:30:00Z',
        },
    ];

    const mockResponse: LatestBiomarkerResponse = {
        paged: {
            items: mockAlerts,
            totalCount: 3,
            pageNumber: 1,
            pageSize: 10,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
        },
        summary: {
            totalViolations: 3,
            totalSlaBreaches: 1,
            totalWorkloadOverloads: 1,
            totalBiomarkerFlags: 1,
            totalCriticalFlags: 1,
            totalHighMediumFlags: 1,
            totalLowFlags: 1,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock reference data APIs
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url.includes('/api/Department')) {
                return {
                    data: {
                        items: [
                            { id: 'dept-alpha-001', name: 'Delivery Fleet', isActive: true },
                            { id: 'dept-beta-002', name: 'Sorting Hub', isActive: true },
                        ],
                    },
                } as any;
            }
            if (url.includes('/api/Team')) {
                return {
                    data: {
                        data: {
                            items: [
                                { id: 'team-1', name: 'Metro North', isActive: true },
                            ],
                        },
                    },
                } as any;
            }
            if (url.includes('/api/User')) {
                return {
                    data: {
                        data: {
                            items: [
                                { employeeNumber: 'C-2001', employeeName: 'Carlos Rivera', isActive: true, isDeactivated: false },
                                { employeeNumber: 'C-2002', employeeName: 'Diana Prince', isActive: true, isDeactivated: false },
                            ],
                        },
                    },
                } as any;
            }
            return { data: {} } as any;
        });

        vi.mocked(analyticsService.checkHealth).mockResolvedValue(true);
        vi.mocked(analyticsService.fetchLatestAlertsPaged).mockResolvedValue(mockResponse);
        vi.mocked(analyticsService.triggerScan).mockResolvedValue(true);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders header, live status badge, and all summary cards with expected metrics', async () => {
        render(<BiomarkerDashboard />);

        // Header and live status badge
        expect(screen.getByText('Biomarker Scan Engine')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('Analytics Live')).toBeInTheDocument();
        });

        // Top 4 Status cards (labels appear in cards, and tabs also have SLA/Workload/Biomarker labels)
        expect(screen.getByText('Total Violations')).toBeInTheDocument();
        expect(screen.getAllByText('SLA Breaches').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Workload Overloads').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Biomarker Flags').length).toBeGreaterThanOrEqual(1);

        // Values in summary cards
        await waitFor(() => {
            expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1); // Total violations
        });

        // Bottom Flag Summary cards
        expect(screen.getByText('Red Flags')).toBeInTheDocument();
        expect(screen.getByText('Amber Flags')).toBeInTheDocument();
        expect(screen.getByText('Green Flags')).toBeInTheDocument();
    });

    it('renders detected violations in DataTable with correct mappings and columns', async () => {
        render(<BiomarkerDashboard />);

        await waitFor(() => {
            expect(screen.getByText('Carlos Rivera failed to meet SLA minimum on-time rate')).toBeInTheDocument();
        });

        // Carlos Rivera row: SLA breach, Critical severity, New status
        expect(screen.getByText('Carlos Rivera')).toBeInTheDocument();
        expect(screen.getByText('C-2001')).toBeInTheDocument();
        expect(screen.getAllByText('Delivery Fleet').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('OnTimeRate-dept-alp')).toBeInTheDocument();
        expect(screen.getByText('New')).toBeInTheDocument();

        // Diana Prince row: Workload Overload, High severity (from Warning), Acknowledged status, reference '—'
        expect(screen.getByText('Diana Prince')).toBeInTheDocument();
        expect(screen.getByText('C-2002')).toBeInTheDocument();
        expect(screen.getByText('High parcel backlog assigned to Diana Prince')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('Acknowledged')).toBeInTheDocument();

        // Evan Wright row: Biomarker Flag, Resolved status (InactiveEmployee + acknowledged)
        expect(screen.getByText('Evan Wright')).toBeInTheDocument();
        expect(screen.getByText('C-2003')).toBeInTheDocument();
        expect(screen.getByText('Resolved')).toBeInTheDocument();
    });

    it('filters data when switching violation type tabs', async () => {
        render(<BiomarkerDashboard />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /All Violations/i })).toBeInTheDocument();
        });

        // Click SLA Breaches tab button
        const slaTab = screen.getByRole('button', { name: /SLA Breaches/i });
        fireEvent.click(slaTab);

        await waitFor(() => {
            expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(
                1,
                10,
                expect.objectContaining({ type: 'sla_breach' })
            );
        });

        // Click Workload Overloads tab button
        const workloadTab = screen.getByRole('button', { name: /Workload Overloads/i });
        fireEvent.click(workloadTab);

        await waitFor(() => {
            expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(
                1,
                10,
                expect.objectContaining({ type: 'workload_overload' })
            );
        });
    });

    it('filters data when typing in the search box and resets via Reset button', async () => {
        render(<BiomarkerDashboard />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Search by name, ID, department/i)).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/Search by name, ID, department/i);
        fireEvent.change(searchInput, { target: { value: 'Carlos' } });

        await waitFor(() => {
            expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(
                1,
                10,
                expect.objectContaining({ search: 'Carlos' })
            );
        });

        // The Reset button should now be visible because a filter is active
        const resetBtn = await screen.findByTitle('Reset all filters');
        expect(resetBtn).toBeInTheDocument();

        fireEvent.click(resetBtn);

        await waitFor(() => {
            expect((searchInput as HTMLInputElement).value).toBe('');
        });
    });

    it('triggers manual scan when clicking Run Scan Now button', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        render(<BiomarkerDashboard />);

        await waitFor(() => {
            expect(screen.getByText('Run Scan Now')).toBeInTheDocument();
        });

        const runScanBtn = screen.getByRole('button', { name: /Run Scan Now/i });
        fireEvent.click(runScanBtn);

        // Shows Scanning... and button is disabled
        expect(screen.getByRole('button', { name: /Scanning\.\.\./i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Scanning\.\.\./i })).toBeDisabled();

        // Advance through poll delay
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });

        expect(analyticsService.triggerScan).toHaveBeenCalledTimes(1);

        // Restores to enabled Run Scan Now button
        await waitFor(() => {
            expect(screen.getByText('Run Scan Now')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Run Scan Now/i })).not.toBeDisabled();
        });
    });

    it('displays offline notice and empty state when analytics backend is unreachable', async () => {
        vi.mocked(analyticsService.checkHealth).mockResolvedValue(false);

        render(<BiomarkerDashboard />);

        await waitFor(() => {
            expect(screen.getByText('Analytics Offline')).toBeInTheDocument();
        });

        expect(screen.getByText(/Analytics service is offline\. Charts will appear once the biomarker engine is reachable\./i)).toBeInTheDocument();
        expect(screen.getByText('No violations match your filter.')).toBeInTheDocument();
    });
});
