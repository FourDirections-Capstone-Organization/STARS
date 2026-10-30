import api from '../api';
import {
    EmployeeKpiEvaluationResultDTO,
    KpiMetricValueDTO,
    TrafficLightRating,
    KpiHierarchyScopeResultDTO
} from '../Pages/OpAdmin_Dashboard/KpiDrillDown/types';

export type {
    EmployeeKpiEvaluationResultDTO,
    KpiMetricValueDTO,
    TrafficLightRating,
    KpiHierarchyScopeResultDTO
};

/**
 * Triggers a browser file download from raw blob data.
 */
export const triggerFileDownload = (
    blobData: BlobPart,
    defaultFilename: string,
    mimeType?: string
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

/**
 * Fetches the authenticated employee's personal KPI scorecard.
 */
export const fetchMyScorecard = async (
    startDate?: string,
    endDate?: string
): Promise<EmployeeKpiEvaluationResultDTO> => {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const res = await api.get('/api/kpi/my-scorecard', params);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Fetches a specific employee's KPI scorecard (Manager or self-access).
 */
export const fetchEmployeeScorecard = async (
    employeeId: string,
    startDate?: string,
    endDate?: string
): Promise<EmployeeKpiEvaluationResultDTO> => {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const res = await api.get(`/api/kpi/scorecard/${employeeId}`, params);
    if (res.data?.data) {
        return res.data.data;
    }
    return res.data;
};

/**
 * Exports an employee's scorecard to PDF or Excel and triggers automatic file download.
 */
export const exportScorecard = async (
    employeeId?: string,
    format: 'pdf' | 'excel' = 'pdf',
    startDate?: string,
    endDate?: string
): Promise<void> => {
    const params: Record<string, string> = { format };
    if (employeeId) params.employeeId = employeeId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const res = await api.get('/api/kpi/export/scorecard', params, {
        responseType: 'blob'
    });

    const ext = format === 'excel' ? 'xlsx' : 'pdf';
    const mime = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Scorecard_${dateStr}.${ext}`;

    triggerFileDownload(res.data, filename, mime);
};

/**
 * Exports hierarchical scope KPI results (Company, Department, Team) to PDF or Excel and downloads.
 */
export const exportHierarchyScope = async (
    level: string,
    scopeId?: string,
    format: 'pdf' | 'excel' = 'pdf',
    startDate?: string,
    endDate?: string,
    role?: string
): Promise<void> => {
    const params: Record<string, string> = { level, format };
    if (scopeId) params.scopeId = scopeId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (role) params.role = role;

    const res = await api.get('/api/kpi/export/scope', params, {
        responseType: 'blob'
    });

    const ext = format === 'excel' ? 'xlsx' : 'pdf';
    const mime = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `KPI_${level}_Export_${dateStr}.${ext}`;

    triggerFileDownload(res.data, filename, mime);
};

