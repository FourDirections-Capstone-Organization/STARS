import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewExportBar } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/ReviewExportBar';
import { CriterionComparisonChart } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/charts/CriterionComparisonChart';
import { RatingDistributionChart } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/charts/RatingDistributionChart';
import { SectionBreakdownChart } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/charts/SectionBreakdownChart';
import { ReviewDetailView } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/ReviewDetailView';
import { ReviewResultDTO } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/types';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';

vi.mock('../api');

// Mock Recharts ResponsiveContainer to render children cleanly in jsdom / happy-dom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => (
            <div className="recharts-responsive-container" style={{ width: '100%', height: 320 }}>
                {children}
            </div>
        )
    };
});

const mockTeamReview: ReviewResultDTO = {
    reviewId: 'rev-team-101',
    templateId: 'tmpl-1',
    templateTitle: 'Logistics Operations Template',
    title: 'Q4 2026 Team Performance Evaluation',
    description: 'Quarterly evaluation for courier logistics team',
    scope: 'Team',
    status: 'ManagerReview',
    periodStart: '2026-10-01T00:00:00Z',
    periodEnd: '2026-10-31T23:59:59Z',
    departmentId: 'dept-1',
    departmentName: 'Logistics Operations',
    reviewerName: 'John Manager',
    isFinalized: false,
    overallScore: 86.5,
    overallRating: 'Exceeds Expectations',
    ratingDistribution: {
        'Exceeds Expectations': 2,
        'Meets Expectations': 1
    },
    employees: [
        {
            employeeId: 'emp-alice',
            employeeName: 'Alice Courier',
            employeeNumber: 'EMP-001',
            departmentName: 'Logistics Operations',
            jobPositionTitle: 'Lead Courier',
            role: 'Courier',
            finalScore: 89.0,
            ratingLabel: 'Exceeds Expectations',
            ratingBandColor: '#059669',
            outlierCount: 1,
            sections: [
                {
                    sectionId: 'sec-1',
                    sectionTitle: 'Operational Quality',
                    weight: 50,
                    order: 1,
                    isKpiSection: false,
                    score: 84.0,
                    weightedScore: 42.0,
                    criteria: [
                        {
                            criterionId: 'crit-1',
                            criterionTitle: 'On-Time Dispatch',
                            criterionType: 'Standard',
                            weight: 50,
                            order: 1,
                            selfScore: 4,
                            managerScore: 5,
                            gap: 1,
                            isOutlier: false,
                            score: 90
                        },
                        {
                            criterionId: 'crit-2',
                            criterionTitle: 'Safe Handling',
                            criterionType: 'Standard',
                            weight: 50,
                            order: 2,
                            selfScore: 2,
                            managerScore: 5,
                            gap: 3,
                            isOutlier: true,
                            score: 100
                        }
                    ]
                },
                {
                    sectionId: 'sec-2',
                    sectionTitle: 'Operational KPIs',
                    weight: 50,
                    order: 2,
                    isKpiSection: true,
                    score: 94.0,
                    weightedScore: 47.0,
                    criteria: [
                        {
                            criterionId: 'crit-3',
                            criterionTitle: 'OTIF Delivery Score',
                            criterionType: 'KpiLinked',
                            metricCode: 'OTIF',
                            weight: 100,
                            order: 1,
                            selfScore: 5,
                            managerScore: 5,
                            gap: 0,
                            isOutlier: false,
                            score: 94
                        }
                    ]
                }
            ]
        },
        {
            employeeId: 'emp-bob',
            employeeName: 'Bob Dispatcher',
            employeeNumber: 'EMP-002',
            departmentName: 'Logistics Operations',
            jobPositionTitle: 'Senior Courier',
            role: 'Courier',
            finalScore: 84.0,
            ratingLabel: 'Meets Expectations',
            ratingBandColor: '#2563EB',
            outlierCount: 0,
            sections: [
                {
                    sectionId: 'sec-1',
                    sectionTitle: 'Operational Quality',
                    weight: 50,
                    order: 1,
                    isKpiSection: false,
                    score: 80.0,
                    weightedScore: 40.0,
                    criteria: [
                        {
                            criterionId: 'crit-1',
                            criterionTitle: 'On-Time Dispatch',
                            criterionType: 'Standard',
                            weight: 50,
                            order: 1,
                            selfScore: 4,
                            managerScore: 4,
                            gap: 0,
                            isOutlier: false,
                            score: 80
                        }
                    ]
                },
                {
                    sectionId: 'sec-2',
                    sectionTitle: 'Operational KPIs',
                    weight: 50,
                    order: 2,
                    isKpiSection: true,
                    score: 88.0,
                    weightedScore: 44.0,
                    criteria: [
                        {
                            criterionId: 'crit-3',
                            criterionTitle: 'OTIF Delivery Score',
                            criterionType: 'KpiLinked',
                            metricCode: 'OTIF',
                            weight: 100,
                            order: 1,
                            selfScore: 4,
                            managerScore: 4,
                            gap: 0,
                            isOutlier: false,
                            score: 88
                        }
                    ]
                }
            ]
        }
    ]
};

const mockIndividualReview: ReviewResultDTO = {
    ...mockTeamReview,
    reviewId: 'rev-indiv-102',
    title: 'Individual Performance Review: Alice Courier',
    scope: 'Individual',
    ratingDistribution: {},
    employees: [mockTeamReview.employees[0]]
};

describe('Performance Evaluation Step 11: Export Bar and Charts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Manager');
    });

    describe('ReviewExportBar', () => {
        it('renders date inputs, scope filter, reset button, and export CSV button', () => {
            const onStartDateChange = vi.fn();
            const onEndDateChange = vi.fn();
            const onScopeFilterChange = vi.fn();
            const onResetFilters = vi.fn();

            render(
                <ToastProvider>
                    <ReviewExportBar
                        review={mockTeamReview}
                        startDate="2026-10-01"
                        endDate="2026-10-31"
                        onStartDateChange={onStartDateChange}
                        onEndDateChange={onEndDateChange}
                        scopeFilter="ALL"
                        onScopeFilterChange={onScopeFilterChange}
                        onResetFilters={onResetFilters}
                    />
                </ToastProvider>
            );

            expect(screen.getByTestId('review-export-bar')).toBeInTheDocument();
            expect(screen.getByTestId('chart-start-date')).toHaveValue('2026-10-01');
            expect(screen.getByTestId('chart-end-date')).toHaveValue('2026-10-31');
            expect(screen.getByTestId('chart-scope-filter')).toBeInTheDocument();
            expect(screen.getByTestId('chart-reset-filters')).toBeInTheDocument();
            expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument();
        });

        it('calls onStartDateChange, onEndDateChange, onScopeFilterChange and onResetFilters', () => {
            const onStartDateChange = vi.fn();
            const onEndDateChange = vi.fn();
            const onScopeFilterChange = vi.fn();
            const onResetFilters = vi.fn();

            render(
                <ToastProvider>
                    <ReviewExportBar
                        review={mockTeamReview}
                        startDate="2026-10-01"
                        endDate="2026-10-31"
                        onStartDateChange={onStartDateChange}
                        onEndDateChange={onEndDateChange}
                        scopeFilter="ALL"
                        onScopeFilterChange={onScopeFilterChange}
                        onResetFilters={onResetFilters}
                    />
                </ToastProvider>
            );

            fireEvent.change(screen.getByTestId('chart-start-date'), { target: { value: '2026-10-05' } });
            expect(onStartDateChange).toHaveBeenCalledWith('2026-10-05');

            fireEvent.change(screen.getByTestId('chart-end-date'), { target: { value: '2026-10-25' } });
            expect(onEndDateChange).toHaveBeenCalledWith('2026-10-25');

            fireEvent.change(screen.getByTestId('chart-scope-filter'), { target: { value: 'Courier' } });
            expect(onScopeFilterChange).toHaveBeenCalledWith('Courier');

            fireEvent.click(screen.getByTestId('chart-reset-filters'));
            expect(onResetFilters).toHaveBeenCalledTimes(1);
        });

        it('triggers exportReviewCsv on export button click and downloads blob', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: new Blob(['Employee,Section,Score\nAlice,Quality,84'], { type: 'text/csv' })
            } as any);

            // Mock window.URL
            const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
            const revokeObjectURLMock = vi.fn();
            window.URL.createObjectURL = createObjectURLMock;
            window.URL.revokeObjectURL = revokeObjectURLMock;

            render(
                <ToastProvider>
                    <ReviewExportBar review={mockTeamReview} />
                </ToastProvider>
            );

            const exportBtn = screen.getByTestId('export-csv-btn');
            fireEvent.click(exportBtn);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    '/api/performance/reviews/rev-team-101/export/csv',
                    undefined,
                    expect.objectContaining({ responseType: 'blob' })
                );
            });
        });
    });

    describe('CriterionComparisonChart', () => {
        it('renders grouped BarChart with self vs manager scores and employee selector in team scope', () => {
            const onEmployeeChange = vi.fn();

            render(
                <CriterionComparisonChart
                    review={mockTeamReview}
                    selectedEmployeeId="emp-alice"
                    onEmployeeChange={onEmployeeChange}
                />
            );

            expect(screen.getByTestId('criterion-comparison-chart-card')).toBeInTheDocument();
            expect(screen.getByText('Criterion Comparison: Self vs. Manager')).toBeInTheDocument();
            const select = screen.getByTestId('criterion-chart-employee-select');
            expect(select).toBeInTheDocument();
            expect(select).toHaveValue('emp-alice');

            // Switch employee
            fireEvent.change(select, { target: { value: 'emp-bob' } });
            expect(onEmployeeChange).toHaveBeenCalledWith('emp-bob');
        });

        it('renders empty placeholder if employee has no criteria recorded', () => {
            const emptyEmpReview: ReviewResultDTO = {
                ...mockTeamReview,
                employees: [{ ...mockTeamReview.employees[0], sections: [] }]
            };

            render(<CriterionComparisonChart review={emptyEmpReview} />);

            expect(screen.getByTestId('criterion-comparison-empty')).toBeInTheDocument();
            expect(screen.getByText(/No criteria ratings recorded/i)).toBeInTheDocument();
        });

        it('matches snapshot for criterion comparison chart structure', () => {
            const { container } = render(
                <CriterionComparisonChart
                    review={mockTeamReview}
                    selectedEmployeeId="emp-alice"
                />
            );
            expect(container).toMatchSnapshot();
        });
    });

    describe('RatingDistributionChart', () => {
        it('renders placeholder when review is in Individual scope', () => {
            render(<RatingDistributionChart review={mockIndividualReview} />);

            expect(screen.getByTestId('rating-distribution-chart-card')).toBeInTheDocument();
            expect(screen.getByTestId('rating-dist-placeholder')).toBeInTheDocument();
            expect(screen.getByText(/Rating distribution is only available for Team or Department review scopes/i)).toBeInTheDocument();
        });

        it('renders PieChart when review is in Team scope with rating distribution', () => {
            render(<RatingDistributionChart review={mockTeamReview} />);

            expect(screen.getByTestId('rating-distribution-chart-card')).toBeInTheDocument();
            expect(screen.queryByTestId('rating-dist-placeholder')).not.toBeInTheDocument();
            expect(screen.getByTestId('rating-dist-body')).toBeInTheDocument();
        });

        it('matches snapshot for rating distribution chart in team scope', () => {
            const { container } = render(<RatingDistributionChart review={mockTeamReview} />);
            expect(container).toMatchSnapshot();
        });

        it('matches snapshot for rating distribution placeholder in individual scope', () => {
            const { container } = render(<RatingDistributionChart review={mockIndividualReview} />);
            expect(container).toMatchSnapshot();
        });
    });

    describe('SectionBreakdownChart', () => {
        it('renders section scores BarChart and employee selector', () => {
            const onEmployeeChange = vi.fn();

            render(
                <SectionBreakdownChart
                    review={mockTeamReview}
                    selectedEmployeeId="emp-alice"
                    onEmployeeChange={onEmployeeChange}
                />
            );

            expect(screen.getByTestId('section-breakdown-chart-card')).toBeInTheDocument();
            expect(screen.getByText('Section Breakdown')).toBeInTheDocument();
            expect(screen.getByText(/Operational KPI Section \(Highlighted\)/i)).toBeInTheDocument();
            expect(screen.getByTestId('section-chart-employee-select')).toBeInTheDocument();
        });

        it('renders empty state when employee has no sections', () => {
            const emptyReview: ReviewResultDTO = {
                ...mockTeamReview,
                employees: [{ ...mockTeamReview.employees[0], sections: [] }]
            };

            render(<SectionBreakdownChart review={emptyReview} />);

            expect(screen.getByTestId('section-breakdown-empty')).toBeInTheDocument();
            expect(screen.getByText(/No section scores calculated/i)).toBeInTheDocument();
        });

        it('matches snapshot for section breakdown chart structure', () => {
            const { container } = render(
                <SectionBreakdownChart
                    review={mockTeamReview}
                    selectedEmployeeId="emp-alice"
                />
            );
            expect(container).toMatchSnapshot();
        });
    });

    describe('ReviewDetailView Charts Tab Integration', () => {
        it('switches to Charts & Analytics tab, renders all 3 charts and export bar, and re-renders on date/scope filter change', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/performance/reviews/rev-team-101/export/csv')) {
                    return { data: new Blob(['csv-content'], { type: 'text/csv' }) } as any;
                }
                return { data: { data: mockTeamReview } } as any;
            });

            render(
                <ToastProvider>
                    <ReviewDetailView reviewId="rev-team-101" onBack={vi.fn()} />
                </ToastProvider>
            );

            // Wait for review details to load
            await waitFor(() => {
                expect(screen.getByText('Q4 2026 Team Performance Evaluation')).toBeInTheDocument();
            });

            // Click Charts & Analytics Tab
            const chartsTabBtn = screen.getByTestId('detail-tab-charts');
            expect(chartsTabBtn).toBeInTheDocument();
            fireEvent.click(chartsTabBtn);

            // Check that Charts View container and all 3 charts + export bar are visible
            await waitFor(() => {
                expect(screen.getByTestId('pe-charts-view')).toBeInTheDocument();
                expect(screen.getByTestId('review-export-bar')).toBeInTheDocument();
                expect(screen.getByTestId('criterion-comparison-chart-card')).toBeInTheDocument();
                expect(screen.getByTestId('rating-distribution-chart-card')).toBeInTheDocument();
                expect(screen.getByTestId('section-breakdown-chart-card')).toBeInTheDocument();
            });

            // Re-render on date filter change
            const startDateInput = screen.getByTestId('chart-start-date');
            fireEvent.change(startDateInput, { target: { value: '2026-10-10' } });
            expect(startDateInput).toHaveValue('2026-10-10');

            // Re-render on scope filter change
            const scopeSelect = screen.getByTestId('chart-scope-filter');
            fireEvent.change(scopeSelect, { target: { value: 'Courier' } });
            expect(scopeSelect).toHaveValue('Courier');

            // Reset filters
            const resetBtn = screen.getByTestId('chart-reset-filters');
            fireEvent.click(resetBtn);
            expect(startDateInput).toHaveValue('2026-10-01');

            // Export CSV from header button
            const headerExportBtn = screen.getByTestId('header-export-csv-btn');
            expect(headerExportBtn).toBeInTheDocument();
            fireEvent.click(headerExportBtn);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    '/api/performance/reviews/rev-team-101/export/csv',
                    undefined,
                    expect.objectContaining({ responseType: 'blob' })
                );
            });
        });
    });
});

