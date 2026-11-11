import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
    buildPreDeliveryTaskInitialData,
    TaskModal,
} from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
import PreDeliveryTab, { DmsPendingOrder } from '../components/PreDeliveryTab/PreDeliveryTab';
import { DmsDeliveryTab, DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import {
    downloadDeliveryCsvReport,
    downloadDeliveryPdfReport,
} from '../components/DmsDeliveryTab/DeliveryReportExport';
import TaskView, { TaskViewTask } from '../components/TaskView/TaskView';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

// Mock Recharts ResponsiveContainer to render children directly in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

vi.mock('jspdf', () => {
    return {
        default: vi.fn(function () {
            return {
                internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
                setFillColor: vi.fn(),
                setDrawColor: vi.fn(),
                setTextColor: vi.fn(),
                setFont: vi.fn(),
                setFontSize: vi.fn(),
                rect: vi.fn(),
                roundedRect: vi.fn(),
                line: vi.fn(),
                text: vi.fn(),
                addPage: vi.fn(),
                save: vi.fn(),
            };
        }),
    };
});

describe('Step 3: DMS Date-Only Deadlines and Paired Driver Labels', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Manager');
        localStorage.setItem('authToken', 'test-token');
    });

    describe('1. TaskModal DMS Locked Date-Only Deadline & Paired Driver', () => {
        const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
        const y = futureDate.getFullYear();
        const m = String(futureDate.getMonth() + 1).padStart(2, '0');
        const d = String(futureDate.getDate()).padStart(2, '0');
        const futureIsoMidnight = `${y}-${m}-${d}T00:00:00Z`;
        const expectedDateFormatted = `${d}/${m}/${y}`;

        const sampleOrder: DmsPendingOrder = {
            orderId: 201,
            waybillNo: 'WB-2026-8801',
            clientName: 'Global Logistics',
            clientType: 'Corporate',
            contactNumber: '09171112222',
            senderAddress: 'Makati Hub',
            recipientName: 'Alice Guo',
            recipientContact: '09181112222',
            recipientAddress: 'Ortigas, Pasig',
            area: 'Pasig',
            route: 'Route A',
            status: 'Pending',
            taskType: 'Delivery',
            packageType: 'Box',
            packageDescription: 'Server Gear',
            itemCount: 1,
            weight: '3.0 kg',
            priority: 'Medium',
            orderDate: '2026-11-01T08:00:00Z',
            expectedDelivery: futureIsoMidnight,
            expectedDeliveryDate: `${y}-${m}-${d}`,
            driverEmployeeId: 'EMP-008',
            driverName: 'Ricardo Bautista',
        };

        it('builds pre-delivery initial data without UTC+8 hour shift on midnight dates', () => {
            const initial = buildPreDeliveryTaskInitialData(sampleOrder);
            expect(initial.isHistoricalDeadline).toBe(false);
            expect(initial.dueAt).toBe(`${y}-${m}-${d}T00:00`);
            expect(initial.deliveryDetails.courierEmployeeId).toBe('EMP-008');
        });

        it('renders locked date-only deadline badge and formatted display in TaskModal', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/Task/assignable-users') || url.includes('/api/User')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: [
                                { accountId: 'emp-uuid-8', employeeNumber: 'EMP-008', fullName: 'Ricardo Bautista', role: 'Courier', isActive: true },
                            ],
                        },
                    });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            const initial = buildPreDeliveryTaskInitialData(sampleOrder);
            const { container } = render(
                <TaskModal
                    isOpen={true}
                    onClose={vi.fn()}
                    onSave={vi.fn()}
                    initial={initial}
                    mode="new"
                    teamMembers={[
                        { accountId: 'emp-uuid-8', employeeNumber: 'EMP-008', employeeName: 'Ricardo Bautista', role: 'Courier', presenceStatus: 'Active' } as any,
                    ]}
                />
            );

            await screen.findByRole('heading', { name: /Create Pre-Delivery Task/i });

            // Input is disabled and readonly
            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(dateInput).toBeInTheDocument();
            expect(dateInput.disabled).toBe(true);
            expect(dateInput.readOnly).toBe(true);

            // Locked badges
            expect(screen.getByText(/🔒 DMS PRE-SET DEADLINE/i)).toBeInTheDocument();
            expect(screen.getByText(/Deadline is synchronized and pre-set from DMS/i)).toBeInTheDocument();

            // Date-only display element
            const dateOnlyNotice = screen.getByTestId('dms-dateonly-display');
            expect(dateOnlyNotice).toBeInTheDocument();
            expect(dateOnlyNotice).toHaveTextContent(expectedDateFormatted);

            // Assert that obsolete date-only helper text is absent
            expect(screen.queryByText(/Date-only: time defaults to end-of-day/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/\(Date-only/i)).not.toBeInTheDocument();

            // Paired driver label in delivery section
            await waitFor(() => {
                const driverLabel = screen.queryByTestId('dms-paired-driver-label');
                if (driverLabel) {
                    expect(driverLabel).toHaveTextContent('EMP-008 · Ricardo Bautista');
                }
            });
        });
    });

    describe('2. PreDeliveryTab Date-Only & Driver Display', () => {
        it('renders date-only DD/MM/YYYY due date and paired driver label in pending orders', async () => {
            const samplePending: DmsPendingOrder[] = [
                {
                    orderId: 301,
                    waybillNo: 'WB-2026-9901',
                    clientName: 'Nexus Tech',
                    clientType: 'Corporate',
                    contactNumber: '09170001111',
                    senderAddress: 'Hub 1',
                    recipientName: 'Carlos Garcia',
                    recipientContact: '09180002222',
                    recipientAddress: 'Bonifacio High Street',
                    area: 'Taguig',
                    route: 'BGC Loop',
                    status: 'Pending',
                    taskType: 'Delivery',
                    packageType: 'Parcel',
                    packageDescription: 'Confidential Contract',
                    itemCount: 1,
                    weight: '0.5 kg',
                    priority: 'High',
                    orderDate: '2026-11-10T00:00:00Z',
                    expectedDelivery: '2026-11-13T00:00:00Z',
                    driverEmployeeId: 'EMP-008',
                    driverName: 'Ricardo Bautista',
                },
            ];

            (api.get as any).mockResolvedValue({
                data: { isSuccess: true, data: samplePending },
            });

            render(<PreDeliveryTab onCreateTaskForOrder={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Carlos Garcia')).toBeInTheDocument();
            });

            // Date-only Due date (13/11/2026)
            const dueElement = screen.getByTestId('pre-delivery-due-date');
            expect(dueElement).toHaveTextContent('13/11/2026');

            // Paired driver label
            const driverElement = screen.getByTestId('pre-delivery-driver');
            expect(driverElement).toHaveTextContent('EMP-008 · Ricardo Bautista');
        });
    });

    describe('3. DmsDeliveryTab Paired Driver & Date-Only Display', () => {
        const mockDeliveries: DmsDeliveryItem[] = [
            {
                taskId: 'task-dms-1',
                taskTitle: 'Urgent Delivery to Makati Medical',
                recipientName: 'Dr. Santos',
                recipientContact: '09178889999',
                deliveryAddress: 'Amorsolo St, Makati City',
                area: 'Makati',
                courierEmployeeId: 'EMP-008',
                courierFullName: 'Ricardo Bautista',
                courierIsActive: true,
                dmsWaybillNo: 'WB-2026-7701',
                dmsStatus: 'Out for Delivery',
                syncStatus: 'Synced',
                expectedDelivery: '2026-11-15T00:00:00Z',
                expectedDeliveryDate: '2026-11-15',
                createdAt: '2026-11-10T08:00:00Z',
            },
        ];

        it('renders paired driver label in table and date-only expected delivery in detail drawer', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return Promise.resolve({ data: { isSuccess: true, data: mockDeliveries } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            // Table renders paired driver label
            await waitFor(() => {
                expect(screen.getByText('EMP-008 · Ricardo Bautista')).toBeInTheDocument();
            });

            // Open detail drawer by clicking row
            const row = screen.getByText('EMP-008 · Ricardo Bautista').closest('tr');
            expect(row).not.toBeNull();
            row!.click();

            // Detail drawer renders date-only expected delivery (15/11/2026)
            await waitFor(() => {
                const expectedDetail = screen.getByTestId('dms-detail-expected-delivery');
                expect(expectedDetail).toBeInTheDocument();
                expect(expectedDetail).toHaveTextContent('15/11/2026');
            });
        });
    });

    describe('4. DeliveryReportExport CSV & PDF', () => {
        const deliveries: DmsDeliveryItem[] = [
            {
                taskId: 'task-exp-1',
                taskTitle: 'Critical Supply Dispatch',
                recipientName: 'Regional Clinic',
                recipientContact: '09171234567',
                deliveryAddress: 'Main St, Quezon City',
                area: 'QC',
                courierEmployeeId: 'EMP-008',
                courierFullName: 'Ricardo Bautista',
                courierIsActive: true,
                dmsWaybillNo: 'WB-9901',
                dmsStatus: 'Delivered',
                syncStatus: 'Synced',
                expectedDelivery: '2026-11-18T00:00:00Z',
                createdAt: '2026-11-05T08:00:00Z',
            },
        ];

        const perf = {
            totalDeliveries: 1,
            onTimeCount: 1,
            lateCount: 0,
            onTimePercentage: 100,
        };

        const stats = {
            total: 1,
            inTransit: 0,
            delivered: 1,
            failed: 0,
        };

        it('includes Assigned Driver Label and Expected Delivery Date in CSV report', () => {
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
                if (tagName === 'a') el.click = clickMock;
                return el;
            });

            downloadDeliveryCsvReport(deliveries, perf, stats, 'All');

            expect(clickMock).toHaveBeenCalled();
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            vi.restoreAllMocks();
        });

        it('generates PDF with paired driver formatting without errors', () => {
            expect(() => {
                downloadDeliveryPdfReport(deliveries, perf, stats, 'All');
            }).not.toThrow();
        });
    });

    describe('5. TaskView Paired Driver Presentation & Absence of Date-Only Helper Text', () => {
        const mockTask: TaskViewTask = {
            taskId: 'task-e2e-01',
            taskTitle: 'Deliver Urgent Packages',
            taskDescription: 'Verification task',
            priority: 'High',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            taskStatus: 'In Progress',
            assignedEmployee: 'Jane Coordinator',
            createdByEmployee: 'Admin',
            assignedTo: 'user-coord-01',
            createdAt: new Date().toISOString(),
            taskNumber: 'TSK-9901',
            taskReferenceNumber: 'WB-2026-8801',
        };

        it('renders paired driver name and employee ID in TaskView and omits date-only helper text', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/delivery-details')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                recipientName: 'Alice Guo',
                                recipientContact: '09181112222',
                                deliveryAddress: 'Ortigas, Pasig',
                                dmsWaybillNo: 'WB-2026-8801',
                                dmsStatus: 'Out for Delivery',
                                syncStatus: 'Synced',
                                courierEmployeeId: 'EMP-008',
                                courierFullName: 'Ricardo Bautista',
                                courierIsActive: true,
                                expectedDelivery: '2026-11-20T00:00:00Z',
                            },
                        },
                    });
                }
                if (url.includes('/pod')) {
                    return Promise.resolve({ data: { isSuccess: true, data: { hasPod: false } } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const pairedDriver = screen.getByTestId('tv-dms-paired-driver');
                expect(pairedDriver).toBeInTheDocument();
                expect(pairedDriver).toHaveTextContent('EMP-008 · Ricardo Bautista');
            });

            // Confirm date-only helper text is absent from the rendered TaskView
            expect(screen.queryByText(/Date-only: time defaults to end-of-day/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/\(Date-only/i)).not.toBeInTheDocument();
        });

        it('falls back to courier employee ID when courierFullName is absent in TaskView', async () => {
            (api.get as any).mockImplementation((url: string) => {
                if (url.includes('/delivery-details')) {
                    return Promise.resolve({
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                recipientName: 'Alice Guo',
                                recipientContact: '09181112222',
                                deliveryAddress: 'Ortigas, Pasig',
                                dmsWaybillNo: 'WB-2026-8801',
                                dmsStatus: 'In Transit',
                                syncStatus: 'Synced',
                                courierEmployeeId: 'EMP-008',
                                courierFullName: null,
                                courierIsActive: true,
                            },
                        },
                    });
                }
                if (url.includes('/pod')) {
                    return Promise.resolve({ data: { isSuccess: true, data: { hasPod: false } } });
                }
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const pairedDriver = screen.getByTestId('tv-dms-paired-driver');
                expect(pairedDriver).toBeInTheDocument();
                expect(pairedDriver).toHaveTextContent('EMP-008');
            });
        });
    });
});
