import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import './DateRangePicker.css';

export interface DateRangePickerProps {
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    onChange: (startDate: string, endDate: string) => void;
    onClear?: () => void;
    placeholder?: string;
    ariaLabel?: string;
    style?: React.CSSProperties;
    className?: string;
}

function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDateString(dateStr: string): Date | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return new Date(year, month, day);
}

function formatDateDisplay(dateStr?: string): string {
    if (!dateStr) return '';
    const d = parseLocalDateString(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    startDate = '',
    endDate = '',
    onChange,
    onClear,
    placeholder = 'Filter by date…',
    ariaLabel = 'Date range filter',
    style,
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Draft selection state inside popover
    const [tempStart, setTempStart] = useState<string>(startDate);
    const [tempEnd, setTempEnd] = useState<string>(endDate);
    const [hoverDate, setHoverDate] = useState<string | null>(null);

    // Current view month in calendar
    const initialViewDate = useMemo(() => {
        if (startDate) {
            const parsed = parseLocalDateString(startDate);
            if (parsed) return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
        }
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }, [startDate]);

    const [viewMonth, setViewMonth] = useState<Date>(initialViewDate);

    // Sync draft states when props change
    useEffect(() => {
        setTempStart(startDate);
        setTempEnd(endDate);
    }, [startDate, endDate]);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setHoverDate(null);
                setTempStart(startDate);
                setTempEnd(endDate);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, startDate, endDate]);

    const todayStr = useMemo(() => toLocalDateString(new Date()), []);

    // Month navigation
    const handlePrevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    // Quick presets
    const applyPreset = (days: number | 'today' | 'yesterday' | 'thisMonth') => {
        const now = new Date();
        let s = '';
        let e = '';

        if (days === 'today') {
            s = toLocalDateString(now);
            e = s;
        } else if (days === 'yesterday') {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            s = toLocalDateString(y);
            e = s;
        } else if (days === 'thisMonth') {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            s = toLocalDateString(first);
            e = toLocalDateString(now);
        } else if (typeof days === 'number') {
            const past = new Date(now);
            past.setDate(past.getDate() - (days - 1));
            s = toLocalDateString(past);
            e = toLocalDateString(now);
        }

        setTempStart(s);
        setTempEnd(e);
        onChange(s, e);
        setIsOpen(false);
    };

    // Calendar date click handler
    const handleDateClick = (dateStr: string) => {
        if (!tempStart || (tempStart && tempEnd)) {
            // Starting a new selection
            setTempStart(dateStr);
            setTempEnd('');
        } else {
            // Selecting end date
            if (dateStr >= tempStart) {
                setTempEnd(dateStr);
                onChange(tempStart, dateStr);
                setIsOpen(false);
            } else {
                // If clicked date is earlier than start date, automatically make it the new start date
                // to prevent invalid / inverted ranges (e.g. 9/16 to 9/9)
                setTempStart(dateStr);
                setTempEnd('');
            }
        }
    };

    const handleClear = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setTempStart('');
        setTempEnd('');
        setHoverDate(null);
        if (onClear) onClear();
        else onChange('', '');
        setIsOpen(false);
    };

    const handleApply = () => {
        if (tempStart) {
            const finalEnd = tempEnd || tempStart;
            onChange(tempStart, finalEnd);
        }
        setIsOpen(false);
    };

    // Calendar grid cells computation
    const calendarDays = useMemo(() => {
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        const daysInMonth = lastDayOfMonth.getDate();
        const startWeekday = firstDayOfMonth.getDay(); // 0 = Sunday

        const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

        // Previous month filler days
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startWeekday - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, prevMonthLastDay - i);
            days.push({
                dateStr: toLocalDateString(d),
                dayNum: d.getDate(),
                isCurrentMonth: false,
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            days.push({
                dateStr: toLocalDateString(d),
                dayNum: i,
                isCurrentMonth: true,
            });
        }

        // Next month filler days (to make complete rows of 7)
        const totalCells = Math.ceil(days.length / 7) * 7;
        let nextDay = 1;
        while (days.length < totalCells) {
            const d = new Date(year, month + 1, nextDay++);
            days.push({
                dateStr: toLocalDateString(d),
                dayNum: d.getDate(),
                isCurrentMonth: false,
            });
        }

        return days;
    }, [viewMonth]);

    // Label on the trigger button
    const triggerLabel = useMemo(() => {
        if (startDate && endDate) {
            if (startDate === endDate) return formatDateDisplay(startDate);
            return `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}`;
        }
        if (startDate) return `From ${formatDateDisplay(startDate)}`;
        if (endDate) return `Until ${formatDateDisplay(endDate)}`;
        return placeholder;
    }, [startDate, endDate, placeholder]);

    const hasValue = Boolean(startDate || endDate);

    // Month title string (e.g. "September 2026")
    const monthTitle = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className={`drp-container ${className}`} ref={containerRef} style={style}>
            <div
                className={`drp-trigger ${isOpen ? 'drp-trigger--active' : ''} ${hasValue ? 'drp-trigger--has-value' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                role="button"
                tabIndex={0}
                aria-label={ariaLabel}
                aria-expanded={isOpen}
            >
                <span className="drp-icon">
                    <CalendarIcon size={14} />
                </span>
                <span className="drp-label">{triggerLabel}</span>
                {hasValue && (
                    <button
                        type="button"
                        className="drp-clear-btn"
                        onClick={handleClear}
                        title="Clear date range"
                        aria-label="Clear date range"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="drp-popover" role="dialog" aria-modal="true">
                    {/* Quick Presets */}
                    <div className="drp-presets">
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('today')}>Today</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('yesterday')}>Yesterday</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset(7)}>Last 7 Days</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset(30)}>Last 30 Days</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('thisMonth')}>This Month</button>
                    </div>

                    {/* Month Nav Header */}
                    <div className="drp-header">
                        <button type="button" className="drp-nav-btn" onClick={handlePrevMonth} aria-label="Previous month">
                            <ChevronLeft size={16} />
                        </button>
                        <div className="drp-month-title">{monthTitle}</div>
                        <button type="button" className="drp-nav-btn" onClick={handleNextMonth} aria-label="Next month">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Weekday Labels */}
                    <div className="drp-weekdays">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                            <div key={day} className="drp-weekday">{day}</div>
                        ))}
                    </div>

                    {/* Day Grid */}
                    <div className="drp-days-grid" onMouseLeave={() => setHoverDate(null)}>
                        {calendarDays.map(({ dateStr, dayNum, isCurrentMonth }) => {
                            const isToday = dateStr === todayStr;
                            const isSelectedStart = dateStr === tempStart;
                            const isSelectedEnd = dateStr === tempEnd;
                            const isSelectedSingle = (isSelectedStart && !tempEnd) || (isSelectedStart && isSelectedEnd);

                            const effectiveEnd = tempEnd || (tempStart && hoverDate && hoverDate >= tempStart ? hoverDate : '');
                            const inRange = Boolean(
                                tempStart &&
                                effectiveEnd &&
                                dateStr > tempStart &&
                                dateStr < effectiveEnd
                            );

                            const isHoverRange = Boolean(
                                tempStart &&
                                !tempEnd &&
                                hoverDate &&
                                hoverDate >= tempStart &&
                                dateStr > tempStart &&
                                dateStr < hoverDate
                            );

                            let cellClass = 'drp-day-cell';
                            if (!isCurrentMonth) cellClass += ' drp-day--other-month';
                            if (isToday) cellClass += ' drp-day--today';
                            if (isSelectedStart || isSelectedEnd) cellClass += ' drp-day--selected';
                            if (isSelectedStart && (tempEnd || hoverDate)) cellClass += ' drp-day--range-start';
                            if (isSelectedEnd) cellClass += ' drp-day--range-end';
                            if (inRange) cellClass += ' drp-day--in-range';
                            if (isHoverRange) cellClass += ' drp-day--in-range-hover';

                            return (
                                <button
                                    key={dateStr}
                                    type="button"
                                    className={cellClass}
                                    onClick={() => handleDateClick(dateStr)}
                                    onMouseEnter={() => {
                                        if (tempStart && !tempEnd) setHoverDate(dateStr);
                                    }}
                                >
                                    {dayNum}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer Actions */}
                    <div className="drp-footer">
                        <div className="drp-status-text">
                            {tempStart && !tempEnd && 'Click to select end date'}
                            {tempStart && tempEnd && `${formatDateDisplay(tempStart)} – ${formatDateDisplay(tempEnd)}`}
                            {!tempStart && !tempEnd && 'Select start date'}
                        </div>
                        <div className="drp-footer-actions">
                            <button type="button" className="drp-btn drp-btn--cancel" onClick={handleClear}>
                                Clear
                            </button>
                            <button
                                type="button"
                                className="drp-btn drp-btn--apply"
                                onClick={handleApply}
                                disabled={!tempStart}
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
