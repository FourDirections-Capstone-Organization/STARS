/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../api';
import {
    fetchTemplates,
    fetchTemplateById,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createReview,
    fetchReviews,
    fetchReviewById,
    fetchReviewScore,
    submitReviewRatings,
    transitionReviewWorkflow,
    generateAiRecommendation,
    updateAiRecommendation,
    fetchAiRecommendation,
    fetchDevelopmentPlan,
    createDevelopmentPlan,
    updateDevelopmentPlanItem,
    fetchEmployeeDevelopmentPlan,
    exportReviewCsv
} from '../services/performanceEvaluationService';

vi.mock('../api');

describe('PerformanceEvaluationService API tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Evaluation Template APIs', () => {
        it('fetchTemplates queries /api/performance/templates with parameters', async () => {
            const mockTemplates = [
                { id: 'tmpl-1', title: 'Courier Template', isActive: true, sections: [], ratingBands: [] }
            ];
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: mockTemplates }
            });

            const result = await fetchTemplates({ activeOnly: true, departmentId: 'dept-123' });
            expect(api.get).toHaveBeenCalledWith('/api/performance/templates', {
                activeOnly: true,
                departmentId: 'dept-123'
            });
            expect(result).toEqual(mockTemplates);
        });

        it('fetchTemplateById queries template by id', async () => {
            const mockTemplate = { id: 'tmpl-1', title: 'Specific Template' };
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: mockTemplate }
            });

            const result = await fetchTemplateById('tmpl-1');
            expect(api.get).toHaveBeenCalledWith('/api/performance/templates/tmpl-1');
            expect(result).toEqual(mockTemplate);
        });

        it('createTemplate sends POST request to /api/performance/templates', async () => {
            const payload = { title: 'New Template', isActive: true };
            const created = { id: 'new-id', ...payload };
            (api.post as any).mockResolvedValue({
                data: { isSuccess: true, data: created }
            });

            const result = await createTemplate(payload as any);
            expect(api.post).toHaveBeenCalledWith('/api/performance/templates', payload);
            expect(result).toEqual(created);
        });

        it('updateTemplate sends PUT request to /api/performance/templates/{id}', async () => {
            const payload = { title: 'Updated Template' };
            (api.put as any).mockResolvedValue({
                data: { isSuccess: true, data: { id: 'tmpl-1', ...payload } }
            });

            const result = await updateTemplate('tmpl-1', payload as any);
            expect(api.put).toHaveBeenCalledWith('/api/performance/templates/tmpl-1', payload);
            expect(result.title).toBe('Updated Template');
        });

        it('deleteTemplate sends DELETE request to /api/performance/templates/{id}', async () => {
            (api.delete as any).mockResolvedValue({ data: { isSuccess: true } });

            await deleteTemplate('tmpl-1');
            expect(api.delete).toHaveBeenCalledWith('/api/performance/templates/tmpl-1');
        });
    });

    describe('Performance Review APIs', () => {
        it('createReview posts review creation DTO', async () => {
            const payload = {
                templateId: 'tmpl-1',
                title: 'Q4 Review',
                scope: 'Individual' as const,
                periodStart: '2026-10-01',
                periodEnd: '2026-12-31'
            };
            (api.post as any).mockResolvedValue({
                data: { isSuccess: true, data: { id: 'rev-1', ...payload } }
            });

            const result = await createReview(payload);
            expect(api.post).toHaveBeenCalledWith('/api/performance/reviews', payload);
            expect(result.id).toBe('rev-1');
        });

        it('fetchReviews queries reviews with filters', async () => {
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: [{ id: 'rev-1', title: 'Annual Review' }] }
            });

            const result = await fetchReviews({ status: 'Draft' });
            expect(api.get).toHaveBeenCalledWith('/api/performance/reviews', { status: 'Draft' });
            expect(result.length).toBe(1);
        });

        it('fetchReviewById returns review details and evaluated scores', async () => {
            const mockDetail = { reviewId: 'rev-1', title: 'Review 1', overallScore: 88.5 };
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: mockDetail }
            });

            const result = await fetchReviewById('rev-1');
            expect(api.get).toHaveBeenCalledWith('/api/performance/reviews/rev-1');
            expect(result.overallScore).toBe(88.5);
        });

        it('fetchReviewScore computes live review score', async () => {
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: { overallScore: 92.0 } }
            });

            const result = await fetchReviewScore('rev-1');
            expect(api.get).toHaveBeenCalledWith('/api/performance/reviews/rev-1/score');
            expect(result.overallScore).toBe(92.0);
        });

        it('submitReviewRatings submits ratings DTO via PUT', async () => {
            const payload = {
                ratings: [{ criterionId: 'crit-1', managerScore: 4.5, managerComment: 'Great work' }]
            };
            (api.put as any).mockResolvedValue({
                data: { isSuccess: true, data: { overallScore: 90 } }
            });

            await submitReviewRatings('rev-1', payload);
            expect(api.put).toHaveBeenCalledWith('/api/performance/reviews/rev-1/ratings', payload);
        });

        it('transitionReviewWorkflow advances review state', async () => {
            const payload = { targetStatus: 'SelfAssessment' as const, transitionComment: 'Starting review' };
            (api.post as any).mockResolvedValue({
                data: { isSuccess: true, data: { isSuccess: true, newStatus: 'SelfAssessment' } }
            });

            await transitionReviewWorkflow('rev-1', payload);
            expect(api.post).toHaveBeenCalledWith('/api/performance/reviews/rev-1/transition', payload);
        });
    });

    describe('AI Recommendation APIs', () => {
        it('generateAiRecommendation generates and parses JSON fields', async () => {
            const mockRaw = {
                id: 'ai-1',
                reviewId: 'rev-1',
                employeeId: 'emp-1',
                status: 'Pending',
                strengthsJson: JSON.stringify(['Attention to detail', 'Speed']),
                improvementAreasJson: JSON.stringify(['Cross-team communication']),
                actionItemsJson: JSON.stringify([{ description: 'Attend SLA training', successMeasure: '100% on-time', timeframe: '30 days' }]),
                trainingTopicsJson: JSON.stringify(['Advanced Logistics Routing'])
            };
            (api.post as any).mockResolvedValue({
                data: { isSuccess: true, data: mockRaw }
            });

            const result = await generateAiRecommendation('rev-1', 'emp-1');
            expect(api.post).toHaveBeenCalledWith('/api/performance/reviews/rev-1/ai-recommend/emp-1');
            expect(result.strengths).toEqual(['Attention to detail', 'Speed']);
            expect(result.actionItems?.[0].description).toBe('Attend SLA training');
        });

        it('updateAiRecommendation sends approved or edited recommendations', async () => {
            const payload = { status: 'Approved' as const, summary: 'Approved by manager' };
            (api.put as any).mockResolvedValue({
                data: { isSuccess: true, data: { id: 'ai-1', status: 'Approved' } }
            });

            const result = await updateAiRecommendation('rev-1', 'emp-1', payload);
            expect(api.put).toHaveBeenCalledWith('/api/performance/reviews/rev-1/ai-recommend/emp-1', payload);
            expect(result.status).toBe('Approved');
        });

        it('fetchAiRecommendation retrieves recommendation record', async () => {
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: { id: 'ai-1', status: 'Approved' } }
            });

            const result = await fetchAiRecommendation('rev-1', 'emp-1');
            expect(api.get).toHaveBeenCalledWith('/api/performance/reviews/rev-1/ai-recommend/emp-1');
            expect(result?.id).toBe('ai-1');
        });
    });

    describe('Development Plan APIs', () => {
        it('fetchDevelopmentPlan retrieves plan items for an employee', async () => {
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: [{ id: 'plan-1', description: 'Complete training' }] }
            });

            const result = await fetchDevelopmentPlan('rev-1', 'emp-1');
            expect(api.get).toHaveBeenCalledWith('/api/performance/reviews/rev-1/development-plan/emp-1');
            expect(result.length).toBe(1);
        });

        it('createDevelopmentPlan posts new items', async () => {
            const payload = { description: 'Punctuality coaching' };
            (api.post as any).mockResolvedValue({
                data: { isSuccess: true, data: [{ id: 'plan-2', description: 'Punctuality coaching' }] }
            });

            const result = await createDevelopmentPlan('rev-1', 'emp-1', payload);
            expect(api.post).toHaveBeenCalledWith('/api/performance/reviews/rev-1/development-plan/emp-1', payload);
            expect(result[0].description).toBe('Punctuality coaching');
        });

        it('updateDevelopmentPlanItem updates item completion and notes', async () => {
            const payload = { isCompleted: true };
            (api.put as any).mockResolvedValue({
                data: { isSuccess: true, data: { id: 'plan-1', isCompleted: true } }
            });

            const result = await updateDevelopmentPlanItem('plan-1', payload);
            expect(api.put).toHaveBeenCalledWith('/api/performance/development-plan/plan-1', payload);
            expect(result.isCompleted).toBe(true);
        });

        it('fetchEmployeeDevelopmentPlan fetches employee cross-cycle history', async () => {
            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: [{ id: 'hist-1' }] }
            });

            const result = await fetchEmployeeDevelopmentPlan('emp-1');
            expect(api.get).toHaveBeenCalledWith('/api/performance/employees/emp-1/development-plan');
            expect(result.length).toBe(1);
        });
    });

    describe('CSV Export API', () => {
        it('exportReviewCsv requests blob and triggers download', async () => {
            const mockBlob = new Blob(['Employee,Score\nJohn,95'], { type: 'text/csv' });
            (api.get as any).mockResolvedValue({ data: mockBlob });

            const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
            const revokeObjectURLMock = vi.fn();
            window.URL.createObjectURL = createObjectURLMock;
            window.URL.revokeObjectURL = revokeObjectURLMock;

            await exportReviewCsv('rev-12345678', 'CustomReport.csv');

            expect(api.get).toHaveBeenCalledWith('/api/performance/reviews/rev-12345678/export/csv', undefined, {
                responseType: 'blob'
            });
            expect(createObjectURLMock).toHaveBeenCalled();
            expect(revokeObjectURLMock).toHaveBeenCalled();
        });
    });
});
