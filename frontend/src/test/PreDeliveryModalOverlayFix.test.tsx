import React, { useState } from 'react';
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

describe('Pre-Delivery Modal Overlay & Loading State Fix (Step 3)', () => {
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
    ];

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

    it('does not render .modal-overlay when hideOverlay is true', () => {
        const taskInitial = buildPreDeliveryTaskInitialData(dmsOrder);
        const { container } = render(
            <TaskModal
                mode="new"
                initial={taskInitial as any}
                teamMembers={mockTeamMembers}
                tasks={[]}
                onSave={vi.fn()}
                onClose={vi.fn()}
                hideOverlay={true}
            />
        );

        const modalOverlays = container.querySelectorAll('.modal-overlay');
        expect(modalOverlays.length).toBe(0);
        expect(screen.queryByText('Create Pre-Delivery Task')).not.toBeInTheDocument();
    });

    it('renders exactly ONE backdrop overlay when DuplicateWarningModal is active with hideOverlay={true}', () => {
        const taskInitial = buildPreDeliveryTaskInitialData(dmsOrder);
        const isDuplicateModalActive = duplicateWarnings.length > 0;

        const { container } = render(
            <div>
                {/* Primary TaskModal with hideOverlay={true} */}
                <TaskModal
                    mode="new"
                    initial={taskInitial as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                    hideOverlay={isDuplicateModalActive}
                />
                {/* Active DuplicateWarningModal */}
                {isDuplicateModalActive && (
                    <DuplicateWarningModal
                        duplicates={duplicateWarnings as any}
                        details={duplicateDetails as any}
                        newTaskTitle={taskInitial.taskTitle}
                        newTaskDescription={taskInitial.taskDescription}
                        onViewTask={vi.fn()}
                        onContinue={vi.fn()}
                        onCancel={vi.fn()}
                    />
                )}
            </div>
        );

        // 1. TaskModal overlay is hidden
        const modalOverlays = container.querySelectorAll('.modal-overlay');
        expect(modalOverlays.length).toBe(0);

        // 2. DuplicateWarningModal overlay is active
        const fmOverlays = container.querySelectorAll('.fm-overlay');
        expect(fmOverlays.length).toBe(1);

        // 3. Exactly single backdrop is mounted in the DOM
        const allOverlays = container.querySelectorAll('.modal-overlay, .fm-overlay');
        expect(allOverlays.length).toBe(1);

        // 4. Duplicate warning dialog is visible to the coordinator
        expect(screen.getByText('Potential duplicate task detected.')).toBeInTheDocument();
    });

    it('renders loading state when isSaving is true', () => {
        const taskInitial = buildPreDeliveryTaskInitialData(dmsOrder);
        const onCloseMock = vi.fn();

        const { container } = render(
            <TaskModal
                mode="new"
                initial={taskInitial as any}
                teamMembers={mockTeamMembers}
                tasks={[]}
                onSave={vi.fn()}
                onClose={onCloseMock}
                isSaving={true}
            />
        );

        // Save button displays saving state and spinner
        const saveButton = screen.getByRole('button', { name: /Saving…/i });
        expect(saveButton).toBeInTheDocument();
        expect(saveButton).toBeDisabled();

        // Cancel button is disabled while saving
        const cancelButton = screen.getByRole('button', { name: /Cancel/i });
        expect(cancelButton).toBeDisabled();

        // Header close icon button is disabled while saving
        const closeBtn = screen.getByLabelText(/Close modal/i);
        expect(closeBtn).toBeDisabled();

        // Backdrop click does not trigger onClose while saving
        const overlay = container.querySelector('.modal-overlay')!;
        fireEvent.click(overlay);
        expect(onCloseMock).not.toHaveBeenCalled();
    });

    it('preserves TaskModal state and displays loading state during async save after Continue Anyway', async () => {
        let resolveSave: (val: any) => void = () => {};
        const asyncSavePromise = new Promise(resolve => {
            resolveSave = resolve;
        });

        const TestFlowComponent: React.FC = () => {
            const [showNew, setShowNew] = useState(true);
            const [duplicateWarningsState, setDuplicateWarningsState] = useState<any[]>(duplicateWarnings);
            const [isSaving, setIsSaving] = useState(false);
            const [savedSuccess, setSavedSuccess] = useState(false);

            const isDuplicateActive = duplicateWarningsState.length > 0;

            const handleContinue = async () => {
                // 1. Hide duplicate warning modal
                setDuplicateWarningsState([]);
                // 2. Set saving state without closing TaskModal
                setIsSaving(true);
                // 3. Await asynchronous save
                await asyncSavePromise;
                // 4. On success, close modal and show success
                setIsSaving(false);
                setShowNew(false);
                setSavedSuccess(true);
            };

            return (
                <div>
                    {showNew && (
                        <TaskModal
                            mode="new"
                            initial={buildPreDeliveryTaskInitialData(dmsOrder) as any}
                            teamMembers={mockTeamMembers}
                            tasks={[]}
                            onSave={vi.fn()}
                            onClose={() => setShowNew(false)}
                            hideOverlay={isDuplicateActive}
                            isSaving={isSaving}
                        />
                    )}
                    {isDuplicateActive && (
                        <DuplicateWarningModal
                            duplicates={duplicateWarningsState}
                            details={duplicateDetails as any}
                            newTaskTitle="[Pre-Delivery] Delivery to Juan Dela Cruz - Waybill WB-2026-000201"
                            onViewTask={vi.fn()}
                            onContinue={handleContinue}
                            onCancel={() => {
                                setDuplicateWarningsState([]);
                                setShowNew(false);
                            }}
                        />
                    )}
                    {savedSuccess && <div data-testid="task-save-success">Task Successfully Created</div>}
                </div>
            );
        };

        const { container } = render(<TestFlowComponent />);

        // Phase 1: Duplicate modal is active -> Single backdrop
        expect(container.querySelectorAll('.fm-overlay').length).toBe(1);
        expect(container.querySelectorAll('.modal-overlay').length).toBe(0);

        // Click "Continue Anyway"
        const continueBtn = screen.getByRole('button', { name: /Continue Anyway/i });
        fireEvent.click(continueBtn);

        // Phase 2: Duplicate modal closes, TaskModal re-appears with loading state
        await waitFor(() => {
            expect(container.querySelectorAll('.fm-overlay').length).toBe(0);
            expect(container.querySelectorAll('.modal-overlay').length).toBe(1);
            expect(screen.getByRole('button', { name: /Saving…/i })).toBeDisabled();
        });

        // Phase 3: Async save completes -> TaskModal closes and success message shows
        resolveSave({ data: { isSuccess: true } });

        await waitFor(() => {
            expect(container.querySelectorAll('.modal-overlay').length).toBe(0);
            expect(screen.getByTestId('task-save-success')).toBeInTheDocument();
        });
    });

    it('keeps TaskModal open and resets loading state when async save fails', async () => {
        let rejectSave: (err: any) => void = () => {};
        const asyncSavePromise = new Promise((_, reject) => {
            rejectSave = reject;
        });

        const TestErrorFlowComponent: React.FC = () => {
            const [showNew, setShowNew] = useState(true);
            const [duplicateWarningsState, setDuplicateWarningsState] = useState<any[]>(duplicateWarnings);
            const [isSaving, setIsSaving] = useState(false);
            const [errorMessage, setErrorMessage] = useState('');

            const isDuplicateActive = duplicateWarningsState.length > 0;

            const handleContinue = async () => {
                setDuplicateWarningsState([]);
                setIsSaving(true);
                try {
                    await asyncSavePromise;
                    setShowNew(false);
                } catch {
                    setErrorMessage('Failed to create task on server.');
                } finally {
                    setIsSaving(false);
                }
            };

            return (
                <div>
                    {showNew && (
                        <TaskModal
                            mode="new"
                            initial={buildPreDeliveryTaskInitialData(dmsOrder) as any}
                            teamMembers={mockTeamMembers}
                            tasks={[]}
                            onSave={vi.fn()}
                            onClose={() => setShowNew(false)}
                            hideOverlay={isDuplicateActive}
                            isSaving={isSaving}
                        />
                    )}
                    {isDuplicateActive && (
                        <DuplicateWarningModal
                            duplicates={duplicateWarningsState}
                            details={duplicateDetails as any}
                            newTaskTitle="[Pre-Delivery] Delivery to Juan Dela Cruz - Waybill WB-2026-000201"
                            onViewTask={vi.fn()}
                            onContinue={handleContinue}
                            onCancel={() => {
                                setDuplicateWarningsState([]);
                                setShowNew(false);
                            }}
                        />
                    )}
                    {errorMessage && <div data-testid="error-toast">{errorMessage}</div>}
                </div>
            );
        };

        const { container } = render(<TestErrorFlowComponent />);

        // Click "Continue Anyway"
        const continueBtn = screen.getByRole('button', { name: /Continue Anyway/i });
        fireEvent.click(continueBtn);

        // While pending: loading state
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Saving…/i })).toBeDisabled();
        });

        // Fail the async save
        rejectSave(new Error('Network error'));

        // TaskModal remains open and loading state resets to "Save Changes"
        await waitFor(() => {
            expect(screen.getByTestId('error-toast')).toBeInTheDocument();
            expect(container.querySelectorAll('.modal-overlay').length).toBe(1);
            expect(screen.getByRole('button', { name: /Save Changes/i })).not.toBeDisabled();
        });
    });
});
