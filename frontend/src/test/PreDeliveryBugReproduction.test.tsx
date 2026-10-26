import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('Pre-Delivery Task Creation Reproduction Suite (Step 1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const testOrders: Record<string, DmsPendingOrder> = {
        // Case 1: Duplicate task match trigger (Symptom 1)
        duplicateOrder: {
            orderId: 201,
            waybillNo: 'WB-2026-000201',
            clientName: 'Speedex Corporate',
            clientType: 'Corporate',
            contactNumber: '09171112222',
            senderAddress: 'Makati Hub',
            recipientName: 'Juan Dela Cruz',
            recipientContact: '09181112222',
            recipientAddress: 'Ortigas Center, Pasig',
            area: 'Pasig',
            route: 'Route A',
            status: 'Pending',
            taskType: 'Delivery',
            packageType: 'Box',
            packageDescription: 'Corporate Documents Parcel',
            itemCount: 1,
            weight: '1.5 kg',
            priority: 'Medium',
            orderDate: '2026-10-25T10:00:00Z',
            expectedDelivery: '2026-10-28T18:00:00Z',
            driverEmployeeId: 'EMP-001',
        },
        // Case 2: Missing expectedDelivery date (Symptom 2)
        missingDateOrder: {
            orderId: 202,
            waybillNo: 'WB-2026-000202',
            clientName: 'Metro Logistics',
            clientType: 'Enterprise',
            contactNumber: '09172223333',
            senderAddress: 'Taguig Warehouse',
            recipientName: 'Maria Santos',
            recipientContact: '09182223333',
            recipientAddress: 'BGC, Taguig City',
            area: 'Taguig',
            route: 'Route B',
            status: 'Pending',
            taskType: 'Delivery',
            packageType: 'Parcel',
            packageDescription: 'Medical Supplies Package',
            itemCount: 2,
            weight: '3.0 kg',
            priority: 'High',
            orderDate: '2026-10-25T11:00:00Z',
            expectedDelivery: '', // Missing / empty date
            driverEmployeeId: 'EMP-002',
        },
        // Case 3: Unmapped courier ID (Symptom 2)
        unmappedCourierOrder: {
            orderId: 203,
            waybillNo: 'WB-2026-000203',
            clientName: 'Express Cargo',
            clientType: 'Retail',
            contactNumber: '09173334444',
            senderAddress: 'Quezon City Hub',
            recipientName: 'Antonio Luna',
            recipientContact: '09183334444',
            recipientAddress: 'Cubao, Quezon City',
            area: 'Quezon City',
            route: 'Route C',
            status: 'Pending',
            taskType: 'Delivery',
            packageType: 'Crate',
            packageDescription: 'Electronics Hardware',
            itemCount: 1,
            weight: '5.2 kg',
            priority: 'Low',
            orderDate: '2026-10-25T12:00:00Z',
            expectedDelivery: '2026-10-29T18:00:00Z',
            driverEmployeeId: 'DMS-UNMAPPED-999', // Unknown in STARS
        },
        // Case 4: Historical / past deadline (Symptom 4)
        historicalDateOrder: {
            orderId: 204,
            waybillNo: 'WB-2026-000204',
            clientName: 'Heritage Goods',
            clientType: 'Wholesale',
            contactNumber: '09174445555',
            senderAddress: 'Manila Port',
            recipientName: 'Clara Recto',
            recipientContact: '09184445555',
            recipientAddress: 'Ermita, Manila',
            area: 'Manila',
            route: 'Route D',
            status: 'Pending',
            taskType: 'Delivery',
            packageType: 'Box',
            packageDescription: 'Perishable Food Basket',
            itemCount: 3,
            weight: '6.0 kg',
            priority: 'Urgent',
            orderDate: '2026-10-10T08:00:00Z',
            expectedDelivery: '2026-10-12T18:00:00Z', // Past date
            driverEmployeeId: 'EMP-001',
        },
        // Case 5: Standard valid order (Baseline Success)
        validOrder: {
            orderId: 205,
            waybillNo: 'WB-2026-000205',
            clientName: 'Apex Distributors',
            clientType: 'Corporate',
            contactNumber: '09175556666',
            senderAddress: 'Alabang Hub',
            recipientName: 'Felipe Buencamino',
            recipientContact: '09185556666',
            recipientAddress: 'Muntinlupa City',
            area: 'Muntinlupa',
            route: 'Route E',
            status: 'Pending',
            taskType: 'Delivery',
            packageType: 'Parcel',
            packageDescription: 'Spare Machine Parts',
            itemCount: 1,
            weight: '2.0 kg',
            priority: 'Medium',
            orderDate: '2026-10-25T14:00:00Z',
            expectedDelivery: '2026-10-30T17:00:00Z',
            driverEmployeeId: 'EMP-001',
        },
    };

    it('reproduces Order 201 dispatch payload and records duplicate-matching conditions (Symptom 1)', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [testOrders.duplicateOrder] },
        });

        const handleCreate = vi.fn();
        render(<PreDeliveryTab tasks={[]} onCreateTaskForOrder={handleCreate} />);

        await waitFor(() => {
            expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        fireEvent.click(createBtn);

        expect(handleCreate).toHaveBeenCalledTimes(1);
        const orderArg: DmsPendingOrder = handleCreate.mock.calls[0][0];
        expect(orderArg.orderId).toBe(201);
        expect(orderArg.waybillNo).toBe('WB-2026-000201');
    });

    it('reproduces Order 202 missing expected delivery date (Symptom 2)', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [testOrders.missingDateOrder] },
        });

        const handleCreate = vi.fn();
        render(<PreDeliveryTab tasks={[]} onCreateTaskForOrder={handleCreate} />);

        await waitFor(() => {
            expect(screen.getByText('Maria Santos')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        fireEvent.click(createBtn);

        expect(handleCreate).toHaveBeenCalledTimes(1);
        const orderArg: DmsPendingOrder = handleCreate.mock.calls[0][0];
        // Order has no expectedDelivery date
        expect(orderArg.expectedDelivery).toBe('');
    });

    it('reproduces Order 203 unmapped courier employee ID (Symptom 2)', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [testOrders.unmappedCourierOrder] },
        });

        const handleCreate = vi.fn();
        render(<PreDeliveryTab tasks={[]} onCreateTaskForOrder={handleCreate} />);

        await waitFor(() => {
            expect(screen.getByText('Antonio Luna')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        fireEvent.click(createBtn);

        expect(handleCreate).toHaveBeenCalledTimes(1);
        const orderArg: DmsPendingOrder = handleCreate.mock.calls[0][0];
        expect(orderArg.driverEmployeeId).toBe('DMS-UNMAPPED-999');
    });

    it('reproduces Order 204 historical delivery date payload (Symptom 4)', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [testOrders.historicalDateOrder] },
        });

        const handleCreate = vi.fn();
        render(<PreDeliveryTab tasks={[]} onCreateTaskForOrder={handleCreate} />);

        await waitFor(() => {
            expect(screen.getByText('Clara Recto')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        fireEvent.click(createBtn);

        expect(handleCreate).toHaveBeenCalledTimes(1);
        const orderArg: DmsPendingOrder = handleCreate.mock.calls[0][0];
        const deliveryDate = new Date(orderArg.expectedDelivery);
        const now = new Date();
        // Verifies the date is strictly in the past
        expect(deliveryDate.getTime()).toBeLessThan(now.getTime());
    });

    it('verifies Order 205 standard valid pre-delivery order (Baseline Success)', async () => {
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: [testOrders.validOrder] },
        });

        const handleCreate = vi.fn();
        render(<PreDeliveryTab tasks={[]} onCreateTaskForOrder={handleCreate} />);

        await waitFor(() => {
            expect(screen.getByText('Felipe Buencamino')).toBeInTheDocument();
        });

        const createBtn = screen.getByRole('button', { name: /Create STARS Task/i });
        fireEvent.click(createBtn);

        expect(handleCreate).toHaveBeenCalledTimes(1);
        const orderArg: DmsPendingOrder = handleCreate.mock.calls[0][0];
        expect(orderArg.orderId).toBe(205);
        expect(orderArg.waybillNo).toBe('WB-2026-000205');
        const deliveryDate = new Date(orderArg.expectedDelivery);
        const now = new Date();
        expect(deliveryDate.getTime()).toBeGreaterThan(now.getTime());
    });
});
