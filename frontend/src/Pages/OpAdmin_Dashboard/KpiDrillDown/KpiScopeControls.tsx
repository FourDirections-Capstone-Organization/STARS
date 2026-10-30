import React from 'react';
import {
    Calendar,
    Filter,
    Search,
    RotateCcw,
    Layers,
    Users,
    Shield
} from 'lucide-react';
import {
    ScopeFilterState,
    TimeframePreset,
    DepartmentOption,
    TeamOption
} from './types';

interface KpiScopeControlsProps {
    filters: ScopeFilterState;
    searchQuery: string;
    departments?: DepartmentOption[];
    teams?: TeamOption[];
    isLoading: boolean;
    onFilterChange: (newFilters: Partial<ScopeFilterState>) => void;
    onSearchChange: (query: string) => void;
    onRefresh: () => void;
    onDepartmentSelect?: (deptId: string) => void;
    onTeamSelect?: (teamId: string) => void;
}

export const KpiScopeControls: React.FC<KpiScopeControlsProps> = ({
    filters,
    searchQuery,
    departments = [],
    teams = [],
    isLoading,
    onFilterChange,
    onSearchChange,
    onRefresh,
    onDepartmentSelect,
    onTeamSelect
}) => {
    const handleTimeframeChange = (preset: TimeframePreset) => {
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        let start = new Date(today);
        let end = new Date(today);

        switch (preset) {
            case '7d':
                start.setDate(today.getDate() - 7);
                break;
            case '30d':
                start.setDate(today.getDate() - 30);
                break;
            case 'month':
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                break;
            case 'quarter':
                start.setDate(today.getDate() - 90);
                break;
            case 'custom':
                // retain existing dates
                onFilterChange({ timeframe: 'custom' });
                return;
        }

        onFilterChange({
            timeframe: preset,
            startDate: formatDate(start),
            endDate: formatDate(end)
        });
    };

    return (
        <div className="kpi-controls-card">
            <div className="kpi-controls-top-row">
                {/* Timeframe Presets */}
                <div className="kpi-timeframe-presets" role="group" aria-label="Timeframe presets">
                    <span className="kpi-filter-label">
                        <Calendar size={15} />
                        <span>Period:</span>
                    </span>
                    <button
                        type="button"
                        className={`kpi-preset-btn ${filters.timeframe === '7d' ? 'active' : ''}`}
                        onClick={() => handleTimeframeChange('7d')}
                    >
                        Last 7 Days
                    </button>
                    <button
                        type="button"
                        className={`kpi-preset-btn ${filters.timeframe === '30d' ? 'active' : ''}`}
                        onClick={() => handleTimeframeChange('30d')}
                    >
                        Last 30 Days
                    </button>
                    <button
                        type="button"
                        className={`kpi-preset-btn ${filters.timeframe === 'month' ? 'active' : ''}`}
                        onClick={() => handleTimeframeChange('month')}
                    >
                        This Month
                    </button>
                    <button
                        type="button"
                        className={`kpi-preset-btn ${filters.timeframe === 'custom' ? 'active' : ''}`}
                        onClick={() => handleTimeframeChange('custom')}
                    >
                        Custom Range
                    </button>
                </div>

                {/* Date Inputs */}
                <div className="kpi-date-inputs">
                    <div className="kpi-date-field">
                        <label htmlFor="kpi-start-date">From</label>
                        <input
                            id="kpi-start-date"
                            type="date"
                            value={filters.startDate}
                            onChange={(e) =>
                                onFilterChange({
                                    startDate: e.target.value,
                                    timeframe: 'custom'
                                })
                            }
                            aria-label="Start date"
                        />
                    </div>
                    <div className="kpi-date-field">
                        <label htmlFor="kpi-end-date">To</label>
                        <input
                            id="kpi-end-date"
                            type="date"
                            value={filters.endDate}
                            onChange={(e) =>
                                onFilterChange({
                                    endDate: e.target.value,
                                    timeframe: 'custom'
                                })
                            }
                            aria-label="End date"
                        />
                    </div>
                </div>

                {/* Refresh Button */}
                <button
                    type="button"
                    className="kpi-refresh-btn"
                    onClick={onRefresh}
                    disabled={isLoading}
                    title="Refresh evaluations"
                    aria-label="Refresh evaluations"
                >
                    <RotateCcw size={16} className={isLoading ? 'kpi-spin' : ''} />
                    <span>{isLoading ? 'Calculating...' : 'Evaluate'}</span>
                </button>
            </div>

            <div className="kpi-controls-bottom-row">
                {/* Role Filter */}
                <div className="kpi-filter-item">
                    <label htmlFor="kpi-role-filter">
                        <Shield size={14} />
                        <span>Role:</span>
                    </label>
                    <select
                        id="kpi-role-filter"
                        value={filters.role}
                        onChange={(e) => onFilterChange({ role: e.target.value })}
                        aria-label="Filter by role"
                    >
                        <option value="">All Roles</option>
                        <option value="Courier">Courier</option>
                        <option value="Encoder">Encoder</option>
                        <option value="Coordinator">Coordinator</option>
                        <option value="Manager">Manager</option>
                    </select>
                </div>

                {/* Department Dropdown (Scope Jump) */}
                {departments.length > 0 && onDepartmentSelect && (
                    <div className="kpi-filter-item">
                        <label htmlFor="kpi-dept-filter">
                            <Layers size={14} />
                            <span>Department:</span>
                        </label>
                        <select
                            id="kpi-dept-filter"
                            value={filters.departmentId || ''}
                            onChange={(e) => onDepartmentSelect(e.target.value)}
                            aria-label="Filter by department"
                        >
                            <option value="">All Departments (Company)</option>
                            {departments.map((dept) => (
                                <option key={dept.id} value={dept.id}>
                                    {dept.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Team Dropdown (Scope Jump) */}
                {teams.length > 0 && onTeamSelect && (
                    <div className="kpi-filter-item">
                        <label htmlFor="kpi-team-filter">
                            <Users size={14} />
                            <span>Team:</span>
                        </label>
                        <select
                            id="kpi-team-filter"
                            value={filters.teamId || ''}
                            onChange={(e) => onTeamSelect(e.target.value)}
                            aria-label="Filter by team"
                        >
                            <option value="">All Teams</option>
                            {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Search in View */}
                <div className="kpi-search-box">
                    <Search size={15} className="kpi-search-icon" />
                    <input
                        type="text"
                        placeholder="Search departments, teams, or employees..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        aria-label="Search items"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="kpi-clear-search-btn"
                            onClick={() => onSearchChange('')}
                            aria-label="Clear search"
                        >
                            &times;
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
