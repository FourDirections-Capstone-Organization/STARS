import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Target,
    CheckCircle2,
    Clock,
    AlertCircle,
    Plus,
    Trash2,
    Calendar,
    Edit3,
    Save,
    RotateCcw,
    Loader2,
    CheckSquare,
    Square,
    AlertTriangle,
    Sparkles,
    User,
    Check,
    X,
    ChevronDown,
    ChevronRight,
    ExternalLink
} from 'lucide-react';
import {
    DevelopmentPlanItemDTO,
    CreateDevelopmentPlanItemDTO,
    AiRecommendationDTO,
    EmployeeReviewScoreDTO
} from './types';
import {
    fetchDevelopmentPlan,
    createDevelopmentPlan,
    updateDevelopmentPlanItem,
    fetchEmployeeDevelopmentPlan,
    fetchAiRecommendation
} from '../../../services/performanceEvaluationService';
import { useToast } from '../../../components/Toast/Toast';

export interface DevelopmentPlanPanelProps {
    reviewId: string;
    employeeId: string;
    employeeName?: string;
    isManager?: boolean;
    aiRecommendation?: AiRecommendationDTO | null;
    employees?: EmployeeReviewScoreDTO[];
    onEmployeeChange?: (employeeId: string) => void;
    onPlanUpdated?: () => void;
}

export const DevelopmentPlanPanel: React.FC<DevelopmentPlanPanelProps> = ({
    reviewId,
    employeeId,
    employeeName,
    isManager: isManagerProp,
    aiRecommendation: aiRecProp,
    employees,
    onEmployeeChange,
    onPlanUpdated
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {}, info: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error, info: (t as any).info || t.success };
        }
    } catch {
        // Fallback outside ToastProvider
    }
    const { success, error, info } = toastMethods;

    // Detect role
    const currentUserRole = localStorage.getItem('userRole') || localStorage.getItem('role') || 'Manager';
    const isManager = isManagerProp !== undefined
        ? isManagerProp
        : (currentUserRole === 'Manager' || currentUserRole === 'SystemAdmin' || currentUserRole === 'Admin');

    const [items, setItems] = useState<DevelopmentPlanItemDTO[]>([]);
    const [priorOpenItems, setPriorOpenItems] = useState<DevelopmentPlanItemDTO[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [aiRec, setAiRec] = useState<AiRecommendationDTO | null>(aiRecProp || null);

    // Plan creation modal / builder state
    const [isCreatingPlan, setIsCreatingPlan] = useState<boolean>(false);
    const [newPlanItems, setNewPlanItems] = useState<CreateDevelopmentPlanItemDTO[]>([
        { description: '', successMeasure: '', timeframe: '30 Days', targetCompletionDate: '', managerNotes: '' }
    ]);
    const [isSubmittingPlan, setIsSubmittingPlan] = useState<boolean>(false);

    // Editing single item state (item id -> edit buffer)
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editDescription, setEditDescription] = useState<string>('');
    const [editSuccessMeasure, setEditSuccessMeasure] = useState<string>('');
    const [editTimeframe, setEditTimeframe] = useState<string>('');
    const [editTargetDate, setEditTargetDate] = useState<string>('');
    const [editManagerNotes, setEditManagerNotes] = useState<string>('');
    const [editEmployeeNotes, setEditEmployeeNotes] = useState<string>('');
    const [isUpdatingItem, setIsUpdatingItem] = useState<boolean>(false);

    // Load AI recommendation if not supplied via prop
    useEffect(() => {
        if (aiRecProp) {
            setAiRec(aiRecProp);
            return;
        }
        if (reviewId && employeeId) {
            fetchAiRecommendation(reviewId, employeeId)
                .then(rec => setAiRec(rec))
                .catch(() => setAiRec(null));
        }
    }, [reviewId, employeeId, aiRecProp]);

    // Ensure action items are parsed even if raw JSON was provided
    const resolvedAiRec = useMemo(() => {
        if (!aiRec) return null;
        if (aiRec.actionItems && aiRec.actionItems.length > 0) return aiRec;
        try {
            return {
                ...aiRec,
                actionItems: aiRec.actionItemsJson ? JSON.parse(aiRec.actionItemsJson) : []
            };
        } catch {
            return aiRec;
        }
    }, [aiRec]);

    // Load plan items for this review and prior cycle items
    const loadPlanData = useCallback(async () => {
        if (!reviewId || !employeeId) return;
        setLoading(true);
        try {
            // Load current review's plan items
            const currentPlan = await fetchDevelopmentPlan(reviewId, employeeId);
            setItems(currentPlan || []);

            // Load employee historical plan items across all reviews
            try {
                const allHistory = await fetchEmployeeDevelopmentPlan(employeeId);
                const priorOpen = (allHistory || []).filter(
                    h => h.reviewId !== reviewId && !h.isCompleted
                );
                setPriorOpenItems(priorOpen);
            } catch {
                setPriorOpenItems([]);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to load development plan items.';
            error(msg);
        } finally {
            setLoading(false);
        }
    }, [reviewId, employeeId, error]);

    useEffect(() => {
        setIsCreatingPlan(false);
        setEditingItemId(null);
        loadPlanData();
    }, [loadPlanData]);

    // Checkbox toggle: Mark Complete / Mark Incomplete
    const handleToggleComplete = async (item: DevelopmentPlanItemDTO) => {
        try {
            const updated = await updateDevelopmentPlanItem(item.id, {
                isCompleted: !item.isCompleted
            });

            // Update in current list if present
            setItems(prev => prev.map(i => (i.id === item.id ? updated : i)));

            // Update in prior open list if present
            setPriorOpenItems(prev => prev.filter(i => i.id !== item.id));

            if (updated.isCompleted) {
                success(`Action item "${item.description.slice(0, 30)}..." marked as complete.`);
            } else {
                info(`Action item marked as in-progress.`);
            }
            onPlanUpdated?.();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to update item completion status.';
            error(msg);
        }
    };

    // Populate plan builder from approved AI recommendation action items
    const handleImportFromAi = () => {
        const actionItems = resolvedAiRec?.actionItems;
        if (!actionItems || actionItems.length === 0) {
            info('No AI action items found to import.');
            return;
        }

        const mapped: CreateDevelopmentPlanItemDTO[] = actionItems.map(act => ({
            description: act.description,
            successMeasure: act.successMeasure || '',
            timeframe: act.timeframe || '30 Days',
            targetCompletionDate: '',
            managerNotes: `Imported from AI Recommendation (${resolvedAiRec?.status})`
        }));

        setNewPlanItems(mapped);
        success(`Imported ${mapped.length} action item(s) from AI recommendation.`);
    };

    // Add row to plan builder
    const handleAddBuilderRow = () => {
        setNewPlanItems(prev => [
            ...prev,
            { description: '', successMeasure: '', timeframe: '30 Days', targetCompletionDate: '', managerNotes: '' }
        ]);
    };

    const handleRemoveBuilderRow = (idx: number) => {
        setNewPlanItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleBuilderFieldChange = (idx: number, field: keyof CreateDevelopmentPlanItemDTO, val: string) => {
        setNewPlanItems(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [field]: val };
            return next;
        });
    };

    // Submit newly created plan items
    const handleSaveNewPlan = async () => {
        const validItems = newPlanItems.filter(i => i.description && i.description.trim().length > 0);
        if (validItems.length === 0) {
            error('Please provide a description for at least one action item.');
            return;
        }

        // Rule: cannot create if AI is pending
        if (resolvedAiRec && resolvedAiRec.status === 'Pending') {
            error('Cannot create development plan items while AI recommendation is pending review. Please approve or override it first.');
            return;
        }

        setIsSubmittingPlan(true);
        try {
            const created = await createDevelopmentPlan(reviewId, employeeId, {
                items: validItems
            });

            setItems(prev => [...prev, ...created]);
            setIsCreatingPlan(false);
            setNewPlanItems([
                { description: '', successMeasure: '', timeframe: '30 Days', targetCompletionDate: '', managerNotes: '' }
            ]);
            success(`${created.length} development plan item(s) created successfully.`);
            onPlanUpdated?.();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to create development plan items.';
            error(msg);
        } finally {
            setIsSubmittingPlan(false);
        }
    };

    // Start editing existing item
    const handleStartEdit = (item: DevelopmentPlanItemDTO) => {
        setEditingItemId(item.id);
        setEditDescription(item.description);
        setEditSuccessMeasure(item.successMeasure || '');
        setEditTimeframe(item.timeframe || '');
        setEditTargetDate(item.targetCompletionDate ? item.targetCompletionDate.slice(0, 10) : '');
        setEditManagerNotes(item.managerNotes || '');
        setEditEmployeeNotes(item.employeeNotes || '');
    };

    const handleCancelEdit = () => {
        setEditingItemId(null);
    };

    // Save edited existing item
    const handleSaveEdit = async (itemId: string) => {
        setIsUpdatingItem(true);
        try {
            const payload: any = {
                employeeNotes: editEmployeeNotes
            };

            if (isManager) {
                payload.description = editDescription;
                payload.successMeasure = editSuccessMeasure;
                payload.timeframe = editTimeframe;
                payload.targetCompletionDate = editTargetDate ? new Date(editTargetDate).toISOString() : null;
                payload.managerNotes = editManagerNotes;
            }

            const updated = await updateDevelopmentPlanItem(itemId, payload);
            setItems(prev => prev.map(i => (i.id === itemId ? updated : i)));
            setPriorOpenItems(prev => prev.map(i => (i.id === itemId ? updated : i)));
            setEditingItemId(null);
            success('Development plan item updated.');
            onPlanUpdated?.();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to update plan item.';
            error(msg);
        } finally {
            setIsUpdatingItem(false);
        }
    };

    const completedCount = items.filter(i => i.isCompleted).length;
    const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

    return (
        <div className="pe-plan-panel-container" data-testid="development-plan-panel">
            {/* Top Toolbar */}
            <div className="pe-plan-toolbar">
                <div className="pe-plan-toolbar-left">
                    <div className="pe-plan-title-wrap">
                        <Target size={22} className="pe-plan-target-icon" />
                        <div>
                            <h3 className="pe-plan-heading">
                                Development Plan {employeeName ? `for ${employeeName}` : ''}
                            </h3>
                            <p className="pe-plan-subheading">
                                Targeted growth goals, actionable milestones, and skill development tracking.
                            </p>
                        </div>
                    </div>

                    {employees && employees.length > 1 && onEmployeeChange && (
                        <div className="pe-ai-emp-select-wrap">
                            <User size={14} />
                            <select
                                className="pe-filter-select"
                                value={employeeId}
                                onChange={e => onEmployeeChange(e.target.value)}
                                data-testid="plan-employee-selector"
                            >
                                {employees.map(emp => (
                                    <option key={emp.employeeId} value={emp.employeeId}>
                                        {emp.employeeName} ({emp.employeeNumber || 'ID'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="pe-plan-toolbar-right">
                    {isManager && (
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary pe-btn-sm"
                            onClick={() => {
                                setIsCreatingPlan(true);
                                // If AI is approved and items empty, pre-fill from AI
                                if (resolvedAiRec?.status === 'Approved' && resolvedAiRec.actionItems && resolvedAiRec.actionItems.length > 0 && newPlanItems[0].description === '') {
                                    handleImportFromAi();
                                }
                            }}
                            disabled={resolvedAiRec?.status === 'Pending'}
                            title={resolvedAiRec?.status === 'Pending' ? 'Approve or override AI recommendations before creating a plan' : undefined}
                            data-testid="create-plan-btn"
                        >
                            <Plus size={14} />
                            <span>Create Plan Items</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Prior-Cycle Open Items Banner */}
            {priorOpenItems.length > 0 && (
                <div className="pe-prior-items-banner" data-testid="prior-cycle-banner">
                    <div className="pe-prior-banner-header">
                        <div className="pe-prior-banner-title">
                            <AlertTriangle size={18} className="pe-icon-amber" />
                            <strong>Prior Review Cycle Carryover:</strong>
                            <span>{priorOpenItems.length} open development action item(s) from earlier reviews</span>
                        </div>
                    </div>

                    <div className="pe-prior-items-list">
                        {priorOpenItems.map(item => (
                            <div key={item.id} className="pe-prior-item-row" data-testid="prior-cycle-item">
                                <button
                                    type="button"
                                    className="pe-checkbox-btn"
                                    onClick={() => handleToggleComplete(item)}
                                    title="Mark completed"
                                    data-testid={`prior-check-${item.id}`}
                                >
                                    <Square size={16} />
                                </button>
                                <div className="pe-prior-item-content">
                                    <span className="pe-prior-item-desc">{item.description}</span>
                                    <div className="pe-prior-item-meta">
                                        {item.reviewTitle && (
                                            <span className="pe-prior-cycle-tag">Cycle: {item.reviewTitle}</span>
                                        )}
                                        {item.targetCompletionDate && (
                                            <span className="pe-prior-due-tag">
                                                Due: {new Date(item.targetCompletionDate).toLocaleDateString()}
                                            </span>
                                        )}
                                        {item.timeframe && (
                                            <span className="pe-badge pe-badge-timeframe">{item.timeframe}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Recommendation Pending notice if manager tries to create */}
            {isManager && resolvedAiRec?.status === 'Pending' && (
                <div className="pe-ai-disabled-banner" data-testid="ai-pending-guard-banner">
                    <AlertCircle size={16} />
                    <span>
                        AI recommendation is currently Pending review. Please approve, reject, or provide a manual override in the AI Recommendations tab before creating development plan items.
                    </span>
                </div>
            )}

            {/* Plan Progress Bar */}
            {items.length > 0 && (
                <div className="pe-plan-progress-card">
                    <div className="pe-progress-header">
                        <div className="pe-progress-stats">
                            <CheckSquare size={16} className="pe-icon-green" />
                            <span>
                                Completion Progress: <strong>{completedCount} of {items.length} completed</strong>
                            </span>
                        </div>
                        <span className="pe-progress-percentage">{progressPercent}%</span>
                    </div>
                    <div className="pe-progress-track">
                        <div
                            className="pe-progress-fill"
                            style={{ width: `${progressPercent}%` }}
                            data-testid="plan-progress-fill"
                        />
                    </div>
                </div>
            )}

            {/* Create Plan Builder (Modal or expanded card) */}
            {isCreatingPlan && (
                <div className="pe-plan-builder-card" data-testid="plan-builder-card">
                    <div className="pe-builder-header">
                        <div className="pe-builder-title">
                            <Target size={18} />
                            <h4>Create Development Action Items</h4>
                        </div>
                        <div className="pe-builder-actions">
                            {resolvedAiRec && (resolvedAiRec.status === 'Approved' || resolvedAiRec.status === 'ManualOverride') && resolvedAiRec.actionItems && resolvedAiRec.actionItems.length > 0 && (
                                <button
                                    type="button"
                                    className="pe-btn pe-btn-secondary pe-btn-xs"
                                    onClick={handleImportFromAi}
                                    data-testid="import-ai-action-items-btn"
                                >
                                    <Sparkles size={12} />
                                    <span>Import AI Action Items ({resolvedAiRec.actionItems.length})</span>
                                </button>
                            )}
                            <button
                                type="button"
                                className="pe-btn pe-btn-secondary pe-btn-xs"
                                onClick={() => setIsCreatingPlan(false)}
                            >
                                <X size={12} /> Cancel
                            </button>
                        </div>
                    </div>

                    <div className="pe-builder-rows-list">
                        {newPlanItems.map((item, idx) => (
                            <div key={idx} className="pe-builder-row-box">
                                <div className="pe-builder-row-header">
                                    <span>Item #{idx + 1}</span>
                                    {newPlanItems.length > 1 && (
                                        <button
                                            type="button"
                                            className="pe-btn-trash"
                                            onClick={() => handleRemoveBuilderRow(idx)}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                                <div className="pe-builder-inputs-grid">
                                    <div className="pe-builder-field-full">
                                        <label>Action Description *</label>
                                        <input
                                            type="text"
                                            className="pe-input-field"
                                            value={item.description}
                                            onChange={e => handleBuilderFieldChange(idx, 'description', e.target.value)}
                                            placeholder="What specific skill, behavior, or operational competency needs improvement?"
                                            data-testid={`new-item-desc-${idx}`}
                                        />
                                    </div>
                                    <div>
                                        <label>Success Measure / Key Result</label>
                                        <input
                                            type="text"
                                            className="pe-input-field"
                                            value={item.successMeasure || ''}
                                            onChange={e => handleBuilderFieldChange(idx, 'successMeasure', e.target.value)}
                                            placeholder="e.g. 98% on-time delivery rate"
                                        />
                                    </div>
                                    <div>
                                        <label>Timeframe</label>
                                        <input
                                            type="text"
                                            className="pe-input-field"
                                            value={item.timeframe || ''}
                                            onChange={e => handleBuilderFieldChange(idx, 'timeframe', e.target.value)}
                                            placeholder="e.g. 30 Days, Q1"
                                        />
                                    </div>
                                    <div>
                                        <label>Target Completion Date</label>
                                        <input
                                            type="date"
                                            className="pe-input-field"
                                            value={item.targetCompletionDate || ''}
                                            onChange={e => handleBuilderFieldChange(idx, 'targetCompletionDate', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label>Manager Notes / Resources</label>
                                        <input
                                            type="text"
                                            className="pe-input-field"
                                            value={item.managerNotes || ''}
                                            onChange={e => handleBuilderFieldChange(idx, 'managerNotes', e.target.value)}
                                            placeholder="Support, training links, or mentoring guidance"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pe-builder-footer">
                        <button
                            type="button"
                            className="pe-btn pe-btn-secondary pe-btn-sm"
                            onClick={handleAddBuilderRow}
                            data-testid="add-builder-row-btn"
                        >
                            <Plus size={13} /> Add Another Item
                        </button>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                type="button"
                                className="pe-btn pe-btn-secondary pe-btn-sm"
                                onClick={() => setIsCreatingPlan(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="pe-btn pe-btn-primary pe-btn-sm"
                                onClick={handleSaveNewPlan}
                                disabled={isSubmittingPlan}
                                data-testid="save-new-plan-btn"
                            >
                                {isSubmittingPlan ? (
                                    <>
                                        <Loader2 className="pe-spinner" size={13} />
                                        <span>Saving Plan...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={13} />
                                        <span>Save Development Plan</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading state */}
            {loading ? (
                <div className="pe-loading-state" data-testid="plan-loading">
                    <Loader2 className="pe-spinner" size={28} />
                    <p>Loading development plan items...</p>
                </div>
            ) : items.length === 0 && !isCreatingPlan ? (
                /* Empty state when no items exist */
                <div className="pe-plan-empty-card" data-testid="plan-empty-card">
                    <Target size={44} className="pe-plan-empty-icon" />
                    <h4>No Development Plan Items for this Review</h4>
                    <p>
                        {isManager
                            ? 'Create action items, define target milestones, and assign measurable competencies for this cycle.'
                            : 'No development plan items have been established for this evaluation cycle yet. Your manager will outline action items soon.'}
                    </p>
                    {isManager && (
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary"
                            onClick={() => setIsCreatingPlan(true)}
                            disabled={resolvedAiRec?.status === 'Pending'}
                            data-testid="empty-create-plan-btn"
                        >
                            <Plus size={15} /> Create Development Plan
                        </button>
                    )}
                </div>
            ) : (
                /* Interactive Checklist of items */
                <div className="pe-plan-checklist" data-testid="plan-checklist">
                    {items.map((item, idx) => {
                        const isEditingThis = editingItemId === item.id;

                        return (
                            <div
                                key={item.id}
                                className={`pe-plan-item-card ${item.isCompleted ? 'pe-item-completed' : ''}`}
                                data-testid={`plan-item-${item.id}`}
                            >
                                {!isEditingThis ? (
                                    <div className="pe-plan-item-view-row">
                                        {/* Checkbox */}
                                        <button
                                            type="button"
                                            className={`pe-plan-checkbox ${item.isCompleted ? 'checked' : ''}`}
                                            onClick={() => handleToggleComplete(item)}
                                            data-testid={`toggle-complete-${item.id}`}
                                            title={item.isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
                                        >
                                            {item.isCompleted ? (
                                                <CheckCircle2 size={20} className="pe-icon-green" />
                                            ) : (
                                                <Square size={20} className="pe-icon-muted" />
                                            )}
                                        </button>

                                        {/* Content */}
                                        <div className="pe-plan-item-body">
                                            <div className="pe-plan-item-header-line">
                                                <span className={`pe-plan-item-description ${item.isCompleted ? 'line-through' : ''}`}>
                                                    {item.description}
                                                </span>
                                                <div className="pe-plan-item-badges">
                                                    <span
                                                        className={`pe-badge ${item.isCompleted ? 'pe-badge-completed' : 'pe-badge-inprogress'}`}
                                                    >
                                                        {item.isCompleted ? 'Completed' : 'In Progress'}
                                                    </span>
                                                    {item.timeframe && (
                                                        <span className="pe-badge pe-badge-timeframe">
                                                            {item.timeframe}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Details row: measure, due date, completion date */}
                                            <div className="pe-plan-item-meta-line">
                                                {item.successMeasure && (
                                                    <span className="pe-plan-meta-piece">
                                                        <strong>Target / Success Measure:</strong> {item.successMeasure}
                                                    </span>
                                                )}
                                                {item.targetCompletionDate && (
                                                    <span className="pe-plan-meta-piece">
                                                        <Calendar size={13} /> Due:{' '}
                                                        {new Date(item.targetCompletionDate).toLocaleDateString()}
                                                    </span>
                                                )}
                                                {item.isCompleted && item.completedAt && (
                                                    <span className="pe-plan-meta-piece pe-meta-completed">
                                                        <Check size={13} /> Completed:{' '}
                                                        {new Date(item.completedAt).toLocaleDateString()}
                                                        {item.completedByName ? ` by ${item.completedByName}` : ''}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Manager and Employee Notes */}
                                            {item.managerNotes && (
                                                <div className="pe-plan-note-box pe-manager-note-box">
                                                    <span className="pe-note-tag">Manager Notes:</span>
                                                    <span>{item.managerNotes}</span>
                                                </div>
                                            )}

                                            {item.employeeNotes && (
                                                <div className="pe-plan-note-box pe-employee-note-box">
                                                    <span className="pe-note-tag">Employee Notes:</span>
                                                    <span>{item.employeeNotes}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action buttons */}
                                        <div className="pe-plan-item-actions">
                                            <button
                                                type="button"
                                                className="pe-btn pe-btn-secondary pe-btn-xs"
                                                onClick={() => handleStartEdit(item)}
                                                title="Edit item details"
                                                data-testid={`edit-item-${item.id}`}
                                            >
                                                <Edit3 size={12} />
                                                <span>Edit</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Inline Edit Mode */
                                    <div className="pe-plan-item-edit-mode" data-testid={`edit-box-${item.id}`}>
                                        <div className="pe-edit-mode-header">
                                            <strong>Edit Action Item #{idx + 1}</strong>
                                            <button
                                                type="button"
                                                className="pe-btn-trash"
                                                onClick={handleCancelEdit}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        <div className="pe-edit-mode-fields">
                                            {isManager ? (
                                                <>
                                                    <div className="pe-builder-field-full">
                                                        <label>Description</label>
                                                        <input
                                                            type="text"
                                                            className="pe-input-field"
                                                            value={editDescription}
                                                            onChange={e => setEditDescription(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="pe-builder-inputs-grid">
                                                        <div>
                                                            <label>Success Measure</label>
                                                            <input
                                                                type="text"
                                                                className="pe-input-field"
                                                                value={editSuccessMeasure}
                                                                onChange={e => setEditSuccessMeasure(e.target.value)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label>Timeframe</label>
                                                            <input
                                                                type="text"
                                                                className="pe-input-field"
                                                                value={editTimeframe}
                                                                onChange={e => setEditTimeframe(e.target.value)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label>Target Date</label>
                                                            <input
                                                                type="date"
                                                                className="pe-input-field"
                                                                value={editTargetDate}
                                                                onChange={e => setEditTargetDate(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label>Manager Notes</label>
                                                        <textarea
                                                            className="pe-comment-textarea"
                                                            rows={2}
                                                            value={editManagerNotes}
                                                            onChange={e => setEditManagerNotes(e.target.value)}
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="pe-readonly-employee-view">
                                                    <p>
                                                        <strong>Action:</strong> {item.description}
                                                    </p>
                                                </div>
                                            )}

                                            <div>
                                                <label>Employee Notes / Reflections</label>
                                                <textarea
                                                    className="pe-comment-textarea"
                                                    rows={2}
                                                    value={editEmployeeNotes}
                                                    onChange={e => setEditEmployeeNotes(e.target.value)}
                                                    placeholder="Add personal notes, completion evidence, or questions..."
                                                    data-testid="employee-notes-textarea"
                                                />
                                            </div>
                                        </div>

                                        <div className="pe-edit-mode-actions">
                                            <button
                                                type="button"
                                                className="pe-btn pe-btn-secondary pe-btn-xs"
                                                onClick={handleCancelEdit}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="pe-btn pe-btn-primary pe-btn-xs"
                                                onClick={() => handleSaveEdit(item.id)}
                                                disabled={isUpdatingItem}
                                                data-testid={`save-item-${item.id}`}
                                            >
                                                {isUpdatingItem ? <Loader2 className="pe-spinner" size={12} /> : <Save size={12} />}
                                                <span>Save</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
