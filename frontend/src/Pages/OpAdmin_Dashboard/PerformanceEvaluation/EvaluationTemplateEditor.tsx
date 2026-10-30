import React, { useState, useMemo } from 'react';
import {
    Save,
    RotateCcw,
    Plus,
    Trash2,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    CheckCircle2,
    Sliders,
    Bot,
    Percent,
    Sparkles,
    BarChart3,
    Layers,
    Info
} from 'lucide-react';
import {
    EvaluationTemplate,
    EvaluationSection,
    EvaluationCriterion,
    RatingBand,
    DepartmentOption,
    CriterionType
} from './types';
import './PerformanceEvaluation.css';

interface EvaluationTemplateEditorProps {
    initialData?: EvaluationTemplate;
    departments: DepartmentOption[];
    onSave: (template: Partial<EvaluationTemplate>) => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
}

const DEFAULT_RATING_BANDS: RatingBand[] = [
    { label: 'Outstanding', minScore: 90, maxScore: 100, color: '#05cd99', description: 'Consistently exceeds all performance expectations', order: 1 },
    { label: 'Exceeds Expectations', minScore: 80, maxScore: 89.99, color: '#4318ff', description: 'Regularly surpasses job performance standards', order: 2 },
    { label: 'Meets Expectations', minScore: 70, maxScore: 79.99, color: '#00a99d', description: 'Fully achieves operational benchmarks and goals', order: 3 },
    { label: 'Needs Improvement', minScore: 60, maxScore: 69.99, color: '#ffb547', description: 'Performance falls below targets in several areas', order: 4 },
    { label: 'Unsatisfactory', minScore: 0, maxScore: 59.99, color: '#ee5d50', description: 'Consistently fails to meet essential requirements', order: 5 },
];

const DEFAULT_SECTIONS: EvaluationSection[] = [
    {
        title: 'Core Competencies & Behavioral Standards',
        description: 'Qualitative evaluation of execution, teamwork, and operational compliance.',
        weight: 60,
        order: 1,
        isKpiSection: false,
        criteria: [
            {
                title: 'Quality & Accuracy of Execution',
                description: 'Attention to detail, adherence to standards, and defect-free task output.',
                weight: 40,
                criterionType: 'Standard',
                order: 1
            },
            {
                title: 'Teamwork & Communication',
                description: 'Responsiveness, cross-functional collaboration, and effective issue reporting.',
                weight: 30,
                criterionType: 'Standard',
                order: 2
            },
            {
                title: 'Process Discipline & SLA Compliance',
                description: 'Punctuality, deadline adherence, and procedural compliance.',
                weight: 30,
                criterionType: 'Standard',
                order: 3
            }
        ]
    },
    {
        title: 'Operational KPI Performance',
        description: 'Automated evaluation derived directly from the STARS KPI Calculation Engine.',
        weight: 40,
        order: 2,
        isKpiSection: true,
        criteria: [
            {
                title: 'Overall KPI Scorecard',
                description: 'Aggregated weighted KPI performance score (OTIF, Accuracy, Completion, AHT).',
                weight: 100,
                criterionType: 'KpiLinked',
                metricCode: 'OVERALL_SCORE',
                order: 1
            }
        ]
    }
];

export const EvaluationTemplateEditor: React.FC<EvaluationTemplateEditorProps> = ({
    initialData,
    departments,
    onSave,
    onCancel,
    isSaving
}) => {
    // Template Header Form State
    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [targetRole, setTargetRole] = useState(initialData?.targetRole || '');
    const [departmentId, setDepartmentId] = useState(initialData?.departmentId || '');
    const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
    const [isAiEnabled, setIsAiEnabled] = useState(initialData?.isAiEnabled ?? true);

    // Sections State
    const [sections, setSections] = useState<EvaluationSection[]>(
        initialData?.sections?.length ? JSON.parse(JSON.stringify(initialData.sections)) : DEFAULT_SECTIONS
    );

    // Rating Bands State
    const [ratingBands, setRatingBands] = useState<RatingBand[]>(
        initialData?.ratingBands?.length ? JSON.parse(JSON.stringify(initialData.ratingBands)) : DEFAULT_RATING_BANDS
    );

    // Accordion expand/collapse state: keyed by section index
    const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>(() => {
        const init: Record<number, boolean> = {};
        const count = initialData?.sections?.length || DEFAULT_SECTIONS.length;
        for (let i = 0; i < count; i++) {
            init[i] = true; // start expanded
        }
        return init;
    });

    const [formErrors, setFormErrors] = useState<string[]>([]);

    const toggleSection = (index: number) => {
        setExpandedSections(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const expandAllSections = () => {
        const next: Record<number, boolean> = {};
        sections.forEach((_, idx) => { next[idx] = true; });
        setExpandedSections(next);
    };

    const collapseAllSections = () => {
        setExpandedSections({});
    };

    // Calculate Section Weights Sum
    const totalSectionWeight = useMemo(() => {
        const sum = sections.reduce((acc, s) => acc + (Number(s.weight) || 0), 0);
        return Math.round(sum * 100) / 100;
    }, [sections]);

    const isSectionWeightValid = useMemo(() => {
        return Math.abs(totalSectionWeight - 100.0) <= 0.5;
    }, [totalSectionWeight]);

    // Validation checks
    const validate = (): string[] => {
        const errors: string[] = [];
        if (!title.trim()) {
            errors.push('Template title is required.');
        }

        if (sections.length === 0) {
            errors.push('At least one evaluation section is required.');
        }

        if (!isSectionWeightValid) {
            errors.push(`Total section weights must equal 100% (currently ${totalSectionWeight}%).`);
        }

        let kpiSectionCount = 0;
        sections.forEach((sec, sIdx) => {
            if (!sec.title.trim()) {
                errors.push(`Section #${sIdx + 1} requires a title.`);
            }

            if (sec.isKpiSection) {
                kpiSectionCount++;
            }

            if (!sec.criteria || sec.criteria.length === 0) {
                errors.push(`Section "${sec.title || `#${sIdx + 1}`}" must contain at least one criterion.`);
            } else {
                const critWeightSum = Math.round(
                    sec.criteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0) * 100
                ) / 100;

                if (Math.abs(critWeightSum - 100.0) > 0.5) {
                    errors.push(
                        `Criteria weights in section "${sec.title || `#${sIdx + 1}`}" must equal 100% (currently ${critWeightSum}%).`
                    );
                }

                sec.criteria.forEach((crit, cIdx) => {
                    if (!crit.title.trim()) {
                        errors.push(`Criterion #${cIdx + 1} in section "${sec.title || `#${sIdx + 1}`}" requires a title.`);
                    }
                });
            }
        });

        if (kpiSectionCount > 1) {
            errors.push('At most one section can be marked as a KPI Section.');
        }

        if (ratingBands.length === 0) {
            errors.push('At least one rating band is required.');
        } else {
            ratingBands.forEach((band, bIdx) => {
                if (!band.label.trim()) {
                    errors.push(`Rating band #${bIdx + 1} requires a label.`);
                }
                if (band.minScore > band.maxScore) {
                    errors.push(`Rating band "${band.label || `#${bIdx + 1}`}" min score cannot exceed max score.`);
                }
            });
        }

        return errors;
    };

    // --- Section Handlers ---

    const handleAddSection = () => {
        const newSec: EvaluationSection = {
            title: `Section ${sections.length + 1}`,
            description: '',
            weight: 0,
            order: sections.length + 1,
            isKpiSection: false,
            criteria: [
                {
                    title: 'New Criterion',
                    description: '',
                    weight: 100,
                    criterionType: 'Standard',
                    order: 1
                }
            ]
        };
        const nextSections = [...sections, newSec];
        setSections(nextSections);
        setExpandedSections(prev => ({ ...prev, [nextSections.length - 1]: true }));
    };

    const handleRemoveSection = (index: number) => {
        const next = sections.filter((_, i) => i !== index).map((s, idx) => ({ ...s, order: idx + 1 }));
        setSections(next);
    };

    const handleSectionChange = (index: number, field: keyof EvaluationSection, value: any) => {
        setSections(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    // Mutual exclusion for KPI section radio
    const handleSetKpiSection = (selectedIndex: number | null) => {
        setSections(prev => prev.map((s, idx) => ({
            ...s,
            isKpiSection: selectedIndex === idx
        })));
    };

    // --- Criteria Handlers ---

    const handleAddCriterion = (sectionIndex: number) => {
        setSections(prev => {
            const next = [...prev];
            const section = { ...next[sectionIndex] };
            const nextCriteria = [
                ...section.criteria,
                {
                    title: '',
                    description: '',
                    weight: 0,
                    criterionType: (section.isKpiSection ? 'KpiLinked' : 'Standard') as CriterionType,
                    metricCode: section.isKpiSection ? 'OVERALL_SCORE' : undefined,
                    order: section.criteria.length + 1
                }
            ];
            section.criteria = nextCriteria;
            next[sectionIndex] = section;
            return next;
        });
    };

    const handleRemoveCriterion = (sectionIndex: number, criterionIndex: number) => {
        setSections(prev => {
            const next = [...prev];
            const section = { ...next[sectionIndex] };
            section.criteria = section.criteria
                .filter((_, i) => i !== criterionIndex)
                .map((c, idx) => ({ ...c, order: idx + 1 }));
            next[sectionIndex] = section;
            return next;
        });
    };

    const handleCriterionChange = (
        sectionIndex: number,
        criterionIndex: number,
        field: keyof EvaluationCriterion,
        value: any
    ) => {
        setSections(prev => {
            const next = [...prev];
            const section = { ...next[sectionIndex] };
            const criteria = [...section.criteria];
            criteria[criterionIndex] = {
                ...criteria[criterionIndex],
                [field]: value
            };
            section.criteria = criteria;
            next[sectionIndex] = section;
            return next;
        });
    };

    // --- Rating Band Handlers ---

    const handleAddRatingBand = () => {
        const newBand: RatingBand = {
            label: 'New Band',
            minScore: 0,
            maxScore: 50,
            color: '#64748b',
            description: '',
            order: ratingBands.length + 1
        };
        setRatingBands([...ratingBands, newBand]);
    };

    const handleRemoveRatingBand = (index: number) => {
        setRatingBands(ratingBands.filter((_, i) => i !== index).map((b, idx) => ({ ...b, order: idx + 1 })));
    };

    const handleRatingBandChange = (index: number, field: keyof RatingBand, value: any) => {
        setRatingBands(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    // --- Save Handler ---

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validate();
        if (errors.length > 0) {
            setFormErrors(errors);
            if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
        }

        setFormErrors([]);

        const payload: Partial<EvaluationTemplate> = {
            id: initialData?.id,
            title: title.trim(),
            description: description.trim() || null,
            targetRole: targetRole.trim() || null,
            departmentId: departmentId || null,
            isActive,
            isAiEnabled,
            sections: sections.map((sec, sIdx) => ({
                id: sec.id,
                title: sec.title.trim(),
                description: sec.description?.trim() || null,
                weight: Number(sec.weight) || 0,
                order: sIdx + 1,
                isKpiSection: !!sec.isKpiSection,
                criteria: sec.criteria.map((crit, cIdx) => ({
                    id: crit.id,
                    title: crit.title.trim(),
                    description: crit.description?.trim() || null,
                    weight: Number(crit.weight) || 0,
                    criterionType: crit.criterionType || (sec.isKpiSection ? 'KpiLinked' : 'Standard'),
                    metricCode: crit.metricCode?.trim() || null,
                    order: cIdx + 1
                }))
            })),
            ratingBands: ratingBands.map((band, bIdx) => ({
                id: band.id,
                label: band.label.trim(),
                minScore: Number(band.minScore) || 0,
                maxScore: Number(band.maxScore) || 0,
                color: band.color || null,
                description: band.description?.trim() || null,
                order: bIdx + 1
            }))
        };

        await onSave(payload);
    };

    return (
        <form className="pe-editor-container" onSubmit={handleSubmit}>
            {/* Header */}
            <div className="pe-editor-header">
                <h3>
                    <Sliders size={20} color="var(--teal, #00A99D)" />
                    {initialData?.id ? 'Edit Evaluation Template' : 'Create Evaluation Template'}
                </h3>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary"
                        onClick={onCancel}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="pe-btn pe-btn-primary"
                        disabled={isSaving}
                    >
                        <Save size={16} />
                        {isSaving ? 'Saving Template...' : 'Save Template'}
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {formErrors.length > 0 && (
                <div className="pe-weight-banner pe-weight-banner-invalid" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={18} />
                        <strong>Please resolve the following errors:</strong>
                    </div>
                    <ul style={{ margin: '6px 0 0 20px', padding: 0 }}>
                        {formErrors.map((err, idx) => (
                            <li key={idx} style={{ fontSize: '0.85rem' }}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Section Weight-Sum Overall Banner */}
            <div className={`pe-weight-banner ${isSectionWeightValid ? 'pe-weight-banner-valid' : 'pe-weight-banner-invalid'}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isSectionWeightValid ? (
                        <CheckCircle2 size={18} color="#05cd99" />
                    ) : (
                        <AlertCircle size={18} color="#ee5d50" />
                    )}
                    <span>
                        {isSectionWeightValid
                            ? 'Section weights are perfectly balanced (Total = 100%).'
                            : `Total section weights must sum to 100±0.5%. Current sum is ${totalSectionWeight}%.`}
                    </span>
                </div>
                <span className={`pe-weight-pill ${isSectionWeightValid ? 'pe-weight-pill-valid' : 'pe-weight-pill-invalid'}`}>
                    {totalSectionWeight}% / 100%
                </span>
            </div>

            {/* Template Core Info */}
            <div className="pe-form-row">
                <div className="pe-form-group">
                    <label>
                        Template Title <span style={{ color: '#ee5d50' }}>*</span>
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g., Annual Courier Operational Review"
                        required
                    />
                </div>
                <div className="pe-form-group">
                    <label>Target Role (Optional)</label>
                    <input
                        type="text"
                        value={targetRole}
                        onChange={e => setTargetRole(e.target.value)}
                        placeholder="e.g., Courier, Operations Coordinator, Dispatcher"
                    />
                </div>
                <div className="pe-form-group">
                    <label>Department Scope (Optional)</label>
                    <select
                        value={departmentId}
                        onChange={e => setDepartmentId(e.target.value)}
                    >
                        <option value="">All Departments (Company-wide)</option>
                        {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>
                                {dept.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="pe-form-group">
                <label>Description</label>
                <textarea
                    rows={2}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Provide guidelines, cycle context, or objectives for this performance template..."
                />
            </div>

            {/* Toggles: Active & AI Recommendation */}
            <div className="pe-form-row">
                <div className="pe-toggle-group">
                    <input
                        type="checkbox"
                        id="pe-active-toggle"
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <label htmlFor="pe-active-toggle" className="pe-toggle-label" style={{ cursor: 'pointer' }}>
                        Active Template
                        <span className="pe-toggle-desc">Available for initiating new performance reviews</span>
                    </label>
                </div>

                <div className="pe-toggle-group">
                    <input
                        type="checkbox"
                        id="pe-ai-toggle"
                        checked={isAiEnabled}
                        onChange={e => setIsAiEnabled(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <label htmlFor="pe-ai-toggle" className="pe-toggle-label" style={{ cursor: 'pointer' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Bot size={16} color="var(--primary, #4318ff)" />
                            Enable AI Recommendations
                        </span>
                        <span className="pe-toggle-desc">Synthesize strengths and development items via Groq LLM</span>
                    </label>
                </div>
            </div>

            {/* Sections Accordion Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 18 }}>
                <div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary, #1e293b)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={18} color="var(--teal, #00A99D)" />
                        Evaluation Sections & Criteria
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                        Define weighted evaluation sections. At most one section may be linked to automated KPI metrics.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary pe-btn-sm"
                        onClick={expandAllSections}
                    >
                        Expand All
                    </button>
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary pe-btn-sm"
                        onClick={collapseAllSections}
                    >
                        Collapse All
                    </button>
                    <button
                        type="button"
                        className="pe-btn pe-btn-primary pe-btn-sm"
                        onClick={handleAddSection}
                    >
                        <Plus size={14} /> Add Section
                    </button>
                </div>
            </div>

            {/* Sections List */}
            <div className="pe-sections-container">
                {sections.map((section, sIdx) => {
                    const isExpanded = !!expandedSections[sIdx];
                    const critSum = Math.round(
                        (section.criteria || []).reduce((acc, c) => acc + (Number(c.weight) || 0), 0) * 100
                    ) / 100;
                    const isCritValid = Math.abs(critSum - 100.0) <= 0.5;

                    return (
                        <div key={sIdx} className="pe-section-accordion-card">
                            {/* Accordion Header */}
                            <div
                                className={`pe-section-header ${isExpanded ? 'expanded' : ''}`}
                                onClick={() => toggleSection(sIdx)}
                            >
                                <div className="pe-section-header-left">
                                    <span className="pe-section-order-badge">#{sIdx + 1}</span>
                                    <div>
                                        <div className="pe-section-header-title">
                                            {section.title || `Untitled Section #${sIdx + 1}`}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                            <span className="pe-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                                                Weight: {section.weight}%
                                            </span>
                                            {section.isKpiSection ? (
                                                <span className="pe-badge pe-badge-kpi">
                                                    <BarChart3 size={12} /> KPI Section
                                                </span>
                                            ) : (
                                                <span className="pe-badge" style={{ background: 'rgba(67, 24, 255, 0.08)', color: '#4318ff' }}>
                                                    Standard Section
                                                </span>
                                            )}
                                            <span className={`pe-badge ${isCritValid ? 'pe-badge-active' : 'pe-badge-inactive'}`}>
                                                Criteria: {section.criteria?.length || 0} ({critSum}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="pe-section-header-right" onClick={e => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className="pe-btn-icon"
                                        title="Delete Section"
                                        onClick={() => handleRemoveSection(sIdx)}
                                        disabled={sections.length <= 1}
                                        style={{ color: '#ee5d50' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className="pe-btn-icon"
                                        onClick={() => toggleSection(sIdx)}
                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                    >
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Accordion Body */}
                            {isExpanded && (
                                <div className="pe-section-body">
                                    <div className="pe-form-row">
                                        <div className="pe-form-group" style={{ flex: 2 }}>
                                            <label>Section Title <span style={{ color: '#ee5d50' }}>*</span></label>
                                            <input
                                                type="text"
                                                value={section.title}
                                                onChange={e => handleSectionChange(sIdx, 'title', e.target.value)}
                                                placeholder="e.g. Core Competencies or Operational KPI"
                                                required
                                            />
                                        </div>
                                        <div className="pe-form-group" style={{ width: 140 }}>
                                            <label>Section Weight (%) <span style={{ color: '#ee5d50' }}>*</span></label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                step={0.5}
                                                value={section.weight}
                                                onChange={e => handleSectionChange(sIdx, 'weight', parseFloat(e.target.value) || 0)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="pe-form-group">
                                        <label>Section Description (Optional)</label>
                                        <input
                                            type="text"
                                            value={section.description || ''}
                                            onChange={e => handleSectionChange(sIdx, 'description', e.target.value)}
                                            placeholder="Brief explanation of how this section is evaluated..."
                                        />
                                    </div>

                                    {/* KPI Section Radio Selector */}
                                    <div className="pe-toggle-group">
                                        <input
                                            type="radio"
                                            name="kpi-section-radio"
                                            id={`kpi-sec-${sIdx}`}
                                            checked={!!section.isKpiSection}
                                            onChange={() => handleSetKpiSection(section.isKpiSection ? null : sIdx)}
                                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                                        />
                                        <label htmlFor={`kpi-sec-${sIdx}`} className="pe-toggle-label" style={{ cursor: 'pointer' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <BarChart3 size={15} color="var(--teal, #00A99D)" />
                                                Designate as KPI Section (Auto-calculated via KPI Engine)
                                            </span>
                                            <span className="pe-toggle-desc">
                                                Scores in this section are dynamically fed from employee task KPI metrics rather than manual evaluator rating.
                                            </span>
                                        </label>
                                    </div>

                                    {/* Criteria Weight Banner */}
                                    <div className={`pe-weight-banner ${isCritValid ? 'pe-weight-banner-valid' : 'pe-weight-banner-invalid'}`} style={{ padding: '8px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.825rem' }}>
                                            {isCritValid ? (
                                                <CheckCircle2 size={15} color="#05cd99" />
                                            ) : (
                                                <AlertCircle size={15} color="#ee5d50" />
                                            )}
                                            <span>
                                                {isCritValid
                                                    ? 'Criteria weights sum to 100%.'
                                                    : `Criteria weights must sum to 100±0.5% (Current: ${critSum}%).`}
                                            </span>
                                        </div>
                                        <span className={`pe-weight-pill ${isCritValid ? 'pe-weight-pill-valid' : 'pe-weight-pill-invalid'}`}>
                                            {critSum}%
                                        </span>
                                    </div>

                                    {/* Criteria Table */}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="pe-criteria-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 35 }}>#</th>
                                                    <th>Criterion Title</th>
                                                    <th style={{ width: 140 }}>Type</th>
                                                    <th style={{ width: 140 }}>Metric Code</th>
                                                    <th style={{ width: 110 }}>Weight (%)</th>
                                                    <th style={{ width: 45 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {section.criteria.map((crit, cIdx) => (
                                                    <tr key={cIdx}>
                                                        <td style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                                                            {cIdx + 1}
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={crit.title}
                                                                onChange={e => handleCriterionChange(sIdx, cIdx, 'title', e.target.value)}
                                                                placeholder="e.g. Quality of Output"
                                                                style={{ width: '100%' }}
                                                                required
                                                            />
                                                        </td>
                                                        <td>
                                                            <select
                                                                value={crit.criterionType}
                                                                onChange={e => handleCriterionChange(sIdx, cIdx, 'criterionType', e.target.value as CriterionType)}
                                                                style={{ width: '100%' }}
                                                            >
                                                                <option value="Standard">Standard (1-5)</option>
                                                                <option value="KpiLinked">KPI-Linked</option>
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                value={crit.metricCode || ''}
                                                                onChange={e => handleCriterionChange(sIdx, cIdx, 'metricCode', e.target.value)}
                                                                placeholder="e.g. OVERALL_SCORE"
                                                                disabled={crit.criterionType !== 'KpiLinked'}
                                                                style={{
                                                                    width: '100%',
                                                                    opacity: crit.criterionType === 'KpiLinked' ? 1 : 0.5
                                                                }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                step={0.5}
                                                                value={crit.weight}
                                                                onChange={e => handleCriterionChange(sIdx, cIdx, 'weight', parseFloat(e.target.value) || 0)}
                                                                style={{ width: '100%' }}
                                                                required
                                                            />
                                                        </td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="pe-btn-icon"
                                                                title="Delete Criterion"
                                                                onClick={() => handleRemoveCriterion(sIdx, cIdx)}
                                                                disabled={section.criteria.length <= 1}
                                                                style={{ color: '#ee5d50' }}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                        <button
                                            type="button"
                                            className="pe-btn pe-btn-secondary pe-btn-sm"
                                            onClick={() => handleAddCriterion(sIdx)}
                                        >
                                            <Plus size={13} /> Add Criterion
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Rating Bands Section */}
            <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary, #1e293b)' }}>
                            Performance Rating Bands
                        </h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                            Maps overall normalized scores (0 to 100) to qualitative rating labels and color indicators.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary pe-btn-sm"
                        onClick={handleAddRatingBand}
                    >
                        <Plus size={13} /> Add Rating Band
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="pe-bands-table">
                        <thead>
                            <tr>
                                <th style={{ width: 35 }}>#</th>
                                <th style={{ width: 200 }}>Label</th>
                                <th style={{ width: 110 }}>Min Score</th>
                                <th style={{ width: 110 }}>Max Score</th>
                                <th style={{ width: 100 }}>Color</th>
                                <th>Description</th>
                                <th style={{ width: 45 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {ratingBands.map((band, bIdx) => (
                                <tr key={bIdx}>
                                    <td style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                                        {bIdx + 1}
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={band.label}
                                            onChange={e => handleRatingBandChange(bIdx, 'label', e.target.value)}
                                            placeholder="e.g. Outstanding"
                                            style={{ width: '100%' }}
                                            required
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.1}
                                            value={band.minScore}
                                            onChange={e => handleRatingBandChange(bIdx, 'minScore', parseFloat(e.target.value) || 0)}
                                            style={{ width: '100%' }}
                                            required
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.1}
                                            value={band.maxScore}
                                            onChange={e => handleRatingBandChange(bIdx, 'maxScore', parseFloat(e.target.value) || 0)}
                                            style={{ width: '100%' }}
                                            required
                                        />
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input
                                                type="color"
                                                value={band.color || '#4318ff'}
                                                onChange={e => handleRatingBandChange(bIdx, 'color', e.target.value)}
                                                style={{ width: 32, height: 32, padding: 0, border: 'none', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                                {band.color || '#4318ff'}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={band.description || ''}
                                            onChange={e => handleRatingBandChange(bIdx, 'description', e.target.value)}
                                            placeholder="Evaluation guidelines for this rating level..."
                                            style={{ width: '100%' }}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="pe-btn-icon"
                                            title="Delete Band"
                                            onClick={() => handleRemoveRatingBand(bIdx)}
                                            disabled={ratingBands.length <= 1}
                                            style={{ color: '#ee5d50' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="pe-editor-footer">
                <button
                    type="button"
                    className="pe-btn pe-btn-secondary"
                    onClick={onCancel}
                    disabled={isSaving}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="pe-btn pe-btn-primary"
                    disabled={isSaving}
                >
                    <Save size={16} />
                    {isSaving ? 'Saving Template...' : 'Save Template'}
                </button>
            </div>
        </form>
    );
};
