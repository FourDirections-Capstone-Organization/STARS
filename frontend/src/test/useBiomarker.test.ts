import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBiomarker, useBiomarkerCharts } from '../components/Analytics/useBiomarker';
import { analyticsService, LatestBiomarkerResponse, BiomarkerAlertDTO } from '../services/analyticsService';

vi.mock('../services/analyticsService', () => ({
    analyticsService: {
        checkHealth: vi.fn(),
        fetchLatestAlertsPaged: vi.fn(),
        triggerScan: vi.fn(),
        CHART_FETCH_LIMIT: 500,
    },
}));

describe('useBiomarker hook', () => {
    const mockAlerts: BiomarkerAlertDTO[] = [
        {
            id: 'alert-1',
            scanDateTime: '2026-10-26T10:00:00Z',
            scanDate: '2026-10-26',
            departmentId: 'dept-12345678-abcd',
            departmentName: 'Delivery',
            employeeName: 'John Doe',
            employeeNumber: 'C-1001',
            metricName: 'OnTimeRate',
            currentValue: 65,
            thresholdValue: 90,
            severity: 'Critical',
            description: 'On-time delivery dropped below SLA',
            isAcknowledged: false,
            createdAt: '2026-10-26T10:00:00Z',
        },
        {
            id: 'alert-2',
            scanDateTime: '2026-10-26T10:00:00Z',
            scanDate: '2026-10-26',
            departmentId: 'dept-87654321-efgh',
            departmentName: 'Logistics',
            metricName: 'HighWorkload',
            currentValue: 12,
            thresholdValue: 10,
            severity: 'Warning',
            description: 'Employee Jane Smith (C-1002) is overloaded with active tasks',
            isAcknowledged: true,
            createdAt: '2026-10-26T10:00:00Z',
        },
        {
            id: 'alert-3',
            scanDateTime: '2026-10-26T10:00:00Z',
            scanDate: '2026-10-26',
            departmentId: 'dept-33333333-ijkl',
            departmentName: 'Operations',
            metricName: 'InactiveEmployee',
            currentValue: 1,
            thresholdValue: 0,
            severity: 'Info',
            description: 'Courier account inactive: E-999',
            isAcknowledged: true,
            createdAt: '2026-10-26T10:00:00Z',
        },
        {
            id: '',
            scanDateTime: '',
            scanDate: '2026-10-26',
            departmentId: null,
            departmentName: '',
            metricName: 'CustomAnomaly',
            currentValue: 5,
            thresholdValue: 2,
            severity: 'UnknownLevel',
            description: 'Uncategorized anomaly without employee details',
            isAcknowledged: false,
            createdAt: '2026-10-26T10:05:00Z',
        },
    ];

    const mockPagedResponse: LatestBiomarkerResponse = {
        paged: {
            items: mockAlerts,
            totalCount: 4,
            pageNumber: 1,
            pageSize: 10,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
        },
        summary: {
            totalViolations: 4,
            totalSlaBreaches: 1,
            totalWorkloadOverloads: 1,
            totalBiomarkerFlags: 2,
            totalCriticalFlags: 1,
            totalHighMediumFlags: 2,
            totalLowFlags: 1,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(analyticsService.checkHealth).mockResolvedValue(true);
        vi.mocked(analyticsService.fetchLatestAlertsPaged).mockResolvedValue(mockPagedResponse);
        vi.mocked(analyticsService.triggerScan).mockResolvedValue(true);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads initial data, checks health, and maps alert properties correctly', async () => {
        const { result } = renderHook(() => useBiomarker());

        await waitFor(() => {
            expect(result.current.analyticsStatus).toBe('online');
            expect(result.current.violations).toHaveLength(4);
        });

        // Test alert 1 (OnTimeRate -> sla_breach, Critical -> Critical, explicit employee info)
        const v1 = result.current.violations[0];
        expect(v1.id).toBe('alert-1');
        expect(v1.type).toBe('sla_breach');
        expect(v1.severity).toBe('Critical');
        expect(v1.status).toBe('New');
        expect(v1.employeeName).toBe('John Doe');
        expect(v1.employeeNumber).toBe('C-1001');
        expect(v1.taskReference).toBe('OnTimeRate-dept-123');

        // Test alert 2 (HighWorkload -> workload_overload, Warning -> High, regex regex name/number, taskReference '—')
        const v2 = result.current.violations[1];
        expect(v2.id).toBe('alert-2');
        expect(v2.type).toBe('workload_overload');
        expect(v2.severity).toBe('High');
        expect(v2.status).toBe('Acknowledged');
        expect(v2.employeeName).toBe('Jane Smith');
        expect(v2.employeeNumber).toBe('C-1002');
        expect(v2.taskReference).toBe('—');

        // Test alert 3 (InactiveEmployee + isAcknowledged -> Resolved, Info -> Low, regex number-only)
        const v3 = result.current.violations[2];
        expect(v3.id).toBe('alert-3');
        expect(v3.type).toBe('biomarker_flag');
        expect(v3.severity).toBe('Low');
        expect(v3.status).toBe('Resolved');
        expect(v3.employeeName).toBe('Employee E-999');
        expect(v3.employeeNumber).toBe('E-999');

        // Test alert 4 (fallback ID, default Medium severity, empty employee, empty dept)
        const v4 = result.current.violations[3];
        expect(v4.id).toBe('ALERT-4');
        expect(v4.type).toBe('biomarker_flag');
        expect(v4.severity).toBe('Medium');
        expect(v4.status).toBe('New');
        expect(v4.employeeName).toBe('');
        expect(v4.employeeNumber).toBe('');
        expect(v4.taskReference).toBe('CustomAnomaly-');

        // Verify summary counts and metadata
        expect(result.current.totalCount).toBe(4);
        expect(result.current.totalPages).toBe(1);
        expect(result.current.summary.slaBreaches).toBe(1);
        expect(result.current.summary.workloadOverloads).toBe(1);
        expect(result.current.summary.biomarkerFlags).toBe(2);
        expect(result.current.summary.redFlags).toBe(1);
        expect(result.current.summary.amberFlags).toBe(2);
        expect(result.current.summary.greenFlags).toBe(1);
        expect(result.current.scanMeta).not.toBeNull();
        expect(result.current.scanMeta?.totalViolations).toBe(4);
    });

    it('sets analyticsStatus to offline and resets state when health check fails', async () => {
        vi.mocked(analyticsService.checkHealth).mockResolvedValue(false);

        const { result } = renderHook(() => useBiomarker());

        await waitFor(() => {
            expect(result.current.analyticsStatus).toBe('offline');
        });

        expect(result.current.violations).toEqual([]);
        expect(result.current.totalCount).toBe(0);
        expect(result.current.totalPages).toBe(0);
        expect(result.current.scanMeta).toBeNull();
    });

    it('updates page and fetches requested page when setPage is called', async () => {
        const { result } = renderHook(() => useBiomarker());

        await waitFor(() => {
            expect(result.current.analyticsStatus).toBe('online');
        });

        act(() => {
            result.current.setPage(2);
        });

        await waitFor(() => {
            expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(2, 10, undefined);
            expect(result.current.currentPage).toBe(2);
        });
    });

    it('resets current page to 1 and passes filters when filters change', async () => {
        const { result, rerender } = renderHook(
            (filters) => useBiomarker(filters),
            { initialProps: { type: 'sla_breach' } }
        );

        await waitFor(() => {
            expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(1, 10, { type: 'sla_breach' });
        });

        act(() => {
            result.current.setPage(3);
        });

        await waitFor(() => {
            expect(result.current.currentPage).toBe(3);
        });

        // Change filters
        rerender({ type: 'workload_overload' });

        await waitFor(() => {
            expect(result.current.currentPage).toBe(1);
            expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(1, 10, { type: 'workload_overload' });
        });
    });

    it('handles manual scan trigger successfully', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        const { result } = renderHook(() => useBiomarker());

        await waitFor(() => {
            expect(result.current.analyticsStatus).toBe('online');
        });

        let triggerPromise: Promise<void>;
        act(() => {
            triggerPromise = result.current.triggerScan();
        });

        expect(result.current.scanStatus).toBe('Running');
        expect(result.current.scanning).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
            await triggerPromise;
        });

        expect(analyticsService.triggerScan).toHaveBeenCalledTimes(1);
        expect(result.current.scanStatus).toBe('Completed');
        expect(result.current.scanning).toBe(false);
    });

    it('handles failed scan trigger when service returns false', async () => {
        vi.mocked(analyticsService.triggerScan).mockResolvedValue(false);

        const { result } = renderHook(() => useBiomarker());

        await waitFor(() => {
            expect(result.current.analyticsStatus).toBe('online');
        });

        await act(async () => {
            await result.current.triggerScan();
        });

        expect(result.current.scanStatus).toBe('Failed');
        expect(result.current.scanning).toBe(false);
    });
});

describe('useBiomarkerCharts hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fetches chart dataset with CHART_FETCH_LIMIT and sets online true', async () => {
        vi.mocked(analyticsService.checkHealth).mockResolvedValue(true);
        vi.mocked(analyticsService.fetchLatestAlertsPaged).mockResolvedValue({
            paged: {
                items: [
                    {
                        id: 'chart-alert-1',
                        scanDateTime: '2026-10-26T10:00:00Z',
                        scanDate: '2026-10-26',
                        departmentId: 'dept-1',
                        departmentName: 'Delivery',
                        metricName: 'HighWorkload',
                        currentValue: 15,
                        thresholdValue: 10,
                        severity: 'Critical',
                        description: 'Overload alert',
                        isAcknowledged: false,
                        createdAt: '2026-10-26T10:00:00Z',
                    },
                ],
                totalCount: 1,
                pageNumber: 1,
                pageSize: 500,
                totalPages: 1,
                hasPreviousPage: false,
                hasNextPage: false,
            },
            summary: {
                totalViolations: 1,
                totalSlaBreaches: 0,
                totalWorkloadOverloads: 1,
                totalBiomarkerFlags: 0,
                totalCriticalFlags: 1,
                totalHighMediumFlags: 0,
                totalLowFlags: 0,
            },
        });

        const stableFilters = { type: 'workload_overload' };
        const { result } = renderHook(() => useBiomarkerCharts(stableFilters));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.online).toBe(true);
            expect(result.current.violations).toHaveLength(1);
        });

        expect(analyticsService.fetchLatestAlertsPaged).toHaveBeenCalledWith(1, 500, { type: 'workload_overload' });
        expect(result.current.violations[0].id).toBe('chart-alert-1');
        expect(result.current.violations[0].type).toBe('workload_overload');
    });

    it('sets online false and empty violations when health check fails', async () => {
        vi.mocked(analyticsService.checkHealth).mockResolvedValue(false);

        const { result } = renderHook(() => useBiomarkerCharts());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.online).toBe(false);
            expect(result.current.violations).toEqual([]);
        });
    });
});
