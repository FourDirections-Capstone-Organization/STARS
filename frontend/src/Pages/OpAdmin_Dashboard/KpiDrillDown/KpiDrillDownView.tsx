import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Sliders, FileText, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { exportHierarchyScope } from '../../../services/kpiService';
import api from '../../../api';
import { useToast } from '../../../components/Toast/Toast';
import {
    KpiHierarchyScopeResultDTO,
    BreadcrumbItem,
    ScopeFilterState,
    DepartmentOption,
    TeamOption,
    DepartmentKpiSummaryDTO,
    TeamKpiSummaryDTO,
    EmployeeKpiEvaluationResultDTO
} from './types';
import { KpiBreadcrumbs } from './KpiBreadcrumbs';
import { KpiScopeControls } from './KpiScopeControls';
import { KpiMetricCards } from './KpiMetricCards';
import { KpiDrillDownTable } from './KpiDrillDownTable';
import './KpiDrillDown.css';

export interface KpiDrillDownViewProps {
    departments?: DepartmentOption[];
    initialDepartmentId?: string;
    initialTeamId?: string;
    initialRole?: string;
    onNavigateToConfig?: () => void;
    viewModeControls?: React.ReactNode;
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

export const KpiDrillDownView: React.FC<KpiDrillDownViewProps> = ({
    departments = [],
    initialDepartmentId,
    initialTeamId,
    initialRole = '',
    onNavigateToConfig,
    viewModeControls
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {}, info: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error, info: t.info };
        }
    } catch {
        // Fallback when rendered outside ToastProvider
    }
    const { error } = toastMethods;

    // Filters state
    const defaultDates = useMemo(() => getDefaultDates(), []);
    const [filters, setFilters] = useState<ScopeFilterState>({
        timeframe: '30d',
        startDate: defaultDates.startDate,
        endDate: defaultDates.endDate,
        role: initialRole,
        departmentId: initialDepartmentId,
        teamId: initialTeamId,
        employeeId: undefined
    });

    // Breadcrumbs
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
        { level: 'Company', name: 'All Departments' }
    ]);

    // Search query
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Data, loading, error
    const [data, setData] = useState<KpiHierarchyScopeResultDTO | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [apiError, setApiError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);

    // Fetch scope evaluation
    const fetchScopeData = useCallback(async (currentFilters: ScopeFilterState) => {
        setLoading(true);
        setApiError(null);

        try {
            const params: Record<string, any> = {
                startDate: currentFilters.startDate,
                endDate: currentFilters.endDate
            };

            if (currentFilters.role) {
                params.role = currentFilters.role;
            }
            if (currentFilters.employeeId) {
                params.employeeId = currentFilters.employeeId;
            } else if (currentFilters.teamId) {
                params.teamId = currentFilters.teamId;
            } else if (currentFilters.departmentId) {
                params.departmentId = currentFilters.departmentId;
            }

            const response = await api.get('/api/kpi/scope', params);
            if (response.data?.isSuccess && response.data.data) {
                setData(response.data.data);
            } else if (response.data && !response.data.isSuccess) {
                const msg = response.data.message || 'Failed to calculate KPI evaluation.';
                setApiError(msg);
                error(msg);
            } else if (response.data) {
                setData(response.data);
            }
        } catch (err: any) {
            const msg =
                err.response?.data?.message ||
                err.message ||
                'An unexpected error occurred while loading KPI evaluation.';
            setApiError(msg);
            error(msg);
        } finally {
            setLoading(false);
        }
    }, [error]);

    useEffect(() => {
        fetchScopeData(filters);
    }, [filters, fetchScopeData]);

    // Available teams for the selected department
    const availableTeams: TeamOption[] = useMemo(() => {
        if (!data || !data.teams) return [];
        return data.teams.map((t) => ({
            id: t.teamId,
            name: t.teamName,
            departmentId: t.departmentId
        }));
    }, [data]);

    // Drill down to Department
    const handleDrillToDepartment = (dept: DepartmentKpiSummaryDTO) => {
        const nextFilters: ScopeFilterState = {
            ...filters,
            departmentId: dept.departmentId,
            teamId: undefined,
            employeeId: undefined
        };
        setFilters(nextFilters);
        setBreadcrumbs([
            { level: 'Company', name: 'All Departments' },
            { level: 'Department', id: dept.departmentId, name: dept.departmentName }
        ]);
        setSearchQuery('');
    };

    // Drill down to Team
    const handleDrillToTeam = (team: TeamKpiSummaryDTO) => {
        const nextFilters: ScopeFilterState = {
            ...filters,
            departmentId: team.departmentId || filters.departmentId,
            teamId: team.teamId,
            employeeId: undefined
        };
        setFilters(nextFilters);

        const currentDeptCrumb = breadcrumbs.find((b) => b.level === 'Department');
        const deptCrumb: BreadcrumbItem = currentDeptCrumb || {
            level: 'Department',
            id: team.departmentId,
            name: team.departmentName || 'Department'
        };

        setBreadcrumbs([
            { level: 'Company', name: 'All Departments' },
            deptCrumb,
            { level: 'Team', id: team.teamId, name: team.teamName }
        ]);
        setSearchQuery('');
    };

    // Drill down to Employee
    const handleDrillToEmployee = (emp: EmployeeKpiEvaluationResultDTO) => {
        const nextFilters: ScopeFilterState = {
            ...filters,
            employeeId: emp.employeeId
        };
        setFilters(nextFilters);

        const companyCrumb: BreadcrumbItem = { level: 'Company', name: 'All Departments' };
        const deptCrumb = breadcrumbs.find((b) => b.level === 'Department') || {
            level: 'Department',
            id: emp.departmentId,
            name: emp.departmentName || 'Department'
        };
        const teamCrumb = breadcrumbs.find((b) => b.level === 'Team');

        const newBreadcrumbs: BreadcrumbItem[] = [companyCrumb];
        if (emp.departmentId || deptCrumb.id) newBreadcrumbs.push(deptCrumb);
        if (teamCrumb) newBreadcrumbs.push(teamCrumb);
        newBreadcrumbs.push({
            level: 'Employee',
            id: emp.employeeId,
            name: emp.employeeName
        });

        setBreadcrumbs(newBreadcrumbs);
        setSearchQuery('');
    };

    // Navigate via breadcrumbs
    const handleNavigateBreadcrumb = (crumb: BreadcrumbItem, index: number) => {
        const trimmed = breadcrumbs.slice(0, index + 1);
        setBreadcrumbs(trimmed);
        setSearchQuery('');

        const nextFilters: ScopeFilterState = { ...filters };
        if (crumb.level === 'Company') {
            nextFilters.departmentId = undefined;
            nextFilters.teamId = undefined;
            nextFilters.employeeId = undefined;
        } else if (crumb.level === 'Department') {
            nextFilters.departmentId = crumb.id;
            nextFilters.teamId = undefined;
            nextFilters.employeeId = undefined;
        } else if (crumb.level === 'Team') {
            nextFilters.teamId = crumb.id;
            nextFilters.employeeId = undefined;
        } else if (crumb.level === 'Employee') {
            nextFilters.employeeId = crumb.id;
        }
        setFilters(nextFilters);
    };


    // Scope Export Handler
    const handleExportScope = async (format: 'pdf' | 'excel') => {
        if (!data) return;
        setIsExporting(format);
        try {
            await exportHierarchyScope(
                data.scopeLevel,
                data.scopeId,
                format,
                filters.startDate,
                filters.endDate,
                filters.role
            );
            toastMethods.success(`${format.toUpperCase()} report exported successfully.`);
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || `Failed to export ${format.toUpperCase()} report.`;
            toastMethods.error(msg);
        } finally {
            setIsExporting(null);
        }
    };

    // Up one level (Back button)
    const handleBack = () => {
        if (breadcrumbs.length <= 1) return;
        const targetIndex = breadcrumbs.length - 2;
        handleNavigateBreadcrumb(breadcrumbs[targetIndex], targetIndex);
    };

    // Filter changes
    const handleFilterChange = (newFilters: Partial<ScopeFilterState>) => {
        setFilters((prev) => ({
            ...prev,
            ...newFilters
        }));
    };

    // Direct Department Select (Scope Jump)
    const handleDepartmentSelect = (deptId: string) => {
        setSearchQuery('');
        if (!deptId) {
            setFilters((prev) => ({
                ...prev,
                departmentId: undefined,
                teamId: undefined,
                employeeId: undefined
            }));
            setBreadcrumbs([{ level: 'Company', name: 'All Departments' }]);
        } else {
            const foundDept = departments.find((d) => d.id === deptId);
            const deptName = foundDept ? foundDept.name : 'Department';
            setFilters((prev) => ({
                ...prev,
                departmentId: deptId,
                teamId: undefined,
                employeeId: undefined
            }));
            setBreadcrumbs([
                { level: 'Company', name: 'All Departments' },
                { level: 'Department', id: deptId, name: deptName }
            ]);
        }
    };

    // Direct Team Select (Scope Jump)
    const handleTeamSelect = (teamId: string) => {
        setSearchQuery('');
        if (!teamId) {
            setFilters((prev) => ({
                ...prev,
                teamId: undefined,
                employeeId: undefined
            }));
            setBreadcrumbs((prev) => prev.filter((b) => b.level === 'Company' || b.level === 'Department'));
        } else {
            const foundTeam = availableTeams.find((t) => t.id === teamId);
            const teamName = foundTeam ? foundTeam.name : 'Team';
            setFilters((prev) => ({
                ...prev,
                teamId,
                employeeId: undefined
            }));

            const companyCrumb: BreadcrumbItem = { level: 'Company', name: 'All Departments' };
            const deptCrumb = breadcrumbs.find((b) => b.level === 'Department') || {
                level: 'Department',
                id: filters.departmentId,
                name: 'Department'
            };

            setBreadcrumbs([companyCrumb, deptCrumb, { level: 'Team', id: teamId, name: teamName }]);
        }
    };

    const isDrilledView = breadcrumbs.length > 1;
    const previousCrumb = isDrilledView ? breadcrumbs[breadcrumbs.length - 2] : null;

    return (
        <div className="kpi-drilldown-container" data-testid="kpi-hierarchical-view">
            {/* Header & Configuration Action */}
            {isDrilledView ? (
                <div className="kpi-view-header kpi-view-header-drilled">
                    <div className="kpi-view-title-block">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="kpi-page-back-btn"
                                onClick={handleBack}
                                title={`Back to ${previousCrumb?.name || 'Overview'}`}
                                aria-label={`Back to ${previousCrumb?.name || 'Overview'}`}
                            >
                                <ArrowLeft size={15} />
                                <span>Back to {previousCrumb?.name || 'Overview'}</span>
                            </button>
                            <span className="kpi-scope-type-badge">{data?.scopeLevel || 'Drill-Down'} View</span>
                        </div>
                        <h3 className="kpi-view-title" style={{ fontSize: '1.25rem', marginTop: 4 }}>
                            {data?.scopeName || 'Entity Details'}
                        </h3>
                        <p className="kpi-view-subtitle">
                            Dedicated hierarchical performance scorecard for {data?.scopeName}.
                        </p>
                    </div>
                    <div className="kpi-header-actions-group">
                        {viewModeControls}
                        <button
                            type="button"
                            className="kpi-export-btn kpi-export-pdf-btn"
                            onClick={() => handleExportScope('pdf')}
                            disabled={loading || isExporting !== null || !data}
                            title="Export current scope KPI evaluation to PDF"
                            data-testid="kpi-export-pdf-btn"
                        >
                            {isExporting === 'pdf' ? (
                                <Loader2 size={14} className="kpi-spin" />
                            ) : (
                                <FileText size={14} />
                            )}
                            <span>Export PDF</span>
                        </button>
                        <button
                            type="button"
                            className="kpi-export-btn kpi-export-excel-btn"
                            onClick={() => handleExportScope('excel')}
                            disabled={loading || isExporting !== null || !data}
                            title="Export current scope KPI evaluation to Excel"
                            data-testid="kpi-export-excel-btn"
                        >
                            {isExporting === 'excel' ? (
                                <Loader2 size={14} className="kpi-spin" />
                            ) : (
                                <FileSpreadsheet size={14} />
                            )}
                            <span>Export Excel</span>
                        </button>
                        {onNavigateToConfig && (
                            <button
                                type="button"
                                className="kpi-header-config-btn"
                                onClick={onNavigateToConfig}
                                title="Configure KPI weights and traffic-light thresholds"
                                data-testid="kpi-nav-to-config-btn"
                            >
                                <Sliders size={15} />
                                <span>Configure KPIs</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="kpi-view-header">
                    <div className="kpi-view-title-block">
                        <h3 className="kpi-view-title">
                            Hierarchical KPI &amp; Performance Drill-Down
                        </h3>
                        <p className="kpi-view-subtitle">
                            Evaluate weighted logistics KPIs hierarchically from company-wide to departments, teams, and individual employees.
                        </p>
                    </div>
                    <div className="kpi-header-actions-group">
                        {viewModeControls}
                        <button
                            type="button"
                            className="kpi-export-btn kpi-export-pdf-btn"
                            onClick={() => handleExportScope('pdf')}
                            disabled={loading || isExporting !== null || !data}
                            title="Export current scope KPI evaluation to PDF"
                            data-testid="kpi-export-pdf-btn"
                        >
                            {isExporting === 'pdf' ? (
                                <Loader2 size={14} className="kpi-spin" />
                            ) : (
                                <FileText size={14} />
                            )}
                            <span>Export PDF</span>
                        </button>
                        <button
                            type="button"
                            className="kpi-export-btn kpi-export-excel-btn"
                            onClick={() => handleExportScope('excel')}
                            disabled={loading || isExporting !== null || !data}
                            title="Export current scope KPI evaluation to Excel"
                            data-testid="kpi-export-excel-btn"
                        >
                            {isExporting === 'excel' ? (
                                <Loader2 size={14} className="kpi-spin" />
                            ) : (
                                <FileSpreadsheet size={14} />
                            )}
                            <span>Export Excel</span>
                        </button>
                        {onNavigateToConfig && (
                            <button
                                type="button"
                                className="kpi-header-config-btn"
                                onClick={onNavigateToConfig}
                                title="Configure KPI weights and traffic-light thresholds"
                                data-testid="kpi-nav-to-config-btn"
                            >
                                <Sliders size={15} />
                                <span>Configure KPIs</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
            {/* Breadcrumb Navigation Bar */}
            <KpiBreadcrumbs
                breadcrumbs={breadcrumbs}
                onNavigate={handleNavigateBreadcrumb}
                onBack={handleBack}
            />

            {/* Scope & Timeframe Controls */}
            <KpiScopeControls
                filters={filters}
                searchQuery={searchQuery}
                departments={departments}
                teams={availableTeams}
                isLoading={loading}
                onFilterChange={handleFilterChange}
                onSearchChange={setSearchQuery}
                onRefresh={() => fetchScopeData(filters)}
                onDepartmentSelect={handleDepartmentSelect}
                onTeamSelect={availableTeams.length > 0 ? handleTeamSelect : undefined}
            />

            {/* Error Message */}
            {apiError && (
                <div className="kpi-error-alert" role="alert" data-testid="kpi-error-banner">
                    <AlertCircle size={20} />
                    <div className="kpi-error-content">
                        <strong>Evaluation Error:</strong>
                        <span>{apiError}</span>
                    </div>
                    <button
                        type="button"
                        className="kpi-retry-btn"
                        onClick={() => fetchScopeData(filters)}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Loading Indicator */}
            {loading && (
                <div className="kpi-loading-indicator" data-testid="kpi-loading-state">
                    <Loader2 size={32} className="kpi-spin" />
                    <span>Calculating hierarchical KPI metrics...</span>
                </div>
            )}

            {/* Evaluation Content */}
            {!loading && data && (
                <>
                    {/* Metrics and Score Summary Banner */}
                    <KpiMetricCards data={data} />

                    {/* Hierarchical Drill-Down Tables */}
                    <KpiDrillDownTable
                        data={data}
                        searchQuery={searchQuery}
                        onDrillToDepartment={handleDrillToDepartment}
                        onDrillToTeam={handleDrillToTeam}
                        onDrillToEmployee={handleDrillToEmployee}
                    />
                </>
            )}
        </div>
    );
};
