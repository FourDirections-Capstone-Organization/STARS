import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OpAdmin_Dashboard from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        upload: vi.fn(),
    },
}));

vi.mock('../Pages/OpAdmin_Dashboard/KpiDrillDown', () => ({
    ReportsTab: () => <div data-testid="mock-reports-tab">Mock Reports</div>,
}));

describe('Coordinator Tasks Tab Display', () => {
    const coordUserId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const coordEmpNum = 'EMP-COORD-001';
    const coordName = 'Jane Coordinator';

    const mockTasksResponse = {
        isSuccess: true,
        data: {
            items: [
                {
                    id: '11111111-2222-3333-4444-555555555555',
                    taskNumber: 'TSK-2026-0001',
                    title: 'Urgent Dispatch Review for Route A',
                    description: 'Review routes and assign couriers accordingly',
                    priorityLevel: 3, // Urgent
                    classification: 0, // RoutineDailyTask
                    status: 0, // Assigned
                    deadline: '2026-11-25T10:00:00Z',
                    createdById: coordUserId,
                    createdByName: coordName,
                    assignees: [
                        { userId: 'courier-01', fullName: 'Carlos Courier', completionPercentage: 0 }
                    ],
                },
                {
                    id: '22222222-3333-4444-5555-666666666666',
                    taskNumber: 'TSK-2026-0002',
                    title: 'Delivery Follow-up - Package #99281',
                    description: 'Follow up failed delivery attempt',
                    priorityLevel: 2, // High
                    classification: 1, // SpecialTask
                    status: 1, // In Progress
                    deadline: '2026-11-26T14:00:00Z',
                    createdById: coordUserId,
                    createdByName: coordName,
                    assignees: [
                        { userId: 'dispatcher-01', fullName: 'Danny Dispatcher', completionPercentage: 50 }
                    ],
                }
            ],
            totalCount: 2,
            totalPages: 1,
            pageNumber: 1,
            pageSize: 10,
            activeCount: 2,
            inProgressCount: 1,
            completedCount: 0,
            overdueCount: 0,
            cancelledCount: 0,
            onHoldCount: 0,
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('authToken', 'fake-jwt-token');
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('role', 'Coordinator');
        localStorage.setItem('userId', coordUserId);
        localStorage.setItem('accountId', coordUserId);
        localStorage.setItem('employeeId', coordEmpNum);
        localStorage.setItem('employeeName', coordName);
        localStorage.setItem('firstName', 'Jane');
        localStorage.setItem('lastName', 'Coordinator');

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/Task?')) {
                return Promise.resolve({ data: mockTasksResponse });
            }
            if (url.includes('/api/Task/awaiting-review') || url.includes('/api/Task/overdue')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Task')) {
                return Promise.resolve({ data: mockTasksResponse });
            }
            if (url.includes('/api/User')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Dashboard')) {
                return Promise.resolve({ data: { isSuccess: true, data: {} } });
            }
            if (url.includes('/api/Notification')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Announcement')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
    });

    it('displays tasks created by the coordinator in the Tasks tab without ReferenceError', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        // Wait for dashboard to finish loading
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/Task'));
        });

        // Navigate to Tasks tab via sidebar link
        const tasksLinks = await screen.findAllByRole('link', { name: 'Tasks' });
        expect(tasksLinks.length).toBeGreaterThan(0);
        fireEvent.click(tasksLinks[0]);

        // Check that the Task Manager table displays both tasks created by the coordinator
        await waitFor(() => {
            expect(screen.getByText('Urgent Dispatch Review for Route A')).toBeInTheDocument();
            expect(screen.getByText('Delivery Follow-up - Package #99281')).toBeInTheDocument();
        });

        // Verify task details / badges are rendered
        expect(screen.getByText('#TSK-2026-0001')).toBeInTheDocument();
        expect(screen.getByText('#TSK-2026-0002')).toBeInTheDocument();
        expect(screen.getByText('Carlos Courier')).toBeInTheDocument();
    });

    it('works when only userRole is set in localStorage without role', async () => {
        localStorage.removeItem('role');
        localStorage.setItem('userRole', 'Coordinator');

        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        const tasksLinks = await screen.findAllByRole('link', { name: 'Tasks' });
        fireEvent.click(tasksLinks[0]);

        await waitFor(() => {
            expect(screen.getByText('Urgent Dispatch Review for Route A')).toBeInTheDocument();
        });
    });
});
