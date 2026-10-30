import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from 'recharts';
import { User, Layers, Sparkles } from 'lucide-react';
import { ReviewResultDTO, EmployeeReviewScoreDTO, SectionScoreDTO } from '../types';

export interface SectionBreakdownChartProps {
    review: ReviewResultDTO;
    selectedEmployeeId?: string;
    onEmployeeChange?: (employeeId: string) => void;
    className?: string;
}

interface ChartSectionItem {
    name: string;
    shortName: string;
    score: number;
    weightedScore: number;
    weight: number;
    isKpiSection: boolean;
}

const CustomSectionTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: ChartSectionItem = payload[0]?.payload;
    if (!item) return null;

    return (
        <div className="pe-chart-tooltip" role="tooltip">
            <div className="pe-chart-tooltip-header">
                <strong>{item.name}</strong>
                {item.isKpiSection ? (
                    <span className="pe-chart-tooltip-kpi-badge">
                        <Sparkles size={11} />
                        KPI Section
                    </span>
                ) : (
                    <span className="pe-chart-tooltip-badge">Standard Section</span>
                )}
            </div>
            <div className="pe-chart-tooltip-body">
                <div className="pe-chart-tooltip-row">
                    <span>Section Score:</span>
                    <strong>{item.score.toFixed(1)} / 100</strong>
                </div>
                <div className="pe-chart-tooltip-row">
                    <span>Section Weight:</span>
                    <strong>{item.weight}%</strong>
                </div>
                <div className="pe-chart-tooltip-row">
                    <span>Weighted Contribution:</span>
                    <strong>{item.weightedScore.toFixed(1)} pts</strong>
                </div>
            </div>
        </div>
    );
};

export const SectionBreakdownChart: React.FC<SectionBreakdownChartProps> = ({
    review,
    selectedEmployeeId,
    onEmployeeChange,
    className = ''
}) => {
    const isTeamScope = review.scope === 'Team' || review.scope === 'Department' || (review.employees && review.employees.length > 1);

    const [internalEmployeeId, setInternalEmployeeId] = useState<string>(
        selectedEmployeeId || review.employees?.[0]?.employeeId || ''
    );

    const activeEmpId = selectedEmployeeId || internalEmployeeId || review.employees?.[0]?.employeeId || '';

    const currentEmployee: EmployeeReviewScoreDTO | undefined = useMemo(() => {
        return review.employees?.find(e => e.employeeId === activeEmpId) || review.employees?.[0];
    }, [review.employees, activeEmpId]);

    const handleEmployeeSelect = (empId: string) => {
        setInternalEmployeeId(empId);
        onEmployeeChange?.(empId);
    };

    const chartData: ChartSectionItem[] = useMemo(() => {
        if (!currentEmployee || !currentEmployee.sections) return [];

        return currentEmployee.sections.map((section: SectionScoreDTO) => ({
            name: section.sectionTitle,
            shortName: section.sectionTitle.length > 20
                ? `${section.sectionTitle.slice(0, 18)}...`
                : section.sectionTitle,
            score: Math.min(100, Math.max(0, section.score ?? 0)),
            weightedScore: section.weightedScore ?? 0,
            weight: section.weight ?? 0,
            isKpiSection: Boolean(section.isKpiSection)
        }));
    }, [currentEmployee]);

    return (
        <div className={`pe-chart-card ${className}`} data-testid="section-breakdown-chart-card">
            <div className="pe-chart-header">
                <div>
                    <h3 className="pe-chart-title">
                        <Layers size={18} />
                        <span>Section Breakdown</span>
                    </h3>
                    <p className="pe-chart-subtitle">
                        Section scores (0–100); KPI section highlighted in amber.
                    </p>
                </div>

                {/* Employee selector when multiple employees */}
                {isTeamScope && review.employees && review.employees.length > 0 && (
                    <div className="pe-chart-employee-selector">
                        <User size={14} className="pe-selector-icon" />
                        <select
                            className="pe-form-select pe-input-sm"
                            value={activeEmpId}
                            onChange={e => handleEmployeeSelect(e.target.value)}
                            data-testid="section-chart-employee-select"
                            aria-label="Select Employee for Section Breakdown"
                        >
                            {review.employees.map(emp => (
                                <option key={emp.employeeId} value={emp.employeeId}>
                                    {emp.employeeName} {emp.role ? `(${emp.role})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Visual Legend for standard vs KPI highlighted section */}
            <div className="pe-chart-custom-legend">
                <div className="pe-legend-item">
                    <span className="pe-legend-color pe-color-teal" />
                    <span>Standard Section</span>
                </div>
                <div className="pe-legend-item">
                    <span className="pe-legend-color pe-color-amber" />
                    <span>Operational KPI Section (Highlighted)</span>
                </div>
            </div>

            {chartData.length === 0 ? (
                <div className="pe-chart-empty" data-testid="section-breakdown-empty">
                    <p>No section scores calculated for this employee yet.</p>
                </div>
            ) : (
                <div className="pe-chart-body" data-testid="section-breakdown-body">
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 20, left: -10, bottom: 40 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                                dataKey="shortName"
                                angle={-20}
                                textAnchor="end"
                                height={60}
                                interval={0}
                                tick={{ fontSize: 11, fill: '#64748B' }}
                            />
                            <YAxis
                                domain={[0, 100]}
                                ticks={[0, 20, 40, 60, 80, 100]}
                                tick={{ fontSize: 11, fill: '#64748B' }}
                            />
                            <Tooltip content={<CustomSectionTooltip />} />
                            <Bar
                                dataKey="score"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={48}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`section-cell-${index}`}
                                        fill={entry.isKpiSection ? '#D97706' : '#00A99D'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

