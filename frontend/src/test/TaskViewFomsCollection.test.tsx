import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';

// Mock api
vi.mock('../api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: { isSuccess: true, data: null } }),
        put: vi.fn().mockResolvedValue({ data: { isSuccess: true } }),
    },
}));

// Mock Toast
const mockToastSuccess = vi.fn();
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: mockToastSuccess,
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

describe('TaskView - FOMS Collection Follow-up (Integration 3)', () => {
    const regularTask: TaskViewTask = {
        taskId: 'reg-01',
        taskTitle: 'Standard Courier Dispatch to Warehouse',
        taskDescription: 'Deliver goods to Northern branch warehouse.',
        priority: 'Medium',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'In Progress',
        assignedEmployee: 'John Doe',
        createdByEmployee: 'Admin User',
        assignedTo: 'John Doe',
        createdAt: new Date().toISOString(),
    };

    const collectionTask: TaskViewTask = {
        taskId: 'col-01',
        taskTitle: '[Collection Follow-up] Invoice INV-2026-9481 - Trans-Pacific Express Cargo',
        taskDescription:
            'Automated collection follow-up routed from FOMS.\n' +
            'Invoice: INV-2026-9481\n' +
            'Amount Due: ₱145,000.00\n' +
            'Aging: 31-60 (35 days overdue)\n' +
            'Due Date: 2026-09-14\n' +
            'Client Account: CLI-TRANSPAC-02 (Trans-Pacific Express Cargo)\n' +
            'Contact: Mr. Victor Ramos (09201234567)\n' +
            'Email: victor.ramos@transpacific.com\n' +
            'Address: Km 18, West Service Road, Parañaque City\n' +
            'Remarks: Account severely overdue (35 days). Immediate field collection routing required.',
        priority: 'Urgent',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'In Progress',
        assignedEmployee: 'Jane Coordinator',
        createdByEmployee: 'FOMS System Webhook',
        assignedTo: 'Jane Coordinator',
        createdAt: new Date().toISOString(),
        assignees: [
            {
                fullName: 'Jane Coordinator',
                completionPercentage: 20,
            },
        ],
    };

    it('does not render FOMS Collection section for regular tasks', () => {
        render(<TaskView task={regularTask} />);

        expect(screen.queryByText(/FOMS Automated Collection & Workload Graph Routing/i)).not.toBeInTheDocument();
    });

    it('renders the FOMS Collection section with parsed details and Graph Routing info', () => {
        render(<TaskView task={collectionTask} />);

        // Section header
        expect(screen.getByText('FOMS Automated Collection & Workload Graph Routing')).toBeInTheDocument();
        expect(screen.getByText(/Graph Routed to Optimal Coordinator/i)).toBeInTheDocument();

        // Overdue stats banner
        expect(screen.getByText('OUTSTANDING AMOUNT')).toBeInTheDocument();
        expect(screen.getByText('₱145,000.00')).toBeInTheDocument();
        expect(screen.getByText('INV-2026-9481')).toBeInTheDocument();
        expect(screen.getAllByText(/31-60 \(35 days overdue\)/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('2026-09-14')).toBeInTheDocument();

        // Routing card & Assignee
        expect(screen.getByText('GRAPH ROUTING ENGINE ASSIGNMENT')).toBeInTheDocument();
        expect(screen.getAllByText(/assigned to/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Jane Coordinator/i).length).toBeGreaterThanOrEqual(1);

        // Debtor grid
        expect(screen.getByText('Trans-Pacific Express Cargo')).toBeInTheDocument();
        expect(screen.getByText('Mr. Victor Ramos')).toBeInTheDocument();
        expect(screen.getByText('09201234567')).toBeInTheDocument();
        expect(screen.getByText('victor.ramos@transpacific.com')).toBeInTheDocument();
        expect(screen.getByText('Km 18, West Service Road, Parañaque City')).toBeInTheDocument();

        // Quick action buttons
        expect(screen.getByRole('button', { name: /log call attempt/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /promised payment/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /mark settled/i })).toBeInTheDocument();
    });

    it('triggers toast notifications when Coordinator clicks collection quick action buttons', () => {
        render(<TaskView task={collectionTask} />);

        const callBtn = screen.getByRole('button', { name: /log call attempt/i });
        fireEvent.click(callBtn);

        expect(mockToastSuccess).toHaveBeenCalledWith(
            expect.stringContaining('Contact attempt recorded for Trans-Pacific Express Cargo')
        );

        const promisedBtn = screen.getByRole('button', { name: /promised payment/i });
        fireEvent.click(promisedBtn);

        expect(mockToastSuccess).toHaveBeenCalledWith(
            expect.stringContaining('Payment promised within 3 business days')
        );
    });
});
