import React, { useState, useEffect, useRef } from 'react';
import {
    X,
    Play,
    CheckCircle2,
    AlertCircle,
    Calculator,
    Sparkles,
    Search,
    RotateCcw,
    HelpCircle
} from 'lucide-react';
import {
    KpiVariableDefinition,
    FormulaTestResponse,
    DEFAULT_KPI_VARIABLES
} from './types';
import api from '../../../api';
import './KpiConfiguration.css';

export interface FormulaBuilderModalProps {
    isOpen: boolean;
    initialFormula?: string;
    metricName?: string;
    onApply: (formula: string) => void;
    onClose: () => void;
}

export const FormulaBuilderModal: React.FC<FormulaBuilderModalProps> = ({
    isOpen,
    initialFormula = '',
    metricName = 'Custom Metric',
    onApply,
    onClose
}) => {
    const [formula, setFormula] = useState<string>(initialFormula);
    const [variables, setVariables] = useState<KpiVariableDefinition[]>(DEFAULT_KPI_VARIABLES);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [sampleValues, setSampleValues] = useState<Record<string, number>>({});
    const [testResult, setTestResult] = useState<FormulaTestResponse | null>(null);
    const [isTesting, setIsTesting] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initialize formula and sample values when opening or when initialFormula changes
    useEffect(() => {
        if (isOpen) {
            setFormula(initialFormula || '');
            setTestResult(null);
            setValidationError(null);

            // Fetch variables from backend if available
            api.get('/api/kpi/formula/variables')
                .then(res => {
                    const fetched = res.data?.data;
                    if (Array.isArray(fetched) && fetched.length > 0) {
                        setVariables(fetched);
                        // Initialize sample values
                        const samples: Record<string, number> = {};
                        fetched.forEach(v => {
                            samples[v.name] = v.defaultSampleValue ?? v.defaultValue ?? 1.0;
                        });
                        setSampleValues(samples);
                    }
                })
                .catch(() => {
                    // Fall back to DEFAULT_KPI_VARIABLES
                    const samples: Record<string, number> = {};
                    DEFAULT_KPI_VARIABLES.forEach(v => {
                        samples[v.name] = v.defaultSampleValue ?? 1.0;
                    });
                    setSampleValues(samples);
                });
        }
    }, [isOpen, initialFormula]);

    if (!isOpen) return null;

    // Filter categories
    const categories = ['All', 'Counts', 'Rates', 'Duration'];

    const filteredVariables = variables.filter(v => {
        const matchesCategory = selectedCategory === 'All' || v.category?.toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch = !searchTerm ||
            v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.displayName.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Insertion helper inserting text at cursor position
    const insertText = (textToInsert: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setFormula(prev => {
                const needsSpace = prev.length > 0 && !prev.endsWith(' ');
                return prev + (needsSpace ? ' ' : '') + textToInsert;
            });
            setTestResult(null);
            setValidationError(null);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = formula.substring(0, start);
        const after = formula.substring(end);

        const newFormula = before + textToInsert + after;
        setFormula(newFormula);
        setTestResult(null);
        setValidationError(null);

        setTimeout(() => {
            textarea.focus();
            const nextCursor = start + textToInsert.length;
            textarea.setSelectionRange(nextCursor, nextCursor);
        }, 0);
    };

    const handleOperatorClick = (op: string) => {
        insertText(` ${op} `);
    };

    const handleVariableChipClick = (varName: string) => {
        insertText(varName);
    };

    const handleSampleValueChange = (varName: string, val: number) => {
        setSampleValues(prev => ({
            ...prev,
            [varName]: val
        }));
    };

    const handleTestFormula = async () => {
        const trimmed = formula.trim();
        if (!trimmed) {
            setValidationError('Please enter a formula before running dry-run test.');
            setTestResult(null);
            return;
        }

        setIsTesting(true);
        setValidationError(null);

        try {
            const res = await api.post('/api/kpi/formula/test', {
                formula: trimmed,
                sampleValues
            });

            if (res.data?.data) {
                setTestResult(res.data.data);
            } else if (res.data?.isSuccess === false) {
                setTestResult({
                    isValid: false,
                    errorMessage: res.data.message || 'Formula validation failed.'
                });
            }
        } catch (err: any) {
            const message = err.response?.data?.message || err.message || 'Error executing dry run formula test.';
            setTestResult({
                isValid: false,
                errorMessage: message
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleApply = () => {
        const trimmed = formula.trim();
        if (!trimmed) {
            setValidationError('Formula cannot be empty.');
            return;
        }

        onApply(trimmed);
        onClose();
    };

    return (
        <div className="kpi-formula-modal-overlay" data-testid="formula-builder-modal">
            <div className="kpi-formula-modal-card">
                {/* Header */}
                <div className="kpi-formula-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="kpi-formula-icon-box">
                            <Calculator size={20} color="var(--teal)" />
                        </div>
                        <div>
                            <h3 className="kpi-formula-modal-title">Custom Formula Builder</h3>
                            <p className="kpi-formula-modal-subtitle">
                                Configuring formula for: <strong>{metricName}</strong>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onClose}
                        title="Close"
                        data-testid="close-formula-modal-btn"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="kpi-formula-modal-body">
                    {/* Formula Text Area */}
                    <div className="kpi-formula-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label className="kpi-editor-label" style={{ margin: 0 }}>
                                Arithmetic Expression *
                            </label>
                            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                Supported: +, -, *, /, (, ) and whitelisted variables
                            </span>
                        </div>
                        <textarea
                            ref={textareaRef}
                            className="kpi-formula-textarea"
                            rows={3}
                            placeholder="e.g., (completed_tasks / total_assigned_tasks) * 100"
                            value={formula}
                            onChange={e => {
                                setFormula(e.target.value);
                                setTestResult(null);
                                setValidationError(null);
                            }}
                            data-testid="formula-input"
                        />

                        {/* Operator Buttons */}
                        <div className="kpi-operator-toolbar">
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                Operators:
                            </span>
                            {['+', '-', '*', '/', '(', ')'].map(op => (
                                <button
                                    key={op}
                                    type="button"
                                    className="kpi-operator-btn"
                                    onClick={() => handleOperatorClick(op)}
                                    data-testid={`operator-btn-${op}`}
                                >
                                    {op}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="kpi-operator-btn clear"
                                onClick={() => {
                                    setFormula('');
                                    setTestResult(null);
                                    setValidationError(null);
                                }}
                                title="Clear formula"
                                data-testid="clear-formula-btn"
                            >
                                <RotateCcw size={12} /> Clear
                            </button>
                        </div>
                    </div>

                    {/* Variable Chips Palette */}
                    <div className="kpi-formula-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label className="kpi-editor-label" style={{ margin: 0 }}>
                                    Whitelisted Variables
                                </label>
                                <span style={{ fontSize: 11, color: 'var(--tt)' }}>
                                    (Click a chip to insert into expression)
                                </span>
                            </div>

                            {/* Search */}
                            <div className="kpi-var-search-box">
                                <Search size={13} style={{ color: 'var(--tt)' }} />
                                <input
                                    type="text"
                                    className="kpi-var-search-input"
                                    placeholder="Search variables..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    data-testid="variable-search-input"
                                />
                            </div>
                        </div>

                        {/* Category filter tabs */}
                        <div className="kpi-var-category-tabs">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    className={`kpi-var-category-tab ${selectedCategory === cat ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                    data-testid={`category-tab-${cat.toLowerCase()}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {/* Chips container */}
                        <div className="kpi-var-chips-container" data-testid="variable-chips-container">
                            {filteredVariables.map(v => (
                                <button
                                    key={v.name}
                                    type="button"
                                    className="kpi-var-chip"
                                    onClick={() => handleVariableChipClick(v.name)}
                                    title={`${v.displayName} (${v.category || 'General'}): ${v.description || ''}`}
                                    data-testid={`var-chip-${v.name}`}
                                >
                                    <span className="kpi-var-chip-name">{v.name}</span>
                                    {v.unit && <span className="kpi-var-chip-unit">({v.unit})</span>}
                                </button>
                            ))}
                            {filteredVariables.length === 0 && (
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>
                                    No variables found matching "{searchTerm}".
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Quick Formula Presets */}
                    <div className="kpi-formula-presets">
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Sparkles size={13} color="var(--teal)" /> Quick Templates:
                        </span>
                        <button
                            type="button"
                            className="kpi-preset-btn"
                            onClick={() => {
                                setFormula('(completed_tasks / total_assigned_tasks) * 100');
                                setTestResult(null);
                            }}
                            data-testid="preset-completion-rate"
                        >
                            Completion Rate %
                        </button>
                        <button
                            type="button"
                            className="kpi-preset-btn"
                            onClick={() => {
                                setFormula('(otif_tasks / completed_tasks) * 100');
                                setTestResult(null);
                            }}
                            data-testid="preset-otif-rate"
                        >
                            OTIF %
                        </button>
                        <button
                            type="button"
                            className="kpi-preset-btn"
                            onClick={() => {
                                setFormula('(accurate_tasks / completed_tasks) * 100');
                                setTestResult(null);
                            }}
                            data-testid="preset-accuracy-rate"
                        >
                            Accuracy %
                        </button>
                        <button
                            type="button"
                            className="kpi-preset-btn"
                            onClick={() => {
                                setFormula('total_handling_hours / completed_tasks');
                                setTestResult(null);
                            }}
                            data-testid="preset-aht"
                        >
                            Handling Time
                        </button>
                    </div>

                    {/* Dry Run Test Area */}
                    <div className="kpi-dry-run-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--tp)' }}>
                                    🧪 Dry-Run Formula Testing
                                </h4>
                                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--tt)' }}>
                                    Verify expression safety and view mock calculation against sample variables.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="btn btn-teal btn-sm"
                                onClick={handleTestFormula}
                                disabled={isTesting || !formula.trim()}
                                data-testid="test-formula-btn"
                            >
                                <Play size={13} /> {isTesting ? 'Testing...' : 'Test Formula'}
                            </button>
                        </div>

                        {/* Validation Error Banner */}
                        {validationError && (
                            <div className="kpi-test-banner error" role="alert" data-testid="formula-validation-error">
                                <AlertCircle size={16} />
                                <span>{validationError}</span>
                            </div>
                        )}

                        {/* Test Result Display */}
                        {testResult && (
                            <div
                                className={`kpi-test-banner ${testResult.isValid ? 'success' : 'error'}`}
                                data-testid="test-result-banner"
                            >
                                {testResult.isValid ? (
                                    <div style={{ width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--ok)' }}>
                                                <CheckCircle2 size={16} /> Formula is Valid!
                                            </span>
                                            <span className="kpi-test-result-badge" data-testid="calculated-result-display">
                                                Result: {typeof testResult.result === 'number' ? testResult.result : '0.00'}
                                            </span>
                                        </div>

                                        {testResult.variablesUsed && testResult.variablesUsed.length > 0 && (
                                            <div style={{ fontSize: 11.5, color: 'var(--ts)', marginTop: 4 }}>
                                                <strong>Variables Evaluated:</strong>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                                    {testResult.variablesUsed.map(v => (
                                                        <span key={v} className="kpi-metric-tag" style={{ background: '#fff' }}>
                                                            {v} = {testResult.resolvedVariables?.[v] ?? sampleValues[v] ?? 0}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <AlertCircle size={16} color="var(--err)" />
                                        <div>
                                            <strong style={{ color: 'var(--err)' }}>Formula Evaluation Error:</strong>
                                            <div style={{ fontSize: 12, marginTop: 2 }}>
                                                {testResult.errorMessage || 'Invalid syntax or unwhitelisted identifier.'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="kpi-formula-modal-footer">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                        data-testid="cancel-formula-btn"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-teal"
                        onClick={handleApply}
                        disabled={!formula.trim()}
                        data-testid="apply-formula-btn"
                    >
                        Apply Formula
                    </button>
                </div>
            </div>
        </div>
    );
};
