import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Sliders,
    Plus,
    Search,
    Pencil,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Building,
    UserCheck,
    Layers,
    Loader2,
    RotateCcw,
    Bot,
    BarChart3
} from 'lucide-react';
import { useToast } from '../../../components/Toast/Toast';
import ConfirmationModal from '../../../components/ConfirmationModal/ConfirmationModal';
import {
    EvaluationTemplate,
    DepartmentOption
} from './types';
import {
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate
} from '../../../services/performanceEvaluationService';
import { EvaluationTemplateEditor } from './EvaluationTemplateEditor';
import './PerformanceEvaluation.css';

interface EvaluationTemplateTabProps {
    departments?: DepartmentOption[];
}

export const EvaluationTemplateTab: React.FC<EvaluationTemplateTabProps> = ({
    departments = []
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {}, info: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error, info: t.info };
        }
    } catch {
        // Fallback when rendered outside ToastProvider
    }
    const { success, error } = toastMethods;

    // Data state
    const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string>('');

    // Editor mode
    const [editorMode, setEditorMode] = useState<boolean>(false);
    const [editingTemplate, setEditingTemplate] = useState<EvaluationTemplate | undefined>(undefined);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Delete modal
    const [deletingTemplate, setDeletingTemplate] = useState<EvaluationTemplate | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterDepartment, setFilterDepartment] = useState<string>('');
    const [filterRole, setFilterRole] = useState<string>('');
    const [filterActive, setFilterActive] = useState<string>('all');

    // Fetch templates
    const loadTemplates = useCallback(async () => {
        setLoading(true);
        setApiError('');
        try {
            const params: Record<string, any> = {};
            if (filterDepartment) params.departmentId = filterDepartment;
            if (filterRole) params.targetRole = filterRole;
            if (filterActive === 'active') params.activeOnly = true;

            const data = await fetchTemplates(params);
            setTemplates(data);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to load evaluation templates.';
            setApiError(msg);
            error(msg);
        } finally {
            setLoading(false);
        }
    }, [filterDepartment, filterRole, filterActive, error]);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    // Filtered templates in-memory
    const filteredTemplates = useMemo(() => {
        return templates.filter(tmpl => {
            if (filterActive === 'inactive' && tmpl.isActive) return false;
            if (filterActive === 'active' && !tmpl.isActive) return false;
            if (filterDepartment && tmpl.departmentId !== filterDepartment) return false;
            if (filterRole && (!tmpl.targetRole || !tmpl.targetRole.toLowerCase().includes(filterRole.toLowerCase()))) return false;

            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchTitle = tmpl.title.toLowerCase().includes(query);
                const matchDesc = tmpl.description?.toLowerCase().includes(query) ?? false;
                const matchRole = tmpl.targetRole?.toLowerCase().includes(query) ?? false;
                const matchDept = tmpl.department?.name?.toLowerCase().includes(query) ?? false;
                if (!matchTitle && !matchDesc && !matchRole && !matchDept) return false;
            }
            return true;
        });
    }, [templates, searchQuery, filterActive, filterDepartment, filterRole]);

    // Handle Create New
    const handleStartCreate = () => {
        setEditingTemplate(undefined);
        setEditorMode(true);
    };

    // Handle Edit
    const handleStartEdit = (tmpl: EvaluationTemplate) => {
        setEditingTemplate(tmpl);
        setEditorMode(true);
    };

    // Handle Save from Editor
    const handleSaveTemplate = async (templateData: Partial<EvaluationTemplate>) => {
        setIsSaving(true);
        try {
            if (editingTemplate?.id) {
                await updateTemplate(editingTemplate.id, templateData);
                success(`Evaluation template "${templateData.title}" updated successfully.`);
            } else {
                await createTemplate(templateData);
                success(`Evaluation template "${templateData.title}" created successfully.`);
            }
            setEditorMode(false);
            setEditingTemplate(undefined);
            await loadTemplates();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to save evaluation template.';
            error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    // Handle Delete
    const handleConfirmDelete = async () => {
        if (!deletingTemplate?.id) return;
        try {
            await deleteTemplate(deletingTemplate.id);
            success(`Template "${deletingTemplate.title}" was removed successfully.`);
            setDeletingTemplate(null);
            await loadTemplates();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to delete template.';
            error(msg);
        }
    };

    if (editorMode) {
        return (
            <div className="performance-eval-container">
                <EvaluationTemplateEditor
                    initialData={editingTemplate}
                    departments={departments}
                    onSave={handleSaveTemplate}
                    onCancel={() => {
                        setEditorMode(false);
                        setEditingTemplate(undefined);
                    }}
                    isSaving={isSaving}
                />
            </div>
        );
    }

    return (
        <div className="performance-eval-container">
            {/* Header Card */}
            <div className="pe-header-card">
                <div className="pe-header-title">
                    <h2>
                        <Sliders size={22} color="var(--teal, #00A99D)" />
                        Evaluation Templates
                    </h2>
                    <p>
                        Configure standardized evaluation rubrics, criteria weighting, KPI-linked metrics, and rating bands.
                    </p>
                </div>
                <div className="pe-header-actions">
                    <button
                        className="pe-btn pe-btn-secondary"
                        onClick={loadTemplates}
                        title="Refresh templates"
                    >
                        <RotateCcw size={15} />
                    </button>
                    <button
                        className="pe-btn pe-btn-primary"
                        onClick={handleStartCreate}
                    >
                        <Plus size={16} /> New Template
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="pe-filter-bar">
                <div className="pe-search-input">
                    <Search size={16} className="pe-search-icon" />
                    <input
                        type="text"
                        placeholder="Search templates by title, role, or description..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <select
                    className="pe-filter-select"
                    value={filterDepartment}
                    onChange={e => setFilterDepartment(e.target.value)}
                >
                    <option value="">All Departments</option>
                    {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>

                <select
                    className="pe-filter-select"
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                >
                    <option value="">All Target Roles</option>
                    <option value="Courier">Courier</option>
                    <option value="Coordinator">Operations Coordinator</option>
                    <option value="Manager">Manager</option>
                    <option value="Encoder">Encoder</option>
                </select>

                <select
                    className="pe-filter-select"
                    value={filterActive}
                    onChange={e => setFilterActive(e.target.value)}
                >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                </select>
            </div>

            {/* Error Display */}
            {apiError && (
                <div className="pe-weight-banner pe-weight-banner-invalid">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={18} />
                        <span>{apiError}</span>
                    </div>
                    <button className="pe-btn pe-btn-secondary pe-btn-sm" onClick={loadTemplates}>
                        Retry
                    </button>
                </div>
            )}

            {/* Loading Spinner */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0' }}>
                    <Loader2 size={32} className="spin" color="var(--teal, #00A99D)" />
                </div>
            ) : filteredTemplates.length === 0 ? (
                /* Empty State */
                <div className="pe-empty-state">
                    <Layers size={40} color="var(--text-secondary, #94a3b8)" />
                    <h4>No Evaluation Templates Found</h4>
                    <p>
                        {searchQuery || filterDepartment || filterRole || filterActive !== 'all'
                            ? 'No templates matched your current filters. Try resetting the search or filter options.'
                            : 'No evaluation rubrics have been configured yet. Create a new template to define review criteria and rating bands.'}
                    </p>
                    <button
                        className="pe-btn pe-btn-primary"
                        onClick={handleStartCreate}
                    >
                        <Plus size={16} /> Create First Template
                    </button>
                </div>
            ) : (
                /* Templates Grid */
                <div className="pe-template-grid">
                    {filteredTemplates.map(tmpl => {
                        const totalCriteria = (tmpl.sections || []).reduce(
                            (acc, s) => acc + (s.criteria?.length || 0),
                            0
                        );
                        const hasKpiSection = (tmpl.sections || []).some(s => s.isKpiSection);

                        return (
                            <div key={tmpl.id} className="pe-template-card">
                                <div>
                                    <div className="pe-template-card-header">
                                        <h4 className="pe-template-card-title">{tmpl.title}</h4>
                                        <span className={`pe-badge ${tmpl.isActive ? 'pe-badge-active' : 'pe-badge-inactive'}`}>
                                            {tmpl.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    {tmpl.description && (
                                        <p className="pe-template-card-desc">{tmpl.description}</p>
                                    )}

                                    <div className="pe-badges-row">
                                        {tmpl.targetRole && (
                                            <span className="pe-badge pe-badge-role">
                                                <UserCheck size={12} /> {tmpl.targetRole}
                                            </span>
                                        )}
                                        {tmpl.department?.name && (
                                            <span className="pe-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                                                <Building size={12} /> {tmpl.department.name}
                                            </span>
                                        )}
                                        {tmpl.isAiEnabled && (
                                            <span className="pe-badge pe-badge-ai">
                                                <Bot size={12} /> AI Enabled
                                            </span>
                                        )}
                                        {hasKpiSection && (
                                            <span className="pe-badge pe-badge-kpi">
                                                <BarChart3 size={12} /> KPI Section
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="pe-card-meta">
                                        <span>
                                            {tmpl.sections?.length || 0} Sections • {totalCriteria} Criteria • {tmpl.ratingBands?.length || 0} Bands
                                        </span>
                                        <div className="pe-card-actions">
                                            <button
                                                type="button"
                                                className="pe-btn-icon"
                                                title="Edit Template"
                                                onClick={() => handleStartEdit(tmpl)}
                                            >
                                                <Pencil size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                className="pe-btn-icon"
                                                title="Delete Template"
                                                onClick={() => setDeletingTemplate(tmpl)}
                                                style={{ color: '#ee5d50' }}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Confirmation Modal for Delete */}
            <ConfirmationModal
                isOpen={!!deletingTemplate}
                title="Delete Evaluation Template"
                message={`Are you sure you want to delete "${deletingTemplate?.title}"? Templates in use by non-draft reviews cannot be deleted.`}
                confirmText="Delete Template"
                cancelText="Cancel"
                isDanger={true}
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeletingTemplate(null)}
            />
        </div>
    );
};
