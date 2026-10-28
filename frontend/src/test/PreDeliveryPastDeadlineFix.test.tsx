import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
    TaskModal,
    buildPreDeliveryTaskInitialData,
    getAdjustedSlaDeadline,
    TeamMember,
} from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
import { DmsPendingOrder } from '../components/PreDeliveryTab/PreDeliveryTab';
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

describe('Pre-Delivery Past Delivery Deadline & SLA Adjustment Fix (Step 5)', () => {
    const mockTeamMembers: TeamMember[] = [
        {
            accountId: 'emp-001',
            employeeName: 'John Courier',
            role: 'Courier',
            currentWorkload: 1,
            maxWorkload: 5,
            isAvailable: true,
            status: 'Active',
            skills: ['Driving', 'Delivery'],
            email: 'john@speedex.com',
        },
        {
            accountId: 'emp-002',
            employeeName: 'Maria Dispatcher',
            role: 'Dispatcher',
            currentWorkload: 0,
            maxWorkload: 5,
            isAvailable: true,
            status: 'Active',
            skills: ['Routing', 'Logistics'],
            email: 'maria@speedex.com',
        },
    ];

    const mockAssignableUsers = [
        {
            id: 'emp-001',
            fullName: 'John Courier',
            employeeNumber: 'DRV-001',
            role: 'Courier',
            workload: 1,
            isAvailable: true,
            departmentName: 'Delivery',
        },
        {
            id: 'emp-002',
            fullName: 'Maria Dispatcher',
            employeeNumber: 'DRV-002',
            role: 'Dispatcher',
            workload: 0,
            isAvailable: true,
            departmentName: 'Dispatch',
        },
    ];

    const pastOrderBase: DmsPendingOrder = {
        orderId: 204,
        waybillNo: 'WB-2026-000204',
        clientName: 'Historical Logistics Corp',
        clientType: 'Corporate',
        contactNumber: '09174445555',
        senderAddress: 'Makati Hub',
        recipientName: 'Past Recipient',
        recipientContact: '09184445555',
        recipientAddress: 'Alabang, Muntinlupa',
        area: 'Muntinlupa',
        route: 'Route D',
        status: 'Pending',
        taskType: 'Delivery',
        packageType: 'Box',
        packageDescription: 'Overdue Parcel',
        itemCount: 1,
        weight: '2.5 kg',
        priority: 'High',
        orderDate: '2026-10-10T08:00:00Z',
        expectedDelivery: '2026-10-12T18:00:00Z', // Past historical date
        driverEmployeeId: 'DRV-001',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/Task/assignable-users')) {
                return Promise.resolve({ data: { isSuccess: true, data: { items: mockAssignableUsers } } });
            }
            if (url.includes('/api/Team')) {
                return Promise.resolve({ data: { isSuccess: true, data: { items: [] } } });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: {} });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. SLA HELPER & BUILD PRE-DELIVERY INITIAL DATA
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. SLA Deadline Helper and buildPreDeliveryTaskInitialData', () => {
        it('calculates correct future SLA deadlines per priority level', () => {
            const baseTime = new Date('2026-10-26T10:00:00Z');
            const urgentSla = getAdjustedSlaDeadline('Urgent', baseTime);
            const highSla = getAdjustedSlaDeadline('High', baseTime);
            const medSla = getAdjustedSlaDeadline('Medium', baseTime);
            const lowSla = getAdjustedSlaDeadline('Low', baseTime);

            expect(urgentSla.getTime() - baseTime.getTime()).toBe(24 * 60 * 60 * 1000); // 24h
            expect(highSla.getTime() - baseTime.getTime()).toBe(48 * 60 * 60 * 1000); // 48h
            expect(medSla.getTime() - baseTime.getTime()).toBe(72 * 60 * 60 * 1000); // 72h
            expect(lowSla.getTime() - baseTime.getTime()).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
        });

        it('detects historical expectedDelivery date and adjusts dueAt to a valid future SLA date', () => {
            const taskInitial = buildPreDeliveryTaskInitialData(pastOrderBase);

            expect(taskInitial.isHistoricalDeadline).toBe(true);
            expect(taskInitial.originalExpectedDelivery).toBeTruthy();
            expect(new Date(taskInitial.originalExpectedDelivery).getTime()).toBe(new Date(pastOrderBase.expectedDelivery).getTime());
            expect(taskInitial.dueAt).toBeTruthy();

            const adjustedDate = new Date(taskInitial.dueAt);
            expect(adjustedDate.getTime()).toBeGreaterThan(Date.now());
            expect(taskInitial.deliveryDetails.isHistoricalDeadline).toBe(true);
            expect(taskInitial.deliveryDetails.originalExpectedDelivery).toBe(taskInitial.originalExpectedDelivery);
        });

        it('preserves valid future expectedDelivery dates as DMS pre-set deadlines without adjustment', () => {
            const futureOrder: DmsPendingOrder = {
                ...pastOrderBase,
                orderId: 205,
                waybillNo: 'WB-2026-000205',
                expectedDelivery: '2026-10-31T08:00:00Z',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(futureOrder);

            expect(taskInitial.isHistoricalDeadline).toBe(false);
            expect(taskInitial.dueAt).toContain('2026-10-31');
            expect(taskInitial.deliveryDetails.isHistoricalDeadline).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TASK MODAL RENDERING & BADGES FOR HISTORICAL ORDERS
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. TaskModal Rendering and User Guidance for Historical Pre-Delivery Orders', () => {
        it('renders adjusted SLA badge and explanation without locking the input', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(pastOrderBase);

            const { container } = render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            // Badge indicates past date was adjusted to future SLA
            await screen.findByText(/PAST DMS DATE ADJUSTED TO SLA/i);

            // Informative helper text is shown
            expect(screen.getByText(/Original DMS expected delivery has passed. Automatically adjusted to a valid future SLA deadline./i)).toBeInTheDocument();

            // Date input is unlocked so coordinator can refine or customize if necessary
            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(dateInput).toBeInTheDocument();
            expect(dateInput.disabled).toBe(false);
            expect(dateInput.readOnly).toBe(false);
            expect(new Date(dateInput.value).getTime()).toBeGreaterThan(Date.now());
        });

        it('displays quick-pick options allowing coordinator to quickly adjust future deadline', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(pastOrderBase);

            const { container } = render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            await screen.findByText(/PAST DMS DATE ADJUSTED TO SLA/i);

            // For High priority, quick picks "+1 Day (24h)" and "+2 Days (48h max)" are rendered
            const qpBtn = screen.getByRole('button', { name: /\+1 Day/i });
            expect(qpBtn).toBeInTheDocument();

            fireEvent.click(qpBtn);

            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(new Date(dateInput.value).getTime()).toBeGreaterThan(Date.now());
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. VALIDATION & SAVE SUBMISSION WITH VALID FUTURE DEADLINE
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Validation and Successful Save Submission', () => {
        it('rejects manual past date entry with client validation error', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(pastOrderBase);

            const { container } = render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            await screen.findByText(/PAST DMS DATE ADJUSTED TO SLA/i);

            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;

            // Manually set past date
            fireEvent.change(dateInput, { target: { value: '2026-10-01T10:00' } });

            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            // Validation message prevents past date submission
            await screen.findByText(/Due date cannot be in the past./i);
            expect(screen.getByText(/Please resolve the highlighted validation errors before saving./i)).toBeInTheDocument();
        });

        it('saves pre-delivery task with valid future ISO deadline and avoids backend 400 rejection', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(pastOrderBase);
            const onSaveMock = vi.fn().mockResolvedValue(undefined);

            render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={onSaveMock}
                    onClose={vi.fn()}
                />
            );

            await screen.findByText(/PAST DMS DATE ADJUSTED TO SLA/i);
            await screen.findByText(/Selected/i);

            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            const deadlineDate = new Date(savedPayload.deadline);

            // Verified: Deadline is strictly in the future (> Date.now())
            expect(deadlineDate.getTime()).toBeGreaterThan(Date.now());
            expect(savedPayload.deliveryDetails.isHistoricalDeadline).toBe(true);
            expect(savedPayload.deliveryDetails.dmsOrderId).toBe(204);
            expect(savedPayload.deliveryDetails.dmsWaybillNo).toBe('WB-2026-000204');
        });

        it('auto-adjusts past initial.dueAt to future SLA even if passed directly without build helper', async () => {
            const onSaveMock = vi.fn().mockResolvedValue(undefined);

            // Passing a past dueAt directly in initial
            const directInitial = {
                taskTitle: '[Pre-Delivery] Direct Order - Waybill WB-DIRECT',
                taskDescription: 'Validating direct order with past deadline',
                priority: 'Urgent',
                dueAt: '2026-10-05T12:00', // Past date
                assignedTo: 'emp-001',
                deliveryDetails: {
                    dmsWaybillNo: 'WB-DIRECT',
                    dmsOrderId: 999,
                    recipientName: 'Direct Client',
                    recipientContact: '09191112222',
                    deliveryAddress: 'Direct St, Makati',
                    courierEmployeeId: 'DRV-001',
                },
            };

            render(
                <TaskModal
                    mode="new"
                    initial={directInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={onSaveMock}
                    onClose={vi.fn()}
                />
            );

            await screen.findByText(/PAST DMS DATE ADJUSTED TO SLA/i);

            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            const deadlineDate = new Date(savedPayload.deadline);
            expect(deadlineDate.getTime()).toBeGreaterThan(Date.now());
        });
    });
});
