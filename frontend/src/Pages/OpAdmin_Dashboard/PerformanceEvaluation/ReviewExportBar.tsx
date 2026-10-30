import React, { useState, useMemo } from 'react';
import {
    Download,
    Loader2,
    Calendar,
    Filter,
    RotateCcw,
    FileSpreadsheet
} from 'lucide-react';
import { ReviewResultDTO } from './types';
import { exportReviewCsv } from '../../../services/performanceEvaluationService';
import { useToast } from '../../../components/Toast/Toast';

export interface ReviewExportBarProps {
    review: ReviewResultDTO;
    startDate?: string;
    endDate?: string;
    onStartDateChange?: (date: string) => void;
    onEndDateChange?: (date: string) => void;
    scopeFilter?: string;
    onScopeFilterChange?: (scope: string) => void;
    onResetFilters?: () => void;
    disabled?: boolean;
    className?: string;
}

export const ReviewExportBar: React.FC<ReviewExportBarProps> = ({
    review,
    startDate = '',
    endDate = '',
    onStartDateChange,
    onEndDateChange,
    scopeFilter = 'ALL',
    onScopeFilterChange,
    onResetFilters,
    disabled = false,
    className = ''
}) => {
    let toastMethods = { success: (_m: string) => {}, error: (_m: string) => {} };
    try {
        const t = useToast();
        if (t) {
            toastMethods = { success: t.success, error: t.error };
        }
    } catch {
        // Fallback if rendered outside ToastProvider
    }
    const { success, error } = toastMethods;

    const [isExporting, setIsExporting] = useState<boolean>(false);

    // Extract unique roles or department options from loaded employees
    const scopeOptions = useMemo(() => {
        if (!review?.employees?.length) return [];
        const roles = new Set<string>();
        review.employees.forEach(emp => {
            if (emp.role) roles.add(emp.role);
            if (emp.jobPositionTitle) roles.add(emp.jobPositionTitle);
        });
        return Array.from(roles);
    }, [review?.employees]);

    const handleExportCsv = async () => {
        if (!review?.reviewId || isExporting) return;
        setIsExporting(true);
        try {
            await exportReviewCsv(review.reviewId);
            success('Performance review CSV exported successfully.');
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Failed to export performance review CSV.';
            error(msg);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className={`pe-export-bar ${className}`} data-testid="review-export-bar">
            {/* Filter controls row */}
            <div className="pe-export-bar-filters">
                {/* Date range filter */}
                <div className="pe-filter-group">
                    <label className="pe-filter-label" htmlFor="chart-start-date">
                        <Calendar size={13} />
                        <span>Start Date</span>
                    </label>
                    <input
                        id="chart-start-date"
                        type="date"
                        className="pe-form-input pe-input-sm"
                        value={startDate}
                        onChange={e => onStartDateChange?.(e.target.value)}
                        data-testid="chart-start-date"
                    />
                </div>

                <div className="pe-filter-group">
                    <label className="pe-filter-label" htmlFor="chart-end-date">
                        <Calendar size={13} />
                        <span>End Date</span>
                    </label>
                    <input
                        id="chart-end-date"
                        type="date"
                        className="pe-form-input pe-input-sm"
                        value={endDate}
                        onChange={e => onEndDateChange?.(e.target.value)}
                        data-testid="chart-end-date"
                    />
                </div>

                {/* Scope / Role filter when multiple employees exist */}
                {scopeOptions.length > 0 && onScopeFilterChange && (
                    <div className="pe-filter-group">
                        <label className="pe-filter-label" htmlFor="chart-scope-filter">
                            <Filter size={13} />
                            <span>Role / Scope</span>
                        </label>
                        <select
                            id="chart-scope-filter"
                            className="pe-form-select pe-input-sm"
                            value={scopeFilter}
                            onChange={e => onScopeFilterChange(e.target.value)}
                            data-testid="chart-scope-filter"
                        >
                            <option value="ALL">All ({review.employees.length} Members)</option>
                            {scopeOptions.map(opt => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Reset button */}
                {onResetFilters && (
                    <button
                        type="button"
                        className="pe-btn pe-btn-secondary pe-btn-sm pe-reset-filters-btn"
                        onClick={onResetFilters}
                        title="Reset Date and Scope Filters"
                        data-testid="chart-reset-filters"
                    >
                        <RotateCcw size={13} />
                        <span>Reset</span>
                    </button>
                )}
            </div>

            {/* Export actions */}
            <div className="pe-export-bar-actions">
                <button
                    type="button"
                    className="pe-btn pe-btn-primary pe-btn-sm pe-export-csv-btn"
                    onClick={handleExportCsv}
                    disabled={disabled || isExporting || !review?.reviewId}
                    data-testid="export-csv-btn"
                >
                    {isExporting ? (
                        <>
                            <Loader2 className="pe-spinner" size={14} />
                            <span>Exporting CSV...</span>
                        </>
                    ) : (
                        <>
                            <FileSpreadsheet size={14} />
                            <span>Export CSV</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

