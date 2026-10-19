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

export interface FomsFinancialMetricsViewProps {
    embedded?: boolean;
    showHeader?: boolean;
    pollingInterval?: number;
    onViewClientTasks?: (clientName: string, accountId: string) => void;
}
