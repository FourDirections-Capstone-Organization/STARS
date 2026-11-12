import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, { TaskViewTask, formatDriverDisplay, isImageFile, isPdfFile, formatFileSize } from '../components/TaskView/TaskView';
import { DmsDeliveryTab, DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import api from '../api';

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

describe('DMS Delivery Tracker, POD & Driver Details Defect Resolution', () => {
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
        localStorage.clear();
        localStorage.setItem('userRole', 'Coordinator');
        localStorage.setItem('authToken', 'test-token');

        // URL.createObjectURL and URL.revokeObjectURL mocks
        if (!globalThis.URL.createObjectURL) {
            globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        }
        if (!globalThis.URL.revokeObjectURL) {
            globalThis.URL.revokeObjectURL = vi.fn();
        }
    });

    describe('formatDriverDisplay helper', () => {
        it('formats full name and employee ID correctly', () => {
            const res = formatDriverDisplay('Juan Dela Cruz', 'DRV-001', true);
            expect(res.displayText).toBe('Juan Dela Cruz (DRV-001)');
            expect(res.isInactive).toBe(false);
        });

        it('flags inactive driver when isActive is false', () => {
            const res = formatDriverDisplay('Maria Santos', 'DRV-002', false);
            expect(res.displayText).toBe('Maria Santos (DRV-002)');
            expect(res.isInactive).toBe(true);
        });

        it('returns Unassigned when employeeId is missing or fullName is Unassigned', () => {
            expect(formatDriverDisplay(null, null).displayText).toBe('Unassigned');
            expect(formatDriverDisplay('Unassigned', null).displayText).toBe('Unassigned');
            expect(formatDriverDisplay(null, '').displayText).toBe('Unassigned');
        });

        it('returns employeeId when fullName is equal to employeeId or absent', () => {
            expect(formatDriverDisplay(null, 'DRV-999').displayText).toBe('DRV-999');
            expect(formatDriverDisplay('DRV-999', 'DRV-999').displayText).toBe('DRV-999');
        });
    });

    describe('file type detection helpers', () => {
        it('identifies image files correctly', () => {
            expect(isImageFile('photo.jpg')).toBe(true);
            expect(isImageFile('receipt.PNG')).toBe(true);
            expect(isImageFile('scan.webp')).toBe(true);
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
        });
    });

    describe('Driver Display and DMS Details in TaskView', () => {
        it('renders assigned driver name without employee ID prefix in main driver badge and shows DMS fields', async () => {
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
                                courierEmployeeId: 'EMP-008',
                                courierFullName: 'Ricardo Bautista',
                                courierIsActive: true,
                                taskType: 'Express Dispatch',
                                packageType: 'Secure Crate',
                                weight: '5.2 kg',
                                itemCount: 3,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const driverElement = screen.getByTestId('tv-dms-driver-name');
                expect(driverElement).toBeInTheDocument();
                // Verifies driver full name is displayed without employee ID prefix
                expect(driverElement).toHaveTextContent('Ricardo Bautista');
                expect(driverElement.textContent).not.toContain('EMP-008');

                // Verifies Task Type, Package Type, Weight, Item Count are rendered
                expect(screen.getByTestId('tv-dms-task-type')).toHaveTextContent('Express Dispatch');
                expect(screen.getByTestId('tv-dms-package-type')).toHaveTextContent('Secure Crate');
                expect(screen.getByTestId('tv-dms-weight')).toHaveTextContent('5.2 kg');
                expect(screen.getByTestId('tv-dms-item-count')).toHaveTextContent('3 items');
            });
        });

        it('renders [Inactive] badge when the assigned driver is inactive/deactivated', async () => {
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
                                dmsStatus: 'Delivered',
                                syncStatus: 'Synced',
                                courierEmployeeId: 'DRV-002',
                                courierFullName: 'Maria Santos',
                                courierIsActive: false,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const driverElement = screen.getByTestId('tv-dms-driver-name');
                expect(driverElement).toBeInTheDocument();
                expect(driverElement).toHaveTextContent('Maria Santos');
                expect(screen.getByText('[Inactive]')).toBeInTheDocument();
            });
        });
    });

    describe('Task Details - POD Removed and Live Delivery Tracker Button', () => {
        it('ensures POD section is removed from Task Details and Live Delivery Tracker button redirects', async () => {
            const handleNavigate = vi.fn();

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
                                dmsStatus: 'In Transit',
                                syncStatus: 'Synced',
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} onNavigateToDeliveryTracker={handleNavigate} />);

            await waitFor(() => {
                expect(screen.getByTestId('tv-dms-tracker-btn')).toBeInTheDocument();
            });

            // Proof of Delivery section MUST be removed from Task Details
            expect(screen.queryByTestId('tv-pod-section')).not.toBeInTheDocument();

            // Clicking Live Delivery Tracker button redirects user to the tracker page
            const trackerBtn = screen.getByTestId('tv-dms-tracker-btn');
            fireEvent.click(trackerBtn);

            expect(handleNavigate).toHaveBeenCalledWith(mockTask.taskId, 'WB-2026-449612');
        });
    });

    describe('DmsDeliveryTab - Proof of Delivery (POD) in Live Delivery Tracker', () => {
        const sampleDelivery: DmsDeliveryItem = {
            taskId: 'task-dms-01',
            taskTitle: 'Deliver Electronics to Northern Hub',
            recipientName: 'Acme Logistics',
            recipientContact: '09123456789',
            deliveryAddress: '123 Harbor Rd, Manila',
            dmsWaybillNo: 'WB-2026-449612',
            dmsOrderId: 1001,
            dmsStatus: 'In Transit',
            dmsRawStatus: 'In Transit',
            syncStatus: 'Synced',
            courierEmployeeId: 'EMP-008',
            courierFullName: 'Ricardo Bautista',
            courierIsActive: true,
            taskType: 'Express Delivery',
            packageType: 'Electronic Box',
            weight: '4.8 kg',
            itemCount: 2,
        };

        it('renders POD empty state in DmsDeliveryTab when no POD is uploaded yet', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } };
                }
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [sampleDelivery] } };
                }
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: { hasPod: false } } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} initialTaskId="task-dms-01" />);

            await waitFor(() => {
                expect(screen.getByTestId('dms-pod-card')).toBeInTheDocument();
                expect(screen.getByText('No Proof of Delivery (POD) Uploaded Yet')).toBeInTheDocument();
            });
        });

        it('renders POD attachment with thumbnail, metadata, and opens preview modal in DmsDeliveryTab', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } };
                }
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [sampleDelivery] } };
                }
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: 'task-dms-01',
                                waybillNo: 'WB-2026-449612',
                                fileName: 'POD_WB-2026-449612.jpg',
                                fileType: '.jpg',
                                fileSize: 245760,
                                uploadedAt: '2026-11-06T14:30:00Z',
                                uploadedByName: 'Ricardo Bautista',
                                podUrl: 'https://stars.blob.core.windows.net/pod/WB-2026-449612.jpg',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} initialTaskId="task-dms-01" />);

            await waitFor(() => {
                expect(screen.getByTestId('dms-pod-card')).toBeInTheDocument();
                expect(screen.getByText('POD_WB-2026-449612.jpg')).toBeInTheDocument();
                expect(screen.getByText('Download POD')).toBeInTheDocument();
            });

            // Click to open preview modal
            const thumb = screen.getByTitle('Click to preview full Proof of Delivery');
            fireEvent.click(thumb);

            expect(screen.getByTestId('dms-pod-preview-modal')).toBeInTheDocument();
            expect(screen.getByAltText('Proof of Delivery Full Preview')).toBeInTheDocument();
        });

        it('displays driver name without employee ID and shows Task Type, Weight, Item Count, Package Type', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } };
                }
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [sampleDelivery] } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} initialTaskId="task-dms-01" />);

            await waitFor(() => {
                // Driver name only (no employee ID prefix)
                expect(screen.getByText('Ricardo Bautista')).toBeInTheDocument();
                // DMS fields
                expect(screen.getByTestId('dms-detail-task-type')).toHaveTextContent('Express Delivery');
                expect(screen.getByTestId('dms-detail-package-type')).toHaveTextContent('Electronic Box');
                expect(screen.getByTestId('dms-detail-weight')).toHaveTextContent('4.8 kg');
                expect(screen.getByTestId('dms-detail-item-count')).toHaveTextContent('2');
            });
        });

        it('retains delivered orders in Delivered tab when delivery status is set to DELIVERED without disappearing', async () => {
            const deliveredItem: DmsDeliveryItem = {
                ...sampleDelivery,
                dmsStatus: 'DELIVERED',
                dmsRawStatus: 'DELIVERED',
            };

            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/api/integration/dms/performance-summary')) {
                    return { data: { totalDeliveries: 1, onTimeCount: 1, lateCount: 0, onTimePercentage: 100 } };
                }
                if (url.includes('/api/dms-integration/deliveries')) {
                    return { data: { isSuccess: true, data: [deliveredItem] } };
                }
                return { data: { isSuccess: true, data: [] } };
            });

            render(<DmsDeliveryTab onViewTask={vi.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Acme Logistics')).toBeInTheDocument();
            });

            // Click "Delivered" filter pill
            const deliveredPill = screen.getByRole('button', { name: /Delivered/i });
            fireEvent.click(deliveredPill);

            // Order must NOT disappear, but remain visible in Delivered view
            expect(screen.getByText('Acme Logistics')).toBeInTheDocument();
            expect(screen.getByText('WB-2026-449612')).toBeInTheDocument();
        });
    });
});
