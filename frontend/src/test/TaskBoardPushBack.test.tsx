import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskManager, { TMTask } from '../components/TaskManager/TaskManager';

describe('Task Board View Push Back', () => {
    const mockTasks: TMTask[] = [
        {
            id: 'task-rev-1',
            name: 'Financial Endorsement Review',
            taskNumber: 'TSK-9901',
            priority: 'High',
            status: 'In review',
            progress: 80,
            assignee: { id: 'emp-1', name: 'John Doe' },
            isArchived: false,
            isDeleted: false,
        },
        {
            id: 'task-prog-1',
            name: 'Data Processing Task',
            taskNumber: 'TSK-9902',
            priority: 'Medium',
            status: 'In progress',
            progress: 50,
            assignee: { id: 'emp-2', name: 'Jane Smith' },
            isArchived: false,
            isDeleted: false,
        },
    ];

    it('renders the Push Back and Approve buttons on In Review cards in Board view and opens the modal', async () => {
        const handlePushBack = vi.fn();
        const handleMarkDone = vi.fn();

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
                onMarkDone={handleMarkDone}
                onPushBack={handlePushBack}
            />
        );

        // Switch to Board View
        const boardToggleBtn = screen.getByTitle('Board View');
        fireEvent.click(boardToggleBtn);

        // Verify In Review card shows Push Back and Approve buttons
        const pushBackBtn = screen.getByTitle('Push back task for employee rework');
        expect(pushBackBtn).toBeInTheDocument();
        expect(pushBackBtn).toHaveTextContent('Push Back');

        const approveBtn = screen.getByTitle('Approve and mark completed');
        expect(approveBtn).toBeInTheDocument();
        expect(approveBtn).toHaveTextContent('Approve');

        // Click Push Back button
        fireEvent.click(pushBackBtn);

        // Push Back modal should open
        expect(screen.getByText('Push Back Task for Rework')).toBeInTheDocument();
        expect(screen.getByText(/Returning: Financial Endorsement Review/)).toBeInTheDocument();
        expect(screen.getAllByText('#TSK-9901').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);

        // Try submitting without remarks
        const submitBtn = screen.getByRole('button', { name: /Push Back for Rework/i });
        expect(submitBtn).toBeDisabled();

        // Enter remarks
        const textarea = screen.getByPlaceholderText(/Provide clear revision instructions/i);
        fireEvent.change(textarea, { target: { value: 'Missing official invoice receiving stamp and signature.' } });

        expect(submitBtn).not.toBeDisabled();
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(handlePushBack).toHaveBeenCalledTimes(1);
            expect(handlePushBack).toHaveBeenCalledWith('task-rev-1', 'Missing official invoice receiving stamp and signature.');
        });
    });

    it('allows pushing back via dragging an In Review task card to In Progress column', async () => {
        const handlePushBack = vi.fn();

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
                onPushBack={handlePushBack}
            />
        );

        // Switch to Board View
        fireEvent.click(screen.getByTitle('Board View'));

        // Find the in-progress column
        const inProgressTitle = screen.getAllByText('In Progress').find(el => el.classList.contains('tm-board-col-title'));
        const inProgressCol = inProgressTitle?.closest('.tm-board-column');
        expect(inProgressCol).toBeTruthy();

        // Drag the review card and drop it onto the in-progress column
        const reviewCard = screen.getByText('Financial Endorsement Review').closest('.tm-board-card');
        expect(reviewCard).toBeTruthy();

        fireEvent.dragStart(reviewCard!, {
            dataTransfer: {
                setData: vi.fn(),
                getData: () => 'task-rev-1',
            },
        });

        fireEvent.drop(inProgressCol!, {
            dataTransfer: {
                getData: () => 'task-rev-1',
            },
        });

        // Dropping onto in-progress should open the Push Back modal
        expect(screen.getByText('Push Back Task for Rework')).toBeInTheDocument();

        // Enter revision remarks and confirm
        const textarea = screen.getByPlaceholderText(/Provide clear revision instructions/i);
        fireEvent.change(textarea, { target: { value: 'Please update invoice figures before submission.' } });

        const submitBtn = screen.getByRole('button', { name: /Push Back for Rework/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(handlePushBack).toHaveBeenCalledWith('task-rev-1', 'Please update invoice figures before submission.');
        });
    });

    it('approves task when dragging an In Review card to Done column', async () => {
        const handleMarkDone = vi.fn();

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
                onMarkDone={handleMarkDone}
                onPushBack={vi.fn()}
            />
        );

        // Switch to Board View
        fireEvent.click(screen.getByTitle('Board View'));

        const doneTitle = screen.getByText('Done / Completed');
        const doneCol = doneTitle.closest('.tm-board-column');
        expect(doneCol).toBeTruthy();

        const reviewCard = screen.getByText('Financial Endorsement Review').closest('.tm-board-card');
        expect(reviewCard).toBeTruthy();

        fireEvent.dragStart(reviewCard!, {
            dataTransfer: {
                setData: vi.fn(),
                getData: () => 'task-rev-1',
            },
        });

        fireEvent.drop(doneCol!, {
            dataTransfer: {
                getData: () => 'task-rev-1',
            },
        });

        expect(handleMarkDone).toHaveBeenCalledWith(['task-rev-1']);
    });
});
