import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PreDeliveryTab, { DmsPendingOrder } from '../components/PreDeliveryTab/PreDeliveryTab';
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

describe('PreDeliveryTab Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('filters out mock and dummy orders and sorts newly created DMS orders to the top', async () => {
        const dmsOrders: DmsPendingOrder[] = [
            {
                orderId: 101,
                waybillNo: 'WB-2026-000101',
                clientName: 'Alpha Logistics',
                clientType: 'Corporate',
                contactNumber: '09171112222',
                senderAddress: 'Makati City',
                recipientName: 'Recipient Older Order',
                recipientContact: '09181112222',
                recipientAddress: 'Ortigas, Pasig',
                area: 'Pasig',
                route: 'Route A',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Box',
                packageDescription: 'Office Supplies',
                itemCount: 1,
                weight: '2.5 kg',
                priority: 'Medium',
                orderDate: '2026-10-20T10:00:00Z',
                expectedDelivery: '2026-10-22T18:00:00Z',
            },
            {
                orderId: 999,
                waybillNo: 'WB-MOCK-999',
                clientName: 'Mock Client Inc',
                clientType: 'Corporate',
                contactNumber: '09170000000',
                senderAddress: 'Mock Address',
                recipientName: 'Dummy Test Recipient',
                recipientContact: '09180000000',
                recipientAddress: 'Mock Street',
                area: 'Test Area',
                route: 'Route Mock',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Box',
                packageDescription: 'Sample dummy parcel',
                itemCount: 1,
                weight: '1.0 kg',
                priority: 'Low',
                orderDate: '2026-10-23T12:00:00Z',
                expectedDelivery: '2026-10-24T18:00:00Z',
            },
            {
                orderId: 105,
                waybillNo: 'WB-2026-000105',
                clientName: 'Beta Enterprises',
                clientType: 'Retail',
                contactNumber: '09173334444',
                senderAddress: 'Taguig City',
                recipientName: 'Brand New DMS Order',
                recipientContact: '09183334444',
                recipientAddress: 'BGC, Taguig',
                area: 'Taguig',
                route: 'Route B',
                status: 'Pending',
                taskType: 'Delivery',
                packageType: 'Parcel',
                packageDescription: 'Computer Parts',
                itemCount: 2,
                weight: '4.0 kg',
                priority: 'High',
                orderDate: '2026-10-23T15:30:00Z',
                expectedDelivery: '2026-10-24T18:00:00Z',
            },
        ];

        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: dmsOrders },
        });

        const handleCreateTask = vi.fn();

        render(
            <PreDeliveryTab
                tasks={[]}
                onCreateTaskForOrder={handleCreateTask}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Brand New DMS Order')).toBeInTheDocument();
            expect(screen.getByText('Recipient Older Order')).toBeInTheDocument();
        });

        // Verify mock data was removed
        expect(screen.queryByText('Dummy Test Recipient')).not.toBeInTheDocument();
        expect(screen.queryByText('WB-MOCK-999')).not.toBeInTheDocument();
        expect(screen.queryByText('Sample dummy parcel')).not.toBeInTheDocument();

        // Verify the newly created DMS order is displayed at the top of the table rows
        const rows = screen.getAllByRole('row');
        // Row 0 is the header, Row 1 should be the newest order
        expect(rows[1]).toHaveTextContent('Brand New DMS Order');
        expect(rows[1]).toHaveTextContent('WB-2026-000105');
        expect(rows[2]).toHaveTextContent('Recipient Older Order');
        expect(rows[2]).toHaveTextContent('WB-2026-000101');
    });

    it('filters out mock tasks in active validation tab', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [] },
        });

        const tasks = [
            {
                taskId: 't-1',
                taskNumber: 'TSK-001',
                taskTitle: '[Pre-Delivery] Delivery to Real Client - Waybill WB-101',
                taskDescription: 'Real delivery description',
                taskCategory: 'Delivery Operations',
                priority: 'High',
                status: 'InProgress',
                createdAt: '2026-10-23T14:00:00Z',
            },
            {
                taskId: 't-2',
                taskNumber: 'TSK-MOCK',
                taskTitle: 'Sample Dummy Mock Task',
                taskDescription: 'Dummy pre-delivery mock',
                taskCategory: 'Delivery Operations',
                priority: 'Low',
                status: 'InProgress',
                createdAt: '2026-10-23T16:00:00Z',
            },
        ];

        render(
            <PreDeliveryTab
                tasks={tasks}
                onCreateTaskForOrder={vi.fn()}
            />
        );

        // Click on "Active Validation Tasks" tab
        const activeTabBtn = screen.getByRole('button', { name: /Active Validation Tasks/i });
        activeTabBtn.click();

        await waitFor(() => {
            expect(screen.getByText('[Pre-Delivery] Delivery to Real Client - Waybill WB-101')).toBeInTheDocument();
        });

        expect(screen.queryByText('Sample Dummy Mock Task')).not.toBeInTheDocument();
    });
});
