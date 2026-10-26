import api from '../api';

// ─── DTO Types ───

export interface ApiResponse<T> {
    isSuccess: boolean;
    message: string;
    data: T;
}

export interface PagedResponseDTO<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
}

export interface SuitabilityResponseDTO {
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    role: string;
    workload: number;
    suitabilityScore: number;
    rank?: number;
    rationale?: string;
}

export interface SuitabilityExplanationDTO {
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    finalScore: number;
    workloadFactor: number;
    workloadWeight: number;
    experienceFactor: number;
    experienceWeight: number;
    recScore: number;
    recScoreWeight: number;
    explanation: string;
    rank?: number;
    rationale?: string;
}

export interface SlaRiskResponseDTO {
    taskId: string;
    riskLevel: string;
    confidenceScore: number;
    keyFactors: string[];
}

export interface FactorContributionDTO {
    featureName: string;
    value: number;
    contribution: number;
    description: string;
}

export interface SlaRiskExplanationDTO {
    taskId: string;
    riskLevel: string;
    confidenceScore: number;
    featureContributions: FactorContributionDTO[];
}

// ─── AI Service ───

export const aiService = {
    /** Get paginated suitable employees for a task */
    getSuitability: (taskId: string, pageNumber?: number, pageSize?: number) => {
        const params: Record<string, number> = {};
        if (pageNumber !== undefined) params.pageNumber = pageNumber;
        if (pageSize !== undefined) params.pageSize = pageSize;
        return api.get<ApiResponse<PagedResponseDTO<SuitabilityResponseDTO>>>(
            `/api/tasks/${taskId}/suitability`, Object.keys(params).length > 0 ? params : undefined);
    },

    /** Get paginated suitability preview for department & classification */
    getSuitabilityPreview: (departmentId: string, classification: number = 0, pageNumber?: number, pageSize?: number) => {
        const params: Record<string, any> = { departmentId, classification };
        if (pageNumber !== undefined) params.pageNumber = pageNumber;
        if (pageSize !== undefined) params.pageSize = pageSize;
        return api.get<ApiResponse<PagedResponseDTO<SuitabilityResponseDTO>>>(
            '/api/suitability/preview', params);
    },

    /** Get detailed suitability explanation for a specific employee */
    getSuitabilityExplanation: (taskId: string, employeeId: string) =>
        api.get<ApiResponse<SuitabilityExplanationDTO[]>>(`/api/tasks/${taskId}/suitability/${employeeId}/explain`),

    /** Get SLA risk prediction for a task (from ML.NET model) */
    getSlaRisk: (taskId: string) =>
        api.get<SlaRiskResponseDTO>(`/api/tasks/${taskId}/sla-risk`),

    /** Get SLA risk explanation with feature contributions */
    getSlaRiskExplanation: (taskId: string) =>
        api.get<SlaRiskExplanationDTO>(`/api/tasks/${taskId}/sla-risk/explain`),
};
