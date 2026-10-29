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
