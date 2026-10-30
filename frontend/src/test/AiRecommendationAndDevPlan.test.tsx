import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiRecommendationPanel } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/AiRecommendationPanel';
import { DevelopmentPlanPanel } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/DevelopmentPlanPanel';
import { ReviewDetailView } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/ReviewDetailView';
import {
    AiRecommendationDTO,
    DevelopmentPlanItemDTO,
    ReviewResultDTO
} from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/types';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';

vi.mock('../api');

const mockAiRec: AiRecommendationDTO = {
    id: 'rec-1',
    reviewId: 'rev-101',
    employeeId: 'emp-alice',
    status: 'Pending',
    summary: 'Alice consistently meets turnaround times and demonstrates strong route navigation.',
    strengthsJson: JSON.stringify(['Route optimization', 'Zero safety incidents', 'Punctual dispatch']),
    improvementAreasJson: JSON.stringify(['Digital proof-of-delivery accuracy', 'Push-back communication']),
    actionItemsJson: JSON.stringify([
        {
            description: 'Complete mobile scanner retraining module',
            successMeasure: '100% barcode scan compliance',
            timeframe: '30 Days'
        },
        {
            description: 'Participate in weekly route debriefs',
            successMeasure: 'Zero lost parcels',
            timeframe: '60 Days'
        }
    ]),
    trainingTopicsJson: JSON.stringify(['Defensive Driving', 'Barcode Barcode Scanning SOP', 'Customer Handover']),
    manualNotes: 'Candidate demonstrates strong motivation for lead dispatcher track.',
    reviewedById: 'mgr-1',
    reviewedAt: '2026-10-25T14:30:00Z',
    createdAt: '2026-10-25T14:00:00Z',
    updatedAt: '2026-10-25T14:30:00Z'
};

const mockDevPlanItems: DevelopmentPlanItemDTO[] = [
    {
        id: 'plan-1',
        reviewId: 'rev-101',
        reviewTitle: 'Q4 Courier Review',
        employeeId: 'emp-alice',
        employeeName: 'Alice Courier',
        description: 'Complete mobile scanner retraining module',
        successMeasure: '100% barcode compliance',
        timeframe: '30 Days',
        targetCompletionDate: '2026-11-30T00:00:00Z',
        isCompleted: false,
        managerNotes: 'Coordinate with lead trainer Mike',
        employeeNotes: '',
        createdAt: '2026-10-26T10:00:00Z',
        updatedAt: '2026-10-26T10:00:00Z'
    },
    {
        id: 'plan-2',
        reviewId: 'rev-101',
        reviewTitle: 'Q4 Courier Review',
        employeeId: 'emp-alice',
        employeeName: 'Alice Courier',
        description: 'Implement weekly fuel efficiency checklist',
        successMeasure: '5% fuel savings',
        timeframe: '60 Days',
        targetCompletionDate: '2026-12-15T00:00:00Z',
        isCompleted: true,
        completedAt: '2026-10-28T12:00:00Z',
        completedByName: 'Alice Courier',
        managerNotes: 'Vehicle log verified',
        employeeNotes: 'Achieved 6.2% improvement',
        createdAt: '2026-10-26T10:00:00Z',
        updatedAt: '2026-10-28T12:00:00Z'
    }
];

const mockPriorOpenItems: DevelopmentPlanItemDTO[] = [
    {
        id: 'plan-prior-1',
        reviewId: 'rev-older-99',
        reviewTitle: 'Q3 2026 Courier Review',
        employeeId: 'emp-alice',
        employeeName: 'Alice Courier',
        description: 'Attend Advanced Warehouse Safety Seminar',
        successMeasure: 'Certification pass',
        timeframe: 'Q3',
        targetCompletionDate: '2026-09-30T00:00:00Z',
        isCompleted: false,
        createdAt: '2026-07-01T10:00:00Z',
        updatedAt: '2026-07-01T10:00:00Z'
    }
];

const mockReviewDetail: ReviewResultDTO = {
    reviewId: 'rev-101',
    templateId: 'tmpl-1',
    templateTitle: 'Courier Performance Template',
    title: 'Q4 2026 Courier Performance Review',
    description: 'Quarterly review',
    scope: 'Individual',
    status: 'ManagerReview',
    periodStart: '2026-10-01T00:00:00Z',
    periodEnd: '2026-10-31T23:59:59Z',
    isFinalized: false,
    overallScore: 88.0,
    overallRating: 'Exceeds Expectations',
    ratingDistribution: {},
    employees: [
        {
            employeeId: 'emp-alice',
            employeeName: 'Alice Courier',
            employeeNumber: 'EMP-001',
            finalScore: 88.0,
            ratingLabel: 'Exceeds Expectations',
            outlierCount: 0,
            sections: []
        }
    ]
};

describe('AiRecommendationPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Manager');
    });

    it('renders structured AI recommendation result with summary, strengths, improvements, action items, and training topics', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url.includes('/api/performance/reviews/rev-101/ai-recommend/emp-alice')) {
                return { data: { data: mockAiRec } } as any;
            }
            return { data: { data: null } } as any;
        });

        render(
            <ToastProvider>
                <AiRecommendationPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                    isAiEnabled={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('ai-recommendation-panel')).toBeInTheDocument();
        });

        // Check structured results
        expect(screen.getByTestId('ai-status-badge')).toHaveTextContent(/Pending/i);
        expect(screen.getByTestId('ai-summary-text')).toHaveTextContent(
            'Alice consistently meets turnaround times'
        );
        expect(screen.getByTestId('ai-strengths-list')).toHaveTextContent('Route optimization');
        expect(screen.getByTestId('ai-strengths-list')).toHaveTextContent('Zero safety incidents');
        expect(screen.getByTestId('ai-improvements-list')).toHaveTextContent('Digital proof-of-delivery accuracy');
        expect(screen.getByTestId('ai-action-items-table')).toHaveTextContent(
            'Complete mobile scanner retraining module'
        );
        expect(screen.getByTestId('ai-training-tags')).toHaveTextContent('Defensive Driving');
        expect(screen.getByTestId('manual-override-textarea')).toHaveValue(
            'Candidate demonstrates strong motivation for lead dispatcher track.'
        );
    });

    it('disables the Generate button and renders warning banner when isAiEnabled is false', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: null } } as any);

        render(
            <ToastProvider>
                <AiRecommendationPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                    isAiEnabled={false}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('ai-empty-state')).toBeInTheDocument();
        });

        const genBtn = screen.getByTestId('generate-ai-btn');
        expect(genBtn).toBeDisabled();
        expect(screen.getByTestId('ai-disabled-banner')).toBeInTheDocument();
    });

    it('generates an AI recommendation and renders it on click', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: null } } as any);
        vi.mocked(api.post).mockResolvedValue({ data: { data: mockAiRec } } as any);

        render(
            <ToastProvider>
                <AiRecommendationPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                    isAiEnabled={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('empty-generate-btn')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('empty-generate-btn'));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/api/performance/reviews/rev-101/ai-recommend/emp-alice');
            expect(screen.getByTestId('ai-summary-text')).toHaveTextContent('Alice consistently meets');
        });
    });

    it('allows manager to inline edit summary and action items, and approve recommendation', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: mockAiRec } } as any);
        const editedRec = { ...mockAiRec, summary: 'Updated supervisor evaluation notes.' };
        const approvedRec = { ...mockAiRec, summary: 'Updated supervisor evaluation notes.', status: 'Approved' };
        vi.mocked(api.put)
            .mockResolvedValueOnce({ data: { data: editedRec } } as any)
            .mockResolvedValueOnce({ data: { data: approvedRec } } as any);

        render(
            <ToastProvider>
                <AiRecommendationPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                    isAiEnabled={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('edit-ai-btn')).toBeInTheDocument();
        });

        // Click Edit
        fireEvent.click(screen.getByTestId('edit-ai-btn'));
        const summaryTextarea = screen.getByTestId('ai-summary-textarea');
        fireEvent.change(summaryTextarea, { target: { value: 'Updated supervisor evaluation notes.' } });

        // Save Edits
        fireEvent.click(screen.getByTestId('save-ai-edits-btn'));
        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith(
                '/api/performance/reviews/rev-101/ai-recommend/emp-alice',
                expect.objectContaining({
                    summary: 'Updated supervisor evaluation notes.'
                })
            );
        });

        // Click Approve
        fireEvent.click(screen.getByTestId('approve-ai-btn'));
        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith(
                '/api/performance/reviews/rev-101/ai-recommend/emp-alice',
                expect.objectContaining({
                    status: 'Approved'
                })
            );
        });
    });

    it('blocks employee view when recommendation is not yet approved and shows pending badge', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: mockAiRec } } as any); // Status is 'Pending'

        render(
            <ToastProvider>
                <AiRecommendationPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={false} // Employee mode
                    isAiEnabled={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('ai-panel-employee-pending')).toBeInTheDocument();
        });
        expect(screen.getByText(/AI recommendations will be visible here once your manager reviews and approves them/i)).toBeInTheDocument();
    });

    it('displays full recommendation to employee when status is Approved', async () => {
        const approvedRec = { ...mockAiRec, status: 'Approved' };
        vi.mocked(api.get).mockResolvedValue({ data: { data: approvedRec } } as any);

        render(
            <ToastProvider>
                <AiRecommendationPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={false} // Employee mode
                    isAiEnabled={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('ai-recommendation-panel')).toBeInTheDocument();
            expect(screen.getByTestId('ai-summary-text')).toHaveTextContent('Alice consistently meets turnaround times');
        });
        // Employee should NOT have edit or generate buttons
        expect(screen.queryByTestId('generate-ai-btn')).not.toBeInTheDocument();
        expect(screen.queryByTestId('edit-ai-btn')).not.toBeInTheDocument();
    });
});

describe('DevelopmentPlanPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Manager');
    });

    it('renders plan checklist and prior-cycle open items carryover banner', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url.includes('/api/performance/reviews/rev-101/development-plan/emp-alice')) {
                return { data: { data: mockDevPlanItems } } as any;
            }
            if (url.includes('/api/performance/employees/emp-alice/development-plan')) {
                return { data: { data: [...mockDevPlanItems, ...mockPriorOpenItems] } } as any;
            }
            return { data: { data: null } } as any;
        });

        render(
            <ToastProvider>
                <DevelopmentPlanPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('development-plan-panel')).toBeInTheDocument();
        });

        // Verify prior-cycle banner
        expect(screen.getByTestId('prior-cycle-banner')).toBeInTheDocument();
        expect(screen.getByText(/Prior Review Cycle Carryover/i)).toBeInTheDocument();
        expect(screen.getByText('Attend Advanced Warehouse Safety Seminar')).toBeInTheDocument();

        // Verify checklist items
        expect(screen.getByTestId('plan-checklist')).toBeInTheDocument();
        expect(screen.getByText('Complete mobile scanner retraining module')).toBeInTheDocument();
        expect(screen.getByText('Implement weekly fuel efficiency checklist')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument(); // 1 of 2 completed
    });

    it('allows toggling completion checkbox on a plan item', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url.includes('/api/performance/reviews/rev-101/development-plan/emp-alice')) {
                return { data: { data: mockDevPlanItems } } as any;
            }
            return { data: { data: [] } } as any;
        });
        const completedItem = { ...mockDevPlanItems[0], isCompleted: true };
        vi.mocked(api.put).mockResolvedValue({ data: { data: completedItem } } as any);

        render(
            <ToastProvider>
                <DevelopmentPlanPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('toggle-complete-plan-1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('toggle-complete-plan-1'));

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith(
                '/api/performance/development-plan/plan-1',
                { isCompleted: true }
            );
        });
    });

    it('allows manager to create new development plan items and import from approved AI action items', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: [] } } as any);
        vi.mocked(api.post).mockResolvedValue({ data: { data: mockDevPlanItems } } as any);

        const approvedAi = { ...mockAiRec, status: 'Approved' };

        render(
            <ToastProvider>
                <DevelopmentPlanPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                    aiRecommendation={approvedAi}
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('create-plan-btn')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('create-plan-btn'));

        // Plan builder opened and can import
        await waitFor(() => {
            expect(screen.getByTestId('plan-builder-card')).toBeInTheDocument();
            expect(screen.getByTestId('import-ai-action-items-btn')).toBeInTheDocument();
        });

        // Click import button
        fireEvent.click(screen.getByTestId('import-ai-action-items-btn'));

        const descInput = screen.getByTestId('new-item-desc-0');
        expect(descInput).toHaveValue('Complete mobile scanner retraining module');

        // Save
        fireEvent.click(screen.getByTestId('save-new-plan-btn'));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                '/api/performance/reviews/rev-101/development-plan/emp-alice',
                expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({
                            description: 'Complete mobile scanner retraining module'
                        })
                    ])
                })
            );
        });
    });

    it('blocks plan creation when AI recommendation is Pending', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: [] } } as any);

        render(
            <ToastProvider>
                <DevelopmentPlanPanel
                    reviewId="rev-101"
                    employeeId="emp-alice"
                    employeeName="Alice Courier"
                    isManager={true}
                    aiRecommendation={mockAiRec} // status is Pending
                />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('create-plan-btn')).toBeDisabled();
            expect(screen.getByTestId('ai-pending-guard-banner')).toBeInTheDocument();
        });
    });
});

describe('ReviewDetailView Sub-Tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Manager');
    });

    it('switches between Ratings, AI Recommendations, and Development Plan tabs', async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url.includes('/api/performance/reviews/rev-101/ai-recommend/emp-alice')) {
                return { data: { data: mockAiRec } } as any;
            }
            if (url.includes('/api/performance/reviews/rev-101/development-plan/emp-alice')) {
                return { data: { data: mockDevPlanItems } } as any;
            }
            if (url.includes('/api/performance/reviews/rev-101')) {
                return { data: { data: mockReviewDetail } } as any;
            }
            if (url.includes('/api/performance/templates/tmpl-1')) {
                return { data: { data: { id: 'tmpl-1', title: 'Courier Performance Template', isAiEnabled: true } } } as any;
            }
            return { data: { data: [] } } as any;
        });

        render(
            <ToastProvider>
                <ReviewDetailView reviewId="rev-101" onBack={() => {}} />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('detail-tab-ratings')).toBeInTheDocument();
            expect(screen.getByTestId('rating-grid')).toBeInTheDocument();
        });

        // Switch to AI tab
        fireEvent.click(screen.getByTestId('detail-tab-ai'));
        await waitFor(() => {
            expect(screen.getByTestId('ai-recommendation-panel')).toBeInTheDocument();
        });

        // Switch to Development Plan tab
        fireEvent.click(screen.getByTestId('detail-tab-plan'));
        await waitFor(() => {
            expect(screen.getByTestId('development-plan-panel')).toBeInTheDocument();
        });
    });
});
