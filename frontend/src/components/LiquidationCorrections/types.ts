export type LiquidationStatus = 'For Correction' | 'Rejected';
export type FomsSyncStatus = 'Pending' | 'CallbackSuccess' | 'Failed';
export type CorrectionProgressStatus = 'PendingCorrection' | 'InProgress' | 'Corrected' | 'Completed';

export interface LiquidationTaskItem {
    id: string;
    taskId: string;
    taskNumber: string;
    requestId: string;
    liquidationId?: number | null;
    requester: string;
    requesterEmployeeId?: string | null;
    deliveryReference?: string | null;
    liquidationStatus: LiquidationStatus | string;
    correctionReason: string;
    dueDate?: string | null;
    amount?: number | null;
    correctionStatus?: CorrectionProgressStatus | string;
    correctedReceiptsUrl?: string | null;
    resolutionRemarks?: string | null;
    fomsSyncStatus: FomsSyncStatus | string;
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
    createdAt?: string;
    updatedAt?: string;
    assignedCoordinatorName?: string | null;
    taskStatus?: string;
    priorityLevel?: string;
}

export interface SubmitLiquidationCorrectionPayload {
    correctedReceiptsUrl: string;
    resolutionRemarks?: string;
    remarks?: string;
}

export interface LiquidationCorrectionsViewProps {
    showHeader?: boolean;
    initialRequestId?: string;
    userRole?: 'Manager' | 'Coordinator' | 'Operations' | 'Admin' | string;
    currentUserId?: string;
    onOpenTask?: (taskId: string) => void;
}

export interface LiquidationTasksListProps {
    tasks?: LiquidationTaskItem[];
    loading?: boolean;
    onRefresh?: () => void;
    onOpenTask?: (taskId: string) => void;
    userRole?: string;
    currentUserId?: string;
    onAttachReceipts?: (task: LiquidationTaskItem) => void;
    onAuthorizeCompletion?: (task: LiquidationTaskItem) => void;
    onRetrySync?: (task: LiquidationTaskItem) => void;
}

export interface SubmitCorrectionModalProps {
    isOpen: boolean;
    task: LiquidationTaskItem | null;
    onClose: () => void;
    onSubmitSuccess?: (updatedTask?: LiquidationTaskItem) => void;
}

export interface ParsedFomsLiquidationInfo {
    isLiquidationTask: boolean;
    requestId: string;
    liquidationId?: number | null;
    requester: string;
    requesterEmployeeId?: string | null;
    deliveryReference?: string | null;
    liquidationStatus: 'For Correction' | 'Rejected' | string;
    correctionReason: string;
    dueDate?: string | null;
    amount?: number | null;
    amountFormatted?: string;
    remarks?: string | null;
}
