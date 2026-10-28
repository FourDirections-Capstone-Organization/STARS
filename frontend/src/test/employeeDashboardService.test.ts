import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../api';
import {
    employeeDashboardService,
    getEmployeeDashboard,
    getEmployeeAssignedTasks,
    getEmployeeCreatedTasks,
    buildTaskQueryString,
    mapPaginatedTasksResponse,
    EmployeeDashboardData,
    PaginatedTasksResponse,
    ApiResponse,
} from '../services/employeeDashboardService';

// Mock the centralized api module
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

describe('employeeDashboardService', () => {
    const mockEmployeeId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    const mockDashboardData: EmployeeDashboardData = {
        employeeId: mockEmployeeId,
        employeeNumber: 'EMP-1001',
        fullName: 'Jane Doe',
        email: 'jane.doe@speedex.com',
        role: 'Coordinator',
        departmentName: 'Dispatch Team',
        jobPositionName: 'Dispatch Coordinator',
        availabilityStatus: 'Available',
        presenceStatus: 'Online',
        isActive: true,
        reportsTo: {
            supervisorId: '99999999-9999-9999-9999-999999999999',
            supervisorName: 'Robert Smith',
            supervisorRole: 'Manager',
            supervisorEmployeeNumber: 'M-001',
            reportingRelation: 'Manager',
        },
        supervisorName: 'Robert Smith',
        supervisorRole: 'Manager',
        supervisorEmployeeNumber: 'M-001',
        reportingRelation: 'Manager',
        totalAssignedTasks: 18,
        totalCreatedTasks: 6,
        completedCount: 12,
        inProgressCount: 4,
        pendingCount: 1,
        overdueCount: 1,
        statusBreakdown: [
            { status: 'Completed', count: 12, percentage: 66.7 },
            { status: 'InProgress', count: 4, percentage: 22.2 },
            { status: 'Pending', count: 1, percentage: 5.6 },
            { status: 'Overdue', count: 1, percentage: 5.6 },
        ],
        priorityDistribution: [
            { priority: 'Urgent', count: 3 },
            { priority: 'High', count: 7 },
            { priority: 'Medium', count: 6 },
            { priority: 'Low', count: 2 },
        ],
        completionTrend: [
            { period: '2026-W40', completedCount: 2 },
            { period: '2026-W41', completedCount: 5 },
            { period: '2026-W42', completedCount: 5 },
        ],
    };

    const mockTaskItems = [
        {
            id: 'task-101',
            taskNumber: 'TSK-1001',
            title: 'Express Delivery Dispatch to BGC',
            description: 'Deliver sensitive documents',
            priorityLevel: 'High',
            status: 'InProgress',
            deadline: '2026-10-30T17:00:00Z',
            isSLALocked: false,
            createdById: mockEmployeeId,
            createdByName: 'Jane Doe',
            assignees: [
                {
                    userId: 'c-01',
                    fullName: 'Carlos Courier',
                    employeeNumber: 'DRV-10',
                    completionPercentage: 40,
                },
            ],
            myCompletionPercentage: 40,
            attachmentCount: 2,
            createdAt: '2026-10-25T08:30:00Z',
        },
    ];

    const mockTaskListPayload = {
        items: mockTaskItems,
        totalCount: 1,
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
        activeCount: 1,
        inProgressCount: 1,
        completedCount: 0,
        overdueCount: 0,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── 1. Query String Builder Tests ────────────────────────────────────────

    describe('buildTaskQueryString', () => {
        it('constructs query string with assignedToUserId, pageNumber, and pageSize', () => {
            const query = buildTaskQueryString(
                { assignedToUserId: mockEmployeeId },
                2,
                25
            );

            expect(query).toBe(
                `assignedToUserId=${mockEmployeeId}&pageNumber=2&pageSize=25`
            );
        });

        it('constructs query string with createdByUserId, pageNumber, and pageSize', () => {
            const query = buildTaskQueryString(
                { createdByUserId: mockEmployeeId },
                1,
                10
            );

            expect(query).toBe(
                `createdByUserId=${mockEmployeeId}&pageNumber=1&pageSize=10`
            );
        });

        it('includes search parameter and properly encodes special characters', () => {
            const query = buildTaskQueryString(
                { assignedToUserId: mockEmployeeId },
                1,
                10,
                'Urgent & Express Delivery'
            );

            expect(query).toContain('search=Urgent+%26+Express+Delivery');
        });

        it('includes valid status parameter', () => {
            const query = buildTaskQueryString(
                { assignedToUserId: mockEmployeeId },
                1,
                10,
                undefined,
                'InProgress'
            );

            expect(query).toContain('status=InProgress');
        });

        it('omits status when set to "All" (case-insensitive)', () => {
            const queryUpper = buildTaskQueryString(
                { assignedToUserId: mockEmployeeId },
                1,
                10,
                undefined,
                'ALL'
            );
            expect(queryUpper).not.toContain('status=');

            const queryMixed = buildTaskQueryString(
                { assignedToUserId: mockEmployeeId },
                1,
                10,
                undefined,
                'All'
            );
            expect(queryMixed).not.toContain('status=');
        });

        it('omits search and status when empty or whitespace', () => {
            const query = buildTaskQueryString(
                { assignedToUserId: mockEmployeeId },
                1,
                10,
                '   ',
                '   '
            );

            expect(query).not.toContain('search=');
            expect(query).not.toContain('status=');
        });
    });

    // ─── 2. getEmployeeDashboard Tests ────────────────────────────────────────

    describe('getEmployeeDashboard', () => {
        it('calls GET /api/Hierarchy/employee/{id}/dashboard with correct URL', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: mockDashboardData,
                },
            });

            const result = await getEmployeeDashboard(mockEmployeeId);

            expect(api.get).toHaveBeenCalledTimes(1);
            expect(api.get).toHaveBeenCalledWith(
                `/api/Hierarchy/employee/${mockEmployeeId}/dashboard`
            );
            expect(result).toEqual(mockDashboardData);
        });

        it('handles direct payload response without ApiResponse envelope', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: mockDashboardData,
            });

            const result = await getEmployeeDashboard(mockEmployeeId);

            expect(result.fullName).toBe('Jane Doe');
            expect(result.role).toBe('Coordinator');
            expect(result.reportsTo.supervisorRole).toBe('Manager');
            expect(result.totalAssignedTasks).toBe(18);
        });

        it('throws an error if employeeId is empty or whitespace', async () => {
            await expect(getEmployeeDashboard('')).rejects.toThrow('Employee ID is required');
            await expect(getEmployeeDashboard('   ')).rejects.toThrow('Employee ID is required');
            expect(api.get).not.toHaveBeenCalled();
        });

        it('throws an error when isSuccess is false in backend response', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: false,
                    message: 'Employee not found in organization hierarchy',
                    data: null,
                },
            });

            await expect(getEmployeeDashboard(mockEmployeeId)).rejects.toThrow(
                'Employee not found in organization hierarchy'
            );
        });

        it('propagates API rejection when network or server error occurs', async () => {
            vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error: 500'));

            await expect(getEmployeeDashboard(mockEmployeeId)).rejects.toThrow('Network error: 500');
        });
    });

    // ─── 3. getEmployeeAssignedTasks Tests ────────────────────────────────────

    describe('getEmployeeAssignedTasks', () => {
        it('calls GET /api/Task with assignedToUserId and pagination query params', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: mockTaskListPayload,
                },
            });

            const result = await getEmployeeAssignedTasks(mockEmployeeId, 1, 10);

            expect(api.get).toHaveBeenCalledTimes(1);
            expect(api.get).toHaveBeenCalledWith(
                `/api/Task?assignedToUserId=${mockEmployeeId}&pageNumber=1&pageSize=10`
            );
            expect(result.items).toHaveLength(1);
            expect(result.totalCount).toBe(1);
            expect(result.items[0].title).toBe('Express Delivery Dispatch to BGC');
        });

        it('includes search and status filters in query string when provided', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: mockTaskListPayload,
                },
            });

            await getEmployeeAssignedTasks(mockEmployeeId, 2, 20, 'Dispatch', 'InProgress');

            expect(api.get).toHaveBeenCalledWith(
                `/api/Task?assignedToUserId=${mockEmployeeId}&pageNumber=2&pageSize=20&search=Dispatch&status=InProgress`
            );
        });

        it('throws an error if employeeId is missing', async () => {
            await expect(getEmployeeAssignedTasks('')).rejects.toThrow('Employee ID is required');
            expect(api.get).not.toHaveBeenCalled();
        });

        it('throws an error if response has isSuccess === false', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: false,
                    message: 'Access denied to task scope',
                },
            });

            await expect(getEmployeeAssignedTasks(mockEmployeeId)).rejects.toThrow(
                'Access denied to task scope'
            );
        });
    });

    // ─── 4. getEmployeeCreatedTasks Tests ─────────────────────────────────────

    describe('getEmployeeCreatedTasks', () => {
        it('calls GET /api/Task with createdByUserId and pagination query params', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: mockTaskListPayload,
                },
            });

            const result = await getEmployeeCreatedTasks(mockEmployeeId, 1, 10);

            expect(api.get).toHaveBeenCalledTimes(1);
            expect(api.get).toHaveBeenCalledWith(
                `/api/Task?createdByUserId=${mockEmployeeId}&pageNumber=1&pageSize=10`
            );
            expect(result.items).toHaveLength(1);
            expect(result.pageNumber).toBe(1);
            expect(result.pageSize).toBe(10);
        });

        it('includes search and status filters in query string', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: true,
                    data: mockTaskListPayload,
                },
            });

            await getEmployeeCreatedTasks(mockEmployeeId, 3, 15, 'Urgent', 'Completed');

            expect(api.get).toHaveBeenCalledWith(
                `/api/Task?createdByUserId=${mockEmployeeId}&pageNumber=3&pageSize=15&search=Urgent&status=Completed`
            );
        });

        it('throws an error if employeeId is missing', async () => {
            await expect(getEmployeeCreatedTasks('')).rejects.toThrow('Employee ID is required');
            expect(api.get).not.toHaveBeenCalled();
        });

        it('throws an error if response has isSuccess === false', async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: {
                    isSuccess: false,
                    message: 'Internal server error',
                },
            });

            await expect(getEmployeeCreatedTasks(mockEmployeeId)).rejects.toThrow(
                'Internal server error'
            );
        });
    });

    // ─── 5. mapPaginatedTasksResponse Normalization Tests ─────────────────────

    describe('mapPaginatedTasksResponse', () => {
        it('handles null/undefined input safely', () => {
            const mapped = mapPaginatedTasksResponse(null, 2, 20);

            expect(mapped.items).toEqual([]);
            expect(mapped.totalCount).toBe(0);
            expect(mapped.pageNumber).toBe(2);
            expect(mapped.pageSize).toBe(20);
            expect(mapped.totalPages).toBe(0);
            expect(mapped.hasPreviousPage).toBe(false);
            expect(mapped.hasNextPage).toBe(false);
        });

        it('normalizes direct array of items', () => {
            const rawArray = [mockTaskItems[0]];
            const mapped = mapPaginatedTasksResponse(rawArray, 1, 10);

            expect(mapped.items).toEqual(rawArray);
            expect(mapped.totalCount).toBe(1);
            expect(mapped.totalPages).toBe(1);
            expect(mapped.hasPreviousPage).toBe(false);
            expect(mapped.hasNextPage).toBe(false);
        });

        it('calculates totalPages, hasPreviousPage, and hasNextPage when not provided by backend', () => {
            const raw = {
                items: mockTaskItems,
                totalCount: 35,
                pageNumber: 2,
                pageSize: 10,
            };

            const mapped = mapPaginatedTasksResponse(raw);

            expect(mapped.totalPages).toBe(4); // ceil(35/10) = 4
            expect(mapped.hasPreviousPage).toBe(true); // page 2 > 1
            expect(mapped.hasNextPage).toBe(true); // page 2 < 4
        });

        it('preserves server summary counts', () => {
            const raw = {
                items: mockTaskItems,
                totalCount: 20,
                activeCount: 15,
                inProgressCount: 5,
                completedCount: 10,
                overdueCount: 2,
                cancelledCount: 1,
                onHoldCount: 2,
            };

            const mapped = mapPaginatedTasksResponse(raw, 1, 10);

            expect(mapped.activeCount).toBe(15);
            expect(mapped.inProgressCount).toBe(5);
            expect(mapped.completedCount).toBe(10);
            expect(mapped.overdueCount).toBe(2);
            expect(mapped.cancelledCount).toBe(1);
            expect(mapped.onHoldCount).toBe(2);
        });
    });

    // ─── 6. Service Export Object Tests ───────────────────────────────────────

    describe('employeeDashboardService object binding', () => {
        it('exports bound methods and utilities on the employeeDashboardService object', () => {
            expect(typeof employeeDashboardService.getEmployeeDashboard).toBe('function');
            expect(typeof employeeDashboardService.getEmployeeAssignedTasks).toBe('function');
            expect(typeof employeeDashboardService.getEmployeeCreatedTasks).toBe('function');
            expect(typeof employeeDashboardService.buildTaskQueryString).toBe('function');
            expect(typeof employeeDashboardService.mapPaginatedTasksResponse).toBe('function');
        });
    });
});
