import React, { useState, useEffect, useCallback } from 'react';
import {
    Sparkles,
    Loader2,
    ThumbsUp,
    ThumbsDown,
    Edit3,
    Save,
    RotateCcw,
    AlertTriangle,
    CheckCircle2,
    Check,
    Plus,
    Trash2,
    FileText,
    Brain,
    HelpCircle,
    User,
    ArrowRight,
    ChevronDown,
    X,
    ShieldAlert
} from 'lucide-react';
import {
    AiRecommendationDTO,
    AiRecommendationStatus,
    AiRecommendationActionItem,
    UpdateAiRecommendationDTO,
    EmployeeReviewScoreDTO
} from './types';
import {
    fetchAiRecommendation,
    generateAiRecommendation,
    updateAiRecommendation,
    fetchTemplateById
} from '../../../services/performanceEvaluationService';
import { useToast } from '../../../components/Toast/Toast';

export interface AiRecommendationPanelProps {
    reviewId: string;
    employeeId: string;
    employeeName?: string;
    templateId?: string;
    isAiEnabled?: boolean;
    isManager?: boolean;
    employees?: EmployeeReviewScoreDTO[];
    onEmployeeChange?: (employeeId: string) => void;
    onRecommendationUpdated?: (rec: AiRecommendationDTO) => void;
    onNavigateToPlan?: () => void;
}

export const AiRecommendationPanel: React.FC<AiRecommendationPanelProps> = ({
    reviewId,
    employeeId,
    employeeName,
    templateId,
    isAiEnabled: isAiEnabledProp,
    isManager: isManagerProp,
    employees,
    onEmployeeChange,
    onRecommendationUpdated,
    onNavigateToPlan
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {}, info: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error, info: (t as any).info || t.success };
        }
    } catch {
        // Fallback if rendered outside ToastProvider
    }
    const { success, error, info } = toastMethods;

    // Detect manager role
    const currentUserRole = localStorage.getItem('userRole') || localStorage.getItem('role') || 'Manager';
    const isManager = isManagerProp !== undefined
        ? isManagerProp
        : (currentUserRole === 'Manager' || currentUserRole === 'SystemAdmin' || currentUserRole === 'Admin');

    const [recommendation, setRecommendation] = useState<AiRecommendationDTO | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [generating, setGenerating] = useState<boolean>(false);
    const [updating, setUpdating] = useState<boolean>(false);
    const [isAiEnabled, setIsAiEnabled] = useState<boolean>(isAiEnabledProp !== undefined ? isAiEnabledProp : true);
    const [errorMessage, setErrorMessage] = useState<string>('');

    // Inline edit state
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [editedSummary, setEditedSummary] = useState<string>('');
    const [editedStrengths, setEditedStrengths] = useState<string[]>([]);
    const [editedImprovements, setEditedImprovements] = useState<string[]>([]);
    const [editedActionItems, setEditedActionItems] = useState<AiRecommendationActionItem[]>([]);
    const [editedTraining, setEditedTraining] = useState<string[]>([]);
    const [editedManualNotes, setEditedManualNotes] = useState<string>('');

    // Fetch template AI flag if not passed
    useEffect(() => {
        if (isAiEnabledProp !== undefined) {
            setIsAiEnabled(isAiEnabledProp);
            return;
        }
        if (templateId) {
            fetchTemplateById(templateId)
                .then(tmpl => {
                    if (tmpl) setIsAiEnabled(tmpl.isAiEnabled);
                })
                .catch(() => {
                    // Default to true if fetch fails
                    setIsAiEnabled(true);
                });
        }
    }, [templateId, isAiEnabledProp]);

    // Load AI recommendation for current employee
    const loadRecommendation = useCallback(async () => {
        if (!reviewId || !employeeId) return;
        setLoading(true);
        setErrorMessage('');
        try {
            const data = await fetchAiRecommendation(reviewId, employeeId);
            setRecommendation(data);
            if (data) {
                syncEditState(data);
            }
        } catch (err: any) {
            const status = err.response?.status;
            if (status === 404) {
                setRecommendation(null);
            } else if (status === 403) {
                // Non-manager attempted to view unapproved recommendation
                setRecommendation(null);
                setErrorMessage('AI recommendation is not yet approved by reviewer.');
            } else {
                const msg = err.response?.data?.message || err.message || 'Failed to load AI recommendation.';
                setErrorMessage(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [reviewId, employeeId]);

    useEffect(() => {
        setIsEditing(false);
        loadRecommendation();
    }, [loadRecommendation]);

    // Synchronize edit buffer with loaded recommendation
    const syncEditState = (rec: AiRecommendationDTO) => {
        setEditedSummary(rec.summary || '');
        setEditedStrengths(rec.strengths ? [...rec.strengths] : []);
        setEditedImprovements(rec.improvementAreas ? [...rec.improvementAreas] : []);
        setEditedActionItems(rec.actionItems ? rec.actionItems.map(a => ({ ...a })) : []);
        setEditedTraining(rec.trainingTopics ? [...rec.trainingTopics] : []);
        setEditedManualNotes(rec.manualNotes || '');
    };

    // Trigger AI generation
    const handleGenerate = async () => {
        if (!isAiEnabled) {
            error('AI recommendations are disabled for this evaluation template.');
            return;
        }
        setGenerating(true);
        setErrorMessage('');
        try {
            const res = await generateAiRecommendation(reviewId, employeeId);
            setRecommendation(res);
            syncEditState(res);
            setIsEditing(false);
            success('AI performance recommendation generated successfully.');
            onRecommendationUpdated?.(res);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to generate AI recommendation.';
            setErrorMessage(msg);
            error(msg);
        } finally {
            setGenerating(false);
        }
    };

    // Save edited fields or approve/reject
    const handleUpdateStatusOrContent = async (
        targetStatus: AiRecommendationStatus,
        includeContentUpdates: boolean = false
    ) => {
        if (!recommendation) return;
        setUpdating(true);
        try {
            const payload: UpdateAiRecommendationDTO = {
                status: targetStatus,
                summary: includeContentUpdates ? editedSummary : recommendation.summary,
                strengths: includeContentUpdates ? editedStrengths : recommendation.strengths,
                improvementAreas: includeContentUpdates ? editedImprovements : recommendation.improvementAreas,
                actionItems: includeContentUpdates ? editedActionItems : recommendation.actionItems,
                trainingTopics: includeContentUpdates ? editedTraining : recommendation.trainingTopics,
                manualNotes: editedManualNotes || recommendation.manualNotes
            };

            const updated = await updateAiRecommendation(reviewId, employeeId, payload);
            setRecommendation(updated);
            syncEditState(updated);
            setIsEditing(false);

            if (targetStatus === 'Approved') {
                success('AI recommendation approved. You can now create development plan items.');
            } else if (targetStatus === 'Rejected') {
                info('AI recommendation marked as rejected.');
            } else if (targetStatus === 'ManualOverride') {
                success('Manual override saved successfully.');
            } else {
                success('AI recommendation updated successfully.');
            }
            onRecommendationUpdated?.(updated);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to update recommendation.';
            error(msg);
        } finally {
            setUpdating(false);
        }
    };

    // Handlers for dynamic list edits
    const handleAddStrength = () => setEditedStrengths(prev => [...prev, '']);
    const handleRemoveStrength = (idx: number) => setEditedStrengths(prev => prev.filter((_, i) => i !== idx));
    const handleStrengthChange = (idx: number, val: string) => {
        setEditedStrengths(prev => {
            const next = [...prev];
            next[idx] = val;
            return next;
        });
    };

    const handleAddImprovement = () => setEditedImprovements(prev => [...prev, '']);
    const handleRemoveImprovement = (idx: number) => setEditedImprovements(prev => prev.filter((_, i) => i !== idx));
    const handleImprovementChange = (idx: number, val: string) => {
        setEditedImprovements(prev => {
            const next = [...prev];
            next[idx] = val;
            return next;
        });
    };

    const handleAddActionItem = () => {
        setEditedActionItems(prev => [
            ...prev,
            { description: '', successMeasure: '', timeframe: '30 Days' }
        ]);
    };
    const handleRemoveActionItem = (idx: number) => setEditedActionItems(prev => prev.filter((_, i) => i !== idx));
    const handleActionItemChange = (idx: number, field: keyof AiRecommendationActionItem, val: string) => {
        setEditedActionItems(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [field]: val };
            return next;
        });
    };

    const handleAddTraining = () => setEditedTraining(prev => [...prev, '']);
    const handleRemoveTraining = (idx: number) => setEditedTraining(prev => prev.filter((_, i) => i !== idx));
    const handleTrainingChange = (idx: number, val: string) => {
        setEditedTraining(prev => {
            const next = [...prev];
            next[idx] = val;
            return next;
        });
    };

    // Employee visibility check: Non-managers only see panel if status is Approved
    if (!isManager) {
        if (loading) {
            return (
                <div className="pe-loading-state" data-testid="ai-panel-loading">
                    <Loader2 className="pe-spinner" size={28} />
                    <p>Loading AI recommendations...</p>
                </div>
            );
        }

        if (!recommendation || recommendation.status !== 'Approved') {
            return (
                <div className="pe-ai-employee-empty-card" data-testid="ai-panel-employee-pending">
                    <Brain size={40} className="pe-ai-empty-icon" />
                    <h3>AI Performance Recommendations</h3>
                    <p>
                        AI recommendations will be visible here once your manager reviews and approves them.
                    </p>
                    <span className="pe-badge pe-badge-pending">Status: Pending Review</span>
                </div>
            );
        }
    }

    return (
        <div className="pe-ai-panel-container" data-testid="ai-recommendation-panel">
            {/* Top Toolbar: Employee Selector (if multiple) & Action Buttons */}
            <div className="pe-ai-toolbar">
                <div className="pe-ai-toolbar-left">
                    <div className="pe-ai-title-wrap">
                        <Brain size={22} className="pe-ai-sparkle-icon" />
                        <div>
                            <h3 className="pe-ai-heading">
                                AI Recommendations {employeeName ? `for ${employeeName}` : ''}
                            </h3>
                            <p className="pe-ai-subheading">
                                De-identified competency analysis and actionable growth recommendations powered by Groq LLM.
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
                                data-testid="ai-employee-selector"
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

                {isManager && (
                    <div className="pe-ai-toolbar-right">
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary pe-btn-sm"
                            onClick={handleGenerate}
                            disabled={!isAiEnabled || generating}
                            title={!isAiEnabled ? 'AI recommendations are disabled for this evaluation template' : undefined}
                            data-testid="generate-ai-btn"
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="pe-spinner" size={14} />
                                    <span>Analyzing & Generating...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} />
                                    <span>{recommendation ? 'Regenerate Recommendation' : 'Generate AI Recommendation'}</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Error or disabled notices */}
            {!isAiEnabled && (
                <div className="pe-ai-disabled-banner" data-testid="ai-disabled-banner">
                    <AlertTriangle size={18} />
                    <span>
                        AI Recommendations are disabled on this evaluation template. Enable AI in the template settings to generate recommendations.
                    </span>
                </div>
            )}

            {errorMessage && (
                <div className="pe-ai-error-banner" data-testid="ai-error-banner">
                    <AlertTriangle size={18} />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Loading spinner */}
            {loading ? (
                <div className="pe-loading-state" data-testid="ai-panel-loading">
                    <Loader2 className="pe-spinner" size={28} />
                    <p>Loading AI recommendation details...</p>
                </div>
            ) : !recommendation ? (
                /* Empty state when no recommendation exists yet */
                <div className="pe-ai-empty-state" data-testid="ai-empty-state">
                    <Sparkles size={48} className="pe-ai-empty-icon" />
                    <h4>No Recommendation Generated Yet</h4>
                    <p>
                        Generate an AI-driven performance review summary, competency strengths, areas of growth, and concrete development action items.
                    </p>
                    {isManager && (
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary"
                            onClick={handleGenerate}
                            disabled={!isAiEnabled || generating}
                            data-testid="empty-generate-btn"
                        >
                            {generating ? <Loader2 className="pe-spinner" size={16} /> : <Sparkles size={16} />}
                            <span>Generate AI Recommendation</span>
                        </button>
                    )}
                </div>
            ) : (
                /* Recommendation Structured Result View / Edit */
                <div className="pe-ai-content-card">
                    {/* Status Header Bar */}
                    <div className="pe-ai-card-header">
                        <div className="pe-ai-status-row">
                            <span className="pe-ai-status-label">Recommendation Status:</span>
                            <span
                                className={`pe-ai-badge pe-ai-status-${(recommendation.status || 'Pending').toLowerCase()}`}
                                data-testid="ai-status-badge"
                            >
                                {recommendation.status === 'Approved' && <CheckCircle2 size={13} />}
                                {recommendation.status === 'Rejected' && <ThumbsDown size={13} />}
                                {recommendation.status === 'ManualOverride' && <Edit3 size={13} />}
                                {recommendation.status}
                            </span>
                            {recommendation.reviewedAt && (
                                <span className="pe-ai-reviewed-meta">
                                    Last reviewed: {new Date(recommendation.reviewedAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>

                        {isManager && (
                            <div className="pe-ai-header-actions">
                                {!isEditing ? (
                                    <>
                                        <button
                                            type="button"
                                            className="pe-btn pe-btn-secondary pe-btn-sm"
                                            onClick={() => setIsEditing(true)}
                                            data-testid="edit-ai-btn"
                                        >
                                            <Edit3 size={13} />
                                            <span>Edit Details</span>
                                        </button>
                                        {recommendation.status !== 'Approved' && (
                                            <button
                                                type="button"
                                                className="pe-btn pe-btn-success pe-btn-sm"
                                                onClick={() => handleUpdateStatusOrContent('Approved', false)}
                                                disabled={updating}
                                                data-testid="approve-ai-btn"
                                            >
                                                <ThumbsUp size={13} />
                                                <span>Approve</span>
                                            </button>
                                        )}
                                        {recommendation.status !== 'Rejected' && (
                                            <button
                                                type="button"
                                                className="pe-btn pe-btn-danger pe-btn-sm"
                                                onClick={() => handleUpdateStatusOrContent('Rejected', false)}
                                                disabled={updating}
                                                data-testid="reject-ai-btn"
                                            >
                                                <ThumbsDown size={13} />
                                                <span>Reject</span>
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="pe-btn pe-btn-secondary pe-btn-sm"
                                            onClick={() => {
                                                syncEditState(recommendation);
                                                setIsEditing(false);
                                            }}
                                            data-testid="cancel-edit-ai-btn"
                                        >
                                            <X size={13} />
                                            <span>Cancel</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="pe-btn pe-btn-primary pe-btn-sm"
                                            onClick={() => handleUpdateStatusOrContent(recommendation.status, true)}
                                            disabled={updating}
                                            data-testid="save-ai-edits-btn"
                                        >
                                            <Save size={13} />
                                            <span>Save Changes</span>
                                        </button>
                                    </>
                                )}

                                {recommendation.status === 'Approved' && onNavigateToPlan && (
                                    <button
                                        type="button"
                                        className="pe-btn pe-btn-secondary pe-btn-sm pe-btn-plan-link"
                                        onClick={onNavigateToPlan}
                                        data-testid="create-plan-shortcut-btn"
                                    >
                                        <span>Create Plan from Items</span>
                                        <ArrowRight size={13} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section 1: Executive Summary */}
                    <div className="pe-ai-section-box">
                        <h4 className="pe-ai-section-title">
                            <FileText size={16} /> Performance Synthesis & Summary
                        </h4>
                        {!isEditing ? (
                            <p className="pe-ai-summary-text" data-testid="ai-summary-text">
                                {recommendation.summary || 'No summary available.'}
                            </p>
                        ) : (
                            <textarea
                                className="pe-comment-textarea"
                                rows={4}
                                value={editedSummary}
                                onChange={e => setEditedSummary(e.target.value)}
                                placeholder="Executive performance synthesis and key observations..."
                                data-testid="ai-summary-textarea"
                            />
                        )}
                    </div>

                    {/* Section 2 & 3: Two Columns (Strengths & Improvement Areas) */}
                    <div className="pe-ai-two-col-grid">
                        {/* Key Strengths */}
                        <div className="pe-ai-col-card pe-ai-col-strengths">
                            <div className="pe-ai-col-header">
                                <span className="pe-ai-col-title">
                                    <CheckCircle2 size={16} className="pe-icon-green" /> Key Strengths
                                </span>
                                {isEditing && (
                                    <button
                                        type="button"
                                        className="pe-btn-icon-sm"
                                        onClick={handleAddStrength}
                                        title="Add Strength"
                                        data-testid="add-strength-btn"
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                            </div>

                            {!isEditing ? (
                                <ul className="pe-ai-list" data-testid="ai-strengths-list">
                                    {recommendation.strengths && recommendation.strengths.length > 0 ? (
                                        recommendation.strengths.map((st, i) => (
                                            <li key={i} className="pe-ai-list-item">
                                                <Check size={14} className="pe-ai-check-icon" />
                                                <span>{st}</span>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="pe-ai-list-empty">None listed.</li>
                                    )}
                                </ul>
                            ) : (
                                <div className="pe-ai-inputs-list">
                                    {editedStrengths.map((st, i) => (
                                        <div key={i} className="pe-ai-input-row">
                                            <input
                                                type="text"
                                                className="pe-input-field"
                                                value={st}
                                                onChange={e => handleStrengthChange(i, e.target.value)}
                                                placeholder={`Strength #${i + 1}`}
                                            />
                                            <button
                                                type="button"
                                                className="pe-btn-trash"
                                                onClick={() => handleRemoveStrength(i)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                    {editedStrengths.length === 0 && (
                                        <button
                                            type="button"
                                            className="pe-btn pe-btn-secondary pe-btn-xs"
                                            onClick={handleAddStrength}
                                        >
                                            <Plus size={12} /> Add Strength
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Areas for Improvement */}
                        <div className="pe-ai-col-card pe-ai-col-improvements">
                            <div className="pe-ai-col-header">
                                <span className="pe-ai-col-title">
                                    <AlertTriangle size={16} className="pe-icon-amber" /> Areas for Improvement
                                </span>
                                {isEditing && (
                                    <button
                                        type="button"
                                        className="pe-btn-icon-sm"
                                        onClick={handleAddImprovement}
                                        title="Add Improvement Area"
                                        data-testid="add-improvement-btn"
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                            </div>

                            {!isEditing ? (
                                <ul className="pe-ai-list" data-testid="ai-improvements-list">
                                    {recommendation.improvementAreas && recommendation.improvementAreas.length > 0 ? (
                                        recommendation.improvementAreas.map((imp, i) => (
                                            <li key={i} className="pe-ai-list-item">
                                                <span className="pe-ai-bullet-amber">•</span>
                                                <span>{imp}</span>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="pe-ai-list-empty">None listed.</li>
                                    )}
                                </ul>
                            ) : (
                                <div className="pe-ai-inputs-list">
                                    {editedImprovements.map((imp, i) => (
                                        <div key={i} className="pe-ai-input-row">
                                            <input
                                                type="text"
                                                className="pe-input-field"
                                                value={imp}
                                                onChange={e => handleImprovementChange(i, e.target.value)}
                                                placeholder={`Improvement area #${i + 1}`}
                                            />
                                            <button
                                                type="button"
                                                className="pe-btn-trash"
                                                onClick={() => handleRemoveImprovement(i)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                    {editedImprovements.length === 0 && (
                                        <button
                                            type="button"
                                            className="pe-btn pe-btn-secondary pe-btn-xs"
                                            onClick={handleAddImprovement}
                                        >
                                            <Plus size={12} /> Add Area
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 4: Action Items Table */}
                    <div className="pe-ai-section-box">
                        <div className="pe-ai-section-header-flex">
                            <h4 className="pe-ai-section-title">
                                <CheckCircle2 size={16} /> Recommended Action Items
                            </h4>
                            {isEditing && (
                                <button
                                    type="button"
                                    className="pe-btn pe-btn-secondary pe-btn-xs"
                                    onClick={handleAddActionItem}
                                    data-testid="add-action-item-btn"
                                >
                                    <Plus size={12} /> Add Action Item
                                </button>
                            )}
                        </div>

                        {!isEditing ? (
                            <div className="pe-criteria-table-container">
                                <table className="pe-ai-action-table" data-testid="ai-action-items-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '45%' }}>Action Description</th>
                                            <th style={{ width: '35%' }}>Success Measure</th>
                                            <th style={{ width: '20%' }}>Timeframe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recommendation.actionItems && recommendation.actionItems.length > 0 ? (
                                            recommendation.actionItems.map((act, i) => (
                                                <tr key={i}>
                                                    <td className="pe-ai-act-desc">{act.description}</td>
                                                    <td className="pe-ai-act-measure">{act.successMeasure || '—'}</td>
                                                    <td className="pe-ai-act-timeframe">
                                                        <span className="pe-badge pe-badge-timeframe">{act.timeframe}</span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="pe-empty-td">
                                                    No action items specified.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="pe-ai-action-edit-list">
                                {editedActionItems.map((act, i) => (
                                    <div key={i} className="pe-ai-action-edit-card">
                                        <div className="pe-ai-action-card-header">
                                            <span>Action Item #{i + 1}</span>
                                            <button
                                                type="button"
                                                className="pe-btn-trash"
                                                onClick={() => handleRemoveActionItem(i)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                        <div className="pe-ai-action-card-fields">
                                            <input
                                                type="text"
                                                className="pe-input-field"
                                                value={act.description}
                                                onChange={e => handleActionItemChange(i, 'description', e.target.value)}
                                                placeholder="Action item description..."
                                            />
                                            <div className="pe-ai-action-subrow">
                                                <input
                                                    type="text"
                                                    className="pe-input-field"
                                                    value={act.successMeasure}
                                                    onChange={e => handleActionItemChange(i, 'successMeasure', e.target.value)}
                                                    placeholder="Success measure..."
                                                />
                                                <input
                                                    type="text"
                                                    className="pe-input-field"
                                                    style={{ maxWidth: 160 }}
                                                    value={act.timeframe}
                                                    onChange={e => handleActionItemChange(i, 'timeframe', e.target.value)}
                                                    placeholder="e.g. 30 Days"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Section 5: Training Topics */}
                    <div className="pe-ai-section-box">
                        <div className="pe-ai-section-header-flex">
                            <h4 className="pe-ai-section-title">
                                <Brain size={16} /> Recommended Training & Upskilling Topics
                            </h4>
                            {isEditing && (
                                <button
                                    type="button"
                                    className="pe-btn pe-btn-secondary pe-btn-xs"
                                    onClick={handleAddTraining}
                                    data-testid="add-training-btn"
                                >
                                    <Plus size={12} /> Add Topic
                                </button>
                            )}
                        </div>

                        {!isEditing ? (
                            <div className="pe-ai-tags-wrap" data-testid="ai-training-tags">
                                {recommendation.trainingTopics && recommendation.trainingTopics.length > 0 ? (
                                    recommendation.trainingTopics.map((top, i) => (
                                        <span key={i} className="pe-ai-topic-tag">
                                            {top}
                                        </span>
                                    ))
                                ) : (
                                    <span className="pe-text-muted">No training topics recommended.</span>
                                )}
                            </div>
                        ) : (
                            <div className="pe-ai-inputs-list">
                                {editedTraining.map((top, i) => (
                                    <div key={i} className="pe-ai-input-row">
                                        <input
                                            type="text"
                                            className="pe-input-field"
                                            value={top}
                                            onChange={e => handleTrainingChange(i, e.target.value)}
                                            placeholder={`Training Topic #${i + 1}`}
                                        />
                                        <button
                                            type="button"
                                            className="pe-btn-trash"
                                            onClick={() => handleRemoveTraining(i)}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Section 6: Manual Override Textarea (Manager Only) */}
                    {isManager && (
                        <div className="pe-ai-section-box pe-ai-manual-override-box" data-testid="ai-manual-override-box">
                            <div className="pe-ai-section-header-flex">
                                <h4 className="pe-ai-section-title">
                                    <Edit3 size={16} /> Reviewer Manual Override & Notes
                                </h4>
                                {recommendation.status !== 'ManualOverride' && (
                                    <button
                                        type="button"
                                        className="pe-btn pe-btn-secondary pe-btn-xs"
                                        onClick={() => handleUpdateStatusOrContent('ManualOverride', false)}
                                        disabled={updating}
                                        data-testid="apply-manual-override-btn"
                                    >
                                        <ShieldAlert size={12} /> Set Status to Manual Override
                                    </button>
                                )}
                            </div>
                            <p className="pe-ai-override-help">
                                When AI service is unavailable or recommendations require supervisory adjustments, enter manual notes below.
                            </p>
                            <textarea
                                className="pe-comment-textarea"
                                rows={3}
                                value={editedManualNotes}
                                onChange={e => setEditedManualNotes(e.target.value)}
                                placeholder="Enter manual reviewer notes or override rationale..."
                                data-testid="manual-override-textarea"
                            />
                            {editedManualNotes !== (recommendation.manualNotes || '') && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                    <button
                                        type="button"
                                        className="pe-btn pe-btn-primary pe-btn-xs"
                                        onClick={() => handleUpdateStatusOrContent(recommendation.status, true)}
                                        disabled={updating}
                                        data-testid="save-manual-notes-btn"
                                    >
                                        <Save size={12} /> Save Notes
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
