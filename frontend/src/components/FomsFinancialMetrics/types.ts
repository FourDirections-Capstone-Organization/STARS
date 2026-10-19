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

export interface FomsEndorsementItem {
    id: string;
    taskId: string;
    taskNumber: string;
    invoiceNumber: string;
    clientName: string;
    clientAddress?: string;
    clientContactPerson?: string;
    clientContactNumber?: string;
    clientEmail?: string;
    invoiceAmount: number;
    billingDate?: string | null;
    dueDate?: string | null;
    invoiceDocumentUrl?: string;
    signedReceivingCopyUrl?: string | null;
    actualReceivedDate?: string | null;
    deliveryRemarks?: string | null;
    endorsementStatus: 'PendingEndorsement' | 'Delivered' | 'Endorsed' | 'Completed' | string;
    fomsSyncStatus: 'Pending' | 'Synced' | 'Failed' | string;
    fomsSyncAttempts?: number;
    lastSyncedAt?: string | null;
    calculatedPaymentDueDate?: string | null;
    assignedCoordinatorName?: string;
    taskStatus?: string;
}

export interface SubmitSignedEndorsementPayload {
    actualReceivedDate: string;
    signedCopyUrl?: string;
    deliveryRemarks?: string;
}

export interface FomsFinancialMetricsViewProps {
    embedded?: boolean;
    showHeader?: boolean;
    pollingInterval?: number;
    initialTab?: 'balances' | 'routing' | 'endorsement';
    onViewClientTasks?: (clientName: string, accountId: string) => void;
    onOpenTask?: (taskId: string) => void;
}
