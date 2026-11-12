export interface KpiItem {
    id?: string;
    kpiConfigurationId?: string;
    name: string;
    metricCode: string;
    description?: string;
    weight: number;
    unit: string;
    targetValue: number;
    greenThreshold: number;
    amberThreshold: number;
    redThreshold: number;
    isLowerBetter: boolean;
    isCustomFormula?: boolean;
    customFormula?: string;
    order: number;
}

export interface KpiConfiguration {
    id: string;
    title: string;
    description?: string;
    targetRole?: string;
    departmentId?: string;
    departmentName?: string;
    effectiveStartDate: string;
    effectiveEndDate?: string;
    isActive: boolean;
    overallGreenThreshold: number;
    overallAmberThreshold: number;
    overallRedThreshold: number;
    createdById?: string;
    createdByName?: string;
    createdAt: string;
    updatedAt: string;
    items: KpiItem[];
}

export interface KpiConfigurationFormData {
    id?: string;
    title: string;
    description: string;
    targetRole: string;
    departmentId: string;
    effectiveStartDate: string;
    effectiveEndDate: string;
    isActive: boolean;
    overallGreenThreshold: number;
    overallAmberThreshold: number;
    overallRedThreshold: number;
    items: KpiItem[];
}

export interface DepartmentOption {
    id: string;
    name: string;
}

export interface DepartmentRosterOption {
    departmentId: string;
    departmentName: string;
    members: Array<{
        role?: string;
        jobPositionName?: string;
    }>;
}

export interface JobPositionOption {
    id: string;
    name: string;
    departmentId: string;
}

export const ALL_OPERATIONAL_ROLES = [
    'Courier',
    'Encoder',
    'Dispatcher',
    'Coordinator',
    'Manager',
    'Accountant'
] as const;

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
    Courier: 'Courier / Driver',
    Dispatcher: 'Dispatcher',
    Encoder: 'Encoder',
    Coordinator: 'Coordinator',
    Manager: 'Manager',
    Accountant: 'Accountant'
};

export const getRoleDisplayLabel = (role: string): string => {
    return ROLE_DISPLAY_LABELS[role] || role;
};

export const normalizeRoleName = (role?: string): string => {
    if (!role) return '';
    const trimmed = role.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'courier/driver' || lower === 'courier / driver' || lower === 'driver') {
        return 'Courier';
    }
    const matched = ALL_OPERATIONAL_ROLES.find(r => r.toLowerCase() === lower);
    return matched || trimmed;
};

const getRolesFromPositionName = (positionName?: string): string[] => {
    if (!positionName || !positionName.trim()) return [];
    const pos = positionName.toLowerCase().trim();
    const roles: string[] = [];

    if (pos.includes('courier') || pos.includes('driver') || pos.includes('rider')) {
        roles.push('Courier');
    }
    if (pos.includes('encoder') || pos.includes('clerk')) {
        roles.push('Encoder');
    }
    if (pos.includes('dispatcher')) {
        roles.push('Dispatcher');
    }
    if (pos.includes('coordinator') || pos.includes('customer service')) {
        roles.push('Coordinator');
    }
    if (pos.includes('manager')) {
        roles.push('Manager');
    }
    if (pos.includes('account') || pos.includes('finance') || pos.includes('billing')) {
        roles.push('Accountant');
    }

    return roles;
};

const getRolesFromDepartmentName = (departmentName?: string): string[] => {
    if (!departmentName || !departmentName.trim()) return [];
    const name = departmentName.toLowerCase().trim();

    if (name.includes('dispatch')) {
        return ['Dispatcher', 'Coordinator'];
    }
    if (name.includes('forwarding')) {
        return ['Courier', 'Encoder'];
    }
    if (name.includes('delivery') || name.includes('logistics') || name.includes('fleet') || name.includes('transport')) {
        return ['Courier', 'Dispatcher', 'Encoder'];
    }
    if (name.includes('sorting') || name.includes('hub') || name.includes('warehouse')) {
        return ['Encoder', 'Dispatcher', 'Courier'];
    }
    if (name.includes('coordinator') || name.includes('customer service') || name.includes('support')) {
        return ['Coordinator', 'Manager'];
    }
    if (name.includes('finance') || name.includes('accounting') || name.includes('billing')) {
        return ['Accountant', 'Manager'];
    }
    if (name.includes('management') || name.includes('executive') || name.includes('admin')) {
        return ['Manager', 'Coordinator'];
    }

    return [];
};

export const getRolesForDepartment = (
    departmentId?: string,
    departmentName?: string,
    rosters: DepartmentRosterOption[] = [],
    jobPositions: JobPositionOption[] = []
): string[] => {
    if (!departmentId) return [];

    const normDeptId = departmentId.toLowerCase();
    const matchedRoster = rosters.find(r => r.departmentId?.toLowerCase() === normDeptId);

    const memberRoles = (matchedRoster?.members || [])
        .map(m => normalizeRoleName(m.role))
        .filter(Boolean);

    const positionRoles = jobPositions
        .filter(p => p.departmentId?.toLowerCase() === normDeptId)
        .flatMap(p => getRolesFromPositionName(p.name));

    const deptNameRoles = getRolesFromDepartmentName(departmentName || matchedRoster?.departmentName);

    const combined = Array.from(new Set([...deptNameRoles, ...positionRoles, ...memberRoles]));
    if (combined.length > 0) {
        return combined;
    }

    return ['Coordinator', 'Dispatcher', 'Encoder', 'Courier'];
};

export const normalizeStandardMetricCode = (metricCode?: string): string => {
    if (!metricCode) return '';
    const upper = metricCode.trim().toUpperCase();
    if (upper === 'COMPLETION_RATE') return 'TASK_COMPLETION_RATE';
    if (upper === 'AHT') return 'AVERAGE_HANDLING_TIME';
    return upper;
};

export interface KpiVariableDefinition {
    name: string;
    displayName: string;
    description?: string;
    category?: string;
    unit?: string;
    defaultSampleValue?: number;
    defaultValue?: number;
}

export interface FormulaTestRequest {
    formula: string;
    sampleValues?: Record<string, number>;
}

export interface FormulaTestResponse {
    isValid: boolean;
    errorMessage?: string;
    result?: number;
    variablesUsed?: string[];
    resolvedVariables?: Record<string, number>;
}

export const DEFAULT_KPI_VARIABLES: KpiVariableDefinition[] = [
    {
        name: 'total_assigned_tasks',
        displayName: 'Total Assigned Tasks',
        description: 'Total number of tasks assigned to the employee within the evaluation period.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 50.0
    },
    {
        name: 'completed_tasks',
        displayName: 'Completed Tasks',
        description: 'Number of tasks completed by the employee within the evaluation period.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 45.0
    },
    {
        name: 'on_time_tasks',
        displayName: 'On-Time Tasks',
        description: 'Number of tasks completed on or before their SLA deadline.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 40.0
    },
    {
        name: 'in_full_tasks',
        displayName: 'In-Full Tasks',
        description: 'Number of tasks completed with required attachments and documentation.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 42.0
    },
    {
        name: 'otif_tasks',
        displayName: 'OTIF Tasks',
        description: 'Number of tasks completed both on-time and in-full.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 38.0
    },
    {
        name: 'rework_tasks',
        displayName: 'Rework Tasks',
        description: 'Number of completed tasks that underwent pushback or rework transitions.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 3.0
    },
    {
        name: 'accurate_tasks',
        displayName: 'Accurate Tasks',
        description: 'Number of completed tasks executed accurately without rework transitions.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 42.0
    },
    {
        name: 'late_tasks',
        displayName: 'Late Tasks',
        description: 'Number of completed tasks completed after their revised SLA deadline.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 5.0
    },
    {
        name: 'total_handling_hours',
        displayName: 'Total Handling Hours',
        description: 'Total cycle hours spent across all completed tasks.',
        category: 'Duration',
        unit: 'hours',
        defaultSampleValue: 120.0
    },
    {
        name: 'completion_rate',
        displayName: 'Completion Rate',
        description: 'Percentage of assigned tasks completed (completed / total * 100).',
        category: 'Rates',
        unit: '%',
        defaultSampleValue: 90.0
    },
    {
        name: 'otif_rate',
        displayName: 'OTIF Rate',
        description: 'Percentage of completed tasks that were both on-time and in-full.',
        category: 'Rates',
        unit: '%',
        defaultSampleValue: 84.44
    },
    {
        name: 'accuracy_rate',
        displayName: 'Accuracy Rate',
        description: 'Percentage of completed tasks executed without rework.',
        category: 'Rates',
        unit: '%',
        defaultSampleValue: 93.33
    },
    {
        name: 'rework_rate',
        displayName: 'Rework Rate',
        description: 'Percentage of completed tasks that required rework.',
        category: 'Rates',
        unit: '%',
        defaultSampleValue: 6.67
    },
    {
        name: 'aht_hours',
        displayName: 'Average Handling Time',
        description: 'Average hours required to complete a task (total hours / completed).',
        category: 'Duration',
        unit: 'hours',
        defaultSampleValue: 2.67
    }
];

export const STANDARD_METRIC_TEMPLATES: Array<Omit<KpiItem, 'id' | 'kpiConfigurationId'>> = [
    {
        name: 'On-Time In-Full (OTIF)',
        metricCode: 'OTIF',
        description: 'Delivered strictly before revised deadline with verified attachments.',
        weight: 35,
        unit: '%',
        targetValue: 100,
        greenThreshold: 90,
        amberThreshold: 75,
        redThreshold: 60,
        isLowerBetter: false,
        order: 1
    },
    {
        name: 'Order Accuracy Rate',
        metricCode: 'ORDER_ACCURACY',
        description: 'Tasks completed without supervisor rework or pushback transitions.',
        weight: 25,
        unit: '%',
        targetValue: 100,
        greenThreshold: 90,
        amberThreshold: 80,
        redThreshold: 70,
        isLowerBetter: false,
        order: 2
    },
    {
        name: 'Task Completion Rate',
        metricCode: 'TASK_COMPLETION_RATE',
        description: 'Ratio of completed tasks against total assigned tasks.',
        weight: 20,
        unit: '%',
        targetValue: 100,
        greenThreshold: 85,
        amberThreshold: 70,
        redThreshold: 55,
        isLowerBetter: false,
        order: 3
    },
    {
        name: 'Average Handling Time (AHT)',
        metricCode: 'AVERAGE_HANDLING_TIME',
        description: 'Average task execution cycle duration from creation to completion.',
        weight: 20,
        unit: 'hrs',
        targetValue: 4.0,
        greenThreshold: 4.0,
        amberThreshold: 8.0,
        redThreshold: 12.0,
        isLowerBetter: true,
        order: 4
    }
];
