import React from 'react';
import { 
    Clock, 
    CheckSquare, 
    Pencil, 
    Play, 
    Repeat, 
    Layers, 
    User, 
    Users, 
    Flame, 
    Calendar,
    Sparkles
} from 'lucide-react';
import { TaskTemplateItem } from './types';

interface TaskTemplateCardProps {
    template: TaskTemplateItem;
    onEdit: (template: TaskTemplateItem) => void;
    onToggleActive: (id: string, currentActive: boolean) => void;
    onDeploy: (id: string) => void;
    isDeploying?: boolean;
}

export const TaskTemplateCard: React.FC<TaskTemplateCardProps> = ({
    template,
    onEdit,
    onToggleActive,
    onDeploy,
    isDeploying = false,
}) => {
    const getPriorityIcon = (priority: string) => {
        switch (priority) {
            case 'Urgent':
                return <Flame size={20} color="#DC2626" />;
            case 'High':
                return <Sparkles size={20} color="#EA580C" />;
            case 'Low':
                return <Layers size={20} color="#059669" />;
            default:
                return <Repeat size={20} color="#00A99D" />;
        }
    };

    const getPriorityBg = (priority: string) => {
        switch (priority) {
            case 'Urgent':
                return 'rgba(220, 38, 38, 0.1)';
            case 'High':
                return 'rgba(234, 88, 12, 0.1)';
            case 'Low':
                return 'rgba(5, 150, 105, 0.1)';
            default:
                return 'rgba(0, 169, 157, 0.1)';
        }
    };

    const renderAssignmentBadge = () => {
        if (template.assignmentMode === 'round-robin') {
            return (
                <span className="tt-badge tt-badge-roundrobin" title="Round-robin auto-assignment to least loaded active employee">
                    <Repeat size={11} /> Round-robin
                </span>
            );
        }
        if (template.assignmentMode === 'fixed' && template.defaultAssigneeName) {
            return (
                <span className="tt-badge tt-badge-fixed" title={`Assigned to ${template.defaultAssigneeName}`}>
                    <User size={11} /> Fixed: {template.defaultAssigneeName}
                </span>
            );
        }
        return (
            <span className="tt-badge tt-badge-manual" title="Unassigned / Coordinator manual routing">
                <Users size={11} /> Manual
            </span>
        );
    };

    return (
        <div className={`tt-card${!template.isActive ? ' dimmed' : ''}`}>
            <div>
                {/* Header */}
                <div className="tt-card-header">
                    <div 
                        className="tt-card-icon" 
                        style={{ background: getPriorityBg(template.priorityLevel) }}
                    >
                        {getPriorityIcon(template.priorityLevel)}
                    </div>
                    <div className="tt-card-title-wrap">
                        <h3 className="tt-card-title" title={template.templateName}>
                            {template.templateName}
                        </h3>
                        <div className="tt-card-badges">
                            {renderAssignmentBadge()}
                            <span 
                                className="tt-badge" 
                                style={{ 
                                    background: template.priorityLevel === 'Urgent' ? 'rgba(220,38,38,0.1)' : 'rgba(100,116,139,0.1)',
                                    color: template.priorityLevel === 'Urgent' ? '#DC2626' : '#64748B'
                                }}
                            >
                                {template.priorityLevel}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Description */}
                <p className="tt-card-desc" title={template.cleanDescription || template.defaultDescription}>
                    {template.cleanDescription || template.defaultDescription || 'No description provided.'}
                </p>

                {/* Metadata Grid */}
                <div className="tt-card-meta">
                    <div className="tt-card-meta-item">
                        <Clock size={13} color="var(--text-muted)" />
                        <span>Due in {template.dueAfterDays} {template.dueAfterDays === 1 ? 'day' : 'days'}</span>
                    </div>
                    <div className="tt-card-meta-item">
                        <CheckSquare size={13} color="var(--text-muted)" />
                        <span>{template.checklist.length} {template.checklist.length === 1 ? 'task item' : 'checklist items'}</span>
                    </div>
                    <div className="tt-card-meta-item">
                        <Layers size={13} color="var(--text-muted)" />
                        <span>Used {template.timesUsed} {template.timesUsed === 1 ? 'time' : 'times'}</span>
                    </div>
                    <div className="tt-card-meta-item">
                        <Calendar size={13} color="var(--text-muted)" />
                        <span>{template.recurrenceRule}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="tt-card-footer">
                <div className="tt-toggle-wrap">
                    <label className="tt-switch" aria-label={`Toggle active state for ${template.templateName}`}>
                        <input
                            type="checkbox"
                            checked={template.isActive}
                            onChange={() => onToggleActive(template.id, template.isActive)}
                            aria-label={`Active switch for ${template.templateName}`}
                        />
                        <span className="tt-slider"></span>
                    </label>
                    <span className="tt-toggle-label">
                        {template.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>

                <div className="tt-card-actions">
                    <button
                        type="button"
                        className="tt-btn-deploy"
                        onClick={() => onDeploy(template.id)}
                        disabled={isDeploying || !template.isActive}
                        title={template.isActive ? 'Deploy task now from this template' : 'Activate template to deploy'}
                        aria-label={`Deploy task from ${template.templateName}`}
                    >
                        <Play size={12} /> Deploy
                    </button>
                    <button
                        type="button"
                        className="tt-btn-edit"
                        onClick={() => onEdit(template)}
                        aria-label={`Edit ${template.templateName}`}
                    >
                        <Pencil size={12} /> Edit
                    </button>
                </div>
            </div>
        </div>
    );
};
