import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Sliders,
    Plus,
    Search,
    Filter,
    Pencil,
    Copy,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Calendar,
    Building,
    UserCheck,
    Layers,
    Loader2,
    RotateCcw
} from 'lucide-react';
import api from '../../../api';
import { useToast } from '../../../components/Toast/Toast';
import ConfirmationModal from '../../../components/ConfirmationModal/ConfirmationModal';
import {
    KpiConfiguration,
    KpiConfigurationFormData,
    DepartmentOption
} from './types';
import { KpiConfigurationEditor } from './KpiConfigurationEditor';
import './KpiConfiguration.css';

interface KpiConfigurationTabProps {
    departments?: DepartmentOption[];
}

export const KpiConfigurationTab: React.FC<KpiConfigurationTabProps> = ({
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
    const { success, error, info } = toastMethods;

    // Data state
    const [configurations, setConfigurations] = useState<KpiConfiguration[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string>('');

    // Editor mode
    const [editorMode, setEditorMode] = useState<boolean>(false);
    const [editingConfig, setEditingConfig] = useState<KpiConfigurationFormData | undefined>(undefined);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Delete modal
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterDepartment, setFilterDepartment] = useState<string>('');
    const [filterRole, setFilterRole] = useState<string>('');
    const [filterActive, setFilterActive] = useState<string>('all');

    // Fetch configurations
    const fetchConfigurations = useCallback(async () => {
        setLoading(true);
        setApiError('');
        try {
            const params: Record<string, any> = {};
            if (filterDepartment) params.departmentId = filterDepartment;
            if (filterRole) params.targetRole = filterRole;
            if (filterActive === 'active') params.isActive = true;
            if (filterActive === 'inactive') params.isActive = false;

            const res = await api.get('/api/kpi/configurations', params);
            if (res.data?.isSuccess && Array.isArray(res.data.data)) {
                setConfigurations(res.data.data);
            } else if (Array.isArray(res.data)) {
                setConfigurations(res.data);
            } else {
                setConfigurations([]);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to load KPI configurations.';
            setApiError(msg);
            error(msg);
        } finally {
            setLoading(false);
        }
    }, [filterDepartment, filterRole, filterActive, error]);

    useEffect(() => {
        fetchConfigurations();
    }, [fetchConfigurations]);

    // Filtered configurations
    const filteredConfigurations = useMemo(() => {
        return configurations.filter(cfg => {
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchTitle = cfg.title.toLowerCase().includes(query);
                const matchRole = cfg.targetRole?.toLowerCase().includes(query) ?? false;
                const matchDept = cfg.departmentName?.toLowerCase().includes(query) ?? false;
                if (!matchTitle && !matchRole && !matchDept) return false;
            }
            return true;
        });
    }, [configurations, searchQuery]);

    // Handle Create New
    const handleStartCreate = () => {
        setEditingConfig(undefined);
        setEditorMode(true);
    };

    // Handle Edit
    const handleStartEdit = (cfg: KpiConfiguration) => {
        const formData: KpiConfigurationFormData = {
            id: cfg.id,
            title: cfg.title,
            description: cfg.description || '',
            targetRole: cfg.targetRole || '',
            departmentId: cfg.departmentId || '',
            effectiveStartDate: cfg.effectiveStartDate ? cfg.effectiveStartDate.split('T')[0] : '',
            effectiveEndDate: cfg.effectiveEndDate ? cfg.effectiveEndDate.split('T')[0] : '',
            isActive: cfg.isActive,
            overallGreenThreshold: cfg.overallGreenThreshold,
            overallAmberThreshold: cfg.overallAmberThreshold,
            overallRedThreshold: cfg.overallRedThreshold,
            items: cfg.items.map((i, idx) => ({
                id: i.id,
                kpiConfigurationId: i.kpiConfigurationId,
                name: i.name,
                metricCode: i.metricCode,
                description: i.description || '',
                weight: i.weight,
                unit: i.unit || '%',
                targetValue: i.targetValue,
                greenThreshold: i.greenThreshold,
                amberThreshold: i.amberThreshold,
                redThreshold: i.redThreshold,
                isLowerBetter: i.isLowerBetter,
                isCustomFormula: i.isCustomFormula,
                customFormula: i.customFormula,
                order: i.order || idx + 1
            }))
        };
        setEditingConfig(formData);
        setEditorMode(true);
    };

    // Handle Duplicate / Clone
    const handleDuplicate = (cfg: KpiConfiguration) => {
        const formData: KpiConfigurationFormData = {
            title: `Copy of ${cfg.title}`,
            description: cfg.description || '',
            targetRole: cfg.targetRole || '',
            departmentId: cfg.departmentId || '',
            effectiveStartDate: new Date().toISOString().split('T')[0],
            effectiveEndDate: '',
            isActive: true,
            overallGreenThreshold: cfg.overallGreenThreshold,
            overallAmberThreshold: cfg.overallAmberThreshold,
            overallRedThreshold: cfg.overallRedThreshold,
            items: cfg.items.map((i, idx) => ({
                name: i.name,
                metricCode: i.metricCode,
                description: i.description || '',
                weight: i.weight,
                unit: i.unit || '%',
                targetValue: i.targetValue,
                greenThreshold: i.greenThreshold,
                amberThreshold: i.amberThreshold,
                redThreshold: i.redThreshold,
                isLowerBetter: i.isLowerBetter,
                order: idx + 1
            }))
        };
        setEditingConfig(formData);
        setEditorMode(true);
        info('Cloned configuration ready for review.');
    };

    // Handle Save (Create or Update)
    const handleSave = async (formData: KpiConfigurationFormData) => {
        setIsSaving(true);
        try {
            const payload = {
                title: formData.title.trim(),
                description: formData.description?.trim() || null,
                targetRole: formData.targetRole?.trim() || null,
                departmentId: formData.departmentId ? formData.departmentId : null,
                effectiveStartDate: formData.effectiveStartDate ? new Date(formData.effectiveStartDate).toISOString() : new Date().toISOString(),
                effectiveEndDate: formData.effectiveEndDate ? new Date(formData.effectiveEndDate).toISOString() : null,
                isActive: formData.isActive,
                overallGreenThreshold: Number(formData.overallGreenThreshold),
                overallAmberThreshold: Number(formData.overallAmberThreshold),
                overallRedThreshold: Number(formData.overallRedThreshold),
                items: formData.items.map((item, idx) => ({
                    id: item.id || undefined,
                    name: item.name.trim(),
                    metricCode: item.metricCode.trim(),
                    description: item.description?.trim() || null,
                    weight: Number(item.weight),
                    unit: item.unit || '%',
                    targetValue: Number(item.targetValue),
                    greenThreshold: Number(item.greenThreshold),
                    amberThreshold: Number(item.amberThreshold),
                    redThreshold: Number(item.redThreshold),
                    isLowerBetter: Boolean(item.isLowerBetter),
                    isCustomFormula: Boolean(item.isCustomFormula),
                    customFormula: item.customFormula || null,
                    order: idx + 1
                }))
            };

            if (formData.id) {
                // Update
                const res = await api.put(`/api/kpi/configurations/${formData.id}`, payload);
                if (res.data?.isSuccess) {
                    success('KPI configuration updated successfully.');
                } else {
                    success('KPI configuration saved.');
                }
            } else {
                // Create
                const res = await api.post('/api/kpi/configurations', payload);
                if (res.data?.isSuccess) {
                    success('New prospective KPI configuration created successfully.');
                } else {
                    success('KPI configuration created.');
                }
            }

            setEditorMode(false);
            setEditingConfig(undefined);
            await fetchConfigurations();
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || err.message || 'Failed to save KPI configuration.';
            error(errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    // Handle Delete
    const handleConfirmDelete = async () => {
        if (!deletingId) return;
        try {
            const res = await api.delete(`/api/kpi/configurations/${deletingId}`);
            if (res.data?.isSuccess) {
                success('KPI configuration deleted successfully.');
            } else {
                success('Configuration removed.');
            }
            setDeletingId(null);
            await fetchConfigurations();
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to delete KPI configuration.';
            error(msg);
        }
    };

    const isDefaultConfig = (cfg: KpiConfiguration) => {
        return cfg.id === '00000000-0000-0000-0000-000000000001' ||
            cfg.title.toLowerCase().includes('default logistics operations kpi');
    };

    if (editorMode) {
        return (
            <div className="kpi-config-container">
                <KpiConfigurationEditor
                    initialData={editingConfig}
                    departments={departments}
                    onSave={handleSave}
                    onCancel={() => {
                        setEditorMode(false);
                        setEditingConfig(undefined);
                    }}
                    isSaving={isSaving}
                />
            </div>
        );
    }

    return (
        <div className="kpi-config-container" data-testid="kpi-configuration-tab">
            {/* Header */}
            <div className="kpi-config-header">
                <div>
                    <h3 className="kpi-config-header-title">
                        <Sliders size={20} style={{ color: 'var(--teal)' }} />
                        KPI Weighting &amp; Threshold Configurations
                    </h3>
                    <p className="kpi-config-header-subtitle">
                        Manage prospective KPI evaluation models, customize metric weights (100% total), and set traffic-light thresholds.
                    </p>
                </div>
                <div>
                    <button
                        className="btn btn-teal"
                        onClick={handleStartCreate}
                        data-testid="create-kpi-config-btn"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <Plus size={15} /> New Configuration
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="kpi-config-filter-bar">
                <div className="kpi-config-filter-group">
                    <div style={{ position: 'relative' }}>
                        <input
                            type="text"
                            className="kpi-config-search-input"
                            placeholder="Search configuration title, role..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            data-testid="kpi-search-input"
                        />
                    </div>
                    <select
                        className="kpi-config-select"
                        value={filterDepartment}
                        onChange={e => setFilterDepartment(e.target.value)}
                        data-testid="kpi-filter-department"
                    >
                        <option value="">All Departments</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <select
                        className="kpi-config-select"
                        value={filterRole}
                        onChange={e => setFilterRole(e.target.value)}
                        data-testid="kpi-filter-role"
                    >
                        <option value="">All Roles</option>
                        <option value="Courier">Courier</option>
                        <option value="Encoder">Encoder</option>
                        <option value="Dispatcher">Dispatcher</option>
                        <option value="Coordinator">Coordinator</option>
                    </select>
                    <select
                        className="kpi-config-select"
                        value={filterActive}
                        onChange={e => setFilterActive(e.target.value)}
                        data-testid="kpi-filter-active"
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active Only</option>
                        <option value="inactive">Inactive Only</option>
                    </select>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tt)' }}>
                    Total: <strong>{filteredConfigurations.length}</strong> configuration{filteredConfigurations.length === 1 ? '' : 's'}
                </div>
            </div>

            {/* Content / Loading / Error */}
            {loading ? (
                <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                    <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--teal)' }} />
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Loading KPI configurations...</p>
                </div>
            ) : apiError ? (
                <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                    <AlertCircle size={24} style={{ color: 'var(--err)', margin: '0 auto 8px' }} />
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{apiError}</p>
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 12 }}
                        onClick={fetchConfigurations}
                    >
                        <RotateCcw size={13} /> Try Again
                    </button>
                </div>
            ) : filteredConfigurations.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center' }} data-testid="empty-kpi-configs">
                    <Sliders size={32} style={{ color: 'var(--tt)', margin: '0 auto 10px' }} />
                    <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>No KPI configurations found</h4>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                        {searchQuery || filterDepartment || filterRole || filterActive !== 'all'
                            ? 'No configurations match the selected filter criteria.'
                            : 'Create a prospective configuration to customize metric weights and thresholds.'}
                    </p>
                    <button className="btn btn-teal btn-sm" onClick={handleStartCreate}>
                        <Plus size={14} /> Create First Configuration
                    </button>
                </div>
            ) : (
                <div className="kpi-cards-grid" data-testid="kpi-cards-grid">
                    {filteredConfigurations.map(cfg => {
                        const isDefault = isDefaultConfig(cfg);
                        const startDateStr = cfg.effectiveStartDate ? new Date(cfg.effectiveStartDate).toLocaleDateString() : '';
                        const endDateStr = cfg.effectiveEndDate ? new Date(cfg.effectiveEndDate).toLocaleDateString() : 'Ongoing';

                        return (
                            <div key={cfg.id} className="kpi-card" data-testid={`kpi-card-${cfg.id}`}>
                                <div>
                                    <div className="kpi-card-header">
                                        <h4 className="kpi-card-title">{cfg.title}</h4>
                                        <div className="kpi-card-badges">
                                            {isDefault && (
                                                <span className="kpi-badge kpi-badge-default" title="System default fallback">
                                                    System Default
                                                </span>
                                            )}
                                            {cfg.targetRole && (
                                                <span className="kpi-badge kpi-badge-teal">
                                                    {cfg.targetRole}
                                                </span>
                                            )}
                                            <span className={`kpi-badge ${cfg.isActive ? 'kpi-badge-active' : 'kpi-badge-inactive'}`}>
                                                {cfg.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>

                                    {cfg.description && (
                                        <p className="kpi-card-desc" style={{ marginTop: 8 }}>
                                            {cfg.description}
                                        </p>
                                    )}

                                    <div className="kpi-card-dates" style={{ marginTop: 10 }}>
                                        <Calendar size={13} />
                                        <span>Effective: <strong>{startDateStr}</strong> → <strong>{endDateStr}</strong></span>
                                    </div>

                                    {cfg.departmentName && (
                                        <div className="kpi-card-dates" style={{ marginTop: 4 }}>
                                            <Building size={13} />
                                            <span>Department: <strong>{cfg.departmentName}</strong></span>
                                        </div>
                                    )}

                                    {/* Overall Thresholds */}
                                    <div className="kpi-card-thresholds" style={{ marginTop: 12 }}>
                                        <span style={{ fontWeight: 700, color: 'var(--ts)', marginRight: 4 }}>Tiers:</span>
                                        <span className="kpi-threshold-chip green">🟢 ≥{cfg.overallGreenThreshold}%</span>
                                        <span className="kpi-threshold-chip amber">🟡 ≥{cfg.overallAmberThreshold}%</span>
                                        <span className="kpi-threshold-chip red">🔴 &lt;{cfg.overallAmberThreshold}%</span>
                                    </div>

                                    {/* Metrics weights chips */}
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ts)', marginBottom: 6 }}>
                                            Weighted Metrics ({cfg.items?.length || 0}):
                                        </div>
                                        <div className="kpi-card-items-list">
                                            {(cfg.items || []).map((item, idx) => (
                                                <span key={idx} className="kpi-metric-tag" title={item.name}>
                                                    {item.metricCode} ({item.weight}%)
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="kpi-card-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleDuplicate(cfg)}
                                        title="Clone configuration"
                                        data-testid={`duplicate-config-btn-${cfg.id}`}
                                    >
                                        <Copy size={13} /> Duplicate
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleStartEdit(cfg)}
                                        title="Edit weights and thresholds"
                                        data-testid={`edit-config-btn-${cfg.id}`}
                                    >
                                        <Pencil size={13} /> Edit
                                    </button>
                                    {!isDefault && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            style={{ color: 'var(--err)' }}
                                            onClick={() => setDeletingId(cfg.id)}
                                            title="Delete configuration"
                                            data-testid={`delete-config-btn-${cfg.id}`}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Confirmation Modal for Delete */}
            <ConfirmationModal
                isOpen={!!deletingId}
                title="Delete KPI Configuration"
                description="Are you sure you want to delete this prospective KPI configuration? Evaluations using this configuration will fall back to the system default."
                confirmLabel="Delete Configuration"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeletingId(null)}
            />
        </div>
    );
};
