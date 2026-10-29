import React, { useState, useMemo } from 'react';
import {
    Save,
    RotateCcw,
    X,
    Plus,
    Trash2,
    AlertCircle,
    CheckCircle2,
    Sliders,
    Calendar,
    HelpCircle,
    Percent,
    ArrowUpDown
} from 'lucide-react';
import {
    KpiConfigurationFormData,
    KpiItem,
    DepartmentOption,
    STANDARD_METRIC_TEMPLATES
} from './types';
import './KpiConfiguration.css';

interface KpiConfigurationEditorProps {
    initialData?: KpiConfigurationFormData;
    departments: DepartmentOption[];
    onSave: (data: KpiConfigurationFormData) => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
}

const DEFAULT_FORM_DATA: KpiConfigurationFormData = {
    title: '',
    description: '',
    targetRole: '',
    departmentId: '',
    effectiveStartDate: new Date().toISOString().split('T')[0],
    effectiveEndDate: '',
    isActive: true,
    overallGreenThreshold: 85.0,
    overallAmberThreshold: 70.0,
    overallRedThreshold: 60.0,
    items: STANDARD_METRIC_TEMPLATES.map((tmpl, idx) => ({
        ...tmpl,
        order: idx + 1
    }))
};

export const KpiConfigurationEditor: React.FC<KpiConfigurationEditorProps> = ({
    initialData,
    departments,
    onSave,
    onCancel,
    isSaving
}) => {
    const [formData, setFormData] = useState<KpiConfigurationFormData>(initialData || DEFAULT_FORM_DATA);
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    // Calculate total weight
    const totalWeight = useMemo(() => {
        const sum = formData.items.reduce((acc, item) => acc + (Number(item.weight) || 0), 0);
        return Math.round(sum * 100) / 100;
    }, [formData.items]);

    const isWeightValid = useMemo(() => {
        return Math.abs(totalWeight - 100.0) < 0.01;
    }, [totalWeight]);

    // Validation checks
    const validationErrors = useMemo(() => {
        const errors: string[] = [];

        if (!formData.title.trim()) {
            errors.push('Configuration title is required.');
        }

        if (!formData.effectiveStartDate) {
            errors.push('Effective start date is required.');
        }

        if (formData.effectiveEndDate && formData.effectiveStartDate) {
            if (new Date(formData.effectiveEndDate) <= new Date(formData.effectiveStartDate)) {
                errors.push('Effective end date must be strictly after the start date.');
            }
        }

        if (formData.overallGreenThreshold < formData.overallAmberThreshold ||
            formData.overallAmberThreshold < formData.overallRedThreshold) {
            errors.push(`Overall thresholds invalid: Green (${formData.overallGreenThreshold}) must be >= Amber (${formData.overallAmberThreshold}), and Amber must be >= Red (${formData.overallRedThreshold}).`);
        }

        if (formData.items.length === 0) {
            errors.push('At least one KPI metric is required.');
        }

        if (!isWeightValid) {
            errors.push(`Total weights must sum to exactly 100.0% (current sum is ${totalWeight}%).`);
        }

        // Validate individual items
        formData.items.forEach((item, idx) => {
            if (!item.name.trim()) {
                errors.push(`Metric #${idx + 1} name is required.`);
            }
            if (!item.metricCode.trim()) {
                errors.push(`Metric #${idx + 1} code is required.`);
            }
            if (item.targetValue < 0) {
                errors.push(`Target value for '${item.name}' cannot be negative.`);
            }
            if (item.isLowerBetter) {
                if (item.greenThreshold > item.amberThreshold || item.amberThreshold > item.redThreshold) {
                    errors.push(`Metric '${item.name}' (lower is better): Green (${item.greenThreshold}) must be <= Amber (${item.amberThreshold}), and Amber <= Red (${item.redThreshold}).`);
                }
            } else {
                if (item.greenThreshold < item.amberThreshold || item.amberThreshold < item.redThreshold) {
                    errors.push(`Metric '${item.name}': Green (${item.greenThreshold}) must be >= Amber (${item.amberThreshold}), and Amber >= Red (${item.redThreshold}).`);
                }
            }
        });

        return errors;
    }, [formData, totalWeight, isWeightValid]);

    const canSubmit = validationErrors.length === 0 && !isSaving;

    // Handlers
    const handleFieldChange = (field: keyof KpiConfigurationFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    const handleItemChange = (index: number, field: keyof KpiItem, value: any) => {
        setFormData(prev => {
            const nextItems = [...prev.items];
            nextItems[index] = { ...nextItems[index], [field]: value };
            return { ...prev, items: nextItems };
        });
    };

    const handleRemoveItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, idx) => idx !== index)
        }));
    };

    const handleAddTemplateMetric = (template: Omit<KpiItem, 'id' | 'kpiConfigurationId'>) => {
        setFormData(prev => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    ...template,
                    order: prev.items.length + 1
                }
            ]
        }));
    };

    const handleAutoBalance = () => {
        if (formData.items.length === 0) return;

        const currentSum = formData.items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);
        let updatedItems: KpiItem[];

        if (currentSum === 0) {
            // Equal distribution
            const equalWeight = Math.floor(100 / formData.items.length);
            const remainder = 100 - (equalWeight * formData.items.length);
            updatedItems = formData.items.map((item, idx) => ({
                ...item,
                weight: equalWeight + (idx === 0 ? remainder : 0)
            }));
        } else {
            // Proportional scaling
            let accumulated = 0;
            updatedItems = formData.items.map((item, idx) => {
                if (idx === formData.items.length - 1) {
                    return { ...item, weight: Math.round((100 - accumulated) * 10) / 10 };
                }
                const scaled = Math.round(((item.weight / currentSum) * 100) * 10) / 10;
                accumulated += scaled;
                return { ...item, weight: scaled };
            });
        }

        setFormData(prev => ({ ...prev, items: updatedItems }));
    };

    const handleResetDefaults = () => {
        setFormData(prev => ({
            ...prev,
            overallGreenThreshold: 85.0,
            overallAmberThreshold: 70.0,
            overallRedThreshold: 60.0,
            items: STANDARD_METRIC_TEMPLATES.map((tmpl, idx) => ({
                ...tmpl,
                order: idx + 1
            }))
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        await onSave(formData);
    };

    // Color bar segments for visual weight breakdown
    const segmentColors = ['#008B8B', '#4f46e5', '#059669', '#d97706', '#ec4899', '#8b5cf6'];

    return (
        <form className="kpi-editor-card" onSubmit={handleSubmit} data-testid="kpi-configuration-editor">
            <div className="kpi-editor-header">
                <div>
                    <h2 className="kpi-editor-title">
                        {formData.id ? '✏️ Edit KPI Configuration' : '✨ New Prospective KPI Configuration'}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                        Configure role weights and traffic-light thresholds (Green / Amber / Red) for employee evaluations.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onCancel}
                        disabled={isSaving}
                    >
                        <X size={14} /> Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-teal btn-sm"
                        disabled={!canSubmit}
                        data-testid="save-kpi-config-btn"
                    >
                        <Save size={14} /> {isSaving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>

            {/* Validation Banner if invalid */}
            {validationErrors.length > 0 && (
                <div className="kpi-weight-valid-alert invalid" role="alert" data-testid="validation-alert">
                    <AlertCircle size={18} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Please resolve configuration errors:</div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                            {validationErrors.map((err, i) => (
                                <li key={i}>{err}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* General Settings */}
            <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    1. General Information &amp; Scope
                </h4>
                <div className="kpi-editor-grid-2">
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label">Configuration Title *</label>
                        <input
                            type="text"
                            className="kpi-editor-input"
                            value={formData.title}
                            placeholder="e.g., Q4 2026 Logistics Dispatcher KPI"
                            onChange={e => handleFieldChange('title', e.target.value)}
                            required
                            data-testid="config-title-input"
                        />
                    </div>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label">Department (Optional)</label>
                        <select
                            className="kpi-editor-input"
                            value={formData.departmentId}
                            onChange={e => handleFieldChange('departmentId', e.target.value)}
                            data-testid="config-department-select"
                        >
                            <option value="">All Departments (Global)</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="kpi-editor-grid-2" style={{ marginTop: 12 }}>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label">Target Role Filter</label>
                        <select
                            className="kpi-editor-input"
                            value={formData.targetRole}
                            onChange={e => handleFieldChange('targetRole', e.target.value)}
                            data-testid="config-role-select"
                        >
                            <option value="">All Operational Roles</option>
                            <option value="Courier">Courier</option>
                            <option value="Encoder">Encoder</option>
                            <option value="Dispatcher">Dispatcher</option>
                            <option value="Coordinator">Coordinator</option>
                        </select>
                    </div>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label">Description / Scope Notes</label>
                        <input
                            type="text"
                            className="kpi-editor-input"
                            value={formData.description}
                            placeholder="Briefly state target performance objectives..."
                            onChange={e => handleFieldChange('description', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Prospective Validity Dates */}
            <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    2. Prospective Validity Period
                </h4>
                <div className="kpi-editor-grid-3">
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label">Effective Start Date *</label>
                        <input
                            type="date"
                            className="kpi-editor-input"
                            value={formData.effectiveStartDate}
                            onChange={e => handleFieldChange('effectiveStartDate', e.target.value)}
                            required
                            data-testid="config-start-date-input"
                        />
                    </div>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label">Effective End Date (Optional)</label>
                        <input
                            type="date"
                            className="kpi-editor-input"
                            value={formData.effectiveEndDate}
                            onChange={e => handleFieldChange('effectiveEndDate', e.target.value)}
                            data-testid="config-end-date-input"
                        />
                    </div>
                    <div className="kpi-editor-field" style={{ justifyContent: 'center' }}>
                        <label className="kpi-editor-label">Active Status</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', height: 38 }}>
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={e => handleFieldChange('isActive', e.target.checked)}
                                style={{ width: 18, height: 18, accentColor: 'var(--teal)' }}
                                data-testid="config-is-active-checkbox"
                            />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Active for Period Evaluations</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Overall Performance Thresholds */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            3. Overall Performance Score Thresholds (Traffic-Light)
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                            Cutoffs used to determine the employee's overall score tier (Green ≥ Amber ≥ Red).
                        </p>
                    </div>
                </div>
                <div className="kpi-editor-grid-3">
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label" style={{ color: 'var(--ok)' }}>
                            🟢 Green (High / Meeting) ≥
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            className="kpi-editor-input"
                            value={formData.overallGreenThreshold}
                            onChange={e => handleFieldChange('overallGreenThreshold', parseFloat(e.target.value) || 0)}
                            data-testid="overall-green-input"
                        />
                    </div>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label" style={{ color: 'var(--warn)' }}>
                            🟡 Amber (Needs Improvement) ≥
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            className="kpi-editor-input"
                            value={formData.overallAmberThreshold}
                            onChange={e => handleFieldChange('overallAmberThreshold', parseFloat(e.target.value) || 0)}
                            data-testid="overall-amber-input"
                        />
                    </div>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label" style={{ color: 'var(--err)' }}>
                            🔴 Red (Critical / Failing) &lt;
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            className="kpi-editor-input"
                            value={formData.overallRedThreshold}
                            onChange={e => handleFieldChange('overallRedThreshold', parseFloat(e.target.value) || 0)}
                            data-testid="overall-red-input"
                        />
                    </div>
                </div>
            </div>

            {/* Weight Allocation & Metric Items */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            4. Metric Items, Weights &amp; Thresholds
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                            Individual metric weights must sum to exactly 100.0%.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleAutoBalance}
                            title="Proportionally scale weights to 100%"
                            data-testid="auto-balance-weights-btn"
                        >
                            <Sliders size={14} /> Auto-Balance (100%)
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleResetDefaults}
                            title="Reset metrics to standard baseline"
                            data-testid="reset-defaults-btn"
                        >
                            <RotateCcw size={14} /> Reset Defaults
                        </button>
                    </div>
                </div>

                {/* Weight Progress Bar & Indicator */}
                <div className="kpi-weight-summary-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                            Total Weight Allocation:
                        </span>
                        <span
                            style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: isWeightValid ? 'var(--ok)' : 'var(--err)'
                            }}
                            data-testid="total-weight-display"
                        >
                            {totalWeight.toFixed(1)}% / 100.0%
                        </span>
                    </div>

                    <div className="kpi-weight-progress-track">
                        {formData.items.map((item, idx) => {
                            const widthPct = Math.max(0, Math.min(100, (Number(item.weight) || 0)));
                            return (
                                <div
                                    key={idx}
                                    className="kpi-weight-progress-fill"
                                    style={{
                                        width: `${widthPct}%`,
                                        background: segmentColors[idx % segmentColors.length]
                                    }}
                                    title={`${item.name}: ${item.weight}%`}
                                />
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11.5 }}>
                        {formData.items.map((item, idx) => (
                            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 2,
                                    background: segmentColors[idx % segmentColors.length]
                                }} />
                                <strong>{item.metricCode}</strong>: {item.weight}%
                            </span>
                        ))}
                    </div>
                </div>

                {/* Metric Items Table */}
                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                    <table className="kpi-items-table" data-testid="kpi-items-table">
                        <thead>
                            <tr>
                                <th style={{ width: '22%' }}>Metric Name &amp; Code</th>
                                <th style={{ width: '15%' }}>Weight (%)</th>
                                <th style={{ width: '12%' }}>Target</th>
                                <th style={{ width: '13%' }}>🟢 Green</th>
                                <th style={{ width: '13%' }}>🟡 Amber</th>
                                <th style={{ width: '13%' }}>🔴 Red</th>
                                <th style={{ width: '12%', textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.items.map((item, idx) => (
                                <tr key={idx} data-testid={`kpi-item-row-${idx}`}>
                                    <td>
                                        <div style={{ fontWeight: 700, color: 'var(--tp)' }}>{item.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--tt)', marginTop: 2 }}>
                                            <code>{item.metricCode}</code> ({item.unit})
                                            {item.isLowerBetter && <span style={{ marginLeft: 6, color: 'var(--teal)', fontWeight: 600 }}>▼ Lower is Better</span>}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="1"
                                                className="kpi-editor-input"
                                                style={{ width: 75, height: 32 }}
                                                value={item.weight}
                                                onChange={e => handleItemChange(idx, 'weight', parseFloat(e.target.value) || 0)}
                                                data-testid={`item-weight-input-${idx}`}
                                            />
                                            <span style={{ fontSize: 12, color: 'var(--tt)' }}>%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.5"
                                            className="kpi-editor-input"
                                            style={{ width: 75, height: 32 }}
                                            value={item.targetValue}
                                            onChange={e => handleItemChange(idx, 'targetValue', parseFloat(e.target.value) || 0)}
                                            data-testid={`item-target-input-${idx}`}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.5"
                                            className="kpi-editor-input"
                                            style={{ width: 75, height: 32, borderColor: 'var(--ok-r)' }}
                                            value={item.greenThreshold}
                                            onChange={e => handleItemChange(idx, 'greenThreshold', parseFloat(e.target.value) || 0)}
                                            data-testid={`item-green-input-${idx}`}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.5"
                                            className="kpi-editor-input"
                                            style={{ width: 75, height: 32, borderColor: 'var(--warn-r)' }}
                                            value={item.amberThreshold}
                                            onChange={e => handleItemChange(idx, 'amberThreshold', parseFloat(e.target.value) || 0)}
                                            data-testid={`item-amber-input-${idx}`}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.5"
                                            className="kpi-editor-input"
                                            style={{ width: 75, height: 32, borderColor: 'var(--err-r)' }}
                                            value={item.redThreshold}
                                            onChange={e => handleItemChange(idx, 'redThreshold', parseFloat(e.target.value) || 0)}
                                            data-testid={`item-red-input-${idx}`}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            style={{ color: 'var(--err)', padding: '4px 8px' }}
                                            onClick={() => handleRemoveItem(idx)}
                                            title="Remove Metric"
                                            data-testid={`remove-item-btn-${idx}`}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Add Metric Template options */}
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Add Metric:
                    </span>
                    {STANDARD_METRIC_TEMPLATES.map((tmpl, idx) => {
                        const alreadyAdded = formData.items.some(i => i.metricCode === tmpl.metricCode);
                        return (
                            <button
                                key={idx}
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={alreadyAdded}
                                onClick={() => handleAddTemplateMetric(tmpl)}
                                style={{ fontSize: 11.5 }}
                                data-testid={`add-template-${tmpl.metricCode}`}
                            >
                                <Plus size={12} /> {tmpl.metricCode} {alreadyAdded ? '(Added)' : ''}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="kpi-editor-actions">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onCancel}
                    disabled={isSaving}
                >
                    <X size={14} /> Cancel
                </button>
                <button
                    type="submit"
                    className="btn btn-teal"
                    disabled={!canSubmit}
                    data-testid="bottom-save-btn"
                >
                    <Save size={14} /> {isSaving ? 'Saving Configuration...' : 'Save Prospective Configuration'}
                </button>
            </div>
        </form>
    );
};
