import React, { useMemo } from 'react';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend
} from 'recharts';
import { PieChart as PieIcon, Info } from 'lucide-react';
import { ReviewResultDTO } from '../types';

export interface RatingDistributionChartProps {
    review: ReviewResultDTO;
    className?: string;
}

interface RatingSliceItem {
    name: string;
    value: number;
    percentage: string;
    color: string;
}

const RATING_PALETTE: Record<string, string> = {
    'Outstanding': '#00A99D',
    'Exceeds Expectations': '#059669',
    'Exceeds': '#059669',
    'Meets Expectations': '#2563EB',
    'Meets': '#2563EB',
    'Satisfactory': '#3B82F6',
    'Needs Improvement': '#D97706',
    'Unsatisfactory': '#DC2626',
    'Unassigned': '#94A3B8'
};

const FALLBACK_COLORS = [
    '#00A99D',
    '#2563EB',
    '#059669',
    '#D97706',
    '#8B5CF6',
    '#EC4899',
    '#64748B'
];

const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item: RatingSliceItem = payload[0]?.payload;
    if (!item) return null;

    return (
        <div className="pe-chart-tooltip" role="tooltip">
            <div className="pe-chart-tooltip-header">
                <strong>{item.name}</strong>
            </div>
            <div className="pe-chart-tooltip-body">
                <div className="pe-chart-tooltip-row">
                    <span>Count:</span>
                    <strong>{item.value} {item.value === 1 ? 'employee' : 'employees'}</strong>
                </div>
                <div className="pe-chart-tooltip-row">
                    <span>Proportion:</span>
                    <strong>{item.percentage}%</strong>
                </div>
            </div>
        </div>
    );
};

export const RatingDistributionChart: React.FC<RatingDistributionChartProps> = ({
    review,
    className = ''
}) => {
    // Spec: team scope only, else placeholder
    const isTeamOrDeptScope = review.scope === 'Team' || review.scope === 'Department';

    // Compute distribution counts
    const chartData: RatingSliceItem[] = useMemo(() => {
        if (!isTeamOrDeptScope) return [];

        const counts: Record<string, number> = {};

        // Prefer review.ratingDistribution if provided with values
        if (review.ratingDistribution && Object.keys(review.ratingDistribution).length > 0) {
            Object.entries(review.ratingDistribution).forEach(([label, count]) => {
                if (count > 0) {
                    counts[label] = count;
                }
            });
        }

        // If empty or missing, derive directly from review.employees
        if (Object.keys(counts).length === 0 && review.employees?.length) {
            review.employees.forEach(emp => {
                const label = emp.ratingLabel || 'Unassigned';
                counts[label] = (counts[label] || 0) + 1;
            });
        }

        const total = Object.values(counts).reduce((acc, c) => acc + c, 0);
        if (total === 0) return [];

        return Object.entries(counts).map(([label, count], idx) => {
            const color = RATING_PALETTE[label] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
            return {
                name: label,
                value: count,
                percentage: ((count / total) * 100).toFixed(1),
                color
            };
        });
    }, [isTeamOrDeptScope, review.ratingDistribution, review.employees]);

    return (
        <div className={`pe-chart-card ${className}`} data-testid="rating-distribution-chart-card">
            <div className="pe-chart-header">
                <div>
                    <h3 className="pe-chart-title">
                        <PieIcon size={18} />
                        <span>Rating Distribution</span>
                    </h3>
                    <p className="pe-chart-subtitle">
                        Team evaluation outcomes across rating bands.
                    </p>
                </div>
            </div>

            {/* If Individual scope or not Team/Department: render placeholder */}
            {!isTeamOrDeptScope ? (
                <div className="pe-chart-placeholder" data-testid="rating-dist-placeholder">
                    <Info size={28} className="pe-placeholder-icon" />
                    <h4>Team Scope Required</h4>
                    <p>
                        Rating distribution is only available for Team or Department review scopes with multiple evaluated employees.
                    </p>
                    <span className="pe-placeholder-badge">Current Scope: {review.scope}</span>
                </div>
            ) : chartData.length === 0 ? (
                <div className="pe-chart-empty" data-testid="rating-dist-empty">
                    <p>No employee ratings calculated for this review cycle yet.</p>
                </div>
            ) : (
                <div className="pe-chart-body" data-testid="rating-dist-body">
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="45%"
                                innerRadius={55}
                                outerRadius={95}
                                paddingAngle={3}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomPieTooltip />} />
                            <Legend
                                verticalAlign="bottom"
                                height={42}
                                iconType="circle"
                                wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

