import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Shield,
    ChevronRight,
    ArrowRight,
    CornerDownLeft,
    Layers,
    FileSpreadsheet,
    Loader2,
    Calendar,
    User,
    Building,
    Award,
    RotateCcw,
    Check,
    Sparkles,
    Target
} from 'lucide-react';
import {
    ReviewResultDTO,
    ReviewWorkflowStatus,
    CriterionRatingSubmissionDTO
} from './types';
import {
    fetchReviewById,
    submitReviewRatings,
    transitionReviewWorkflow
} from '../../../services/performanceEvaluationService';
import { RatingGrid } from './RatingGrid';
import { AiRecommendationPanel } from './AiRecommendationPanel';
import { DevelopmentPlanPanel } from './DevelopmentPlanPanel';
import ConfirmationModal from '../../../components/ConfirmationModal/ConfirmationModal';
import { useToast } from '../../../components/Toast/Toast';

export interface ReviewDetailViewProps {
    reviewId: string;
    onBack: () => void;
    onReviewUpdated?: (updated: ReviewResultDTO) => void;
}

const WORKFLOW_STAGES: Array<{ status: ReviewWorkflowStatus; label: string; description: string }> = [
    { status: 'Draft', label: 'Draft', description: 'Review cycle setup and configuration' },
    { status: 'SelfAssessment', label: 'Self-Assessment', description: 'Employee self-evaluation' },
    { status: 'ManagerReview', label: 'Manager Review', description: 'Manager evaluation and rating' },
    { status: 'HrReview', label: 'HR Review', description: 'HR audit and moderation' },
    { status: 'Acknowledgment', label: 'Acknowledgment', description: 'Employee sign-off' },
    { status: 'Finalized', label: 'Finalized', description: 'Frozen historical snapshot' },
];

const NEXT_STAGE_MAP: Partial<Record<ReviewWorkflowStatus, ReviewWorkflowStatus>> = {
    Draft: 'SelfAssessment',
    SelfAssessment: 'ManagerReview',
    ManagerReview: 'HrReview',
    HrReview: 'Acknowledgment',
    Acknowledgment: 'Finalized',
};

const PREV_STAGE_MAP: Partial<Record<ReviewWorkflowStatus, ReviewWorkflowStatus>> = {
    SelfAssessment: 'Draft',
    ManagerReview: 'SelfAssessment',
    HrReview: 'ManagerReview',
    Acknowledgment: 'HrReview',
};

export const ReviewDetailView: React.FC<ReviewDetailViewProps> = ({
    reviewId,
    onBack,
    onReviewUpdated
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error };
        }
    } catch {
        // Fallback outside ToastProvider
    }
    const { success, error } = toastMethods;

    const [review, setReview] = useState<ReviewResultDTO | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string>('');
    const [isSavingRatings, setIsSavingRatings] = useState<boolean>(false);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [activeDetailTab, setActiveDetailTab] = useState<'ratings' | 'ai' | 'plan'>('ratings');

    // Confirmation modal for workflow transition
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        targetStatus: ReviewWorkflowStatus | null;
        title: string;
        description: string;
        confirmLabel: string;
        variant: 'info' | 'warning' | 'danger';
    }>({
        isOpen: false,
        targetStatus: null,
        title: '',
        description: '',
        confirmLabel: 'Confirm',
        variant: 'info'
    });

    const [transitionComment, setTransitionComment] = useState<string>('');

    const loadReview = useCallback(async () => {
        setLoading(true);
        setApiError('');
        try {
            const data = await fetchReviewById(reviewId);
            setReview(data);
            if (data.employees && data.employees.length > 0 && !selectedEmployeeId) {
                setSelectedEmployeeId(data.employees[0].employeeId);
            }
            onReviewUpdated?.(data);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to load review details.';
            setApiError(msg);
            error(msg);
        } finally {
            setLoading(false);
        }
    }, [reviewId, onReviewUpdated, error, selectedEmployeeId]);

    useEffect(() => {
        loadReview();
    }, [reviewId]);

    const currentEmployee = useMemo(() => {
        return review?.employees?.find(e => e.employeeId === selectedEmployeeId) || review?.employees?.[0];
    }, [review?.employees, selectedEmployeeId]);

    // Handle ratings submission
    const handleSaveRatings = async (employeeId: string, ratings: CriterionRatingSubmissionDTO[]) => {
        setIsSavingRatings(true);
        try {
            const updated = await submitReviewRatings(reviewId, {
                employeeId,
                ratings
            });
            setReview(updated);
            success('Evaluation ratings saved successfully.');
            onReviewUpdated?.(updated);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to save ratings.';
            error(msg);
            throw err;
        } finally {
            setIsSavingRatings(false);
        }
    };

    // Trigger transition modal
    const requestTransition = (targetStatus: ReviewWorkflowStatus) => {
        if (targetStatus === 'Finalized') {
            setConfirmModal({
                isOpen: true,
                targetStatus,
                title: 'Finalize Performance Review Cycle',
                description: 'Finalizing this review will freeze all employee scores into an immutable snapshot. Template changes and rating adjustments will no longer have any effect. Are you sure you want to finalize?',
                confirmLabel: 'Finalize & Freeze Scores',
                variant: 'warning'
            });
        } else if (targetStatus === 'Draft') {
            setConfirmModal({
                isOpen: true,
                targetStatus,
                title: 'Return Review to Draft',
                description: 'Returning to Draft will permit structural changes, but ratings cannot be submitted until the review returns to Self-Assessment or Manager Review. Continue?',
                confirmLabel: 'Return to Draft',
                variant: 'warning'
            });
        } else {
            const stageLabel = WORKFLOW_STAGES.find(s => s.status === targetStatus)?.label || targetStatus;
            setConfirmModal({
                isOpen: true,
                targetStatus,
                title: `Advance Workflow to ${stageLabel}`,
                description: `This will advance the performance evaluation cycle to the '${stageLabel}' stage. Team members with relevant permissions will be able to proceed.`,
                confirmLabel: `Advance to ${stageLabel}`,
                variant: 'info'
            });
        }
    };

    const handleConfirmTransition = async () => {
        if (!confirmModal.targetStatus) return;
        setIsTransitioning(true);
        try {
            await transitionReviewWorkflow(reviewId, {
                targetStatus: confirmModal.targetStatus,
                transitionComment: transitionComment || undefined
            });
            success(`Review transitioned to ${confirmModal.targetStatus} successfully.`);
            setConfirmModal(prev => ({ ...prev, isOpen: false, targetStatus: null }));
            setTransitionComment('');
            await loadReview();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Workflow transition failed.';
            error(msg);
        } finally {
            setIsTransitioning(false);
        }
    };

    if (loading) {
        return (
            <div className="pe-loading-state">
                <Loader2 className="pe-spinner" size={32} />
                <p>Loading performance review details and calculated scores...</p>
            </div>
        );
    }

    if (apiError || !review) {
        return (
            <div className="pe-error-card">
                <AlertTriangle size={32} color="#ee5d50" />
                <h4>Unable to Load Review</h4>
                <p>{apiError || 'The requested performance review could not be found.'}</p>
                <button type="button" className="pe-btn pe-btn-secondary" onClick={onBack}>
                    <ArrowLeft size={16} />
                    Back to Performance Reviews
                </button>
            </div>
        );
    }

    const currentStageIndex = WORKFLOW_STAGES.findIndex(s => s.status === review.status);
    const nextStatus = NEXT_STAGE_MAP[review.status];
    const prevStatus = PREV_STAGE_MAP[review.status];
    const nextStageLabel = nextStatus ? WORKFLOW_STAGES.find(s => s.status === nextStatus)?.label : null;
    const prevStageLabel = prevStatus ? WORKFLOW_STAGES.find(s => s.status === prevStatus)?.label : null;

    return (
        <div className="pe-review-detail-container">
            {/* Top Navigation & Action Header */}
            <div className="pe-detail-nav-bar">
                <button type="button" className="pe-back-button" onClick={onBack}>
                    <ArrowLeft size={16} />
                    <span>Back to Reviews</span>
                </button>

                <div className="pe-detail-action-buttons">
                    {prevStatus && !review.isFinalized && (
                        <button
                            type="button"
                            className="pe-btn pe-btn-secondary pe-btn-sm"
                            onClick={() => requestTransition(prevStatus)}
                            disabled={isTransitioning}
                        >
                            <CornerDownLeft size={14} />
                            Send Back to {prevStageLabel}
                        </button>
                    )}

                    {nextStatus && (
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary pe-btn-sm"
                            onClick={() => requestTransition(nextStatus)}
                            disabled={isTransitioning}
                            data-testid="advance-stage-btn"
                        >
                            {isTransitioning ? (
                                <>
                                    <Loader2 className="pe-spinner" size={14} />
                                    Transitioning...
                                </>
                            ) : (
                                <>
                                    <span>Advance to {nextStageLabel}</span>
                                    <ArrowRight size={14} />
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Review Title & Header Card */}
            <div className="pe-detail-header-card">
                <div className="pe-detail-header-main">
                    <div className="pe-title-status-line">
                        <h2 className="pe-detail-review-title">{review.title}</h2>
                        <span className={`pe-workflow-badge pe-stage-${(review.status || 'Draft').toLowerCase()}`}>
                            {review.status || 'Draft'}
                        </span>
                        {review.isFinalized && (
                            <span className="pe-badge pe-badge-finalized">
                                <Shield size={12} /> Frozen Snapshot
                            </span>
                        )}
                    </div>
                    {review.description && (
                        <p className="pe-detail-review-desc">{review.description}</p>
                    )}

                    {/* Metadata Chips */}
                    <div className="pe-detail-meta-chips">
                        <span className="pe-meta-chip">
                            <Layers size={14} /> Template: <strong>{review.templateTitle}</strong>
                        </span>
                        <span className="pe-meta-chip">
                            <Shield size={14} /> Scope: <strong>{review.scope}</strong>
                        </span>
                        <span className="pe-meta-chip">
                            <Calendar size={14} /> Period: <strong>{review.periodStart?.slice(0, 10)}</strong> to <strong>{review.periodEnd?.slice(0, 10)}</strong>
                        </span>
                        {review.departmentName && (
                            <span className="pe-meta-chip">
                                <Building size={14} /> Dept: <strong>{review.departmentName}</strong>
                            </span>
                        )}
                        {review.reviewerName && (
                            <span className="pe-meta-chip">
                                <User size={14} /> Reviewer: <strong>{review.reviewerName}</strong>
                            </span>
                        )}
                    </div>
                </div>

                {/* Score and Rating Summary */}
                <div className="pe-detail-header-score">
                    <div className="pe-overall-score-box">
                        <span className="pe-overall-score-label">Overall Review Score</span>
                        <div className="pe-overall-score-row">
                            <span className="pe-overall-score-value">{review.overallScore != null ? review.overallScore.toFixed(1) : '0.0'}</span>
                            <span className="pe-overall-score-max">/ 100</span>
                        </div>
                        <div className="pe-overall-rating-tag">
                            <Award size={15} />
                            <span>{review.overallRating || 'Unassigned'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Workflow Status Bar (Stepper) */}
            <div className="pe-workflow-stepper-card">
                <div className="pe-stepper-title-row">
                    <span className="pe-stepper-header-title">
                        <Clock size={16} /> Workflow Progression
                    </span>
                    <span className="pe-current-stage-indicator">
                        Stage {currentStageIndex + 1} of {WORKFLOW_STAGES.length}: <strong>{review.status}</strong>
                    </span>
                </div>

                <div className="pe-stepper-stages-bar">
                    {WORKFLOW_STAGES.map((stage, idx) => {
                        const isPast = idx < currentStageIndex;
                        const isCurrent = idx === currentStageIndex;
                        const isUpcoming = idx > currentStageIndex;

                        return (
                            <div
                                key={stage.status}
                                className={`pe-step-node ${isPast ? 'pe-step-completed' : ''} ${isCurrent ? 'pe-step-active' : ''} ${isUpcoming ? 'pe-step-upcoming' : ''}`}
                            >
                                <div className="pe-step-circle">
                                    {isPast ? <Check size={14} /> : (idx + 1)}
                                </div>
                                <div className="pe-step-label-wrap">
                                    <span className="pe-step-label">{stage.label}</span>
                                    <span className="pe-step-desc">{stage.description}</span>
                                </div>
                                {idx < WORKFLOW_STAGES.length - 1 && (
                                    <div className={`pe-step-connector ${isPast ? 'pe-connector-completed' : ''}`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Detail Navigation Tabs */}
            <div className="pe-detail-tab-nav" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeDetailTab === 'ratings'}
                    className={`pe-detail-tab-btn ${activeDetailTab === 'ratings' ? 'active' : ''}`}
                    onClick={() => setActiveDetailTab('ratings')}
                    data-testid="detail-tab-ratings"
                >
                    <FileSpreadsheet size={15} />
                    <span>Evaluation Ratings</span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeDetailTab === 'ai'}
                    className={`pe-detail-tab-btn ${activeDetailTab === 'ai' ? 'active' : ''}`}
                    onClick={() => setActiveDetailTab('ai')}
                    data-testid="detail-tab-ai"
                >
                    <Sparkles size={15} />
                    <span>AI Recommendations</span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeDetailTab === 'plan'}
                    className={`pe-detail-tab-btn ${activeDetailTab === 'plan' ? 'active' : ''}`}
                    onClick={() => setActiveDetailTab('plan')}
                    data-testid="detail-tab-plan"
                >
                    <Target size={15} />
                    <span>Development Plan</span>
                </button>
            </div>

            {/* Tab Body Section */}
            <div className="pe-detail-body-section">
                {activeDetailTab === 'ratings' && (
                    <RatingGrid
                        review={review}
                        selectedEmployeeId={selectedEmployeeId}
                        onEmployeeChange={setSelectedEmployeeId}
                        onSaveRatings={handleSaveRatings}
                        isSaving={isSavingRatings}
                        isReadOnly={review.isFinalized}
                    />
                )}

                {activeDetailTab === 'ai' && (
                    <AiRecommendationPanel
                        reviewId={review.reviewId}
                        employeeId={selectedEmployeeId || review.employees?.[0]?.employeeId || ''}
                        employeeName={currentEmployee?.employeeName}
                        templateId={review.templateId}
                        employees={review.employees}
                        onEmployeeChange={setSelectedEmployeeId}
                        onNavigateToPlan={() => setActiveDetailTab('plan')}
                    />
                )}

                {activeDetailTab === 'plan' && (
                    <DevelopmentPlanPanel
                        reviewId={review.reviewId}
                        employeeId={selectedEmployeeId || review.employees?.[0]?.employeeId || ''}
                        employeeName={currentEmployee?.employeeName}
                        employees={review.employees}
                        onEmployeeChange={setSelectedEmployeeId}
                    />
                )}
            </div>

            {/* Transition Confirmation Modal */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                variant={confirmModal.variant}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmLabel={confirmModal.confirmLabel}
                cancelLabel="Cancel"
                onConfirm={handleConfirmTransition}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false, targetStatus: null }))}
            />
        </div>
    );
};
