import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KpiConfigurationTab } from '../Pages/OpAdmin_Dashboard/KpiConfiguration/KpiConfigurationTab';
import { KpiConfigurationEditor } from '../Pages/OpAdmin_Dashboard/KpiConfiguration/KpiConfigurationEditor';
import { KpiConfiguration, DepartmentOption, STANDARD_METRIC_TEMPLATES } from '../Pages/OpAdmin_Dashboard/KpiConfiguration/types';
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

describe('KpiConfigurationTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: mockConfigurations
            }
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

        // System Default badge on default config
        expect(screen.getByText('System Default')).toBeInTheDocument();
        // Target role badge
        expect(screen.getAllByText('Courier').length).toBeGreaterThan(0);
        // Metric tags
        expect(screen.getAllByText(/OTIF \(35%\)/i).length).toBeGreaterThan(0);
    });

    it('filters configurations based on search query', async () => {
        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByText('Default Logistics Operations KPI')).toBeInTheDocument();
        });

        const searchInput = screen.getByTestId('kpi-search-input');
        fireEvent.change(searchInput, { target: { value: 'Courier Express' } });

        expect(screen.getByText('Courier Express Q4 Configuration')).toBeInTheDocument();
        expect(screen.queryByText('Default Logistics Operations KPI')).not.toBeInTheDocument();
    });

    it('opens editor when clicking New Configuration', async () => {
        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByTestId('create-kpi-config-btn')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('create-kpi-config-btn'));

        expect(screen.getByTestId('kpi-configuration-editor')).toBeInTheDocument();
        expect(screen.getByText(/New Prospective KPI Configuration/i)).toBeInTheDocument();
    });

    it('opens editor in edit mode when clicking Edit on a configuration card', async () => {
        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByTestId('edit-config-btn-22222222-2222-2222-2222-222222222222')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('edit-config-btn-22222222-2222-2222-2222-222222222222'));

        expect(screen.getByTestId('kpi-configuration-editor')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Courier Express Q4 Configuration')).toBeInTheDocument();
    });

    it('handles delete flow with confirmation modal', async () => {
        (api.delete as any).mockResolvedValue({ data: { isSuccess: true } });

        renderWithToast(<KpiConfigurationTab departments={mockDepartments} />);

        await waitFor(() => {
            expect(screen.getByTestId('delete-config-btn-22222222-2222-2222-2222-222222222222')).toBeInTheDocument();
        });

        // Default config should NOT have delete button
        expect(screen.queryByTestId('delete-config-btn-00000000-0000-0000-0000-000000000001')).not.toBeInTheDocument();

        // Click delete on custom config
        fireEvent.click(screen.getByTestId('delete-config-btn-22222222-2222-2222-2222-222222222222'));

        // Modal should open
        expect(screen.getByText(/Are you sure you want to delete this prospective KPI configuration\?/i)).toBeInTheDocument();

        const modal = screen.getByText(/Are you sure you want to delete this prospective KPI configuration\?/i).closest('.cm-card');
        const confirmBtn = modal?.querySelector('.cm-btn-confirm') || screen.getAllByRole('button', { name: /Delete Configuration/i })[1];
        fireEvent.click(confirmBtn!);

        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith('/api/kpi/configurations/22222222-2222-2222-2222-222222222222');
        });
    });
});

describe('KpiConfigurationEditor', () => {
    it('validates 100% weight sum: disables Save button when weight is not 100%', () => {
        const handleSave = vi.fn();
        const handleCancel = vi.fn();

        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        // Fill Title
        const titleInput = screen.getByTestId('config-title-input');
        fireEvent.change(titleInput, { target: { value: 'Test 2026 Q4 Plan' } });

        // Standard default total weight should be 100.0%
        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('100.0% / 100.0%');
        const saveBtn = screen.getByTestId('save-kpi-config-btn');
        expect(saveBtn).not.toBeDisabled();

        // Change OTIF weight from 35 to 10 (Total becomes 75%)
        const weightInput0 = screen.getByTestId('item-weight-input-0');
        fireEvent.change(weightInput0, { target: { value: '10' } });

        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('75.0% / 100.0%');
        expect(screen.getByTestId('validation-alert')).toBeInTheDocument();
        expect(screen.getByText(/Total weights must sum to exactly 100.0%/i)).toBeInTheDocument();
        expect(saveBtn).toBeDisabled();

        // Click Auto-Balance Weights
        const autoBalanceBtn = screen.getByTestId('auto-balance-weights-btn');
        fireEvent.click(autoBalanceBtn);

        // Now total weight should be 100.0% again and save button enabled
        expect(screen.getByTestId('total-weight-display')).toHaveTextContent('100.0% / 100.0%');
        expect(saveBtn).not.toBeDisabled();
    });

    it('validates threshold hierarchy: shows error when Green < Amber', () => {
        const handleSave = vi.fn();
        const handleCancel = vi.fn();

        render(
            <KpiConfigurationEditor
                departments={mockDepartments}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={false}
            />
        );

        const titleInput = screen.getByTestId('config-title-input');
        fireEvent.change(titleInput, { target: { value: 'Invalid Threshold Plan' } });

        // Set Overall Green (50) < Amber (70)
        const greenInput = screen.getByTestId('overall-green-input');
        fireEvent.change(greenInput, { target: { value: '50' } });

        expect(screen.getByTestId('validation-alert')).toBeInTheDocument();
        expect(screen.getByText(/Overall thresholds invalid: Green \(50\) must be >= Amber/i)).toBeInTheDocument();
        expect(screen.getByTestId('save-kpi-config-btn')).toBeDisabled();
    });

    it('validates prospective dates: requires end date to be after start date', () => {
        const handleSave = vi.fn();
        const handleCancel = vi.fn();

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
