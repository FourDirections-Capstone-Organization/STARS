export interface FomsClientFinancialSummaryItem {
    clientAccountId: string;
    clientName: string;
    outstandingBalance: number;
    overdueInvoicesCount: number;
    latestStatus: string;
    nextDueDate: string | null;
}

export interface FomsDashboardFinancialSummary {
    totalOutstandingBalance: number;
    totalOverdueBalance: number;
    totalInvoicesTracked: number;
    overdueInvoicesCount: number;
    paidInvoicesCount: number;
    pendingInvoicesCount: number;
    topOutstandingClients: FomsClientFinancialSummaryItem[];
    lastUpdatedAt: string;
}

export interface FomsOverdueAlertItem {
    id: string;
    invoiceNumber: string;
    clientAccountId: string;
    clientName: string;
    clientContactPerson?: string;
    clientContactNumber?: string;
    clientEmail?: string;
    clientAddress?: string;
    amountDue: number;
    dueDate: string | null;
    daysOverdue: number;
    agingStatus: 'Due Soon' | '1-30' | '31-60' | '61-90' | '90+' | string;
    alertTimestamp: string;
    remarks?: string;
    starsTaskId?: string;
    starsTaskNumber?: string;
    assignedCoordinatorName?: string;
    assignedCoordinatorId?: string;
    taskStatus?: 'Not Started' | 'In Progress' | 'Completed' | string;
    priorityLevel?: 'Urgent' | 'High' | 'Medium' | string;
    workloadAtRouting?: number;
    routingStatus?: 'Routed & Assigned' | 'Pending Coordinator' | 'Follow-up Active';
}

export interface CoordinatorWorkloadItem {
    userId: string;
    fullName: string;
    employeeNumber: string;
    role: string;
    department?: string;
    workload: number;
    isAvailable: boolean;
    availabilityStatus: string;
    isOptimalCandidate?: boolean;
    capacityPercentage?: number;
}

export interface FomsFinancialMetricsViewProps {
    embedded?: boolean;
    showHeader?: boolean;
    pollingInterval?: number;
    initialTab?: 'balances' | 'routing';
    onViewClientTasks?: (clientName: string, accountId: string) => void;
    onOpenTask?: (taskId: string) => void;
}
