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
});
