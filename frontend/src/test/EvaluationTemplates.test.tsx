import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvaluationTemplateTab } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/EvaluationTemplateTab';
import { EvaluationTemplateEditor } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/EvaluationTemplateEditor';
import { EvaluationTemplate, DepartmentOption } from '../Pages/OpAdmin_Dashboard/PerformanceEvaluation/types';
import { ToastProvider } from '../components/Toast/Toast';
import api from '../api';

vi.mock('../api');

const mockDepartments: DepartmentOption[] = [
    { id: 'dept-1', name: 'Logistics Operations' },
    { id: 'dept-2', name: 'Sorting Hub' }
];

const mockTemplates: EvaluationTemplate[] = [
    {
        id: 'tmpl-1111-2222-3333-4444',
        title: 'Courier Performance Evaluation',
        description: 'Standard evaluation rubric for courier personnel',
        targetRole: 'Courier',
        departmentId: 'dept-1',
        department: { id: 'dept-1', name: 'Logistics Operations' },
        isActive: true,
        isAiEnabled: true,
        sections: [
            {
                id: 'sec-1',
                title: 'Operational Excellence',
                description: 'Day-to-day handling and punctuality',
                weight: 60,
                order: 1,
                isKpiSection: false,
                criteria: [
                    {
                        id: 'crit-1',
                        title: 'Delivery Punctuality',
                        description: 'Meeting expected deadlines',
                        weight: 50,
                        criterionType: 'Standard',
                        order: 1
                    },
                    {
                        id: 'crit-2',
                        title: 'Customer Communication',
                        description: 'Polite and timely updates',
                        weight: 50,
                        criterionType: 'Standard',
                        order: 2
                    }
                ]
            },
            {
                id: 'sec-2',
                title: 'Operational KPI Metrics',
                description: 'Automatic KPI score passthrough',
                weight: 40,
                order: 2,
                isKpiSection: true,
                criteria: [
                    {
                        id: 'crit-3',
                        title: 'Overall KPI Scorecard',
                        description: 'STARS Engine OTIF, Accuracy, Completion, AHT',
                        weight: 100,
                        criterionType: 'KpiLinked',
                        metricCode: 'OVERALL_SCORE',
                        order: 1
                    }
                ]
            }
        ],
        ratingBands: [
            { id: 'band-1', label: 'Outstanding', minScore: 90, maxScore: 100, color: '#05cd99', order: 1 },
            { id: 'band-2', label: 'Meets Expectations', minScore: 70, maxScore: 89.99, color: '#00a99d', order: 2 },
            { id: 'band-3', label: 'Needs Improvement', minScore: 0, maxScore: 69.99, color: '#ee5d50', order: 3 }
        ]
    },
    {
        id: 'tmpl-5555-6666-7777-8888',
        title: 'Operations Coordinator Annual Review',
        description: 'Evaluation rubric for coordinators',
        targetRole: 'Coordinator',
        departmentId: 'dept-2',
        department: { id: 'dept-2', name: 'Sorting Hub' },
        isActive: false,
        isAiEnabled: false,
        sections: [
            {
                id: 'sec-3',
                title: 'Leadership & Dispatch Coordination',
                weight: 100,
                order: 1,
                isKpiSection: false,
                criteria: [
                    {
                        id: 'crit-4',
                        title: 'Dispatch Efficiency',
                        weight: 100,
                        criterionType: 'Standard',
                        order: 1
                    }
                ]
            }
        ],
        ratingBands: [
            { id: 'band-4', label: 'Satisfactory', minScore: 60, maxScore: 100, color: '#05cd99', order: 1 }
        ]
    }
];

describe('EvaluationTemplateTab Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockResolvedValue({
            data: { isSuccess: true, data: mockTemplates }
        });
    });

    it('renders the template list with cards, badges, and filters', async () => {
        render(
            <ToastProvider>
                <EvaluationTemplateTab departments={mockDepartments} />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Courier Performance Evaluation')).toBeInTheDocument();
            expect(screen.getByText('Operations Coordinator Annual Review')).toBeInTheDocument();
        });

        // Badges check
        expect(screen.getByText('AI Enabled')).toBeInTheDocument();
        expect(screen.getByText('KPI Section')).toBeInTheDocument();
        expect(screen.getAllByText('Courier').length).toBeGreaterThan(0);
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('filters templates when searching by title', async () => {
        render(
            <ToastProvider>
                <EvaluationTemplateTab departments={mockDepartments} />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Courier Performance Evaluation')).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/search templates/i);
        fireEvent.change(searchInput, { target: { value: 'Courier' } });

        expect(screen.getByText('Courier Performance Evaluation')).toBeInTheDocument();
        expect(screen.queryByText('Operations Coordinator Annual Review')).not.toBeInTheDocument();
    });

    it('switches to editor mode when clicking New Template', async () => {
        render(
            <ToastProvider>
                <EvaluationTemplateTab departments={mockDepartments} />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('New Template')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('New Template'));

        expect(screen.getByText('Create Evaluation Template')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/annual courier operational review/i)).toBeInTheDocument();
    });

    it('opens editor in edit mode when clicking Edit icon on a template card', async () => {
        render(
            <ToastProvider>
                <EvaluationTemplateTab departments={mockDepartments} />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Courier Performance Evaluation')).toBeInTheDocument();
        });

        const editButtons = screen.getAllByTitle('Edit Template');
        fireEvent.click(editButtons[0]);

        expect(screen.getByText('Edit Evaluation Template')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Courier Performance Evaluation')).toBeInTheDocument();
    });
});

describe('EvaluationTemplateEditor Component', () => {
    const mockOnSave = vi.fn().mockResolvedValue(undefined);
    const mockOnCancel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders with populated initial data and shows balanced section weight banner', () => {
        render(
            <EvaluationTemplateEditor
                initialData={mockTemplates[0]}
                departments={mockDepartments}
                onSave={mockOnSave}
                onCancel={mockOnCancel}
                isSaving={false}
            />
        );

        expect(screen.getByDisplayValue('Courier Performance Evaluation')).toBeInTheDocument();
        expect(screen.getByText(/Section weights are perfectly balanced/i)).toBeInTheDocument();
        expect(screen.getByText('100% / 100%')).toBeInTheDocument();
    });

    it('updates section weight calculation and displays warning banner when weights do not sum to 100%', () => {
        render(
            <EvaluationTemplateEditor
                initialData={mockTemplates[0]}
                departments={mockDepartments}
                onSave={mockOnSave}
                onCancel={mockOnCancel}
                isSaving={false}
            />
        );

        const weightInputs = screen.getAllByRole('spinbutton');
        // Change first section weight from 60 to 50
        fireEvent.change(weightInputs[0], { target: { value: '50' } });

        // Total sum is now 50 + 40 = 90%
        expect(screen.getByText(/Total section weights must sum to 100±0.5%/i)).toBeInTheDocument();
        expect(screen.getByText('90% / 100%')).toBeInTheDocument();
    });

    it('supports adding and deleting criteria within a section', () => {
        render(
            <EvaluationTemplateEditor
                initialData={mockTemplates[0]}
                departments={mockDepartments}
                onSave={mockOnSave}
                onCancel={mockOnCancel}
                isSaving={false}
            />
        );

        const addCriterionBtns = screen.getAllByText(/Add Criterion/i);
        fireEvent.click(addCriterionBtns[0]);

        // A new criterion row should be added
        const critInputs = screen.getAllByPlaceholderText(/e\.g\. Quality of Output/i);
        expect(critInputs.length).toBeGreaterThan(2);
    });

    it('allows toggling AI recommendation and KPI Section', () => {
        render(
            <EvaluationTemplateEditor
                initialData={mockTemplates[0]}
                departments={mockDepartments}
                onSave={mockOnSave}
                onCancel={mockOnCancel}
                isSaving={false}
            />
        );

        const aiCheckbox = screen.getByLabelText(/Enable AI Recommendations/i);
        expect(aiCheckbox).toBeChecked();
        fireEvent.click(aiCheckbox);
        expect(aiCheckbox).not.toBeChecked();

        // Mutually exclusive KPI section radios
        const kpiRadios = screen.getAllByRole('radio');
        expect(kpiRadios.length).toBe(2);
        expect(kpiRadios[1]).toBeChecked();

        fireEvent.click(kpiRadios[0]);
        expect(kpiRadios[0]).toBeChecked();
        expect(kpiRadios[1]).not.toBeChecked();
    });

    it('submits valid template data when clicking Save', async () => {
        const { container } = render(
            <EvaluationTemplateEditor
                initialData={mockTemplates[0]}
                departments={mockDepartments}
                onSave={mockOnSave}
                onCancel={mockOnCancel}
                isSaving={false}
            />
        );

        const form = container.querySelector('form')!;
        fireEvent.submit(form);

        await waitFor(() => {
            expect(mockOnSave).toHaveBeenCalledTimes(1);
            const savedData = mockOnSave.mock.calls[0][0];
            expect(savedData.title).toBe('Courier Performance Evaluation');
            expect(savedData.sections.length).toBe(2);
            expect(savedData.ratingBands.length).toBe(3);
        });
    });

    it('prevents saving and displays error summary when validation fails', async () => {
        const { container } = render(
            <EvaluationTemplateEditor
                initialData={{
                    ...mockTemplates[0],
                    title: '', // Invalid empty title
                    sections: [
                        {
                            ...mockTemplates[0].sections[0],
                            weight: 30 // Sum is 30 != 100
                        }
                    ]
                }}
                departments={mockDepartments}
                onSave={mockOnSave}
                onCancel={mockOnCancel}
                isSaving={false}
            />
        );

        const form = container.querySelector('form')!;
        fireEvent.submit(form);

        expect(mockOnSave).not.toHaveBeenCalled();
        expect(screen.getByText(/Please resolve the following errors/i)).toBeInTheDocument();
        expect(screen.getByText(/Template title is required/i)).toBeInTheDocument();
    });
});
