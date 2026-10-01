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
    HelpCircle
} from 'lucide-react';
import ConfirmationModal from '../../../components/ConfirmationModal/ConfirmationModal';
import { TaskTemplateItem, ChecklistItem, QueueEmployee, DeployResult, AssignmentMode } from './types';

interface TaskTemplateEditorProps {
    template: TaskTemplateItem | null;
    employees: QueueEmployee[];
    onSave: (templateData: Partial<TaskTemplateItem>, isNew: boolean) => Promise<void>;
    onDiscard: () => void;
    onDeployNow: (templateData: Partial<TaskTemplateItem>) => Promise<DeployResult>;
    isSaving?: boolean;
}

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'] as const;

export const TaskTemplateEditor: React.FC<TaskTemplateEditorProps> = ({
    template,
    employees,
    onSave,
    onDiscard,
    onDeployNow,
    isSaving = false,
}) => {
    const isNew = !template || !template.id;

    // Form state
    const [name, setName] = useState(template?.templateName ?? '');
    const [title, setTitle] = useState(template?.defaultTitle ?? template?.templateName ?? '');
    const [description, setDescription] = useState(template?.cleanDescription ?? template?.defaultDescription ?? '');
    const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>(template?.priorityLevel ?? 'Medium');
    const [dueAfterDays, setDueAfterDays] = useState<number>(template?.dueAfterDays ?? (template?.priorityLevel === 'Urgent' ? 1 : 7));
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
        priority: template?.priorityLevel ?? 'Medium',
        dueAfterDays: template?.dueAfterDays ?? (template?.priorityLevel === 'Urgent' ? 1 : 7),
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
            assignmentMode,
            fixedAssigneeId,
            recurrenceRule,
            isActive,
            skipOffline,
            alertCoordinator,
            checklistCount: checklist.length,
        });
        return current !== initialSnapshot.current;
    }, [name, title, description, priority, dueAfterDays, assignmentMode, fixedAssigneeId, recurrenceRule, isActive, skipOffline, alertCoordinator, checklist]);

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

    // Validation
    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!name.trim()) errs.name = 'Template name is required.';
        else if (name.length > 150) errs.name = 'Template name must not exceed 150 characters.';

        if (!description.trim()) errs.description = 'Description is required.';
        else if (description.length > 2000) errs.description = 'Description must not exceed 2000 characters.';

        if (assignmentMode === 'fixed' && !fixedAssigneeId) {
            errs.fixedAssigneeId = 'Please select a designated employee for fixed assignment.';
        }

        if (dueAfterDays <= 0) {
            errs.dueAfterDays = 'Due after days must be at least 1 day.';
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

    // Sorted Queue: available active employees first ordered by least workload, then longest idle
    const sortedQueueEmployees = useMemo(() => {
        return [...employees].sort((a, b) => {
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
        const parts = nameStr.split(' ').filter(Boolean);
        if (parts.length === 0) return 'EM';
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const getAvatarBg = (nameStr: string) => {
        const colors = ['#00A99D', '#4F46E5', '#0891B2', '#059669', '#7C3AED', '#2563EB', '#EA580C'];
        let hash = 0;
        for (let i = 0; i < nameStr.length; i++) {
            hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
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

                    {/* Priority & Due After Days */}
                    <div className="tt-field-row">
                        <div className="tt-field-group">
                            <label className="tt-label">Priority Level</label>
                            <select
                                className="tt-select"
                                value={priority}
                                onChange={e => {
                                    const p = e.target.value as 'Low' | 'Medium' | 'High' | 'Urgent';
                                    setPriority(p);
                                    if (p === 'Urgent') setDueAfterDays(1);
                                    else if (dueAfterDays === 1) setDueAfterDays(7);
                                }}
                            >
                                {PRIORITY_OPTIONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        <div className="tt-field-group">
                            <label className="tt-label">
                                <span>Due after (days) <span style={{ color: 'var(--status-failed)' }}>*</span></span>
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={90}
                                className={`tt-input${errors.dueAfterDays ? ' error' : ''}`}
                                value={dueAfterDays}
                                onChange={e => setDueAfterDays(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                            {errors.dueAfterDays && <span className="tt-error-text"><AlertCircle size={12} /> {errors.dueAfterDays}</span>}
                        </div>
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
                                {employees.map(emp => (
                                    <option key={emp.userId} value={emp.userId}>
                                        {emp.fullName} ({emp.role} — {emp.availabilityStatus})
                                    </option>
                                ))}
                            </select>
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
                                Live workload rankings for fair round-robin task routing.
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
