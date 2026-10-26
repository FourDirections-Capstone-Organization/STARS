import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { suitabilityCache } from '../services/suitabilityCache';
import { aiService, SuitabilityResponseDTO } from '../services/aiService';
import AiRecommendationPanel from '../components/AiRecommendationPanel/AiRecommendationPanel';
import AIAssignmentView from '../Pages/EmergingTechAI/AIAssignmentView';
import { TaskModal, TeamMember } from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
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

describe('Step 5: Suitability Display UI with Groq Recommendations, Ranks, and Bias-Free Explanations', () => {
    const mockCandidates: SuitabilityResponseDTO[] = [
        {
            employeeId: 'emp-001',
            employeeNumber: 'E001',
            fullName: 'Alice Rivera',
            role: 'Encoder',
            workload: 1,
            suitabilityScore: 0.9450,
            rank: 1,
            rationale: 'Top suitability: optimal workload (1 active task), strong routine task experience, and excellent quality rating.',
        },
        {
            employeeId: 'emp-002',
            employeeNumber: 'E002',
            fullName: 'Bob Santos',
            role: 'Courier',
            workload: 4,
            suitabilityScore: 0.6210,
            rank: 2,
            rationale: 'Moderate suitability: higher active workload (4 tasks) but acceptable timeliness rating.',
        },
    ];

    const mockTeamMembers: TeamMember[] = [
        {
            accountId: 'emp-001',
            employeeName: 'Alice Rivera',
            role: 'Encoder',
            currentWorkload: 1,
            maxWorkload: 5,
            isAvailable: true,
            status: 'Active',
            skills: ['Data Entry'],
            email: 'alice@speedex.com',
        },
        {
            accountId: 'emp-002',
            employeeName: 'Bob Santos',
            role: 'Courier',
            currentWorkload: 4,
            maxWorkload: 5,
            isAvailable: true,
            status: 'Active',
            skills: ['Delivery'],
            email: 'bob@speedex.com',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        suitabilityCache.clear();

        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/api/Task/assignable-users')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [
                                {
                                    id: 'emp-002', // Deliberately order Bob first in raw DB to test sorting
                                    fullName: 'Bob Santos',
                                    employeeNumber: 'E002',
                                    workload: 4,
                                    departmentId: 'dept-001',
                                    departmentName: 'Operations',
                                    isAvailable: true,
                                },
                                {
                                    id: 'emp-001',
                                    fullName: 'Alice Rivera',
                                    employeeNumber: 'E001',
                                    workload: 1,
                                    departmentId: 'dept-001',
                                    departmentName: 'Operations',
                                    isAvailable: true,
                                },
                            ],
                        },
                    },
                });
            }
            if (url.includes('/api/Team')) {
                return Promise.resolve({ data: { isSuccess: true, data: { items: [] } } });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({
                    data: [
                        { id: 'dept-001', name: 'Operations' },
                    ],
                });
            }
            if (url.includes('/api/users/profile')) {
                return Promise.resolve({ data: { isSuccess: true, data: { role: 'Coordinator', departmentId: 'dept-001' } } });
            }
            if (url.includes('/api/tasks/') && url.includes('/sla-risk')) {
                return Promise.resolve({
                    data: {
                        taskId: 'task-100',
                        riskLevel: 'Low',
                        confidenceScore: 0.85,
                        keyFactors: ['Normal priority', 'Sufficient deadline'],
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });
    });

    describe('AiRecommendationPanel Component', () => {
        it('renders Groq AI subtitle, rank badges, and AI rationales on cards', async () => {
            vi.spyOn(aiService, 'getSuitability').mockResolvedValue({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: {
                        items: mockCandidates,
                        totalCount: 2,
                        pageNumber: 1,
                        pageSize: 5,
                        totalPages: 1,
                        hasPreviousPage: false,
                        hasNextPage: false,
                    },
                },
            } as any);

            render(<AiRecommendationPanel taskId="task-100" />);

            // Check header shows Groq AI subtitle
            await waitFor(() => {
                expect(screen.getByText('Groq AI')).toBeInTheDocument();
            });

            // Check rank badges render
            expect(screen.getByText('#1')).toBeInTheDocument();
            expect(screen.getByText('#2')).toBeInTheDocument();

            // Check candidates render with their AI rationales
            expect(screen.getByText('Alice Rivera')).toBeInTheDocument();
            expect(screen.getByText(/Top suitability: optimal workload/)).toBeInTheDocument();
            expect(screen.getByText('Bob Santos')).toBeInTheDocument();
            expect(screen.getByText(/Moderate suitability: higher active workload/)).toBeInTheDocument();
        });

        it('expands details to show AI Evaluation rationale and verified system metrics', async () => {
            vi.spyOn(aiService, 'getSuitability').mockResolvedValue({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: {
                        items: mockCandidates,
                        totalCount: 2,
                        pageNumber: 1,
                        pageSize: 5,
                        totalPages: 1,
                        hasPreviousPage: false,
                        hasNextPage: false,
                    },
                },
            } as any);

            vi.spyOn(aiService, 'getSuitabilityExplanation').mockResolvedValue({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: [
                        {
                            employeeId: 'emp-001',
                            employeeNumber: 'E001',
                            fullName: 'Alice Rivera',
                            finalScore: 0.9450,
                            workloadFactor: 0.8,
                            workloadWeight: 0.4,
                            experienceFactor: 1.0,
                            experienceWeight: 0.35,
                            recScore: 0.95,
                            recScoreWeight: 0.25,
                            explanation: 'Alice Rivera scored 0.945. They have 1 active task(s) and strong routine experience.',
                            rank: 1,
                            rationale: 'Top suitability: optimal workload (1 active task), strong routine task experience, and excellent quality rating.',
                        },
                    ],
                },
            } as any);

            render(<AiRecommendationPanel taskId="task-100" />);

            await waitFor(() => {
                expect(screen.getByText('Alice Rivera')).toBeInTheDocument();
            });

            const explainBtns = screen.getAllByText('Why this score?');
            fireEvent.click(explainBtns[0]);

            await waitFor(() => {
                expect(screen.getByText('AI Evaluation:')).toBeInTheDocument();
                expect(screen.getByText(/Alice Rivera scored 0.945/)).toBeInTheDocument();
            });
        });
    });

    describe('AIAssignmentView Component', () => {
        it('sorts candidates by Groq rank and renders rank badges with AI rationales', async () => {
            vi.spyOn(aiService, 'getSuitabilityPreview').mockResolvedValue({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: {
                        items: mockCandidates,
                        totalCount: 2,
                        pageNumber: 1,
                        pageSize: 50,
                        totalPages: 1,
                        hasPreviousPage: false,
                        hasNextPage: false,
                    },
                },
            } as any);

            render(<AIAssignmentView />);

            await waitFor(() => {
                expect(screen.getByText('Evaluate Suitability')).toBeInTheDocument();
            });

            const triggerBtn = screen.getByText('Evaluate Suitability');
            fireEvent.click(triggerBtn);

            // Wait for evaluation to complete
            await waitFor(() => {
                expect(screen.getByText('#1')).toBeInTheDocument();
                expect(screen.getByText('#2')).toBeInTheDocument();
            });

            // Check AI rationale badges render
            expect(screen.getByText(/Top suitability: optimal workload/)).toBeInTheDocument();
            expect(screen.getByText(/Moderate suitability: higher active workload/)).toBeInTheDocument();

            // Verify Alice Rivera (#1) is rendered before Bob Santos (#2) due to AI sorting
            const empNames = screen.getAllByText(/Alice Rivera|Bob Santos/).map(el => el.textContent);
            expect(empNames[0]).toBe('Alice Rivera');
            expect(empNames[1]).toBe('Bob Santos');
        });
    });

    describe('TaskModal Component in OpAdmin_Dashboard', () => {
        it('renders recommendation with rank and displays rank badge and rationale in picker list', async () => {
            vi.spyOn(aiService, 'getSuitabilityPreview').mockResolvedValue({
                data: {
                    isSuccess: true,
                    message: 'Success',
                    data: {
                        items: mockCandidates,
                        totalCount: 2,
                        pageNumber: 1,
                        pageSize: 10,
                        totalPages: 1,
                        hasPreviousPage: false,
                        hasNextPage: false,
                    },
                },
            } as any);

            render(
                <TaskModal
                    mode="edit"
                    tasks={[]}
                    isOpen={true}
                    onClose={vi.fn()}
                    onSuccess={vi.fn()}
                    teamMembers={mockTeamMembers}
                    initial={{
                        id: '',
                        title: 'Test Delivery Task',
                        classification: 0,
                        assignedDepartmentId: 'dept-001',
                    }}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Evaluate Suitability')).toBeInTheDocument();
            });

            const evalBtn = screen.getByText('Evaluate Suitability');
            fireEvent.click(evalBtn);

            // Verify recommendation banner renders with Rank #1
            await waitFor(() => {
                expect(screen.getByText(/Recommended:/)).toBeInTheDocument();
                expect(screen.getByText(/\(Rank #1\)/)).toBeInTheDocument();
                expect(screen.getAllByText(/Top suitability: optimal workload/).length).toBeGreaterThanOrEqual(1);
            });

            // Verify picker list shows rank badge and rationale
            expect(screen.getByText('#1')).toBeInTheDocument();
            expect(screen.getByText('#2')).toBeInTheDocument();
        });
    });
});
