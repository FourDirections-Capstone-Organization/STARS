import React, { useState, useMemo, useEffect } from 'react';
import {
    Save,
    X,
    Trash2,
    AlertCircle,
    Calculator,
    Info
} from 'lucide-react';
import api from '../../../api';
import {
    KpiConfigurationFormData,
    KpiItem,
    DepartmentOption,
    DepartmentRosterOption,
    JobPositionOption,
    STANDARD_METRIC_TEMPLATES,
    getRolesForDepartment,
    getRoleDisplayLabel,
    normalizeRoleName,
    normalizeStandardMetricCode
} from './types';
import { FormulaBuilderModal } from './FormulaBuilderModal';
import './KpiConfiguration.css';

interface KpiConfigurationEditorProps {
    initialData?: KpiConfigurationFormData;
    departments: DepartmentOption[];
    departmentRosters?: DepartmentRosterOption[];
    jobPositions?: JobPositionOption[];
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
    items: []
};

const normalizeInitialFormData = (initialData?: KpiConfigurationFormData): { data: KpiConfigurationFormData; convertedLegacy: boolean } => {
    if (!initialData) {
        return { data: DEFAULT_FORM_DATA, convertedLegacy: false };
    }

    const hadMultiple = (initialData.items?.length || 0) > 1;
    const normalizedItems: KpiItem[] = initialData.items && initialData.items.length > 0
        ? [{
            ...initialData.items[0],
            metricCode: initialData.items[0].isCustomFormula
                ? initialData.items[0].metricCode
                : normalizeStandardMetricCode(initialData.items[0].metricCode),
            weight: 100,
            order: 1
        }]
        : [];

    return {
        data: {
            ...initialData,
            targetRole: normalizeRoleName(initialData.targetRole),
            items: normalizedItems
        },
        convertedLegacy: hadMultiple
    };
};

export const KpiConfigurationEditor: React.FC<KpiConfigurationEditorProps> = ({
    initialData,
    departments,
    departmentRosters = [],
    jobPositions = [],
    onSave,
    onCancel,
    isSaving
}) => {
    const initialNormalized = useMemo(() => normalizeInitialFormData(initialData), [initialData]);
    const [formData, setFormData] = useState<KpiConfigurationFormData>(initialNormalized.data);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [editingFormulaIndex, setEditingFormulaIndex] = useState<number | null>(null);
    const [backendRolesByDept, setBackendRolesByDept] = useState<Record<string, string[]>>({});

    useEffect(() => {
        const deptId = formData.departmentId;
        if (!deptId) return;

        let isMounted = true;
        api.get(`/api/kpi/departments/${deptId}/roles`)
            .then(res => {
                if (!isMounted) return;
                const list = res.data?.data ?? res.data;
                if (Array.isArray(list) && list.length > 0) {
                    const roles = list
                        .map((item: any) => normalizeRoleName(typeof item === 'string' ? item : item.role))
                        .filter(Boolean);
                    if (roles.length > 0) {
                        setBackendRolesByDept(prev => ({ ...prev, [deptId]: Array.from(new Set(roles)) }));
                    }
                }
            })
            .catch(() => {
                // Fall back to local department-role derivation
            });

        return () => {
            isMounted = false;
        };
    }, [formData.departmentId]);

    const selectedDepartment = useMemo(
        () => departments.find(d => d.id.toLowerCase() === (formData.departmentId || '').toLowerCase()),
        [departments, formData.departmentId]
    );

    const availableRoles = useMemo(() => {
        if (!formData.departmentId) return [];
        const fromBackend = backendRolesByDept[formData.departmentId];
        if (fromBackend && fromBackend.length > 0) {
            return fromBackend;
        }
        return getRolesForDepartment(formData.departmentId, selectedDepartment?.name, departmentRosters, jobPositions);
    }, [formData.departmentId, backendRolesByDept, selectedDepartment?.name, departmentRosters, jobPositions]);

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

        if (!formData.departmentId) {
            errors.push('Department is required.');
        }

        if (!formData.targetRole) {
            errors.push('Target role is required.');
        } else if (formData.departmentId && availableRoles.length > 0 && !availableRoles.includes(formData.targetRole)) {
            errors.push(`Target role '${getRoleDisplayLabel(formData.targetRole)}' is not applicable to the selected department.`);
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
            errors.push('Please select one KPI metric for the target role.');
        } else if (formData.items.length > 1) {
            errors.push('Only one KPI metric can be selected per role.');
        }

        if (formData.items.length > 0 && !isWeightValid) {
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
            if (item.isCustomFormula) {
                if (!item.customFormula || !item.customFormula.trim()) {
                    errors.push(`Custom metric '${item.name || `#${idx + 1}`}' requires a custom formula.`);
                }
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
    }, [formData, availableRoles, totalWeight, isWeightValid]);

    const canSubmit = validationErrors.length === 0 && !isSaving;

    // Handlers
    const handleFieldChange = (field: keyof KpiConfigurationFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    const handleDepartmentChange = (nextDeptId: string) => {
        const nextDept = departments.find(d => d.id.toLowerCase() === nextDeptId.toLowerCase());
        const nextRoles = nextDeptId
            ? (backendRolesByDept[nextDeptId] || getRolesForDepartment(nextDeptId, nextDept?.name, departmentRosters, jobPositions))
            : [];

        setFormData(prev => ({
            ...prev,
            departmentId: nextDeptId,
            targetRole: nextDeptId && nextRoles.includes(prev.targetRole) ? prev.targetRole : ''
        }));
        setTouched(prev => ({ ...prev, departmentId: true, targetRole: true }));
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

    const handleSelectMetricFromDropdown = (metricCode: string) => {
        if (!metricCode) {
            setFormData(prev => ({ ...prev, items: [] }));
            return;
        }
        if (metricCode === 'CUSTOM_FORMULA') {
            return;
        }

        const template = STANDARD_METRIC_TEMPLATES.find(t => t.metricCode === metricCode);
        if (!template) return;

        setFormData(prev => ({
            ...prev,
            items: [{
                ...template,
                weight: 100,
                isCustomFormula: false,
                customFormula: undefined,
                order: 1
            }]
        }));
    };

    const handleAddCustomFormulaMetric = () => {
        const newItem: KpiItem = {
            name: 'Custom Metric',
            metricCode: 'CUSTOM_1',
            description: 'Custom formula calculated metric',
            weight: 100,
            unit: '%',
            targetValue: 100,
            greenThreshold: 90,
            amberThreshold: 75,
            redThreshold: 60,
            isLowerBetter: false,
            isCustomFormula: true,
            customFormula: '',
            order: 1
        };

        setFormData(prev => ({
            ...prev,
            items: [newItem]
        }));
        setEditingFormulaIndex(0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        await onSave(formData);
    };

    const currentItem = formData.items[0];
    const selectedMetricSelectValue = !currentItem
        ? ''
        : currentItem.isCustomFormula
            ? 'CUSTOM_FORMULA'
            : normalizeStandardMetricCode(currentItem.metricCode);

    return (
        <form className="kpi-editor-card" onSubmit={handleSubmit} data-testid="kpi-configuration-editor">
            <div className="kpi-editor-header">
                <div>
                    <h2 className="kpi-editor-title">
                        {formData.id ? '✏️ Edit KPI Configuration' : '✨ New Prospective KPI Configuration'}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                        Assign a department, target role, and single role-specific KPI metric with traffic-light thresholds (Green / Amber / Red).
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

            {initialNormalized.convertedLegacy && (
                <div className="kpi-weight-valid-alert" style={{ background: 'var(--teal-bg)', color: 'var(--teal)', border: '1px solid var(--teal-ring)' }} data-testid="legacy-conversion-notice">
                    <Info size={16} />
                    <span>
                        Each role now uses one specific KPI metric (100% weight) tied to a required department. Please verify the department, target role, and metric before saving.
                    </span>
                </div>
            )}

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
                        <label className="kpi-editor-label" htmlFor="config-title-input">Configuration Title *</label>
                        <input
                            id="config-title-input"
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
                        <label className="kpi-editor-label" htmlFor="config-department-select">Department *</label>
                        <select
                            id="config-department-select"
                            className="kpi-editor-input"
                            value={formData.departmentId}
                            onChange={e => handleDepartmentChange(e.target.value)}
                            required
                            data-testid="config-department-select"
                        >
                            <option value="">Select a department...</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="kpi-editor-grid-2" style={{ marginTop: 12 }}>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label" htmlFor="config-role-select">Target Role Filter *</label>
                        <select
                            id="config-role-select"
                            className="kpi-editor-input"
                            value={formData.targetRole}
                            onChange={e => handleFieldChange('targetRole', e.target.value)}
                            disabled={!formData.departmentId}
                            required
                            title={!formData.departmentId ? 'Please select a department first' : undefined}
                            data-testid="config-role-select"
                        >
                            <option value="">
                                {formData.departmentId ? 'Select a target role...' : 'Select a department first...'}
                            </option>
                            {availableRoles.map(role => (
                                <option key={role} value={role}>{getRoleDisplayLabel(role)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="kpi-editor-field">
                        <label className="kpi-editor-label" htmlFor="config-description-input">Description / Scope Notes</label>
                        <input
                            id="config-description-input"
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

            {/* Metric Selection & Thresholds */}
            <div>
                <div style={{ marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        4. Role KPI Metric &amp; Thresholds
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                        Choose one KPI metric for the selected target role (100.0% weight). Each role uses its own dedicated metric.
                    </p>
                </div>

                {/* Single Metric Dropdown */}
                <div className="kpi-editor-field" style={{ marginBottom: 12 }}>
                    <label className="kpi-editor-label" htmlFor="kpi-metric-select">
                        KPI Metric (One per Role) *
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <select
                            id="kpi-metric-select"
                            className="kpi-editor-input"
                            style={{ flex: '1 1 320px' }}
                            value={selectedMetricSelectValue}
                            onChange={e => handleSelectMetricFromDropdown(e.target.value)}
                            required
                            data-testid="kpi-metric-select"
                        >
                            <option value="">-- Select a KPI Metric --</option>
                            {STANDARD_METRIC_TEMPLATES.map(tmpl => (
                                <option key={tmpl.metricCode} value={tmpl.metricCode}>
                                    {tmpl.name} ({tmpl.metricCode} • {tmpl.unit})
                                </option>
                            ))}
                            {currentItem?.isCustomFormula && (
                                <option value="CUSTOM_FORMULA">
                                    Custom Formula: {currentItem.name} ({currentItem.metricCode})
                                </option>
                            )}
                        </select>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleAddCustomFormulaMetric}
                            style={{ fontSize: 12, borderColor: 'var(--teal)', color: 'var(--teal)', fontWeight: 600, height: 38 }}
                            data-testid="add-custom-formula-metric-btn"
                        >
                            <Calculator size={14} /> Use Custom Formula Metric
                        </button>
                    </div>
                </div>

                {/* Weight Progress Bar & Indicator */}
                <div className="kpi-weight-summary-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                            Selected Metric Weight Allocation:
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
                                        background: '#00A99D'
                                    }}
                                    title={`${item.name}: ${item.weight}%`}
                                />
                            );
                        })}
                    </div>

                    {formData.items.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11.5 }}>
                            {formData.items.map((item, idx) => (
                                <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 2,
                                        background: '#00A99D'
                                    }} />
                                    <strong>{item.metricCode}</strong>: {item.weight}%
                                    {item.isCustomFormula && (
                                        <span style={{ color: 'var(--teal)', fontSize: 10 }}>📐</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Metric Configuration Table */}
                {formData.items.length === 0 ? (
                    <div
                        style={{
                            marginTop: 12,
                            padding: '20px 16px',
                            border: '1px dashed var(--border)',
                            borderRadius: 8,
                            textAlign: 'center',
                            color: 'var(--text-secondary)',
                            fontSize: 13
                        }}
                        data-testid="empty-metric-selection"
                    >
                        No KPI metric selected. Choose one KPI metric from the dropdown above for the selected role.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: 12 }}>
                        <table className="kpi-items-table" data-testid="kpi-items-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '26%' }}>Metric Name &amp; Code</th>
                                    <th style={{ width: '14%' }}>Weight (%)</th>
                                    <th style={{ width: '12%' }}>Target</th>
                                    <th style={{ width: '12%' }}>🟢 Green</th>
                                    <th style={{ width: '12%' }}>🟡 Amber</th>
                                    <th style={{ width: '12%' }}>🔴 Red</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.items.map((item, idx) => (
                                    <tr key={idx} data-testid={`kpi-item-row-${idx}`}>
                                        <td>
                                            <div style={{ fontWeight: 700, color: 'var(--tp)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                {item.isCustomFormula ? (
                                                    <input
                                                        type="text"
                                                        className="kpi-editor-input"
                                                        style={{ height: 28, fontSize: 12, fontWeight: 700, width: 140 }}
                                                        value={item.name}
                                                        onChange={e => handleItemChange(idx, 'name', e.target.value)}
                                                        placeholder="Metric Name"
                                                        data-testid={`custom-metric-name-input-${idx}`}
                                                    />
                                                ) : (
                                                    <span>{item.name}</span>
                                                )}
                                                {item.isCustomFormula && (
                                                    <span className="kpi-badge kpi-badge-teal" style={{ fontSize: 10 }}>
                                                        Custom Formula
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--tt)', marginTop: 2 }}>
                                                {item.isCustomFormula ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                        <input
                                                            type="text"
                                                            className="kpi-editor-input"
                                                            style={{ height: 24, fontSize: 11, width: 100 }}
                                                            value={item.metricCode}
                                                            onChange={e => handleItemChange(idx, 'metricCode', e.target.value.toUpperCase())}
                                                            placeholder="CODE"
                                                            data-testid={`custom-metric-code-input-${idx}`}
                                                        />
                                                        <input
                                                            type="text"
                                                            className="kpi-editor-input"
                                                            style={{ height: 24, fontSize: 11, width: 45 }}
                                                            value={item.unit}
                                                            onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                                                            placeholder="unit"
                                                            data-testid={`custom-metric-unit-input-${idx}`}
                                                        />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <code>{item.metricCode}</code> ({item.unit})
                                                    </>
                                                )}
                                                {item.isLowerBetter && <span style={{ marginLeft: 6, color: 'var(--teal)', fontWeight: 600 }}>▼ Lower is Better</span>}
                                            </div>
                                            {item.isCustomFormula && (
                                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}
                                                        onClick={() => setEditingFormulaIndex(idx)}
                                                        data-testid={`edit-formula-btn-${idx}`}
                                                    >
                                                        <Calculator size={12} /> {item.customFormula ? 'Edit Formula' : 'Set Formula'}
                                                    </button>
                                                    {item.customFormula && (
                                                        <div
                                                            style={{
                                                                fontSize: 11,
                                                                fontFamily: 'monospace',
                                                                color: 'var(--teal)',
                                                                maxWidth: 220,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                            title={item.customFormula}
                                                            data-testid={`formula-preview-${idx}`}
                                                        >
                                                            <code>{item.customFormula}</code>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                    className="kpi-editor-input"
                                                    style={{ width: 75, height: 32, background: 'var(--s1)' }}
                                                    value={item.weight}
                                                    readOnly
                                                    title="Single role metric carries 100% weight"
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
                                                title="Clear Selected Metric"
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
                )}
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

            {/* Formula Builder Modal */}
            {editingFormulaIndex !== null && formData.items[editingFormulaIndex] && (
                <FormulaBuilderModal
                    isOpen={editingFormulaIndex !== null}
                    initialFormula={formData.items[editingFormulaIndex].customFormula || ''}
                    metricName={formData.items[editingFormulaIndex].name}
                    onApply={(newFormula) => {
                        handleItemChange(editingFormulaIndex, 'customFormula', newFormula);
                        setEditingFormulaIndex(null);
                    }}
                    onClose={() => setEditingFormulaIndex(null)}
                />
            )}
        </form>
    );
};
