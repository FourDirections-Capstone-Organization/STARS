import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmployeeScorecardView } from '../components/EmployeeScorecard/EmployeeScorecardView';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';
import { EmployeeKpiEvaluationResultDTO } from '../Pages/OpAdmin_Dashboard/KpiDrillDown/types';

vi.mock('../api');

const mockScorecardData: EmployeeKpiEvaluationResultDTO = {
    employeeId: 'emp-101',
    employeeName: 'Carlos Courier',
    employeeNumber: 'EMP001',
    departmentId: 'dept-1',
    departmentName: 'Logistics Operations',
    jobPositionTitle: 'Lead Courier',
    role: 'Courier',
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-01-31T00:00:00Z',
    configurationId: 'cfg-1',
    configurationTitle: 'Standard Courier Evaluation',
    totalAssignedTasks: 20,
    completedTasksCount: 18,
    onTimeTasksCount: 17,
    inFullTasksCount: 16,
    otifTasksCount: 15,
    reworkTasksCount: 1,
    accurateTasksCount: 17,
    totalHandlingHours: 42.5,
    overallScore: 88.5,
    overallRating: 'Green',
    metrics: [
        {
            metricCode: 'OTIF',
            name: 'On-Time In-Full Rate',
            actualValue: 83.3,
            unit: '%',
            targetValue: 95.0,
            weight: 25.0,
            greenThreshold: 90.0,
            amberThreshold: 75.0,
            redThreshold: 60.0,
            isLowerBetter: false,
            rating: 'Amber',
            weightedScore: 21.9
        },
        {
            metricCode: 'ORDER_ACCURACY',
            name: 'Order Accuracy Rate',
            actualValue: 94.4,
            unit: '%',
            targetValue: 98.0,
            weight: 25.0,
            greenThreshold: 95.0,
            amberThreshold: 85.0,
            redThreshold: 70.0,
            isLowerBetter: false,
            rating: 'Amber',
            weightedScore: 24.1
        },
        {
            metricCode: 'COMPLETION_RATE',
            name: 'Task Completion Rate',
            actualValue: 90.0,
            unit: '%',
            targetValue: 95.0,
            weight: 25.0,
            greenThreshold: 90.0,
            amberThreshold: 80.0,
            redThreshold: 70.0,
            isLowerBetter: false,
            rating: 'Green',
            weightedScore: 23.7
        },
        {
            metricCode: 'AHT',
            name: 'Average Handling Time',
            actualValue: 2.4,
            unit: 'hrs',
            targetValue: 4.0,
            weight: 25.0,
            greenThreshold: 4.0,
            amberThreshold: 8.0,
            redThreshold: 12.0,
            isLowerBetter: true,
            rating: 'Green',
            weightedScore: 25.0
        }
    ]
};

describe('EmployeeScorecardView Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock for scorecard endpoint
        (api.get as any).mockImplementation((url: string) => {
            if (url.startsWith('/api/kpi/my-scorecard') || url.startsWith('/api/kpi/scorecard')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockScorecardData
                    }
                });
            }
            if (url.startsWith('/api/kpi/export/scorecard')) {
                return Promise.resolve({
                    data: new Blob(['mock-binary-content'], { type: 'application/pdf' })
                });
            }
            return Promise.reject(new Error(`Unhandled URL: ${url}`));
        });

        // Mock window.URL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-scorecard-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    it('renders the employee scorecard view with overall performance score and status pill', async () => {
        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        // Initially shows loading state
        expect(screen.getByTestId('scorecard-loading-state')).toBeInTheDocument();

        // Resolves and displays hero score card
        await waitFor(() => {
            expect(screen.getByTestId('scorecard-hero-card')).toBeInTheDocument();
        });

        expect(screen.getByText('My KPI Scorecard')).toBeInTheDocument();
        expect(screen.getByTestId('scorecard-overall-score')).toHaveTextContent('88.5%');
        expect(screen.getByTestId('scorecard-overall-rating')).toHaveTextContent('Green Status');

        // Meta details
        expect(screen.getByText('Carlos Courier')).toBeInTheDocument();
        expect(screen.getByText('#EMP001')).toBeInTheDocument();
        expect(screen.getByText('Logistics Operations')).toBeInTheDocument();
        expect(screen.getByText('Standard Courier Evaluation')).toBeInTheDocument();
    });

    it('renders task volume and quality snapshot cards accurately', async () => {
        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-snapshot-grid')).toBeInTheDocument();
        });

        expect(screen.getByText('Assigned Tasks')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();

        expect(screen.getByText('Completed Tasks')).toBeInTheDocument();
        expect(screen.getByText('18')).toBeInTheDocument();

        expect(screen.getByText('On-Time Deliveries')).toBeInTheDocument();
        expect(screen.getByText('17')).toBeInTheDocument();

        expect(screen.getByText('In-Full Deliveries')).toBeInTheDocument();
        expect(screen.getByText('16')).toBeInTheDocument();

        expect(screen.getByText('Pushbacks / Reworks')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();

        expect(screen.getByText('42.5 hrs')).toBeInTheDocument();
    });

    it('renders the detailed metrics breakdown table with weights and ratings', async () => {
        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-metrics-table')).toBeInTheDocument();
        });

        // 4 metrics rendered
        expect(screen.getByTestId('scorecard-metric-row-otif')).toBeInTheDocument();
        expect(screen.getByTestId('scorecard-metric-row-order_accuracy')).toBeInTheDocument();
        expect(screen.getByTestId('scorecard-metric-row-completion_rate')).toBeInTheDocument();
        expect(screen.getByTestId('scorecard-metric-row-aht')).toBeInTheDocument();

        // Values
        expect(screen.getByText('83.3 %')).toBeInTheDocument();
        expect(screen.getByText('94.4 %')).toBeInTheDocument();
        expect(screen.getByText('90.0 %')).toBeInTheDocument();
        expect(screen.getByText('2.4 hrs')).toBeInTheDocument();

        // Ratings
        const amberBadges = screen.getAllByText('Amber');
        expect(amberBadges.length).toBeGreaterThanOrEqual(2);

        const greenBadges = screen.getAllByText('Green');
        expect(greenBadges.length).toBeGreaterThanOrEqual(2);
    });

    it('handles timeframe preset button clicks and refreshes scorecard query', async () => {
        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-hero-card')).toBeInTheDocument();
        });

        // Click 7 Days preset
        const sevenDaysBtn = screen.getByTestId('scorecard-timeframe-7d');
        fireEvent.click(sevenDaysBtn);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                '/api/kpi/my-scorecard',
                expect.objectContaining({
                    startDate: expect.any(String),
                    endDate: expect.any(String)
                })
            );
        });

        // Click refresh button
        const refreshBtn = screen.getByTestId('scorecard-refresh-btn');
        fireEvent.click(refreshBtn);

        expect(api.get).toHaveBeenCalled();
    });

    it('triggers Export PDF and downloads the scorecard file', async () => {
        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-export-pdf-btn')).toBeInTheDocument();
        });

        const exportPdfBtn = screen.getByTestId('scorecard-export-pdf-btn');
        fireEvent.click(exportPdfBtn);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                '/api/kpi/export/scorecard',
                expect.objectContaining({
                    format: 'pdf'
                }),
                expect.objectContaining({
                    responseType: 'blob'
                })
            );
        });

        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('triggers Export Excel and downloads the scorecard workbook', async () => {
        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-export-excel-btn')).toBeInTheDocument();
        });

        const exportExcelBtn = screen.getByTestId('scorecard-export-excel-btn');
        fireEvent.click(exportExcelBtn);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                '/api/kpi/export/scorecard',
                expect.objectContaining({
                    format: 'excel'
                }),
                expect.objectContaining({
                    responseType: 'blob'
                })
            );
        });

        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('renders error banner when API call fails and allows retry', async () => {
        (api.get as any).mockRejectedValueOnce(new Error('Network error: scorecard service unreachable'));

        render(
            <ToastProvider>
                <EmployeeScorecardView />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-error-banner')).toBeInTheDocument();
        });

        expect(screen.getByTestId('scorecard-error-banner')).toHaveTextContent(/Network error: scorecard service unreachable/i);

        // Retry
        (api.get as any).mockResolvedValueOnce({
            data: { isSuccess: true, data: mockScorecardData }
        });

        const retryBtn = screen.getByText('Retry');
        fireEvent.click(retryBtn);

        await waitFor(() => {
            expect(screen.getByTestId('scorecard-hero-card')).toBeInTheDocument();
        });
    });
});
