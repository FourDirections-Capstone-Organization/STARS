import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ManageEmployeesTab, RecentEmployee } from '../Pages/SystemAdmin_Dashboard/SystemAdmin_Dashboard';
import StatusBadge from '../components/ui/StatusBadge';

describe('Manage Employee Status Filter & Inactive Status', () => {
    const mockEmployees: RecentEmployee[] = [
        {
            employeeNumber: 'EMP001',
            employeeName: 'Alice Active',
            role: 'Employee',
            contactNumber: '1234567890',
            accountStatus: 'Active',
            email: 'alice@example.com',
        },
        {
            employeeNumber: 'EMP002',
            employeeName: 'Ian Inactive',
            role: 'Employee',
            contactNumber: '1234567891',
            accountStatus: 'Inactive',
            email: 'ian@example.com',
        },
        {
            employeeNumber: 'EMP003',
            employeeName: 'Dan Deactivated',
            role: 'Employee',
            contactNumber: '1234567892',
            accountStatus: 'Deactivated',
            email: 'dan@example.com',
        },
    ];

    it('renders the status filter dropdown with Active, Inactive, and Deactivated options', () => {
        const onEmpPageChange = vi.fn();
        render(
            <ManageEmployeesTab
                employees={mockEmployees}
                loading={false}
                onSelectEmployee={vi.fn()}
                onAddEmployee={vi.fn()}
                empPage={1}
                empTotalPages={1}
                onEmpPageChange={onEmpPageChange}
                onEditEmployee={vi.fn()}
                onArchiveEmployee={vi.fn()}
                onViewEmployee={vi.fn()}
            />
        );

        const selectElements = screen.getAllByRole('combobox');
        // The second select is the status filter
        const statusSelect = selectElements.find(el => {
            const options = Array.from(el.querySelectorAll('option')).map(o => o.value);
            return options.includes('Active') && options.includes('Inactive') && options.includes('Deactivated');
        });

        expect(statusSelect).toBeDefined();
        const optionValues = Array.from(statusSelect!.querySelectorAll('option')).map(o => o.value);
        expect(optionValues).toEqual(['', 'Active', 'Inactive', 'Deactivated']);
    });

    it('triggers onEmpPageChange with status "Inactive" when Inactive is selected', () => {
        const onEmpPageChange = vi.fn();
        render(
            <ManageEmployeesTab
                employees={mockEmployees}
                loading={false}
                onSelectEmployee={vi.fn()}
                onAddEmployee={vi.fn()}
                empPage={1}
                empTotalPages={1}
                onEmpPageChange={onEmpPageChange}
                onEditEmployee={vi.fn()}
                onArchiveEmployee={vi.fn()}
                onViewEmployee={vi.fn()}
            />
        );

        const selectElements = screen.getAllByRole('combobox');
        const statusSelect = selectElements.find(el => {
            const options = Array.from(el.querySelectorAll('option')).map(o => o.value);
            return options.includes('Inactive');
        })!;

        // Change to Inactive
        fireEvent.change(statusSelect, { target: { value: 'Inactive' } });

        expect(onEmpPageChange).toHaveBeenCalledWith(1, {
            search: '',
            role: '',
            status: 'Inactive',
        });
    });

    it('renders StatusBadge with inactive class for Inactive status', () => {
        const { container } = render(<StatusBadge status="Inactive" />);
        const badge = container.querySelector('.status-badge.inactive');
        expect(badge).not.toBeNull();
        expect(badge?.textContent).toContain('Inactive');
    });

    it('correctly maps and filters inactive accounts client-side', () => {
        const rawUsers = [
            { employeeNumber: '0001', firstName: 'Active', lastName: 'User', isActive: true, isDeactivated: false },
            { employeeNumber: '0002', firstName: 'Inactive', lastName: 'User', isActive: false, isDeactivated: false },
            { employeeNumber: '0003', firstName: 'Deactivated', lastName: 'User', isActive: false, isDeactivated: true },
        ];

        // Simulate the mapping logic used in fetchEmployees
        const mapUser = (e: any) => ({
            employeeNumber: e.employeeNumber,
            employeeName: `${e.firstName} ${e.lastName}`,
            accountStatus: e.accountStatus || (e.isDeactivated ? 'Deactivated' : (e.isActive ? 'Active' : 'Inactive')),
        });

        const mapped = rawUsers.map(mapUser);
        expect(mapped[0].accountStatus).toBe('Active');
        expect(mapped[1].accountStatus).toBe('Inactive');
        expect(mapped[2].accountStatus).toBe('Deactivated');

        // Test filtering by "Inactive"
        const filterStatus = 'Inactive';
        const inactiveFiltered = mapped.filter(e => !filterStatus || e.accountStatus.toLowerCase() === filterStatus.toLowerCase());
        expect(inactiveFiltered).toHaveLength(1);
        expect(inactiveFiltered[0].employeeNumber).toBe('0002');
        expect(inactiveFiltered[0].accountStatus).toBe('Inactive');
    });
});
