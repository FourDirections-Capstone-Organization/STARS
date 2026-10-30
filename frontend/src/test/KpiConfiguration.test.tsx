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

    it('renders editor with prospective default values and 100% total weight', () => {
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
        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('100.0% / 100.0%');
        expect(screen.getByTestId('save-kpi-config-btn')).toBeDisabled(); // Title is empty
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

    it('submits valid prospective configuration upon form submission', async () => {
        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        const titleInput = screen.getByTestId('config-title-input');
        fireEvent.change(titleInput, { target: { value: 'Valid Q4 2026 Operations Config' } });

        const roleSelect = screen.getByTestId('config-role-select');
        fireEvent.change(roleSelect, { target: { value: 'Courier' } });

        const saveBtn = screen.getByTestId('save-kpi-config-btn');
        expect(saveBtn).not.toBeDisabled();

        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(handleSave).toHaveBeenCalledTimes(1);
            const savedData = handleSave.mock.calls[0][0];
            expect(savedData.title).toBe('Valid Q4 2026 Operations Config');
            expect(savedData.targetRole).toBe('Courier');
            expect(savedData.overallGreenThreshold).toBe(85.0);
            expect(savedData.items).toHaveLength(4);
            const sumWeights = savedData.items.reduce((s: number, i: any) => s + i.weight, 0);
            expect(sumWeights).toBe(100.0);
        });
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
            expect(screen.getByTestId('formula-preview-4')).toHaveTextContent('(completed_tasks / total_assigned_tasks) * 100');
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
