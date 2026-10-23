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

    it('filters positions by selected department and disables position select when no department is chosen', () => {
        const { rerender } = render(
            <SystemAccessConfigCard
                targetSystems={['STARS']}
                onChangeTargetSystems={vi.fn()}
                departmentId=""
                jobPositionId=""
                role=""
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

        const posSelect = screen.getByLabelText(/Position/i) as HTMLSelectElement;
        expect(posSelect).toBeDisabled();
        expect(posSelect.options.length).toBe(1);
        expect(posSelect.options[0].text).toContain('Select a department first');

        // Now select dept-1 (Logistics)
        rerender(
            <SystemAccessConfigCard
                targetSystems={['STARS']}
                onChangeTargetSystems={vi.fn()}
                departmentId="dept-1"
                jobPositionId=""
                role=""
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

        expect(posSelect).not.toBeDisabled();
        const availableOptionValues = Array.from(posSelect.options).map(o => o.value);
        expect(availableOptionValues).toContain('pos-1'); // Operations Coordinator (dept-1)
        expect(availableOptionValues).not.toContain('pos-2'); // Accountant (dept-2)
    });

    it('filters STARS operational role and automatically connects to FOMS Head Accountant role upon position selection', () => {
        const handleJobPositionChange = vi.fn();
        const handleRoleChange = vi.fn();
        const handleFomsRoleChange = vi.fn();
        const handleDmsRoleChange = vi.fn();

        const extendedPositions = [
            ...mockPositions,
            { jobPositionId: 'pos-3', name: 'Head Accountant', departmentId: 'dept-2' },
        ];

        render(
            <SystemAccessConfigCard
                targetSystems={['STARS', 'FOMS']}
                onChangeTargetSystems={vi.fn()}
                departmentId="dept-2"
                jobPositionId="pos-3"
                role="Accountant"
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={handleJobPositionChange}
                onChangeRole={handleRoleChange}
                departments={mockDepts}
                jobPositions={extendedPositions}
                availableRoles={mockRoles}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
                onChangeDmsRole={handleDmsRoleChange}
                onChangeDmsAreas={vi.fn()}
                fomsRole="Head Accountant"
                onChangeFomsRole={handleFomsRoleChange}
            />
        );

        // Position options must only include Finance positions (dept-2)
        const posSelect = screen.getByLabelText(/Position/i) as HTMLSelectElement;
        const posValues = Array.from(posSelect.options).map(o => o.value);
        expect(posValues).toContain('pos-2'); // Accountant
        expect(posValues).toContain('pos-3'); // Head Accountant
        expect(posValues).not.toContain('pos-1'); // Operations Coordinator (dept-1)

        // STARS operational role must be restricted to Accountant and Manager
        const roleSelect = screen.getByLabelText(/STARS Operational Role/i) as HTMLSelectElement;
        const roleValues = Array.from(roleSelect.options).map(o => o.value);
        expect(roleValues).toContain('Accountant');
        expect(roleValues).toContain('Manager');
        expect(roleValues).not.toContain('Courier');
        expect(roleValues).not.toContain('Dispatcher');

        // Selecting Head Accountant position triggers automatic synchronization
        fireEvent.change(posSelect, { target: { value: 'pos-3' } });
        expect(handleJobPositionChange).toHaveBeenCalledWith('pos-3');
        expect(handleFomsRoleChange).toHaveBeenCalledWith('Head Accountant');
    });

    it('automatically connects to DMS Driver role upon selecting Courier / Driver position', () => {
        const handleJobPositionChange = vi.fn();
        const handleRoleChange = vi.fn();
        const handleDmsRoleChange = vi.fn();

        const extendedPositions = [
            ...mockPositions,
            { jobPositionId: 'pos-4', name: 'Courier / Driver', departmentId: 'dept-1' },
        ];

        render(
            <SystemAccessConfigCard
                targetSystems={['STARS', 'DMS']}
                onChangeTargetSystems={vi.fn()}
                departmentId="dept-1"
                jobPositionId=""
                role=""
                onChangeDepartmentId={vi.fn()}
                onChangeJobPositionId={handleJobPositionChange}
                onChangeRole={handleRoleChange}
                departments={mockDepts}
                jobPositions={extendedPositions}
                availableRoles={mockRoles}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
                onChangeDmsRole={handleDmsRoleChange}
                onChangeDmsAreas={vi.fn()}
                onChangeFomsRole={vi.fn()}
            />
        );

        const posSelect = screen.getByLabelText(/Position/i) as HTMLSelectElement;
        fireEvent.change(posSelect, { target: { value: 'pos-4' } });

        expect(handleJobPositionChange).toHaveBeenCalledWith('pos-4');
        expect(handleRoleChange).toHaveBeenCalledWith('Courier');
        expect(handleDmsRoleChange).toHaveBeenCalledWith('Driver');
    });
});
