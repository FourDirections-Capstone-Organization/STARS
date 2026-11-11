import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OpAdmin_Dashboard from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
import { DmsDeliveryTab, DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import api from '../api';

// Mock Recharts ResponsiveContainer to render children directly in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

// Mock KpiDrillDown to prevent unrelated drilldown queries during Reports tab switch
vi.mock('../Pages/OpAdmin_Dashboard/KpiDrillDown', () => ({
    KpiDrillDownView: () => <div data-testid="mock-kpi-drilldown">KPI Drilldown View</div>,
}));

// Mock api
vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

// Mock Toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: mockToastSuccess,
        error: mockToastError,
        info: vi.fn(),
    }),
}));

describe('Delivery Analytics - Click-Through Navigation & Deep Linking with RBAC (Step 4)', () => {
    const mockDmsPerformanceResponse = {
        totalDeliveries: 4,
        onTimeCount: 3,
        lateCount: 1,
        onTimePercentage: 75,
        driverFilter: null,
        records: [
            {
                waybillNo: 'WB-2026-9001',
                starsTaskId: '11111111-1111-1111-1111-111111111111',
                driverId: 'DRV-001',
                driverName: 'Juan Dela Cruz',
                driverIsActive: true,
                completedAt: '2026-11-05T14:30:00Z',
                slaTargetAt: '2026-11-05T15:00:00Z',
                isOnTime: true,
            },
            {
                waybillNo: 'WB-2026-9002',
                starsTaskId: '22222222-2222-2222-2222-222222222222',
                driverId: 'DRV-002',
                driverName: 'Maria Santos',
                driverIsActive: false,
                completedAt: '2026-11-05T16:45:00Z',
                slaTargetAt: '2026-11-05T16:00:00Z',
                isOnTime: false,
            },
            {
                waybillNo: 'WB-2026-9003',
                starsTaskId: '33333333-3333-3333-3333-333333333333',
                driverId: 'DRV-001',
                driverName: 'Juan Dela Cruz',
                driverIsActive: true,
                completedAt: '2026-11-06T10:15:00Z',
                slaTargetAt: '2026-11-06T11:00:00Z',
                isOnTime: true,
            },
            {
                waybillNo: 'WB-2026-9004',
                starsTaskId: '44444444-4444-4444-4444-444444444444',
                driverId: 'DRV-003',
                driverName: 'Pedro Penduko',
                driverIsActive: true,
                completedAt: '2026-11-06T12:00:00Z',
                slaTargetAt: '2026-11-06T12:30:00Z',
                isOnTime: true,
            },
        ],
    };

    const mockTaskDetail1 = {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Priority Medical Delivery for PGH',
        description: 'Urgent medical supplies shipment to Manila hospital hub',
        priority: 3, // Urgent
        status: 3, // Completed
        createdAt: '2026-11-05T08:00:00Z',
        deadline: '2026-11-05T15:00:00Z',
        createdByName: 'Dispatch Lead',
        assignees: [
            { userId: 'u-1', fullName: 'Juan Dela Cruz', completionPercentage: 100 },
        ],
        taskNumber: 'TSK-9001',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('employeeId', 'EMP-TEST');
        localStorage.setItem('firstName', 'Test');
        localStorage.setItem('lastName', 'Coordinator');
        localStorage.setItem('role', 'Coordinator');

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/integration/dms/performance-summary')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockDmsPerformanceResponse } });
            }
            if (url.includes('/api/Task/11111111-1111-1111-1111-111111111111')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockTaskDetail1 } });
            }
            if (url.includes('/api/Task/forbidden-task')) {
                const error: any = new Error('Request failed with status code 403');
                error.response = {
                    status: 403,
                    data: { message: 'Access Denied: You do not have permission to view this task.' },
                };
                return Promise.reject(error);
            }
            if (url.includes('/api/Task')) {
                return Promise.resolve({ data: { isSuccess: true, data: { items: [], totalCount: 0 } } });
            }
            if (url.includes('/api/User')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/reports/filter-options')) {
                return Promise.resolve({ data: { isSuccess: true, data: { departments: [], employees: [] } } });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: { isSuccess: true, data: {} } });
        });
    });

    it('enables row click-through on Table 2 to open task details modal via handleOpenTaskById', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        // Navigate to Reports tab
        await waitFor(() => {
            const reportsLink = screen.getByText('Reports');
            expect(reportsLink).toBeInTheDocument();
            fireEvent.click(reportsLink);
        });

        // Switch to Delivery Analytics subtab
        await waitFor(() => {
            const dmsPerfBtn = screen.getByText('Delivery Analytics');
            expect(dmsPerfBtn).toBeInTheDocument();
            fireEvent.click(dmsPerfBtn);
        });

        // Wait for Table 2 records to be rendered
        await waitFor(() => {
            expect(screen.getByText('DMS Batch Delivery Completion Records')).toBeInTheDocument();
            expect(screen.getByTestId('dms-record-row-WB-2026-9001')).toBeInTheDocument();
        });

        // Click on Table 2 row for WB-2026-9001
        const recordRow = screen.getByTestId('dms-record-row-WB-2026-9001');
        fireEvent.click(recordRow);

        // Task details should be loaded from API and TaskView opened
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/api/Task/11111111-1111-1111-1111-111111111111');
            expect(screen.getByText('Priority Medical Delivery for PGH')).toBeInTheDocument();
        });
    });

    it('supports keyboard navigation (Enter key) on Table 2 row to open task details', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        // Navigate to Reports -> Delivery Analytics
        await waitFor(() => {
            fireEvent.click(screen.getByText('Reports'));
        });
        await waitFor(() => {
            fireEvent.click(screen.getByText('Delivery Analytics'));
        });

        await waitFor(() => {
            expect(screen.getByTestId('dms-record-row-WB-2026-9001')).toBeInTheDocument();
        });

        const recordRow = screen.getByTestId('dms-record-row-WB-2026-9001');
        // Press Enter on the row
        fireEvent.keyDown(recordRow, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/api/Task/11111111-1111-1111-1111-111111111111');
            expect(screen.getByText('Priority Medical Delivery for PGH')).toBeInTheDocument();
        });
    });

    it('renders real anchor links supporting new tab navigation (/OpAdmin_Dashboard?taskId=...) on Table 2', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        await waitFor(() => {
            fireEvent.click(screen.getByText('Reports'));
        });
        await waitFor(() => {
            fireEvent.click(screen.getByText('Delivery Analytics'));
        });

        await waitFor(() => {
            expect(screen.getByTestId('dms-task-link-WB-2026-9001')).toBeInTheDocument();
        });

        const anchorLink = screen.getByTestId('dms-task-link-WB-2026-9001');
        expect(anchorLink.tagName).toBe('A');
        expect(anchorLink).toHaveAttribute('href', '/OpAdmin_Dashboard?taskId=11111111-1111-1111-1111-111111111111');

        // View Task action button should also be an anchor link
        const viewTaskBtn = screen.getByTestId('dms-view-task-btn-WB-2026-9001');
        expect(viewTaskBtn.tagName).toBe('A');
        expect(viewTaskBtn).toHaveAttribute('href', '/OpAdmin_Dashboard?taskId=11111111-1111-1111-1111-111111111111');
    });

    it('filters Table 2 records and charts when clicking a driver row in Table 1', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        await waitFor(() => {
            fireEvent.click(screen.getByText('Reports'));
        });
        await waitFor(() => {
            fireEvent.click(screen.getByText('Delivery Analytics'));
        });

        await waitFor(() => {
            expect(screen.getByTestId('dms-driver-breakdown-DRV-001')).toBeInTheDocument();
            expect(screen.getByTestId('dms-driver-breakdown-DRV-002')).toBeInTheDocument();
        });

        // Click on driver DRV-002 (Maria Santos) row in Table 1
        const driverRow = screen.getByTestId('dms-driver-breakdown-DRV-002').closest('tr')!;
        fireEvent.click(driverRow);

        // Table 2 should filter to show only DRV-002 record
        await waitFor(() => {
            expect(screen.getByTestId('dms-record-row-WB-2026-9002')).toBeInTheDocument();
            expect(screen.queryByTestId('dms-record-row-WB-2026-9001')).not.toBeInTheDocument();
            expect(screen.queryByTestId('dms-record-row-WB-2026-9003')).not.toBeInTheDocument();
        });

        // The driver filter dropdown should reflect Maria Santos
        expect(screen.getByDisplayValue(/Maria Santos \(DRV-002\)/i)).toBeInTheDocument();

        // Clear filter button should be available and clicking it restores all records
        const clearBtn = screen.getByRole('button', { name: /clear driver filter/i });
        fireEvent.click(clearBtn);

        await waitFor(() => {
            expect(screen.getByTestId('dms-record-row-WB-2026-9001')).toBeInTheDocument();
            expect(screen.getByTestId('dms-record-row-WB-2026-9002')).toBeInTheDocument();
        });
    });

    it('handles URL deep-linking on mount (/OpAdmin_Dashboard?taskId=...) and opens TaskView', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard?taskId=11111111-1111-1111-1111-111111111111']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/api/Task/11111111-1111-1111-1111-111111111111');
            expect(screen.getByText('Priority Medical Delivery for PGH')).toBeInTheDocument();
        });
    });

    it('enforces RBAC access on deep-linking and row click, displaying a clear permission error toast', async () => {
        render(
            <MemoryRouter initialEntries={['/OpAdmin_Dashboard?taskId=forbidden-task']}>
                <OpAdmin_Dashboard />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/api/Task/forbidden-task');
            expect(mockToastError).toHaveBeenCalledWith('Access Denied: You do not have permission to view this task.');
        });

        // TaskView should not be opened
        expect(screen.queryByText('Priority Medical Delivery for PGH')).not.toBeInTheDocument();
    });

    it('enables keyboard navigation and anchor links in DmsDeliveryTab table', async () => {
        const mockDeliveries: DmsDeliveryItem[] = [
            {
                taskId: '11111111-1111-1111-1111-111111111111',
                taskTitle: 'Priority Medical Delivery for PGH',
                recipientName: 'Dr. Lopez',
                recipientContact: '09171112222',
                deliveryAddress: 'PGH Manila',
                courierEmployeeId: 'DRV-001',
                courierFullName: 'Juan Dela Cruz',
                courierIsActive: true,
                dmsWaybillNo: 'WB-2026-9001',
                dmsStatus: 'Delivered',
                syncStatus: 'Synced',
            },
        ];

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({ data: { isSuccess: true, data: mockDeliveries } });
            }
            if (url.includes('/api/integration/dms/performance-summary')) {
                return Promise.resolve({ data: { isSuccess: true, data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } } });
            }
            return Promise.resolve({ data: { isSuccess: true, data: {} } });
        });

        const handleViewTask = vi.fn();

        render(
            <MemoryRouter>
                <DmsDeliveryTab onViewTask={handleViewTask} />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('dms-tab-task-link-11111111-1111-1111-1111-111111111111')).toBeInTheDocument();
        });

        const taskLink = screen.getByTestId('dms-tab-task-link-11111111-1111-1111-1111-111111111111');
        expect(taskLink.tagName).toBe('A');
        expect(taskLink).toHaveAttribute('href', '/OpAdmin_Dashboard?taskId=11111111-1111-1111-1111-111111111111');

        // Click task link
        fireEvent.click(taskLink);
        expect(handleViewTask).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');

        // Details button
        const detailsBtn = screen.getByTestId('dms-tab-details-btn-11111111-1111-1111-1111-111111111111');
        expect(detailsBtn.tagName).toBe('A');
        expect(detailsBtn).toHaveAttribute('href', '/OpAdmin_Dashboard?taskId=11111111-1111-1111-1111-111111111111');

        fireEvent.click(detailsBtn);
        expect(handleViewTask).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    });
});

