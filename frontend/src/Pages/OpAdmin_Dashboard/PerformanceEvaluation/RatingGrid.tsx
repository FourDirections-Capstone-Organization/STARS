import React, { useState, useEffect, useMemo } from 'react';
import {
    Award,
    AlertTriangle,
    Save,
    RotateCcw,
    CheckCircle2,
    Activity,
    Info,
    HelpCircle,
    User,
    ChevronDown,
    Building,
    Briefcase
} from 'lucide-react';
import {
    ReviewResultDTO,
    EmployeeReviewScoreDTO,
    CriterionRatingSubmissionDTO,
    ReviewWorkflowStatus
} from './types';

export interface RatingGridProps {
    review: ReviewResultDTO;
    selectedEmployeeId?: string;
    onEmployeeChange?: (employeeId: string) => void;
    onSaveRatings?: (employeeId: string, ratings: CriterionRatingSubmissionDTO[]) => Promise<void>;
    isSaving?: boolean;
    isReadOnly?: boolean;
}

interface LocalCriterionRating {
    criterionId: string;
    selfScore: number | null;
    managerScore: number | null;
    selfComment: string;
    managerComment: string;
}

export const RatingGrid: React.FC<RatingGridProps> = ({
    review,
    selectedEmployeeId,
    onEmployeeChange,
    onSaveRatings,
    isSaving = false,
    isReadOnly = false
}) => {
    // Current employee selection
    const activeEmployeeId = selectedEmployeeId || (review.employees && review.employees.length > 0 ? review.employees[0].employeeId : '');
    
    const currentEmployee: EmployeeReviewScoreDTO | undefined = useMemo(() => {
        return review.employees?.find(e => e.employeeId === activeEmployeeId) || review.employees?.[0];
    }, [review.employees, activeEmployeeId]);

    // Local rating edits per employee: Record<criterionId, LocalCriterionRating>
    const [localRatings, setLocalRatings] = useState<Record<string, LocalCriterionRating>>({});
    const [activeTooltipMetric, setActiveTooltipMetric] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Initialize/sync local state whenever currentEmployee changes
    useEffect(() => {
        if (!currentEmployee) {
            setLocalRatings({});
            return;
        }

        const map: Record<string, LocalCriterionRating> = {};
        currentEmployee.sections?.forEach(sec => {
            sec.criteria?.forEach(crit => {
                map[crit.criterionId] = {
                    criterionId: crit.criterionId,
                    selfScore: crit.selfScore ?? null,
                    managerScore: crit.managerScore ?? null,
                    selfComment: crit.selfComment ?? '',
                    managerComment: crit.managerComment ?? ''
                };
            });
        });
        setLocalRatings(map);
        setSaveMessage(null);
    }, [currentEmployee]);

    // Determine edit permissions based on workflow status
    const isSelfAssessmentStage = review.status === 'SelfAssessment';
    const isManagerReviewStage = review.status === 'ManagerReview';
    const isLocked = isReadOnly || review.isFinalized || review.status === 'Draft' || review.status === 'Finalized';

    const canEditSelfScore = !isLocked && (isSelfAssessmentStage || isManagerReviewStage);
    const canEditManagerScore = !isLocked && isManagerReviewStage;

    // Handle score change with live gap and outlier computation
    const handleScoreChange = (
        criterionId: string,
        field: 'selfScore' | 'managerScore',
        value: string
    ) => {
        const numVal = value === '' ? null : Number(value);
        setLocalRatings(prev => ({
            ...prev,
            [criterionId]: {
                ...prev[criterionId],
                criterionId,
                [field]: numVal
            }
        }));
    };

    const handleCommentChange = (
        criterionId: string,
        field: 'selfComment' | 'managerComment',
        value: string
    ) => {
        setLocalRatings(prev => ({
            ...prev,
            [criterionId]: {
                ...prev[criterionId],
                criterionId,
                [field]: value
            }
        }));
    };

    const handleReset = () => {
        if (!currentEmployee) return;
        const map: Record<string, LocalCriterionRating> = {};
        currentEmployee.sections?.forEach(sec => {
            sec.criteria?.forEach(crit => {
                map[crit.criterionId] = {
                    criterionId: crit.criterionId,
                    selfScore: crit.selfScore ?? null,
                    managerScore: crit.managerScore ?? null,
                    selfComment: crit.selfComment ?? '',
                    managerComment: crit.managerComment ?? ''
                };
            });
        });
        setLocalRatings(map);
    };

    const handleSave = async () => {
        if (!currentEmployee || !onSaveRatings) return;

        const payload: CriterionRatingSubmissionDTO[] = Object.values(localRatings).map(r => ({
            criterionId: r.criterionId,
            selfScore: r.selfScore,
            selfComment: r.selfComment || undefined,
            managerScore: r.managerScore,
            managerComment: r.managerComment || undefined
        }));

        await onSaveRatings(currentEmployee.employeeId, payload);
        setSaveMessage('Ratings saved successfully.');
        setTimeout(() => setSaveMessage(null), 3500);
    };

    if (!currentEmployee) {
        return (
            <div className="pe-empty-state">
                <AlertTriangle size={32} color="#f59e0b" />
                <h4>No Employee Record Found</h4>
                <p>This evaluation review does not contain any assigned employees to evaluate.</p>
            </div>
        );
    }

    return (
        <div className="pe-rating-grid-container" data-testid="rating-grid">
            {/* Multi-Employee Selector when review covers multiple employees */}
            {review.employees && review.employees.length > 1 && (
                <div className="pe-employee-selector-card">
                    <label htmlFor="pe-employee-select" className="pe-employee-selector-label">
                        <User size={16} />
                        Select Employee to Evaluate:
                    </label>
                    <select
                        id="pe-employee-select"
                        className="pe-filter-select"
                        value={activeEmployeeId}
                        onChange={e => onEmployeeChange?.(e.target.value)}
                    >
                        {review.employees.map(emp => (
                            <option key={emp.employeeId} value={emp.employeeId}>
                                {emp.employeeName} {emp.jobPositionTitle ? `(${emp.jobPositionTitle})` : ''} — Score: {emp.finalScore.toFixed(1)} [{emp.ratingLabel}] {emp.outlierCount > 0 ? `• ⚠️ ${emp.outlierCount} outliers` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Active Employee Summary Card */}
            <div className="pe-employee-summary-header">
                <div className="pe-employee-info-col">
                    <div className="pe-employee-name-row">
                        <h3 className="pe-employee-name">{currentEmployee.employeeName}</h3>
                        {currentEmployee.employeeNumber && (
                            <span className="pe-employee-number-badge">#{currentEmployee.employeeNumber}</span>
                        )}
                    </div>
                    <div className="pe-employee-sub-row">
                        {currentEmployee.departmentName && (
                            <span className="pe-sub-meta">
                                <Building size={14} /> {currentEmployee.departmentName}
                            </span>
                        )}
                        {currentEmployee.jobPositionTitle && (
                            <span className="pe-sub-meta">
                                <Briefcase size={14} /> {currentEmployee.jobPositionTitle}
                            </span>
                        )}
                        {currentEmployee.role && (
                            <span className="pe-badge pe-badge-role">{currentEmployee.role}</span>
                        )}
                    </div>
                </div>

                <div className="pe-employee-score-badges">
                    <div className="pe-score-card">
                        <span className="pe-score-label">Overall Score</span>
                        <span className="pe-score-value">{currentEmployee.finalScore.toFixed(1)} <small>/ 100</small></span>
                    </div>
                    <div
                        className="pe-rating-band-pill"
                        style={{
                            backgroundColor: currentEmployee.ratingBandColor || 'var(--teal, #00A99D)',
                            color: '#ffffff'
                        }}
                    >
                        <Award size={16} />
                        <span>{currentEmployee.ratingLabel || 'Unassigned'}</span>
                    </div>
                    {currentEmployee.outlierCount > 0 && (
                        <div className="pe-outlier-counter-pill" title={`${currentEmployee.outlierCount} evaluation criteria have a gap ≥ 2.0`}>
                            <AlertTriangle size={15} />
                            <span>{currentEmployee.outlierCount} Outlier{currentEmployee.outlierCount > 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Notification / Stage status hint */}
            {isLocked && (
                <div className="pe-grid-status-alert">
                    <Info size={16} />
                    <span>
                        {review.isFinalized
                            ? '🔒 Review finalized: all ratings and final scores are permanently locked.'
                            : review.status === 'Draft'
                            ? 'Draft cycle: transition stage to Self-Assessment or Manager Review to enter scores.'
                            : `Review currently in ${review.status} stage: ratings are read-only.`}
                    </span>
                </div>
            )}

            {/* Sections and Criteria */}
            <div className="pe-grid-sections-wrapper">
                {currentEmployee.sections?.map((section, sIdx) => {
                    return (
                        <div key={section.sectionId || sIdx} className={`pe-section-card ${section.isKpiSection ? 'pe-section-kpi' : ''}`}>
                            {/* Section Header */}
                            <div className="pe-section-card-header">
                                <div className="pe-section-title-wrap">
                                    <span className="pe-section-order-badge">{sIdx + 1}</span>
                                    <div>
                                        <div className="pe-section-heading-row">
                                            <h4 className="pe-section-name">{section.sectionTitle}</h4>
                                            {section.isKpiSection && (
                                                <span className="pe-badge pe-badge-kpi">
                                                    <Activity size={12} /> Automated KPI Section
                                                </span>
                                            )}
                                        </div>
                                        <div className="pe-section-meta-row">
                                            <span>Weight: <strong>{section.weight}%</strong> of total</span>
                                            <span className="pe-bullet">•</span>
                                            <span>Section Score: <strong>{section.score.toFixed(1)} / 100</strong> (Weighted: <strong>{section.weightedScore.toFixed(1)}%</strong>)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* If KPI Section, display automated metrics summary and tooltips */}
                            {section.isKpiSection && (
                                <div className="pe-kpi-summary-box">
                                    <div className="pe-kpi-box-header">
                                        <span className="pe-kpi-box-title">
                                            <Activity size={15} color="var(--teal, #00A99D)" />
                                            STARS Calculation Engine Performance Snapshot (Read-Only)
                                        </span>
                                        <span className="pe-kpi-live-badge">Live KPI Pass-Through: {section.score.toFixed(1)}</span>
                                    </div>
                                    <p className="pe-kpi-box-description">
                                        Scores in this section are calculated automatically by the STARS calculation engine based on logged operational tasks, punctuality, and SLA accuracy over the evaluation window.
                                    </p>

                                    {section.kpiMetrics && section.kpiMetrics.length > 0 && (
                                        <div className="pe-kpi-metrics-grid">
                                            {section.kpiMetrics.map((km, kmIdx) => (
                                                <div
                                                    key={km.metricCode || kmIdx}
                                                    className="pe-kpi-metric-card"
                                                    onMouseEnter={() => setActiveTooltipMetric(km.metricCode)}
                                                    onMouseLeave={() => setActiveTooltipMetric(null)}
                                                >
                                                    <div className="pe-kpi-metric-header">
                                                        <span className="pe-kpi-metric-name">{km.metricName}</span>
                                                        <span className="pe-kpi-metric-code">{km.metricCode}</span>
                                                    </div>
                                                    <div className="pe-kpi-metric-values">
                                                        <div>
                                                            <span className="pe-metric-sublabel">Actual</span>
                                                            <span className="pe-metric-num">{km.value} {km.unit || ''}</span>
                                                        </div>
                                                        <div>
                                                            <span className="pe-metric-sublabel">Target</span>
                                                            <span className="pe-metric-num">{km.target} {km.unit || ''}</span>
                                                        </div>
                                                        <div>
                                                            <span className="pe-metric-sublabel">Score</span>
                                                            <span className="pe-metric-score-tag">{km.score.toFixed(1)}%</span>
                                                        </div>
                                                    </div>
                                                    {activeTooltipMetric === km.metricCode && (
                                                        <div className="pe-kpi-tooltip">
                                                            <strong>{km.metricName} ({km.metricCode})</strong>: Current value is {km.value} against target of {km.target} ({km.score.toFixed(1)}% achievement).
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Criteria Table */}
                            <div className="pe-criteria-table-container">
                                <table className="pe-criteria-grid-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '28%' }}>Criterion</th>
                                            <th style={{ width: '10%' }}>Weight</th>
                                            <th style={{ width: '14%' }}>Self Score (1–5)</th>
                                            <th style={{ width: '14%' }}>Manager Score (1–5)</th>
                                            <th style={{ width: '10%' }}>Gap</th>
                                            <th style={{ width: '24%' }}>Comments & Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section.criteria?.map((crit, cIdx) => {
                                            const local = localRatings[crit.criterionId] || {
                                                criterionId: crit.criterionId,
                                                selfScore: crit.selfScore ?? null,
                                                managerScore: crit.managerScore ?? null,
                                                selfComment: crit.selfComment ?? '',
                                                managerComment: crit.managerComment ?? ''
                                            };

                                            const sScore = local.selfScore;
                                            const mScore = local.managerScore;
                                            const hasBothScores = sScore !== null && mScore !== null;
                                            const diff = hasBothScores ? Math.round((mScore - sScore) * 10) / 10 : null;
                                            const absDiff = hasBothScores ? Math.abs(mScore - sScore) : null;
                                            const isOutlier = absDiff !== null && absDiff >= 2.0;

                                            return (
                                                <tr key={crit.criterionId || cIdx} className={isOutlier ? 'pe-row-outlier' : ''}>
                                                    {/* Title & Description */}
                                                    <td>
                                                        <div className="pe-criterion-title-cell">
                                                            <strong>{crit.criterionTitle}</strong>
                                                            {crit.metricCode && (
                                                                <span className="pe-criterion-code-tag">{crit.metricCode}</span>
                                                            )}
                                                            {section.isKpiSection && (
                                                                <span className="pe-criterion-kpi-auto-tag">System Evaluated</span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Weight */}
                                                    <td>
                                                        <span className="pe-criterion-weight-tag">{crit.weight}%</span>
                                                    </td>

                                                    {/* Self Score */}
                                                    <td>
                                                        {section.isKpiSection ? (
                                                            <span className="pe-score-readonly-pill">
                                                                {crit.selfScore != null ? crit.selfScore.toFixed(1) : '—'}
                                                            </span>
                                                        ) : (
                                                            <select
                                                                className="pe-score-select"
                                                                value={sScore === null ? '' : String(sScore)}
                                                                disabled={!canEditSelfScore}
                                                                onChange={e => handleScoreChange(crit.criterionId, 'selfScore', e.target.value)}
                                                                aria-label={`Self Score for ${crit.criterionTitle}`}
                                                            >
                                                                <option value="">—</option>
                                                                <option value="1">1.0 - Needs Improvement</option>
                                                                <option value="2">2.0 - Developing</option>
                                                                <option value="3">3.0 - Meets Expectations</option>
                                                                <option value="4">4.0 - Exceeds Expectations</option>
                                                                <option value="5">5.0 - Outstanding</option>
                                                            </select>
                                                        )}
                                                    </td>

                                                    {/* Manager Score */}
                                                    <td>
                                                        {section.isKpiSection ? (
                                                            <span className="pe-score-readonly-pill">
                                                                {crit.managerScore != null ? crit.managerScore.toFixed(1) : (section.score != null ? (section.score / 20).toFixed(1) : '—')}
                                                            </span>
                                                        ) : (
                                                            <select
                                                                className="pe-score-select"
                                                                value={mScore === null ? '' : String(mScore)}
                                                                disabled={!canEditManagerScore}
                                                                onChange={e => handleScoreChange(crit.criterionId, 'managerScore', e.target.value)}
                                                                aria-label={`Manager Score for ${crit.criterionTitle}`}
                                                            >
                                                                <option value="">—</option>
                                                                <option value="1">1.0 - Needs Improvement</option>
                                                                <option value="2">2.0 - Developing</option>
                                                                <option value="3">3.0 - Meets Expectations</option>
                                                                <option value="4">4.0 - Exceeds Expectations</option>
                                                                <option value="5">5.0 - Outstanding</option>
                                                            </select>
                                                        )}
                                                    </td>

                                                    {/* Gap & Outlier Badge */}
                                                    <td>
                                                        <div className="pe-gap-cell">
                                                            {diff !== null ? (
                                                                <span className={`pe-gap-value ${diff > 0 ? 'pe-gap-pos' : diff < 0 ? 'pe-gap-neg' : 'pe-gap-neutral'}`}>
                                                                    {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                                                                </span>
                                                            ) : (
                                                                <span className="pe-gap-empty">—</span>
                                                            )}

                                                            {isOutlier && (
                                                                <span
                                                                    className="pe-outlier-pill"
                                                                    title={`Significant discrepancy: |Manager (${mScore}) - Self (${sScore})| = ${absDiff?.toFixed(1)} ≥ 2.0`}
                                                                    data-testid={`outlier-badge-${crit.criterionId}`}
                                                                >
                                                                    <AlertTriangle size={11} /> Outlier (|Δ| ≥ 2)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Comments */}
                                                    <td>
                                                        <div className="pe-comment-cell-stack">
                                                            {/* Manager Comment */}
                                                            <textarea
                                                                className="pe-comment-textarea"
                                                                rows={2}
                                                                placeholder={canEditManagerScore ? 'Manager notes or feedback...' : (local.managerComment ? '' : 'No manager comment')}
                                                                value={local.managerComment}
                                                                disabled={!canEditManagerScore}
                                                                onChange={e => handleCommentChange(crit.criterionId, 'managerComment', e.target.value)}
                                                                aria-label={`Manager Comment for ${crit.criterionTitle}`}
                                                            />
                                                            {/* Self Comment preview / edit */}
                                                            {local.selfComment && (
                                                                <div className="pe-self-comment-preview">
                                                                    <small><strong>Self:</strong> {local.selfComment}</small>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Action Bar for Saving Ratings */}
            {!isLocked && (canEditSelfScore || canEditManagerScore) && (
                <div className="pe-rating-action-bar">
                    {saveMessage && (
                        <div className="pe-save-success-banner">
                            <CheckCircle2 size={16} color="#05cd99" />
                            <span>{saveMessage}</span>
                        </div>
                    )}
                    <div className="pe-action-buttons-group">
                        <button
                            type="button"
                            className="pe-btn pe-btn-secondary"
                            onClick={handleReset}
                            disabled={isSaving}
                        >
                            <RotateCcw size={15} />
                            Reset Changes
                        </button>
                        <button
                            type="button"
                            className="pe-btn pe-btn-primary"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            <Save size={15} />
                            {isSaving ? 'Saving Ratings...' : 'Save Ratings'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
