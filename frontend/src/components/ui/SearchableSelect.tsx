import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import './SearchableSelect.css';

export interface SearchableOption {
    value: string;
    label: string;
    sublabel?: string;
}

export interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SearchableOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    className?: string;
    style?: React.CSSProperties;
    disabled?: boolean;
    maxHeight?: number | string;
    emptyMessage?: string;
    width?: string | number;
    showClear?: boolean;
    allowEmpty?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    searchPlaceholder = 'Search...',
    className = '',
    style,
    disabled = false,
    maxHeight = 220,
    emptyMessage = 'No options found',
    width,
    showClear = false,
    allowEmpty = true,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Selected option label
    const selectedOption = useMemo(() => {
        return options.find(opt => opt.value === value);
    }, [options, value]);

    // Close on outside click
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleOutsideClick);
        }
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        }
    }, [isOpen]);

    // Filtered options based on search query
    const filteredOptions = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return options;
        return options.filter(opt =>
            opt.label.toLowerCase().includes(query) ||
            (opt.sublabel && opt.sublabel.toLowerCase().includes(query))
        );
    }, [options, searchTerm]);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearchTerm('');
    };

    return (
        <div
            ref={containerRef}
            className={`searchable-select-container ${isOpen ? 'open' : ''} ${className}`}
            style={{ width: width ?? (style?.width || 'auto'), ...style }}
        >
            <button
                type="button"
                className="searchable-select-trigger"
                onClick={() => !disabled && setIsOpen(prev => !prev)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className={`searchable-select-label ${!selectedOption && !value ? 'searchable-select-placeholder' : ''}`}>
                    {selectedOption ? (
                        <>
                            {selectedOption.label}
                            {selectedOption.sublabel && (
                                <span className="searchable-select-option-sublabel">({selectedOption.sublabel})</span>
                            )}
                        </>
                    ) : (
                        placeholder
                    )}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {showClear && value && !disabled && (
                        <span
                            onClick={handleClear}
                            title="Clear"
                            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-secondary, #94a3b8)' }}
                        >
                            <X size={13} />
                        </span>
                    )}
                    <span className={`searchable-select-arrow ${isOpen ? 'rotated' : ''}`}>
                        <ChevronDown size={14} />
                    </span>
                </div>
            </button>

            {isOpen && (
                <div className="searchable-select-dropdown">
                    <div className="searchable-select-search-box">
                        <Search size={13} className="searchable-select-search-icon" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            className="searchable-select-search-input"
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onClick={e => e.stopPropagation()}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                className="searchable-select-clear-btn"
                                onClick={() => setSearchTerm('')}
                                title="Clear search"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <div
                        className="searchable-select-options-list"
                        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
                        role="listbox"
                    >
                        {/* Placeholder option (e.g. All Employees / Unassigned) if allowEmpty and provided */}
                        {allowEmpty && placeholder && (!searchTerm || placeholder.toLowerCase().includes(searchTerm.toLowerCase())) && (
                            <div
                                className={`searchable-select-option ${value === '' ? 'selected' : ''}`}
                                onClick={() => handleSelect('')}
                                role="option"
                                aria-selected={value === ''}
                            >
                                <span className="searchable-select-option-text" style={{ fontStyle: 'italic', color: 'var(--text-secondary, #64748B)' }}>
                                    {placeholder}
                                </span>
                                {value === '' && <Check size={14} className="searchable-select-check-icon" />}
                            </div>
                        )}

                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => {
                                const isSelected = opt.value === value;
                                return (
                                    <div
                                        key={opt.value}
                                        className={`searchable-select-option ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleSelect(opt.value)}
                                        role="option"
                                        aria-selected={isSelected}
                                    >
                                        <span className="searchable-select-option-text">
                                            {opt.label}
                                            {opt.sublabel && (
                                                <span className="searchable-select-option-sublabel">({opt.sublabel})</span>
                                            )}
                                        </span>
                                        {isSelected && <Check size={14} className="searchable-select-check-icon" />}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="searchable-select-empty">{emptyMessage}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
