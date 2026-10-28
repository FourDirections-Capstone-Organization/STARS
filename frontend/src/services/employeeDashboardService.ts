import api from '../api';

// ─── TypeScript Interfaces & Types ──────────────────────────────────────────

export interface EmployeeReportsTo {
    supervisorId?: string | null;
    supervisorName: string;
    supervisorRole: string;
    supervisorEmployeeNumber?: string | null;
    reportingRelation: string;
}

export interface TaskStatusBreakdownItem {
    status: string;
    count: number;
    percentage: number;
}

export interface TaskPriorityDistributionItem {
    priority: string;
    count: number;
}

export interface TaskCompletionTrendItem {
    period: string;
    completedCount: number;
}

export interface EmployeeDashboardData {
    // Profile Header
    employeeId: string;
    employeeNumber: string;
    fullName: string;
    email: string;
    role: string;
    departmentName?: string | null;
    jobPositionName?: string | null;
    availabilityStatus: string;
    presenceStatus: string;
    isActive: boolean;

    // Supervisor Info
    reportsTo: EmployeeReportsTo;
    supervisorName: string;
    supervisorRole: string;
    supervisorEmployeeNumber?: string | null;
    reportingRelation: string;

    // KPI Totals
    totalAssignedTasks: number;
    totalCreatedTasks: number;
    completedCount: number;
    inProgressCount: number;
    pendingCount: number;
    overdueCount: number;

    // Aggregated Breakdown Lists
    statusBreakdown: TaskStatusBreakdownItem[];
    priorityDistribution: TaskPriorityDistributionItem[];
    completionTrend: TaskCompletionTrendItem[];
}

export interface TaskAssigneeInfo {
    userId: string;
    fullName: string;
    employeeNumber: string;
    role?: string;
    availabilityStatus?: string;
    isAvailable?: boolean;
    department?: string;
    workload?: number;
    completionPercentage?: number;
}

export interface EmployeeTaskItem {
    id: string;
    taskNumber?: string | null;
    taskReferenceNumber?: string | null;
    title: string;
    description?: string;
    priorityLevel: string | number;
    classification?: string | number;
    status: string | number;
    assignmentScope?: string | number;
    deadline?: string;
    isSLALocked?: boolean;
    createdById?: string;
    createdByName?: string | null;
    assignedDepartmentId?: string | null;
    assignedDepartmentName?: string | null;
    teamId?: string | null;
    teamName?: string | null;
    assignees?: TaskAssigneeInfo[];
    myCompletionPercentage?: number | null;
    attachmentCount?: number;
    createdAt?: string;
    updatedAt?: string | null;
}

export interface PaginatedTasksResponse {
    items: EmployeeTaskItem[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
    activeCount?: number;
    inProgressCount?: number;
    completedCount?: number;
    overdueCount?: number;
    cancelledCount?: number;
    onHoldCount?: number;
}

export interface ApiResponse<T> {
    isSuccess: boolean;
    message: string;
    data: T;
}

// ─── Query String Builder Helper ─────────────────────────────────────────────

export function buildTaskQueryString(
    userFilter: { assignedToUserId?: string; createdByUserId?: string },
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    status?: string
): string {
    const params = new URLSearchParams();

    if (userFilter.assignedToUserId) {
        params.set('assignedToUserId', userFilter.assignedToUserId);
    }
    if (userFilter.createdByUserId) {
        params.set('createdByUserId', userFilter.createdByUserId);
    }

    params.set('pageNumber', String(page));
    params.set('pageSize', String(pageSize));

    if (search && search.trim()) {
        params.set('search', search.trim());
    }

    if (status && status.trim() && status.toLowerCase() !== 'all') {
        params.set('status', status.trim());
    }

    return params.toString();
}

// ─── Response Normalization Helpers ──────────────────────────────────────────

export function mapPaginatedTasksResponse(
    raw: any,
    page: number = 1,
    pageSize: number = 10
): PaginatedTasksResponse {
    if (!raw) {
        return {
            items: [],
            totalCount: 0,
            pageNumber: page,
            pageSize,
            totalPages: 0,
            hasPreviousPage: false,
            hasNextPage: false,
        };
    }

    // Check if wrapped in ApiResponseDTO<T>
    if (typeof raw === 'object' && 'isSuccess' in raw) {
        if (!raw.isSuccess) {
            throw new Error(raw.message || 'Failed to fetch tasks');
        }
        raw = raw.data;
    }

    const items: EmployeeTaskItem[] = Array.isArray(raw)
        ? raw
        : (Array.isArray(raw?.items) ? raw.items : []);

    const totalCount: number = typeof raw?.totalCount === 'number'
        ? raw.totalCount
        : items.length;

    const calcPageSize = typeof raw?.pageSize === 'number' ? raw.pageSize : pageSize;
    const calcPageNumber = typeof raw?.pageNumber === 'number' ? raw.pageNumber : page;
    const calcTotalPages = typeof raw?.totalPages === 'number'
        ? raw.totalPages
        : (calcPageSize > 0 ? Math.ceil(totalCount / calcPageSize) : 0);

    return {
        items,
        totalCount,
        pageNumber: calcPageNumber,
        pageSize: calcPageSize,
        totalPages: calcTotalPages,
        hasPreviousPage: typeof raw?.hasPreviousPage === 'boolean'
            ? raw.hasPreviousPage
            : calcPageNumber > 1,
        hasNextPage: typeof raw?.hasNextPage === 'boolean'
            ? raw.hasNextPage
            : calcPageNumber < calcTotalPages,
        activeCount: raw?.activeCount,
        inProgressCount: raw?.inProgressCount,
        completedCount: raw?.completedCount,
        overdueCount: raw?.overdueCount,
        cancelledCount: raw?.cancelledCount,
        onHoldCount: raw?.onHoldCount,
    };
}

// ─── API Methods ─────────────────────────────────────────────────────────────

/**
 * Fetch aggregated employee dashboard data (profile, supervisor, KPI totals, status breakdown,
 * priority distribution, and completion trends).
 * Calls GET /api/Hierarchy/employee/{id}/dashboard
 */
export async function getEmployeeDashboard(employeeId: string): Promise<EmployeeDashboardData> {
    if (!employeeId || !employeeId.trim()) {
        throw new Error('Employee ID is required');
    }

    const trimmedId = employeeId.trim();
    const response = await api.get<ApiResponse<EmployeeDashboardData> | EmployeeDashboardData>(
        `/api/Hierarchy/employee/${encodeURIComponent(trimmedId)}/dashboard`
    );

    const raw = response.data;
    if (raw && typeof raw === 'object' && 'isSuccess' in raw) {
        const apiResp = raw as ApiResponse<EmployeeDashboardData>;
        if (!apiResp.isSuccess) {
            throw new Error(apiResp.message || 'Failed to fetch employee dashboard');
        }
        return apiResp.data;
    }

    return raw as EmployeeDashboardData;
}

/**
 * Fetch paginated tasks assigned to an employee with optional search and status filters.
 * Calls GET /api/Task?assignedToUserId={id}&pageNumber={page}&pageSize={pageSize}
 */
export async function getEmployeeAssignedTasks(
    employeeId: string,
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    status?: string
): Promise<PaginatedTasksResponse> {
    if (!employeeId || !employeeId.trim()) {
        throw new Error('Employee ID is required');
    }

    const query = buildTaskQueryString(
        { assignedToUserId: employeeId.trim() },
        page,
        pageSize,
        search,
        status
    );

    const response = await api.get<ApiResponse<PaginatedTasksResponse> | PaginatedTasksResponse>(
        `/api/Task?${query}`
    );

    return mapPaginatedTasksResponse(response.data, page, pageSize);
}

/**
 * Fetch paginated tasks created by an employee with optional search and status filters.
 * Calls GET /api/Task?createdByUserId={id}&pageNumber={page}&pageSize={pageSize}
 */
export async function getEmployeeCreatedTasks(
    employeeId: string,
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    status?: string
): Promise<PaginatedTasksResponse> {
    if (!employeeId || !employeeId.trim()) {
        throw new Error('Employee ID is required');
    }

    const query = buildTaskQueryString(
        { createdByUserId: employeeId.trim() },
        page,
        pageSize,
        search,
        status
    );

    const response = await api.get<ApiResponse<PaginatedTasksResponse> | PaginatedTasksResponse>(
        `/api/Task?${query}`
    );

    return mapPaginatedTasksResponse(response.data, page, pageSize);
}

export const employeeDashboardService = {
    getEmployeeDashboard,
    getEmployeeAssignedTasks,
    getEmployeeCreatedTasks,
    buildTaskQueryString,
    mapPaginatedTasksResponse,
};

export default employeeDashboardService;
