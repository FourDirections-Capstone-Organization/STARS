import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2,
    AlertCircle,
    UserX,
    RotateCcw,
    ArrowLeft,
    RefreshCw,
    ShieldAlert
} from 'lucide-react';
import employeeDashboardService, {
    EmployeeDashboardData,
    EmployeeTaskItem
} from '../../../../services/employeeDashboardService';
import EmployeeHeader from './EmployeeHeader';
import EmployeeCharts from './EmployeeCharts';
import EmployeeTaskLists, { TaskListTab } from './EmployeeTaskLists';
import './EmployeeDashboard.css';

// ── Types & Interfaces ────────────────────────────────────────────────────────

export interface EmployeeDashboardProps {
    /**
     * Unique identifier (GUID or string) of the employee to inspect.
     * If omitted, the component falls back to checking window query parameters (?employeeId=...).
     */
    employeeId?: string;

    /**
     * Optional callback invoked when the user clicks "Back to Org Structure".
     */
    onBack?: () => void;

    /**
     * Optional callback invoked when a task row is clicked in the task lists.
     */
    onTaskClick?: (task: EmployeeTaskItem) => void;

    /**
     * Optional initial task list tab ('assigned' | 'created'). Defaults to 'assigned'.
     */
    initialTab?: TaskListTab;

    /**
     * Optional custom CSS class name for the root container.
     */
    className?: string;
}

// ── Skeleton Loader Subcomponent ──────────────────────────────────────────────

export function EmployeeDashboardSkeleton({ onBack }: { onBack?: () => void }) {
    return (
        <div className="ed-dashboard-container ed-loading-container" data-testid="employee-dashboard-loading">
            {/* Top Navigation Skeleton */}
            <div className="ed-skeleton-nav">
                {onBack && (
                    <button
                        type="button"
                        className="ed-btn ed-btn-ghost ed-back-btn"
                        onClick={onBack}
                        aria-label="Back to Org Structure"
                    >
                        <ArrowLeft size={16} />
                        <span>Back to Org Structure</span>
                    </button>
                )}
                <div className="ed-loading-indicator">
                    <Loader2 size={18} className="ed-spin-icon" />
                    <span>Loading employee profile & metrics...</span>
                </div>
            </div>

            {/* Profile Hero & Supervisor Skeleton */}
            <div className="ed-skeleton-hero-card">
                <div className="ed-skeleton-avatar ed-skeleton" />
                <div className="ed-skeleton-profile-lines">
                    <div className="ed-skeleton ed-skeleton-title" />
                    <div className="ed-skeleton ed-skeleton-subtitle" />
                    <div className="ed-skeleton-badges">
                        <div className="ed-skeleton ed-skeleton-pill" />
                        <div className="ed-skeleton ed-skeleton-pill" />
                        <div className="ed-skeleton ed-skeleton-pill" />
                    </div>
                </div>
                <div className="ed-skeleton-reports-to ed-skeleton" />
            </div>

            {/* KPI Cards Skeleton */}
            <div className="ed-skeleton-kpi-grid">
                <div className="ed-skeleton-kpi-card ed-skeleton" />
                <div className="ed-skeleton-kpi-card ed-skeleton" />
                <div className="ed-skeleton-kpi-card ed-skeleton" />
                <div className="ed-skeleton-kpi-card ed-skeleton" />
            </div>

            {/* Visual Analytics Charts Skeleton */}
            <div className="ed-skeleton-charts-grid">
                <div className="ed-skeleton-chart-card ed-skeleton" />
                <div className="ed-skeleton-chart-card ed-skeleton" />
                <div className="ed-skeleton-chart-card ed-skeleton" />
                <div className="ed-skeleton-chart-card ed-skeleton" />
            </div>

            {/* Task Lists Skeleton */}
            <div className="ed-skeleton-tasks-card ed-skeleton" />
        </div>
    );
}

// ── Main Component Implementation ─────────────────────────────────────────────

export default function EmployeeDashboard({
    employeeId: propEmployeeId,
    onBack,
    onTaskClick,
    initialTab = 'assigned',
    className = ''
}: EmployeeDashboardProps) {
    // ── Resolve Employee ID (prop > URL search param fallback) ────────────────
    const resolvedEmployeeId = useMemo(() => {
        if (propEmployeeId && propEmployeeId.trim()) {
            return propEmployeeId.trim();
        }
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            try {
                const params = new URLSearchParams(window.location.search);
                const queryId = params.get('employeeId');
                if (queryId && queryId.trim()) {
                    return queryId.trim();
                }
            } catch {
                // Ignore URL parsing errors in non-browser environments
            }
        }
        return '';
    }, [propEmployeeId]);

    // ── Internal Component States ─────────────────────────────────────────────
    const [data, setData] = useState<EmployeeDashboardData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isNotFound, setIsNotFound] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<TaskListTab>(initialTab);
    const [refreshIndex, setRefreshIndex] = useState<number>(0);

    // ── Data Fetching Lifecycle ───────────────────────────────────────────────
    const fetchDashboard = useCallback(async (id: string) => {
        if (!id) {
            setIsNotFound(true);
            setError('No employee identifier provided.');
            setIsLoading(false);
            setData(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setIsNotFound(false);

        try {
            const result = await employeeDashboardService.getEmployeeDashboard(id);
            if (!result || !result.employeeId) {
                setIsNotFound(true);
                setError('Employee record not found in the organizational structure.');
                setData(null);
            } else {
                setData(result);
                setIsNotFound(false);
                setError(null);
            }
        } catch (err: any) {
            const status = err?.response?.status;
            const message = err?.response?.data?.message || err?.message || 'Failed to load employee dashboard data.';

            if (status === 404 || /not\s*found/i.test(message)) {
                setIsNotFound(true);
            }
            setError(message);
            setData(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard(resolvedEmployeeId);
    }, [resolvedEmployeeId, refreshIndex, fetchDashboard]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleRefresh = useCallback(() => {
        setRefreshIndex(prev => prev + 1);
    }, []);

    const handleRetry = useCallback(() => {
        fetchDashboard(resolvedEmployeeId);
    }, [fetchDashboard, resolvedEmployeeId]);

    // ── 1. Loading State ───────────────────────────────────────────────────────
    if (isLoading) {
        return <EmployeeDashboardSkeleton onBack={onBack} />;
    }

    // ── 2. Not Found State ────────────────────────────────────────────────────
    if (isNotFound) {
        return (
            <div className={`ed-dashboard-container ${className}`} data-testid="employee-dashboard-not-found">
                <div className="ed-state-card ed-not-found-card">
                    <div className="ed-state-icon-wrapper ed-not-found-icon">
                        <UserX size={44} strokeWidth={1.8} />
                    </div>
                    <h2 className="ed-state-title">Employee Not Found</h2>
                    <p className="ed-state-description">
                        {error || 'The requested employee profile does not exist or has been removed from the organizational directory.'}
                    </p>
                    <div className="ed-state-actions">
                        {onBack && (
                            <button
                                type="button"
                                className="ed-btn ed-btn-primary"
                                onClick={onBack}
                                data-testid="employee-dashboard-not-found-back-btn"
                            >
                                <ArrowLeft size={16} />
                                <span>Return to Org Structure</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="ed-btn ed-btn-secondary"
                            onClick={handleRetry}
                            data-testid="employee-dashboard-not-found-retry-btn"
                        >
                            <RotateCcw size={16} />
                            <span>Retry Search</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 3. Error Banner / State ───────────────────────────────────────────────
    if (error && !data) {
        return (
            <div className={`ed-dashboard-container ${className}`} data-testid="employee-dashboard-error">
                <div className="ed-state-card ed-error-card">
                    <div className="ed-state-icon-wrapper ed-error-icon">
                        <AlertCircle size={44} strokeWidth={1.8} />
                    </div>
                    <h2 className="ed-state-title">Unable to Load Dashboard</h2>
                    <p className="ed-state-description">
                        {error}
                    </p>
                    <div className="ed-state-actions">
                        {onBack && (
                            <button
                                type="button"
                                className="ed-btn ed-btn-secondary"
                                onClick={onBack}
                                data-testid="employee-dashboard-error-back-btn"
                            >
                                <ArrowLeft size={16} />
                                <span>Return to Org Structure</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="ed-btn ed-btn-primary"
                            onClick={handleRetry}
                            data-testid="employee-dashboard-retry-btn"
                        >
                            <RefreshCw size={16} />
                            <span>Retry Request</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 4. Main Loaded Dashboard ───────────────────────────────────────────────
    if (!data) {
        return null;
    }

    return (
        <div
            className={`ed-dashboard-container ${className}`}
            data-testid="employee-dashboard"
        >
            {/* 1. Profile Header, Supervisor Reports To & KPI Summary Cards */}
            <EmployeeHeader
                data={data}
                onBack={onBack}
                onRefresh={handleRefresh}
                isLoading={isLoading}
            />

            {/* 2. Visual Analytics Charts (Status Donut, Created vs Assigned, Priority, Trends) */}
            <section
                className="ed-analytics-section"
                aria-label="Employee Task Analytics"
                data-testid="employee-dashboard-analytics-section"
            >
                <div className="ed-section-header">
                    <h3 className="ed-section-title">Performance & Workload Analytics</h3>
                    <span className="ed-section-subtitle">
                        Aggregated metrics based on all assigned and created task records
                    </span>
                </div>
                <EmployeeCharts data={data} />
            </section>

            {/* 3. Tabbed Task Lists ("Assigned to Them" & "Created by Them") */}
            <section
                className="ed-tasks-section"
                aria-label="Employee Task Registry"
                data-testid="employee-dashboard-tasks-section"
            >
                <EmployeeTaskLists
                    employeeId={data.employeeId}
                    employeeName={data.fullName}
                    employeeRole={data.role}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onTaskClick={onTaskClick}
                    onRefresh={handleRefresh}
                />
            </section>
        </div>
    );
}
