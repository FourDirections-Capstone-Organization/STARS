/**
 * Performance Evaluation domain and DTO types for STARS.
 * Aligned with Backend.Models and Backend.Models.DTOs.
 */

// --- Enums ---

export type CriterionType = 'Standard' | 'KpiLinked';

export type ReviewWorkflowStatus =
    | 'Draft'
    | 'SelfAssessment'
    | 'ManagerReview'
    | 'HrReview'
    | 'Acknowledgment'
    | 'Finalized';

export type ReviewScope = 'Individual' | 'Team' | 'Department';

export type AiRecommendationStatus =
    | 'Pending'
    | 'Approved'
    | 'Rejected'
    | 'ManualOverride';

// --- Evaluation Template Domain Types ---

export interface EvaluationCriterion {
    id?: string;
    sectionId?: string;
    title: string;
    description?: string | null;
    weight: number;
    criterionType: CriterionType;
    metricCode?: string | null;
    order: number;
}

export interface EvaluationSection {
    id?: string;
    templateId?: string;
    title: string;
    description?: string | null;
    weight: number;
    order: number;
    isKpiSection: boolean;
    criteria: EvaluationCriterion[];
}

export interface RatingBand {
    id?: string;
    templateId?: string;
    label: string;
    minScore: number;
    maxScore: number;
    color?: string | null;
    description?: string | null;
    order: number;
}

export interface EvaluationTemplate {
    id?: string;
    title: string;
    description?: string | null;
    targetRole?: string | null;
    departmentId?: string | null;
    departmentName?: string | null;
    department?: { id: string; name: string } | null;
    isActive: boolean;
    isAiEnabled: boolean;
    createdById?: string | null;
    createdAt?: string;
    updatedAt?: string;
    sections: EvaluationSection[];
    ratingBands: RatingBand[];
    reviews?: any[];
}

export interface DepartmentOption {
    id: string;
    name: string;
}

// --- Scoring & Review DTOs ---

export interface CriterionScoreDTO {
    criterionId: string;
    criterionTitle: string;
    criterionType: CriterionType;
    metricCode?: string | null;
    weight: number;
    order: number;
    selfScore?: number | null;
    managerScore?: number | null;
    gap?: number | null;
    isOutlier: boolean;
    score: number;
    selfComment?: string | null;
    managerComment?: string | null;
}

export interface SectionScoreDTO {
    sectionId: string;
    sectionTitle: string;
    weight: number;
    order: number;
    isKpiSection: boolean;
    score: number;
    weightedScore: number;
    criteria: CriterionScoreDTO[];
    kpiMetrics?: Array<{
        metricCode?: string;
        metricName?: string;
        name?: string;
        value?: number;
        actualValue?: number;
        target?: number;
        targetValue?: number;
        score?: number;
        weightedScore?: number;
        weight?: number;
        rating?: string;
        unit?: string;
    }> | null;
}

export interface EmployeeReviewScoreDTO {
    employeeId: string;
    employeeName: string;
    employeeNumber?: string | null;
    departmentId?: string | null;
    departmentName?: string | null;
    jobPositionTitle?: string | null;
    role?: string | null;
    sections: SectionScoreDTO[];
    finalScore: number;
    ratingLabel: string;
    ratingBandColor?: string | null;
    ratingBandDescription?: string | null;
    outlierCount: number;
}

export interface ReviewResultDTO {
    reviewId: string;
    templateId: string;
    templateTitle: string;
    title: string;
    description?: string | null;
    scope: ReviewScope;
    status: ReviewWorkflowStatus;
    periodStart: string;
    periodEnd: string;
    departmentId?: string | null;
    departmentName?: string | null;
    teamId?: string | null;
    teamName?: string | null;
    reviewerId?: string | null;
    reviewerName?: string | null;
    isFinalized: boolean;
    finalizedAt?: string | null;
    overallScore: number;
    overallRating: string;
    ratingDistribution: Record<string, number>;
    employees: EmployeeReviewScoreDTO[];
}

export interface PerformanceReviewSummaryDTO {
    id: string;
    templateId: string;
    templateTitle: string;
    title: string;
    description?: string | null;
    scope: ReviewScope;
    status: ReviewWorkflowStatus;
    periodStart: string;
    periodEnd: string;
    departmentId?: string | null;
    departmentName?: string | null;
    teamId?: string | null;
    teamName?: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    reviewerId?: string | null;
    reviewerName?: string | null;
    isFinalized: boolean;
    finalizedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreatePerformanceReviewDTO {
    templateId: string;
    title: string;
    description?: string | null;
    scope: ReviewScope;
    periodStart: string;
    periodEnd: string;
    departmentId?: string | null;
    teamId?: string | null;
    employeeId?: string | null;
    reviewerId?: string | null;
}

export interface CriterionRatingSubmissionDTO {
    criterionId: string;
    selfScore?: number | null;
    selfComment?: string | null;
    managerScore?: number | null;
    managerComment?: string | null;
}

export interface SubmitReviewRatingsDTO {
    employeeId?: string | null;
    ratings: CriterionRatingSubmissionDTO[];
    criterionId?: string | null;
    selfScore?: number | null;
    selfComment?: string | null;
    managerScore?: number | null;
    managerComment?: string | null;
}

export interface ReviewStatusTransitionDTO {
    targetStatus: ReviewWorkflowStatus;
    transitionComment?: string | null;
}

export interface PerformanceReviewFilterDTO {
    status?: ReviewWorkflowStatus;
    scope?: ReviewScope;
    startDate?: string;
    endDate?: string;
    departmentId?: string;
    teamId?: string;
    employeeId?: string;
}

// --- AI Recommendation DTOs ---

export interface AiRecommendationActionItem {
    description: string;
    successMeasure: string;
    timeframe: string;
}

export interface AiRecommendationDTO {
    id: string;
    reviewId: string;
    employeeId: string;
    status: AiRecommendationStatus;
    summary?: string | null;
    strengthsJson?: string | null;
    improvementAreasJson?: string | null;
    actionItemsJson?: string | null;
    trainingTopicsJson?: string | null;
    manualNotes?: string | null;
    reviewedById?: string | null;
    reviewedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    // Client-parsed structures
    strengths?: string[];
    improvementAreas?: string[];
    actionItems?: AiRecommendationActionItem[];
    trainingTopics?: string[];
}

export interface UpdateAiRecommendationDTO {
    status: AiRecommendationStatus;
    summary?: string | null;
    strengths?: string[];
    improvementAreas?: string[];
    actionItems?: AiRecommendationActionItem[];
    trainingTopics?: string[];
    manualNotes?: string | null;
}

// --- Development Plan DTOs ---

export interface DevelopmentPlanItemDTO {
    id: string;
    reviewId: string;
    reviewTitle?: string | null;
    employeeId: string;
    employeeName?: string | null;
    description: string;
    successMeasure?: string | null;
    timeframe?: string | null;
    targetCompletionDate?: string | null;
    isCompleted: boolean;
    completedAt?: string | null;
    completedById?: string | null;
    completedByName?: string | null;
    createdById?: string | null;
    createdByName?: string | null;
    managerNotes?: string | null;
    employeeNotes?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateDevelopmentPlanItemDTO {
    description: string;
    successMeasure?: string | null;
    timeframe?: string | null;
    targetCompletionDate?: string | null;
    managerNotes?: string | null;
}

export interface CreateDevelopmentPlanRequestDTO {
    description?: string;
    successMeasure?: string;
    timeframe?: string;
    targetCompletionDate?: string;
    managerNotes?: string;
    items?: CreateDevelopmentPlanItemDTO[];
}

export interface UpdateDevelopmentPlanItemDTO {
    description?: string;
    successMeasure?: string;
    timeframe?: string;
    targetCompletionDate?: string;
    isCompleted?: boolean;
    managerNotes?: string;
    employeeNotes?: string;
}
