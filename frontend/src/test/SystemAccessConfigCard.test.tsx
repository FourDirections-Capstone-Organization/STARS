import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SystemAccessConfigCard } from '../components/SystemAccessConfigCard/SystemAccessConfigCard';

describe('SystemAccessConfigCard', () => {
    const mockDepts = [
        { departmentId: 'dept-1', name: 'Logistics' },
        { departmentId: 'dept-2', name: 'Finance' },
    ];
    const mockPositions = [
        { jobPositionId: 'pos-1', name: 'Operations Coordinator', departmentId: 'dept-1' },
        { jobPositionId: 'pos-2', name: 'Accountant', departmentId: 'dept-2' },
    ];
    const mockRoles = ['Manager', 'Coordinator', 'Dispatcher', 'Encoder', 'Courier', 'Accountant'];

    it('renders with initial systems and badges', () => {
        render(
            <SystemAccessConfigCard
                targetSystems={['STARS', 'DMS']}
                onChangeTargetSystems={vi.fn()}
                departmentId="dept-1"
                jobPositionId="pos-1"
                role="Coordinator"
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={vi.fn()}
                onChangeRole={vi.fn()}
                departments={mockDepts}
                jobPositions={mockPositions}
                availableRoles={mockRoles}
                dmsRole="Dispatcher"
                dmsAreas={['Manila']}
                onChangeDmsRole={vi.fn()}
                onChangeDmsAreas={vi.fn()}
                fomsRole="Accountant"
                onChangeFomsRole={vi.fn()}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
            />
        );

        expect(screen.getByText(/2 of 3 Selected/i)).toBeInTheDocument();
        expect(screen.getByText(/STARS Role & Department Assignment/i)).toBeInTheDocument();
        expect(screen.getByText(/DMS Operational Role/i)).toBeInTheDocument();
        expect(screen.queryByText(/FOMS Operational Role/i)).not.toBeInTheDocument();
    });

    it('enforces at least 1 system selected by disabling unchecking the only remaining system', () => {
        const handleChangeSystems = vi.fn();
        render(
            <SystemAccessConfigCard
                targetSystems={['STARS']}
                onChangeTargetSystems={handleChangeSystems}
                departmentId="dept-1"
                jobPositionId="pos-1"
                role="Coordinator"
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={vi.fn()}
                onChangeRole={vi.fn()}
                departments={mockDepts}
                jobPositions={mockPositions}
                availableRoles={mockRoles}
                onChangeDmsRole={vi.fn()}
                onChangeDmsAreas={vi.fn()}
                onChangeFomsRole={vi.fn()}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
            />
        );

        expect(screen.getByText(/1 of 3 Selected/i)).toBeInTheDocument();

        // The checkbox for STARS should be disabled because it is the only selected system
        const checkboxes = screen.getAllByRole('checkbox');
        const starsCheckbox = checkboxes[0];
        expect(starsCheckbox).toBeDisabled();

        // Clicking it should not call onChangeTargetSystems
        fireEvent.click(starsCheckbox);
        expect(handleChangeSystems).not.toHaveBeenCalled();
    });

    it('allows toggling an unchecked system to be selected', () => {
        const handleChangeSystems = vi.fn();
        render(
            <SystemAccessConfigCard
                targetSystems={['STARS']}
                onChangeTargetSystems={handleChangeSystems}
                departmentId="dept-1"
                jobPositionId="pos-1"
                role="Coordinator"
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={vi.fn()}
                onChangeRole={vi.fn()}
                departments={mockDepts}
                jobPositions={mockPositions}
                availableRoles={mockRoles}
                onChangeDmsRole={vi.fn()}
                onChangeDmsAreas={vi.fn()}
                onChangeFomsRole={vi.fn()}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
            />
        );

        const checkboxes = screen.getAllByRole('checkbox');
        // DMS checkbox is second
        const dmsCheckbox = checkboxes[1];
        expect(dmsCheckbox).not.toBeChecked();
        expect(dmsCheckbox).not.toBeDisabled();

        fireEvent.click(dmsCheckbox);
        expect(handleChangeSystems).toHaveBeenCalledWith(['STARS', 'DMS']);
    });

    it('allows selecting any STARS role even without job position and triggers onChangeRole', () => {
        const handleChangeRole = vi.fn();
        render(
            <SystemAccessConfigCard
                targetSystems={['STARS']}
                onChangeTargetSystems={vi.fn()}
                departmentId="dept-1"
                jobPositionId=""
                role="Courier"
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={vi.fn()}
                onChangeRole={handleChangeRole}
                departments={mockDepts}
                jobPositions={mockPositions}
                availableRoles={mockRoles}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
                onChangeDmsRole={vi.fn()}
                onChangeDmsAreas={vi.fn()}
                onChangeFomsRole={vi.fn()}
            />
        );

        const roleSelect = screen.getByLabelText(/STARS Operational Role/i) as HTMLSelectElement;
        expect(roleSelect).not.toBeDisabled();
        expect(roleSelect.value).toBe('Courier');

        // All system roles should be available options
        const optionValues = Array.from(roleSelect.options).map(o => o.value);
        expect(optionValues).toContain('Manager');
        expect(optionValues).toContain('Dispatcher');
        expect(optionValues).toContain('Coordinator');
        expect(optionValues).toContain('Encoder');
        expect(optionValues).toContain('Courier');
        expect(optionValues).toContain('Accountant');

        // Changing the role should trigger onChangeRole
        fireEvent.change(roleSelect, { target: { value: 'Dispatcher' } });
        expect(handleChangeRole).toHaveBeenCalledWith('Dispatcher');
    });

    it('matches department and position IDs case-insensitively and renders selected names', () => {
        render(
            <SystemAccessConfigCard
                targetSystems={['STARS']}
                onChangeTargetSystems={vi.fn()}
                departmentId="DEPT-1"
                jobPositionId="POS-1"
                role="Coordinator"
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={vi.fn()}
                onChangeRole={vi.fn()}
                departments={mockDepts}
                jobPositions={mockPositions}
                availableRoles={mockRoles}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
                onChangeDmsRole={vi.fn()}
                onChangeDmsAreas={vi.fn()}
                onChangeFomsRole={vi.fn()}
            />
        );

        const deptSelect = screen.getByLabelText(/Department/i) as HTMLSelectElement;
        const posSelect = screen.getByLabelText(/Position/i) as HTMLSelectElement;
        const roleSelect = screen.getByLabelText(/STARS Operational Role/i) as HTMLSelectElement;

        expect(deptSelect.value.toLowerCase()).toBe('dept-1');
        expect(posSelect.value.toLowerCase()).toBe('pos-1');
        expect(roleSelect.value).toBe('Coordinator');
    });
});
