import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskManager, { TMTask } from '../components/TaskManager/TaskManager';

describe('Task Board Tab Restriction', () => {
    const mockTasks: TMTask[] = [
        {
            id: 'task-1',
            name: 'Active In Progress Task',
            priority: 'High',
            status: 'In progress',
            progress: 50,
            isArchived: false,
            isDeleted: false,
        },
        {
            id: 'task-2',
            name: 'On Hold Task Item',
            priority: 'Medium',
            status: 'On hold',
            progress: 30,
            isArchived: false,
            isDeleted: false,
        },
        {
            id: 'task-3',
            name: 'Completed Task Item',
            priority: 'Low',
            status: 'Done',
            progress: 100,
            isArchived: false,
            isDeleted: false,
        },
        {
            id: 'task-4',
            name: 'Cancelled Bin Task Item',
            priority: 'Urgent',
            status: 'Cancelled',
            progress: 0,
            isArchived: false,
            isDeleted: true,
        },
    ];

    it('displays the Board view toggle on Active tab and allows viewing Kanban columns', () => {
        render(
            <TaskManager
                tasks={mockTasks}
                teamMembers={[]}
                onNewTask={vi.fn()}
                onEdit={vi.fn()}
                onView={vi.fn()}
                onArchive={vi.fn()}
                onRestore={vi.fn()}
                onDelete={vi.fn()}
                onMarkDone={vi.fn()}
            />
        );

        // Board toggle button is present on Active tab
        const boardToggleBtn = screen.getByTitle('Board View');
        expect(boardToggleBtn).toBeInTheDocument();

        // Switch to Board View
        fireEvent.click(boardToggleBtn);

        // Board columns are displayed
        expect(screen.getByText('To Do / Backlog')).toBeInTheDocument();
        expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('In Review')).toBeInTheDocument();
        expect(screen.getByText('Done / Completed')).toBeInTheDocument();
    });

    it('does NOT display the Kanban board or Board toggle on the Completed tab, showing only the list of completed tasks', () => {
        render(
            <TaskManager
                tasks={mockTasks}
                teamMembers={[]}
                onNewTask={vi.fn()}
                onEdit={vi.fn()}
                onView={vi.fn()}
                onArchive={vi.fn()}
                onRestore={vi.fn()}
                onDelete={vi.fn()}
                onMarkDone={vi.fn()}
            />
        );

        // Click Completed tab
        const completedTabBtn = screen.getByRole('button', { name: /completed/i });
        fireEvent.click(completedTabBtn);

        // Board toggle button must not be visible on Completed tab
        expect(screen.queryByTitle('Board View')).not.toBeInTheDocument();

        // Multi-column Kanban board headers must not exist
        expect(screen.queryByText('To Do / Backlog')).not.toBeInTheDocument();
        expect(screen.queryByText('In Review')).not.toBeInTheDocument();

        // The completed task is displayed in the list
        expect(screen.getByText('Completed Task Item')).toBeInTheDocument();
    });

    it('does NOT display the Kanban board or Board toggle on On Hold tab, showing only on hold tasks', () => {
        render(
            <TaskManager
                tasks={mockTasks}
                teamMembers={[]}
                onNewTask={vi.fn()}
                onEdit={vi.fn()}
                onView={vi.fn()}
                onArchive={vi.fn()}
                onRestore={vi.fn()}
                onDelete={vi.fn()}
                onMarkDone={vi.fn()}
            />
        );

        // Click On Hold tab
        const onHoldTabBtn = screen.getByRole('button', { name: /on hold/i });
        fireEvent.click(onHoldTabBtn);

        // Board toggle button must not be visible
        expect(screen.queryByTitle('Board View')).not.toBeInTheDocument();

        // Kanban board columns must not exist
        expect(screen.queryByText('To Do / Backlog')).not.toBeInTheDocument();
        expect(screen.queryByText('In Review')).not.toBeInTheDocument();

        // The on hold task is displayed in the list
        expect(screen.getByText('On Hold Task Item')).toBeInTheDocument();
    });

    it('does NOT display the Kanban board or Board toggle on Bin tab, showing only bin tasks', () => {
        render(
            <TaskManager
                tasks={mockTasks}
                teamMembers={[]}
                onNewTask={vi.fn()}
                onEdit={vi.fn()}
                onView={vi.fn()}
                onArchive={vi.fn()}
                onRestore={vi.fn()}
                onDelete={vi.fn()}
                onMarkDone={vi.fn()}
            />
        );

        // Click Bin tab
        const binTabBtn = screen.getByRole('button', { name: /bin/i });
        fireEvent.click(binTabBtn);

        // Board toggle button must not be visible
        expect(screen.queryByTitle('Board View')).not.toBeInTheDocument();

        // Kanban board columns must not exist
        expect(screen.queryByText('To Do / Backlog')).not.toBeInTheDocument();
        expect(screen.queryByText('In Review')).not.toBeInTheDocument();

        // The cancelled/bin task is displayed in the list
        expect(screen.getByText('Cancelled Bin Task Item')).toBeInTheDocument();
    });
});
