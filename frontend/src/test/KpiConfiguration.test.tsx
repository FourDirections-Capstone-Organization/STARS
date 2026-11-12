import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KpiConfigurationTab } from '../Pages/OpAdmin_Dashboard/KpiConfiguration/KpiConfigurationTab';
import { KpiConfigurationEditor } from '../Pages/OpAdmin_Dashboard/KpiConfiguration/KpiConfigurationEditor';
import { FormulaBuilderModal } from '../Pages/OpAdmin_Dashboard/KpiConfiguration/FormulaBuilderModal';
import {
    KpiConfiguration,
    DepartmentOption,
    STANDARD_METRIC_TEMPLATES,
    KpiVariableDefinition,
    DEFAULT_KPI_VARIABLES
} from '../Pages/OpAdmin_Dashboard/KpiConfiguration/types';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';

vi.mock('../api');

const mockDepartments: DepartmentOption[] = [
    { id: 'dept-1', name: 'Logistics Operations' },
    { id: 'dept-2', name: 'Sorting Hub' }
];

const mockConfigurations: KpiConfiguration[] = [
    {
        id: '00000000-0000-0000-0000-000000000001',
        title: 'Default Logistics Operations KPI',
        description: 'Standard baseline logistics performance metrics',
        targetRole: undefined,
        departmentId: undefined,
        departmentName: undefined,
        effectiveStartDate: '2026-01-01T00:00:00Z',
        effectiveEndDate: undefined,
        isActive: true,
        overallGreenThreshold: 85.0,
        overallAmberThreshold: 70.0,
        overallRedThreshold: 60.0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        items: [
            {
                name: 'On-Time In-Full (OTIF)',
                metricCode: 'OTIF',
                weight: 35.0,
                unit: '%',
                targetValue: 100.0,
                greenThreshold: 90.0,
                amberThreshold: 75.0,
                redThreshold: 60.0,
                isLowerBetter: false,
                order: 1
            },
            {
                name: 'Order Accuracy Rate',
                metricCode: 'ORDER_ACCURACY',
                weight: 25.0,
                unit: '%',
                targetValue: 100.0,
                greenThreshold: 90.0,
                amberThreshold: 80.0,
                redThreshold: 70.0,
                isLowerBetter: false,
                order: 2
            },
            {
                name: 'Task Completion Rate',
                metricCode: 'TASK_COMPLETION_RATE',
                weight: 20.0,
                unit: '%',
                targetValue: 100.0,
                greenThreshold: 85.0,
                amberThreshold: 70.0,
                redThreshold: 55.0,
                isLowerBetter: false,
                order: 3
            },
            {
                name: 'Average Handling Time (AHT)',
                metricCode: 'AVERAGE_HANDLING_TIME',
                weight: 20.0,
                unit: 'hrs',
                targetValue: 4.0,
                greenThreshold: 4.0,
                amberThreshold: 8.0,
                redThreshold: 12.0,
                isLowerBetter: true,
                order: 4
            }
        ]
    },
    {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Courier Express Q4 Configuration',
        description: 'High velocity dispatch performance model',
        targetRole: 'Courier',
        departmentId: 'dept-1',
        departmentName: 'Logistics Operations',
        effectiveStartDate: '2026-10-01T00:00:00Z',
        effectiveEndDate: '2026-12-31T00:00:00Z',
        isActive: true,
        overallGreenThreshold: 90.0,
        overallAmberThreshold: 75.0,
        overallRedThreshold: 65.0,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        items: [
            {
                name: 'On-Time In-Full (OTIF)',
                metricCode: 'OTIF',
                weight: 50.0,
                unit: '%',
                targetValue: 100.0,
                greenThreshold: 95.0,
                amberThreshold: 80.0,
                redThreshold: 65.0,
                isLowerBetter: false,
                order: 1
            },
            {
                name: 'Order Accuracy Rate',
                metricCode: 'ORDER_ACCURACY',
                weight: 50.0,
                unit: '%',
                targetValue: 100.0,
                greenThreshold: 95.0,
                amberThreshold: 85.0,
                redThreshold: 75.0,
                isLowerBetter: false,
                order: 2
            }
        ]
    }
];

const mockVariables: KpiVariableDefinition[] = [
    {
        name: 'total_assigned_tasks',
        displayName: 'Total Assigned Tasks',
        description: 'Total tasks assigned.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 50.0
    },
    {
        name: 'completed_tasks',
        displayName: 'Completed Tasks',
        description: 'Number of completed tasks.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 45.0
    },
    {
        name: 'otif_tasks',
        displayName: 'OTIF Tasks',
        description: 'Tasks on time and in full.',
        category: 'Counts',
        unit: 'tasks',
        defaultSampleValue: 38.0
    },
    {
        name: 'total_handling_hours',
        displayName: 'Total Handling Hours',
        description: 'Total hours.',
        category: 'Duration',
        unit: 'hours',
        defaultSampleValue: 120.0
    },
    {
        name: 'completion_rate',
        displayName: 'Completion Rate',
        description: 'Percentage completed.',
        category: 'Rates',
        unit: '%',
        defaultSampleValue: 90.0
    }
];

describe('KpiConfigurationTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url === '/api/kpi/configurations') {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockConfigurations
                    }
                });
            }
            if (url === '/api/kpi/formula/variables') {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: mockVariables
                    }
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: [] } });
        });
    });

    const renderWithToast = (ui: React.ReactElement) => {
        return render(<ToastProvider>{ui}</ToastProvider>);
    };

    it('renders configuration list with cards and badges', async () => {
        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        expect(screen.getByText(/KPI Weighting & Threshold Configurations/i)).toBeInTheDocument();
        expect(screen.getByTestId('create-kpi-config-btn')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Default Logistics Operations KPI')).toBeInTheDocument();
            expect(screen.getByText('Courier Express Q4 Configuration')).toBeInTheDocument();
        });

        expect(screen.getByText('System Default')).toBeInTheDocument();
        expect(screen.getAllByText('Courier').length).toBeGreaterThan(0);
    });

    it('filters configurations by search text', async () => {
        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByText('Default Logistics Operations KPI')).toBeInTheDocument();
        });

        const searchInput = screen.getByTestId('kpi-search-input');
        fireEvent.change(searchInput, { target: { value: 'Courier Express' } });

        expect(screen.getByText('Courier Express Q4 Configuration')).toBeInTheDocument();
        expect(screen.queryByText('Default Logistics Operations KPI')).not.toBeInTheDocument();
    });

    it('switches to editor mode when clicking New Configuration', async () => {
        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        const createBtn = screen.getByTestId('create-kpi-config-btn');
        fireEvent.click(createBtn);

        expect(screen.getByTestId('kpi-configuration-editor')).toBeInTheDocument();
        expect(screen.getByText(/New Prospective KPI Configuration/i)).toBeInTheDocument();
    });

    it('ties role filter options in filter bar to the selected department', async () => {
        const depts: DepartmentOption[] = [
            { id: 'dept-dl', name: 'Delivery and Logistics' },
            { id: 'dept-cs', name: 'Coordinator & Customer Service Team' }
        ];
        renderWithToast(<KpiConfigurationTab departments={depts} />);

        await waitFor(() => {
            expect(screen.getByText('Default Logistics Operations KPI')).toBeInTheDocument();
        });

        const deptFilter = screen.getByTestId('kpi-filter-department') as HTMLSelectElement;
        const roleFilter = screen.getByTestId('kpi-filter-role') as HTMLSelectElement;

        // Select Delivery and Logistics -> should show Courier, Dispatcher, Encoder (not Manager/Accountant)
        fireEvent.change(deptFilter, { target: { value: 'dept-dl' } });
        const dlOptions = Array.from(roleFilter.options).map(o => o.value);
        expect(dlOptions).toContain('Courier');
        expect(dlOptions).toContain('Dispatcher');
        expect(dlOptions).toContain('Encoder');
        expect(dlOptions).not.toContain('Manager');
        expect(dlOptions).not.toContain('Accountant');

        // Select Courier, then switch to Coordinator & Customer Service Team -> Courier should clear
        fireEvent.change(roleFilter, { target: { value: 'Courier' } });
        expect(roleFilter.value).toBe('Courier');

        fireEvent.change(deptFilter, { target: { value: 'dept-cs' } });
        expect(roleFilter.value).toBe('');
        const csOptions = Array.from(roleFilter.options).map(o => o.value);
        expect(csOptions).toContain('Coordinator');
        expect(csOptions).toContain('Manager');
        expect(csOptions).not.toContain('Courier');
        expect(csOptions).not.toContain('Dispatcher');
    });
});

describe('KpiConfigurationEditor', () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: mockVariables
            }
        });
    });

    it('renders editor with required department, disabled role filter, no pre-loaded general metrics, and 4-metric dropdown', () => {
        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        expect(screen.getByTestId('config-title-input')).toBeInTheDocument();
        expect(screen.getByTestId('config-start-date-input')).toBeInTheDocument();

        // Department is required (no "All Departments (Global)" option)
        const deptSelect = screen.getByTestId('config-department-select') as HTMLSelectElement;
        const deptOptionTexts = Array.from(deptSelect.options).map(o => o.text);
        expect(deptOptionTexts.some(t => /All Departments/i.test(t))).toBe(false);

        // Role select is disabled until a department is chosen and has no "All Operational Roles" option
        const roleSelect = screen.getByTestId('config-role-select') as HTMLSelectElement;
        expect(roleSelect).toBeDisabled();
        const roleOptionTexts = Array.from(roleSelect.options).map(o => o.text);
        expect(roleOptionTexts.some(t => /All Operational Roles/i.test(t))).toBe(false);

        // No general metrics pre-loaded; metric dropdown contains the 4 existing metrics
        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('0.0% / 100.0%');
        expect(screen.getByTestId('empty-metric-selection')).toBeInTheDocument();

        const metricSelect = screen.getByTestId('kpi-metric-select') as HTMLSelectElement;
        const metricValues = Array.from(metricSelect.options).map(o => o.value).filter(Boolean);
        expect(metricValues).toEqual([
            'OTIF',
            'ORDER_ACCURACY',
            'TASK_COMPLETION_RATE',
            'AVERAGE_HANDLING_TIME'
        ]);

        expect(screen.getByTestId('save-kpi-config-btn')).toBeDisabled();
    });

    it('ties target role filter options strictly to selected department and clears incompatible role on change', () => {
        const deptList: DepartmentOption[] = [
            { id: 'dept-dl', name: 'Delivery and Logistics' },
            { id: 'dept-cs', name: 'Coordinator & Customer Service Team' }
        ];

        render(
            <KpiConfigurationEditor
                departments={deptList}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        const deptSelect = screen.getByTestId('config-department-select') as HTMLSelectElement;
        const roleSelect = screen.getByTestId('config-role-select') as HTMLSelectElement;

        // Select Delivery and Logistics
        fireEvent.change(deptSelect, { target: { value: 'dept-dl' } });
        expect(roleSelect).not.toBeDisabled();

        const dlRoles = Array.from(roleSelect.options).map(o => o.value).filter(Boolean);
        expect(dlRoles).toEqual(['Courier', 'Dispatcher', 'Encoder']);
        expect(dlRoles).not.toContain('Manager');
        expect(dlRoles).not.toContain('Accountant');

        // Choose Courier
        fireEvent.change(roleSelect, { target: { value: 'Courier' } });
        expect(roleSelect.value).toBe('Courier');

        // Switch to Coordinator & Customer Service Team -> Courier is inapplicable and cleared
        fireEvent.change(deptSelect, { target: { value: 'dept-cs' } });
        expect(roleSelect.value).toBe('');
        const csRoles = Array.from(roleSelect.options).map(o => o.value).filter(Boolean);
        expect(csRoles).toEqual(['Coordinator', 'Manager']);
    });

    it('uses backend department roles endpoint when available', async () => {
        (api.get as any).mockImplementation((url: string) => {
            if (url === '/api/kpi/departments/dept-1/roles') {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: [
                            { role: 'Courier', displayName: 'Courier / Driver' },
                            { role: 'Dispatcher', displayName: 'Dispatcher' }
                        ]
                    }
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: mockVariables } });
        });

        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        fireEvent.change(screen.getByTestId('config-department-select'), {
            target: { value: 'dept-1' }
        });

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/api/kpi/departments/dept-1/roles');
            const roleSelect = screen.getByTestId('config-role-select') as HTMLSelectElement;
            const roleValues = Array.from(roleSelect.options).map(o => o.value).filter(Boolean);
            expect(roleValues).toEqual(['Courier', 'Dispatcher']);
        });
    });

    it('validates prospective start and end dates', () => {
        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        const titleInput = screen.getByTestId('config-title-input');
        fireEvent.change(titleInput, { target: { value: 'Prospective Date Plan' } });

        const startDateInput = screen.getByTestId('config-start-date-input');
        const endDateInput = screen.getByTestId('config-end-date-input');

        fireEvent.change(startDateInput, { target: { value: '2026-11-01' } });
        fireEvent.change(endDateInput, { target: { value: '2026-10-15' } }); // Before start date

        expect(screen.getByTestId('validation-alert')).toBeInTheDocument();
        expect(screen.getByText(/Effective end date must be strictly after the start date/i)).toBeInTheDocument();
        expect(screen.getByTestId('save-kpi-config-btn')).toBeDisabled();
    });

    it('allows selecting only one KPI metric per role from dropdown with 100% weight and submits valid configuration', async () => {
        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        fireEvent.change(screen.getByTestId('config-title-input'), {
            target: { value: 'Valid Q4 2026 Operations Config' }
        });
        fireEvent.change(screen.getByTestId('config-department-select'), {
            target: { value: 'dept-1' }
        });
        fireEvent.change(screen.getByTestId('config-role-select'), {
            target: { value: 'Courier' }
        });

        const metricSelect = screen.getByTestId('kpi-metric-select');
        // Select OTIF first, then switch to ORDER_ACCURACY -> replaces rather than appending
        fireEvent.change(metricSelect, { target: { value: 'OTIF' } });
        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('100.0% / 100.0%');

        fireEvent.change(metricSelect, { target: { value: 'ORDER_ACCURACY' } });
        expect(screen.getAllByTestId(/^kpi-item-row-/)).toHaveLength(1);
        expect(screen.getByTestId('item-weight-input-0')).toHaveValue(100);

        const saveBtn = screen.getByTestId('save-kpi-config-btn');
        expect(saveBtn).not.toBeDisabled();

        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(handleSave).toHaveBeenCalledTimes(1);
            const savedData = handleSave.mock.calls[0][0];
            expect(savedData.title).toBe('Valid Q4 2026 Operations Config');
            expect(savedData.departmentId).toBe('dept-1');
            expect(savedData.targetRole).toBe('Courier');
            expect(savedData.overallGreenThreshold).toBe(85.0);
            expect(savedData.items).toHaveLength(1);
            expect(savedData.items[0].metricCode).toBe('ORDER_ACCURACY');
            expect(savedData.items[0].weight).toBe(100);
        });
    });

    it('normalizes legacy multi-metric initialData to a single metric at 100% weight', () => {
        render(
            <KpiConfigurationEditor
                initialData={{
                    id: 'legacy-1',
                    title: 'Legacy Config',
                    description: '',
                    targetRole: 'Courier',
                    departmentId: 'dept-1',
                    effectiveStartDate: '2026-01-01',
                    effectiveEndDate: '',
                    isActive: true,
                    overallGreenThreshold: 85,
                    overallAmberThreshold: 70,
                    overallRedThreshold: 60,
                    items: STANDARD_METRIC_TEMPLATES.map((t, i) => ({ ...t, order: i + 1 }))
                }}
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        expect(screen.getByTestId('legacy-conversion-notice')).toBeInTheDocument();
        expect(screen.getAllByTestId(/^kpi-item-row-/)).toHaveLength(1);
        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('100.0% / 100.0%');
    });
});

describe('FormulaBuilderModal Component', () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: mockVariables
            }
        });
    });

    it('renders modal with formula editor, variable chips, and operators', async () => {
        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula="(completed_tasks / total_assigned_tasks) * 100"
                metricName="Custom Delivery Success"
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        expect(screen.getByTestId('formula-builder-modal')).toBeInTheDocument();
        expect(screen.getByText(/Custom Formula Builder/i)).toBeInTheDocument();
        expect(screen.getByText('Custom Delivery Success')).toBeInTheDocument();

        const formulaInput = screen.getByTestId('formula-input') as HTMLTextAreaElement;
        expect(formulaInput.value).toBe('(completed_tasks / total_assigned_tasks) * 100');

        await waitFor(() => {
            expect(screen.getByTestId('var-chip-completed_tasks')).toBeInTheDocument();
            expect(screen.getByTestId('var-chip-total_assigned_tasks')).toBeInTheDocument();
        });

        expect(screen.getByTestId('operator-btn-+')).toBeInTheDocument();
        expect(screen.getByTestId('operator-btn-/')).toBeInTheDocument();
        expect(screen.getByTestId('test-formula-btn')).toBeInTheDocument();
        expect(screen.getByTestId('apply-formula-btn')).toBeInTheDocument();
    });

    it('filters variable chips using search input and category tabs', async () => {
        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula=""
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('var-chip-completed_tasks')).toBeInTheDocument();
            expect(screen.getByTestId('var-chip-total_handling_hours')).toBeInTheDocument();
        });

        // Filter by category: Duration
        const durationTab = screen.getByTestId('category-tab-duration');
        fireEvent.click(durationTab);

        expect(screen.getByTestId('var-chip-total_handling_hours')).toBeInTheDocument();
        expect(screen.queryByTestId('var-chip-completed_tasks')).not.toBeInTheDocument();

        // Filter by category: All
        const allTab = screen.getByTestId('category-tab-all');
        fireEvent.click(allTab);

        // Filter by Search
        const searchInput = screen.getByTestId('variable-search-input');
        fireEvent.change(searchInput, { target: { value: 'otif' } });

        expect(screen.getByTestId('var-chip-otif_tasks')).toBeInTheDocument();
        expect(screen.queryByTestId('var-chip-completed_tasks')).not.toBeInTheDocument();
    });

    it('inserts variable chips and operators into the formula expression', async () => {
        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula=""
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('var-chip-completed_tasks')).toBeInTheDocument();
        });

        const chip = screen.getByTestId('var-chip-completed_tasks');
        fireEvent.click(chip);

        const opDiv = screen.getByTestId('operator-btn-/');
        fireEvent.click(opDiv);

        const formulaInput = screen.getByTestId('formula-input') as HTMLTextAreaElement;
        expect(formulaInput.value).toContain('completed_tasks');
        expect(formulaInput.value).toContain('/');
    });

    it('inserts preset template formula when clicking quick templates', async () => {
        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula=""
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        const presetBtn = screen.getByTestId('preset-completion-rate');
        fireEvent.click(presetBtn);

        const formulaInput = screen.getByTestId('formula-input') as HTMLTextAreaElement;
        expect(formulaInput.value).toBe('(completed_tasks / total_assigned_tasks) * 100');
    });

    it('performs dry-run testing and displays calculated success result', async () => {
        (api.post as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: {
                    isValid: true,
                    result: 90.0,
                    variablesUsed: ['completed_tasks', 'total_assigned_tasks'],
                    resolvedVariables: {
                        completed_tasks: 45.0,
                        total_assigned_tasks: 50.0
                    }
                }
            }
        });

        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula="(completed_tasks / total_assigned_tasks) * 100"
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        const testBtn = screen.getByTestId('test-formula-btn');
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/api/kpi/formula/test', expect.objectContaining({
                formula: '(completed_tasks / total_assigned_tasks) * 100'
            }));
            expect(screen.getByTestId('test-result-banner')).toBeInTheDocument();
            expect(screen.getByText(/Formula is Valid!/i)).toBeInTheDocument();
            expect(screen.getByTestId('calculated-result-display')).toHaveTextContent('Result: 90');
        });
    });

    it('displays validation error banner when dry-run test fails', async () => {
        (api.post as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: {
                    isValid: false,
                    errorMessage: "Variable 'invalid_column' is not permitted.",
                    variablesUsed: ['invalid_column']
                }
            }
        });

        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula="invalid_column * 2"
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        const testBtn = screen.getByTestId('test-formula-btn');
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(screen.getByTestId('test-result-banner')).toBeInTheDocument();
            expect(screen.getByText(/Variable 'invalid_column' is not permitted/i)).toBeInTheDocument();
        });
    });

    it('applies validated formula and triggers onApply callback', () => {
        render(
            <FormulaBuilderModal
                isOpen={true}
                initialFormula="(otif_tasks / completed_tasks) * 100"
                onApply={handleApply}
                onClose={handleClose}
            />
        );

        const applyBtn = screen.getByTestId('apply-formula-btn');
        fireEvent.click(applyBtn);

        expect(handleApply).toHaveBeenCalledWith('(otif_tasks / completed_tasks) * 100');
        expect(handleClose).toHaveBeenCalledTimes(1);
    });
});

describe('KpiConfigurationEditor with Custom Formula Metrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: mockVariables
            }
        });
    });

    it('adds custom formula metric and opens formula builder modal', async () => {
        const handleSave = vi.fn().mockResolvedValue(undefined);
        const handleCancel = vi.fn();

        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        const addCustomBtn = screen.getByTestId('add-custom-formula-metric-btn');
        fireEvent.click(addCustomBtn);

        // Modal should open immediately for the new custom metric
        await waitFor(() => {
            expect(screen.getByTestId('formula-builder-modal')).toBeInTheDocument();
        });

        // Set formula in modal and apply
        const presetBtn = screen.getByTestId('preset-completion-rate');
        fireEvent.click(presetBtn);

        const applyBtn = screen.getByTestId('apply-formula-btn');
        fireEvent.click(applyBtn);

        // Modal should close and row should show formula preview
        await waitFor(() => {
            expect(screen.queryByTestId('formula-builder-modal')).not.toBeInTheDocument();
            expect(screen.getByTestId('formula-preview-0')).toHaveTextContent('(completed_tasks / total_assigned_tasks) * 100');
        });
    });

    it('requires custom formula if custom metric is added', async () => {
        const handleSave = vi.fn().mockResolvedValue(undefined);
        const handleCancel = vi.fn();

        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        const addCustomBtn = screen.getByTestId('add-custom-formula-metric-btn');
        fireEvent.click(addCustomBtn);

        // Cancel modal without setting formula
        const cancelModalBtn = screen.getByTestId('cancel-formula-btn');
        fireEvent.click(cancelModalBtn);

        // Validation alert should appear
        expect(screen.getByTestId('validation-alert')).toBeInTheDocument();
        expect(screen.getByText(/requires a custom formula/i)).toBeInTheDocument();
        expect(screen.getByTestId('save-kpi-config-btn')).toBeDisabled();
    });
});
