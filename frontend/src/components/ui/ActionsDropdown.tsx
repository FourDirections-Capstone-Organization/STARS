import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MoreVertical } from 'lucide-react';
import './DataTable.css';

export interface DropdownAction {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'danger' | 'success' | 'default';
    disabled?: boolean;
}

export interface ActionsDropdownProps {
    actions: DropdownAction[];
    className?: string;
    triggerClassName?: string;
    triggerTitle?: string;
    icon?: React.ReactNode;
}

export function ActionsDropdown({
    actions,
    className = '',
    triggerClassName = '',
    triggerTitle = 'Actions',
    icon = <MoreVertical size={16} />
}: ActionsDropdownProps) {
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
            const menuWidth = 168;
            const estHeight = Math.max(80, actions.length * 36 + 14);

            let left = rect.right - menuWidth;
            if (left < 10) left = Math.max(10, rect.left);
            if (left + menuWidth > window.innerWidth - 10) {
                left = window.innerWidth - menuWidth - 10;
            }

            let top = rect.bottom + 4;
            if (top + estHeight > window.innerHeight && rect.top > estHeight) {
                top = Math.max(10, rect.top - 4 - estHeight);
            }
            setMenuPos({ top, left });
        }
        setIsOpen(true);
    };

    const menu = isOpen && menuPos ? ReactDOM.createPortal(
        <div
            ref={menuRef}
            className="actions-dropdown-menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            onClick={e => e.stopPropagation()}
        >
            {actions.map((act, i) => (
                <button
                    key={i}
                    type="button"
                    disabled={act.disabled}
                    className={`actions-dropdown-item ${act.variant ?? ''}${act.disabled ? ' disabled' : ''}`}
                    onClick={() => {
                        if (act.disabled) return;
                        setIsOpen(false);
                        act.onClick();
                    }}
                >
                    {act.icon}
                    <span>{act.label}</span>
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div className={`actions-dropdown-container ${className}`} ref={containerRef}>
            <button
                ref={triggerRef}
                type="button"
                className={`actions-dropdown-trigger${isOpen ? ' active' : ''} ${triggerClassName}`}
                onClick={handleOpen}
                aria-label={triggerTitle}
                title={triggerTitle}
            >
                {icon}
            </button>
            {menu}
        </div>
    );
}

export default ActionsDropdown;
