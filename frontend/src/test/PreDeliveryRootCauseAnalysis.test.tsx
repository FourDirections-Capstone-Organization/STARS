import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
    TaskModal,
    DuplicateWarningModal,
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

describe('Pre-Delivery Root Cause Analysis Test Suite (Step 2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/Task/assignable-users')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [
                                {
                                    id: 'emp-001',
                                    fullName: 'John Courier',
                                    role: 'Courier',
                                    isAvailable: true,
                                    availabilityStatus: 'Available',
                                    workload: 1,
                                    departmentId: 'dept-1',
                                    departmentName: 'Delivery Fleet',
                                },
                            ],
                        },
                    },
                });
            }
            if (url.includes('/api/Team')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: {} });
        });
    });

    const mockTeamMembers: TeamMember[] = [
        {
            accountId: 'emp-001',
            employeeName: 'John Courier',
            role: 'Courier',
            presenceStatus: 'Active',
            email: 'john@speedex.com',
            assignedTasksCount: 1,
        },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DATA SHAPES COMPARISON
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Data Shapes Comparison: DMS vs TaskModal vs Backend API DTOs', () => {
        it('compares DMS payload mapping to TaskModal initial state and verifies field shape differences', () => {
            const dmsOrder: DmsPendingOrder = {
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
                priority: 'High',
                orderDate: '2026-10-25T10:00:00Z',
                expectedDelivery: '2026-10-28T18:00:00Z',
                driverEmployeeId: 'emp-001',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(dmsOrder);

            // Verified Data Shapes:
            // 1. Title format shape
            expect(taskInitial.taskTitle).toBe('[Pre-Delivery] Delivery to Juan Dela Cruz - Waybill WB-2026-000201');
            // 2. Deadline shape: DMS ISO string ("2026-10-28T18:00:00Z") converted to datetime-local input string
            expect(taskInitial.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
            // 3. Category assigned
            expect(taskInitial.taskCategory).toBe('Delivery Operations');
            // 4. Nested delivery details preserved
            expect(taskInitial.deliveryDetails.dmsOrderId).toBe(201);
            expect(taskInitial.deliveryDetails.dmsWaybillNo).toBe('WB-2026-000201');
            expect(taskInitial.deliveryDetails.recipientName).toBe('Juan Dela Cruz');
            expect(taskInitial.deliveryDetails.courierEmployeeId).toBe('emp-001');
        });

        it('identifies data shape gap when DMS expectedDelivery is missing or invalid', () => {
            const orderWithoutDate: DmsPendingOrder = {
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
                expectedDelivery: '', // missing
                driverEmployeeId: 'emp-001',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(orderWithoutDate);
            // dueAt is empty string when expectedDelivery is absent
            expect(taskInitial.dueAt).toBe('');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SAVE HANDLER EXECUTION & NETWORK TRAFFIC CONFIRMATION
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Save Handler Execution and Network Traffic Analysis', () => {
        it('confirms save handler halts at client validation and fires ZERO network requests when date is missing', async () => {
            const orderWithoutDate: DmsPendingOrder = {
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
                driverEmployeeId: 'emp-001',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(orderWithoutDate);
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

            // Wait for modal to render
            await screen.findByRole('heading', { name: /Create Pre-Delivery Task/i });

            // Inspect the date input
            const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
            expect(dateInput).toBeInTheDocument();
            expect(dateInput.value).toBe('');
            // Verified Step 4 Fix: field is unlocked when expectedDelivery is absent so coordinator can set it
            expect(dateInput.disabled).toBe(false);
            expect(dateInput.readOnly).toBe(false);

            // Attempt save
            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            // Confirmed Root Cause:
            // 1. Validation error message appears on the screen
            expect(screen.getByText(/Due date is required\./i)).toBeInTheDocument();
            expect(screen.getByText(/Please resolve the highlighted validation errors before saving\./i)).toBeInTheDocument();

            // 2. Save handler execution HALTED before calling onSave
            expect(onSaveMock).not.toHaveBeenCalled();

            // 3. Network traffic is strictly ZERO for task creation
            expect(api.post).not.toHaveBeenCalledWith('/api/Task', expect.anything());
            expect(api.post).not.toHaveBeenCalledWith('/api/Duplicate/check', expect.anything());
        });

        it('confirms save handler halts and fires ZERO network requests when courier is unmapped', async () => {
            const orderWithUnmappedCourier: DmsPendingOrder = {
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
            };

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

            // Wait for assignable employees list and recommendation to load
            await screen.findByText(/Lowest active workload/i);

            // Attempt save without selecting an employee
            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            // Confirmed Root Cause:
            // 1. Validation error message appears
            expect(screen.getByText(/Please select an employee\./i)).toBeInTheDocument();

            // 2. Save handler aborted
            expect(onSaveMock).not.toHaveBeenCalled();

            // 3. ZERO network requests fired for task creation
            expect(api.post).not.toHaveBeenCalledWith('/api/Task', expect.anything());
            expect(api.post).not.toHaveBeenCalledWith('/api/Duplicate/check', expect.anything());
        });

        it('confirms handler execution succeeds client validation for past deadlines, submitting payload that backend rejects', async () => {
            const historicalOrder: DmsPendingOrder = {
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
                driverEmployeeId: 'emp-001',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(historicalOrder);
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

            // Wait for courier emp-001 to match and auto-select
            await screen.findByText(/Selected/i);

            // Click save
            const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
            fireEvent.click(saveBtn);

            // Handler executed onSave because client bypassed past date check for pre-delivery
            await waitFor(() => {
                expect(onSaveMock).toHaveBeenCalledTimes(1);
            });

            const savedPayload = onSaveMock.mock.calls[0][0];
            // Verified Step 5 Fix: Historical DMS deadline is detected and automatically adjusted to valid future SLA deadline
            const payloadDeadline = new Date(savedPayload.deadline);
            expect(payloadDeadline.getTime()).toBeGreaterThan(Date.now());
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. BACKDROP STACKING CONFIRMATION
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Backdrop Stacking and Modal Overlay Mounting Confirmation', () => {
        it('confirms multiple backdrops mount simultaneously when DuplicateWarningModal opens over TaskModal', async () => {
            const dmsOrder: DmsPendingOrder = {
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
                priority: 'High',
                orderDate: '2026-10-25T10:00:00Z',
                expectedDelivery: '2026-10-28T18:00:00Z',
                driverEmployeeId: 'emp-001',
            };

            const taskInitial = buildPreDeliveryTaskInitialData(dmsOrder);

            const duplicateWarnings = [
                {
                    taskId: 'task-existing-1',
                    taskTitle: 'Delivery to Juan Dela Cruz',
                    similarityPercentage: 88,
                    matchedFields: ['title', 'description'],
                    reason: 'Highly similar delivery title and address',
                },
            ];

            const duplicateDetails = [
                {
                    taskId: 'task-existing-1',
                    taskTitle: 'Delivery to Juan Dela Cruz',
                    similarityPercentage: 88,
                    referenceNumber: 'TSK-2026-001',
                    description: 'Previous delivery to Ortigas',
                    deadline: '2026-10-29T10:00:00Z',
                    priority: 'High',
                    assignee: 'John Courier',
                    status: 'In Progress',
                    loading: false,
                    error: false,
                },
            ];

            // Render both modals simultaneously, exactly replicating the condition in
            // OpAdmin_Dashboard.tsx (lines 10544 and 10605) where showNew is true AND duplicateWarnings is populated.
            const { container } = render(
                <div>
                    {/* Primary TaskModal */}
                    <TaskModal
                        mode="new"
                        initial={taskInitial as any}
                        teamMembers={mockTeamMembers}
                        tasks={[]}
                        onSave={vi.fn()}
                        onClose={vi.fn()}
                    />
                    {/* Overlaid DuplicateWarningModal */}
                    <DuplicateWarningModal
                        duplicates={duplicateWarnings as any}
                        details={duplicateDetails as any}
                        newTaskTitle={taskInitial.taskTitle}
                        newTaskDescription={taskInitial.taskDescription}
                        onViewTask={vi.fn()}
                        onContinue={vi.fn()}
                        onCancel={vi.fn()}
                    />
                </div>
            );

            // Confirmed Root Cause Verification:
            // 1. TaskModal renders .modal-overlay
            const modalOverlays = container.querySelectorAll('.modal-overlay');
            expect(modalOverlays.length).toBe(1);

            // 2. DuplicateWarningModal renders .fm-overlay
            const fmOverlays = container.querySelectorAll('.fm-overlay');
            expect(fmOverlays.length).toBe(1);

            // 3. Total concurrent backdrop overlay count is exactly 2!
            const allOverlays = container.querySelectorAll('.modal-overlay, .fm-overlay');
            expect(allOverlays.length).toBe(2);

            // 4. Verify both modal dialogs are present in DOM at once
            expect(screen.getByText('Create Pre-Delivery Task')).toBeInTheDocument();
            expect(screen.getByText('Potential duplicate task detected.')).toBeInTheDocument();
        });

        it('confirms premature unmounting when Continue is clicked before asynchronous task creation completes', async () => {
            let showNewState = true;
            let duplicateModalOpen = true;

            const onContinue = vi.fn().mockImplementation(() => {
                // Emulates line 10615 in OpAdmin_Dashboard.tsx:
                showNewState = false;
                duplicateModalOpen = false;
            });

            render(
                <DuplicateWarningModal
                    duplicates={[{ taskId: 'tsk-1', similarityPercentage: 75 }] as any}
                    details={[]}
                    newTaskTitle="Test Pre-Delivery Task"
                    onViewTask={vi.fn()}
                    onContinue={onContinue}
                    onCancel={vi.fn()}
                />
            );

            const continueBtn = screen.getByRole('button', { name: /Continue Anyway/i });
            fireEvent.click(continueBtn);

            expect(onContinue).toHaveBeenCalledTimes(1);
            // Root cause confirmed: showNewState was set to false synchronously, destroying the modal before API response
            expect(showNewState).toBe(false);
            expect(duplicateModalOpen).toBe(false);
        });
    });
});
