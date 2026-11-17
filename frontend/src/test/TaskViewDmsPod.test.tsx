import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, {
    TaskViewTask,
    formatDriverDisplay,
    isImageFile,
    isPdfFile,
    formatFileSize,
} from '../components/TaskView/TaskView';
import { DmsDeliveryTab, DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import { formatDriverDisplay as formatDriverDisplayShared } from '../utils/driverUtils';
import api from '../api';

// Mock Recharts ResponsiveContainer to render children directly in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

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

describe('TaskView & DmsDeliveryTab - Defect 58 Specification Tests', () => {
    const mockTask: TaskViewTask = {
        taskId: 'task-dms-01',
        taskTitle: 'Deliver Electronics to Northern Hub',
        taskDescription: 'Urgent delivery of critical networking components.',
        priority: 'High',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        taskStatus: 'In Progress',
        assignedEmployee: 'Jane Coordinator',
        createdByEmployee: 'Admin',
        assignedTo: 'user-coord-01',
        createdAt: new Date().toISOString(),
        taskNumber: 'TSK-9481',
        taskReferenceNumber: 'WB-2026-449612',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('authToken', 'test-token');

        if (!globalThis.URL.createObjectURL) {
            globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        }
        if (!globalThis.URL.revokeObjectURL) {
            globalThis.URL.revokeObjectURL = vi.fn();
        }
    });

    describe('formatDriverDisplay helper', () => {
        it('formats full name with name-only layout', () => {
            const res = formatDriverDisplay('Juan Dela Cruz', 'DRV-001', true, { layout: 'name-only' });
            expect(res.displayText).toBe('Juan Dela Cruz');
            expect(res.isInactive).toBe(false);
        });

        it('supports id-first and name-first layouts', () => {
            const idFirst = formatDriverDisplay('Juan Dela Cruz', 'DRV-001', true, { layout: 'id-first' });
            expect(idFirst.displayText).toBe('DRV-001 · Juan Dela Cruz');
            expect(idFirst.isInactive).toBe(false);

            const nameFirst = formatDriverDisplay('Juan Dela Cruz', 'DRV-001', true, { layout: 'name-first' });
            expect(nameFirst.displayText).toBe('Juan Dela Cruz (DRV-001)');
            expect(nameFirst.isInactive).toBe(false);
        });

        it('flags inactive driver when isActive is false', () => {
            const res = formatDriverDisplay('Maria Santos', 'DRV-002', false, { layout: 'name-only' });
            expect(res.displayText).toBe('Maria Santos');
            expect(res.isInactive).toBe(true);
        });

        it('returns Unassigned when employeeId is missing and fullName is absent or Unassigned', () => {
            expect(formatDriverDisplay(null, null, null, { layout: 'name-only' }).displayText).toBe('Unassigned');
            expect(formatDriverDisplay('Unassigned', null, null, { layout: 'name-only' }).displayText).toBe('Unassigned');
            expect(formatDriverDisplay(null, '', null, { layout: 'name-only' }).displayText).toBe('Unassigned');
        });

        it('returns employeeId fallback when fullName is absent', () => {
            expect(formatDriverDisplay(null, 'DRV-999', null, { layout: 'name-only' }).displayText).toBe('DRV-999');
        });
    });

    describe('file type detection helpers', () => {
        it('identifies image files correctly', () => {
            expect(isImageFile('photo.jpg')).toBe(true);
            expect(isImageFile('receipt.PNG')).toBe(true);
            expect(isImageFile('doc.pdf')).toBe(false);
        });

        it('identifies PDF files correctly', () => {
            expect(isPdfFile('document.pdf')).toBe(true);
            expect(isPdfFile(null, '.pdf')).toBe(true);
            expect(isPdfFile('photo.png')).toBe(false);
        });

        it('formats file sizes accurately', () => {
            expect(formatFileSize(500)).toBe('500 B');
            expect(formatFileSize(2048)).toBe('2.0 KB');
            expect(formatFileSize(1572864)).toBe('1.50 MB');
            expect(formatFileSize(0)).toBe('—');
        });
    });

    describe('TaskView Defect 58 Requirements', () => {
        it('renders Live Delivery Tracker button and does NOT render POD section', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/delivery-details')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                recipientName: 'Acme Logistics',
                                recipientContact: '09123456789',
                                deliveryAddress: '123 Harbor Rd',
                                dmsWaybillNo: 'WB-2026-449612',
                                dmsStatus: 'Out for Delivery',
                                syncStatus: 'Synced',
                                courierEmployeeId: 'DRV-001',
                                courierFullName: 'Juan Dela Cruz',
                                courierIsActive: true,
                                taskType: 'Express Delivery',
                                packageType: 'Parcel Box',
                                weight: '2.5 kg',
                                itemCount: 3,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            const onNavigateMock = vi.fn();
            render(<TaskView task={mockTask} onNavigateToDmsTracker={onNavigateMock} />);

            await waitFor(() => {
                // Assert POD section is completely removed from TaskView
                expect(screen.queryByTestId('tv-pod-section')).not.toBeInTheDocument();
                expect(screen.queryByTestId('tv-pod-card')).not.toBeInTheDocument();

                // Assert Live Delivery Tracker button is present
                const trackerBtn = screen.getByTestId('tv-dms-tracker-btn');
                expect(trackerBtn).toBeInTheDocument();
                expect(trackerBtn).toHaveTextContent('Live Delivery Tracker');
            });

            // Clicking tracker button triggers navigation callback
            const trackerBtn = screen.getByTestId('tv-dms-tracker-btn');
            fireEvent.click(trackerBtn);
            expect(onNavigateMock).toHaveBeenCalledWith('WB-2026-449612', mockTask.taskId);
        });

        it('renders courier full name with layout: name-only in TaskView', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/delivery-details')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                recipientName: 'Acme Logistics',
                                deliveryAddress: '123 Harbor Rd',
                                dmsWaybillNo: 'WB-2026-449612',
                                dmsStatus: 'Out for Delivery',
                                courierEmployeeId: 'DRV-001',
                                courierFullName: 'Juan Dela Cruz',
                                courierIsActive: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const driverElement = screen.getByTestId('tv-dms-assigned-driver');
                expect(driverElement).toBeInTheDocument();
                expect(driverElement).toHaveTextContent('Juan Dela Cruz');
                expect(screen.queryByText('[Inactive]')).not.toBeInTheDocument();
            });
        });

        it('surfaces the 4 DMS logistics fields in TaskView', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/delivery-details')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                recipientName: 'Acme Logistics',
                                deliveryAddress: '123 Harbor Rd',
                                dmsWaybillNo: 'WB-2026-449612',
                                dmsStatus: 'In Transit',
                                taskType: 'Medical Express',
                                packageType: 'Cold Storage Box',
                                weight: '5.2 kg',
                                itemCount: 4,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByTestId('tv-dms-task-type')).toHaveTextContent('Medical Express');
                expect(screen.getByTestId('tv-dms-package-type')).toHaveTextContent('Cold Storage Box');
                expect(screen.getByTestId('tv-dms-weight')).toHaveTextContent('5.2 kg');
                expect(screen.getByTestId('tv-dms-item-count')).toHaveTextContent('4 item(s)');
            });
        });
    });

    describe('DmsDeliveryTab Dedicated POD Card & Preview Modal', () => {
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
                taskType: 'Express Delivery',
                packageType: 'Insulated Box',
                weight: '1.8 kg',
                itemCount: 2,
                podUrl: 'https://dms.example/pod/WB-2026-1001.jpg',
                podUploadedAt: '2026-11-01T10:30:00Z',
            },
        ];

        it('renders dedicated POD card and 4 logistics fields in DmsDeliveryTab drawer', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: mockDeliveries } };
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { isSuccess: true, data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } } };
                }
                if (url.includes('/api/dms-integration/tasks/task-101/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: 'task-101',
                                waybillNo: 'WB-2026-1001',
                                fileName: 'POD_WB-2026-1001.jpg',
                                contentType: 'image/jpeg',
                                fileSize: 245760,
                                uploadedAt: '2026-11-01T10:30:00Z',
                                uploadedByName: 'Juan Dela Cruz',
                                fileUrl: 'https://dms.example/pod/WB-2026-1001.jpg',
                                downloadUrl: '/api/dms-integration/tasks/task-101/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} initialWaybillNo="WB-2026-1001" />);

            await waitFor(() => {
                expect(screen.getByTestId('dms-pod-card')).toBeInTheDocument();
            });

            // Assert 4 logistics fields are surfaced in the drawer
            expect(screen.getByTestId('dms-detail-task-type')).toHaveTextContent('Express Delivery');
            expect(screen.getByTestId('dms-detail-package-type')).toHaveTextContent('Insulated Box');
            expect(screen.getByTestId('dms-detail-weight')).toHaveTextContent('1.8 kg');
            expect(screen.getByTestId('dms-detail-item-count')).toHaveTextContent('2 item(s)');

            // Assert POD card metadata and download button
            expect(screen.getByTestId('dms-pod-content')).toBeInTheDocument();
            expect(screen.getAllByText('POD_WB-2026-1001.jpg').length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText('240.0 KB')).toBeInTheDocument();
            expect(screen.getByTestId('dms-pod-download-btn')).toBeInTheDocument();

            // Open POD full preview modal
            const viewBtn = await screen.findByTestId('dms-pod-view-btn');
            fireEvent.click(viewBtn);

            await waitFor(() => {
                expect(screen.getByTestId('dms-pod-preview-modal')).toBeInTheDocument();
            });
            expect(screen.getByText(/Proof of Delivery —/i)).toBeInTheDocument();

            // Close modal
            const closeBtn = screen.getByTestId('dms-pod-modal-close-btn');
            fireEvent.click(closeBtn);
            await waitFor(() => {
                expect(screen.queryByTestId('dms-pod-preview-modal')).not.toBeInTheDocument();
            });
        });

        it('retains delivered orders in stats and filter', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: mockDeliveries } };
                }
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { isSuccess: true, data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
            });

            // Switch to Delivered tab filter
            const deliveredFilterBtn = screen.getByRole('button', { name: /Delivered/i });
            fireEvent.click(deliveredFilterBtn);

            // Assert the delivered shipment is still visible in the table
            expect(screen.getByText('WB-2026-1001')).toBeInTheDocument();
            expect(screen.getByText('Dr. Sarah Lopez')).toBeInTheDocument();
        });
    });
});
