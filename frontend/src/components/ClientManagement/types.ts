/**
 * Types and interfaces for Integration 4: FOMS Client Account Sync → STARS Reference Data
 */

export interface FomsClientAccount {
    id: string;
    clientAccountId: string;
    clientName: string;
    contactPerson?: string | null;
    contactNumber?: string | null;
    email?: string | null;
    address?: string | null;
    accountHandlerEmployeeNumber?: string | null;
    accountHandlerUserId?: string | null;
    accountHandlerName?: string | null;
    status: 'Active' | 'Inactive' | string;
    assignedCoordinatorId?: string | null;
    assignedCoordinatorName?: string | null;
    lastSyncedAt: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface AssignCoordinatorPayload {
    coordinatorId: string;
    managerUserId?: string;
}

export interface CoordinatorOption {
    id: string;
    fullName: string;
    employeeNumber?: string;
    workload?: number;
    email?: string;
    departmentName?: string;
    isAvailable?: boolean;
}

export interface ClientAccountsListProps {
    clients?: FomsClientAccount[];
    loading?: boolean;
    userRole?: string;
    currentUserId?: string;
    onRefresh?: () => void;
    onViewClientDetails?: (client: FomsClientAccount) => void;
    onAssignCoordinator?: (client: FomsClientAccount) => void;
    onCreateTask?: (client: FomsClientAccount) => void;
    showFilters?: boolean;
}

export interface ClientDetailModalProps {
    isOpen: boolean;
    client: FomsClientAccount | null;
    userRole?: string;
    onClose: () => void;
    onAssignCoordinator?: (client: FomsClientAccount) => void;
    onCreateTask?: (client: FomsClientAccount) => void;
}

export interface ManagerCoordinatorAssignmentDrawerProps {
    isOpen: boolean;
    client: FomsClientAccount | null;
    coordinators?: CoordinatorOption[];
    onClose: () => void;
    onSuccess?: (updatedClient: FomsClientAccount) => void;
}

export interface TaskFormProps {
    initialClient?: FomsClientAccount | null;
    availableClients?: FomsClientAccount[];
    onCancel?: () => void;
    onSubmit?: (taskData: any) => Promise<any> | void;
    isSubmitting?: boolean;
}

export interface TaskCreateModalProps {
    isOpen: boolean;
    initialClient?: FomsClientAccount | null;
    availableClients?: FomsClientAccount[];
    onClose: () => void;
    onSubmit?: (taskData: any) => Promise<any> | void;
}

export interface ClientManagementViewProps {
    initialClientAccountId?: string | null;
    userRole?: string;
    currentUserId?: string;
    onOpenTask?: (taskId: string) => void;
    showHeader?: boolean;
}
