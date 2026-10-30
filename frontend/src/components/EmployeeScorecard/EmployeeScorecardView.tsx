import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Award,
    Download,
    FileText,
    FileSpreadsheet,
    Calendar,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    Shield,
    TrendingUp,
    Info,
    Loader2
} from 'lucide-react';
import { useToast } from '../Toast/Toast';
import {
    EmployeeKpiEvaluationResultDTO,
    KpiMetricValueDTO,
    TrafficLightRating,
    TimeframePreset
} from '../Pages/OpAdmin_Dashboard/KpiDrillDown/types';
import {
    fetchMyScorecard,
    fetchEmployeeScorecard,
    exportScorecard
} from '../../services/kpiService';
import './EmployeeScorecardView.css';

export interface EmployeeScorecardViewProps {
    employeeId?: string;
    title?: string;
}

const getDefaultDates = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    return {
        startDate: thirtyDaysAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
    };
};

export const getRatingBadgeClass = (rating: TrafficLightRating | string): string => {
    switch (rating) {
        case 'Green':
            return 'kpi-badge-green';
        case 'Amber':
            return 'kpi-badge-amber';
        case 'Red':
            return 'kpi-badge-red';
        default:
            return 'kpi-badge-amber';
    }
};

export const getRatingIcon = (rating: TrafficLightRating | string) => {
    switch (rating) {
        case 'Green':
            return <CheckCircle2 size={14} className="text-success" />;
        case 'Amber':
            return <Clock size={14} className="text-warning" />;
        case 'Red':
            return <AlertCircle size={14} className="text-danger" />;
        default:
            return <Info size={14} />;
    }
};

export const EmployeeScorecardView: React.FC<EmployeeScorecardViewProps> = ({
    employeeId,
    title = 'My KPI Scorecard'
}) => {
    let toastMethods = { success: (_m: string) => { }, error: (_m: string) => { }, info: (_m: string) => { } };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error, info: t.info };
        }
    } catch {
        // Fallback when rendered outside ToastProvider
    }
    const { success, error } = toastMethods;

    const defaultDates = useMemo(() => getDefaultDates(), []);
    const [timeframe, setTimeframe] = useState<TimeframePreset>('30d');
    const [startDate, setStartDate] = useState<string>(defaultDates.startDate);
    const [endDate, setEndDate] = useState<string>(defaultDates.endDate);

    const [data, setData] = useState<EmployeeKpiEvaluationResultDTO | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string | null>(null);
    const [exportingFormat, setExportingFormat] = useState<'pdf' | 'excel' | null>(null);

    // Fetch scorecard
    const loadScorecard = useCallback(async (start: string, end: string) => {
        setLoading(true);
        setApiError(null);
        try {
            const result = employeeId
                ? await fetchEmployeeScorecard(employeeId, start, end)
                : await fetchMyScorecard(start, end);
            setData(result);
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to load employee scorecard.';
            setApiError(msg);
            error(msg);
        } finally {
            setLoading(false);
        }
    }, [employeeId, error]);

    useEffect(() => {
        loadScorecard(startDate, endDate);
    }, [loadScorecard, startDate, endDate]);

    // Handle timeframe presets
    const handleTimeframeChange = (preset: TimeframePreset) => {
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        let start = new Date(today);
        let end = new Date(today);

        switch (preset) {
            case '7d':
                start.setDate(today.getDate() - 7);
                break;
            case '30d':
                start.setDate(today.getDate() - 30);
                break;
            case 'month':
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                break;
            case 'quarter':
                const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
                start = new Date(today.getFullYear(), quarterMonth, 1);
                break;
            case 'custom':
                setTimeframe('custom');
                return;
        }

        const startStr = formatDate(start);
        const endStr = formatDate(end);
        setTimeframe(preset);
        setStartDate(startStr);
        setEndDate(endStr);
    };

    // Export Handler
    const handleExport = async (format: 'pdf' | 'excel') => {
        setExportingFormat(format);
        try {
            await exportScorecard(employeeId, format, startDate, endDate);
            success(`${format.toUpperCase()} scorecard exported successfully.`);
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || `Failed to export ${format.toUpperCase()} scorecard.`;
            error(msg);
        } finally {
            setExportingFormat(null);
        }
    };

    const ratingDescription = useMemo(() => {
        if (!data) return '';
        switch (data.overallRating) {
            case 'Green':
                return 'Good Performance — Meeting or exceeding operational targets';
            case 'Amber':
                return 'Warning Zone — Approaching threshold limits; needs attention';
            case 'Red':
                return 'Critical Red Zone — Performance breached minimum threshold standards';
            default:
                return 'Performance Evaluation';
        }
    }, [data]);

    return (
        <div className="employee-scorecard-container" data-testid="employee-scorecard-view">
            {/* View Header */}
            <div className="scorecard-header-bar">
                <div className="scorecard-title-block">
                    <div className="scorecard-heading-row">
                        <Award className="scorecard-header-icon" size={24} />
                        <h2 className="scorecard-main-title">{title}</h2>
                    </div>
                    <p className="scorecard-subtitle">
                        Weighted performance scorecard and traffic-light evaluation derived from task execution and audit records.
                    </p>
                </div>

                {/* Export Controls */}
                <div className="scorecard-export-actions">
                    <button
                        type="button"
                        className="scorecard-btn scorecard-btn-pdf"
                        onClick={() => handleExport('pdf')}
                        disabled={loading || exportingFormat !== null}
                        title="Download scorecard as PDF"
                        data-testid="scorecard-export-pdf-btn"
                    >
                        {exportingFormat === 'pdf' ? (
                            <Loader2 size={15} className="scorecard-spin" />
                        ) : (
                            <FileText size={15} />
                        )}
                        <span>Export PDF</span>
                    </button>

                    <button
                        type="button"
                        className="scorecard-btn scorecard-btn-excel"
                        onClick={() => handleExport('excel')}
                        disabled={loading || exportingFormat !== null}
                        title="Download scorecard as Excel workbook"
                        data-testid="scorecard-export-excel-btn"
                    >
                        {exportingFormat === 'excel' ? (
                            <Loader2 size={15} className="scorecard-spin" />
                        ) : (
                            <FileSpreadsheet size={15} />
                        )}
                        <span>Export Excel</span>
                    </button>
                </div>
            </div>

            {/* Timeframe & Filter Toolbar */}
            <div className="scorecard-filter-toolbar">
                <div className="scorecard-presets-group">
                    <span className="scorecard-filter-label">
                        <Calendar size={14} />
                        <span>Period:</span>
                    </span>
                    {(['7d', '30d', 'month', 'quarter', 'custom'] as TimeframePreset[]).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className={`scorecard-preset-pill ${timeframe === preset ? 'active' : ''}`}
                            onClick={() => handleTimeframeChange(preset)}
                            data-testid={`scorecard-timeframe-${preset}`}
                        >
                            {preset === '7d' && '7 Days'}
                            {preset === '30d' && '30 Days'}
                            {preset === 'month' && 'This Month'}
                            {preset === 'quarter' && 'This Quarter'}
                            {preset === 'custom' && 'Custom Range'}
                        </button>
                    ))}
                </div>

                <div className="scorecard-date-inputs">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                            setTimeframe('custom');
                            setStartDate(e.target.value);
                        }}
                        aria-label="Start date"
                    />
                    <span className="date-sep">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                            setTimeframe('custom');
                            setEndDate(e.target.value);
                        }}
                        aria-label="End date"
                    />
                    <button
                        type="button"
                        className="scorecard-refresh-btn"
                        onClick={() => loadScorecard(startDate, endDate)}
                        title="Refresh scorecard"
                        data-testid="scorecard-refresh-btn"
                    >
                        <RefreshCw size={14} className={loading ? 'scorecard-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {apiError && (
                <div className="scorecard-error-banner" role="alert" data-testid="scorecard-error-banner">
                    <AlertCircle size={20} />
                    <div className="scorecard-error-text">
                        <strong>Error loading scorecard:</strong>
                        <span>{apiError}</span>
                    </div>
                    <button
                        type="button"
                        className="scorecard-retry-btn"
                        onClick={() => loadScorecard(startDate, endDate)}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="scorecard-loading-state" data-testid="scorecard-loading-state">
                    <Loader2 size={36} className="scorecard-spin" />
                    <span>Evaluating employee performance against active KPI rules...</span>
                </div>
            )}

            {/* Scorecard Body */}
            {!loading && data && (
                <div className="scorecard-content-body">
                    {/* Performance Score Hero Card */}
                    <div className="scorecard-hero-card" data-testid="scorecard-hero-card">
                        <div className="scorecard-hero-left">
                            <div className="scorecard-score-box">
                                <span className="scorecard-score-value" data-testid="scorecard-overall-score">
                                    {data.overallScore.toFixed(1)}%
                                </span>
                                <span className="scorecard-score-caption">Overall Performance Score</span>
                            </div>

                            <div className="scorecard-status-box">
                                <div className={`scorecard-rating-pill ${getRatingBadgeClass(data.overallRating)}`} data-testid="scorecard-overall-rating">
                                    {getRatingIcon(data.overallRating)}
                                    <span>{data.overallRating} Status</span>
                                </div>
                                <p className="scorecard-rating-desc">{ratingDescription}</p>
                            </div>
                        </div>

                        <div className="scorecard-hero-meta">
                            <div className="scorecard-meta-row">
                                <span className="meta-label">Employee:</span>
                                <span className="meta-val font-semibold">{data.employeeName}</span>
                            </div>
                            <div className="scorecard-meta-row">
                                <span className="meta-label">Employee ID:</span>
                                <span className="meta-val">#{data.employeeNumber}</span>
                            </div>
                            {data.departmentName && (
                                <div className="scorecard-meta-row">
                                    <span className="meta-label">Department:</span>
                                    <span className="meta-val">{data.departmentName}</span>
                                </div>
                            )}
                            {data.role && (
                                <div className="scorecard-meta-row">
                                    <span className="meta-label">Target Role:</span>
                                    <span className="meta-val">{data.role}</span>
                                </div>
                            )}
                            {data.configurationTitle && (
                                <div className="scorecard-meta-row">
                                    <span className="meta-label">Evaluation Rule:</span>
                                    <span className="meta-val text-muted text-xs">{data.configurationTitle}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Task Quality & Volume Snapshot */}
                    <div className="scorecard-snapshot-grid" data-testid="scorecard-snapshot-grid">
                        <div className="scorecard-stat-card">
                            <span className="stat-label">Assigned Tasks</span>
                            <span className="stat-num">{data.totalAssignedTasks}</span>
                        </div>
                        <div className="scorecard-stat-card">
                            <span className="stat-label">Completed Tasks</span>
                            <span className="stat-num text-success">{data.completedTasksCount}</span>
                        </div>
                        <div className="scorecard-stat-card">
                            <span className="stat-label">On-Time Deliveries</span>
                            <span className="stat-num">{data.onTimeTasksCount}</span>
                        </div>
                        <div className="scorecard-stat-card">
                            <span className="stat-label">In-Full Deliveries</span>
                            <span className="stat-num">{data.inFullTasksCount}</span>
                        </div>
                        <div className="scorecard-stat-card">
                            <span className="stat-label">OTIF Tasks</span>
                            <span className="stat-num">{data.otifTasksCount}</span>
                        </div>
                        <div className="scorecard-stat-card">
                            <span className="stat-label">Pushbacks / Reworks</span>
                            <span className="stat-num text-warning">{data.reworkTasksCount}</span>
                        </div>
                        <div className="scorecard-stat-card">
                            <span className="stat-label">Handling Hours</span>
                            <span className="stat-num">{data.totalHandlingHours.toFixed(1)} hrs</span>
                        </div>
                    </div>

                    {/* Metric Breakdown Table */}
                    <div className="scorecard-table-card" data-testid="scorecard-metrics-card">
                        <div className="scorecard-table-heading">
                            <h3 className="scorecard-section-title">Weighted KPI Metrics Breakdown</h3>
                            <span className="scorecard-metric-count">
                                {data.metrics?.length || 0} active evaluation metrics
                            </span>
                        </div>

                        <div className="scorecard-table-wrapper">
                            <table className="scorecard-table" data-testid="scorecard-metrics-table">
                                <thead>
                                    <tr>
                                        <th>Metric Name</th>
                                        <th className="text-center">Weight</th>
                                        <th className="text-center">Target</th>
                                        <th className="text-center">Actual Value</th>
                                        <th className="text-center">Weighted Score</th>
                                        <th className="text-center">Status</th>
                                        <th className="text-center">Traffic-Light Thresholds</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.metrics || []).map((m: KpiMetricValueDTO) => (
                                        <tr key={m.metricCode} data-testid={`scorecard-metric-row-${m.metricCode.toLowerCase()}`}>
                                            <td>
                                                <div className="metric-info-cell">
                                                    <span className="metric-name font-semibold">{m.name}</span>
                                                    <span className="metric-code text-muted text-xs">[{m.metricCode}]</span>
                                                    {m.isCustomFormula && m.customFormula && (
                                                        <div className="metric-custom-formula">
                                                            <code>Formula: {m.customFormula}</code>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="text-center">{m.weight}%</td>
                                            <td className="text-center">
                                                {m.targetValue} {m.unit}
                                            </td>
                                            <td className="text-center font-bold">
                                                {m.actualValue.toFixed(1)} {m.unit}
                                            </td>
                                            <td className="text-center font-bold">
                                                {m.weightedScore.toFixed(1)} pts
                                            </td>
                                            <td className="text-center">
                                                <span className={`kpi-rating-badge ${getRatingBadgeClass(m.rating)}`}>
                                                    {getRatingIcon(m.rating)}
                                                    <span>{m.rating}</span>
                                                </span>
                                            </td>
                                            <td className="text-center">
                                                <div className="thresholds-cell text-xs">
                                                    {m.isLowerBetter ? (
                                                        <span>
                                                            <span className="text-success">&le; {m.greenThreshold}</span> |{' '}
                                                            <span className="text-warning">&le; {m.amberThreshold}</span> |{' '}
                                                            <span className="text-danger">&gt; {m.redThreshold}</span>
                                                        </span>
                                                    ) : (
                                                        <span>
                                                            <span className="text-success">&ge; {m.greenThreshold}</span> |{' '}
                                                            <span className="text-warning">&ge; {m.amberThreshold}</span> |{' '}
                                                            <span className="text-danger">&lt; {m.redThreshold}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

