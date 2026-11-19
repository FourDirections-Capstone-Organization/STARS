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
    disputedInvoicesCount?: number;
    dueSoonInvoicesCount?: number;
    topOutstandingClients: FomsClientFinancialSummaryItem[];
    recentInvoices?: FomsRecentInvoiceItem[];
    lastUpdatedAt: string;
}

export interface FomsRecentInvoiceItem {
    invoiceNumber: string;
    clientAccountId?: string;
    clientName: string;
    invoiceStatus?: string;
    paymentStatus?: 'Unpaid' | 'Paid' | string;
    dueStatus?: 'Normal' | 'Due Soon' | 'Overdue' | string;
    agingBucket?: string;
    outstandingBalance: number;
    totalAmount?: number;
    dueDate?: string | null;
    timestamp?: string;
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
    lastSyncError?: string | null;
    calculatedPaymentDueDate?: string | null;
    assignedCoordinatorName?: string;
    taskStatus?: string;
}

export interface SubmitSignedEndorsementPayload {
    actualReceivedDate: string;
    signedCopyUrl?: string;
    deliveryRemarks?: string;
}

export interface SubmitCollectionOutcomePayload {
    outcome: 'Promised to Pay' | 'Disputed' | 'Unreachable' | string;
    promisedPaymentDate?: string | null;
    actionTaken: string;
    notes?: string | null;
}

export interface CollectionFollowUpListProps {
    alerts?: FomsOverdueAlertItem[];
    loading?: boolean;
    onRefresh?: () => void;
    onOpenTask?: (taskId: string) => void;
    onOutcomeSubmitted?: (taskId: string, payload: SubmitCollectionOutcomePayload) => void;
    showFilters?: boolean;
}

export interface CollectionAlertsViewProps {
    onOpenTask?: (taskId: string) => void;
    onViewClientTasks?: (clientName: string, accountId: string) => void;
}

export interface FomsEndorsementPanelProps {
    onOpenTask?: (taskId: string) => void;
    onViewClientTasks?: (clientName: string, accountId: string) => void;
    onCreateTaskForEndorsement?: (item: FomsEndorsementItem) => void;
    initialSubTab?: 'pending' | 'active' | 'all';
}

export interface FomsFinancialMetricsViewProps {
    embedded?: boolean;
    showHeader?: boolean;
    pollingInterval?: number;
    initialTab?: 'balances' | 'routing' | 'endorsement';
    onViewClientTasks?: (clientName: string, accountId: string) => void;
    onOpenTask?: (taskId: string) => void;
    onCreateTaskForEndorsement?: (item: FomsEndorsementItem) => void;
}
