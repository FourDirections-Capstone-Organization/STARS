import React, { useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    AreaChart, Area
} from 'recharts';
import {
    PieChart as PieIcon,
    BarChart3,
    TrendingUp,
    ArrowLeftRight,
    Inbox,
    Clock,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import {
    TaskStatusBreakdownItem,
    TaskPriorityDistributionItem,
    TaskCompletionTrendItem,
    EmployeeDashboardData
} from '../../../../services/employeeDashboardService';
import './EmployeeCharts.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmployeeChartsProps {
    data?: Pick<
        EmployeeDashboardData,
        'statusBreakdown' | 'priorityDistribution' | 'completionTrend' | 'totalAssignedTasks' | 'totalCreatedTasks'
    > | null;
    statusBreakdown?: TaskStatusBreakdownItem[];
    priorityDistribution?: TaskPriorityDistributionItem[];
    completionTrend?: TaskCompletionTrendItem[];
    totalAssignedTasks?: number;
    totalCreatedTasks?: number;
    className?: string;
}

// ── Color Tokens (Speedex OneUI standard tokens) ──────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    completed: '#00A99D',       // --chart-success (Teal)
    done: '#00A99D',
    'in progress': '#D97706',   // --chart-warning (Amber)
    'in-progress': '#D97706',
    pending: '#4F46E5',         // --status-assign / --new (Indigo)
    assigned: '#4F46E5',
    overdue: '#DC2626',         // --chart-failed (Red)
    'on hold': '#64748B',       // --chart-neutral (Slate)
    'on-hold': '#64748B',
    cancelled: '#94A3B8',
};

const PRIORITY_COLORS: Record<string, string> = {
    urgent: '#FF6D00',          // --urgent / --accent (Orange)
    high: '#DC2626',            // --chart-failed (Red)
    medium: '#D97706',          // --chart-warning (Amber)
    low: '#059669',             // --ok / --chart-success (Green)
};

const ROLE_COLORS = {
    assigned: '#008B8B',        // --primary / --teal
    created: '#293652',         // --secondary / --navy
};

// ── Custom Tooltips ───────────────────────────────────────────────────────────

const StatusPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const { name, value, payload: slicePayload } = item;
    const percentage = slicePayload?.percentage ?? 0;

    return (
        <div className="ec-tooltip" role="tooltip">
            <div className="ec-tooltip-title">{name}</div>
            <div className="ec-tooltip-value">
                <span>{value} task{value !== 1 ? 's' : ''}</span>
                <span className="ec-tooltip-pct">({percentage}%)</span>
            </div>
        </div>
    );
};

const PriorityBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const value = payload[0]?.value ?? 0;

    return (
        <div className="ec-tooltip" role="tooltip">
            <div className="ec-tooltip-title">{label} Priority</div>
            <div className="ec-tooltip-value">
                <span>{value} task{value !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
};

const WorkloadBarTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const category = item?.payload?.name ?? '';
    const value = item?.value ?? 0;

    return (
        <div className="ec-tooltip" role="tooltip">
            <div className="ec-tooltip-title">{category}</div>
            <div className="ec-tooltip-value">
                <span>{value} task{value !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
};

const TrendAreaTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const completed = payload[0]?.value ?? 0;

    return (
        <div className="ec-tooltip" role="tooltip">
            <div className="ec-tooltip-title">{label}</div>
            <div className="ec-tooltip-value">
                <span style={{ color: '#00A99D' }}>Completed: {completed} task{completed !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
};

// ── Custom Legend for Status Donut ────────────────────────────────────────────

const StatusLegend = ({ data }: { data: { name: string; value: number; color: string; percentage: number }[] }) => {
    return (
        <ul className="ec-legend" aria-label="Task Status Legend">
            {data.map((item, index) => (
                <li key={index} className="ec-legend-item">
                    <span className="ec-legend-dot" style={{ backgroundColor: item.color }} />
                    <span className="ec-legend-label">{item.name}</span>
                    <span className="ec-legend-count">({item.value})</span>
                </li>
            ))}
        </ul>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const EmployeeCharts: React.FC<EmployeeChartsProps> = ({
    data,
    statusBreakdown: propStatusBreakdown,
    priorityDistribution: propPriorityDistribution,
    completionTrend: propCompletionTrend,
    totalAssignedTasks: propTotalAssignedTasks,
    totalCreatedTasks: propTotalCreatedTasks,
    className = '',
}) => {
    // 1. Resolve normalized data values
    const statusItems = data?.statusBreakdown ?? propStatusBreakdown ?? [];
    const priorityItems = data?.priorityDistribution ?? propPriorityDistribution ?? [];
    const trendItems = data?.completionTrend ?? propCompletionTrend ?? [];
    const totalAssigned = data?.totalAssignedTasks ?? propTotalAssignedTasks ?? 0;
    const totalCreated = data?.totalCreatedTasks ?? propTotalCreatedTasks ?? 0;

    // 2. Format Status Donut Data
    const statusChartData = useMemo(() => {
        return statusItems
            .filter(item => item.count > 0)
            .map(item => {
                const normStatus = (item.status || '').toLowerCase().trim();
                const color = STATUS_COLORS[normStatus] || '#64748B';
                return {
                    name: item.status,
                    value: item.count,
                    percentage: item.percentage,
                    color,
                };
            });
    }, [statusItems]);

    const totalStatusCount = useMemo(() => {
        return statusChartData.reduce((acc, curr) => acc + curr.value, 0);
    }, [statusChartData]);

    // 3. Format Workload Comparison Data (Created vs Assigned)
    const workloadChartData = useMemo(() => {
        return [
            {
                name: 'Assigned to Them',
                tasks: totalAssigned,
                fill: ROLE_COLORS.assigned,
            },
            {
                name: 'Created by Them',
                tasks: totalCreated,
                fill: ROLE_COLORS.created,
            },
        ];
    }, [totalAssigned, totalCreated]);

    const totalWorkloadCount = totalAssigned + totalCreated;

    // Role balance badge insight
    const workloadInsight = useMemo(() => {
        if (totalWorkloadCount === 0) return null;
        if (totalCreated === 0 && totalAssigned > 0) {
            return { label: 'Task Execution Role', desc: 'Focuses primarily on executing tasks assigned by managers.' };
        }
        if (totalAssigned === 0 && totalCreated > 0) {
            return { label: 'Supervisory Role', desc: 'Focuses on delegating and creating tasks for team members.' };
        }
        if (totalCreated >= totalAssigned * 2) {
            return { label: 'Heavy Delegation Focus', desc: 'Creates significantly more tasks than executed directly.' };
        }
        if (totalAssigned >= totalCreated * 2) {
            return { label: 'Heavy Execution Focus', desc: 'Executes significantly more tasks than created.' };
        }
        return { label: 'Balanced Workflow', desc: 'Active balance of creating and executing responsibilities.' };
    }, [totalAssigned, totalCreated, totalWorkloadCount]);

    // 4. Format Priority Distribution Data
    const priorityChartData = useMemo(() => {
        // Enforce standard order: Urgent, High, Medium, Low
        const order = ['Urgent', 'High', 'Medium', 'Low'];
        const itemMap = new Map<string, number>();

        priorityItems.forEach(item => {
            const key = (item.priority || '').trim();
            itemMap.set(key.toLowerCase(), item.count);
        });

        return order.map(priority => {
            const count = itemMap.get(priority.toLowerCase()) ?? 0;
            const normPriority = priority.toLowerCase();
            const color = PRIORITY_COLORS[normPriority] || '#64748B';
            return {
                name: priority,
                count,
                fill: color,
            };
        });
    }, [priorityItems]);

    const totalPriorityCount = useMemo(() => {
        return priorityChartData.reduce((acc, curr) => acc + curr.count, 0);
    }, [priorityChartData]);

    // 5. Format Completion Trend Data
    const trendChartData = useMemo(() => {
        return trendItems.map(item => ({
            period: item.period,
            completed: item.completedCount,
        }));
    }, [trendItems]);

    const totalCompletedTrend = useMemo(() => {
        return trendChartData.reduce((acc, curr) => acc + curr.completed, 0);
    }, [trendChartData]);

    return (
        <section className={`ec-grid ${className}`.trim()} aria-label="Employee Performance Charts">

            {/* ── 1. Status Breakdown Donut Chart ────────────────────────── */}
            <article className="ec-card" data-testid="ec-status-card">
                <header className="ec-card-header">
                    <div className="ec-card-title-group">
                        <div className="ec-card-icon-wrap" style={{ background: 'rgba(0, 169, 157, 0.1)', color: '#00A99D' }}>
                            <PieIcon size={18} />
                        </div>
                        <div>
                            <h3 className="ec-card-title">Task Status Breakdown</h3>
                            <p className="ec-card-sub">Current distribution of assigned tasks</p>
                        </div>
                    </div>
                    {totalStatusCount > 0 && (
                        <span className="ec-badge ec-badge-teal">
                            {totalStatusCount} Total
                        </span>
                    )}
                </header>

                <div className="ec-chart-wrapper">
                    {totalStatusCount === 0 ? (
                        <div className="ec-empty-state" data-testid="ec-status-empty">
                            <Inbox size={32} className="ec-empty-icon" />
                            <h4 className="ec-empty-title">No task status data recorded</h4>
                            <p className="ec-empty-desc">
                                Status distributions will appear once tasks are assigned to this employee.
                            </p>
                        </div>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={230}>
                                <PieChart margin={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pie
                                        data={statusChartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={58}
                                        outerRadius={84}
                                        paddingAngle={3}
                                        dataKey="value"
                                        isAnimationActive={true}
                                    >
                                        {statusChartData.map((entry, idx) => (
                                            <Cell key={`status-cell-${idx}`} fill={entry.color} stroke="transparent" />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<StatusPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <StatusLegend data={statusChartData} />
                        </>
                    )}
                </div>
            </article>

            {/* ── 2. Created vs. Assigned Workload ────────────────────────── */}
            <article className="ec-card" data-testid="ec-workload-card">
                <header className="ec-card-header">
                    <div className="ec-card-title-group">
                        <div className="ec-card-icon-wrap" style={{ background: 'rgba(41, 54, 82, 0.1)', color: '#293652' }}>
                            <ArrowLeftRight size={18} />
                        </div>
                        <div>
                            <h3 className="ec-card-title">Created vs. Assigned</h3>
                            <p className="ec-card-sub">Task delegation and execution balance</p>
                        </div>
                    </div>
                    {totalWorkloadCount > 0 && (
                        <span className="ec-badge ec-badge-navy">
                            {totalWorkloadCount} Tasks Total
                        </span>
                    )}
                </header>

                <div className="ec-chart-wrapper">
                    {totalWorkloadCount === 0 ? (
                        <div className="ec-empty-state" data-testid="ec-workload-empty">
                            <Inbox size={32} className="ec-empty-icon" />
                            <h4 className="ec-empty-title">No task activity recorded</h4>
                            <p className="ec-empty-desc">
                                Neither assigned nor created tasks have been logged for this personnel yet.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="ec-metric-row">
                                <div className="ec-metric-pill ec-metric-assigned">
                                    <span className="ec-metric-label">Assigned to Them</span>
                                    <strong className="ec-metric-val">{totalAssigned}</strong>
                                </div>
                                <div className="ec-metric-pill ec-metric-created">
                                    <span className="ec-metric-label">Created by Them</span>
                                    <strong className="ec-metric-val">{totalCreated}</strong>
                                </div>
                            </div>

                            <ResponsiveContainer width="100%" height={160}>
                                <BarChart data={workloadChartData} margin={{ top: 12, right: 16, left: -20, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #E2E8F0)" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 12, fill: 'var(--text-secondary, #374151)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={{ fontSize: 11, fill: 'var(--text-muted, #9CA3AF)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<WorkloadBarTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.03)' }} />
                                    <Bar dataKey="tasks" radius={[6, 6, 0, 0]} maxBarSize={48}>
                                        {workloadChartData.map((entry, idx) => (
                                            <Cell key={`workload-cell-${idx}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>

                            {workloadInsight && (
                                <div className="ec-insight-banner">
                                    <strong className="ec-insight-label">{workloadInsight.label}:</strong>{' '}
                                    <span className="ec-insight-desc">{workloadInsight.desc}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </article>

            {/* ── 3. Tasks by Priority ───────────────────────────────────── */}
            <article className="ec-card" data-testid="ec-priority-card">
                <header className="ec-card-header">
                    <div className="ec-card-title-group">
                        <div className="ec-card-icon-wrap" style={{ background: 'rgba(255, 109, 0, 0.1)', color: '#FF6D00' }}>
                            <BarChart3 size={18} />
                        </div>
                        <div>
                            <h3 className="ec-card-title">Priority Distribution</h3>
                            <p className="ec-card-sub">Urgent · High · Medium · Low</p>
                        </div>
                    </div>
                    {totalPriorityCount > 0 && (
                        <span className="ec-badge ec-badge-orange">
                            {totalPriorityCount} Categorized
                        </span>
                    )}
                </header>

                <div className="ec-chart-wrapper">
                    {totalPriorityCount === 0 ? (
                        <div className="ec-empty-state" data-testid="ec-priority-empty">
                            <Inbox size={32} className="ec-empty-icon" />
                            <h4 className="ec-empty-title">No priority distribution data available</h4>
                            <p className="ec-empty-desc">
                                Priority breakdown will display once active tasks are assigned.
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={230}>
                            <BarChart data={priorityChartData} margin={{ top: 12, right: 16, left: -20, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #E2E8F0)" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 12, fill: 'var(--text-secondary, #374151)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: 'var(--text-muted, #9CA3AF)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<PriorityBarTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.03)' }} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={42}>
                                    {priorityChartData.map((entry, idx) => (
                                        <Cell key={`prio-cell-${idx}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </article>

            {/* ── 4. Task Completion Trend ───────────────────────────────── */}
            <article className="ec-card" data-testid="ec-trend-card">
                <header className="ec-card-header">
                    <div className="ec-card-title-group">
                        <div className="ec-card-icon-wrap" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
                            <TrendingUp size={18} />
                        </div>
                        <div>
                            <h3 className="ec-card-title">Completion Trend Over Time</h3>
                            <p className="ec-card-sub">Historical completed tasks volume</p>
                        </div>
                    </div>
                    {totalCompletedTrend > 0 && (
                        <span className="ec-badge ec-badge-green">
                            {totalCompletedTrend} Total Completed
                        </span>
                    )}
                </header>

                <div className="ec-chart-wrapper">
                    {totalCompletedTrend === 0 || trendChartData.length === 0 ? (
                        <div className="ec-empty-state" data-testid="ec-trend-empty">
                            <Clock size={32} className="ec-empty-icon" />
                            <h4 className="ec-empty-title">No completion history recorded yet</h4>
                            <p className="ec-empty-desc">
                                Finished tasks will populate this timeline as they are completed.
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={230}>
                            <AreaChart data={trendChartData} margin={{ top: 12, right: 16, left: -20, bottom: 4 }}>
                                <defs>
                                    <linearGradient id="gradEmployeeCompletion" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00A99D" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#00A99D" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #E2E8F0)" vertical={false} />
                                <XAxis
                                    dataKey="period"
                                    tick={{ fontSize: 11, fill: 'var(--text-secondary, #374151)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: 'var(--text-muted, #9CA3AF)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<TrendAreaTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="completed"
                                    name="Completed Tasks"
                                    stroke="#00A99D"
                                    strokeWidth={2.5}
                                    fill="url(#gradEmployeeCompletion)"
                                    dot={{ r: 4, fill: '#00A99D', strokeWidth: 1.5, stroke: '#FFFFFF' }}
                                    activeDot={{ r: 6, fill: '#008B8B', strokeWidth: 2, stroke: '#FFFFFF' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </article>

        </section>
    );
};

export default EmployeeCharts;
