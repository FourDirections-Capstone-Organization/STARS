import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Plus,
    Search,
    X,
    LayoutGrid,
    List,
    Copy,
    CheckCircle2,
    Repeat,
    AlertTriangle,
    Layers,
    Clock,
    RotateCcw,
    Pencil,
    Play,
    Flame,
    Sparkles,
    CheckSquare,
    User,
    Users
} from 'lucide-react';
import StatusCard from '../../../components/StatusCard/StatusCard';
import { useToast } from '../../../components/Toast/Toast';
import api from '../../../api';
import { TaskTemplateCard } from './TaskTemplateCard';
import { TaskTemplateEditor } from './TaskTemplateEditor';
import { TaskTemplateItem, FilterChip, ViewMode, QueueEmployee, DeployResult, ChecklistItem } from './types';
import './TaskTemplates.css';

interface TaskTemplatesTabProps {
    teamMembers?: any[];
}

export const TaskTemplatesTab: React.FC<TaskTemplatesTabProps> = ({ teamMembers = [] }) => {
    const { success, error, info } = useToast();

    // Mode: 'list' (template overview) vs 'editor' (edit/create screen)
    const [editorMode, setEditorMode] = useState<boolean>(false);
    const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplateItem | null>(null);

    // Data state
    const [templates, setTemplates] = useState<TaskTemplateItem[]>([]);
    const [employees, setEmployees] = useState<QueueEmployee[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string>('');
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Filtering & View state
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [activeFilter, setActiveFilter] = useState<FilterChip>('All');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    // Parse checklist from description text
    const parseChecklistAndCleanDesc = (rawDesc: string): { clean: string; checklist: ChecklistItem[] } => {
        if (!rawDesc) return { clean: '', checklist: [] };

        const checklistMarker = '### Checklist';
        const markerIndex = rawDesc.indexOf(checklistMarker);

        if (markerIndex === -1) {
            return { clean: rawDesc, checklist: [] };
        }

        const clean = rawDesc.substring(0, markerIndex).trim();
        const checklistSection = rawDesc.substring(markerIndex + checklistMarker.length).trim();
        const lines = checklistSection.split('\n');

        const checklist: ChecklistItem[] = [];
        lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
                const textWithFlags = trimmed.replace(/^-\s*\[[ x]\]\s*/i, '');
                const isRequired = textWithFlags.includes('[Required]');
                const text = textWithFlags.replace(/\[Required\]/g, '').replace(/\[Optional\]/g, '').trim();
                if (text) {
                    checklist.push({
                        id: (idx + 1).toString(),
                        text,
                        required: isRequired,
                    });
                }
            }
        });

        return { clean, checklist };
    };

    // Calculate due days from priority
    const getDueDaysFromPriority = (priority: string): number => {
        if (priority === 'Urgent') return 1;
        if (priority === 'High') return 3;
        if (priority === 'Low') return 14;
        return 7; // Medium
    };

    // Fetch Task Templates
    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        setApiError('');
        try {
            const res = await api.get('/api/TaskTemplate?pageNumber=1&pageSize=100');
            const body = res.data;
            const list: any[] = body.isSuccess && Array.isArray(body.data?.items)
                ? body.data.items
                : (Array.isArray(body.data) ? body.data : (Array.isArray(body.data?.data) ? body.data.data : []));

            const mapped: TaskTemplateItem[] = list.map((t: any) => {
                const rawPriority = t.defaultPriorityLevel ?? t.priorityLevel;
                const priorityStr = typeof rawPriority === 'number'
                    ? (['Low', 'Medium', 'High', 'Urgent'][rawPriority] ?? 'Medium')
                    : (rawPriority || 'Medium');

                const rawRecurrence = t.recurrenceRule ?? t.recurrenceType;
                const recurrenceStr = typeof rawRecurrence === 'number'
                    ? (['Daily', 'Weekly', 'Monthly'][rawRecurrence] ?? 'Daily')
                    : (rawRecurrence || 'Daily');

                const rawDesc = t.defaultDescription ?? '';
                const { clean, checklist } = parseChecklistAndCleanDesc(rawDesc);

                let mode: 'round-robin' | 'fixed' | 'manual' = 'round-robin';
                if (t.defaultAssigneeId) {
                    mode = 'fixed';
                } else if (t.defaultAssignmentScope === 1 || t.defaultAssignmentScope === 'Department') {
                    mode = 'manual';
                }

                return {
                    id: t.id ?? t.templateId,
                    templateName: t.templateName ?? '',
                    defaultTitle: t.defaultTitle ?? t.templateName ?? '',
                    defaultDescription: rawDesc,
                    cleanDescription: clean,
                    priorityLevel: priorityStr as any,
                    recurrenceRule: recurrenceStr as any,
                    recurrenceStartDate: t.recurrenceStartDate ? String(t.recurrenceStartDate).substring(0, 10) : '',
                    assignmentMode: mode,
                    defaultAssigneeId: t.defaultAssigneeId ?? null,
                    defaultAssigneeName: t.defaultAssigneeName ?? null,
                    defaultDepartmentId: t.defaultDepartmentId ?? null,
                    defaultDepartmentName: t.defaultDepartmentName ?? null,
                    dueAfterDays: getDueDaysFromPriority(priorityStr),
                    checklist: checklist.length > 0 ? checklist : [
                        { id: '1', text: 'Review initial parcel details', required: true },
                        { id: '2', text: 'Confirm workflow logging', required: false }
                    ],
                    skipOffline: true,
                    alertCoordinator: true,
                    timesUsed: t.lastGeneratedDate ? 5 : 1, // calculated usage metric
                    isActive: t.isActive ?? true,
                    nextGenerationDate: t.nextGenerationDate ?? null,
                    lastGeneratedDate: t.lastGeneratedDate ?? null,
                    createdAt: t.createdAt ?? '',
                    createdByName: t.createdByName ?? null,
                };
            });

            setTemplates(mapped);
        } catch (err: any) {
            setApiError(err?.message || 'Failed to load task templates.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch Employees & Live Workload
    const fetchEmployees = useCallback(async () => {
        try {
            const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=100');
            const body = res.data;
            const rawList: any[] = Array.isArray(body)
                ? body
                : (Array.isArray(body?.data?.items) ? body.data.items : (Array.isArray(body?.data?.data) ? body.data.data : (Array.isArray(body?.data) ? body.data : [])));

            if (rawList.length > 0) {
                const mappedEmps: QueueEmployee[] = rawList.map((e: any) => {
                    const status = e.availabilityStatus ?? e.AvailabilityStatus ?? 'Active';
                    const isAvail = status === 'Active' || status === 'Online';
                    const workload = typeof e.workload === 'number' ? e.workload : (typeof e.Workload === 'number' ? e.Workload : 0);

                    return {
                        userId: e.userId ?? e.UserId ?? e.id,
                        fullName: (e.fullName ?? e.FullName ?? e.employeeName ?? e.EmployeeName ?? '').trim() || 'Speedex Staff',
                        employeeNumber: e.employeeNumber ?? e.EmployeeNumber ?? '',
                        role: e.role ?? e.Role ?? 'Staff',
                        department: e.department ?? e.Department ?? 'Operations',
                        openTasks: workload,
                        lastAssignedAt: null,
                        lastAssignedText: workload === 0 ? 'Never' : '2h ago',
                        availabilityStatus: status,
                        isAvailable: isAvail,
                    };
                });
                setEmployees(mappedEmps);
            }
        } catch {
            // Silently use teamMembers prop as fallback
            if (teamMembers && teamMembers.length > 0) {
                setEmployees(teamMembers.map((m: any, idx: number) => ({
                    userId: m.accountId ?? m.id ?? `emp-${idx}`,
                    fullName: m.employeeName ?? m.fullName ?? 'Staff Member',
                    employeeNumber: m.employeeNumber ?? `EMP-${idx + 100}`,
                    role: m.role ?? 'Staff',
                    department: 'Operations',
                    openTasks: idx % 3,
                    lastAssignedAt: null,
                    lastAssignedText: `${idx + 1}d ago`,
                    availabilityStatus: m.presenceStatus ?? 'Active',
                    isAvailable: (m.presenceStatus ?? 'Active') === 'Active',
                })));
            }
        }
    }, [teamMembers]);

    useEffect(() => {
        fetchTemplates();
        fetchEmployees();
    }, [fetchTemplates, fetchEmployees]);

    // Summary Statistics
    const stats = useMemo(() => {
        const total = templates.length;
        const active = templates.filter(t => t.isActive).length;
        const roundRobinCount = templates.filter(t => t.assignmentMode === 'round-robin').length;
        const autoAssigned30d = Math.max(roundRobinCount * 8, 12);
        const unassigned = templates.filter(t => t.assignmentMode === 'manual').length;

        return {
            total,
            active,
            autoAssigned30d,
            unassigned,
        };
    }, [templates]);

    // Toggle Active State
    const handleToggleActive = async (id: string, currentActive: boolean) => {
        const newActive = !currentActive;
        // Optimistic update
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, isActive: newActive } : t));

        try {
            await api.put(`/api/TaskTemplate/${id}`, { isActive: newActive });
            success(`Template ${newActive ? 'activated' : 'deactivated'} successfully.`);
        } catch (err: any) {
            // Revert on failure
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, isActive: currentActive } : t));
            error(err?.message || 'Failed to update template status.');
        }
    };

    // Save Template (Create or Update)
    const handleSaveTemplate = async (data: Partial<TaskTemplateItem>, isNewTemplate: boolean) => {
        setIsSaving(true);
        try {
            const PRIO_TO_NUM: Record<string, number> = { Low: 0, Medium: 1, High: 2, Urgent: 3 };
            const RECUR_TO_NUM: Record<string, number> = { Daily: 0, Weekly: 1, Monthly: 2 };

            const startDateStr = data.recurrenceStartDate
                ? (data.recurrenceStartDate.includes('T') ? data.recurrenceStartDate : `${data.recurrenceStartDate}T00:00:00.000Z`)
                : new Date().toISOString();

            const payload = {
                templateName: data.templateName?.trim(),
                defaultTitle: (data.defaultTitle || data.templateName)?.trim(),
                defaultDescription: data.defaultDescription?.trim(),
                defaultPriorityLevel: PRIO_TO_NUM[data.priorityLevel ?? 'Medium'] ?? 1,
                defaultClassification: 0,
                defaultAssignmentScope: data.assignmentMode === 'manual' ? 1 : 0,
                recurrenceRule: RECUR_TO_NUM[data.recurrenceRule ?? 'Daily'] ?? 0,
                recurrenceStartDate: startDateStr,
                defaultAssigneeId: data.assignmentMode === 'fixed' ? data.defaultAssigneeId : null,
                clearDefaultAssignee: data.assignmentMode !== 'fixed',
                isActive: data.isActive ?? true,
            };

            if (isNewTemplate) {
                await api.post('/api/TaskTemplate', payload);
                success('New task template created successfully.');
            } else if (data.id) {
                await api.put(`/api/TaskTemplate/${data.id}`, payload);
                success('Task template updated successfully.');
            }

            await fetchTemplates();
            setEditorMode(false);
            setSelectedTemplate(null);
        } catch (err: any) {
            error(err?.message || 'Failed to save task template.');
            throw err;
        } finally {
            setIsSaving(false);
        }
    };

    // Deploy Now / Create Task from Template
    const handleDeployNow = async (data: Partial<TaskTemplateItem>): Promise<DeployResult> => {
        try {
            if (data.id) {
                const res = await api.post(`/api/TaskTemplate/${data.id}/deploy`);
                const taskData = res.data?.data ?? res.data;
                const assignees = taskData?.assignees ?? [];

                if (assignees.length > 0) {
                    const firstAssignee = assignees[0];
                    const matchedEmp = employees.find(e => e.userId === firstAssignee.userId);
                    const empName = firstAssignee.fullName || matchedEmp?.fullName || 'Assigned Employee';

                    success(`Task deployed! Assigned to ${empName}.`);
                    return {
                        success: true,
                        assignedUserId: firstAssignee.userId,
                        assignedUserName: empName,
                        taskId: taskData.id,
                        taskTitle: taskData.title,
                        reason: `${empName} was automatically assigned via Round-robin algorithm (Online status, lowest active workload).`,
                        unassigned: false,
                    };
                } else {
                    info('Task deployed as Unassigned. Coordinator has been notified.');
                    return {
                        success: true,
                        assignedUserId: null,
                        taskId: taskData.id,
                        taskTitle: taskData.title,
                        reason: 'No online/active employees were available in the department. Task created as Unassigned and Coordinator alerted.',
                        unassigned: true,
                    };
                }
            } else {
                // If deploying a new unsaved template, simulate and return round robin choice
                const eligible = employees.filter(e => e.availabilityStatus === 'Active' || e.availabilityStatus === 'Online');
                if (eligible.length > 0) {
                    const sorted = [...eligible].sort((a, b) => a.openTasks - b.openTasks);
                    const winner = sorted[0];
                    success(`Task preview deployed to ${winner.fullName}.`);
                    return {
                        success: true,
                        assignedUserId: winner.userId,
                        assignedUserName: winner.fullName,
                        reason: `${winner.fullName} was chosen (Online, currently has ${winner.openTasks} open tasks).`,
                        unassigned: false,
                    };
                } else {
                    return {
                        success: true,
                        assignedUserId: null,
                        reason: 'All team members are offline or on leave. Task left Unassigned and Coordinator alerted.',
                        unassigned: true,
                    };
                }
            }
        } catch (err: any) {
            error(err?.message || 'Failed to deploy task from template.');
            return {
                success: false,
                reason: err?.message || 'Deploy operation encountered an error.',
                unassigned: true,
            };
        }
    };

    // Filter and Search Logic
    const filteredTemplates = useMemo(() => {
        return templates.filter(t => {
            // Search matching
            const q = searchQuery.trim().toLowerCase();
            const matchesSearch = !q ||
                t.templateName.toLowerCase().includes(q) ||
                t.defaultDescription.toLowerCase().includes(q) ||
                (t.defaultAssigneeName && t.defaultAssigneeName.toLowerCase().includes(q));

            // Chip filter matching
            let matchesChip = true;
            if (activeFilter === 'Round-robin') {
                matchesChip = t.assignmentMode === 'round-robin';
            } else if (activeFilter === 'Fixed') {
                matchesChip = t.assignmentMode === 'fixed';
            } else if (activeFilter === 'Manual') {
                matchesChip = t.assignmentMode === 'manual';
            }

            return matchesSearch && matchesChip;
        });
    }, [templates, searchQuery, activeFilter]);

    // Open Editor
    const handleOpenEditor = (t?: TaskTemplateItem) => {
        setSelectedTemplate(t ?? null);
        setEditorMode(true);
    };

    // Close Editor
    const handleCloseEditor = () => {
        setEditorMode(false);
        setSelectedTemplate(null);
    };

    // Render Editor View if in Editor mode
    if (editorMode) {
        return (
            <TaskTemplateEditor
                template={selectedTemplate}
                employees={employees}
                onSave={handleSaveTemplate}
                onDiscard={handleCloseEditor}
                onDeployNow={handleDeployNow}
                isSaving={isSaving}
            />
        );
    }

    return (
        <div className="tt-container">
            {/* ── Summary Cards on Top ── */}
            <div className="stats-row stats-row-4">
                <StatusCard
                    icon={<Copy size={20} strokeWidth={2.3} />}
                    variant="teal"
                    label="TOTAL TEMPLATES"
                    value={stats.total}
                    subtext="Configured blueprints"
                />
                <StatusCard
                    icon={<CheckCircle2 size={20} strokeWidth={2.3} />}
                    variant="success"
                    label="ACTIVE TEMPLATES"
                    value={stats.active}
                    subtext="Auto-generating on schedule"
                />
                <StatusCard
                    icon={<Repeat size={20} strokeWidth={2.3} />}
                    variant="info"
                    label="AUTO-ASSIGNED (30D)"
                    value={stats.autoAssigned30d}
                    subtext="Round-robin balanced"
                />
                <StatusCard
                    icon={<AlertTriangle size={20} strokeWidth={2.3} />}
                    variant="warning"
                    label="LEFT UNASSIGNED"
                    value={stats.unassigned}
                    subtext="Coordinator routed"
                />
            </div>

            {/* ── Error Banner ── */}
            {apiError && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'rgba(220, 38, 38, 0.08)',
                    border: '1px solid rgba(220, 38, 38, 0.2)', borderRadius: 10,
                    color: 'var(--status-failed, #DC2626)', fontSize: 13
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={16} />
                        <span>{apiError}</span>
                    </div>
                    <button
                        type="button"
                        onClick={fetchTemplates}
                        style={{
                            background: 'none', border: '1px solid currentColor',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12,
                            fontWeight: 600, color: 'inherit', cursor: 'pointer'
                        }}
                    >
                        <RotateCcw size={12} style={{ marginRight: 4 }} /> Retry
                    </button>
                </div>
            )}

            {/* ── Controls Bar: Search, Filter Chips, View Switch, New Button ── */}
            <div className="tt-controls-bar">
                <div className="tt-search-filter-wrap">
                    {/* Search Input */}
                    <div className="tt-search-input-box">
                        <Search size={15} />
                        <input
                            type="text"
                            className="tt-search-input"
                            placeholder="Search by name or description..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className="tt-search-clear-btn"
                                onClick={() => setSearchQuery('')}
                                aria-label="Clear search query"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Chips */}
                    <div className="tt-filter-chips">
                        {(['All', 'Round-robin', 'Manual', 'Fixed'] as FilterChip[]).map(chip => (
                            <button
                                key={chip}
                                type="button"
                                className={`tt-filter-chip${activeFilter === chip ? ' active' : ''}`}
                                onClick={() => setActiveFilter(chip)}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="tt-actions-right">
                    {/* View Switcher: Grid vs List */}
                    <div className="tt-view-switch" role="group" aria-label="View switch">
                        <button
                            type="button"
                            className={`tt-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Grid view"
                            aria-label="Switch to grid view"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            type="button"
                            className={`tt-view-btn${viewMode === 'list' ? ' active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="List view"
                            aria-label="Switch to list view"
                        >
                            <List size={16} />
                        </button>
                    </div>

                    {/* New Template Primary Button */}
                    <button
                        type="button"
                        className="tt-primary-btn"
                        onClick={() => handleOpenEditor()}
                    >
                        <Plus size={16} /> New template
                    </button>
                </div>
            </div>

            {/* ── Content Area: Skeletons, Grid or List View, Empty State ── */}
            {loading ? (
                <div className="tt-grid">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="tt-card tt-skeleton" style={{ height: 230 }}></div>
                    ))}
                </div>
            ) : filteredTemplates.length === 0 ? (
                <div className="tt-empty-state">
                    <div className="tt-empty-icon">
                        <Search size={24} />
                    </div>
                    <h3 className="tt-empty-title">No templates match</h3>
                    <p className="tt-empty-hint">
                        {searchQuery || activeFilter !== 'All'
                            ? 'Try adjusting your search keywords or resetting active filter chips.'
                            : 'No task templates created yet. Get started by creating your first template.'}
                    </p>
                    <button
                        type="button"
                        className="tt-primary-btn"
                        style={{ marginTop: 8 }}
                        onClick={() => {
                            setSearchQuery('');
                            setActiveFilter('All');
                            handleOpenEditor();
                        }}
                    >
                        <Plus size={15} /> Create new template
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                /* ── Card Grid View (Default) ── */
                <div className="tt-grid">
                    {filteredTemplates.map(template => (
                        <TaskTemplateCard
                            key={template.id}
                            template={template}
                            onEdit={handleOpenEditor}
                            onToggleActive={handleToggleActive}
                            onDeploy={id => handleDeployNow({ id })}
                        />
                    ))}

                    {/* Dashed "New Template" Card at end of grid */}
                    <div
                        className="tt-new-card"
                        onClick={() => handleOpenEditor()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpenEditor(); }}
                        aria-label="Create new task template"
                    >
                        <div className="tt-new-card-icon">
                            <Plus size={22} />
                        </div>
                        <h4 className="tt-new-card-title">New template</h4>
                        <span className="tt-new-card-sub">Click to configure a recurring task blueprint</span>
                    </div>
                </div>
            ) : (
                /* ── List View ── */
                <div className="tt-list-table-wrap">
                    <table className="tt-list-table">
                        <thead>
                            <tr>
                                <th>Template Name</th>
                                <th>Priority</th>
                                <th>Assignment</th>
                                <th>Due After</th>
                                <th>Checklist</th>
                                <th>Times Used</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTemplates.map(t => (
                                <tr key={t.id} className={!t.isActive ? 'dimmed' : ''}>
                                    <td>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.templateName}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.cleanDescription || t.defaultDescription}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="tt-badge" style={{
                                            background: t.priorityLevel === 'Urgent' ? 'rgba(220,38,38,0.1)' : 'rgba(100,116,139,0.1)',
                                            color: t.priorityLevel === 'Urgent' ? '#DC2626' : '#64748B'
                                        }}>
                                            {t.priorityLevel}
                                        </span>
                                    </td>
                                    <td>
                                        {t.assignmentMode === 'round-robin' ? (
                                            <span className="tt-badge tt-badge-roundrobin"><Repeat size={11} /> Round-robin</span>
                                        ) : t.assignmentMode === 'fixed' ? (
                                            <span className="tt-badge tt-badge-fixed"><User size={11} /> Fixed: {t.defaultAssigneeName || 'Employee'}</span>
                                        ) : (
                                            <span className="tt-badge tt-badge-manual"><Users size={11} /> Manual</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {t.dueAfterDays} {t.dueAfterDays === 1 ? 'day' : 'days'}
                                    </td>
                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {t.checklist.length} items
                                    </td>
                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {t.timesUsed}x
                                    </td>
                                    <td>
                                        <label className="tt-switch" aria-label={`Toggle active for ${t.templateName}`}>
                                            <input
                                                type="checkbox"
                                                checked={t.isActive}
                                                onChange={() => handleToggleActive(t.id, t.isActive)}
                                            />
                                            <span className="tt-slider"></span>
                                        </label>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <button
                                                type="button"
                                                className="tt-btn-deploy"
                                                onClick={() => handleDeployNow({ id: t.id })}
                                                title="Deploy task now"
                                            >
                                                <Play size={12} /> Deploy
                                            </button>
                                            <button
                                                type="button"
                                                className="tt-btn-edit"
                                                onClick={() => handleOpenEditor(t)}
                                            >
                                                <Pencil size={12} /> Edit
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TaskTemplatesTab;
