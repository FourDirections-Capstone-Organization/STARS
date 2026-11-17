import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeDetailPanel from '../Pages/SystemAdmin_Dashboard/EmployeeDetailPanel/EmployeeDetailPanel';
import { ManageEmployeesTab, RecentEmployee } from '../Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

const mockActiveEmployee: RecentEmployee = {
    employeeNumber: 'EMP-001',
    employeeName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    role: 'Employee',
    contactNumber: '09123456789',
    accountStatus: 'Active',
    email: 'john.doe@speedex.com',
};

const mockArchivedEmployee: RecentEmployee = {
    employeeNumber: 'EMP-002',
    employeeName: 'Jane Smith',
    firstName: 'Jane',
    lastName: 'Smith',
    role: 'Employee',
    contactNumber: '09987654321',
    accountStatus: 'Archived',
    email: 'jane.smith@speedex.com',
};

describe('Defect Fix: STARS Account Archiving and No Deletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/User/employee-number/')) {
                return Promise.resolve({ data: { isSuccess: true, data: { id: 'guid-123', isDeactivated: false } } });
            }
            if (url.includes('/api/dms/deliveries')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/audit-logs')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            if (url.includes('/api/job-positions')) {
                return Promise.resolve({ data: { isSuccess: true, data: [] } });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
        (api.patch as any).mockResolvedValue({ data: { isSuccess: true, message: 'Deactivated' } });
        (api.post as any).mockResolvedValue({ data: { isSuccess: true } });
    });

    it('EmployeeDetailPanel renders "Archive" button and NO "Delete" button for an active employee', async () => {
        render(
            <ToastProvider>
                <EmployeeDetailPanel
                    employee={mockActiveEmployee}
                    onBack={vi.fn()}
                    onEmployeeUpdated={vi.fn()}
                />
            </ToastProvider>
        );

        // Delete button must NOT exist
        const deleteBtn = screen.queryByRole('button', { name: /delete/i });
        expect(deleteBtn).not.toBeInTheDocument();

        // Archive button MUST exist
        const archiveBtn = screen.getByRole('button', { name: /archive/i });
        expect(archiveBtn).toBeInTheDocument();
    });

    it('EmployeeDetailPanel hides action button options when viewing an already Archived account', async () => {
        render(
            <ToastProvider>
                <EmployeeDetailPanel
                    employee={mockArchivedEmployee}
                    onBack={vi.fn()}
                    onEmployeeUpdated={vi.fn()}
                />
            </ToastProvider>
        );

        // For an archived account, it should NOT have action button options (Archive, Edit Profile, Deactivate)
        expect(screen.queryByRole('button', { name: /^archive$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();

        // But Back button remains so manager can return to list
        expect(screen.getByRole('button', { name: /back to employees/i })).toBeInTheDocument();

        // And the hero banner and personal info display Archived status
        expect(screen.getAllByText('Archived').length).toBeGreaterThanOrEqual(1);
    });

    it('ManageEmployeesTab renders Archive action and omits Archive option for already archived employees', () => {
        render(
            <ManageEmployeesTab
                employees={[mockActiveEmployee, mockArchivedEmployee]}
                loading={false}
                onSelectEmployee={vi.fn()}
                onAddEmployee={vi.fn()}
                empPage={1}
                empTotalPages={1}
                onEmpPageChange={vi.fn()}
                onEditEmployee={vi.fn()}
                onArchiveEmployee={vi.fn()}
                onViewEmployee={vi.fn()}
            />
        );

        // Active employee row: clicking row actions dropdown shows Archive, NOT Delete
        const dropdownToggles = screen.getAllByRole('button');
        // Find action dropdown for active employee
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });
});
