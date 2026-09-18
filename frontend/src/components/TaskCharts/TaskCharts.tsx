import React, { useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    AreaChart, Area,
} from 'recharts';
import './TaskCharts.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChartTask {
    id: string;
    name: string;
    status: string;
    priority: string;
    progress: number;
    deadline: string;
}

interface Props {
    tasks: ChartTask[];
}

// ── Colour tokens (match the design system) ───────────────────────────────────

const COLOR_STATUS: Record<string, string> = {
    assigned:       '#4F46E5',
    pending:        '#4F46E5',
    'in-progress':  '#D97706',
    'pending-review':'#0284C7',
    completed:      '#059669',
    done:           '#059669',
    overdue:        '#DC2626',
    cancelled:      '#94A3B8',
};

const COLOR_PRIORITY: Record<string, string> = {
    high:   '#DC2626',
    medium: '#D97706',
    low:    '#059669',
};

const STATUS_LABEL: Record<string, string> = {
    assigned:       'Assigned',
    pending:        'Pending',
    'in-progress':  'In Progress',
    'pending-review':'Pending Review',
    completed:      'Completed',
    done:           'Done',
    overdue:        'Overdue',
    cancelled:      'Cancelled',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const effectiveStatus = (t: ChartTask): string => {
    const isOverdue =
        t.status !== 'completed' &&
        t.status !== 'done' &&
        t.status !== 'pending-review' &&
        t.status !== 'assigned' &&
        t.status !== 'cancelled' &&
        !!t.deadline &&
        new Date(t.deadline + 'T00:00:00') < new Date();
    return isOverdue ? 'overdue' : t.status;
};

// Build the last-7-days activity data from task deadlines / statuses
const buildWeeklyActivity = (tasks: ChartTask[]) => {
    const days: { label: string; date: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({
            label: d.toLocaleDateString('en-US', { weekday: 'short' }),
            date: d,
        });
    }
    return days.map(({ label, date }) => {
        const dateStr = date.toISOString().split('T')[0];
        const completed = tasks.filter(
            t => (t.status === 'completed' || t.status === 'done') && t.deadline === dateStr
        ).length;
        const active = tasks.filter(
            t => t.status === 'in-progress' && t.deadline >= dateStr
        ).length;
        return { label, completed, active };
    });
};

// ── Custom Tooltip ────────────────────────────────────────────────────────────

const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
        <div className="tc-tooltip">
            <span className="tc-tooltip-name">{name}</span>
            <span className="tc-tooltip-val">{value} task{value !== 1 ? 's' : ''}</span>
        </div>
    );
};

const BarTooltipCustom = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="tc-tooltip">
            <span className="tc-tooltip-name" style={{ textTransform: 'capitalize' }}>{label} Priority</span>
            <span className="tc-tooltip-val">{payload[0].value} task{payload[0].value !== 1 ? 's' : ''}</span>
        </div>
    );
};

const AreaTooltipCustom = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="tc-tooltip">
            <span className="tc-tooltip-name">{label}</span>
            {payload.map((p: any) => (
                <span key={p.name} className="tc-tooltip-val" style={{ color: p.stroke }}>
                    {p.name}: {p.value}
                </span>
            ))}
        </div>
    );
};

// ── Legend renderer ───────────────────────────────────────────────────────────

const renderLegend = (props: any) => {
    const { payload } = props;
    return (
        <ul className="tc-legend">
            {payload.map((entry: any) => (
                <li key={entry.value} className="tc-legend-item">
                    <span className="tc-legend-dot" style={{ background: entry.color }} />
                    <span className="tc-legend-text">{entry.value}</span>
                </li>
            ))}
        </ul>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

const TaskCharts: React.FC<Props> = ({ tasks }) => {
    // 1. Status donut data
    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        tasks.forEach(t => {
            const s = effectiveStatus(t);
            counts[s] = (counts[s] ?? 0) + 1;
        });
        return Object.entries(counts).map(([key, value]) => ({
            name: STATUS_LABEL[key] ?? key,
            value,
            color: COLOR_STATUS[key] ?? '#94a3b8',
        }));
    }, [tasks]);

    // 2. Priority bar data
    const priorityData = useMemo(() => {
        const counts: Record<string, number> = { high: 0, medium: 0, low: 0 };
        tasks.forEach(t => { counts[t.priority] = (counts[t.priority] ?? 0) + 1; });
        return [
            { name: 'High',   value: counts.high,   fill: COLOR_PRIORITY.high },
            { name: 'Medium', value: counts.medium, fill: COLOR_PRIORITY.medium },
            { name: 'Low',    value: counts.low,    fill: COLOR_PRIORITY.low },
        ];
    }, [tasks]);

    // 3. Weekly area data
    const weeklyData = useMemo(() => buildWeeklyActivity(tasks), [tasks]);

    // 4. Progress distribution
    const progressBuckets = useMemo(() => {
        const buckets = [
            { name: '0%',      range: [0, 0],   count: 0 },
            { name: '1–25%',   range: [1, 25],  count: 0 },
            { name: '26–50%',  range: [26, 50], count: 0 },
            { name: '51–75%',  range: [51, 75], count: 0 },
            { name: '76–99%',  range: [76, 99], count: 0 },
            { name: '100%',    range: [100,100],count: 0 },
        ];
        tasks.forEach(t => {
            const p = t.progress;
            const bucket = buckets.find(b => p >= b.range[0] && p <= b.range[1]);
            if (bucket) bucket.count++;
        });
        return buckets.map(b => ({ name: b.name, Tasks: b.count }));
    }, [tasks]);

    if (tasks.length === 0) {
        return (
            <div className="tc-empty">
                <span>No task data available yet — charts will appear once tasks are assigned.</span>
            </div>
        );
    }

    return (
        <div className="tc-grid">

            {/* ── Donut: Status breakdown ── */}
            <div className="tc-card">
                <div className="tc-card-header">
                    <h4 className="tc-card-title">Task Status Breakdown</h4>
                    <span className="tc-card-sub">{tasks.length} total task{tasks.length !== 1 ? 's' : ''}</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                        <Pie
                            data={statusData}
                            cx="50%"
                            cy="45%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                        >
                            {statusData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} stroke="transparent" />
                            ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                        <Legend content={renderLegend} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* ── Bar: Priority distribution ── */}
            <div className="tc-card">
                <div className="tc-card-header">
                    <h4 className="tc-card-title">Tasks by Priority</h4>
                    <span className="tc-card-sub">High · Medium · Low</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={priorityData} barSize={36} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<BarTooltipCustom />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {priorityData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* ── Area: Weekly activity ── */}
            <div className="tc-card tc-card-wide">
                <div className="tc-card-header">
                    <h4 className="tc-card-title">7-Day Activity Overview</h4>
                    <span className="tc-card-sub">Completed vs Active tasks</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={weeklyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#D97706" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<AreaTooltipCustom />} />
                        <Area type="monotone" dataKey="completed" name="Completed" stroke="#059669" strokeWidth={2} fill="url(#gradCompleted)" dot={{ r: 3, fill: '#059669' }} />
                        <Area type="monotone" dataKey="active"    name="Active"    stroke="#D97706" strokeWidth={2} fill="url(#gradActive)"    dot={{ r: 3, fill: '#D97706' }} />
                        <Legend content={renderLegend} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* ── Bar: Progress distribution ── */}
            <div className="tc-card">
                <div className="tc-card-header">
                    <h4 className="tc-card-title">Progress Distribution</h4>
                    <span className="tc-card-sub">How far along your tasks are</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={progressBuckets} barSize={28} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Tasks" radius={[5, 5, 0, 0]} fill="var(--primary)" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

        </div>
    );
};

export default TaskCharts;
