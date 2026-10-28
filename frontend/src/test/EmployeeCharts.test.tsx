import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmployeeCharts from '../Pages/SystemAdmin_Dashboard/OrgStructureTab/EmployeeDashboard/EmployeeCharts';
import {
    TaskStatusBreakdownItem,
    TaskPriorityDistributionItem,
    TaskCompletionTrendItem,
} from '../services/employeeDashboardService';

// Mock Recharts ResponsiveContainer to render children directly in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => (
            <div className="recharts-responsive-container" style={{ width: '100%', height: 230 }}>
                {children}
            </div>
        ),
    };
});

describe('EmployeeCharts Component', () => {
    const sampleStatusBreakdown: TaskStatusBreakdownItem[] = [
        { status: 'Completed', count: 8, percentage: 50.0 },
        { status: 'In Progress', count: 4, percentage: 25.0 },
        { status: 'Pending', count: 3, percentage: 18.75 },
        { status: 'Overdue', count: 1, percentage: 6.25 },
    ];

    const samplePriorityDistribution: TaskPriorityDistributionItem[] = [
        { priority: 'Urgent', count: 2 },
        { priority: 'High', count: 5 },
        { priority: 'Medium', count: 6 },
        { priority: 'Low', count: 3 },
    ];

    const sampleCompletionTrend: TaskCompletionTrendItem[] = [
        { period: 'Aug 2026', completedCount: 3 },
        { period: 'Sep 2026', completedCount: 7 },
        { period: 'Oct 2026', completedCount: 8 },
    ];

    const sampleData = {
        totalAssignedTasks: 16,
        totalCreatedTasks: 4,
        statusBreakdown: sampleStatusBreakdown,
        priorityDistribution: samplePriorityDistribution,
        completionTrend: sampleCompletionTrend,
    };

    it('renders all 4 chart cards with populated metrics', () => {
        render(<EmployeeCharts data={sampleData} />);

        // 1. Task Status Breakdown
        expect(screen.getByText('Task Status Breakdown')).toBeInTheDocument();
        expect(screen.getByText('Current distribution of assigned tasks')).toBeInTheDocument();
        expect(screen.getByText('16 Total')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText('(8)')).toBeInTheDocument();
        expect(screen.getByText('In Progress')).toBeInTheDocument();
        expect(screen.getByText('(4)')).toBeInTheDocument();

        // 2. Created vs. Assigned Workload
        expect(screen.getByText('Created vs. Assigned')).toBeInTheDocument();
        expect(screen.getByText('Task delegation and execution balance')).toBeInTheDocument();
        expect(screen.getByText('20 Tasks Total')).toBeInTheDocument();
        expect(screen.getByText('Assigned to Them')).toBeInTheDocument();
        expect(screen.getByText('16')).toBeInTheDocument();
        expect(screen.getByText('Created by Them')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();

        // 3. Priority Distribution
        expect(screen.getByText('Priority Distribution')).toBeInTheDocument();
        expect(screen.getByText('Urgent · High · Medium · Low')).toBeInTheDocument();
        expect(screen.getByText('16 Categorized')).toBeInTheDocument();

        // 4. Completion Trend Over Time
        expect(screen.getByText('Completion Trend Over Time')).toBeInTheDocument();
        expect(screen.getByText('Historical completed tasks volume')).toBeInTheDocument();
        expect(screen.getByText('18 Total Completed')).toBeInTheDocument();
    });

    it('renders empty state fallback for each chart when all metrics are 0 or empty', () => {
        const emptyData = {
            totalAssignedTasks: 0,
            totalCreatedTasks: 0,
            statusBreakdown: [],
            priorityDistribution: [],
            completionTrend: [],
        };

        render(<EmployeeCharts data={emptyData} />);

        // Status empty state
        expect(screen.getByTestId('ec-status-empty')).toBeInTheDocument();
        expect(screen.getByText('No task status data recorded')).toBeInTheDocument();
        expect(screen.getByText(/Status distributions will appear once tasks are assigned/i)).toBeInTheDocument();

        // Workload empty state
        expect(screen.getByTestId('ec-workload-empty')).toBeInTheDocument();
        expect(screen.getByText('No task activity recorded')).toBeInTheDocument();
        expect(screen.getByText(/Neither assigned nor created tasks have been logged/i)).toBeInTheDocument();

        // Priority empty state
        expect(screen.getByTestId('ec-priority-empty')).toBeInTheDocument();
        expect(screen.getByText('No priority distribution data available')).toBeInTheDocument();
        expect(screen.getByText(/Priority breakdown will display once active tasks are assigned/i)).toBeInTheDocument();

        // Trend empty state
        expect(screen.getByTestId('ec-trend-empty')).toBeInTheDocument();
        expect(screen.getByText('No completion history recorded yet')).toBeInTheDocument();
        expect(screen.getByText(/Finished tasks will populate this timeline/i)).toBeInTheDocument();
    });

    it('handles individual props instead of a unified data object', () => {
        render(
            <EmployeeCharts
                totalAssignedTasks={10}
                totalCreatedTasks={2}
                statusBreakdown={sampleStatusBreakdown}
                priorityDistribution={samplePriorityDistribution}
                completionTrend={sampleCompletionTrend}
            />
        );

        expect(screen.getByText('Task Status Breakdown')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument(); // Assigned count
        expect(screen.getByText('2')).toBeInTheDocument();  // Created count
        expect(screen.getByText('12 Tasks Total')).toBeInTheDocument();
    });

    it('handles null and undefined data props without errors', () => {
        const { rerender } = render(<EmployeeCharts data={null} />);
        expect(screen.getByText('No task status data recorded')).toBeInTheDocument();

        rerender(<EmployeeCharts />);
        expect(screen.getByText('No task activity recorded')).toBeInTheDocument();
    });

    it('accurately derives role balance insights based on created vs assigned ratio', () => {
        // Case 1: Pure Execution Staff (0 created, 12 assigned)
        const { rerender } = render(
            <EmployeeCharts
                totalAssignedTasks={12}
                totalCreatedTasks={0}
            />
        );
        expect(screen.getByText('Task Execution Role:')).toBeInTheDocument();
        expect(screen.getByText(/Focuses primarily on executing tasks assigned by managers/i)).toBeInTheDocument();

        // Case 2: Pure Supervisory Role (15 created, 0 assigned)
        rerender(
            <EmployeeCharts
                totalAssignedTasks={0}
                totalCreatedTasks={15}
            />
        );
        expect(screen.getByText('Supervisory Role:')).toBeInTheDocument();
        expect(screen.getByText(/Focuses on delegating and creating tasks/i)).toBeInTheDocument();

        // Case 3: Balanced Workflow (8 created, 10 assigned)
        rerender(
            <EmployeeCharts
                totalAssignedTasks={10}
                totalCreatedTasks={8}
            />
        );
        expect(screen.getByText('Balanced Workflow:')).toBeInTheDocument();
        expect(screen.getByText(/Active balance of creating and executing responsibilities/i)).toBeInTheDocument();
    });

    it('filters out zero-count status items from donut legend to keep visual clarity', () => {
        const statusWithZeros: TaskStatusBreakdownItem[] = [
            { status: 'Completed', count: 5, percentage: 100.0 },
            { status: 'In Progress', count: 0, percentage: 0 },
            { status: 'Pending', count: 0, percentage: 0 },
            { status: 'Overdue', count: 0, percentage: 0 },
        ];

        render(
            <EmployeeCharts
                totalAssignedTasks={5}
                totalCreatedTasks={0}
                statusBreakdown={statusWithZeros}
            />
        );

        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText('(5)')).toBeInTheDocument();
        expect(screen.queryByText('(0)')).not.toBeInTheDocument();
    });
});
