import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Award,
    FileText,
    FileSpreadsheet,
    Calendar,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    Info,
    HelpCircle,
    ChevronDown,
    ChevronUp,
    X,
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

export const getRatingLabel = (rating: TrafficLightRating | string): string => {
    switch (rating) {
        case 'Green':
            return 'On Target';
        case 'Amber':
            return 'Needs Attention';
        case 'Red':
            return 'Below Target';
        default:
            return 'In Evaluation';
    }
};

export const getRatingDescription = (rating: TrafficLightRating | string): string => {
    switch (rating) {
        case 'Green':
            return 'Good Performance — Meeting or exceeding operational targets across assigned tasks';
        case 'Amber':
            return 'Warning Zone — Approaching threshold limits; requires attention to prevent slipping';
        case 'Red':
            return 'Critical Red Zone — Performance breached minimum threshold standards; corrective action required';
        default:
            return 'Performance Evaluation';
    }
};

export const getRatingIcon = (rating: TrafficLightRating | string, size: number = 14) => {
    switch (rating) {
        case 'Green':
            return <CheckCircle2 size={size} className="rating-icon rating-icon-green" aria-hidden="true" />;
        case 'Amber':
            return <Clock size={size} className="rating-icon rating-icon-amber" aria-hidden="true" />;
        case 'Red':
            return <AlertCircle size={size} className="rating-icon rating-icon-red" aria-hidden="true" />;
        default:
            return <Info size={size} className="rating-icon" aria-hidden="true" />;
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

    // Guide section & threshold tooltip interactive state
    const [isGuideOpen, setIsGuideOpen] = useState<boolean>(true);
    const [showThresholdTooltip, setShowThresholdTooltip] = useState<boolean>(false);

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

    // Threshold values derived dynamically from KPI config (single source of truth)
    const greenThreshold = data?.overallGreenThreshold ?? 85.0;
    const amberThreshold = data?.overallAmberThreshold ?? 70.0;

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
                        Operational performance scorecard and traffic-light evaluation derived from task execution and audit records.
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
                                <div className="scorecard-status-pill-group">
                                    <div
                                        className={`scorecard-rating-pill ${getRatingBadgeClass(data.overallRating)}`}
                                        data-testid="scorecard-overall-rating"
                                        aria-label={`Overall Status: ${getRatingLabel(data.overallRating)}`}
                                    >
                                        {getRatingIcon(data.overallRating, 16)}
                                        <span className="rating-pill-text">{getRatingLabel(data.overallRating)}</span>
                                        <span className="rating-pill-sub">({data.overallRating})</span>
                                    </div>

                                    {/* Tooltip trigger for short explanation */}
                                    <div className="scorecard-tooltip-container">
                                        <button
                                            type="button"
                                            className="scorecard-info-btn"
                                            onClick={() => setShowThresholdTooltip((prev) => !prev)}
                                            title="View status threshold details"
                                            aria-label="View status threshold details"
                                            data-testid="scorecard-threshold-info-btn"
                                        >
                                            <Info size={15} />
                                        </button>
                                        {showThresholdTooltip && (
                                            <div
                                                className="scorecard-tooltip-popup"
                                                role="tooltip"
                                                data-testid="scorecard-threshold-tooltip"
                                            >
                                                <div className="tooltip-header">
                                                    <strong>Threshold Scale</strong>
                                                    <button
                                                        type="button"
                                                        className="tooltip-close-btn"
                                                        onClick={() => setShowThresholdTooltip(false)}
                                                        aria-label="Close tooltip"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                <ul className="tooltip-scale-list">
                                                    <li>
                                                        <CheckCircle2 size={13} className="rating-icon-green" />
                                                        <span><strong>On Target (Green):</strong> &ge; {greenThreshold}% overall score</span>
                                                    </li>
                                                    <li>
                                                        <Clock size={13} className="rating-icon-amber" />
                                                        <span><strong>Needs Attention (Amber):</strong> {amberThreshold}% to {(greenThreshold - 0.1).toFixed(1)}% score</span>
                                                    </li>
                                                    <li>
                                                        <AlertCircle size={13} className="rating-icon-red" />
                                                        <span><strong>Below Target (Red):</strong> &lt; {amberThreshold}% score or critical breach</span>
                                                    </li>
                                                </ul>
                                                <div className="tooltip-footer">
                                                    Source: {data.configurationTitle || 'Active KPI Rule'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Metric value and target basis */}
                                <div className="scorecard-status-basis" data-testid="scorecard-status-basis">
                                    <span className="basis-item">
                                        Score: <strong>{data.overallScore.toFixed(1)}%</strong>
                                    </span>
                                    <span className="basis-sep">&bull;</span>
                                    <span className="basis-item">
                                        Target: <strong>&ge; {greenThreshold}%</strong>
                                    </span>
                                </div>

                                <p className="scorecard-rating-desc">{getRatingDescription(data.overallRating)}</p>
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

                    {/* Empty State Banner when employee has no tasks assigned */}
                    {data.totalAssignedTasks === 0 && (
                        <div className="scorecard-empty-banner" data-testid="scorecard-empty-state">
                            <div className="empty-banner-icon">
                                <Info size={24} className="text-info" />
                            </div>
                            <div className="empty-banner-content">
                                <h4 className="empty-banner-title">No Task Activity Recorded in this Period</h4>
                                <p className="empty-banner-text">
                                    No tasks were assigned to you between <strong>{startDate}</strong> and <strong>{endDate}</strong>.
                                    Your performance score and status will calculate automatically once assigned tasks are processed.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Traffic Light Thresholds Guide & Scale (Full Explanation) */}
                    <div className="scorecard-guide-card" data-testid="scorecard-guide-card">
                        <button
                            type="button"
                            className="scorecard-guide-header"
                            onClick={() => setIsGuideOpen((prev) => !prev)}
                            aria-expanded={isGuideOpen}
                            data-testid="scorecard-guide-toggle"
                        >
                            <div className="guide-header-title">
                                <HelpCircle size={18} className="guide-title-icon" />
                                <div className="guide-title-text">
                                    <h3 className="scorecard-section-title">How is your Scorecard calculated?</h3>
                                    <span className="guide-subtitle">
                                        Traffic-light scale and operational performance standards
                                    </span>
                                </div>
                            </div>
                            <div className="guide-header-toggle">
                                <span className="guide-toggle-text">{isGuideOpen ? 'Hide Guide' : 'Show Guide'}</span>
                                {isGuideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                        </button>

                        {isGuideOpen && (
                            <div className="scorecard-guide-body" data-testid="scorecard-guide-body">
                                <p className="guide-intro">
                                    Your scorecard measures execution quality and delivery speed across all tasks assigned to you during the selected period.
                                    Each task metric is weighted according to company rules (<strong>{data.configurationTitle || 'Active KPI Configuration'}</strong>).
                                </p>

                                <div className="guide-scale-grid">
                                    {/* Green Tier Card */}
                                    <div className="guide-tier-card tier-green" data-testid="guide-tier-green">
                                        <div className="tier-header">
                                            <CheckCircle2 size={18} className="rating-icon-green" />
                                            <h4 className="tier-name">On Target (Green)</h4>
                                        </div>
                                        <div className="tier-range">
                                            Overall Score: <strong>&ge; {greenThreshold}%</strong>
                                        </div>
                                        <p className="tier-desc">
                                            Meeting or exceeding operational targets. All assigned tasks meet SLA deadlines and quality checks with no critical errors.
                                        </p>
                                    </div>

                                    {/* Amber Tier Card */}
                                    <div className="guide-tier-card tier-amber" data-testid="guide-tier-amber">
                                        <div className="tier-header">
                                            <Clock size={18} className="rating-icon-amber" />
                                            <h4 className="tier-name">Needs Attention (Amber)</h4>
                                        </div>
                                        <div className="tier-range">
                                            Overall Score: <strong>{amberThreshold}% – {(greenThreshold - 0.1).toFixed(1)}%</strong>
                                        </div>
                                        <p className="tier-desc">
                                            Approaching threshold limits. One or more metrics are slightly below goal. Review the metrics breakdown below to get back on target.
                                        </p>
                                    </div>

                                    {/* Red Tier Card */}
                                    <div className="guide-tier-card tier-red" data-testid="guide-tier-red">
                                        <div className="tier-header">
                                            <AlertCircle size={18} className="rating-icon-red" />
                                            <h4 className="tier-name">Below Target (Red)</h4>
                                        </div>
                                        <div className="tier-range">
                                            Overall Score: <strong>&lt; {amberThreshold}%</strong> (or critical metric breach)
                                        </div>
                                        <p className="tier-desc">
                                            Performance is below minimum operational requirements. Work closely with your coordinator or lead to address task delays or quality reworks.
                                        </p>
                                    </div>
                                </div>

                                <div className="guide-footer-note">
                                    <span className="font-semibold">Scale rule:</span> For percentage metrics (OTIF, Order Accuracy, Completion Rate), a higher percentage is better (&ge; Green threshold). For duration metrics (Average Handling Time), faster/lower hours is better (&le; Green threshold). Values exactly on the threshold qualify for that tier.
                                </div>
                            </div>
                        )}
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
                            <div className="scorecard-table-title-group">
                                <h3 className="scorecard-section-title">Weighted KPI Metrics Breakdown</h3>
                                <span className="scorecard-metric-count">
                                    {data.metrics?.length || 0} active evaluation metrics
                                </span>
                            </div>
                            <div className="scorecard-table-legend-hint text-xs text-muted">
                                <span>Thresholds reflect management KPI rules</span>
                            </div>
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
                                        <th className="text-center">Threshold Scale</th>
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
                                                <div className="metric-status-cell">
                                                    <span
                                                        className={`kpi-rating-badge ${getRatingBadgeClass(m.rating)}`}
                                                        data-testid={`metric-rating-badge-${m.metricCode.toLowerCase()}`}
                                                    >
                                                        {getRatingIcon(m.rating, 14)}
                                                        <span>{getRatingLabel(m.rating)}</span>
                                                    </span>
                                                    <span className="metric-status-subtext text-xs text-muted">
                                                        {m.actualValue.toFixed(1)} / {m.targetValue} {m.unit}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-center">
                                                <div className="thresholds-cell text-xs">
                                                    {m.isLowerBetter ? (
                                                        <div className="threshold-pill-list">
                                                            <span className="thresh-chip chip-green" title="On Target">
                                                                &le; {m.greenThreshold} {m.unit}
                                                            </span>
                                                            <span className="thresh-sep">|</span>
                                                            <span className="thresh-chip chip-amber" title="Needs Attention">
                                                                &le; {m.amberThreshold} {m.unit}
                                                            </span>
                                                            <span className="thresh-sep">|</span>
                                                            <span className="thresh-chip chip-red" title="Below Target">
                                                                &gt; {m.amberThreshold} {m.unit}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="threshold-pill-list">
                                                            <span className="thresh-chip chip-green" title="On Target">
                                                                &ge; {m.greenThreshold} {m.unit}
                                                            </span>
                                                            <span className="thresh-sep">|</span>
                                                            <span className="thresh-chip chip-amber" title="Needs Attention">
                                                                &ge; {m.amberThreshold} {m.unit}
                                                            </span>
                                                            <span className="thresh-sep">|</span>
                                                            <span className="thresh-chip chip-red" title="Below Target">
                                                                &lt; {m.amberThreshold} {m.unit}
                                                            </span>
                                                        </div>
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
