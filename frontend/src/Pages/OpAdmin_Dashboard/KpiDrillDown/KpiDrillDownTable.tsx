import React, { useState } from 'react';
import {
    ChevronRight,
    Users,
    Layers,
    User,
    TrendingUp,
    Shield,
    FileText,
    FileSpreadsheet,
    CheckCircle2,
    Clock,
    AlertCircle
} from 'lucide-react';
import {
    KpiHierarchyScopeResultDTO,
    DepartmentKpiSummaryDTO,
    TeamKpiSummaryDTO,
    EmployeeKpiEvaluationResultDTO,
    TrafficLightRating
} from './types';
import { getRatingBadgeClass, getRatingIcon } from './KpiMetricCards';
import { exportScorecard } from '../../../services/kpiService';

interface KpiDrillDownTableProps {
    data: KpiHierarchyScopeResultDTO;
    searchQuery: string;
    onDrillToDepartment: (dept: DepartmentKpiSummaryDTO) => void;
    onDrillToTeam: (team: TeamKpiSummaryDTO) => void;
    onDrillToEmployee: (emp: EmployeeKpiEvaluationResultDTO) => void;
}

export const KpiDrillDownTable: React.FC<KpiDrillDownTableProps> = ({
    data,
    searchQuery,
    onDrillToDepartment,
    onDrillToTeam,
    onDrillToEmployee
}) => {
    const { scopeLevel } = data;
    const query = searchQuery.trim().toLowerCase();
    const [deptTab, setDeptTab] = useState<'teams' | 'employees'>('teams');

    // ──────────────────────────────────────────────
    // 1. Company Level View: Departments Table
    // ──────────────────────────────────────────────
    if (scopeLevel === 'Company') {
        const filteredDepartments = (data.departments || []).filter((dept) =>
            query ? dept.departmentName.toLowerCase().includes(query) : true
        );

        return (
            <div className="kpi-drilldown-card" data-testid="kpi-company-view">
                <div className="kpi-table-header">
                    <div>
                        <h3 className="kpi-table-title">Departments Performance</h3>
                        <p className="kpi-table-subtitle">
                            Click any department to inspect subordinate teams and employee scorecards
                        </p>
                    </div>
                    <span className="kpi-count-pill">
                        {filteredDepartments.length} {filteredDepartments.length === 1 ? 'Department' : 'Departments'}
                    </span>
                </div>

                {filteredDepartments.length === 0 ? (
                    <div className="kpi-empty-message">No departments match your filter.</div>
                ) : (
                    <div className="kpi-table-responsive">
                        <table className="kpi-table">
                            <thead>
                                <tr>
                                    <th>Department Name</th>
                                    <th className="text-center">Teams</th>
                                    <th className="text-center">Employees</th>
                                    <th className="text-center">Tasks (Comp/Total)</th>
                                    <th className="text-center">Score</th>
                                    <th className="text-center">Status</th>
                                    <th className="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDepartments.map((dept) => (
                                    <tr
                                        key={dept.departmentId}
                                        className="kpi-clickable-row"
                                        onClick={() => onDrillToDepartment(dept)}
                                        data-testid={`dept-row-${dept.departmentId}`}
                                    >
                                        <td className="font-semibold">
                                            <div className="kpi-name-cell">
                                                <Layers size={16} className="text-muted" />
                                                <span>{dept.departmentName}</span>
                                            </div>
                                        </td>
                                        <td className="text-center">{dept.totalTeams}</td>
                                        <td className="text-center">{dept.totalEmployees}</td>
                                        <td className="text-center">
                                            {dept.completedTasksCount} / {dept.totalAssignedTasks}
                                        </td>
                                        <td className="text-center font-bold">
                                            {dept.overallScore.toFixed(1)}%
                                        </td>
                                        <td className="text-center">
                                            <span
                                                className={`kpi-rating-badge ${getRatingBadgeClass(dept.overallRating)}`}
                                            >
                                                {getRatingIcon(dept.overallRating)}
                                                <span>{dept.overallRating}</span>
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <button
                                                type="button"
                                                className="kpi-drill-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDrillToDepartment(dept);
                                                }}
                                                aria-label={`Drill down into ${dept.departmentName}`}
                                            >
                                                <span>Drill Down</span>
                                                <ChevronRight size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ──────────────────────────────────────────────
    // 2. Department Level View: Teams & Employees
    // ──────────────────────────────────────────────
    if (scopeLevel === 'Department') {
        const filteredTeams = (data.teams || []).filter((team) =>
            query
                ? team.teamName.toLowerCase().includes(query) ||
                  (team.teamLeaderName && team.teamLeaderName.toLowerCase().includes(query))
                : true
        );

        const filteredEmployees = (data.employees || []).filter((emp) =>
            query
                ? emp.employeeName.toLowerCase().includes(query) ||
                  emp.employeeNumber.toLowerCase().includes(query) ||
                  (emp.role && emp.role.toLowerCase().includes(query))
                : true
        );

        return (
            <div className="kpi-drilldown-card" data-testid="kpi-department-view">
                <div className="kpi-table-tabs">
                    <button
                        type="button"
                        className={`kpi-tab-btn ${deptTab === 'teams' ? 'active' : ''}`}
                        onClick={() => setDeptTab('teams')}
                        data-testid="tab-teams"
                    >
                        <Users size={16} />
                        <span>Teams in Department ({filteredTeams.length})</span>
                    </button>
                    <button
                        type="button"
                        className={`kpi-tab-btn ${deptTab === 'employees' ? 'active' : ''}`}
                        onClick={() => setDeptTab('employees')}
                        data-testid="tab-employees"
                    >
                        <User size={16} />
                        <span>All Employees ({filteredEmployees.length})</span>
                    </button>
                </div>

                {deptTab === 'teams' ? (
                    filteredTeams.length === 0 ? (
                        <div className="kpi-empty-message">No teams found in this department.</div>
                    ) : (
                        <div className="kpi-table-responsive">
                            <table className="kpi-table">
                                <thead>
                                    <tr>
                                        <th>Team Name</th>
                                        <th>Team Leader</th>
                                        <th className="text-center">Members</th>
                                        <th className="text-center">Tasks (Comp/Total)</th>
                                        <th className="text-center">Score</th>
                                        <th className="text-center">Status</th>
                                        <th className="text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTeams.map((team) => (
                                        <tr
                                            key={team.teamId}
                                            className="kpi-clickable-row"
                                            onClick={() => onDrillToTeam(team)}
                                            data-testid={`team-row-${team.teamId}`}
                                        >
                                            <td className="font-semibold">
                                                <div className="kpi-name-cell">
                                                    <Users size={16} className="text-muted" />
                                                    <span>{team.teamName}</span>
                                                </div>
                                            </td>
                                            <td>{team.teamLeaderName || '—'}</td>
                                            <td className="text-center">{team.memberCount}</td>
                                            <td className="text-center">
                                                {team.completedTasksCount} / {team.totalAssignedTasks}
                                            </td>
                                            <td className="text-center font-bold">
                                                {team.overallScore.toFixed(1)}%
                                            </td>
                                            <td className="text-center">
                                                <span
                                                    className={`kpi-rating-badge ${getRatingBadgeClass(team.overallRating)}`}
                                                >
                                                    {getRatingIcon(team.overallRating)}
                                                    <span>{team.overallRating}</span>
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                <button
                                                    type="button"
                                                    className="kpi-drill-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDrillToTeam(team);
                                                    }}
                                                    aria-label={`Drill down into ${team.teamName}`}
                                                >
                                                    <span>Drill Down</span>
                                                    <ChevronRight size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : filteredEmployees.length === 0 ? (
                    <div className="kpi-empty-message">No employees match this filter.</div>
                ) : (
                    <div className="kpi-table-responsive">
                        <table className="kpi-table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Role</th>
                                    <th>Job Title</th>
                                    <th className="text-center">Tasks (Comp/Total)</th>
                                    <th className="text-center">Score</th>
                                    <th className="text-center">Status</th>
                                    <th className="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map((emp) => (
                                    <tr
                                        key={emp.employeeId}
                                        className="kpi-clickable-row"
                                        onClick={() => onDrillToEmployee(emp)}
                                        data-testid={`employee-row-${emp.employeeId}`}
                                    >
                                        <td>
                                            <div className="kpi-emp-cell">
                                                <span className="font-semibold">{emp.employeeName}</span>
                                                <span className="text-muted text-xs">
                                                    #{emp.employeeNumber}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="kpi-role-badge">{emp.role || '—'}</span>
                                        </td>
                                        <td>{emp.jobPositionTitle || '—'}</td>
                                        <td className="text-center">
                                            {emp.completedTasksCount} / {emp.totalAssignedTasks}
                                        </td>
                                        <td className="text-center font-bold">
                                            {emp.overallScore.toFixed(1)}%
                                        </td>
                                        <td className="text-center">
                                            <span
                                                className={`kpi-rating-badge ${getRatingBadgeClass(emp.overallRating)}`}
                                            >
                                                {getRatingIcon(emp.overallRating)}
                                                <span>{emp.overallRating}</span>
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <button
                                                type="button"
                                                className="kpi-drill-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDrillToEmployee(emp);
                                                }}
                                                aria-label={`View scorecard for ${emp.employeeName}`}
                                            >
                                                <span>Scorecard</span>
                                                <ChevronRight size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ──────────────────────────────────────────────
    // 3. Team Level View: Team Members Table
    // ──────────────────────────────────────────────
    if (scopeLevel === 'Team') {
        const filteredEmployees = (data.employees || []).filter((emp) =>
            query
                ? emp.employeeName.toLowerCase().includes(query) ||
                  emp.employeeNumber.toLowerCase().includes(query) ||
                  (emp.role && emp.role.toLowerCase().includes(query))
                : true
        );

        return (
            <div className="kpi-drilldown-card" data-testid="kpi-team-view">
                <div className="kpi-table-header">
                    <div>
                        <h3 className="kpi-table-title">Team Members</h3>
                        <p className="kpi-table-subtitle">
                            Individual performance evaluations for members of {data.scopeName}
                        </p>
                    </div>
                    <span className="kpi-count-pill">
                        {filteredEmployees.length} {filteredEmployees.length === 1 ? 'Member' : 'Members'}
                    </span>
                </div>

                {filteredEmployees.length === 0 ? (
                    <div className="kpi-empty-message">No members found matching your filter.</div>
                ) : (
                    <div className="kpi-table-responsive">
                        <table className="kpi-table">
                            <thead>
                                <tr>
                                    <th>Member Name</th>
                                    <th>Role</th>
                                    <th className="text-center">Tasks (Comp/Total)</th>
                                    <th className="text-center">OTIF</th>
                                    <th className="text-center">Accuracy</th>
                                    <th className="text-center">Score</th>
                                    <th className="text-center">Status</th>
                                    <th className="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map((emp) => {
                                    const otifMetric = emp.metrics?.find((m) => m.metricCode === 'OTIF');
                                    const accMetric = emp.metrics?.find((m) => m.metricCode === 'ORDER_ACCURACY');

                                    return (
                                        <tr
                                            key={emp.employeeId}
                                            className="kpi-clickable-row"
                                            onClick={() => onDrillToEmployee(emp)}
                                            data-testid={`team-member-row-${emp.employeeId}`}
                                        >
                                            <td>
                                                <div className="kpi-emp-cell">
                                                    <span className="font-semibold">{emp.employeeName}</span>
                                                    <span className="text-muted text-xs">
                                                        #{emp.employeeNumber}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="kpi-role-badge">{emp.role || '—'}</span>
                                            </td>
                                            <td className="text-center">
                                                {emp.completedTasksCount} / {emp.totalAssignedTasks}
                                            </td>
                                            <td className="text-center">
                                                {otifMetric ? `${otifMetric.actualValue.toFixed(1)}%` : '—'}
                                            </td>
                                            <td className="text-center">
                                                {accMetric ? `${accMetric.actualValue.toFixed(1)}%` : '—'}
                                            </td>
                                            <td className="text-center font-bold">
                                                {emp.overallScore.toFixed(1)}%
                                            </td>
                                            <td className="text-center">
                                                <span
                                                    className={`kpi-rating-badge ${getRatingBadgeClass(emp.overallRating)}`}
                                                >
                                                    {getRatingIcon(emp.overallRating)}
                                                    <span>{emp.overallRating}</span>
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                <button
                                                    type="button"
                                                    className="kpi-drill-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDrillToEmployee(emp);
                                                    }}
                                                    aria-label={`View scorecard for ${emp.employeeName}`}
                                                >
                                                    <span>Scorecard</span>
                                                    <ChevronRight size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ──────────────────────────────────────────────
    // 4. Employee Level View: Detailed Individual Scorecard
    // ──────────────────────────────────────────────
    const emp = data.employees && data.employees.length > 0 ? data.employees[0] : null;

    return (
        <div className="kpi-drilldown-card" data-testid="kpi-employee-view">
            <div className="kpi-employee-scorecard-header">
                <div>
                    <h3 className="kpi-table-title">Employee Performance Scorecard</h3>
                    <p className="kpi-table-subtitle">
                        Comprehensive metric breakdown and weighted contribution evaluation
                    </p>
                </div>
                {emp && (
                    <div className="kpi-employee-meta-tags">
                        <div className="kpi-emp-export-btns">
                            <button
                                type="button"
                                className="kpi-export-btn kpi-export-pdf-btn"
                                onClick={() => exportScorecard(emp.employeeId, 'pdf', data.periodStart, data.periodEnd)}
                                data-testid="emp-export-pdf-btn"
                                title="Export employee scorecard to PDF"
                            >
                                <FileText size={14} />
                                <span>Export PDF</span>
                            </button>
                            <button
                                type="button"
                                className="kpi-export-btn kpi-export-excel-btn"
                                onClick={() => exportScorecard(emp.employeeId, 'excel', data.periodStart, data.periodEnd)}
                                data-testid="emp-export-excel-btn"
                                title="Export employee scorecard to Excel"
                            >
                                <FileSpreadsheet size={14} />
                                <span>Export Excel</span>
                            </button>
                        </div>
                        <span className="kpi-emp-number-badge">ID: #{emp.employeeNumber}</span>
                        {emp.role && <span className="kpi-role-badge">{emp.role}</span>}
                        {emp.jobPositionTitle && (
                            <span className="kpi-pos-badge">{emp.jobPositionTitle}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Metrics Breakdown Table */}
            <div className="kpi-table-responsive">
                <table className="kpi-table">
                    <thead>
                        <tr>
                            <th>Metric Name</th>
                            <th className="text-center">Weight</th>
                            <th className="text-center">Target</th>
                            <th className="text-center">Actual Value</th>
                            <th className="text-center">Weighted Score</th>
                            <th className="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data.metrics || []).map((metric) => (
                            <tr key={metric.metricCode} data-testid={`emp-metric-row-${metric.metricCode.toLowerCase()}`}>
                                <td className="font-semibold">
                                    <div>
                                        <span>{metric.name}</span>
                                        {metric.isCustomFormula && metric.customFormula && (
                                            <div className="kpi-formula-preview">
                                                <code>Formula: {metric.customFormula}</code>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="text-center">{metric.weight}%</td>
                                <td className="text-center">
                                    {metric.targetValue}
                                    {metric.unit}
                                </td>
                                <td className="text-center font-bold">
                                    {metric.actualValue.toFixed(1)}
                                    {metric.unit}
                                </td>
                                <td className="text-center font-bold">
                                    {metric.weightedScore.toFixed(1)} pts
                                </td>
                                <td className="text-center">
                                    <span
                                        className={`kpi-rating-badge ${getRatingBadgeClass(metric.rating)}`}
                                    >
                                        {getRatingIcon(metric.rating)}
                                        <span>{metric.rating}</span>
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Task Performance Snapshot */}
            <div className="kpi-task-breakdown-panel">
                <h4 className="kpi-panel-title">Task Quality &amp; Volume Metrics</h4>
                <div className="kpi-task-stats-grid">
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">Assigned Tasks</span>
                        <span className="kpi-stat-val">{data.totalAssignedTasks}</span>
                    </div>
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">Completed Tasks</span>
                        <span className="kpi-stat-val text-success">{data.completedTasksCount}</span>
                    </div>
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">On-Time Deliveries</span>
                        <span className="kpi-stat-val">{data.onTimeTasksCount}</span>
                    </div>
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">In-Full Deliveries</span>
                        <span className="kpi-stat-val">{data.inFullTasksCount}</span>
                    </div>
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">OTIF Tasks</span>
                        <span className="kpi-stat-val">{data.otifTasksCount}</span>
                    </div>
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">Pushbacks / Reworks</span>
                        <span className="kpi-stat-val text-warning">{data.reworkTasksCount}</span>
                    </div>
                    <div className="kpi-task-stat-item">
                        <span className="kpi-stat-label">Total Handling Hours</span>
                        <span className="kpi-stat-val">{data.totalHandlingHours.toFixed(1)} hrs</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
