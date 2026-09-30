import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Package, MoreVertical, Download, Bookmark, X, LayoutList, LayoutGrid, Table, Filter } from 'lucide-react';
import ReactDOM from 'react-dom';
import './DataTable.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DataTableColumn<T> {
    header: string;
    accessor: keyof T | ((row: T) => React.ReactNode);
    className?: string;
    sortable?: boolean;
    width?: string;
}

export interface DataTableTab {
    key: string;
    label: string;
    icon?: React.ReactNode;
    badge?: number | string;
}

export interface DataTableAction {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
}

export interface DropdownAction {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'danger' | 'success' | 'default';
}

export type DensityMode = 'compact' | 'regular' | 'relaxed';

export interface FilterPreset {
    id: string;
    name: string;
    search: string;
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DataTableProps<T> {
    columns?: DataTableColumn<T>[];
    data?: T[];
    onRowClick?: (row: T) => void;
    className?: string;

    // Legacy mode (like old TableCard)
    headers?: string[];
    children?: React.ReactNode;

    // Tabs
    tabs?: DataTableTab[];
    activeTab?: string;
    onTabChange?: (key: string) => void;

    // Header / Title
    title?: string;
    headerAction?: { label: string; onClick: () => void };
    headerRight?: React.ReactNode;

    // Search
    searchQuery?: string;
    onSearchChange?: (value: string) => void;
    setSearchQuery?: (value: string) => void;
    searchPlaceholder?: string;

    // Filters (rendered between search and action button)
    filterElements?: React.ReactNode;

    // Action button (top right)
    actionButton?: DataTableAction;

    // States
    loading?: boolean;
    emptyMessage?: string;
    emptyIcon?: React.ReactNode;

    // Pagination
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;

    // Results info
    totalRecords?: number;
    totalResults?: number;

    // ── New features ──
    densityToggle?: boolean;
    defaultDensity?: DensityMode;
    exportable?: boolean;
    onExport?: () => void;
    presets?: FilterPreset[];
    onSavePreset?: (name: string) => void;
    onApplyPreset?: (preset: FilterPreset) => void;
    onDeletePreset?: (id: string) => void;
    pageSize?: number;
    pageSizeOptions?: number[];
    onPageSizeChange?: (size: number) => void;
    onSortChange?: (key: string | null, dir: 'asc' | 'desc' | null) => void;
    sortable?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getPageNumbers(total: number, current: number): (number | '...')[] {
    const pages: (number | '...')[] = [];
    if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i);
    } else {
        pages.push(1);
        if (current > 3) pages.push('...');
        const start = Math.max(2, current - 1);
        const end = Math.min(total - 1, current + 1);
        for (let i = start; i <= end; i++) pages.push(i);
        if (current < total - 2) pages.push('...');
        pages.push(total);
    }
    return pages;
}

function defaultCSVExport<T>(rows: T[], cols: DataTableColumn<T>[]) {
    const header = cols.map(c => `"${c.header}"`).join(',');
    const body = rows.map(row =>
        cols.map(c => {
            const val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
            return `"${String(val ?? '').replace(/"/g, '""')}"`;
        }).join(',')
    );
    const csv = [header, ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Actions Dropdown ────────────────────────────────────────────────────────────

export function ActionsDropdown({ actions }: { actions: DropdownAction[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const inContainer = containerRef.current?.contains(target);
            const inMenu = menuRef.current?.contains(target);
            if (!inContainer && !inMenu) setIsOpen(false);
        };
        const handleScroll = () => setIsOpen(false);
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', handleScroll, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen]);

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOpen) { setIsOpen(false); return; }
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
        }
        setIsOpen(true);
    };

    const menu = isOpen && menuPos ? ReactDOM.createPortal(
        <div ref={menuRef} className="actions-dropdown-menu" style={{ top: menuPos.top, left: menuPos.left }} onClick={e => e.stopPropagation()}>
            {actions.map((act, i) => (
                <button key={i} type="button" className={`actions-dropdown-item ${act.variant ?? ''}`} onClick={() => { setIsOpen(false); act.onClick(); }}>
                    {act.icon}<span>{act.label}</span>
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div className="actions-dropdown-container" ref={containerRef}>
            <button ref={triggerRef} type="button" className={`actions-dropdown-trigger${isOpen ? ' active' : ''}`} onClick={handleOpen} aria-label="Actions">
                <MoreVertical size={16} />
            </button>
            {menu}
        </div>
    );
}

// ─── DataTable Component ─────────────────────────────────────────────────────────

export default function DataTable<T extends Record<string, any>>({
    columns, data, onRowClick, className = '',
    headers, children: rowChildren,
    tabs, activeTab, onTabChange,
    title, headerAction, headerRight,
    searchQuery, onSearchChange, setSearchQuery, searchPlaceholder = 'Search…',
    filterElements,
    actionButton,
    loading = false, emptyMessage = 'No items found', emptyIcon = <Package size={20} />,
    currentPage = 1, totalPages = 1, onPageChange,
    totalRecords, totalResults,

    densityToggle = false,
    defaultDensity = 'regular',
    exportable = false,
    onExport,
    presets,
    onSavePreset,
    onApplyPreset,
    onDeletePreset,
    pageSize,
    pageSizeOptions,
    onPageSizeChange,
    onSortChange,
    sortable = false,
}: DataTableProps<T>) {
    const isLegacyMode = headers !== undefined;
    const colCount = isLegacyMode ? headers!.length : (columns?.length ?? 0);
    const handleSearchChange = onSearchChange ?? setSearchQuery;
    const totalCount = totalRecords ?? totalResults;

    // ── Density state ──
    const storageKey = useMemo(() => `dt:${columns?.map(c => c.header).join('-') ?? ''}`, []);
    const [density, setDensity] = useState<DensityMode>(() => {
        if (!densityToggle) return defaultDensity;
        try {
            const saved = localStorage.getItem(`${storageKey}:density`) as DensityMode | null;
            if (saved && ['compact', 'regular', 'relaxed'].includes(saved)) return saved;
        } catch {}
        return defaultDensity;
    });

    useEffect(() => {
        if (densityToggle) {
            try { localStorage.setItem(`${storageKey}:density`, density); } catch {}
        }
    }, [density, densityToggle, storageKey]);

    // ── Sort state ──
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

    const handleSort = (key: string) => {
        let nextKey: string | null = key;
        let nextDir: 'asc' | 'desc' | null = 'asc';
        if (sortKey !== key) {
            setSortKey(key);
            setSortDir('asc');
        } else if (sortDir === 'asc') {
            setSortDir('desc');
            nextDir = 'desc';
        } else {
            setSortKey(null);
            setSortDir(null);
            nextKey = null;
            nextDir = null;
        }
        onSortChange?.(nextKey, nextDir);
    };

    const sortedData = useMemo(() => {
        if (!data || !sortKey || !sortDir) return data;
        const col = columns?.find(c => {
            if (typeof c.accessor === 'function') return false;
            return String(c.accessor) === sortKey;
        });
        if (!col || typeof col.accessor === 'function') return data;
        const accessor = col.accessor as keyof T;
        return [...data].sort((a, b) => {
            const va = String(a[accessor] ?? '');
            const vb = String(b[accessor] ?? '');
            const cmp = va.localeCompare(vb, undefined, { numeric: true });
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [data, sortKey, sortDir, columns]);

    // ── Export ──
    const handleExport = () => {
        if (onExport) {
            onExport();
        } else if (columns && data) {
            defaultCSVExport(data, columns);
        }
    };

    // ── Presets ──
    const [showPresets, setShowPresets] = useState(false);
    const [presetName, setPresetName] = useState('');
    const presetPanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (presetPanelRef.current && !presetPanelRef.current.contains(e.target as Node)) {
                setShowPresets(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSavePreset = () => {
        const name = presetName.trim();
        if (!name) return;
        onSavePreset?.(name);
        setPresetName('');
        setShowPresets(false);
    };

    // ── Pagination extras ──
    const [pageInputVal, setPageInputVal] = useState('');
    const [pageInputFocused, setPageInputFocused] = useState(false);

    const commitPageInput = () => {
        const n = parseInt(pageInputVal, 10);
        if (!isNaN(n)) {
            const clamped = Math.min(Math.max(1, n), totalPages);
            onPageChange?.(clamped);
        }
        setPageInputVal('');
        setPageInputFocused(false);
    };

    // ── Horizontal scroll shadow ──
    const tableWrapRef = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(false);
    const [scrollEnd, setScrollEnd] = useState(false);

    const handleTableScroll = useCallback(() => {
        const el = tableWrapRef.current;
        if (!el) return;
        setScrolled(el.scrollLeft > 4);
        setScrollEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    }, []);

    // ── Derive records info ──
    const totalRecordsCount = totalCount ?? 0;
    const fromRow = totalRecordsCount === 0 ? 0 : (currentPage - 1) * (pageSize ?? pageSizeOptions?.[0] ?? 10) + 1;
    const toRow = Math.min(currentPage * (pageSize ?? pageSizeOptions?.[0] ?? 10), totalRecordsCount);

    // ── Render ──

    const renderSearchBar = () => {
        if (!handleSearchChange) return null;
        return (
            <div className="table-card-search-input-wrap">
                <Search size={14} className="table-card-search-icon" />
                <input type="text" placeholder={searchPlaceholder} value={searchQuery ?? ''} onChange={e => handleSearchChange!(e.target.value)} className="table-card-search-input" />
            </div>
        );
    };

    const renderPagination = () => {
        if (loading || !onPageChange) return null;
        return (
            <nav className="dt-pagination" aria-label="Table pagination">
                <span className="dt-page-info">
                    {totalRecordsCount === 0
                        ? "No records"
                        : `Showing ${fromRow}–${toRow} of ${totalRecordsCount.toLocaleString()} records`}
                </span>

                <div className="dt-pagination-controls">
                    {pageSizeOptions && (
                        <>
                            <span className="dt-page-size-label">Rows per page</span>
                            <select
                                className="dt-page-size-select"
                                value={pageSize ?? pageSizeOptions[0]}
                                aria-label="Rows per page"
                                onChange={e => onPageSizeChange?.(Number(e.target.value))}
                            >
                                {pageSizeOptions.map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </>
                    )}

                    <div className="dt-page-btns" role="group" aria-label="Page navigation">
                        <button
                            className="dt-page-btn dt-page-btn--icon"
                            disabled={currentPage === 1}
                            onClick={() => onPageChange(1)}
                            aria-label="First page"
                            title="First page"
                        >
                            <ChevronsLeft size={14} />
                        </button>
                        <button
                            className="dt-page-btn dt-page-btn--icon"
                            disabled={currentPage === 1}
                            onClick={() => onPageChange(currentPage - 1)}
                            aria-label="Previous page"
                            title="Previous page"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="dt-page-btns-inner">
                            {getPageNumbers(totalPages, currentPage).map((p, i) =>
                                p === '...' ? (
                                    <span key={i} className="dt-page-ellipsis" aria-hidden="true">&hellip;</span>
                                ) : (
                                    <button
                                        key={i}
                                        className={`dt-page-btn${currentPage === p ? ' dt-page-btn--active' : ''}`}
                                        onClick={() => onPageChange(p as number)}
                                        aria-label={`Page ${p}`}
                                        aria-current={currentPage === p ? 'page' : undefined}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                        </span>
                        <button
                            className="dt-page-btn dt-page-btn--icon"
                            disabled={currentPage === totalPages}
                            onClick={() => onPageChange(currentPage + 1)}
                            aria-label="Next page"
                            title="Next page"
                        >
                            <ChevronRight size={14} />
                        </button>
                        <button
                            className="dt-page-btn dt-page-btn--icon"
                            disabled={currentPage === totalPages}
                            onClick={() => onPageChange(totalPages)}
                            aria-label="Last page"
                            title="Last page"
                        >
                            <ChevronsRight size={14} />
                        </button>
                    </div>

                    {totalPages > 1 && (
                        <div className="dt-page-jump" aria-label="Jump to page">
                            <label htmlFor="dt-page-jump-input" className="dt-page-size-label">Go to</label>
                            <input
                                id="dt-page-jump-input"
                                type="number"
                                min={1}
                                max={totalPages}
                                className="dt-page-jump-input"
                                placeholder={String(currentPage)}
                                value={pageInputFocused ? pageInputVal : ''}
                                aria-label={`Go to page (1–${totalPages})`}
                                onFocus={() => { setPageInputFocused(true); setPageInputVal(''); }}
                                onChange={e => setPageInputVal(e.target.value)}
                                onBlur={commitPageInput}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') commitPageInput();
                                    if (e.key === 'Escape') { setPageInputVal(''); setPageInputFocused(false); }
                                }}
                            />
                        </div>
                    )}
                </div>

                <div className="dt-pagination-mobile" aria-hidden="true">
                    <button
                        className="dt-page-btn dt-page-btn--icon"
                        disabled={currentPage === 1}
                        onClick={() => onPageChange(currentPage - 1)}
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="dt-page-mobile-label">
                        Page <strong>{currentPage}</strong> of {totalPages}
                    </span>
                    <button
                        className="dt-page-btn dt-page-btn--icon"
                        disabled={currentPage === totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                        aria-label="Next page"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </nav>
        );
    };

    const densityClass = density === 'compact' ? 'dt-root--compact' : density === 'relaxed' ? 'dt-root--relaxed' : '';
    const displayData = sortable ? (sortedData ?? data ?? []) : (data ?? []);
    const hasActiveSearch = !!searchQuery;

    return (
        <div className={`card table-card ${densityClass} ${className}`}>
            {/* ── Tabs ── */}
            {tabs && tabs.length > 0 && (
                <div className="table-card-tabs">
                    {tabs.map(({ key, label, icon, badge }) => (
                        <button key={key} onClick={() => onTabChange?.(key)} className={`table-card-tab-btn${activeTab === key ? ' active' : ''}`}>
                            {icon}<span>{label}</span>
                            {badge !== undefined && typeof badge === 'number' && badge > 0 && <span className={`table-card-tab-badge${activeTab === key ? ' active' : ''}`}>{badge}</span>}
                            {badge !== undefined && typeof badge === 'string' && badge !== '0' && badge !== '' && <span className={`table-card-tab-badge${activeTab === key ? ' active' : ''}`}>{badge}</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Title + Header Action / Header Right ── */}
            {(title || headerAction || headerRight) && (
                <div className="table-card-header">
                    {title ? <h3 className="table-card-title">{title}</h3> : <div />}
                    {headerRight ? (
                        <div className="table-card-header-right">
                            {headerRight}
                        </div>
                    ) : headerAction ? (
                        <button className="table-card-header-action" onClick={headerAction.onClick}>{headerAction.label}</button>
                    ) : null}
                </div>
            )}

            {/* ── Toolbar ── */}
            <div style={{ padding: '16px 20px 0' }}>
                <div className="dt-toolbar">
                    <div className="dt-toolbar-left">
                        <div className="dt-search-wrap" style={{ width: 'auto', minWidth: 200, maxWidth: 360 }}>
                            {renderSearchBar()}
                        </div>
                        {filterElements}

                        {/* Presets */}
                        {presets && onSavePreset && (
                            <div className="dt-preset-wrap" ref={presetPanelRef}>
                                <button
                                    className="dt-toolbar-btn"
                                    title="Saved filter presets"
                                    onClick={() => setShowPresets(p => !p)}
                                    aria-haspopup="true"
                                    aria-expanded={showPresets}
                                >
                                    <Bookmark size={16} />
                                    {presets.length > 0 && <span className="dt-preset-count">{presets.length}</span>}
                                </button>
                                {showPresets && (
                                    <div className="dt-preset-panel" role="dialog" aria-label="Filter presets">
                                        <p className="dt-preset-panel-title"><Bookmark size={14} /> Saved Presets</p>
                                        <div className="dt-preset-save-row">
                                            <input
                                                type="text"
                                                className="dt-preset-name-input"
                                                placeholder="Name this preset…"
                                                value={presetName}
                                                onChange={e => setPresetName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                                                maxLength={40}
                                            />
                                            <button className="btn btn-primary btn-sm dt-preset-save-btn" onClick={handleSavePreset} disabled={!presetName.trim()}>Save</button>
                                        </div>
                                        {presets.length === 0 ? (
                                            <p className="dt-preset-empty">No saved presets yet.</p>
                                        ) : (
                                            <ul className="dt-preset-list">
                                                {presets.map(preset => (
                                                    <li key={preset.id} className="dt-preset-item">
                                                        <button className="dt-preset-apply" onClick={() => { onApplyPreset?.(preset); setShowPresets(false); }}>
                                                            <Filter size={13} />
                                                            <span className="dt-preset-item-name">{preset.name}</span>
                                                            {preset.search && <span className="dt-preset-item-meta">+search</span>}
                                                        </button>
                                                        <button className="dt-preset-delete" onClick={() => onDeletePreset?.(preset.id)} title={`Delete preset ${preset.name}`}>
                                                            <X size={13} />
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="dt-toolbar-right">
                        {/* Density toggle */}
                        {densityToggle && (
                            <div className="dt-density-group" role="group" aria-label="Row density">
                                {(['compact', 'regular', 'relaxed'] as DensityMode[]).map(d => (
                                    <button
                                        key={d}
                                        className={`dt-density-btn${density === d ? ' dt-density-btn--active' : ''}`}
                                        onClick={() => setDensity(d)}
                                        title={d.charAt(0).toUpperCase() + d.slice(1)}
                                        aria-pressed={density === d}
                                    >
                                        {d === 'compact' && <LayoutList size={15} />}
                                        {d === 'regular' && <LayoutGrid size={15} />}
                                        {d === 'relaxed' && <Table size={15} />}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Export */}
                        {exportable && (
                            <button className="dt-toolbar-btn" title="Export to CSV" onClick={handleExport}>
                                <Download size={16} />
                            </button>
                        )}

                        {actionButton && (
                            <button className="btn btn-primary" onClick={actionButton.onClick} style={{ marginLeft: 'auto' }}>
                                {actionButton.icon}<span>{actionButton.label}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Table ── */}
            <div className={`table-card-wrap${scrolled ? ' scrolled' : ''}${scrollEnd ? ' scroll-end' : ''}`} ref={tableWrapRef} onScroll={handleTableScroll}>
                <table className="table-card-data-table">
                    <thead>
                        <tr>
                            {(isLegacyMode ? headers! : columns ?? []).map((col: any) =>
                                <th key={typeof col === 'string' ? col : col.header}
                                    className={`${typeof col !== 'string' && col.sortable ? 'dt-th--sortable' : ''} ${typeof col !== 'string' && sortKey === String(col.accessor) ? 'dt-th--sorted' : ''}`}
                                    style={typeof col !== 'string' && col.width ? { width: col.width } : {}}
                                    onClick={typeof col !== 'string' && col.sortable ? () => handleSort(String(col.accessor)) : undefined}
                                >
                                    <span className="dt-th-inner">
                                        {typeof col === 'string' ? col : col.header}
                                        {typeof col !== 'string' && col.sortable && sortKey === String(col.accessor) && (
                                            <span className="dt-sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                                        )}
                                    </span>
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={colCount}><div className="table-card-empty-state"><Loader2 size={20} className="spin" /><p>Loading…</p></div></td></tr>
                        ) : isLegacyMode ? (
                            (!rowChildren || React.Children.count(rowChildren) === 0) ? (
                                <tr><td colSpan={colCount}><div className="table-card-empty-state">{emptyIcon}<p>{emptyMessage}</p></div></td></tr>
                            ) : rowChildren
                        ) : (
                            displayData.length === 0 ? (
                                <tr><td colSpan={colCount}><div className="table-card-empty-state">{emptyIcon}<p>{emptyMessage}</p></div></td></tr>
                            ) : (
                                displayData.map((row, i) => (
                                    <tr key={i} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
                                        {columns!.map(col => {
                                            const value = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
                                            return <td key={col.header} className={col.className ?? ''}>{value ?? '—'}</td>;
                                        })}
                                    </tr>
                                ))
                            )
                        )}
                    </tbody>
                </table>
            </div>

            {renderPagination()}
        </div>
    );
}
