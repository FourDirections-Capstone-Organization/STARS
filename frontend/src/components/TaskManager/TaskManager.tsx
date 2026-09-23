import React, { useState, useMemo } from 'react';
import { Plus, Package, ClipboardList, Loader2, CheckCircle2, AlertCircle, Archive, Trash2, BarChart3, Lock, Eye, Pencil, Brain } from 'lucide-react';
import DataTable, { ActionsDropdown } from '../ui/DataTable';
import StatusBadge from '../ui/StatusBadge';
import StatusCard from '../StatusCard/StatusCard';

export interface TMTask {
    id: string;
    name: string;
    referenceNumber?: string;
    classification?: string;
    project?: string;
    assignee?: { id: string; name: string };
    priority: 'Urgent' | 'High' | 'Medium' | 'Low';
    status: 'Backlog' | 'To do' | 'In progress' | 'In review' | 'Done' | 'Cancelled' | 'On hold';
    dueDate?: string;
    startDate?: string;
    progress: number;
    isArchived?: boolean;
    isDeleted?: boolean;
    isConfidential?: boolean;
    isSLALocked?: boolean;
}

export interface ServerPagination {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
}

export interface TaskSummary {
    active: number;
    inProgress: number;
    completed: number;
    overdue: number;
}

export type TabType = 'active' | 'completed' | 'bin';

interface TMProps {
    tasks: TMTask[];
    summary?: TaskSummary;
    teamMembers: { accountId: string; employeeName: string }[];
    onNewTask: () => void;
    onEdit: (id: string) => void;
    onView: (id: string) => void;
    onArchive: (ids: string[]) => void;
    onRestore?: (ids: string[]) => void;
    onDelete: (ids: string[]) => void;
    onMarkDone: (ids: string[]) => void;
    searchQuery?: string;
    onSearchChange?: (val: string) => void;
    filterPrio?: string;
    onFilterPrioChange?: (val: string) => void;
    filterStatus?: string;
    onFilterStatusChange?: (val: string) => void;
    filterDueDate?: string;
    onFilterDueDateChange?: (val: string) => void;
    filterClassification?: string;
    onFilterClassificationChange?: (val: string) => void;
    filterAssignee?: string;
    onFilterAssigneeChange?: (val: string) => void;
    serverPagination?: ServerPagination;
    /** Controlled active tab (optional — enables parent-managed tab state so the
     *  parent can refetch server-paginated tasks with the right status filter). */
    activeTab?: TabType;
    onTabChange?: (tab: TabType) => void;
}

const PRIORITIES: TMTask['priority'][] = ['Urgent', 'High', 'Medium', 'Low'];
const PRIO_COLORS: Record<string, string> = { Urgent: '#dc2626', High: '#ea580c', Medium: '#d97706', Low: '#2563eb' };
const PRIO_BG: Record<string, string> = { Urgent: '#fef2f2', High: '#fff7ed', Medium: '#fffbeb', Low: '#eff6ff' };
const STATUS_DOT: Record<string, string> = { Backlog: '#94a3b8', 'To do': '#3b82f6', 'In progress': '#16a34a', 'In review': '#d97706', Done: '#059669', Cancelled: '#94a3b8', 'On hold': '#d97706' };
const ASSIGNEE_COLORS = ['#4318ff', '#059669', '#dc2626', '#d97706', '#0284c7', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#c026d3'];
const getAc = (n: string) => ASSIGNEE_COLORS[n.length % ASSIGNEE_COLORS.length];
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; } };

const PriorityBadge = ({ p }: { p: string }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: PRIO_BG[p] || '#f1f5f9', color: PRIO_COLORS[p] || '#475569' }}>
        <span style={{ fontSize: 10 }}>{p === 'Urgent' ? '⬆' : p === 'High' ? '↗' : p === 'Medium' ? '→' : '↘'}</span> {p}
    </span>
);

const AssigneeAvatar = ({ name }: { name: string }) => (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: getAc(name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }} title={name}>
        {(name || '?').charAt(0).toUpperCase()}
    </div>
);

const DueLabel = ({ date, isSLALocked }: { date?: string; isSLALocked?: boolean }) => {
    if (!date) return <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>;
    let diff: number;
    try {
        const n = new Date(); n.setHours(0, 0, 0, 0);
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        diff = Math.round((d.getTime() - n.getTime()) / 86400000);
    } catch { return <span style={{ color: '#94a3b8', fontSize: 11 }}>{date}</span>; }
    if (isNaN(diff)) return <span style={{ color: '#94a3b8', fontSize: 11 }}>{date}</span>;
    const label = diff < 0
        ? <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 700 }}>Overdue</span>
        : diff === 0
            ? <span style={{ color: '#d97706', fontSize: 11, fontWeight: 600 }}>Today</span>
            : diff <= 3
                ? <span style={{ color: '#d97706', fontSize: 11, fontWeight: 600 }}>{diff}d left</span>
                : <span style={{ color: '#94a3b8', fontSize: 11 }}>{fmtDate(date)}</span>;
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {isSLALocked && <span title="SLA Locked — deadline enforced by system"><Lock size={11} color="#7c1d1d" /></span>}
        {label}
    </span>;
};

export default function TaskManager({
    tasks, teamMembers, onNewTask, onEdit, onView, onArchive, onRestore, onDelete, onMarkDone,
    summary,
    searchQuery: externalSearch,
    onSearchChange,
    filterPrio: externalFilterPrio,
    onFilterPrioChange,
    filterStatus: externalFilterStatus,
    onFilterStatusChange,
    filterDueDate: externalFilterDueDate,
    onFilterDueDateChange,
    filterClassification: externalFilterClassification,
    onFilterClassificationChange,
    filterAssignee: externalFilterAssignee,
    onFilterAssigneeChange,
    serverPagination,
    activeTab: controlledTab,
    onTabChange: controlledTabChange,
}: TMProps) {
    const [internalTab, setInternalTab] = useState<TabType>('active');
    const tab = controlledTab !== undefined ? controlledTab : internalTab;
    const [internalSearch, setInternalSearch] = useState('');
    const [internalFilterPrio, setInternalFilterPrio] = useState('');
    const [internalFilterStatus, setInternalFilterStatus] = useState('');
    const [internalFilterDueDate, setInternalFilterDueDate] = useState('');
    const [internalFilterClassification, setInternalFilterClassification] = useState('');
    const [internalFilterAssignee, setInternalFilterAssignee] = useState('');
    const [page, setPage] = useState(1);

    const search = externalSearch !== undefined ? externalSearch : internalSearch;
    const filterPrio = externalFilterPrio !== undefined ? externalFilterPrio : internalFilterPrio;
    const filterStatus = externalFilterStatus !== undefined ? externalFilterStatus : internalFilterStatus;
    const filterDueDate = externalFilterDueDate !== undefined ? externalFilterDueDate : internalFilterDueDate;
    const filterClassification = externalFilterClassification !== undefined ? externalFilterClassification : internalFilterClassification;
    const filterAssignee = externalFilterAssignee !== undefined ? externalFilterAssignee : internalFilterAssignee;

    const handleSearch = (val: string) => {
        if (onSearchChange) onSearchChange(val); else setInternalSearch(val);
        setPage(1);
    };
    const handlePrioChange = (val: string) => {
        if (onFilterPrioChange) onFilterPrioChange(val); else setInternalFilterPrio(val);
        setPage(1);
    };
    const handleStatusChange = (val: string) => {
        if (onFilterStatusChange) onFilterStatusChange(val); else setInternalFilterStatus(val);
        setPage(1);
    };
    const handleDueDateChange = (val: string) => {
        if (onFilterDueDateChange) onFilterDueDateChange(val); else setInternalFilterDueDate(val);
        setPage(1);
    };
    const handleClassificationChange = (val: string) => {
        if (onFilterClassificationChange) onFilterClassificationChange(val); else setInternalFilterClassification(val);
        setPage(1);
    };
    const handleAssigneeChange = (val: string) => {
        if (onFilterAssigneeChange) onFilterAssigneeChange(val); else setInternalFilterAssignee(val);
        setPage(1);
    };
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelect = (id: string) => {
        setSelectedIds(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    };
    const toggleSelectAll = () => {
        if (selectedIds.size === paginated.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(paginated.map(t => t.id)));
    };

    const availableStatuses: TMTask['status'][] = useMemo(() => {
        if (tab === 'active') return ['Backlog', 'To do', 'In progress', 'In review', 'On hold'];
        if (tab === 'completed') return ['Done'];
        return ['Cancelled'];
    }, [tab]);

    const tabTasks = useMemo(() => {
        if (tab === 'active') return tasks.filter(t => t.status !== 'Done' && t.status !== 'Cancelled' && !t.isArchived && !t.isDeleted);
        if (tab === 'completed') return tasks.filter(t => t.status === 'Done' && !t.isArchived && !t.isDeleted);
        return tasks.filter(t => t.isArchived || t.isDeleted || t.status === 'Cancelled');
    }, [tasks, tab]);

    const filtered = useMemo(() => {
        let list = [...tabTasks];
        const q = search.toLowerCase().trim();
        if (q) list = list.filter(t => t.name.toLowerCase().includes(q) || (t.assignee?.name || '').toLowerCase().includes(q) || (t.project || '').toLowerCase().includes(q));
        if (filterPrio) list = list.filter(t => t.priority === filterPrio);
        if (filterStatus) list = list.filter(t => t.status === filterStatus);
        if (filterDueDate) {
            list = list.filter(t => {
                if (!t.dueDate) return false;
                try {
                    const d = new Date(t.dueDate);
                    if (isNaN(d.getTime())) return t.dueDate.startsWith(filterDueDate);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const localDateStr = `${year}-${month}-${day}`;
                    return localDateStr === filterDueDate || t.dueDate.startsWith(filterDueDate);
                } catch {
                    return t.dueDate.startsWith(filterDueDate);
                }
            });
        }
        if (filterClassification) list = list.filter(t => t.classification === filterClassification);
        if (filterAssignee) list = list.filter(t => t.assignee?.id === filterAssignee);
        return list;
    }, [tabTasks, search, filterPrio, filterStatus, filterDueDate, filterClassification, filterAssignee]);

    const totalPages = serverPagination?.totalPages ?? Math.ceil(filtered.length / 8);
    const paginated = serverPagination ? filtered : filtered.slice((page - 1) * 8, page * 8);
    const totalInProgress = summary?.inProgress ?? tasks.filter(t => t.status === 'In progress' && !t.isArchived && !t.isDeleted).length;
    const totalDone = summary?.completed ?? tasks.filter(t => t.status === 'Done' && !t.isArchived && !t.isDeleted).length;
    const totalOverdue = summary?.overdue ?? tasks.filter(t => t.status !== 'Done' && t.status !== 'Cancelled' && !t.isArchived && !t.isDeleted && t.dueDate).filter(t => { try { return new Date(t.dueDate!) < new Date(); } catch { return false; } }).length;
    const activeTotal = summary?.active ?? tabTasks.length;
    const completionRate = summary ? (activeTotal + totalDone > 0 ? Math.round(totalDone / (activeTotal + totalDone) * 100) : 0) : (tasks.length ? Math.round(totalDone / tasks.length * 100) : 0);

    const handleTabChange = (key: string) => {
        const next = key as TabType;
        setPage(1);
        setInternalFilterStatus('');
        if (onFilterStatusChange) onFilterStatusChange('');
        if (controlledTabChange) controlledTabChange(next);
        else setInternalTab(next);
    };
    const handlePageChange = (p: number) => { setPage(p); };

    const activeStats = tab === 'active' ? [
        { label: 'Active', value: activeTotal, icon: <ClipboardList size={18} />, variant: 'teal' as const, subtext: `${activeTotal} task${activeTotal !== 1 ? 's' : ''}` },
        { label: 'In Progress', value: totalInProgress, icon: <Loader2 size={18} />, variant: 'warning' as const, subtext: 'Currently active' },
        { label: 'Completed', value: totalDone, icon: <CheckCircle2 size={18} />, variant: 'success' as const, subtext: `${completionRate}% completion rate` },
        { label: 'Overdue', value: totalOverdue, icon: <AlertCircle size={18} />, variant: totalOverdue > 0 ? 'danger' as const : 'teal' as const, subtext: totalOverdue > 0 ? 'Needs attention' : 'No overdue tasks' },
    ] : tab === 'completed' ? [
        { label: 'Completed', value: totalDone, icon: <CheckCircle2 size={18} />, variant: 'success' as const, subtext: 'Finished tasks' },
        { label: 'On Time', value: tabTasks.filter(t => t.progress >= 100).length, icon: <ClipboardList size={18} />, variant: 'teal' as const, subtext: 'Completed on schedule' },
        { label: 'Rate', value: `${completionRate}%`, icon: <BarChart3 size={18} />, variant: 'success' as const, subtext: 'Completion rate' },
    ] : [
        { label: 'Archived', value: tabTasks.filter(t => t.isArchived).length, icon: <Archive size={18} />, variant: 'warning' as const, subtext: 'Archived tasks' },
        { label: 'Cancelled', value: tabTasks.filter(t => t.status === 'Cancelled').length, icon: <AlertCircle size={18} />, variant: 'danger' as const, subtext: 'Cancelled tasks' },
        { label: 'Total', value: tabTasks.length, icon: <ClipboardList size={18} />, variant: 'teal' as const, subtext: 'In bin' },
    ];

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeStats.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
                {activeStats.map(s => (
                    <StatusCard key={s.label} icon={s.icon} label={s.label} value={s.value} subtext={s.subtext} variant={s.variant} />
                ))}
            </div>
            <DataTable
                tabs={[
                    { key: 'active', label: 'Active', icon: <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />, badge: summary?.active ?? tasks.filter(t => t.status !== 'Done' && t.status !== 'Cancelled' && !t.isArchived && !t.isDeleted).length },
                    { key: 'completed', label: 'Completed', icon: <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />, badge: summary?.completed ?? tasks.filter(t => t.status === 'Done' && !t.isArchived && !t.isDeleted).length },
                    { key: 'bin', label: 'Bin', icon: <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />, badge: tasks.filter(t => t.isArchived || t.isDeleted || t.status === 'Cancelled').length },
                ]}
                activeTab={tab}
                onTabChange={handleTabChange}
                title="Task Manager"
                searchQuery={search}
                onSearchChange={handleSearch}
                searchPlaceholder="Search by task, assignee, project…"
                filterElements={tab !== 'bin' ? <>
                    <select value={filterStatus} onChange={e => handleStatusChange(e.target.value)} style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                        <option value="">All Statuses</option>
                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                            type="date"
                            value={filterDueDate}
                            onChange={e => handleDueDateChange(e.target.value)}
                            title="Filter by due date"
                            style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 8px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', color: filterDueDate ? '#0f172a' : '#64748b' }}
                        />
                        {filterDueDate && (
                            <button
                                type="button"
                                onClick={() => handleDueDateChange('')}
                                title="Clear due date filter"
                                style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <select value={filterPrio} onChange={e => handlePrioChange(e.target.value)} style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                        <option value="">All Priorities</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={filterClassification} onChange={e => handleClassificationChange(e.target.value)} style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                        <option value="">All Classifications</option>
                        <option value="routine">Routine Daily</option>
                        <option value="special">Special Task</option>
                    </select>
                    <select value={filterAssignee} onChange={e => handleAssigneeChange(e.target.value)} style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                        <option value="">All Assignees</option>
                        {teamMembers.map(m => <option key={m.accountId} value={m.accountId}>{m.employeeName}</option>)}
                    </select>
                </> : undefined}
                actionButton={tab === 'active' ? { label: 'New Task', icon: <Plus size={14} />, onClick: onNewTask } : undefined}
                headers={['', '#', 'Task', 'Assignee', 'Priority', 'Due Date', 'Status', '']}
                loading={false}
                emptyMessage="No tasks found."
                emptyIcon={<Package size={20} />}
                totalRecords={serverPagination?.totalRecords ?? filtered.length}
                currentPage={serverPagination?.currentPage ?? page}
                totalPages={totalPages}
                onPageChange={serverPagination?.onPageChange ?? handlePageChange}
                pageSize={serverPagination?.pageSize}
                pageSizeOptions={serverPagination?.onPageSizeChange ? [8, 15, 30, 50] : undefined}
                onPageSizeChange={serverPagination?.onPageSizeChange}
            >
                {paginated.map(t => {
                    const refDisplay = t.referenceNumber || t.id.slice(0, 8).toUpperCase();
                    const isChecked = selectedIds.has(t.id);
                    return (
                        <tr key={t.id} onClick={() => tab !== 'bin' ? onView(t.id) : null} style={{ cursor: tab !== 'bin' ? 'pointer' : 'default', opacity: tab === 'bin' ? 0.75 : 1 }}>
                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(t.id)} style={{ cursor: 'pointer' }} />
                            </td>
                            <td style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>#{refDisplay}</td>
                            <td style={{ fontWeight: 600, color: tab === 'bin' ? '#94a3b8' : '#0f172a', textDecoration: tab === 'bin' ? 'line-through' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span>{t.name}</span>
                                    {tab !== 'bin' && (
                                        <span title="AI Insights available — click to view" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--teal, #00A99D)', cursor: 'help' }}>
                                             <Brain size={13} />
                                        </span>
                                    )}
                                    {t.classification && tab !== 'bin' && (
                                        <span
                                            style={{
                                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                                background: t.classification === 'special' ? 'rgba(67,24,255,0.08)' : 'rgba(5,150,105,0.08)',
                                                color: t.classification === 'special' ? '#4318FF' : '#059669',
                                                whiteSpace: 'nowrap', letterSpacing: '0.03em'
                                            }}
                                        >
                                            {t.classification === 'special' ? 'SPECIAL' : 'ROUTINE'}
                                        </span>
                                    )}
                                    {t.isConfidential && tab !== 'bin' && (
                                        <span
                                            title="Confidential — only Coordinators and Manager can view"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: 'var(--status-failed, #ee5d50)', background: 'rgba(238, 93, 80, 0.08)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}
                                        >
                                            <Lock size={9} /> CONFIDENTIAL
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td>{t.assignee ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AssigneeAvatar name={t.assignee.name} /><span style={{ fontSize: 13 }}>{t.assignee.name}</span></div> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                            <td><PriorityBadge p={t.priority} /></td>
                            <td><DueLabel date={t.dueDate} isSLALocked={t.isSLALocked} /></td>
                            <td>
                                <StatusBadge status={t.status} size="sm" />
                            </td>
                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                                <ActionsDropdown
                                    actions={[
                                        ...(tab !== 'bin' ? [
                                            { label: 'View Details', icon: <Eye size={12} />, onClick: () => onView(t.id) },
                                            { label: 'Edit', icon: <Pencil size={12} />, onClick: () => onEdit(t.id) },
                                            { label: 'Archive', icon: <Trash2 size={12} />, onClick: () => { onArchive([t.id]); setSelectedIds(p => { const n = new Set(p); n.delete(t.id); return n; }); }, variant: 'danger' as const },
                                        ] as const : [
                                            { label: 'Restore', icon: <CheckCircle2 size={12} />, onClick: () => onRestore?.([t.id]), variant: 'success' as const },
                                            { label: 'Delete Permanently', icon: <Trash2 size={12} />, onClick: () => { onDelete([t.id]); setSelectedIds(p => { const n = new Set(p); n.delete(t.id); return n; }); }, variant: 'danger' as const },
                                        ] as const),
                                    ]}
                                />
                            </td>
                        </tr>
                    );
                })}
            </DataTable>
            {selectedIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#f8fafc', border: '0.5px solid #e2e8f0', borderRadius: 8, marginTop: 12, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedIds.size} selected</span>
                    {tab !== 'bin' && <button onClick={() => { onMarkDone([...selectedIds]); setSelectedIds(new Set()); }} style={{ padding: '4px 10px', borderRadius: 6, border: '0.5px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer' }}>Mark done</button>}
                    {tab !== 'bin' && <button onClick={() => { onArchive([...selectedIds]); setSelectedIds(new Set()); }} style={{ padding: '4px 10px', borderRadius: 6, border: '0.5px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#d97706' }}>Archive</button>}
                    {tab === 'bin' && onRestore && <button onClick={() => { onRestore([...selectedIds]); setSelectedIds(new Set()); }} style={{ padding: '4px 10px', borderRadius: 6, border: '0.5px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer' }}>Restore</button>}
                    <button onClick={() => { onDelete([...selectedIds]); setSelectedIds(new Set()); }} style={{ padding: '4px 10px', borderRadius: 6, border: '0.5px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
                </div>
            )}
        </div>
    );
}