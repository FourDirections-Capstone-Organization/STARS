import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskView, { TaskViewTask, formatDriverDisplay, isImageFile, isPdfFile, formatFileSize } from '../components/TaskView/TaskView';
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

describe('TaskView - DMS POD Visibility & Driver Details (Step 2)', () => {
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
            expect(formatFileSize(0)).toBe('—');
        });
    });

    describe('Driver Display in TaskView', () => {
        it('renders assigned driver full name and employee ID in DMS details', async () => {
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
                            },
                        },
                    };
                }
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: { hasPod: false } } };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const driverElement = screen.getByTestId('tv-dms-assigned-driver');
                expect(driverElement).toBeInTheDocument();
                expect(driverElement).toHaveTextContent('Juan Dela Cruz (DRV-001)');
                expect(screen.queryByText('[Inactive]')).not.toBeInTheDocument();
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
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: { hasPod: false } } };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const driverElement = screen.getByTestId('tv-dms-assigned-driver');
                expect(driverElement).toBeInTheDocument();
                expect(driverElement).toHaveTextContent('Maria Santos (DRV-002)');
                expect(screen.getByText('[Inactive]')).toBeInTheDocument();
            });
        });

        it('renders Unassigned when no driver is attached to delivery details', async () => {
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
                                dmsStatus: 'Pending Dispatch',
                                syncStatus: 'Synced',
                                courierEmployeeId: null,
                                courierFullName: 'Unassigned',
                                courierIsActive: null,
                            },
                        },
                    };
                }
                if (url.includes('/pod')) {
                    return { data: { isSuccess: true, data: { hasPod: false } } };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const driverElement = screen.getByTestId('tv-dms-assigned-driver');
                expect(driverElement).toBeInTheDocument();
                expect(driverElement).toHaveTextContent('Unassigned');
            });
        });
    });

    describe('Proof of Delivery (POD) Section', () => {
        it('renders dedicated POD section with empty state when no POD is uploaded', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                hasPod: false,
                                podUrl: null,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            expect(screen.getByTestId('tv-pod-section')).toBeInTheDocument();
            await waitFor(() => {
                expect(screen.getByTestId('tv-pod-empty')).toBeInTheDocument();
                expect(screen.getByText('No Proof of Delivery (POD) Uploaded Yet')).toBeInTheDocument();
            });
        });

        it('renders POD image thumbnail, metadata, and download button when POD image exists', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                waybillNo: 'WB-2026-449612',
                                fileName: 'POD_WB-2026-449612.jpg',
                                fileType: '.jpg',
                                fileSize: 245760,
                                uploadedAt: '2026-11-06T14:30:00Z',
                                uploadedByName: 'Juan Dela Cruz',
                                podUrl: '/api/dms-integration/tasks/task-dms-01/pod/download?inline=true',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByTestId('tv-pod-card')).toBeInTheDocument();
                expect(screen.getByText('POD_WB-2026-449612.jpg')).toBeInTheDocument();
                expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
                expect(screen.getByText('240.0 KB')).toBeInTheDocument();
                expect(screen.getByText('Download POD')).toBeInTheDocument();
                expect(screen.getByAltText(/Proof of Delivery for WB-2026-449612/i)).toBeInTheDocument();
            });
        });

        it('opens interactive preview modal when clicking the image thumbnail', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                waybillNo: 'WB-2026-449612',
                                fileName: 'POD_photo.jpg',
                                fileType: '.jpg',
                                fileSize: 102400,
                                uploadedAt: '2026-11-06T14:30:00Z',
                                uploadedByName: 'Juan Dela Cruz',
                                podUrl: 'https://dms.storage.example/pod/123.jpg',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByAltText(/Proof of Delivery/i)).toBeInTheDocument();
            });

            const thumbnailWrapper = screen.getByRole('button', { name: /Click to preview full Proof of Delivery/i });
            fireEvent.click(thumbnailWrapper);

            // Modal should be open
            expect(screen.getByTestId('tv-pod-preview-modal')).toBeInTheDocument();
            expect(screen.getByText('Proof of Delivery Preview')).toBeInTheDocument();
            expect(screen.getByText('Download Original')).toBeInTheDocument();

            // Close modal
            const closeBtn = screen.getByRole('button', { name: /Close Preview/i });
            fireEvent.click(closeBtn);

            expect(screen.queryByTestId('tv-pod-preview-modal')).not.toBeInTheDocument();
        });

        it('renders PDF document card and opens PDF viewer in preview modal when file is a PDF', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                waybillNo: 'WB-2026-449612',
                                fileName: 'Signed_Receipt.pdf',
                                fileType: '.pdf',
                                fileSize: 524288,
                                uploadedAt: '2026-11-06T15:00:00Z',
                                uploadedByName: 'Field Courier',
                                podUrl: '/api/dms-integration/tasks/task-dms-01/pod/download?inline=true',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByTestId('tv-pod-pdf-card')).toBeInTheDocument();
                expect(screen.getAllByText('Signed_Receipt.pdf').length).toBeGreaterThanOrEqual(1);
                expect(screen.getAllByText(/512.0 KB/i).length).toBeGreaterThanOrEqual(1);
            });

            const previewPdfBtn = screen.getByRole('button', { name: /Preview PDF/i });
            fireEvent.click(previewPdfBtn);

            expect(screen.getByTestId('tv-pod-preview-modal')).toBeInTheDocument();
            expect(screen.getByTitle('POD PDF Viewer')).toBeInTheDocument();
        });

        it('gracefully handles broken image with fallback UI and download button', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                waybillNo: 'WB-2026-449612',
                                fileName: 'broken_pod.jpg',
                                fileType: '.jpg',
                                fileSize: 1024,
                                podUrl: '/invalid/image/path.jpg',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                const img = screen.getByAltText(/Proof of Delivery/i);
                fireEvent.error(img);
            });

            expect(screen.getByTestId('tv-pod-broken')).toBeInTheDocument();
            expect(screen.getByText('Image preview unavailable or broken')).toBeInTheDocument();
            expect(screen.getByText('Download File')).toBeInTheDocument();
        });

        it('gracefully handles unsupported file types with fallback UI', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                waybillNo: 'WB-2026-449612',
                                fileName: 'pod_archive.zip',
                                fileType: '.zip',
                                fileSize: 2097152,
                                podUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByTestId('tv-pod-unsupported')).toBeInTheDocument();
                expect(screen.getByText(/Preview not supported for this file type/i)).toBeInTheDocument();
                expect(screen.getByText('Download File')).toBeInTheDocument();
            });
        });

        it('displays permission error banner when POD API returns 403 Forbidden', async () => {
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod')) {
                    const error: any = new Error('Access denied');
                    error.response = { status: 403 };
                    throw error;
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByTestId('tv-pod-error')).toBeInTheDocument();
                expect(screen.getByText(/Access denied: You do not have permission to view Proof of Delivery for this task/i)).toBeInTheDocument();
            });
        });

        it('triggers download when user clicks Download POD', async () => {
            const mockBlob = new Blob(['mock binary data'], { type: 'image/jpeg' });
            vi.mocked(api.get).mockImplementation(async (url: string) => {
                if (url.includes('/pod/download')) {
                    return { data: mockBlob };
                }
                if (url.includes('/pod')) {
                    return {
                        data: {
                            isSuccess: true,
                            data: {
                                taskId: mockTask.taskId,
                                waybillNo: 'WB-2026-449612',
                                fileName: 'POD_photo.jpg',
                                fileType: '.jpg',
                                podUrl: '/api/dms-integration/tasks/task-dms-01/pod/download?inline=true',
                                downloadUrl: '/api/dms-integration/tasks/task-dms-01/pod/download',
                                hasPod: true,
                            },
                        },
                    };
                }
                return { data: { isSuccess: true, data: null } };
            });

            render(<TaskView task={mockTask} />);

            await waitFor(() => {
                expect(screen.getByText('Download POD')).toBeInTheDocument();
            });

            const downloadBtn = screen.getByText('Download POD');
            fireEvent.click(downloadBtn);

            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith(
                    expect.stringContaining('/pod/download'),
                    expect.objectContaining({ responseType: 'blob' })
                );
            });
        });
    });
});
