import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';
import { User, AlertCircle, BarChart3 } from 'lucide-react';
import { ReviewResultDTO, EmployeeReviewScoreDTO, CriterionScoreDTO } from '../types';

export interface CriterionComparisonChartProps {
    review: ReviewResultDTO;
    selectedEmployeeId?: string;
    onEmployeeChange?: (employeeId: string) => void;
    className?: string;
}

interface ChartCriterionItem {
    name: string;
    shortName: string;
    selfScore: number;
    managerScore: number;
    gap: number;
    isOutlier: boolean;
    sectionTitle: string;
    weight: number;
}

const CustomComparisonTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: ChartCriterionItem = payload[0]?.payload;
    if (!item) return null;

    return (
        <div className="pe-chart-tooltip" role="tooltip">
            <div className="pe-chart-tooltip-header">
                <strong>{item.name}</strong>
                <span className="pe-chart-tooltip-badge">{item.sectionTitle}</span>
            </div>
            <div className="pe-chart-tooltip-body">
                <div className="pe-chart-tooltip-row">
                    <span className="pe-dot pe-dot-indigo" />
                    <span>Self-Assessment:</span>
                    <strong>{item.selfScore > 0 ? item.selfScore.toFixed(1) : 'Not rated'} / 5</strong>
                </div>
                <div className="pe-chart-tooltip-row">
                    <span className="pe-dot pe-dot-teal" />
                    <span>Manager Rating:</span>
                    <strong>{item.managerScore > 0 ? item.managerScore.toFixed(1) : 'Not rated'} / 5</strong>
                </div>
                <div className="pe-chart-tooltip-row">
                    <span>Score Gap:</span>
                    <strong className={item.isOutlier ? 'pe-text-outlier' : ''}>
                        {item.gap > 0 ? `+${item.gap.toFixed(1)}` : item.gap.toFixed(1)}
                    </strong>
                </div>
                {item.isOutlier && (
                    <div className="pe-chart-tooltip-outlier">
                        <AlertCircle size={12} />
                        <span>High Variance Outlier (|gap| ≥ 2.0)</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export const CriterionComparisonChart: React.FC<CriterionComparisonChartProps> = ({
    review,
    selectedEmployeeId,
    onEmployeeChange,
    className = ''
}) => {
    const isTeamScope = review.scope === 'Team' || review.scope === 'Department' || (review.employees && review.employees.length > 1);

    // Fallback internal state if not controlled from parent
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

    // Flatten criteria for the employee
    const chartData: ChartCriterionItem[] = useMemo(() => {
        if (!currentEmployee || !currentEmployee.sections) return [];
        const items: ChartCriterionItem[] = [];

        currentEmployee.sections.forEach(section => {
            if (!section.criteria) return;
            section.criteria.forEach((criterion: CriterionScoreDTO) => {
                const selfVal = criterion.selfScore ?? 0;
                const mgrVal = criterion.managerScore ?? 0;
                const gapVal = criterion.gap ?? (mgrVal - selfVal);

                items.push({
                    name: criterion.criterionTitle,
                    shortName: criterion.criterionTitle.length > 20
                        ? `${criterion.criterionTitle.slice(0, 18)}...`
                        : criterion.criterionTitle,
                    selfScore: selfVal,
                    managerScore: mgrVal,
                    gap: gapVal,
                    isOutlier: criterion.isOutlier || Math.abs(gapVal) >= 2,
                    sectionTitle: section.sectionTitle,
                    weight: criterion.weight
                });
            });
        });

        return items;
    }, [currentEmployee]);

    return (
        <div className={`pe-chart-card ${className}`} data-testid="criterion-comparison-chart-card">
            <div className="pe-chart-header">
                <div>
                    <h3 className="pe-chart-title">
                        <BarChart3 size={18} />
                        <span>Criterion Comparison: Self vs. Manager</span>
                    </h3>
                    <p className="pe-chart-subtitle">
                        Grouped rating alignment per evaluation criterion (1 to 5 scale).
                    </p>
                </div>

                {/* Employee selector for Team or Department scope */}
                {isTeamScope && review.employees && review.employees.length > 0 && (
                    <div className="pe-chart-employee-selector">
                        <User size={14} className="pe-selector-icon" />
                        <select
                            className="pe-form-select pe-input-sm"
                            value={activeEmpId}
                            onChange={e => handleEmployeeSelect(e.target.value)}
                            data-testid="criterion-chart-employee-select"
                            aria-label="Select Employee for Criterion Comparison"
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

            {chartData.length === 0 ? (
                <div className="pe-chart-empty" data-testid="criterion-comparison-empty">
                    <p>No criteria ratings recorded for this employee yet.</p>
                </div>
            ) : (
                <div className="pe-chart-body" data-testid="criterion-comparison-body">
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
                                domain={[0, 5]}
                                ticks={[0, 1, 2, 3, 4, 5]}
                                tick={{ fontSize: 11, fill: '#64748B' }}
                            />
                            <Tooltip content={<CustomComparisonTooltip />} />
                            <Legend
                                verticalAlign="top"
                                height={36}
                                iconType="circle"
                                wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                            />
                            <Bar
                                dataKey="selfScore"
                                name="Self-Assessment"
                                fill="#4F46E5"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={36}
                            />
                            <Bar
                                dataKey="managerScore"
                                name="Manager Rating"
                                fill="#00A99D"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={36}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

