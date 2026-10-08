import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    ArrowLeft, 
    CheckSquare, 
    GripVertical, 
    Plus, 
    Trash2, 
    Save, 
    X, 
    Loader2, 
    AlertCircle, 
    CheckCircle2, 
    Play, 
    Users, 
    User, 
    Repeat, 
    Clock, 
    ShieldCheck, 
    Sparkles, 
    HelpCircle,
    Building2
} from 'lucide-react';
import ConfirmationModal from '../../../components/ConfirmationModal/ConfirmationModal';
import { TaskTemplateItem, ChecklistItem, QueueEmployee, DeployResult, AssignmentMode, DepartmentItem } from './types';

interface TaskTemplateEditorProps {
    template: TaskTemplateItem | null;
    employees: QueueEmployee[];
    departments?: DepartmentItem[];
    onSave: (templateData: Partial<TaskTemplateItem>, isNew: boolean) => Promise<void>;
    onDiscard: () => void;
    onDeployNow: (templateData: Partial<TaskTemplateItem>) => Promise<DeployResult>;
    isSaving?: boolean;
}

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'] as const;

export const PRIORITY_SLA_CONFIG: Record<'Low' | 'Medium' | 'High' | 'Urgent', {
    minDays: number;
    maxDays: number;
    defaultDays: number;
    isLocked: boolean;
    helperText: string;
    badgeText: string;
    badgeColor: string;
    badgeBg: string;
}> = {
    Urgent: {
        minDays: 1,
        maxDays: 1,
        defaultDays: 1,
        isLocked: true,
        helperText: '🔴 Urgent SLA: Strictly locked to 24 hours (1 day) from task creation.',
        badgeText: '24h SLA Locked',
        badgeColor: '#DC2626',
        badgeBg: 'rgba(220, 38, 38, 0.1)',
    },
    High: {
        minDays: 1,
        maxDays: 2,
        defaultDays: 2,
        isLocked: false,
        helperText: '🟠 High SLA: Deadline must be 1 to 2 days maximum from creation.',
        badgeText: 'Max 2 Days SLA',
        badgeColor: '#EA580C',
        badgeBg: 'rgba(234, 88, 12, 0.1)',
    },
    Medium: {
        minDays: 1,
        maxDays: 7,
        defaultDays: 7,
        isLocked: false,
        helperText: '🟡 Medium SLA: Deadline must be within 7 days (1 week) from creation.',
        badgeText: 'Max 7 Days SLA',
        badgeColor: '#00A99D',
        badgeBg: 'rgba(0, 169, 157, 0.1)',
    },
    Low: {
        minDays: 1,
        maxDays: 14,
        defaultDays: 14,
        isLocked: false,
        helperText: '🟢 Low SLA: Flexible deadline up to 14 days from creation.',
        badgeText: 'Max 14 Days SLA',
        badgeColor: '#059669',
        badgeBg: 'rgba(5, 150, 105, 0.1)',
    },
};

export const TaskTemplateEditor: React.FC<TaskTemplateEditorProps> = ({
    template,
    employees,
    departments = [],
    onSave,
    onDiscard,
    onDeployNow,
    isSaving = false,
}) => {
    const isNew = !template || !template.id;

    // Form state
    const initialPriority = template?.priorityLevel ?? 'Medium';
    const [name, setName] = useState(template?.templateName ?? '');
    const [title, setTitle] = useState(template?.defaultTitle ?? template?.templateName ?? '');
    const [description, setDescription] = useState(template?.cleanDescription ?? template?.defaultDescription ?? '');
    const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>(initialPriority);
    const [dueAfterDays, setDueAfterDays] = useState<number>(() => {
        if (template?.dueAfterDays) {
            const config = PRIORITY_SLA_CONFIG[initialPriority];
            if (config.isLocked) return config.defaultDays;
            return Math.min(Math.max(template.dueAfterDays, config.minDays), config.maxDays);
        }
        return PRIORITY_SLA_CONFIG[initialPriority].defaultDays;
    });
    const [departmentId, setDepartmentId] = useState<string>(template?.defaultDepartmentId ?? '');
    const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(template?.assignmentMode ?? 'round-robin');
    const [fixedAssigneeId, setFixedAssigneeId] = useState<string>(template?.defaultAssigneeId ?? '');
    const [recurrenceRule, setRecurrenceRule] = useState<'Daily' | 'Weekly' | 'Monthly'>(template?.recurrenceRule ?? 'Daily');
    const [recurrenceStartDate, setRecurrenceStartDate] = useState<string>(
        template?.recurrenceStartDate ? String(template.recurrenceStartDate).substring(0, 10) : new Date().toISOString().substring(0, 10)
    );
    const [isActive, setIsActive] = useState<boolean>(template?.isActive ?? true);
    const [skipOffline, setSkipOffline] = useState<boolean>(template?.skipOffline ?? true);
    const [alertCoordinator, setAlertCoordinator] = useState<boolean>(template?.alertCoordinator ?? true);

    // Checklist state
    const [checklist, setChecklist] = useState<ChecklistItem[]>(
        template?.checklist && template.checklist.length > 0 
            ? template.checklist 
            : [
                { id: '1', text: 'Verify package details and tracking numbers', required: true },
                { id: '2', text: 'Complete status log and update system records', required: false },
            ]
    );

    // UI state
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
    const [highlightedUserId, setHighlightedUserId] = useState<string | null>(null);

    // Initial snapshot for change detection
    const initialSnapshot = useRef(JSON.stringify({
        name: template?.templateName ?? '',
        title: template?.defaultTitle ?? '',
        description: template?.cleanDescription ?? template?.defaultDescription ?? '',
        priority: initialPriority,
        dueAfterDays: template?.dueAfterDays 
            ? (PRIORITY_SLA_CONFIG[initialPriority].isLocked 
                ? PRIORITY_SLA_CONFIG[initialPriority].defaultDays 
                : Math.min(Math.max(template.dueAfterDays, PRIORITY_SLA_CONFIG[initialPriority].minDays), PRIORITY_SLA_CONFIG[initialPriority].maxDays))
            : PRIORITY_SLA_CONFIG[initialPriority].defaultDays,
        departmentId: template?.defaultDepartmentId ?? '',
        assignmentMode: template?.assignmentMode ?? 'round-robin',
        fixedAssigneeId: template?.defaultAssigneeId ?? '',
        recurrenceRule: template?.recurrenceRule ?? 'Daily',
        isActive: template?.isActive ?? true,
        skipOffline: template?.skipOffline ?? true,
        alertCoordinator: template?.alertCoordinator ?? true,
        checklistCount: template?.checklist?.length ?? 0,
    }));

    const isDirty = useMemo(() => {
        const current = JSON.stringify({
            name,
            title,
            description,
            priority,
            dueAfterDays,
            departmentId,
            assignmentMode,
            fixedAssigneeId,
            recurrenceRule,
            isActive,
            skipOffline,
            alertCoordinator,
            checklistCount: checklist.length,
        });
        return current !== initialSnapshot.current;
    }, [name, title, description, priority, dueAfterDays, departmentId, assignmentMode, fixedAssigneeId, recurrenceRule, isActive, skipOffline, alertCoordinator, checklist]);

    // Filter employees by selected responsible department
    const filteredEmployees = useMemo(() => {
        if (!departmentId) return employees;
        const selectedDept = departments?.find(d => d.id === departmentId);
        return employees.filter(e => {
            if (e.departmentId && e.departmentId === departmentId) return true;
            if (selectedDept && e.department && e.department.toLowerCase() === selectedDept.name.toLowerCase()) return true;
            return false;
        });
    }, [employees, departmentId, departments]);

    // Handle name change (auto sync default title if user hasn't modified title separately)
    const handleNameChange = (val: string) => {
        setName(val);
        if (isNew && (!title || title === name)) {
            setTitle(val);
        }
        if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
    };

    // Checklist handlers
    const handleAddChecklistItem = () => {
        setChecklist(prev => [
            ...prev,
            { id: Date.now().toString(), text: '', required: false }
        ]);
    };

    const handleUpdateChecklistItem = (id: string, text: string) => {
        setChecklist(prev => prev.map(item => item.id === id ? { ...item, text } : item));
    };

    const handleToggleChecklistRequired = (id: string) => {
        setChecklist(prev => prev.map(item => item.id === id ? { ...item, required: !item.required } : item));
    };

    const handleDeleteChecklistItem = (id: string) => {
        setChecklist(prev => prev.filter(item => item.id !== id));
    };

    // Drag-and-drop reordering for checklist
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleDragStart = (index: number) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            const listCopy = [...checklist];
            const draggedItemContent = listCopy[dragItem.current];
            listCopy.splice(dragItem.current, 1);
            listCopy.splice(dragOverItem.current, 0, draggedItemContent);
            setChecklist(listCopy);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    // Handle priority change with SLA enforcement
    const handlePriorityChange = (newPriority: 'Low' | 'Medium' | 'High' | 'Urgent') => {
        setPriority(newPriority);
        const config = PRIORITY_SLA_CONFIG[newPriority];
        if (config.isLocked) {
            setDueAfterDays(config.defaultDays);
        } else {
            // Adjust dueAfterDays if it exceeds the new priority SLA limits
            if (dueAfterDays > config.maxDays || dueAfterDays < config.minDays) {
                setDueAfterDays(config.defaultDays);
            }
        }
        if (errors.dueAfterDays) {
            setErrors(prev => ({ ...prev, dueAfterDays: '' }));
        }
    };

    // Validation
    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!name.trim()) errs.name = 'Template name is required.';
        else if (name.length > 150) errs.name = 'Template name must not exceed 150 characters.';

        if (!description.trim()) errs.description = 'Description is required.';
        else if (description.length > 2000) errs.description = 'Description must not exceed 2000 characters.';

        if (assignmentMode === 'fixed') {
            if (!fixedAssigneeId) {
                errs.fixedAssigneeId = 'Please select a designated employee for fixed assignment.';
            } else if (departmentId) {
                const isMatch = filteredEmployees.some(e => e.userId === fixedAssigneeId);
                if (!isMatch) {
                    errs.fixedAssigneeId = 'Selected employee does not belong to the chosen department.';
                }
            }
        }

        const slaConfig = PRIORITY_SLA_CONFIG[priority];
        if (slaConfig.isLocked && dueAfterDays !== slaConfig.defaultDays) {
            errs.dueAfterDays = `Urgent priority SLA is strictly locked to 24 hours (${slaConfig.defaultDays} day).`;
        } else if (dueAfterDays < slaConfig.minDays || dueAfterDays > slaConfig.maxDays) {
            errs.dueAfterDays = `For ${priority} priority, deadline must be between ${slaConfig.minDays} and ${slaConfig.maxDays} day(s).`;
        }

        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // Save handler
    const handleSaveClick = async () => {
        if (!validate() || isSaving) return;

        const cleanChecklist = checklist.filter(c => c.text.trim().length > 0);
        
        // Encode checklist into full description text so standard task viewers render it
        let fullDescription = description.trim();
        if (cleanChecklist.length > 0) {
            fullDescription += '\n\n### Checklist\n' + cleanChecklist
                .map(c => `- [ ] ${c.required ? '[Required] ' : ''}${c.text.trim()}`)
                .join('\n');
        }

        const selectedEmployee = employees.find(e => e.userId === fixedAssigneeId);
        const selectedDept = departments?.find(d => d.id === departmentId);

        await onSave({
            id: template?.id,
            templateName: name.trim(),
            defaultTitle: (title || name).trim(),
            defaultDescription: fullDescription,
            cleanDescription: description.trim(),
            priorityLevel: priority,
            dueAfterDays,
            recurrenceRule,
            recurrenceStartDate,
            assignmentMode,
            defaultAssigneeId: assignmentMode === 'fixed' ? fixedAssigneeId : null,
            defaultAssigneeName: assignmentMode === 'fixed' ? selectedEmployee?.fullName ?? null : null,
            defaultDepartmentId: departmentId || null,
            defaultDepartmentName: selectedDept?.name || null,
            checklist: cleanChecklist,
            skipOffline,
            alertCoordinator,
            isActive,
        }, isNew);
    };

    // Discard handler
    const handleDiscardClick = () => {
        if (isDirty) {
            setShowDiscardConfirm(true);
        } else {
            onDiscard();
        }
    };

    // Deploy Now / Create Task from Template
    const handleDeployClick = async () => {
        if (!validate() || isDeploying) return;
        setIsDeploying(true);
        setDeployResult(null);
        setHighlightedUserId(null);

        try {
            const cleanChecklist = checklist.filter(c => c.text.trim().length > 0);
            let fullDescription = description.trim();
            if (cleanChecklist.length > 0) {
                fullDescription += '\n\n### Checklist\n' + cleanChecklist
                    .map(c => `- [ ] ${c.required ? '[Required] ' : ''}${c.text.trim()}`)
                    .join('\n');
            }

            const result = await onDeployNow({
                id: template?.id,
                templateName: name.trim(),
                defaultTitle: (title || name).trim(),
                defaultDescription: fullDescription,
                cleanDescription: description.trim(),
                priorityLevel: priority,
                dueAfterDays,
                recurrenceRule,
                assignmentMode,
                defaultAssigneeId: assignmentMode === 'fixed' ? fixedAssigneeId : null,
                defaultDepartmentId: departmentId || null,
                checklist: cleanChecklist,
                skipOffline,
                alertCoordinator,
                isActive,
            });

            setDeployResult(result);
            if (result.assignedUserId) {
                setHighlightedUserId(result.assignedUserId);
            }
        } finally {
            setIsDeploying(false);
        }
    };

    // Sorted Queue: available active employees in department ordered by least workload, then longest idle
    const sortedQueueEmployees = useMemo(() => {
        return [...filteredEmployees].sort((a, b) => {
            // Active online comes first
            const aActive = a.availabilityStatus === 'Active';
            const bActive = b.availabilityStatus === 'Active';
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;

            // Least tasks
            if (a.openTasks !== b.openTasks) {
                return a.openTasks - b.openTasks;
            }

            // Longest idle time tie-break
            const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
            const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
            return aTime - bTime;
        });
    }, [employees]);

    const getInitials = (nameStr: string) => {
        const parts = (nameStr || '').split(' ').filter(Boolean);
        if (parts.length === 0) return 'EM';
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const getAvatarBg = (nameStr: string) => {
        const colors = ['#00A99D', '#4F46E5', '#0891B2', '#059669', '#7C3AED', '#2563EB', '#EA580C'];
        let hash = 0;
        const str = nameStr || '';
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const getStatusPill = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'active' || s === 'online') {
            return <span className="tt-status-pill online"><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }}></span> Online</span>;
        }
        if (s.includes('leave')) {
            return <span className="tt-status-pill onleave"><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }}></span> On leave</span>;
        }
        return <span className="tt-status-pill offline"><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }}></span> Offline</span>;
    };

    return (
        <div className="tt-editor-container">
            {/* Topbar / Breadcrumb */}
            <div className="tt-editor-topbar">
                <div className="tt-breadcrumb">
                    <button type="button" className="tt-breadcrumb-link" onClick={handleDiscardClick}>
                        <ArrowLeft size={16} /> Task templates
                    </button>
                    <span className="tt-breadcrumb-sep">/</span>
                    <span className="tt-breadcrumb-current">
                        {name || (isNew ? 'New template' : 'Untitled template')}
                    </span>
                    <span 
                        className="tt-badge" 
                        style={{
                            background: isActive ? 'rgba(5, 150, 105, 0.1)' : 'rgba(148, 163, 184, 0.15)',
                            color: isActive ? '#059669' : '#64748B',
                            marginLeft: 6
                        }}
                    >
                        {isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>

                <div className="tt-toggle-wrap">
                    <span className="tt-toggle-label">Active status:</span>
                    <label className="tt-switch" aria-label="Toggle active template state">
                        <input
                            type="checkbox"
                            checked={isActive}
                            onChange={e => setIsActive(e.target.checked)}
                            aria-label="Active status switch"
                        />
                        <span className="tt-slider"></span>
                    </label>
                </div>
            </div>

            {/* 2-Column Responsive Layout */}
            <div className="tt-editor-layout">
                {/* ── Left Column: Configuration ── */}
                <div className="tt-editor-card">
                    <div className="tt-editor-card-header">
                        <div>
                            <h2 className="tt-editor-card-title">
                                <Sparkles size={18} color="var(--primary)" /> Template Configuration
                            </h2>
                            <p className="tt-editor-card-sub">
                                Configure task metadata, SLA priority, recurrence, and checklist.
                            </p>
                        </div>
                    </div>

                    {/* Template Name */}
                    <div className="tt-field-group">
                        <label className="tt-label">
                            <span>Template Name <span style={{ color: 'var(--status-failed)' }}>*</span></span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name.length}/150</span>
                        </label>
                        <input
                            type="text"
                            className={`tt-input${errors.name ? ' error' : ''}`}
                            placeholder="e.g. Daily Warehouse Parcel Sorting"
                            value={name}
                            onChange={e => handleNameChange(e.target.value)}
                            maxLength={150}
                        />
                        {errors.name && <span className="tt-error-text"><AlertCircle size={12} /> {errors.name}</span>}
                    </div>

                    {/* Priority & Due After Days with SLA rules */}
                    <div className="tt-field-row">
                        <div className="tt-field-group">
                            <label className="tt-label">
                                <span>Priority Level</span>
                                <span 
                                    className="tt-badge" 
                                    style={{ 
                                        background: PRIORITY_SLA_CONFIG[priority].badgeBg, 
                                        color: PRIORITY_SLA_CONFIG[priority].badgeColor,
                                        fontSize: 10,
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        fontWeight: 700
                                    }}
                                >
                                    {PRIORITY_SLA_CONFIG[priority].badgeText}
                                </span>
                            </label>
                            <select
                                className="tt-select"
                                value={priority}
                                onChange={e => handlePriorityChange(e.target.value as 'Low' | 'Medium' | 'High' | 'Urgent')}
                            >
                                {PRIORITY_OPTIONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        <div className="tt-field-group">
                            <label className="tt-label">
                                <span>Due after (days) <span style={{ color: 'var(--status-failed)' }}>*</span></span>
                                {PRIORITY_SLA_CONFIG[priority].isLocked ? (
                                    <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>24h Locked</span>
                                ) : (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max {PRIORITY_SLA_CONFIG[priority].maxDays} {PRIORITY_SLA_CONFIG[priority].maxDays === 1 ? 'day' : 'days'}</span>
                                )}
                            </label>
                            <input
                                type="number"
                                min={PRIORITY_SLA_CONFIG[priority].minDays}
                                max={PRIORITY_SLA_CONFIG[priority].maxDays}
                                disabled={PRIORITY_SLA_CONFIG[priority].isLocked}
                                className={`tt-input${errors.dueAfterDays ? ' error' : ''}${PRIORITY_SLA_CONFIG[priority].isLocked ? ' tt-input-locked' : ''}`}
                                value={dueAfterDays}
                                onChange={e => {
                                    const val = parseInt(e.target.value) || PRIORITY_SLA_CONFIG[priority].minDays;
                                    setDueAfterDays(Math.min(Math.max(val, PRIORITY_SLA_CONFIG[priority].minDays), PRIORITY_SLA_CONFIG[priority].maxDays));
                                    if (errors.dueAfterDays) {
                                        setErrors(prev => ({ ...prev, dueAfterDays: '' }));
                                    }
                                }}
                            />
                            {errors.dueAfterDays && <span className="tt-error-text"><AlertCircle size={12} /> {errors.dueAfterDays}</span>}
                        </div>
                    </div>

                    {/* SLA Helper Info Banner */}
                    <div 
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            background: PRIORITY_SLA_CONFIG[priority].badgeBg,
                            border: `1px solid ${PRIORITY_SLA_CONFIG[priority].badgeColor}33`,
                            borderRadius: 8,
                            fontSize: 12,
                            color: PRIORITY_SLA_CONFIG[priority].badgeColor,
                            fontWeight: 600,
                            marginBottom: 16
                        }}
                    >
                        <Clock size={14} />
                        <span>{PRIORITY_SLA_CONFIG[priority].helperText}</span>
                    </div>

                    {/* Description */}
                    <div className="tt-field-group">
                        <label className="tt-label">
                            <span>Task Description <span style={{ color: 'var(--status-failed)' }}>*</span></span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{description.length}/2000</span>
                        </label>
                        <textarea
                            rows={3}
                            className={`tt-textarea${errors.description ? ' error' : ''}`}
                            placeholder="Provide standard operating instructions for this recurring task..."
                            value={description}
                            onChange={e => {
                                setDescription(e.target.value);
                                if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
                            }}
                            maxLength={2000}
                        />
                        {errors.description && <span className="tt-error-text"><AlertCircle size={12} /> {errors.description}</span>}
                    </div>

                    {/* Checklist */}
                    <div className="tt-field-group">
                        <label className="tt-label" style={{ marginBottom: 4 }}>
                            <span>Interactive Checklist ({checklist.length})</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Drag to reorder items</span>
                        </label>
                        <div className="tt-checklist-wrap">
                            {checklist.map((item, index) => (
                                <div
                                    key={item.id}
                                    className="tt-checklist-item"
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragEnter={() => handleDragEnter(index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={e => e.preventDefault()}
                                >
                                    <span className="tt-drag-handle" title="Drag to reorder">
                                        <GripVertical size={14} />
                                    </span>
                                    <CheckSquare size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                                    <input
                                        type="text"
                                        className="tt-checklist-input"
                                        placeholder="Checklist step description..."
                                        value={item.text}
                                        onChange={e => handleUpdateChecklistItem(item.id, e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className={`tt-req-tag ${item.required ? 'required' : 'optional'}`}
                                        onClick={() => handleToggleChecklistRequired(item.id)}
                                        title="Click to toggle Required / Optional status"
                                    >
                                        {item.required ? 'Required' : 'Optional'}
                                    </button>
                                    <button
                                        type="button"
                                        className="tt-delete-item-btn"
                                        onClick={() => handleDeleteChecklistItem(item.id)}
                                        title="Remove step"
                                        aria-label="Remove checklist item"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}

                            <button
                                type="button"
                                className="tt-add-item-btn"
                                onClick={handleAddChecklistItem}
                            >
                                <Plus size={14} /> Add checklist item
                            </button>
                        </div>
                    </div>

                    {/* Responsible Department */}
                    <div className="tt-field-group">
                        <label className="tt-label">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Building2 size={14} color="var(--primary)" /> Responsible Department
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Target department scope</span>
                        </label>
                        <select
                            className="tt-select"
                            value={departmentId}
                            onChange={e => {
                                const newDeptId = e.target.value;
                                setDepartmentId(newDeptId);
                                if (newDeptId && fixedAssigneeId) {
                                    const selectedDept = departments.find(d => d.id === newDeptId);
                                    const currentAssignee = employees.find(emp => emp.userId === fixedAssigneeId);
                                    const belongsToNewDept = currentAssignee && (
                                        currentAssignee.departmentId === newDeptId || 
                                        (selectedDept && currentAssignee.department?.toLowerCase() === selectedDept.name.toLowerCase())
                                    );
                                    if (!belongsToNewDept) {
                                        setFixedAssigneeId('');
                                    }
                                }
                            }}
                        >
                            <option value="">All / Any Department (No department restriction)</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>
                                    {dept.name}
                                </option>
                            ))}
                        </select>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                            {departmentId 
                                ? `Tasks generated from this template can only be assigned to employees in the ${departments.find(d => d.id === departmentId)?.name || 'selected'} department.` 
                                : 'Tasks generated from this template can be assigned across all departments.'}
                        </span>
                    </div>

                    {/* Assignment Mode */}
                    <div className="tt-field-group">
                        <label className="tt-label">Assignment Mode</label>
                        <select
                            className="tt-select"
                            value={assignmentMode}
                            onChange={e => setAssignmentMode(e.target.value as AssignmentMode)}
                        >
                            <option value="round-robin">Round-robin (Fair least-task workload distribution)</option>
                            <option value="fixed">Fixed employee (Always assign to specific person)</option>
                            <option value="manual">Manual / Unassigned (Coordinator assigns when deployed)</option>
                        </select>
                    </div>

                    {/* Fixed Employee Picker — only shown when "fixed" is selected */}
                    {assignmentMode === 'fixed' && (
                        <div className="tt-field-group" style={{ animation: 'ttFadeIn 0.2s ease-out' }}>
                            <label className="tt-label">
                                <span>Designated Employee <span style={{ color: 'var(--status-failed)' }}>*</span></span>
                                {departmentId && (
                                    <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                                        Filtered: {departments.find(d => d.id === departmentId)?.name || 'Department'}
                                    </span>
                                )}
                            </label>
                            <select
                                className={`tt-select${errors.fixedAssigneeId ? ' error' : ''}`}
                                value={fixedAssigneeId}
                                onChange={e => {
                                    setFixedAssigneeId(e.target.value);
                                    if (errors.fixedAssigneeId) setErrors(prev => ({ ...prev, fixedAssigneeId: '' }));
                                }}
                            >
                                <option value="">Select an employee...</option>
                                {filteredEmployees.map(emp => (
                                    <option key={emp.userId} value={emp.userId}>
                                        {emp.fullName} ({emp.role} • {emp.department} • {emp.availabilityStatus})
                                    </option>
                                ))}
                            </select>
                            {departmentId && filteredEmployees.length === 0 && (
                                <span style={{ fontSize: 11, color: 'var(--status-failed, #DC2626)', marginTop: 4, display: 'block' }}>
                                    No active assignable employees found in the selected department.
                                </span>
                            )}
                            {errors.fixedAssigneeId && <span className="tt-error-text"><AlertCircle size={12} /> {errors.fixedAssigneeId}</span>}
                        </div>
                    )}

                    {/* Feature Checkboxes */}
                    <div style={{ marginTop: 16 }}>
                        <label className="tt-checkbox-row">
                            <input
                                type="checkbox"
                                checked={skipOffline}
                                onChange={e => setSkipOffline(e.target.checked)}
                            />
                            <div className="tt-checkbox-content">
                                <span className="tt-checkbox-title">Skip anyone offline or on leave</span>
                                <span className="tt-checkbox-desc">Only route recurring tasks to employees with Active availability status.</span>
                            </div>
                        </label>

                        <label className="tt-checkbox-row">
                            <input
                                type="checkbox"
                                checked={alertCoordinator}
                                onChange={e => setAlertCoordinator(e.target.checked)}
                            />
                            <div className="tt-checkbox-content">
                                <span className="tt-checkbox-title">Alert Coordinator if nobody is available</span>
                                <span className="tt-checkbox-desc">Send immediate in-app notifications if all candidate employees are unavailable.</span>
                            </div>
                        </label>
                    </div>

                    {/* Footer Buttons */}
                    <div className="tt-editor-actions">
                        <button
                            type="button"
                            className="tt-primary-btn"
                            onClick={handleSaveClick}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <><Loader2 size={15} className="spin" /> Saving template…</>
                            ) : (
                                <><Save size={15} /> Save template</>
                            )}
                        </button>
                        <button
                            type="button"
                            className="tt-secondary-btn"
                            onClick={handleDiscardClick}
                            disabled={isSaving}
                        >
                            Discard
                        </button>
                    </div>
                </div>

                {/* ── Right Column: Assignment Queue ── */}
                <div className="tt-editor-card">
                    <div className="tt-editor-card-header">
                        <div>
                            <h2 className="tt-editor-card-title">
                                <Users size={18} color="var(--primary)" /> Assignment Queue
                            </h2>
                            <p className="tt-editor-card-sub">
                                {departmentId
                                    ? `Live workload rankings for ${departments.find(d => d.id === departmentId)?.name || 'selected department'}.`
                                    : 'Live workload rankings for fair round-robin task routing across all departments.'}
                            </p>
                        </div>
                    </div>

                    {/* Quick Deploy Banner Result */}
                    {deployResult && (
                        <div className={`tt-deploy-banner ${deployResult.unassigned ? 'warning' : 'success'}`}>
                            {deployResult.unassigned ? (
                                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            ) : (
                                <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            )}
                            <div>
                                <strong>{deployResult.unassigned ? 'Task Created as Unassigned' : 'Task Assigned Successfully'}</strong>
                                <p style={{ margin: '3px 0 0', fontSize: 12 }}>{deployResult.reason}</p>
                            </div>
                        </div>
                    )}

                    {/* Deploy Now Button */}
                    <div style={{ marginBottom: 16 }}>
                        <button
                            type="button"
                            className="tt-primary-btn"
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleDeployClick}
                            disabled={isDeploying || isSaving}
                        >
                            {isDeploying ? (
                                <><Loader2 size={15} className="spin" /> Deploying task from template…</>
                            ) : (
                                <><Play size={15} /> Create task from template</>
                            )}
                        </button>
                    </div>

                    {/* Live Employee Queue List */}
                    <div className="tt-queue-list">
                        {sortedQueueEmployees.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)' }}>
                                <Users size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
                                <p style={{ fontSize: 13, margin: 0 }}>No assignable employees loaded.</p>
                            </div>
                        ) : (
                            sortedQueueEmployees.map((emp, idx) => {
                                const isHighlighted = highlightedUserId === emp.userId;
                                return (
                                    <div
                                        key={emp.userId}
                                        className={`tt-queue-row${isHighlighted ? ' highlighted' : ''}`}
                                    >
                                        <div className="tt-queue-user-info">
                                            <div
                                                className="tt-queue-avatar"
                                                style={{ background: getAvatarBg(emp.fullName) }}
                                            >
                                                {getInitials(emp.fullName)}
                                            </div>
                                            <div className="tt-queue-details">
                                                <div className="tt-queue-name" title={emp.fullName}>
                                                    {idx + 1}. {emp.fullName}
                                                </div>
                                                <div className="tt-queue-sub">
                                                    <span>{emp.role}</span>
                                                    <span>•</span>
                                                    <span>{emp.openTasks} {emp.openTasks === 1 ? 'open task' : 'open tasks'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="tt-queue-metrics">
                                            {getStatusPill(emp.availabilityStatus)}
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                Last: {emp.lastAssignedText}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Discard Confirmation Modal */}
            <ConfirmationModal
                isOpen={showDiscardConfirm}
                variant="warning"
                title="Discard Unsaved Changes?"
                description="You have unsaved changes in this task template. If you leave now, all your modifications will be lost."
                confirmLabel="Discard Changes"
                cancelLabel="Keep Editing"
                onConfirm={() => {
                    setShowDiscardConfirm(false);
                    onDiscard();
                }}
                onCancel={() => setShowDiscardConfirm(false)}
            />
        </div>
    );
};
