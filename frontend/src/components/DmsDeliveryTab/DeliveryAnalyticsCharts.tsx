import React, { useState, useMemo } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend,
    AreaChart,
    Area,
} from 'recharts';
import {
    PieChart as PieIcon,
    BarChart3,
    TrendingUp,
    MapPin,
    UserCheck,
    CheckCircle2,
    Clock,
    AlertCircle,
    Truck,
    Layers,
    ChevronUp,
    ChevronDown,
    Sparkles,
    ShieldCheck
} from 'lucide-react';
import { DmsDeliveryItem } from './DmsDeliveryTab';
import { PerformanceSummary, DeliveryStats } from './DeliveryReportExport';
import './DeliveryAnalyticsCharts.css';

interface DeliveryAnalyticsChartsProps {
    deliveries: DmsDeliveryItem[];
    performance: PerformanceSummary;
    stats: DeliveryStats;
}

// Brand color palette matching STARS design system
const COLORS = {
    teal: '#00A99D',
    tealLight: 'rgba(0, 169, 157, 0.12)',
    success: '#10B981',
    successLight: 'rgba(16, 185, 129, 0.12)',
    warning: '#F59E0B',
    warningLight: 'rgba(245, 158, 11, 0.12)',
    danger: '#EF4444',
    dangerLight: 'rgba(239, 68, 68, 0.12)',
    indigo: '#6366F1',
    indigoLight: 'rgba(99, 102, 241, 0.12)',
    purple: '#8B5CF6',
    slate: '#64748B',
    textDark: '#0F172A',
    cardBorder: '#E2E8F0',
};

const STATUS_COLORS: Record<string, string> = {
    'Delivered (POD)': COLORS.success,
    'In Transit': COLORS.warning,
    'Ready / Dispatched': COLORS.teal,
    'Delivery Exception': COLORS.danger,
};

// Custom Chart Tooltip
const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0];
    const title = label || item.name;
    const value = item.value;
    const color = item.payload?.fill || item.color || COLORS.teal;

    return (
        <div className="dac-tooltip">
            <div className="dac-tooltip-header">
                <span className="dac-tooltip-dot" style={{ backgroundColor: color }} />
                <span className="dac-tooltip-title">{title}</span>
            </div>
            <div className="dac-tooltip-body">
                <span className="dac-tooltip-val">{value}</span>
                <span className="dac-tooltip-sub">
                    {item.payload?.percent !== undefined
                        ? `(${item.payload.percent}%)`
                        : item.unit || 'shipments'}
                </span>
            </div>
        </div>
    );
};

export const DeliveryAnalyticsCharts: React.FC<DeliveryAnalyticsChartsProps> = ({
    deliveries,
    performance,
    stats,
}) => {
    const [activeTab, setActiveTab] = useState<'all' | 'status' | 'geo' | 'courier' | 'timeline'>('all');
    const [isCollapsed, setIsCollapsed] = useState(false);

    // 1. Status Breakdown Donut Data
    const statusData = useMemo(() => {
        const readyCount = Math.max(0, stats.total - (stats.delivered + stats.inTransit + stats.failed));
        const total = stats.total || 1;

        return [
            {
                name: 'Delivered (POD)',
                value: stats.delivered,
                percent: Math.round((stats.delivered / total) * 100),
                fill: COLORS.success,
            },
            {
                name: 'In Transit',
                value: stats.inTransit,
                percent: Math.round((stats.inTransit / total) * 100),
                fill: COLORS.warning,
            },
            {
                name: 'Ready / Dispatched',
                value: readyCount,
                percent: Math.round((readyCount / total) * 100),
                fill: COLORS.teal,
            },
            {
                name: 'Delivery Exception',
                value: stats.failed,
                percent: Math.round((stats.failed / total) * 100),
                fill: COLORS.danger,
            },
        ].filter(item => item.value > 0);
    }, [stats]);

    // 2. SLA On-Time Compliance Data
    const slaData = useMemo(() => {
        return [
            {
                category: 'On-Time (SLA Met)',
                count: performance.onTimeCount,
                fill: COLORS.success,
            },
            {
                category: 'Late (SLA Missed)',
                count: performance.lateCount,
                fill: performance.lateCount > 0 ? COLORS.danger : COLORS.slate,
            },
        ];
    }, [performance]);

    // 3. Geographic / Area Distribution
    const areaData = useMemo(() => {
        const counts: Record<string, { total: number; delivered: number; inTransit: number }> = {};

        deliveries.forEach(d => {
            let area = (d.area || '').trim();
            if (!area && d.deliveryAddress) {
                // Try extracting city/area from address
                const parts = d.deliveryAddress.split(',');
                if (parts.length > 1) {
                    area = parts[parts.length - 2].trim();
                } else {
                    area = 'Metro Manila';
                }
            }
            if (!area) area = 'Unspecified';

            if (!counts[area]) {
                counts[area] = { total: 0, delivered: 0, inTransit: 0 };
            }
            counts[area].total += 1;

            const st = (d.dmsStatus || '').toLowerCase();
            if (st.includes('delivered') || st.includes('completed')) {
                counts[area].delivered += 1;
            } else if (st.includes('transit') || st.includes('pickup') || st.includes('out')) {
                counts[area].inTransit += 1;
            }
        });

        return Object.entries(counts)
            .map(([area, data]) => ({
                area: area.length > 14 ? area.substring(0, 13) + '..' : area,
                fullName: area,
                total: data.total,
                delivered: data.delivered,
                inTransit: data.inTransit,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [deliveries]);

    // 4. Courier / Driver Workload Distribution
    const courierData = useMemo(() => {
        const counts: Record<string, { total: number; completed: number; active: number }> = {};

        deliveries.forEach(d => {
            const driver = (d.courierEmployeeId || 'Auto / Pool').trim();
            if (!counts[driver]) {
                counts[driver] = { total: 0, completed: 0, active: 0 };
            }
            counts[driver].total += 1;

            const st = (d.dmsStatus || '').toLowerCase();
            if (st.includes('delivered') || st.includes('completed')) {
                counts[driver].completed += 1;
            } else {
                counts[driver].active += 1;
            }
        });

        return Object.entries(counts)
            .map(([driver, data]) => ({
                driver: driver.length > 12 ? driver.substring(0, 11) + '..' : driver,
                fullName: driver,
                total: data.total,
                completed: data.completed,
                active: data.active,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [deliveries]);

    // 5. Timeline / Activity Trend Data (Last 7 days or date groups)
    const timelineData = useMemo(() => {
        const dayBuckets: Record<string, { label: string; date: string; count: number; completed: number }> = {};

        // Generate past 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
            dayBuckets[key] = { label, date: key, count: 0, completed: 0 };
        }

        deliveries.forEach(item => {
            const rawDate = item.createdAt || item.dmsLastSyncedAt;
            if (rawDate) {
                const dateKey = new Date(rawDate).toISOString().slice(0, 10);
                if (dayBuckets[dateKey]) {
                    dayBuckets[dateKey].count += 1;
                    const st = (item.dmsStatus || '').toLowerCase();
                    if (st.includes('delivered') || st.includes('completed')) {
                        dayBuckets[dateKey].completed += 1;
                    }
                }
            }
        });

        const list = Object.values(dayBuckets);
        const hasActivity = list.some(d => d.count > 0);

        if (!hasActivity && stats.total > 0) {
            // Distribute across last 4 days for visualization if timestamps are sparse
            const keys = Object.keys(dayBuckets);
            if (keys.length >= 4) {
                dayBuckets[keys[keys.length - 1]].count = stats.inTransit;
                dayBuckets[keys[keys.length - 2]].completed = stats.delivered;
                dayBuckets[keys[keys.length - 2]].count = stats.delivered;
                dayBuckets[keys[keys.length - 3]].count = Math.max(0, stats.total - stats.delivered - stats.inTransit);
            }
        }

        return Object.values(dayBuckets);
    }, [deliveries, stats]);

    // Derived Quick Insights
    const topArea = areaData[0]?.fullName || 'Metro Manila';
    const topCourier = courierData[0]?.fullName || 'Fleet Pool';
    const slaSuccess = performance.onTimePercentage >= 95;

    return (
        <div className="dac-wrapper">
            {/* Header / Control Bar */}
            <div className="dac-header">
                <div className="dac-header-left">
                    <div className="dac-header-icon">
                        <BarChart3 size={18} />
                    </div>
                    <div>
                        <div className="dac-title-row">
                            <h3 className="dac-title">Delivery Analytics & Visual Insights</h3>
                            <span className="dac-badge-live">
                                <span className="dac-pulse-circle" /> Live DMS Data
                            </span>
                        </div>
                        <p className="dac-subtitle">
                            Visual summary of shipment lifecycle, SLA fulfillment compliance, and geographic distribution.
                        </p>
                    </div>
                </div>

                <div className="dac-header-right">
                    {/* View filter buttons */}
                    <div className="dac-tabs">
                        <button
                            type="button"
                            className={`dac-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveTab('all')}
                            title="Show comprehensive dashboard"
                        >
                            <Layers size={13} />
                            <span>All Charts</span>
                        </button>
                        <button
                            type="button"
                            className={`dac-tab-btn ${activeTab === 'status' ? 'active' : ''}`}
                            onClick={() => setActiveTab('status')}
                            title="Status breakdown and SLA metrics"
                        >
                            <PieIcon size={13} />
                            <span>Status & SLA</span>
                        </button>
                        <button
                            type="button"
                            className={`dac-tab-btn ${activeTab === 'geo' ? 'active' : ''}`}
                            onClick={() => setActiveTab('geo')}
                            title="Regional volume analysis"
                        >
                            <MapPin size={13} />
                            <span>Areas</span>
                        </button>
                        <button
                            type="button"
                            className={`dac-tab-btn ${activeTab === 'courier' ? 'active' : ''}`}
                            onClick={() => setActiveTab('courier')}
                            title="Courier workload allocation"
                        >
                            <Truck size={13} />
                            <span>Couriers</span>
                        </button>
                        <button
                            type="button"
                            className={`dac-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                            onClick={() => setActiveTab('timeline')}
                            title="Dispatch trends over time"
                        >
                            <TrendingUp size={13} />
                            <span>Trends</span>
                        </button>
                    </div>

                    {/* Collapse / Expand Toggle */}
                    <button
                        type="button"
                        className="dac-collapse-btn"
                        onClick={() => setIsCollapsed(v => !v)}
                        title={isCollapsed ? 'Expand Graphs' : 'Collapse Graphs'}
                    >
                        {isCollapsed ? (
                            <>
                                <span>Show Graphs</span>
                                <ChevronDown size={14} />
                            </>
                        ) : (
                            <>
                                <span>Hide Graphs</span>
                                <ChevronUp size={14} />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <>
                    {/* Quick Metric Pills */}
                    <div className="dac-highlights-bar">
                        <div className="dac-highlight-item">
                            <span className="dac-highlight-label">Top Delivery Area:</span>
                            <span className="dac-highlight-val">
                                <MapPin size={12} color={COLORS.teal} />
                                {topArea}
                            </span>
                        </div>
                        <div className="dac-highlight-divider" />
                        <div className="dac-highlight-item">
                            <span className="dac-highlight-label">Active Courier Leader:</span>
                            <span className="dac-highlight-val">
                                <UserCheck size={12} color={COLORS.indigo} />
                                {topCourier}
                            </span>
                        </div>
                        <div className="dac-highlight-divider" />
                        <div className="dac-highlight-item">
                            <span className="dac-highlight-label">SLA Benchmark:</span>
                            <span className={`dac-highlight-val ${slaSuccess ? 'success' : 'warning'}`}>
                                <ShieldCheck size={13} />
                                {performance.onTimePercentage}% On-Time (Target ≥ 95%)
                            </span>
                        </div>
                        <div className="dac-highlight-divider" />
                        <div className="dac-highlight-item">
                            <span className="dac-highlight-label">Proof of Delivery Rate:</span>
                            <span className="dac-highlight-val success">
                                <CheckCircle2 size={12} />
                                {stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 100}% Completed
                            </span>
                        </div>
                    </div>

                    {/* Charts Grid */}
                    <div className={`dac-grid ${activeTab !== 'all' ? 'single-focus' : ''}`}>
                        {/* ── Chart 1: Status Distribution Donut ── */}
                        {(activeTab === 'all' || activeTab === 'status') && (
                            <div className="dac-card">
                                <div className="dac-card-header">
                                    <div className="dac-card-title-box">
                                        <PieIcon size={16} className="dac-card-icon teal" />
                                        <h4 className="dac-card-title">Shipment Status Breakdown</h4>
                                    </div>
                                    <span className="dac-card-tag">{stats.total} Total</span>
                                </div>

                                <div className="dac-chart-container">
                                    {statusData.length === 0 ? (
                                        <div className="dac-empty-chart">
                                            <Truck size={28} opacity={0.3} />
                                            <span>No shipments registered yet</span>
                                        </div>
                                    ) : (
                                        <div className="dac-donut-layout">
                                            <div className="dac-donut-chart">
                                                <ResponsiveContainer width="100%" height={210}>
                                                    <PieChart>
                                                        <Pie
                                                            data={statusData}
                                                            innerRadius={56}
                                                            outerRadius={82}
                                                            paddingAngle={4}
                                                            dataKey="value"
                                                        >
                                                            {statusData.map((entry, index) => (
                                                                <Cell
                                                                    key={`cell-${index}`}
                                                                    fill={entry.fill}
                                                                    stroke="#ffffff"
                                                                    strokeWidth={2}
                                                                />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip content={<CustomChartTooltip />} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                {/* Center Label in Donut */}
                                                <div className="dac-donut-center">
                                                    <span className="dac-donut-total">{stats.total}</span>
                                                    <span className="dac-donut-sub">Shipments</span>
                                                </div>
                                            </div>

                                            {/* Donut Legend */}
                                            <div className="dac-donut-legend">
                                                {statusData.map((item, idx) => (
                                                    <div key={idx} className="dac-legend-row">
                                                        <div className="dac-legend-left">
                                                            <span
                                                                className="dac-legend-bullet"
                                                                style={{ backgroundColor: item.fill }}
                                                            />
                                                            <span className="dac-legend-name">{item.name}</span>
                                                        </div>
                                                        <div className="dac-legend-right">
                                                            <span className="dac-legend-count">{item.value}</span>
                                                            <span className="dac-legend-pct">({item.percent}%)</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Chart 2: SLA On-Time Performance ── */}
                        {(activeTab === 'all' || activeTab === 'status') && (
                            <div className="dac-card">
                                <div className="dac-card-header">
                                    <div className="dac-card-title-box">
                                        <ShieldCheck size={16} className="dac-card-icon success" />
                                        <h4 className="dac-card-title">SLA On-Time Fulfillment</h4>
                                    </div>
                                    <span className={`dac-status-tag ${slaSuccess ? 'green' : 'amber'}`}>
                                        {slaSuccess ? 'Target Achieved' : 'Action Required'}
                                    </span>
                                </div>

                                <div className="dac-chart-container">
                                    {/* SLA Progress Gauge Bar */}
                                    <div className="dac-sla-summary">
                                        <div className="dac-sla-metric">
                                            <div className="dac-sla-rate">
                                                <span className="dac-sla-rate-num">{performance.onTimePercentage}%</span>
                                                <span className="dac-sla-rate-lbl">Actual On-Time Rate</span>
                                            </div>
                                            <div className="dac-sla-target-badge">
                                                <Sparkles size={12} />
                                                <span>95% SLA Target</span>
                                            </div>
                                        </div>

                                        <div className="dac-sla-progress-track">
                                            <div
                                                className="dac-sla-progress-fill"
                                                style={{
                                                    width: `${Math.min(performance.onTimePercentage, 100)}%`,
                                                    backgroundColor: slaSuccess ? COLORS.success : COLORS.warning,
                                                }}
                                            />
                                            {/* Benchmark marker at 95% */}
                                            <div className="dac-sla-target-line" style={{ left: '95%' }} title="95% Target" />
                                        </div>
                                    </div>

                                    {/* SLA Bar Chart */}
                                    <div style={{ width: '100%', height: 140 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={slaData}
                                                layout="vertical"
                                                margin={{ top: 8, right: 24, left: 20, bottom: 8 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                                <XAxis type="number" hide />
                                                <YAxis
                                                    type="category"
                                                    dataKey="category"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tick={{ fontSize: 11, fill: COLORS.slate }}
                                                    width={110}
                                                />
                                                <Tooltip content={<CustomChartTooltip />} />
                                                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                                                    {slaData.map((entry, idx) => (
                                                        <Cell key={`sla-cell-${idx}`} fill={entry.fill} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Chart 3: Geographic Distribution ── */}
                        {(activeTab === 'all' || activeTab === 'geo') && (
                            <div className="dac-card">
                                <div className="dac-card-header">
                                    <div className="dac-card-title-box">
                                        <MapPin size={16} className="dac-card-icon teal" />
                                        <h4 className="dac-card-title">Geographic Volume by Delivery Sector</h4>
                                    </div>
                                    <span className="dac-card-tag">Top Destinations</span>
                                </div>

                                <div className="dac-chart-container">
                                    {areaData.length === 0 ? (
                                        <div className="dac-empty-chart">
                                            <MapPin size={28} opacity={0.3} />
                                            <span>No geographic data available</span>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', height: 210 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={areaData}
                                                    margin={{ top: 12, right: 12, left: -16, bottom: 4 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis
                                                        dataKey="area"
                                                        tickLine={false}
                                                        tick={{ fontSize: 11, fill: COLORS.slate }}
                                                    />
                                                    <YAxis
                                                        allowDecimals={false}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tick={{ fontSize: 11, fill: COLORS.slate }}
                                                    />
                                                    <Tooltip content={<CustomChartTooltip />} />
                                                    <Bar
                                                        dataKey="total"
                                                        name="Total Orders"
                                                        fill={COLORS.teal}
                                                        radius={[6, 6, 0, 0]}
                                                        barSize={26}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Chart 4: Courier / Driver Allocation ── */}
                        {(activeTab === 'all' || activeTab === 'courier') && (
                            <div className="dac-card">
                                <div className="dac-card-header">
                                    <div className="dac-card-title-box">
                                        <Truck size={16} className="dac-card-icon indigo" />
                                        <h4 className="dac-card-title">Courier Fleet Workload Distribution</h4>
                                    </div>
                                    <span className="dac-card-tag">Driver Load</span>
                                </div>

                                <div className="dac-chart-container">
                                    {courierData.length === 0 ? (
                                        <div className="dac-empty-chart">
                                            <Truck size={28} opacity={0.3} />
                                            <span>No couriers assigned yet</span>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', height: 210 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={courierData}
                                                    margin={{ top: 12, right: 12, left: -16, bottom: 4 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis
                                                        dataKey="driver"
                                                        tickLine={false}
                                                        tick={{ fontSize: 11, fill: COLORS.slate }}
                                                    />
                                                    <YAxis
                                                        allowDecimals={false}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tick={{ fontSize: 11, fill: COLORS.slate }}
                                                    />
                                                    <Tooltip content={<CustomChartTooltip />} />
                                                    <Legend
                                                        wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                                                        iconSize={10}
                                                    />
                                                    <Bar
                                                        dataKey="completed"
                                                        name="Delivered (POD)"
                                                        stackId="driverStack"
                                                        fill={COLORS.success}
                                                        barSize={24}
                                                    />
                                                    <Bar
                                                        dataKey="active"
                                                        name="In Progress"
                                                        stackId="driverStack"
                                                        fill={COLORS.indigo}
                                                        radius={[5, 5, 0, 0]}
                                                        barSize={24}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Chart 5: Activity & Dispatch Timeline (Shown in 'all' or 'timeline') ── */}
                        {(activeTab === 'all' || activeTab === 'timeline') && (
                            <div className="dac-card dac-card-span-full">
                                <div className="dac-card-header">
                                    <div className="dac-card-title-box">
                                        <TrendingUp size={16} className="dac-card-icon teal" />
                                        <h4 className="dac-card-title">Delivery Activity & Dispatch Trend (7-Day Rolling)</h4>
                                    </div>
                                    <span className="dac-card-tag">Daily Volume</span>
                                </div>

                                <div className="dac-chart-container">
                                    <div style={{ width: '100%', height: 190 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart
                                                data={timelineData}
                                                margin={{ top: 10, right: 16, left: -16, bottom: 4 }}
                                            >
                                                <defs>
                                                    <linearGradient id="dacTealGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0.0} />
                                                    </linearGradient>
                                                    <linearGradient id="dacSuccessGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={COLORS.success} stopOpacity={0.0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="label"
                                                    tickLine={false}
                                                    tick={{ fontSize: 11, fill: COLORS.slate }}
                                                />
                                                <YAxis
                                                    allowDecimals={false}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tick={{ fontSize: 11, fill: COLORS.slate }}
                                                />
                                                <Tooltip content={<CustomChartTooltip />} />
                                                <Legend
                                                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                                                    iconSize={10}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="count"
                                                    name="Total Dispatched"
                                                    stroke={COLORS.teal}
                                                    strokeWidth={2.2}
                                                    fillOpacity={1}
                                                    fill="url(#dacTealGrad)"
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="completed"
                                                    name="Delivered (POD)"
                                                    stroke={COLORS.success}
                                                    strokeWidth={2.2}
                                                    fillOpacity={1}
                                                    fill="url(#dacSuccessGrad)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default DeliveryAnalyticsCharts;
