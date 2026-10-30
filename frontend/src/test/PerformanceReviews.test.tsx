import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PerformanceReviewTab } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/PerformanceReviewTab';
import { PerformanceErrorBoundary } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/PerformanceErrorBoundary';
import { ReviewDetailView } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/ReviewDetailView';
import { RatingGrid } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/RatingGrid';
import {
    ReviewResultDTO,
    PerformanceReviewSummaryDTO,
    EvaluationTemplate,
    DepartmentOption
} from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/types';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';

vi.mock('../api');

const mockDepartments: DepartmentOption[] = [
    { id: 'dept-1', name: 'Logistics Operations' },
    { id: 'dept-2', name: 'Sorting Hub' }
];

const mockTemplates: EvaluationTemplate[] = [
    {
        id: 'tmpl-1',
        title: 'Courier Performance Template',
        description: 'Operational evaluation rubric',
        targetRole: 'Courier',
        departmentId: 'dept-1',
        isActive: true,
        isAiEnabled: true,
        sections: [
            {
                id: 'sec-1',
                title: 'Operational Delivery',
                weight: 60,
                order: 1,
                isKpiSection: false,
                criteria: [
                    {
                        id: 'crit-1',
                        title: 'Punctuality',
                        weight: 50,
                        criterionType: 'Standard',
                        order: 1
                    },
                    {
                        id: 'crit-2',
                        title: 'Handling & Safety',
                        weight: 50,
                        criterionType: 'Standard',
                        order: 2
                    }
                ]
            },
            {
                id: 'sec-2',
                title: 'KPI Scorecard Section',
                weight: 40,
                order: 2,
                isKpiSection: true,
                criteria: [
                    {
                        id: 'crit-3',
                        title: 'Overall KPI Score',
                        weight: 100,
                        criterionType: 'KpiLinked',
                        metricCode: 'OVERALL_SCORE',
                        order: 1
                    }
                ]
            }
        ],
        ratingBands: [
            { label: 'Exceeds', minScore: 80, maxScore: 100, color: '#05cd99', order: 1 }
        ]
    }
];

const mockSummaries: PerformanceReviewSummaryDTO[] = [
    {
        id: 'rev-101',
        templateId: 'tmpl-1',
        templateTitle: 'Courier Performance Template',
        title: 'Q4 2026 Courier Performance Review',
        description: 'Quarterly review for logistics couriers',
        scope: 'Department',
        status: 'ManagerReview',
        periodStart: '2026-10-01T00:00:00Z',
        periodEnd: '2026-10-31T23:59:59Z',
        departmentId: 'dept-1',
        departmentName: 'Logistics Operations',
        reviewerName: 'John Manager',
        isFinalized: false,
        createdAt: '2026-10-01T08:00:00Z',
        updatedAt: '2026-10-15T12:00:00Z'
    },
    {
        id: 'rev-102',
        templateId: 'tmpl-1',
        templateTitle: 'Courier Performance Template',
        title: 'Individual Audit: Alice Courier',
        description: 'Audit evaluation',
        scope: 'Individual',
        status: 'Draft',
        periodStart: '2026-10-01T00:00:00Z',
        periodEnd: '2026-10-31T23:59:59Z',
        employeeId: 'emp-alice',
        employeeName: 'Alice Courier',
        reviewerName: 'John Manager',
        isFinalized: false,
        createdAt: '2026-10-02T08:00:00Z',
        updatedAt: '2026-10-02T08:00:00Z'
    }
];

const mockReviewDetail: ReviewResultDTO = {
    reviewId: 'rev-101',
    templateId: 'tmpl-1',
    templateTitle: 'Courier Performance Template',
    title: 'Q4 2026 Courier Performance Review',
    description: 'Quarterly review for logistics couriers',
    scope: 'Department',
    status: 'ManagerReview',
    periodStart: '2026-10-01T00:00:00Z',
    periodEnd: '2026-10-31T23:59:59Z',
    departmentId: 'dept-1',
    departmentName: 'Logistics Operations',
    reviewerName: 'John Manager',
    isFinalized: false,
    overallScore: 84.5,
    overallRating: 'Exceeds Expectations',
    ratingDistribution: { 'Exceeds Expectations': 1 },
    employees: [
        {
            employeeId: 'emp-alice',
            employeeName: 'Alice Courier',
            employeeNumber: 'EMP-001',
            departmentName: 'Logistics Operations',
            jobPositionTitle: 'Lead Courier',
            role: 'Courier',
            finalScore: 84.5,
            ratingLabel: 'Exceeds Expectations',
            ratingBandColor: '#05cd99',
            outlierCount: 1,
            sections: [
                {
                    sectionId: 'sec-1',
                    sectionTitle: 'Operational Delivery',
                    weight: 60,
                    order: 1,
                    isKpiSection: false,
                    score: 80,
                    weightedScore: 48,
                    criteria: [
                        {
                            criterionId: 'crit-1',
                            criterionTitle: 'Punctuality',
                            criterionType: 'Standard',
                            weight: 50,
                            order: 1,
                            selfScore: 4,
                            managerScore: 4,
                            gap: 0,
                            isOutlier: false,
                            score: 80,
                            selfComment: 'Delivered all on time',
                            managerComment: 'Consistent performance'
                        },
                        {
                            criterionId: 'crit-2',
                            criterionTitle: 'Handling & Safety',
                            criterionType: 'Standard',
                            weight: 50,
                            order: 2,
                            selfScore: 2,
                            managerScore: 5,
                            gap: 3,
                            isOutlier: true,
                            score: 100,
                            selfComment: 'Felt I had some rough routes',
                            managerComment: 'Zero package incidents observed'
                        }
                    ]
                },
                {
                    sectionId: 'sec-2',
                    sectionTitle: 'KPI Scorecard Section',
                    weight: 40,
                    order: 2,
                    isKpiSection: true,
                    score: 91.2,
                    weightedScore: 36.5,
                    kpiMetrics: [
                        {
                            metricCode: 'OTIF_RATE',
                            metricName: 'On-Time In-Full Rate',
                            value: 95.5,
                            target: 90.0,
                            score: 95.5,
                            unit: '%'
                        }
                    ],
                    criteria: [
                        {
                            criterionId: 'crit-3',
                            criterionTitle: 'Overall KPI Score',
                            criterionType: 'KpiLinked',
                            metricCode: 'OVERALL_SCORE',
                            weight: 100,
                            order: 1,
                            selfScore: 4.5,
                            managerScore: 4.5,
                            gap: 0,
                            isOutlier: false,
                            score: 91.2
                        }
                    ]
                }
            ]
        }
    ]
};

const renderWithToast = (ui: React.ReactElement) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('Performance Reviews & Rating Grid UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock API responses
        (api.get as any).mockImplementation((url: string) => {
            if (url === '/api/performance/reviews') {
                return Promise.resolve({ data: { isSuccess: true, data: mockSummaries } });
            }
            if (url === '/api/performance/templates') {
                return Promise.resolve({ data: { isSuccess: true, data: mockTemplates } });
            }
            if (url.startsWith('/api/performance/reviews/')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockReviewDetail } });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        (api.post as any).mockImplementation((url: string, data: any) => {
            if (url === '/api/performance/reviews') {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            id: 'rev-new-created',
                            title: data.title,
                            templateId: data.templateId,
                            templateTitle: 'Courier Performance Template',
                            scope: data.scope,
                            status: 'Draft',
                            periodStart: data.periodStart,
                            periodEnd: data.periodEnd,
                            isFinalized: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        }
                    }
                });
            }
            if (url.includes('/transition')) {
                return Promise.resolve({ data: { isSuccess: true, data: { status: data.targetStatus } } });
            }
            return Promise.resolve({ data: { isSuccess: true } });
        });

        (api.put as any).mockImplementation((url: string) => {
            if (url.includes('/ratings')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockReviewDetail } });
            }
            return Promise.resolve({ data: { isSuccess: true } });
        });
    });

    it('renders the reviews list with titles, scope badges, and status indicators', async () => {
        renderWithToast(<PerformanceReviewTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByText('Q4 2026 Courier Performance Review')).toBeInTheDocument();
            expect(screen.getByText('Individual Audit: Alice Courier')).toBeInTheDocument();
        });

        // Scope badges
        expect(screen.getAllByText('Department').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Individual').length).toBeGreaterThan(0);

        // Status badges
        expect(screen.getAllByText('ManagerReview').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    });

    it('filters reviews by status selector and search query', async () => {
        renderWithToast(<PerformanceReviewTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByText('Q4 2026 Courier Performance Review')).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/search review by title/i);
        fireEvent.change(searchInput, { target: { value: 'Alice' } });

        // Only Alice Courier review should remain visible
        expect(screen.getByText('Individual Audit: Alice Courier')).toBeInTheDocument();
        expect(screen.queryByText('Q4 2026 Courier Performance Review')).not.toBeInTheDocument();
    });

    it('opens create review modal and creates a new review cycle', async () => {
        renderWithToast(<PerformanceReviewTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByText('Q4 2026 Courier Performance Review')).toBeInTheDocument();
        });

        // Click "+ New Review Cycle"
        const createBtn = screen.getByRole('button', { name: /new review cycle/i });
        fireEvent.click(createBtn);

        expect(screen.getByText('Create Performance Review Cycle')).toBeInTheDocument();

        // Fill form
        const titleInput = screen.getByLabelText(/review cycle title/i);
        fireEvent.change(titleInput, { target: { value: 'New Test Review Cycle' } });

        const submitBtn = screen.getByRole('button', { name: /^create review cycle$/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                '/api/performance/reviews',
                expect.objectContaining({
                    title: 'New Test Review Cycle',
                    templateId: 'tmpl-1'
                })
            );
        });
    });

    it('renders workflow progression status bar and advances stage in ReviewDetailView', async () => {
        renderWithToast(
            <ReviewDetailView
                reviewId="rev-101"
                onBack={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Workflow Progression')).toBeInTheDocument();
        });

        // Check workflow stages rendered
        expect(screen.getByText('Draft')).toBeInTheDocument();
        expect(screen.getByText('Self-Assessment')).toBeInTheDocument();
        expect(screen.getByText('Manager Review')).toBeInTheDocument();
        expect(screen.getByText('HR Review')).toBeInTheDocument();
        expect(screen.getByText('Acknowledgment')).toBeInTheDocument();
        expect(screen.getByText('Finalized')).toBeInTheDocument();

        // Advance stage button for ManagerReview should target HR Review
        const advanceBtn = screen.getByTestId('advance-stage-btn');
        expect(advanceBtn).toBeInTheDocument();
        expect(advanceBtn).toHaveTextContent(/advance to hr review/i);

        fireEvent.click(advanceBtn);

        // Confirmation modal opens
        expect(screen.getByText(/advance workflow to hr review/i)).toBeInTheDocument();
        const confirmButtons = screen.getAllByRole('button', { name: /advance to hr review/i });
        const modalConfirmBtn = confirmButtons[confirmButtons.length - 1];
        fireEvent.click(modalConfirmBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                '/api/performance/reviews/rev-101/transition',
                expect.objectContaining({
                    targetStatus: 'HrReview'
                })
            );
        });
    });

    it('renders rating grid with criteria rows, self-scores, and manager-scores', async () => {
        renderWithToast(
            <RatingGrid
                review={mockReviewDetail}
                onSaveRatings={vi.fn()}
            />
        );

        expect(screen.getByText('Alice Courier')).toBeInTheDocument();
        expect(screen.getByText('84.5')).toBeInTheDocument();
        expect(screen.getByText('Exceeds Expectations')).toBeInTheDocument();

        // Criteria titles
        expect(screen.getByText('Punctuality')).toBeInTheDocument();
        expect(screen.getByText('Handling & Safety')).toBeInTheDocument();
        expect(screen.getByText('Overall KPI Score')).toBeInTheDocument();

        // Outlier pill should be visible for Handling & Safety (Manager 5 vs Self 2 => Gap 3 >= 2)
        const outlierBadge = screen.getByTestId('outlier-badge-crit-2');
        expect(outlierBadge).toBeInTheDocument();
        expect(outlierBadge).toHaveTextContent(/outlier/i);
    });

    it('live computes gap and outlier badge when manager-score changes', async () => {
        renderWithToast(
            <RatingGrid
                review={mockReviewDetail}
                onSaveRatings={vi.fn()}
            />
        );

        // Punctuality originally has Self 4, Manager 4 (Gap 0, no outlier)
        expect(screen.queryByTestId('outlier-badge-crit-1')).not.toBeInTheDocument();

        // Change Manager score for Punctuality from 4 to 1
        const punctualityManagerSelect = screen.getByLabelText(/manager score for punctuality/i);
        fireEvent.change(punctualityManagerSelect, { target: { value: '1' } });

        // Gap is now |1 - 4| = 3 >= 2, so outlier badge appears immediately!
        await waitFor(() => {
            expect(screen.getByTestId('outlier-badge-crit-1')).toBeInTheDocument();
        });

        // Change Manager score back to 4 -> Outlier disappears!
        fireEvent.change(punctualityManagerSelect, { target: { value: '4' } });
        await waitFor(() => {
            expect(screen.queryByTestId('outlier-badge-crit-1')).not.toBeInTheDocument();
        });
    });

    it('renders read-only KPI section with live KPI score and tooltip metrics', async () => {
        renderWithToast(
            <RatingGrid
                review={mockReviewDetail}
                onSaveRatings={vi.fn()}
            />
        );

        expect(screen.getByText(/Automated KPI Section/i)).toBeInTheDocument();
        expect(screen.getByText(/STARS Calculation Engine Performance Snapshot/i)).toBeInTheDocument();
        expect(screen.getByText(/Live KPI Pass-Through: 91.2/i)).toBeInTheDocument();
        expect(screen.getByText('On-Time In-Full Rate')).toBeInTheDocument();
        expect(screen.getByText('95.5 %')).toBeInTheDocument();
    });

    it('calls onSaveRatings when clicking Save Ratings button', async () => {
        const onSaveRatingsMock = vi.fn().mockResolvedValue(undefined);
        renderWithToast(
            <RatingGrid
                review={mockReviewDetail}
                onSaveRatings={onSaveRatingsMock}
            />
        );

        const saveBtn = screen.getByRole('button', { name: /save ratings/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(onSaveRatingsMock).toHaveBeenCalledWith(
                'emp-alice',
                expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'crit-1' }),
                    expect.objectContaining({ criterionId: 'crit-2' })
                ])
            );
        });
    });

    it('handles newly created review with backend KPI metrics shape without white page crash', async () => {
        const reviewWithBackendMetrics: ReviewResultDTO = {
            ...mockReviewDetail,
            employees: [
                {
                    ...mockReviewDetail.employees[0],
                    sections: [
                        {
                            sectionId: 'sec-kpi-backend',
                            sectionTitle: 'Automated Operations KPIs',
                            weight: 100,
                            order: 1,
                            isKpiSection: true,
                            score: 88.5,
                            weightedScore: 88.5,
                            criteria: [],
                            // Backend KpiMetricValueDTO shape (without score, value, target, metricName)
                            kpiMetrics: [
                                {
                                    metricCode: 'OTIF',
                                    name: 'On-Time In-Full Delivery',
                                    actualValue: 94.5,
                                    targetValue: 90.0,
                                    weightedScore: 18.9,
                                    rating: 'Green',
                                    unit: '%'
                                } as any
                            ]
                        }
                    ]
                }
            ]
        };

        renderWithToast(
            <RatingGrid
                review={reviewWithBackendMetrics}
                onSaveRatings={vi.fn()}
            />
        );

        // Asserts that KPI section renders properly using mapped name, actualValue, and score from weightedScore
        expect(screen.getByText('On-Time In-Full Delivery')).toBeInTheDocument();
        expect(screen.getByText('94.5 %')).toBeInTheDocument();
        expect(screen.getByText('94.5%')).toBeInTheDocument();
    });

    it('renders PerformanceErrorBoundary fallback instead of crashing when child throws an error', () => {
        const ThrowingChild = () => {
            throw new Error('Simulated test render error');
        };

        // Suppress console.error in test log for expected error
        const originalError = console.error;
        console.error = vi.fn();

        const onResetMock = vi.fn();
        renderWithToast(
            <PerformanceErrorBoundary onReset={onResetMock}>
                <ThrowingChild />
            </PerformanceErrorBoundary>
        );

        expect(screen.getByText('Unable to Display Performance Review')).toBeInTheDocument();
        expect(screen.getByText(/Simulated test render error/i)).toBeInTheDocument();

        // Click Back to Reviews
        const backBtn = screen.getByRole('button', { name: /back to performance reviews/i });
        fireEvent.click(backBtn);
        expect(onResetMock).toHaveBeenCalledTimes(1);

        console.error = originalError;
    });

    it('automatically transitions to ReviewDetailView upon creating a review', async () => {
        renderWithToast(<PerformanceReviewTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByText('Q4 2026 Courier Performance Review')).toBeInTheDocument();
        });

        // Click "+ New Review Cycle"
        const createBtn = screen.getByRole('button', { name: /new review cycle/i });
        fireEvent.click(createBtn);

        // Fill form
        const titleInput = screen.getByLabelText(/review cycle title/i);
        fireEvent.change(titleInput, { target: { value: 'New Test Review Cycle' } });

        const submitBtn = screen.getByRole('button', { name: /^create review cycle$/i });
        fireEvent.click(submitBtn);

        // Detail view should open automatically and render the review detail
        await waitFor(() => {
            expect(screen.getByText('Workflow Progression')).toBeInTheDocument();
            expect(screen.getByText('Evaluation Ratings')).toBeInTheDocument();
        });
    });
});
