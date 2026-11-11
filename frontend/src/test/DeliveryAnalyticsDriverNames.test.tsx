import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DmsDeliveryTab, DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import DeliveryAnalyticsCharts from '../components/DmsDeliveryTab/DeliveryAnalyticsCharts';
import {
    downloadDeliveryCsvReport,
    PerformanceSummary,
    DeliveryStats,
} from '../components/DmsDeliveryTab/DeliveryReportExport';
import OpAdmin_Dashboard from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
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

describe('Delivery Analytics - Driver Full Names, Search/Filter, Charts & CSV Export (Step 3)', () => {
    const mockDeliveries: DmsDeliveryItem[] = [
        {
            taskId: 'task-101',
            taskTitle: 'Urgent Medical Supply Dispatch',
            recipientName: 'Dr. Sarah Lopez',
            recipientContact: '09171112222',
            deliveryAddress: 'Philippine General Hospital, Manila',
            area: 'Manila',
            courierEmployeeId: 'DRV-001',
            courierFullName: 'Juan Dela Cruz',
            courierIsActive: true,
            dmsWaybillNo: 'WB-2026-1001',
            dmsStatus: 'Delivered',
            syncStatus: 'Synced',
            createdAt: '2026-11-01T08:00:00Z',
        },
        {
            taskId: 'task-102',
            taskTitle: 'Bulk Packaging Transfer',
            recipientName: 'Tech Hub Logistics',
            recipientContact: '09183334444',
            deliveryAddress: 'Bonifacio Global City, Taguig',
            area: 'Taguig / BGC',
            courierEmployeeId: 'DRV-002',
            courierFullName: 'Maria Santos',
            courierIsActive: false, // Inactive courier
            dmsWaybillNo: 'WB-2026-1002',
            dmsStatus: 'In Transit',
            syncStatus: 'Synced',
            createdAt: '2026-11-02T09:00:00Z',
        },
        {
            taskId: 'task-103',
            taskTitle: 'General Delivery Order',
            recipientName: 'Metro Dispatch',
            recipientContact: '09195556666',
            deliveryAddress: 'Ortigas Center, Pasig',
            area: 'Pasig',
            courierEmployeeId: '',
            courierFullName: undefined,
            dmsWaybillNo: 'WB-2026-1003',
            dmsStatus: 'Pending',
            syncStatus: 'Pending',
            createdAt: '2026-11-03T10:00:00Z',
        },
    ];

    const mockPerformance: PerformanceSummary = {
        totalDeliveries: 3,
        onTimeCount: 2,
        lateCount: 1,
        onTimePercentage: 66.7,
    };

    const mockStats: DeliveryStats = {
        total: 3,
        inTransit: 1,
        delivered: 1,
        failed: 0,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Manager');
        localStorage.setItem('authToken', 'test-token');
    });

    describe('1. DmsDeliveryTab Component', () => {
        it('renders driver full names alongside employee numbers in delivery list and shows [Inactive] badge', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDeliveries } });
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockPerformance } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Juan Dela Cruz (DRV-001)')).toBeInTheDocument();
            });

            expect(screen.getByText('Maria Santos (DRV-002)')).toBeInTheDocument();
            expect(screen.getByText('[Inactive]')).toBeInTheDocument();
            expect(screen.getAllByText('Auto / Pool').length).toBeGreaterThanOrEqual(1);
        });

        it('filters deliveries by driver full name in search input', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDeliveries } });
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockPerformance } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Juan Dela Cruz (DRV-001)')).toBeInTheDocument();
            });

            const searchInput = screen.getByPlaceholderText(/search by waybill/i);
            fireEvent.change(searchInput, { target: { value: 'Maria' } });

            expect(screen.getByText('Maria Santos (DRV-002)')).toBeInTheDocument();
            expect(screen.queryByText('Juan Dela Cruz (DRV-001)')).not.toBeInTheDocument();
        });

        it('displays driver full name and [Inactive] status in selected delivery detail drawer', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDeliveries } });
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockPerformance } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Maria Santos (DRV-002)')).toBeInTheDocument();
            });

            // Click the Maria Santos row to open the details drawer
            const mariaRow = screen.getByText('Maria Santos (DRV-002)').closest('tr');
            expect(mariaRow).not.toBeNull();
            fireEvent.click(mariaRow!);

            await waitFor(() => {
                expect(screen.getByText('Logistics & Carrier Operations')).toBeInTheDocument();
            });

            // Verify drawer shows Assigned Courier with full name and Inactive badge
            expect(screen.getByText('Assigned Courier')).toBeInTheDocument();
            const detailBadges = screen.getAllByText('Maria Santos (DRV-002)');
            expect(detailBadges.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('2. DeliveryAnalyticsCharts Component', () => {
        it('displays courier full name and ID in workload distribution and leader highlights', () => {
            render(
                <DeliveryAnalyticsCharts
                    deliveries={mockDeliveries}
                    performance={mockPerformance}
                    stats={mockStats}
                />
            );

            // Active Courier Leader highlight should display the top courier's full name & ID
            expect(screen.getByText(/Active Courier Leader:/i)).toBeInTheDocument();
            expect(screen.getByText('Juan Dela Cruz (DRV-001)')).toBeInTheDocument();
        });
    });

    describe('3. DeliveryReportExport CSV Generation', () => {
        it('includes Assigned Driver Name header and populated driver full names in CSV export', () => {
            let exportedContent = '';
            global.URL.createObjectURL = vi.fn((blob: Blob) => {
                const reader = new FileReader();
                reader.onload = () => {
                    exportedContent = reader.result as string;
                };
                reader.readAsText(blob);
                return 'blob:mock-url';
            });
            global.URL.revokeObjectURL = vi.fn();

            const clickMock = vi.fn();
            vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
                const el = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
                if (tagName === 'a') {
                    el.click = clickMock;
                }
                return el;
            });

            downloadDeliveryCsvReport(mockDeliveries, mockPerformance, mockStats, 'All Shipments');

            expect(clickMock).toHaveBeenCalled();
            expect(global.URL.createObjectURL).toHaveBeenCalled();

            vi.restoreAllMocks();
        });
    });

    describe('4. OpAdmin_Dashboard Delivery Performance Analytics Tab', () => {
        const mockDmsPerformanceResponse = {
            totalDeliveries: 3,
            onTimeCount: 2,
            lateCount: 1,
            onTimePercentage: 66.7,
            driverFilter: null,
            records: [
                {
                    waybillNo: 'WB-2026-9001',
                    starsTaskId: '00000000-0000-0000-0000-000000000001',
                    driverId: 'DRV-001',
                    driverName: 'Juan Dela Cruz',
                    driverIsActive: true,
                    completedAt: '2026-11-05T14:30:00Z',
                    slaTargetAt: '2026-11-05T16:00:00Z',
                    isOnTime: true,
                },
                {
                    waybillNo: 'WB-2026-9002',
                    starsTaskId: '00000000-0000-0000-0000-000000000002',
                    driverId: 'DRV-002',
                    driverName: 'Maria Santos',
                    driverIsActive: false, // Inactive
                    completedAt: '2026-11-05T18:00:00Z',
                    slaTargetAt: '2026-11-05T16:00:00Z',
                    isOnTime: false,
                },
                {
                    waybillNo: 'WB-2026-9003',
                    starsTaskId: '00000000-0000-0000-0000-000000000003',
                    driverId: '',
                    driverName: undefined,
                    driverIsActive: null,
                    completedAt: '2026-11-05T15:00:00Z',
                    slaTargetAt: '2026-11-05T16:00:00Z',
                    isOnTime: true,
                },
            ],
        };

        it('displays driver full names, [Inactive] badges, and filter options in Delivery Performance view', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDmsPerformanceResponse } });
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
                return Promise.resolve({ data: { isSuccess: true, data: {} } });
            });

            render(
                <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                    <OpAdmin_Dashboard />
                </MemoryRouter>
            );

            // Wait for sidebar and click Reports link
            await waitFor(() => {
                const reportsLink = screen.getByText('Reports');
                expect(reportsLink).toBeInTheDocument();
                fireEvent.click(reportsLink);
            });

            // Switch to Delivery Analytics sub-tab
            await waitFor(() => {
                const dmsPerfBtn = screen.getByText('Delivery Analytics');
                expect(dmsPerfBtn).toBeInTheDocument();
                fireEvent.click(dmsPerfBtn);
            });

            // Verify Table 1 header and driver full names
            await waitFor(() => {
                expect(screen.getByText('Courier / Driver SLA Compliance Breakdown')).toBeInTheDocument();
            });

            // Verify driver full names in Table 1
            expect(screen.getByTestId('dms-driver-breakdown-DRV-001')).toHaveTextContent('Juan Dela Cruz (DRV-001)');
            expect(screen.getByTestId('dms-driver-breakdown-DRV-002')).toHaveTextContent('Maria Santos (DRV-002)');

            // Verify Table 2 records contain driver full name
            expect(screen.getByTestId('dms-record-driver-WB-2026-9001')).toHaveTextContent('Juan Dela Cruz (DRV-001)');
            expect(screen.getByTestId('dms-record-driver-WB-2026-9002')).toHaveTextContent('Maria Santos (DRV-002)');
            expect(screen.getByTestId('dms-record-driver-WB-2026-9003')).toHaveTextContent('Unassigned');

            // Verify driver filter dropdown contains formatted driver names
            const filterSelect = screen.getByDisplayValue('All Drivers / Couriers');
            expect(filterSelect).toBeInTheDocument();
            expect(screen.getByRole('option', { name: /Juan Dela Cruz \(DRV-001\)/i })).toBeInTheDocument();
            expect(screen.getByRole('option', { name: /Maria Santos \(DRV-002\) \[Inactive\]/i })).toBeInTheDocument();

            // Search by driver full name
            const searchInput = screen.getByPlaceholderText(/search waybill, driver name\/id, task id\.\.\./i);
            fireEvent.change(searchInput, { target: { value: 'Maria' } });

            expect(screen.getByTestId('dms-record-driver-WB-2026-9002')).toBeInTheDocument();
            expect(screen.queryByTestId('dms-record-driver-WB-2026-9001')).not.toBeInTheDocument();
        });

        it('exports CSV with Driver Name in headers and rows', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDmsPerformanceResponse } });
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
                return Promise.resolve({ data: { isSuccess: true, data: {} } });
            });

            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();

            const clickMock = vi.fn();
            vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
                const el = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
                if (tagName === 'a') {
                    el.click = clickMock;
                }
                return el;
            });

            render(
                <MemoryRouter initialEntries={['/OpAdmin_Dashboard']}>
                    <OpAdmin_Dashboard />
                </MemoryRouter>
            );

            // Open Reports tab
            await waitFor(() => {
                const reportsLink = screen.getByText('Reports');
                expect(reportsLink).toBeInTheDocument();
                fireEvent.click(reportsLink);
            });

            // Open Delivery Analytics subtab
            await waitFor(() => {
                const dmsPerfBtn = screen.getByText('Delivery Analytics');
                expect(dmsPerfBtn).toBeInTheDocument();
                fireEvent.click(dmsPerfBtn);
            });

            // Click Export button
            await waitFor(() => {
                const exportBtn = screen.getByRole('button', { name: /export/i });
                expect(exportBtn).toBeInTheDocument();
                fireEvent.click(exportBtn);
            });

            expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('exported successfully'));
            expect(global.URL.createObjectURL).toHaveBeenCalled();

            vi.restoreAllMocks();
        });
    });

    describe('5. QA Defect Scenarios: Paired Driver Display & Midnight Date Formatting', () => {
        it('Scenario 1: formats midnight expected delivery dates as date-only DD/MM/YYYY in delivery detail views', async () => {
            const midnightDeliveries: DmsDeliveryItem[] = [
                {
                    taskId: 'task-qa-01',
                    taskTitle: 'Midnight QA Delivery',
                    recipientName: 'Test Recipient',
                    recipientContact: '09170001234',
                    deliveryAddress: '123 QA Lane, Makati',
                    area: 'Makati',
                    courierEmployeeId: 'EMP-008',
                    courierFullName: 'Ricardo Bautista',
                    courierIsActive: true,
                    dmsWaybillNo: 'WB-QA-999',
                    dmsStatus: 'Out for Delivery',
                    syncStatus: 'Synced',
                    expectedDelivery: '2026-11-25T00:00:00Z',
                    expectedDeliveryDate: '2026-11-25',
                    createdAt: '2026-11-20T08:00:00Z',
                },
            ];

            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({ data: { isSuccess: true, data: midnightDeliveries } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('EMP-008 · Ricardo Bautista')).toBeInTheDocument();
            });

            // Open detail drawer
            const row = screen.getByText('EMP-008 · Ricardo Bautista').closest('tr');
            expect(row).not.toBeNull();
            fireEvent.click(row!);

            // Verify expected delivery date formatted as date-only (25/11/2026)
            await waitFor(() => {
                const expectedDetail = screen.getByTestId('dms-detail-expected-delivery');
                expect(expectedDetail).toBeInTheDocument();
                expect(expectedDetail).toHaveTextContent('25/11/2026');
            });
        });

        it('Scenario 2: formats driver label using ID · Name pairing in delivery tables', async () => {
            const pairedDeliveries: DmsDeliveryItem[] = [
                {
                    taskId: 'task-qa-02',
                    taskTitle: 'Paired Driver QA Delivery',
                    recipientName: 'Carlos Mendoza',
                    recipientContact: '09170005678',
                    deliveryAddress: '456 Business Ave, Pasig',
                    area: 'Pasig',
                    courierEmployeeId: 'DRV-001',
                    courierFullName: 'Juan Dela Cruz',
                    courierIsActive: true,
                    dmsWaybillNo: 'WB-QA-888',
                    dmsStatus: 'In Transit',
                    syncStatus: 'Synced',
                    createdAt: '2026-11-20T08:00:00Z',
                },
            ];

            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({ data: { isSuccess: true, data: pairedDeliveries } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('DRV-001 · Juan Dela Cruz')).toBeInTheDocument();
            });
        });
    });
});

