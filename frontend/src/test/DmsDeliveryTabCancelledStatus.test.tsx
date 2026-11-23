import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DmsDeliveryTab, { DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
    },
}));

vi.mock('../components/Toast/Toast', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }),
}));

describe('DmsDeliveryTab - Cancelled and Failed Live Delivery Tracking Defect Fix', () => {
    const mockTasks = [
        {
            taskId: 'task-c-001',
            taskTitle: 'Express Legal Document Dispatch',
            taskNumber: '1099',
            taskReferenceNumber: 'REF-1099',
            taskStatus: 'Completed',
        },
    ];

    const mockCancelledDelivery: DmsDeliveryItem = {
        taskId: 'task-c-001',
        taskTitle: 'Express Legal Document Dispatch',
        taskNumber: '1099',
        taskReferenceNumber: 'REF-1099',
        recipientName: 'Atty. Victor Cruz',
        recipientContact: '0917-888-9999',
        deliveryAddress: '32nd St, BGC, Taguig City',
        area: 'BGC',
        dmsWaybillNo: 'WB-CAN-2026-001',
        dmsOrderId: 5541,
        dmsStatus: 'Cancelled',
        dmsRawStatus: 'Cancelled',
        syncStatus: 'Synced',
        courierFullName: 'Juan Dela Cruz',
        courierEmployeeId: 'EMP-001',
        dmsFailureReason: 'Customer requested order cancellation due to duplicate request.',
        dmsLastSyncedAt: '2026-11-20T10:30:00Z',
    };

    const mockFailedDelivery: DmsDeliveryItem = {
        taskId: 'task-f-002',
        taskTitle: 'Fragile Medical Equipment',
        taskNumber: '1100',
        recipientName: 'St. Jude Clinic',
        recipientContact: '0918-777-6666',
        deliveryAddress: 'E. Rodriguez Ave, Quezon City',
        dmsWaybillNo: 'WB-FAIL-2026-002',
        dmsOrderId: 5542,
        dmsStatus: 'Failed',
        dmsRawStatus: 'Undelivered',
        syncStatus: 'Failed',
        courierFullName: 'Pedro Penduko',
        courierEmployeeId: 'EMP-002',
        dmsFailureReason: 'Consignee clinic closed upon arrival; security refused delivery.',
        dmsLastSyncedAt: '2026-11-20T11:00:00Z',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/integration/dms/performance-summary')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            totalDeliveries: 10,
                            onTimeCount: 8,
                            lateCount: 2,
                            onTimePercentage: 80,
                        },
                    },
                });
            }
            if (url.includes('/api/dms-integration/deliveries')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: [mockCancelledDelivery, mockFailedDelivery],
                    },
                });
            }
            if (url.includes('/api/dms-integration/pending-orders')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/pod')) {
                return Promise.resolve({ data: { isSuccess: true, data: null } });
            }
            if (url.includes('/delivery-details')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockCancelledDelivery,
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
    });

    it('renders comprehensive Cancelled view instead of standard 7-stage active stepper when status is Cancelled', async () => {
        render(
            <DmsDeliveryTab
                tasks={mockTasks as any}
                initialWaybill="WB-CAN-2026-001"
                onViewTask={vi.fn()}
            />
        );

        // Wait for live delivery tracker detail view to be open for the initial waybill
        await waitFor(() => {
            expect(screen.getByText('Live Delivery Tracker')).toBeInTheDocument();
        });

        // 1. Terminal Cancelled View container should be rendered
        expect(screen.getByTestId('dms-terminal-cancelled-view')).toBeInTheDocument();

        // 2. Cancellation pill & title should be present
        expect(screen.getByTestId('dms-detail-cancelled-pill')).toHaveTextContent('Cancelled in DMS');
        expect(screen.getByText('Delivery Status: Cancelled')).toBeInTheDocument();

        // 3. Prominent cancellation rationale
        expect(screen.getByTestId('dms-cancelled-reason')).toHaveTextContent(
            'Customer requested order cancellation due to duplicate request.'
        );

        // 4. Hero pulse text should show "Delivery Cancelled" instead of "Live DMS Dispatch Active"
        expect(screen.getByText('Delivery Cancelled')).toBeInTheDocument();
        expect(screen.queryByText('Live DMS Dispatch Active')).not.toBeInTheDocument();

        // 5. Standard active summary ("Stage 1 of 7:") should NOT be shown
        expect(screen.queryByText(/Stage \d of 7:/i)).not.toBeInTheDocument();

        // 6. Lifecycle Termination section with "Cancelled Here" and "Voided"
        expect(screen.getByText('Lifecycle Milestone Termination Point')).toBeInTheDocument();
        expect(screen.getAllByText('Cancelled Here').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Voided').length).toBeGreaterThanOrEqual(1);

        // 7. Operational task impact is explained
        expect(screen.getByText(/The primary STARS operational task remains intact/i)).toBeInTheDocument();
    });

    it('renders comprehensive Failed view when tracking a failed delivery order', async () => {
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/delivery-details')) {
                return Promise.resolve({
                    data: { isSuccess: true, data: mockFailedDelivery },
                });
            }
            if (url.includes('/deliveries')) {
                return Promise.resolve({
                    data: { isSuccess: true, data: [mockFailedDelivery] },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });

        render(
            <DmsDeliveryTab
                tasks={mockTasks as any}
                initialWaybill="WB-FAIL-2026-002"
                onViewTask={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Live Delivery Tracker')).toBeInTheDocument();
        });

        // 1. Terminal Failed View container should be rendered
        expect(screen.getByTestId('dms-terminal-failed-view')).toBeInTheDocument();

        // 2. Failed pill & title
        expect(screen.getByTestId('dms-detail-failed-pill')).toHaveTextContent('Delivery Failed');
        expect(screen.getByText('Delivery Status: Failed')).toBeInTheDocument();

        // 3. Failure reason callout
        expect(screen.getByTestId('dms-failed-reason')).toHaveTextContent(
            'Consignee clinic closed upon arrival; security refused delivery.'
        );

        // 4. Hero pulse text and status pills
        expect(screen.getAllByText('Delivery Failed').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Live DMS Dispatch Active')).not.toBeInTheDocument();

        // 5. Standard active summary should NOT be shown
        expect(screen.queryByText(/Stage \d of 7:/i)).not.toBeInTheDocument();

        // 6. Lifecycle Exception section
        expect(screen.getByText('Lifecycle Milestone Exception Point')).toBeInTheDocument();
        expect(screen.getAllByText('Failed Here').length).toBeGreaterThanOrEqual(1);
    });

    it('navigates to associated STARS task when operator clicks "Open Associated Task in STARS"', async () => {
        const mockOnViewTask = vi.fn();
        render(
            <DmsDeliveryTab
                tasks={mockTasks as any}
                initialWaybill="WB-CAN-2026-001"
                onViewTask={mockOnViewTask}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('dms-terminal-cancelled-view')).toBeInTheDocument();
        });

        const linkBtn = screen.getByRole('button', { name: /Open Associated Task in STARS/i });
        expect(linkBtn).toBeInTheDocument();
        fireEvent.click(linkBtn);

        expect(mockOnViewTask).toHaveBeenCalledWith('task-c-001');
    });
});
