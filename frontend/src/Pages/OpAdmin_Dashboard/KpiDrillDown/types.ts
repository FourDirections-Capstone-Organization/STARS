export type ScopeLevel = 'Company' | 'Department' | 'Team' | 'Employee';

export type TrafficLightRating = 'Green' | 'Amber' | 'Red';

export type TimeframePreset = '7d' | '30d' | 'month' | 'quarter' | 'custom';

export interface KpiMetricValueDTO {
    metricCode: string;
    name: string;
    actualValue: number;
    unit: string;
    targetValue: number;
    weight: number;
    greenThreshold: number;
    amberThreshold: number;
    redThreshold: number;
    isLowerBetter: boolean;
    isCustomFormula?: boolean;
    customFormula?: string;
    rating: TrafficLightRating;
    weightedScore: number;
}

export interface EmployeeKpiEvaluationResultDTO {
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    departmentId?: string;
    departmentName?: string;
    jobPositionTitle?: string;
    role?: string;
    periodStart: string;
    periodEnd: string;
    configurationId?: string;
    configurationTitle?: string;
    totalAssignedTasks: number;
    completedTasksCount: number;
    onTimeTasksCount: number;
    inFullTasksCount: number;
    otifTasksCount: number;
    reworkTasksCount: number;
    accurateTasksCount: number;
    totalHandlingHours: number;
    overallScore: number;
    overallRating: TrafficLightRating;
    metrics: KpiMetricValueDTO[];
}

export interface TeamKpiSummaryDTO {
    teamId: string;
    teamName: string;
    departmentId?: string;
    departmentName?: string;
    teamLeaderId?: string;
    teamLeaderName?: string;
    memberCount: number;
    totalAssignedTasks: number;
    completedTasksCount: number;
    overallScore: number;
    overallRating: TrafficLightRating;
}

export interface DepartmentKpiSummaryDTO {
    departmentId: string;
    departmentName: string;
    totalEmployees: number;
    totalTeams: number;
    totalAssignedTasks: number;
    completedTasksCount: number;
    overallScore: number;
    overallRating: TrafficLightRating;
}

export interface KpiHierarchyScopeResultDTO {
    scopeLevel: ScopeLevel;
    scopeId?: string;
    scopeName: string;
    parentScopeId?: string;
    parentScopeName?: string;
    periodStart: string;
    periodEnd: string;
    roleFilter?: string;
    configurationId?: string;
    configurationTitle?: string;
    totalDepartments: number;
    totalTeams: number;
    totalEmployees: number;
    totalAssignedTasks: number;
    completedTasksCount: number;
    onTimeTasksCount: number;
    inFullTasksCount: number;
    otifTasksCount: number;
    reworkTasksCount: number;
    accurateTasksCount: number;
    totalHandlingHours: number;
    overallScore: number;
    averageEmployeeScore: number;
    overallRating: TrafficLightRating;
    metrics: KpiMetricValueDTO[];
    departments: DepartmentKpiSummaryDTO[];
    teams: TeamKpiSummaryDTO[];
    employees: EmployeeKpiEvaluationResultDTO[];
}

export interface BreadcrumbItem {
    level: ScopeLevel;
    id?: string;
    name: string;
}

export interface ScopeFilterState {
    timeframe: TimeframePreset;
    startDate: string;
    endDate: string;
    role: string;
    departmentId?: string;
    teamId?: string;
    employeeId?: string;
}

export interface DepartmentOption {
    id: string;
    name: string;
}

export interface TeamOption {
    id: string;
    name: string;
    departmentId?: string;
}
