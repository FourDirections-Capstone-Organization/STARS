import api from '../api';
import axios from 'axios';

// ─── Backend DTO Types (mirrors backend C# DTOs) ───

export interface BiomarkerAlertDTO {
    id: string;
    scanDateTime: string;
    scanDate: string;
    departmentId: string | null;
    departmentName: string;
    employeeName?: string;
    employeeNumber?: string;
    metricName: string;
    currentValue: number;
    thresholdValue: number;
    severity: string;
    description: string;
    isAcknowledged: boolean;
    createdAt: string;
}

export interface BiomarkerSummaryDTO {
    totalViolations: number;
    totalSlaBreaches: number;
    totalWorkloadOverloads: number;
    totalBiomarkerFlags: number;
    totalCriticalFlags: number;
    totalHighMediumFlags: number;
    totalLowFlags: number;
}

export interface BiomarkerFilters {
    type?: string;
    employeeNumber?: string;
    departmentId?: string;
    team?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
}

export interface LatestBiomarkerResponse {
    paged: PaginatedResponseDTO<BiomarkerAlertDTO>;
    summary: BiomarkerSummaryDTO;
}

export interface PaginatedResponseDTO<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
}

// ─── Frontend Domain Types ───

export type ViolationType = 'sla_breach' | 'workload_overload' | 'biomarker_flag';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type ViolationStatus = 'New' | 'Acknowledged' | 'Resolved';
export type ScanStatus = 'Idle' | 'Running' | 'Completed' | 'Failed';

export interface BiomarkerViolation {
    id: string;
    type: ViolationType;
    severity: Severity;
    description: string;
    employeeName: string;
    employeeNumber: string;
    department: string;
    departmentId: string;
    taskTitle: string;
    taskReference: string;
    detectedAt: string;
    status: ViolationStatus;
    currentValue?: number;
    thresholdValue?: number;
}

export interface ScanMeta {
    batchId: string;
    scannedAt: string;
    duration: string;
    totalViolations: number;
}

export type AnalyticsHealthStatus = 'loading' | 'online' | 'offline' | 'error';

// ─── Analytics Service ───

const HEALTH_CHECK_TIMEOUT = 5000;
const CHART_FETCH_LIMIT = 500;

async function healthCheckInternal(): Promise<boolean> {
    try {
        const response = await axios.get<BiomarkerAlertDTO[]>('/api/analytics/biomarker/latest', {
            timeout: HEALTH_CHECK_TIMEOUT,
        });
        return response.status >= 200 && response.status < 500;
    } catch {
        return false;
    }
}

async function fetchLatestAlertsPagedInternal(pageNumber: number, pageSize: number, filters?: BiomarkerFilters): Promise<LatestBiomarkerResponse | null> {
    try {
        const params: Record<string, any> = { pageNumber, pageSize };
        if (filters) {
            if (filters.type) params.type = filters.type;
            if (filters.employeeNumber) params.employeeNumber = filters.employeeNumber;
            if (filters.departmentId) params.departmentId = filters.departmentId;
            if (filters.team) params.team = filters.team;
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;
            if (filters.search) params.search = filters.search;
        }
        const res = await api.get<LatestBiomarkerResponse>('/api/analytics/biomarker/latest', params);
        return res.data;
    } catch (err) {
        console.warn('[AnalyticsService] fetchLatestAlertsPaged failed:', err);
        return null;
    }
}

export const analyticsService = {
    /** Check if the Analytics backend module is reachable */
    checkHealth: healthCheckInternal,

    /** Fetch the latest biomarker alerts with pagination and optional type filter */
    fetchLatestAlertsPaged: fetchLatestAlertsPagedInternal,

    /** Trigger a manual biomarker scan */
    triggerScan: async (): Promise<boolean> => {
        try {
            await api.post('/api/analytics/biomarker/trigger-scan');
            return true;
        } catch (err) {
            console.warn('[AnalyticsService] triggerScan failed:', err);
            return false;
        }
    },

    /** Max alerts fetched for client-side chart aggregations */
    CHART_FETCH_LIMIT,
};
