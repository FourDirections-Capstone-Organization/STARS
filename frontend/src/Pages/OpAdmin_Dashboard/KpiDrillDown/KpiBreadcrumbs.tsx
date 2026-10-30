import React from 'react';
import {
    ChevronRight,
    ArrowLeft,
    Building2,
    Layers,
    Users,
    User
} from 'lucide-react';
import { BreadcrumbItem, ScopeLevel } from './types';

interface KpiBreadcrumbsProps {
    breadcrumbs: BreadcrumbItem[];
    onNavigate: (item: BreadcrumbItem, index: number) => void;
    onBack: () => void;
}

const getScopeIcon = (level: ScopeLevel) => {
    switch (level) {
        case 'Company':
            return <Building2 size={16} className="kpi-breadcrumb-icon" />;
        case 'Department':
            return <Layers size={16} className="kpi-breadcrumb-icon" />;
        case 'Team':
            return <Users size={16} className="kpi-breadcrumb-icon" />;
        case 'Employee':
            return <User size={16} className="kpi-breadcrumb-icon" />;
        default:
            return null;
    }
};

export const KpiBreadcrumbs: React.FC<KpiBreadcrumbsProps> = ({
    breadcrumbs,
    onNavigate,
    onBack
}) => {
    const canGoBack = breadcrumbs.length > 1;

    return (
        <nav className="kpi-breadcrumbs-container" aria-label="KPI Hierarchy Breadcrumbs">
            {canGoBack && (
                <button
                    type="button"
                    className="kpi-breadcrumb-back-btn"
                    onClick={onBack}
                    title="Go back to parent scope"
                    aria-label="Back to parent scope"
                >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                </button>
            )}

            <ol className="kpi-breadcrumbs-list">
                {breadcrumbs.map((crumb, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    return (
                        <li key={`${crumb.level}-${crumb.id || 'root'}-${index}`} className="kpi-breadcrumb-item">
                            {index > 0 && (
                                <ChevronRight size={14} className="kpi-breadcrumb-separator" aria-hidden="true" />
                            )}
                            {isLast ? (
                                <span
                                    className="kpi-breadcrumb-current"
                                    aria-current="page"
                                    data-testid={`breadcrumb-current-${crumb.level.toLowerCase()}`}
                                >
                                    {getScopeIcon(crumb.level)}
                                    <span className="kpi-breadcrumb-label">{crumb.name}</span>
                                    <span className="kpi-breadcrumb-badge">{crumb.level}</span>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="kpi-breadcrumb-link"
                                    onClick={() => onNavigate(crumb, index)}
                                    data-testid={`breadcrumb-link-${crumb.level.toLowerCase()}`}
                                >
                                    {getScopeIcon(crumb.level)}
                                    <span className="kpi-breadcrumb-label">{crumb.name}</span>
                                </button>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};
