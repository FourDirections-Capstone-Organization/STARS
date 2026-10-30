import api from '../api';
import {
    EvaluationTemplate,
    CreatePerformanceReviewDTO,
    PerformanceReviewSummaryDTO,
    ReviewResultDTO,
    SubmitReviewRatingsDTO,
    ReviewStatusTransitionDTO,
    PerformanceReviewFilterDTO,
    AiRecommendationDTO,
    UpdateAiRecommendationDTO,
    DevelopmentPlanItemDTO,
    CreateDevelopmentPlanRequestDTO,
    UpdateDevelopmentPlanItemDTO
} from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/types';

/**
 * Triggers a browser file download from raw blob data.
 */
export const triggerFileDownload = (
    blobData: BlobPart,
    defaultFilename: string,
    mimeType = 'text/csv'
): void => {
    const blob = blobData instanceof Blob
        ? blobData
        : new Blob([blobData], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', defaultFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

// ============================================================================
// Evaluation Template APIs
// ============================================================================

/**
 * Lists evaluation templates with optional filtering.
 */
export const fetchTemplates = async (params?: {
    activeOnly?: boolean;
    departmentId?: string;
    targetRole?: string;
}): Promise<EvaluationTemplate[]> => {
    const query: Record<string, any> = {};
    if (params?.activeOnly !== undefined) query.activeOnly = params.activeOnly;
    if (params?.departmentId) query.departmentId = params.departmentId;
    if (params?.targetRole) query.targetRole = params.targetRole;

    const res = await api.get('/api/performance/templates', query);
    if (res.data?.data && Array.isArray(res.data.data)) {
        return res.data.data;
    }
    if (Array.isArray(res.data)) {
        return res.data;
    }
    return [];
};

/**
 * Retrieves a single evaluation template by ID.
 */
export const fetchTemplateById = async (id: string): Promise<EvaluationTemplate> => {
    const res = await api.get(`/api/performance/templates/${id}`);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Creates and persists a new evaluation template.
 */
export const createTemplate = async (template: Partial<EvaluationTemplate>): Promise<EvaluationTemplate> => {
    const res = await api.post('/api/performance/templates', template);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Updates an existing evaluation template.
 */
export const updateTemplate = async (
    id: string,
    template: Partial<EvaluationTemplate>
): Promise<EvaluationTemplate> => {
    const res = await api.put(`/api/performance/templates/${id}`, template);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Soft-deletes / deactivates an evaluation template.
 */
export const deleteTemplate = async (id: string): Promise<void> => {
    await api.delete(`/api/performance/templates/${id}`);
};

// ============================================================================
// Performance Review APIs
// ============================================================================

/**
 * Creates a new performance review cycle.
 */
export const createReview = async (data: CreatePerformanceReviewDTO): Promise<PerformanceReviewSummaryDTO> => {
    const res = await api.post('/api/performance/reviews', data);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Queries performance reviews with optional filters.
 */
export const fetchReviews = async (
    filter?: PerformanceReviewFilterDTO
): Promise<PerformanceReviewSummaryDTO[]> => {
    const query: Record<string, any> = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.scope) query.scope = filter.scope;
    if (filter?.startDate) query.startDate = filter.startDate;
    if (filter?.endDate) query.endDate = filter.endDate;
    if (filter?.departmentId) query.departmentId = filter.departmentId;
    if (filter?.teamId) query.teamId = filter.teamId;
    if (filter?.employeeId) query.employeeId = filter.employeeId;

    const res = await api.get('/api/performance/reviews', query);
    if (res.data?.data && Array.isArray(res.data.data)) {
        return res.data.data;
    }
    if (Array.isArray(res.data)) {
        return res.data;
    }
    return [];
};

/**
 * Retrieves full review details and evaluated scores.
 */
export const fetchReviewById = async (id: string): Promise<ReviewResultDTO> => {
    const res = await api.get(`/api/performance/reviews/${id}`);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Computes or retrieves current scores for a review without mutating state.
 */
export const fetchReviewScore = async (id: string): Promise<ReviewResultDTO> => {
    const res = await api.get(`/api/performance/reviews/${id}/score`);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Submits self or manager ratings for criteria within a review.
 */
export const submitReviewRatings = async (
    reviewId: string,
    data: SubmitReviewRatingsDTO
): Promise<ReviewResultDTO> => {
    const res = await api.put(`/api/performance/reviews/${reviewId}/ratings`, data);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Transitions review workflow state (Draft -> SelfAssessment -> ManagerReview -> HrReview -> Acknowledgment -> Finalized).
 */
export const transitionReviewWorkflow = async (
    reviewId: string,
    data: ReviewStatusTransitionDTO
): Promise<any> => {
    const res = await api.post(`/api/performance/reviews/${reviewId}/transition`, data);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

// ============================================================================
// AI Recommendation APIs
// ============================================================================

const parseAiRecommendation = (rec: any): AiRecommendationDTO | null => {
    if (!rec || typeof rec !== 'object' || !rec.id) return null;
    const parsed: AiRecommendationDTO = { ...rec };
    try {
        if (rec.strengthsJson && !parsed.strengths) {
            parsed.strengths = JSON.parse(rec.strengthsJson);
        }
    } catch {
        parsed.strengths = [];
    }
    try {
        if (rec.improvementAreasJson && !parsed.improvementAreas) {
            parsed.improvementAreas = JSON.parse(rec.improvementAreasJson);
        }
    } catch {
        parsed.improvementAreas = [];
    }
    try {
        if (rec.actionItemsJson && !parsed.actionItems) {
            parsed.actionItems = JSON.parse(rec.actionItemsJson);
        }
    } catch {
        parsed.actionItems = [];
    }
    try {
        if (rec.trainingTopicsJson && !parsed.trainingTopics) {
            parsed.trainingTopics = JSON.parse(rec.trainingTopicsJson);
        }
    } catch {
        parsed.trainingTopics = [];
    }
    return parsed;
};

/**
 * Triggers LLM recommendation generation for an employee in a review.
 */
export const generateAiRecommendation = async (
    reviewId: string,
    employeeId: string
): Promise<AiRecommendationDTO> => {
    const res = await api.post(`/api/performance/reviews/${reviewId}/ai-recommend/${employeeId}`);
    const data = res.data?.data !== undefined ? res.data.data : res.data;
    return parseAiRecommendation(data) as AiRecommendationDTO;
};

/**
 * Updates, approves, or rejects an AI recommendation.
 */
export const updateAiRecommendation = async (
    reviewId: string,
    employeeId: string,
    data: UpdateAiRecommendationDTO
): Promise<AiRecommendationDTO> => {
    const res = await api.put(`/api/performance/reviews/${reviewId}/ai-recommend/${employeeId}`, data);
    const result = res.data?.data !== undefined ? res.data.data : res.data;
    return parseAiRecommendation(result) as AiRecommendationDTO;
};

/**
 * Fetches the AI recommendation record for an employee in a review.
 */
export const fetchAiRecommendation = async (
    reviewId: string,
    employeeId: string
): Promise<AiRecommendationDTO | null> => {
    const res = await api.get(`/api/performance/reviews/${reviewId}/ai-recommend/${employeeId}`);
    const data = res.data?.data !== undefined ? res.data.data : res.data;
    return data ? parseAiRecommendation(data) : null;
};

// ============================================================================
// Development Plan APIs
// ============================================================================

/**
 * Retrieves development plan items for an employee within a review cycle.
 */
export const fetchDevelopmentPlan = async (
    reviewId: string,
    employeeId: string
): Promise<DevelopmentPlanItemDTO[]> => {
    const res = await api.get(`/api/performance/reviews/${reviewId}/development-plan/${employeeId}`);
    if (res.data?.data && Array.isArray(res.data.data)) {
        return res.data.data;
    }
    if (Array.isArray(res.data)) {
        return res.data;
    }
    return [];
};

/**
 * Creates development plan items from approved AI recommendations or manual input.
 */
export const createDevelopmentPlan = async (
    reviewId: string,
    employeeId: string,
    data: CreateDevelopmentPlanRequestDTO
): Promise<DevelopmentPlanItemDTO[]> => {
    const res = await api.post(`/api/performance/reviews/${reviewId}/development-plan/${employeeId}`, data);
    if (res.data?.data && Array.isArray(res.data.data)) {
        return res.data.data;
    }
    if (Array.isArray(res.data)) {
        return res.data;
    }
    return [];
};

/**
 * Updates a development plan item (status completion or notes).
 */
export const updateDevelopmentPlanItem = async (
    itemId: string,
    data: UpdateDevelopmentPlanItemDTO
): Promise<DevelopmentPlanItemDTO> => {
    const res = await api.put(`/api/performance/development-plan/${itemId}`, data);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Retrieves the full cross-cycle development plan history for an employee.
 */
export const fetchEmployeeDevelopmentPlan = async (
    employeeId: string
): Promise<DevelopmentPlanItemDTO[]> => {
    const res = await api.get(`/api/performance/employees/${employeeId}/development-plan`);
    if (res.data?.data && Array.isArray(res.data.data)) {
        return res.data.data;
    }
    if (Array.isArray(res.data)) {
        return res.data;
    }
    return [];
};

// ============================================================================
// CSV Export API
// ============================================================================

/**
 * Exports performance review ratings and scores to a CSV file and triggers download.
 */
export const exportReviewCsv = async (
    reviewId: string,
    customFilename?: string
): Promise<void> => {
    const res = await api.get(`/api/performance/reviews/${reviewId}/export/csv`, undefined, {
        responseType: 'blob'
    });
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = customFilename || `PerformanceReview_${reviewId.slice(0, 8)}_${dateStr}.csv`;
    triggerFileDownload(res.data, filename, 'text/csv');
};
