import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Plus,
    Search,
    Calendar,
    Filter,
    Shield,
    Layers,
    User,
    Building,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Loader2,
    RotateCcw,
    Award,
    Eye,
    X,
    FolderKanban
} from 'lucide-react';
import { useToast } from '../../../components/Toast/Toast';
import {
    PerformanceReviewSummaryDTO,
    EvaluationTemplate,
    DepartmentOption,
    ReviewScope,
    ReviewWorkflowStatus,
    CreatePerformanceReviewDTO
} from './types';
import {
    fetchReviews,
    fetchTemplates,
    createReview
} from '../../../services/performanceEvaluationService';
import { ReviewDetailView } from './ReviewDetailView';
import './PerformanceEvaluation.css';

interface PerformanceReviewTabProps {
    departments?: DepartmentOption[];
}

export const PerformanceReviewTab: React.FC<PerformanceReviewTabProps> = ({
    departments = []
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {}, info: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error, info: t.info };
        }
    } catch {
        // Fallback outside ToastProvider
    }
    const { success, error } = toastMethods;

    // Review list state
    const [reviews, setReviews] = useState<PerformanceReviewSummaryDTO[]>([]);
    const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string>('');

    // Detail view mode
    const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<ReviewWorkflowStatus | 'ALL'>('ALL');
    const [filterScope, setFilterScope] = useState<ReviewScope | 'ALL'>('ALL');
    const [filterTemplateId, setFilterTemplateId] = useState<string>('ALL');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(6);

    // Create Modal state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [createForm, setCreateForm] = useState<CreatePerformanceReviewDTO>({
        templateId: '',
        title: '',
        description: '',
        scope: 'Department',
        periodStart: '',
        periodEnd: '',
        departmentId: '',
        employeeId: undefined
    });

    // Load reviews and templates
    const loadData = useCallback(async () => {
        setLoading(true);
        setApiError('');
        try {
            const [reviewsRes, templatesRes] = await Promise.allSettled([
                fetchReviews({
                    status: filterStatus !== 'ALL' ? filterStatus : undefined,
                    scope: filterScope !== 'ALL' ? filterScope : undefined,
                    startDate: startDate || undefined,
                    endDate: endDate || undefined
                }),
                fetchTemplates({ activeOnly: true })
            ]);

            if (reviewsRes.status === 'fulfilled') {
                setReviews(reviewsRes.value);
            } else {
                const err = reviewsRes.reason;
                const msg = err?.response?.data?.message || err?.message || 'Failed to load performance reviews.';
                setApiError(msg);
                error(msg);
            }

            if (templatesRes.status === 'fulfilled') {
                setTemplates(templatesRes.value);
            } else {
                const err = templatesRes.reason;
                const msg = err?.response?.data?.message || err?.message || 'Failed to load evaluation templates.';
                error(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterScope, startDate, endDate, error]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Client-side filtering for template and search query
    const filteredReviews = useMemo(() => {
        return reviews.filter(rev => {
            if (filterTemplateId !== 'ALL' && rev.templateId !== filterTemplateId) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = rev.title?.toLowerCase().includes(q);
                const matchTemplate = rev.templateTitle?.toLowerCase().includes(q);
                const matchDept = rev.departmentName?.toLowerCase().includes(q);
                const matchEmp = rev.employeeName?.toLowerCase().includes(q);
                if (!matchTitle && !matchTemplate && !matchDept && !matchEmp) {
                    return false;
                }
            }
            return true;
        });
    }, [reviews, filterTemplateId, searchQuery]);

    // Pagination calculations
    const totalRecords = filteredReviews.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const paginatedReviews = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredReviews.slice(start, start + pageSize);
    }, [filteredReviews, currentPage, pageSize]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterStatus, filterScope, filterTemplateId, startDate, endDate, pageSize]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterStatus('ALL');
        setFilterScope('ALL');
        setFilterTemplateId('ALL');
        setStartDate('');
        setEndDate('');
    };

    // Create Modal handlers
    const openCreateModal = () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

        setCreateForm({
            templateId: templates.length > 0 ? templates[0].id || '' : '',
            title: '',
            description: '',
            scope: 'Department',
            periodStart: startOfMonth,
            periodEnd: endOfMonth,
            departmentId: departments.length > 0 ? departments[0].id : '',
            employeeId: undefined
        });
        setFormErrors({});
        setIsCreateModalOpen(true);
    };

    const validateCreateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!createForm.title.trim()) {
            errors.title = 'Review title is required.';
        }
        if (!createForm.templateId) {
            errors.templateId = 'Please select an evaluation template.';
        }
        if (!createForm.periodStart) {
            errors.periodStart = 'Period start date is required.';
        }
        if (!createForm.periodEnd) {
            errors.periodEnd = 'Period end date is required.';
        } else if (createForm.periodStart && createForm.periodEnd < createForm.periodStart) {
            errors.periodEnd = 'Period end date cannot be earlier than start date.';
        }
        if (createForm.scope === 'Department' && !createForm.departmentId) {
            errors.departmentId = 'Department selection is required for department scope.';
        }
        if (createForm.scope === 'Individual' && !createForm.employeeId) {
            errors.employeeId = 'Employee ID is required for individual scope reviews.';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateCreateForm()) return;

        setIsCreating(true);
        try {
            const created = await createReview({
                ...createForm,
                departmentId: createForm.scope === 'Department' ? createForm.departmentId : undefined,
                employeeId: createForm.scope === 'Individual' ? createForm.employeeId : undefined
            });
            success(`Performance review '${created.title}' created successfully.`);
            setIsCreateModalOpen(false);
            await loadData();
            // Automatically open detail view of newly created review
            setSelectedReviewId(created.id);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to create performance review.';
            error(msg);
        } finally {
            setIsCreating(false);
        }
    };

    // If detail view is open
    if (selectedReviewId) {
        return (
            <ReviewDetailView
                reviewId={selectedReviewId}
                onBack={() => {
                    setSelectedReviewId(null);
                    loadData();
                }}
            />
        );
    }

    return (
        <div className="pe-reviews-tab-container">
            {/* Header Card */}
            <div className="pe-header-card">
                <div className="pe-header-title">
                    <h2>
                        <FolderKanban size={22} color="var(--teal, #00A99D)" />
                        Performance Reviews & Evaluations
                    </h2>
                    <p>
                        Track, rate, and advance employee evaluation cycles through structured workflow stages.
                    </p>
                </div>

                <div className="pe-header-actions">
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary"
                        onClick={loadData}
                        disabled={loading}
                        title="Refresh Reviews"
                    >
                        <RotateCcw size={15} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="pe-btn pe-btn-primary"
                        onClick={openCreateModal}
                    >
                        <Plus size={16} />
                        New Review Cycle
                    </button>
                </div>
            </div>

            {/* Filter Bar with Date-Range Picker, Scope, Template, and Status */}
            <div className="pe-review-filter-bar">
                {/* Search */}
                <div className="pe-search-input">
                    <Search size={16} className="pe-search-icon" />
                    <input
                        type="text"
                        placeholder="Search review by title, template, or department..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Status Selector */}
                <div className="pe-filter-item">
                    <label htmlFor="pe-filter-status" className="pe-filter-label">Status</label>
                    <select
                        id="pe-filter-status"
                        className="pe-filter-select"
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value as any)}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="SelfAssessment">Self-Assessment</option>
                        <option value="ManagerReview">Manager Review</option>
                        <option value="HrReview">HR Review</option>
                        <option value="Acknowledgment">Acknowledgment</option>
                        <option value="Finalized">Finalized</option>
                    </select>
                </div>

                {/* Scope Selector */}
                <div className="pe-filter-item">
                    <label htmlFor="pe-filter-scope" className="pe-filter-label">Scope</label>
                    <select
                        id="pe-filter-scope"
                        className="pe-filter-select"
                        value={filterScope}
                        onChange={e => setFilterScope(e.target.value as any)}
                    >
                        <option value="ALL">All Scopes</option>
                        <option value="Department">Department</option>
                        <option value="Team">Team</option>
                        <option value="Individual">Individual</option>
                    </select>
                </div>

                {/* Template Selector */}
                <div className="pe-filter-item">
                    <label htmlFor="pe-filter-template" className="pe-filter-label">Template</label>
                    <select
                        id="pe-filter-template"
                        className="pe-filter-select"
                        value={filterTemplateId}
                        onChange={e => setFilterTemplateId(e.target.value)}
                    >
                        <option value="ALL">All Templates</option>
                        {templates.map(tmpl => (
                            <option key={tmpl.id} value={tmpl.id}>
                                {tmpl.title}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Date-Range Picker: Start Date */}
                <div className="pe-filter-item">
                    <label htmlFor="pe-filter-start-date" className="pe-filter-label">From</label>
                    <input
                        id="pe-filter-start-date"
                        type="date"
                        className="pe-filter-date-input"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        title="Evaluation Start Date"
                    />
                </div>

                {/* Date-Range Picker: End Date */}
                <div className="pe-filter-item">
                    <label htmlFor="pe-filter-end-date" className="pe-filter-label">To</label>
                    <input
                        id="pe-filter-end-date"
                        type="date"
                        className="pe-filter-date-input"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        title="Evaluation End Date"
                    />
                </div>

                {/* Clear Filters */}
                {(searchQuery || filterStatus !== 'ALL' || filterScope !== 'ALL' || filterTemplateId !== 'ALL' || startDate || endDate) && (
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary pe-btn-sm"
                        onClick={handleClearFilters}
                        title="Reset all filters"
                    >
                        <X size={14} /> Clear
                    </button>
                )}
            </div>

            {/* Content / List Area */}
            {loading ? (
                <div className="pe-loading-state">
                    <Loader2 className="pe-spinner" size={32} />
                    <p>Loading performance reviews...</p>
                </div>
            ) : apiError ? (
                <div className="pe-error-card">
                    <AlertCircle size={28} color="#ee5d50" />
                    <h4>Failed to Retrieve Reviews</h4>
                    <p>{apiError}</p>
                    <button type="button" className="pe-btn pe-btn-secondary" onClick={loadData}>
                        Retry
                    </button>
                </div>
            ) : paginatedReviews.length === 0 ? (
                <div className="pe-empty-state">
                    <FolderKanban size={40} color="#94a3b8" />
                    <h4>No Performance Reviews Found</h4>
                    <p>
                        {reviews.length === 0
                            ? 'No evaluation cycles have been initiated yet. Click "New Review Cycle" to create your first performance review.'
                            : 'No review cycles match the current filter criteria. Try adjusting or clearing your filters.'}
                    </p>
                    {reviews.length === 0 && (
                        <button type="button" className="pe-btn pe-btn-primary" onClick={openCreateModal}>
                            <Plus size={16} /> Create Review Cycle
                        </button>
                    )}
                </div>
            ) : (
                <div className="pe-reviews-grid">
                    {paginatedReviews.map(rev => (
                        <div
                            key={rev.id}
                            className="pe-review-card"
                            onClick={() => setSelectedReviewId(rev.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    setSelectedReviewId(rev.id);
                                }
                            }}
                            data-testid={`review-card-${rev.id}`}
                        >
                            <div className="pe-review-card-top">
                                <div className="pe-review-card-title-col">
                                    <h4 className="pe-review-card-title">{rev.title}</h4>
                                    <span className="pe-review-card-template-sub">
                                        <Layers size={13} /> {rev.templateTitle}
                                    </span>
                                </div>
                                <span className={`pe-workflow-badge pe-stage-${rev.status.toLowerCase()}`}>
                                    {rev.status}
                                </span>
                            </div>

                            {rev.description && (
                                <p className="pe-review-card-desc">{rev.description}</p>
                            )}

                            {/* Badges Row */}
                            <div className="pe-badges-row">
                                <span className="pe-badge pe-badge-role">
                                    <Shield size={12} /> {rev.scope}
                                </span>
                                {rev.departmentName && (
                                    <span className="pe-badge pe-badge-kpi">
                                        <Building size={12} /> {rev.departmentName}
                                    </span>
                                )}
                                {rev.employeeName && (
                                    <span className="pe-badge pe-badge-ai">
                                        <User size={12} /> {rev.employeeName}
                                    </span>
                                )}
                                {rev.isFinalized && (
                                    <span className="pe-badge pe-badge-finalized">
                                        <CheckCircle2 size={12} /> Finalized
                                    </span>
                                )}
                            </div>

                            {/* Card Footer / Period Meta */}
                            <div className="pe-card-meta">
                                <div className="pe-period-meta-span">
                                    <Calendar size={13} />
                                    <span>{rev.periodStart?.slice(0, 10)} to {rev.periodEnd?.slice(0, 10)}</span>
                                </div>
                                <button
                                    type="button"
                                    className="pe-btn pe-btn-sm pe-btn-primary"
                                    onClick={e => {
                                        e.stopPropagation();
                                        setSelectedReviewId(rev.id);
                                    }}
                                >
                                    <Eye size={13} />
                                    View / Rate
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination Controls */}
            {filteredReviews.length > 0 && (
                <div className="pe-pagination-bar">
                    <div className="pe-pagination-info">
                        Showing <strong>{Math.min(filteredReviews.length, (currentPage - 1) * pageSize + 1)}</strong> to{' '}
                        <strong>{Math.min(filteredReviews.length, currentPage * pageSize)}</strong> of{' '}
                        <strong>{filteredReviews.length}</strong> reviews
                    </div>

                    <div className="pe-pagination-controls">
                        <select
                            className="pe-filter-select pe-page-size-select"
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            aria-label="Reviews per page"
                        >
                            <option value="6">6 per page</option>
                            <option value="12">12 per page</option>
                            <option value="24">24 per page</option>
                        </select>

                        <button
                            type="button"
                            className="pe-pagination-btn"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            aria-label="Previous Page"
                        >
                            <ChevronLeft size={16} />
                        </button>

                        <span className="pe-page-number-display">
                            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                        </span>

                        <button
                            type="button"
                            className="pe-pagination-btn"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            aria-label="Next Page"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Create Review Modal */}
            {isCreateModalOpen && (
                <div className="pe-modal-overlay">
                    <div className="pe-modal-card">
                        <div className="pe-modal-header">
                            <h3>
                                <FolderKanban size={18} color="var(--teal, #00A99D)" />
                                Create Performance Review Cycle
                            </h3>
                            <button
                                type="button"
                                className="pe-btn-icon"
                                onClick={() => setIsCreateModalOpen(false)}
                                aria-label="Close modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} className="pe-modal-form">
                            {/* Template Selector */}
                            <div className="pe-form-group">
                                <label htmlFor="new-rev-template">
                                    Evaluation Template <span className="pe-req">*</span>
                                </label>
                                <select
                                    id="new-rev-template"
                                    value={createForm.templateId}
                                    onChange={e => setCreateForm(prev => ({ ...prev, templateId: e.target.value }))}
                                >
                                    <option value="">-- Select Template --</option>
                                    {templates.map(tmpl => (
                                        <option key={tmpl.id} value={tmpl.id}>
                                            {tmpl.title} ({tmpl.sections.length} sections, {tmpl.isAiEnabled ? 'AI Enabled' : 'No AI'})
                                        </option>
                                    ))}
                                </select>
                                {formErrors.templateId && <span className="pe-error-text">{formErrors.templateId}</span>}
                            </div>

                            {/* Title */}
                            <div className="pe-form-group">
                                <label htmlFor="new-rev-title">
                                    Review Cycle Title <span className="pe-req">*</span>
                                </label>
                                <input
                                    id="new-rev-title"
                                    type="text"
                                    placeholder="e.g. Q4 2026 Logistics Courier Performance Review"
                                    value={createForm.title}
                                    onChange={e => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                                />
                                {formErrors.title && <span className="pe-error-text">{formErrors.title}</span>}
                            </div>

                            {/* Description */}
                            <div className="pe-form-group">
                                <label htmlFor="new-rev-desc">Description</label>
                                <textarea
                                    id="new-rev-desc"
                                    rows={2}
                                    placeholder="Optional notes or evaluation cycle context..."
                                    value={createForm.description || ''}
                                    onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            {/* Scope Selector */}
                            <div className="pe-form-group">
                                <label htmlFor="new-rev-scope">
                                    Evaluation Scope <span className="pe-req">*</span>
                                </label>
                                <select
                                    id="new-rev-scope"
                                    value={createForm.scope}
                                    onChange={e => setCreateForm(prev => ({ ...prev, scope: e.target.value as ReviewScope }))}
                                >
                                    <option value="Department">Department (All employees in department)</option>
                                    <option value="Individual">Individual (Single employee)</option>
                                </select>
                            </div>

                            {/* Department (if Department scope) */}
                            {createForm.scope === 'Department' && (
                                <div className="pe-form-group">
                                    <label htmlFor="new-rev-dept">
                                        Target Department <span className="pe-req">*</span>
                                    </label>
                                    <select
                                        id="new-rev-dept"
                                        value={createForm.departmentId || ''}
                                        onChange={e => setCreateForm(prev => ({ ...prev, departmentId: e.target.value }))}
                                    >
                                        <option value="">-- Select Department --</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    {formErrors.departmentId && <span className="pe-error-text">{formErrors.departmentId}</span>}
                                </div>
                            )}

                            {/* Employee ID (if Individual scope) */}
                            {createForm.scope === 'Individual' && (
                                <div className="pe-form-group">
                                    <label htmlFor="new-rev-emp">
                                        Employee GUID <span className="pe-req">*</span>
                                    </label>
                                    <input
                                        id="new-rev-emp"
                                        type="text"
                                        placeholder="Enter target employee ID (GUID)"
                                        value={createForm.employeeId || ''}
                                        onChange={e => setCreateForm(prev => ({ ...prev, employeeId: e.target.value }))}
                                    />
                                    {formErrors.employeeId && <span className="pe-error-text">{formErrors.employeeId}</span>}
                                </div>
                            )}

                            {/* Date Range: Start and End */}
                            <div className="pe-form-row">
                                <div className="pe-form-group">
                                    <label htmlFor="new-rev-start">
                                        Period Start Date <span className="pe-req">*</span>
                                    </label>
                                    <input
                                        id="new-rev-start"
                                        type="date"
                                        value={createForm.periodStart}
                                        onChange={e => setCreateForm(prev => ({ ...prev, periodStart: e.target.value }))}
                                    />
                                    {formErrors.periodStart && <span className="pe-error-text">{formErrors.periodStart}</span>}
                                </div>
                                <div className="pe-form-group">
                                    <label htmlFor="new-rev-end">
                                        Period End Date <span className="pe-req">*</span>
                                    </label>
                                    <input
                                        id="new-rev-end"
                                        type="date"
                                        value={createForm.periodEnd}
                                        onChange={e => setCreateForm(prev => ({ ...prev, periodEnd: e.target.value }))}
                                    />
                                    {formErrors.periodEnd && <span className="pe-error-text">{formErrors.periodEnd}</span>}
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="pe-modal-footer">
                                <button
                                    type="button"
                                    className="pe-btn pe-btn-secondary"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    disabled={isCreating}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pe-btn pe-btn-primary"
                                    disabled={isCreating}
                                >
                                    {isCreating ? (
                                        <>
                                            <Loader2 className="pe-spinner" size={14} /> Creating...
                                        </>
                                    ) : (
                                        'Create Review Cycle'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
