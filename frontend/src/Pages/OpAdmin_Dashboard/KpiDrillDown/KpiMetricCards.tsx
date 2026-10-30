import React from 'react';
import {
    Award,
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    TrendingUp,
    Clock,
    CheckSquare,
    PackageCheck,
    FileCheck
} from 'lucide-react';
import {
    KpiHierarchyScopeResultDTO,
    KpiMetricValueDTO,
    TrafficLightRating
} from './types';

interface KpiMetricCardsProps {
    data: KpiHierarchyScopeResultDTO;
}

export const getRatingBadgeClass = (rating: TrafficLightRating) => {
    switch (rating) {
        case 'Green':
            return 'kpi-badge-green';
        case 'Amber':
            return 'kpi-badge-amber';
        case 'Red':
            return 'kpi-badge-red';
        default:
            return 'kpi-badge-neutral';
    }
};

export const getRatingIcon = (rating: TrafficLightRating) => {
    switch (rating) {
        case 'Green':
            return <CheckCircle2 size={16} className="kpi-icon-green" />;
        case 'Amber':
            return <AlertTriangle size={16} className="kpi-icon-amber" />;
        case 'Red':
            return <AlertCircle size={16} className="kpi-icon-red" />;
        default:
            return null;
    }
};

const getMetricIcon = (code: string) => {
    switch (code) {
        case 'OTIF':
            return <PackageCheck size={18} />;
        case 'ORDER_ACCURACY':
            return <FileCheck size={18} />;
        case 'TASK_COMPLETION_RATE':
            return <CheckSquare size={18} />;
        case 'AVERAGE_HANDLING_TIME':
            return <Clock size={18} />;
        default:
            return <TrendingUp size={18} />;
    }
};

export const KpiMetricCards: React.FC<KpiMetricCardsProps> = ({ data }) => {
    const {
        scopeLevel,
        scopeName,
        overallScore,
        overallRating,
        totalAssignedTasks,
        completedTasksCount,
        metrics = []
    } = data;

    const completionRate =
        totalAssignedTasks > 0
            ? Math.round((completedTasksCount / totalAssignedTasks) * 1000) / 10
            : 0;

    return (
        <div className="kpi-metric-summary-section">
            {/* Top Score Banner */}
            <div className="kpi-overall-banner">
                <div className="kpi-banner-info">
                    <div className="kpi-banner-scope-pill">
                        <span className="kpi-scope-type">{scopeLevel} Scope</span>
                        {data.roleFilter && (
                            <span className="kpi-role-tag">Role: {data.roleFilter}</span>
                        )}
                    </div>
                    <h2 className="kpi-banner-title">{scopeName || 'All Organization'}</h2>
                    <p className="kpi-banner-subtitle">
                        Period: {new Date(data.periodStart).toLocaleDateString()} &ndash;{' '}
                        {new Date(data.periodEnd).toLocaleDateString()}
                        {data.configurationTitle && (
                            <span className="kpi-config-tag">
                                Config: {data.configurationTitle}
                            </span>
                        )}
                    </p>
                </div>

                <div className="kpi-banner-stats">
                    <div className="kpi-overall-score-box">
                        <div className="kpi-score-label">Overall Performance</div>
                        <div className="kpi-score-display">
                            <span className="kpi-score-number">
                                {overallScore != null ? overallScore.toFixed(1) : '0.0'}%
                            </span>
                            <span
                                className={`kpi-rating-badge ${getRatingBadgeClass(overallRating)}`}
                                data-testid="kpi-overall-rating-badge"
                            >
                                {getRatingIcon(overallRating)}
                                <span>{overallRating}</span>
                            </span>
                        </div>
                    </div>

                    <div className="kpi-task-volume-box">
                        <div className="kpi-volume-item">
                            <span className="kpi-vol-title">Tasks Completed</span>
                            <span className="kpi-vol-value">
                                {completedTasksCount} / {totalAssignedTasks}
                            </span>
                            <span className="kpi-vol-sub">({completionRate}% assigned)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Individual Metric Cards */}
            {metrics.length > 0 && (
                <div className="kpi-metrics-grid">
                    {metrics.map((metric: KpiMetricValueDTO) => (
                        <div
                            key={metric.metricCode}
                            className={`kpi-metric-card ${getRatingBadgeClass(metric.rating)}`}
                            data-testid={`kpi-metric-card-${metric.metricCode.toLowerCase()}`}
                        >
                            <div className="kpi-card-header">
                                <div className="kpi-card-title-group">
                                    <span className="kpi-metric-icon">
                                        {getMetricIcon(metric.metricCode)}
                                    </span>
                                    <span className="kpi-metric-name">{metric.name}</span>
                                </div>
                                <span className={`kpi-metric-status ${getRatingBadgeClass(metric.rating)}`}>
                                    {getRatingIcon(metric.rating)}
                                    <span>{metric.rating}</span>
                                </span>
                            </div>

                            <div className="kpi-card-body">
                                <div className="kpi-card-value">
                                    <span className="kpi-actual">
                                        {metric.actualValue != null
                                            ? metric.actualValue.toFixed(1)
                                            : '0.0'}
                                        <small>{metric.unit}</small>
                                    </span>
                                </div>

                                <div className="kpi-card-meta">
                                    <div className="kpi-meta-row">
                                        <span>Target:</span>
                                        <strong>
                                            {metric.targetValue}
                                            {metric.unit}
                                        </strong>
                                    </div>
                                    <div className="kpi-meta-row">
                                        <span>Weight:</span>
                                        <strong>{metric.weight}%</strong>
                                    </div>
                                    <div className="kpi-meta-row">
                                        <span>Weighted Score:</span>
                                        <strong>{metric.weightedScore.toFixed(1)} pts</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
