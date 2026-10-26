import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
    TaskModal,
    buildPreDeliveryTaskInitialData,
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

describe('Pre-Delivery Due Date Unlocking & Courier Selection Fix (Step 4)', () => {
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
            workload: 2,
            availabilityStatus: 'Available',
            isAvailable: true,
            department: 'Operations',
        },
        {
            id: 'emp-002',
            fullName: 'Maria Dispatcher',
            employeeNumber: 'DRV-002',
            role: 'Dispatcher',
            workload: 0,
            availabilityStatus: 'Available',
            isAvailable: true,
            department: 'Operations',
        },
    ];

    const baseOrder: DmsPendingOrder = {
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
        expectedDelivery: '', // Missing
        driverEmployeeId: 'emp-001', // Mapped to John Courier
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/Task/assignable-users')) {
                return Promise.resolve({ data: mockAssignableUsers });
            }
            if (url.includes('/api/Team')) {
                return Promise.resolve({ data: [] });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: [] });
            }
            return Promise.resolve({ data: {} });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DUE DATE UNLOCKING FOR MISSING EXPECTED DELIVERY
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Due Date Unlocking for Orders Missing expectedDelivery', () => {
        it('renders unlocked date input and warning badge when expectedDelivery is absent', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(baseOrder);
            expect(taskInitial.dueAt).toBe('');

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

            await screen.findByRole('heading', { name: /Create Pre-Delivery Task/i });

            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(dateInput).toBeInTheDocument();
            expect(dateInput.value).toBe('');
            // Verified: not locked or disabled
            expect(dateInput.disabled).toBe(false);
            expect(dateInput.readOnly).toBe(false);

            // Verified: missing deadline notice is visible
            expect(screen.getByText(/DMS DEADLINE MISSING/i)).toBeInTheDocument();
            expect(screen.getByText(/DMS order has no expected delivery date/i)).toBeInTheDocument();
            // Locked badge should NOT appear
            expect(screen.queryByText(/DMS PRE-SET DEADLINE/i)).not.toBeInTheDocument();
        });

        it('displays quick-pick buttons when expectedDelivery is absent and allows setting date via quick-pick', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(baseOrder);
            const onSaveMock = vi.fn();

            const { container } = render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={onSaveMock}
                    onClose={vi.fn()}
                />
            );

            await screen.findByRole('heading', { name: /Create Pre-Delivery Task/i });

            // Quick-pick buttons for High priority should be visible
            const quickPickBtn = screen.getByRole('button', { name: /\+1 Day \(24h\)/i });
            expect(quickPickBtn).toBeInTheDocument();

            // Click quick-pick
            fireEvent.click(quickPickBtn);

            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(dateInput.value).not.toBe('');

            // Save without validation lockout
            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            expect(savedPayload.deadline).toBeTruthy();
            expect(savedPayload.title).toContain('WB-2026-000202');
        });

        it('allows manual entry into datetime input and saves successfully', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(baseOrder);
            const onSaveMock = vi.fn();

            const { container } = render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={onSaveMock}
                    onClose={vi.fn()}
                />
            );

            await screen.findByRole('heading', { name: /Create Pre-Delivery Task/i });

            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            // Generate a valid future date tomorrow
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const pad = (n: number) => String(n).padStart(2, '0');
            const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T14:00`;

            fireEvent.change(dateInput, { target: { value: tomorrowStr } });
            expect(dateInput.value).toBe(tomorrowStr);

            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            expect(savedPayload.deadline).toContain(tomorrow.getFullYear().toString());
        });

        it('locks datetime input and displays DMS pre-set badge when expectedDelivery is provided by DMS', async () => {
            const orderWithPresetDate: DmsPendingOrder = {
                ...baseOrder,
                expectedDelivery: '2026-10-30T16:00:00Z',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(orderWithPresetDate);
            expect(taskInitial.dueAt).not.toBe('');

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

            await screen.findByRole('heading', { name: /Create Pre-Delivery Task/i });

            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(dateInput.disabled).toBe(true);
            expect(dateInput.readOnly).toBe(true);

            expect(screen.getByText(/🔒 DMS PRE-SET DEADLINE/i)).toBeInTheDocument();
            expect(screen.getByText(/Deadline is synchronized and pre-set from DMS\./i)).toBeInTheDocument();
            // Quick picks should be hidden when pre-set
            expect(screen.queryByRole('button', { name: /\+1 Day/i })).not.toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. UNMAPPED COURIER SELECTION & SAVE
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Unmapped Courier Detection, Selection, and Save', () => {
        const orderWithUnmappedCourier: DmsPendingOrder = {
            ...baseOrder,
            driverEmployeeId: 'DMS-UNMAPPED-999',
            expectedDelivery: '2026-10-30T16:00:00Z',
        };

        it('displays unmapped courier banner when DMS driver ID is not in STARS', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(orderWithUnmappedCourier);

            render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            await screen.findByText(/Unmapped DMS Courier/i);
            expect(screen.getByText(/DMS driver ID/i)).toBeInTheDocument();
            expect(screen.getByText(/DMS-UNMAPPED-999/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Assign Recommended/i })).toBeInTheDocument();
        });

        it('allows 1-click assignment of recommended courier via the unmapped banner and saves', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(orderWithUnmappedCourier);
            const onSaveMock = vi.fn();

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

            // Wait for unmapped banner
            const assignRecBtn = await screen.findByRole('button', { name: /Assign Recommended/i });
            fireEvent.click(assignRecBtn);

            // Assigned confirmation badge appears
            await screen.findByText(/Maria Dispatcher assigned/i);

            // Save task
            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            // Assignee should now be emp-002 (Maria Dispatcher)
            expect(savedPayload.assignedUserIds).toEqual(['emp-002']);
            expect(savedPayload.deliveryDetails.courierEmployeeId).toBe('DRV-002');
        });

        it('allows coordinator manual selection from employee list when courier is unmapped and saves selected courier', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(orderWithUnmappedCourier);
            const onSaveMock = vi.fn();

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

            // Wait for employee list to render
            await screen.findByText(/Lowest active workload/i);

            // Select John Courier (emp-001) from the picker list
            const johnRow = screen.getByText('John Courier').closest('.emp-picker-row')!;
            fireEvent.click(johnRow);

            await screen.findByText(/John Courier assigned/i);

            // Save task
            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            expect(savedPayload.assignedUserIds).toEqual(['emp-001']);
            expect(savedPayload.deliveryDetails.courierEmployeeId).toBe('DRV-001');
        });

        it('syncs courier ID and assigned employee when typed into DMS Delivery Dispatch input', async () => {
            const taskInitial = buildPreDeliveryTaskInitialData(orderWithUnmappedCourier);

            render(
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            await screen.findByText(/Unmapped DMS Courier/i);

            // Find Courier Employee ID input in DMS Delivery Dispatch section
            const courierInput = screen.getByPlaceholderText('e.g. DRV-001') as HTMLInputElement;
            expect(courierInput).toBeInTheDocument();

            // Change courier input to a known STARS employee number DRV-001
            fireEvent.change(courierInput, { target: { value: 'DRV-001' } });

            // Automatically syncs John Courier as assigned employee
            await screen.findByText(/John Courier assigned/i);
        });
    });
});
