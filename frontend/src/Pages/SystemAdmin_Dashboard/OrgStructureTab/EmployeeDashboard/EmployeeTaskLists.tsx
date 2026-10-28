import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ClipboardList,
    UserCheck,
    Search,
    Filter,
    Calendar,
    Clock,
    User,
    Users,
    Building2,
    RotateCcw,
    RefreshCw,
    AlertCircle,
    Inbox,
    CheckCircle2
} from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../components/ui/DataTable';
import StatusBadge from '../../../../components/ui/StatusBadge';
import Pagination from '../../../../components/ui/Pagination';
import employeeDashboardService, {
    EmployeeTaskItem,
    PaginatedTasksResponse
} from '../../../../services/employeeDashboardService';
import './EmployeeTaskLists.css';

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type TaskListTab = 'assigned' | 'created';

export interface EmployeeTaskListsProps {
    employeeId: string;
    employeeName?: string;
    employeeRole?: string;

    // Controlled or default tab
    defaultTab?: TaskListTab;
    activeTab?: TaskListTab;
    onTabChange?: (tab: TaskListTab) => void;

    // Optional external / mock data (controlled mode)
    assignedTasksData?: PaginatedTasksResponse | null;
    createdTasksData?: PaginatedTasksResponse | null;
    isLoading?: boolean;
    error?: string | null;

    // Callbacks
    onTaskClick?: (task: EmployeeTaskItem) => void;
    onSearchChange?: (search: string) => void;
    onStatusChange?: (status: string) => void;
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    onRefresh?: () => void;

    className?: string;
}

// ── Pure Formatting & Normalization Helpers ──────────────────────────────────

export function formatStatus(status: string | number | undefined | null): string {
    if (status === undefined || status === null) return 'Not Started';
    if (typeof status === 'number') {
        const map: Record<number, string> = {
            0: 'Not Started',
            1: 'In Progress',
            2: 'Done',
            3: 'Completed',
            4: 'On Hold',
            5: 'Cancelled',
        };
        return map[status] ?? 'Unknown';
    }
    return String(status);
}

export function formatPriority(priority: string | number | undefined | null): string {
    if (priority === undefined || priority === null) return 'Medium';
    if (typeof priority === 'number') {
        const map: Record<number, string> = {
            0: 'Low',
            1: 'Medium',
            2: 'High',
            3: 'Urgent',
        };
        return map[priority] ?? 'Medium';
    }
    return String(priority);
}

export function formatScope(scope: string | number | undefined | null): string {
    if (scope === undefined || scope === null) return 'Individual';
    if (typeof scope === 'number') {
        const map: Record<number, string> = {
            0: 'Individual',
            1: 'Team',
            2: 'Department',
            3: 'Broadcast',
        };
        return map[scope] ?? 'Individual';
    }
    return String(scope);
}

export function formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return String(dateStr);
    }
}

export function isTaskOverdue(task: EmployeeTaskItem): boolean {
    const statusStr = formatStatus(task.status).toLowerCase();
    if (statusStr === 'completed' || statusStr === 'done' || statusStr === 'cancelled') {
        return false;
    }
    if (statusStr === 'overdue') return true;
    if (task.deadline) {
        const d = new Date(task.deadline);
        return !isNaN(d.getTime()) && d.getTime() < Date.now();
    }
    return false;
}

export function getCompletionPercentage(row: EmployeeTaskItem): number {
    if (row.myCompletionPercentage != null && !isNaN(Number(row.myCompletionPercentage))) {
        return Math.min(100, Math.max(0, Math.round(Number(row.myCompletionPercentage))));
    }
    if (row.assignees && row.assignees.length > 0) {
        const validPercentages = row.assignees
            .map(a => a.completionPercentage)
            .filter((p): p is number => p != null && !isNaN(p));
        if (validPercentages.length > 0) {
            const sum = validPercentages.reduce((acc, curr) => acc + curr, 0);
            return Math.min(100, Math.max(0, Math.round(sum / validPercentages.length)));
        }
    }
    const statusStr = formatStatus(row.status).toLowerCase();
    if (statusStr === 'completed' || statusStr === 'done') return 100;
    if (statusStr === 'in progress') return 50;
    return 0;
}

// ── Component Implementation ──────────────────────────────────────────────────

export default function EmployeeTaskLists({
    employeeId,
    employeeName,
    employeeRole,
    defaultTab = 'assigned',
    activeTab: controlledTab,
    onTabChange,
    assignedTasksData,
    createdTasksData,
    isLoading: externalLoading,
    error: externalError,
    onTaskClick,
    onSearchChange,
    onStatusChange,
    onPageChange,
    onPageSizeChange,
    onRefresh,
    className = '',
}: EmployeeTaskListsProps) {
    // ── Internal States ────────────────────────────────────────────────────────
    const [internalTab, setInternalTab] = useState<TaskListTab>(defaultTab);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [internalAssignedData, setInternalAssignedData] = useState<PaginatedTasksResponse | null>(null);
    const [internalCreatedData, setInternalCreatedData] = useState<PaginatedTasksResponse | null>(null);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Active tab resolution (controlled vs uncontrolled)
    const currentTab = controlledTab ?? internalTab;

    const handleTabChange = useCallback((tab: TaskListTab) => {
        if (tab === currentTab) return;
        setInternalTab(tab);
        setPage(1);
        onTabChange?.(tab);
    }, [currentTab, onTabChange]);

    // ── Data Fetching Effect (when not controlled by external props) ───────────
    const isExternallyControlled =
        currentTab === 'assigned'
            ? assignedTasksData !== undefined
            : createdTasksData !== undefined;

    useEffect(() => {
        if (isExternallyControlled) return;
        if (!employeeId || !employeeId.trim()) return;

        let isCancelled = false;
        setFetchLoading(true);
        setFetchError(null);

        const fetchData = async () => {
            try {
                if (currentTab === 'assigned') {
                    const result = await employeeDashboardService.getEmployeeAssignedTasks(
                        employeeId,
                        page,
                        pageSize,
                        searchQuery,
                        statusFilter
                    );
                    if (!isCancelled) {
                        setInternalAssignedData(result);
                    }
                } else {
                    const result = await employeeDashboardService.getEmployeeCreatedTasks(
                        employeeId,
                        page,
                        pageSize,
                        searchQuery,
                        statusFilter
                    );
                    if (!isCancelled) {
                        setInternalCreatedData(result);
                    }
                }
            } catch (err: any) {
                if (!isCancelled) {
                    setFetchError(err.message || 'Failed to load task records');
                }
            } finally {
                if (!isCancelled) {
                    setFetchLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isCancelled = true;
        };
    }, [
        employeeId,
        currentTab,
        page,
        pageSize,
        searchQuery,
        statusFilter,
        isExternallyControlled,
    ]);

    // ── Active Data & Counts Resolution ─────────────────────────────────────────
    const activeData = useMemo(() => {
        if (currentTab === 'assigned') {
            return assignedTasksData !== undefined ? assignedTasksData : internalAssignedData;
        } else {
            return createdTasksData !== undefined ? createdTasksData : internalCreatedData;
        }
    }, [currentTab, assignedTasksData, internalAssignedData, createdTasksData, internalCreatedData]);

    const isLoading = externalLoading ?? fetchLoading;
    const errorMessage = externalError ?? fetchError;

    const rawItems = activeData?.items ?? [];
    const totalCount = activeData?.totalCount ?? rawItems.length;
    const totalPages = activeData?.totalPages ?? (pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0);

    // Filter items client-side if data was passed statically/externally without backend filtering
    const displayItems = useMemo(() => {
        if (!isExternallyControlled) {
            return rawItems;
        }

        let filtered = rawItems;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(item =>
                (item.title && item.title.toLowerCase().includes(q)) ||
                (item.description && item.description.toLowerCase().includes(q)) ||
                (item.taskNumber && item.taskNumber.toLowerCase().includes(q)) ||
                (item.taskReferenceNumber && item.taskReferenceNumber.toLowerCase().includes(q))
            );
        }

        if (statusFilter && statusFilter !== 'All') {
            const sf = statusFilter.toLowerCase();
            filtered = filtered.filter(item => {
                const overdue = isTaskOverdue(item);
                if (sf === 'overdue') return overdue;
                const statusStr = formatStatus(item.status).toLowerCase();
                return statusStr === sf;
            });
        }

        return filtered;
    }, [rawItems, searchQuery, statusFilter, isExternallyControlled]);

    const activeTotalCount = isExternallyControlled && (searchQuery || statusFilter !== 'All')
        ? displayItems.length
        : totalCount;

    const activeTotalPages = pageSize > 0 ? Math.ceil(activeTotalCount / pageSize) : totalPages;
    const fromIndex = activeTotalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const toIndex = Math.min(page * pageSize, activeTotalCount);

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        setPage(1);
        onSearchChange?.(val);
    };

    const handleStatusChange = (val: string) => {
        setStatusFilter(val);
        setPage(1);
        onStatusChange?.(val);
    };

    const handleResetFilters = () => {
        setSearchQuery('');
        setStatusFilter('All');
        setPage(1);
        onSearchChange?.('');
        onStatusChange?.('All');
    };

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        onPageChange?.(newPage);
    };

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setPage(1);
        onPageSizeChange?.(newSize);
    };

    const handleRefresh = () => {
        if (onRefresh) {
            onRefresh();
        } else {
            // Re-trigger internal fetch by re-setting page
            setPage(p => p);
        }
    };

    // ── Table Columns Definitions ──────────────────────────────────────────────

    // 1. Columns for Assigned Tasks
    const assignedColumns: DataTableColumn<EmployeeTaskItem>[] = useMemo(() => [
        {
            header: 'Task Number',
            width: '140px',
            accessor: (row: EmployeeTaskItem) => {
                const num = row.taskNumber || row.taskReferenceNumber || `#TSK-${row.id.slice(0, 8).toUpperCase()}`;
                return (
                    <span className="task-num-pill" data-testid="task-number">
                        {num}
                    </span>
                );
            },
        },
        {
            header: 'Title',
            accessor: (row: EmployeeTaskItem) => (
                <div className="task-title-cell">
                    <span className="task-title-main" title={row.title} data-testid="task-title">
                        {row.title}
                    </span>
                    {row.description && (
                        <span className="task-title-desc" title={row.description}>
                            {row.description.length > 70 ? `${row.description.slice(0, 70)}…` : row.description}
                        </span>
                    )}
                </div>
            ),
        },
        {
            header: 'Priority',
            width: '110px',
            accessor: (row: EmployeeTaskItem) => (
                <StatusBadge status={formatPriority(row.priorityLevel)} size="sm" />
            ),
        },
        {
            header: 'Status',
            width: '130px',
            accessor: (row: EmployeeTaskItem) => {
                const overdue = isTaskOverdue(row);
                return <StatusBadge status={overdue ? 'Overdue' : formatStatus(row.status)} size="sm" />;
            },
        },
        {
            header: 'Deadline / Due Date',
            width: '160px',
            accessor: (row: EmployeeTaskItem) => {
                const overdue = isTaskOverdue(row);
                return (
                    <div className={`task-deadline-cell ${overdue ? 'is-overdue' : ''}`}>
                        <Calendar size={13} className="task-deadline-icon" />
                        <span>{formatDate(row.deadline)}</span>
                    </div>
                );
            },
        },
        {
            header: 'Assignee Progress %',
            width: '170px',
            accessor: (row: EmployeeTaskItem) => {
                const pct = getCompletionPercentage(row);
                return (
                    <div className="task-progress-cell" data-testid="assignee-progress">
                        <div className="task-progress-track">
                            <div
                                className={`task-progress-bar ${
                                    pct === 100 ? 'bar-complete' : pct >= 50 ? 'bar-good' : 'bar-normal'
                                }`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="task-progress-val">{pct}%</span>
                    </div>
                );
            },
        },
    ], []);

    // 2. Columns for Created Tasks
    const createdColumns: DataTableColumn<EmployeeTaskItem>[] = useMemo(() => [
        {
            header: 'Task Number',
            width: '140px',
            accessor: (row: EmployeeTaskItem) => {
                const num = row.taskNumber || row.taskReferenceNumber || `#TSK-${row.id.slice(0, 8).toUpperCase()}`;
                return (
                    <span className="task-num-pill" data-testid="task-number">
                        {num}
                    </span>
                );
            },
        },
        {
            header: 'Title',
            accessor: (row: EmployeeTaskItem) => (
                <div className="task-title-cell">
                    <span className="task-title-main" title={row.title} data-testid="task-title">
                        {row.title}
                    </span>
                    {row.description && (
                        <span className="task-title-desc" title={row.description}>
                            {row.description.length > 70 ? `${row.description.slice(0, 70)}…` : row.description}
                        </span>
                    )}
                </div>
            ),
        },
        {
            header: 'Assignee / Scope',
            width: '170px',
            accessor: (row: EmployeeTaskItem) => {
                if (row.assignees && row.assignees.length > 0) {
                    const names = row.assignees.map(a => a.fullName || a.employeeNumber).filter(Boolean);
                    if (names.length === 1) {
                        return (
                            <div className="assignee-scope-cell">
                                <User size={13} className="assignee-icon" />
                                <span className="assignee-name" title={names[0]}>{names[0]}</span>
                            </div>
                        );
                    }
                    return (
                        <div className="assignee-scope-cell" title={names.join(', ')}>
                            <Users size={13} className="assignee-icon" />
                            <span className="assignee-name">{names[0]}</span>
                            <span className="assignee-badge-count">+{names.length - 1}</span>
                        </div>
                    );
                }
                if (row.assignedDepartmentName) {
                    return (
                        <div className="assignee-scope-cell">
                            <Building2 size={13} className="assignee-icon" />
                            <span className="scope-name">{row.assignedDepartmentName}</span>
                        </div>
                    );
                }
                if (row.teamName) {
                    return (
                        <div className="assignee-scope-cell">
                            <Users size={13} className="assignee-icon" />
                            <span className="scope-name">{row.teamName}</span>
                        </div>
                    );
                }
                if (row.assignmentScope != null) {
                    return (
                        <div className="assignee-scope-cell">
                            <span className="scope-pill">{formatScope(row.assignmentScope)}</span>
                        </div>
                    );
                }
                return <span className="text-muted">—</span>;
            },
        },
        {
            header: 'Priority',
            width: '110px',
            accessor: (row: EmployeeTaskItem) => (
                <StatusBadge status={formatPriority(row.priorityLevel)} size="sm" />
            ),
        },
        {
            header: 'Status',
            width: '130px',
            accessor: (row: EmployeeTaskItem) => {
                const overdue = isTaskOverdue(row);
                return <StatusBadge status={overdue ? 'Overdue' : formatStatus(row.status)} size="sm" />;
            },
        },
        {
            header: 'Deadline',
            width: '150px',
            accessor: (row: EmployeeTaskItem) => {
                const overdue = isTaskOverdue(row);
                return (
                    <div className={`task-deadline-cell ${overdue ? 'is-overdue' : ''}`}>
                        <Calendar size={13} className="task-deadline-icon" />
                        <span>{formatDate(row.deadline)}</span>
                    </div>
                );
            },
        },
        {
            header: 'Created At',
            width: '140px',
            accessor: (row: EmployeeTaskItem) => (
                <div className="task-created-at-cell">
                    <Clock size={13} className="task-created-icon" />
                    <span>{formatDate(row.createdAt)}</span>
                </div>
            ),
        },
    ], []);

    // ── Edge Case Empty Messages ───────────────────────────────────────────────
    const emptyMessage = useMemo(() => {
        if (currentTab === 'assigned') {
            if (activeTotalCount === 0 && !searchQuery && statusFilter === 'All') {
                return 'No tasks assigned to this employee';
            }
            return 'No tasks assigned to this employee matching your filter';
        } else {
            if (activeTotalCount === 0 && !searchQuery && statusFilter === 'All') {
                return 'No tasks created by this employee (Staff members typically execute assigned tasks)';
            }
            return 'No tasks created by this employee matching your filter';
        }
    }, [currentTab, activeTotalCount, searchQuery, statusFilter]);

    const emptyIcon = currentTab === 'assigned'
        ? <Inbox size={32} className="empty-state-icon" />
        : <UserCheck size={32} className="empty-state-icon" />;

    // Counts for tabs
    const assignedBadgeCount = assignedTasksData?.totalCount ?? internalAssignedData?.totalCount;
    const createdBadgeCount = createdTasksData?.totalCount ?? internalCreatedData?.totalCount;

    return (
        <div className={`employee-task-lists-wrapper ${className}`} data-testid="employee-task-lists">
            {/* ── Tab Switcher Header ── */}
            <div className="task-lists-header-bar">
                <div className="task-lists-tab-nav" role="tablist" aria-label="Task lists">
                    <button
                        type="button"
                        role="tab"
                        id="tab-assigned"
                        aria-selected={currentTab === 'assigned'}
                        aria-controls="panel-task-table"
                        data-testid="tab-assigned"
                        className={`task-tab-btn ${currentTab === 'assigned' ? 'active' : ''}`}
                        onClick={() => handleTabChange('assigned')}
                    >
                        <ClipboardList size={16} />
                        <span>Tasks Assigned to Them</span>
                        {assignedBadgeCount !== undefined && (
                            <span className="task-tab-badge" data-testid="assigned-count-badge">
                                {assignedBadgeCount}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        role="tab"
                        id="tab-created"
                        aria-selected={currentTab === 'created'}
                        aria-controls="panel-task-table"
                        data-testid="tab-created"
                        className={`task-tab-btn ${currentTab === 'created' ? 'active' : ''}`}
                        onClick={() => handleTabChange('created')}
                    >
                        <UserCheck size={16} />
                        <span>Tasks Created by Them</span>
                        {createdBadgeCount !== undefined && (
                            <span className="task-tab-badge" data-testid="created-count-badge">
                                {createdBadgeCount}
                            </span>
                        )}
                    </button>
                </div>

                {onRefresh && (
                    <button
                        type="button"
                        className="btn-refresh-tasks"
                        onClick={handleRefresh}
                        title="Refresh task list"
                        disabled={isLoading}
                        data-testid="refresh-tasks-btn"
                    >
                        <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
                        <span>Refresh</span>
                    </button>
                )}
            </div>

            {/* ── Informational banner for execution staff on Created Tab ── */}
            {currentTab === 'created' && activeTotalCount === 0 && !isLoading && (
                <div className="task-lists-info-banner" data-testid="staff-created-note">
                    <CheckCircle2 size={15} />
                    <span>
                        Staff members typically execute assigned tasks rather than create them. Coordinators and Managers are the primary task creators.
                    </span>
                </div>
            )}

            {/* ── Error Banner ── */}
            {errorMessage && (
                <div className="task-lists-error-banner" role="alert" data-testid="task-lists-error">
                    <AlertCircle size={16} />
                    <span>{errorMessage}</span>
                    <button type="button" className="btn-retry" onClick={handleRefresh}>
                        Retry
                    </button>
                </div>
            )}

            {/* ── Sub-Filter Bar & DataTable ── */}
            <div id="panel-task-table" role="tabpanel" aria-labelledby={`tab-${currentTab}`}>
                <DataTable<EmployeeTaskItem>
                    columns={currentTab === 'assigned' ? assignedColumns : createdColumns}
                    data={displayItems}
                    loading={isLoading}
                    emptyMessage={emptyMessage}
                    emptyIcon={emptyIcon}
                    onRowClick={onTaskClick}
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    searchPlaceholder="Search by title or description..."
                    filterElements={
                        <div className="task-lists-filters-row">
                            <div className="task-status-filter-wrapper">
                                <Filter size={14} className="status-filter-icon" />
                                <select
                                    id="task-status-filter"
                                    data-testid="task-status-filter"
                                    aria-label="Filter by task status"
                                    className="dt-filter-select task-status-select"
                                    value={statusFilter}
                                    onChange={e => handleStatusChange(e.target.value)}
                                >
                                    <option value="All">All Statuses</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Overdue">Overdue</option>
                                    <option value="On Hold">On Hold</option>
                                    <option value="Pending">Pending / Not Started</option>
                                </select>
                            </div>

                            {(searchQuery || (statusFilter && statusFilter !== 'All')) && (
                                <button
                                    type="button"
                                    data-testid="reset-filters-btn"
                                    className="btn-reset-filters"
                                    onClick={handleResetFilters}
                                    title="Reset filters"
                                >
                                    <RotateCcw size={13} />
                                    <span>Reset</span>
                                </button>
                            )}
                        </div>
                    }
                />

                {/* ── Reusable Pagination & Footer Controls ── */}
                <div className="task-lists-footer" data-testid="task-lists-footer">
                    <div className="task-lists-footer-info" data-testid="task-lists-count-info">
                        {activeTotalCount === 0
                            ? 'No tasks found'
                            : `Showing ${fromIndex}–${toIndex} of ${activeTotalCount.toLocaleString()} task${
                                  activeTotalCount === 1 ? '' : 's'
                              }`}
                    </div>

                    <div className="task-lists-footer-controls">
                        <div className="task-lists-pagesize-wrapper">
                            <span className="pagesize-label">Rows per page:</span>
                            <select
                                aria-label="Rows per page"
                                className="dt-filter-select pagesize-select"
                                value={pageSize}
                                onChange={e => handlePageSizeChange(Number(e.target.value))}
                                data-testid="pagesize-select"
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                        </div>

                        <Pagination
                            currentPage={page}
                            totalPages={activeTotalPages}
                            onPageChange={handlePageChange}
                            className="task-lists-pagination"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
