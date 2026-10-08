export type AssignmentMode = 'round-robin' | 'fixed' | 'manual';
export type FilterChip = 'All' | 'Round-robin' | 'Manual' | 'Fixed';
export type ViewMode = 'grid' | 'list';

export interface ChecklistItem {
    id: string;
    text: string;
    required: boolean;
}

export interface TaskTemplateItem {
    id: string;
    templateName: string;
    defaultTitle: string;
    defaultDescription: string;
    cleanDescription: string;
    priorityLevel: 'Low' | 'Medium' | 'High' | 'Urgent';
    recurrenceRule: 'Daily' | 'Weekly' | 'Monthly';
    recurrenceStartDate: string;
    assignmentMode: AssignmentMode;
    defaultAssigneeId: string | null;
    defaultAssigneeName: string | null;
    defaultDepartmentId: string | null;
    defaultDepartmentName: string | null;
    dueAfterDays: number;
    checklist: ChecklistItem[];
    skipOffline: boolean;
    alertCoordinator: boolean;
    timesUsed: number;
    isActive: boolean;
    nextGenerationDate: string | null;
    lastGeneratedDate: string | null;
    createdAt: string;
    createdByName?: string | null;
}

export interface QueueEmployee {
    userId: string;
    fullName: string;
    employeeNumber: string;
    role: string;
    department: string;
    departmentId?: string | null;
    openTasks: number;
    lastAssignedAt: string | null;
    lastAssignedText: string;
    availabilityStatus: 'Active' | 'Offline' | 'OnLeave' | string;
    isAvailable: boolean;
}

export interface DepartmentItem {
    id: string;
    name: string;
    description?: string;
    isActive?: boolean;
}

export interface DeployResult {
    success: boolean;
    assignedUserId?: string | null;
    assignedUserName?: string | null;
    taskId?: string;
    taskTitle?: string;
    reason: string;
    unassigned: boolean;
}
