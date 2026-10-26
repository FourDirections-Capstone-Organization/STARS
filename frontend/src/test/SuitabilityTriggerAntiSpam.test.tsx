import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { suitabilityCache } from '../services/suitabilityCache';
import { aiService, SuitabilityResponseDTO } from '../services/aiService';
import { TaskModal, TeamMember } from '../Pages/OpAdmin_Dashboard/OpAdmin_Dashboard';
import AIAssignmentView from '../Pages/EmergingTechAI/AIAssignmentView';
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

describe('Step 4: Employee Suitability Trigger Button & Anti-Spam Caching', () => {
    const mockCandidates: SuitabilityResponseDTO[] = [
        {
            employeeId: 'emp-001',
            employeeNumber: 'E001',
            fullName: 'Alice Rivera',
            role: 'Encoder',
            workload: 1,
            suitabilityScore: 0.95,
            rank: 1,
            rationale: 'Top suitability with low workload and high quality rating.',
        },
        {
            employeeId: 'emp-002',
            employeeNumber: 'E002',
            fullName: 'Bob Santos',
            role: 'Courier',
            workload: 3,
            suitabilityScore: 0.72,
            rank: 2,
            rationale: 'Moderate suitability.',
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
            currentWorkload: 3,
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
                                    id: 'emp-001',
                                    fullName: 'Alice Rivera',
                                    employeeNumber: 'E001',
                                    workload: 1,
                                    departmentId: 'dept-001',
                                    departmentName: 'Operations',
                                    isAvailable: true,
                                },
                                {
                                    id: 'emp-002',
                                    fullName: 'Bob Santos',
                                    employeeNumber: 'E002',
                                    workload: 3,
                                    departmentId: 'dept-001',
                                    departmentName: 'Operations',
                                    isAvailable: true,
                                },
                            ],
                        },
                    },
                });
            }
            if (url.includes('/api/Department')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: [
                                { departmentId: 'dept-001', name: 'Operations', employeeCount: 2 },
                            ],
                        },
                    },
                });
            }
            if (url.includes('/api/Team')) {
                return Promise.resolve({
                    data: { isSuccess: true, data: { items: [] } },
                });
            }
            if (url.includes('/api/tasks/') && url.includes('/suitability')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: mockCandidates,
                            totalCount: mockCandidates.length,
                            pageNumber: 1,
                            pageSize: 10,
                            totalPages: 1,
                            hasPreviousPage: false,
                            hasNextPage: false,
                        },
                    },
                });
            }
            if (url.includes('/api/suitability/preview')) {
                return Promise.resolve({
                    data: {
                        isSuccess: true,
                        data: {
                            items: mockCandidates,
                            totalCount: mockCandidates.length,
                            pageNumber: 1,
                            pageSize: 10,
                            totalPages: 1,
                            hasPreviousPage: false,
                            hasNextPage: false,
                        },
                    },
                });
            }
            return Promise.resolve({ data: { isSuccess: true, data: {} } });
        });
    });

    describe('suitabilityCache Module', () => {
        it('generates consistent keys for tasks and previews', () => {
            const taskKey = suitabilityCache.generateKey({ taskId: '11111111-1111-1111-1111-111111111111' });
            expect(taskKey).toBe('task:11111111-1111-1111-1111-111111111111');

            const previewKey = suitabilityCache.generateKey({
                departmentId: 'dept-001',
                classification: 1,
            });
            expect(previewKey).toBe('dept:dept-001:cls:1');
        });

        it('stores, retrieves, and detects cache hits with anti-spam', () => {
            const key = 'test-key-1';
            expect(suitabilityCache.get(key)).toBeNull();

            suitabilityCache.set(key, mockCandidates);
            expect(suitabilityCache.has(key)).toBe(true);

            const result = suitabilityCache.get(key);
            expect(result).not.toBeNull();
            expect(result?.isCacheHit).toBe(true);
            expect(result?.items).toHaveLength(2);
            expect(result?.items[0].fullName).toBe('Alice Rivera');
        });

        it('deduplicates simultaneous inflight requests', async () => {
            const key = 'inflight-key';
            const fetcher = vi.fn().mockImplementation(async () => {
                await new Promise(r => setTimeout(r, 10));
                return mockCandidates;
            });

            const [res1, res2] = await Promise.all([
                suitabilityCache.getOrFetch(key, fetcher),
                suitabilityCache.getOrFetch(key, fetcher),
            ]);

            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(res1.items).toHaveLength(2);
            expect(res2.items).toHaveLength(2);
        });
    });

    describe('TaskModal Suitability Trigger Button', () => {
        it('renders the Evaluate Suitability button and triggers evaluation on demand', async () => {
            render(
                <TaskModal
                    mode="edit"
                    initial={{
                        taskId: '11111111-1111-1111-1111-111111111111',
                        taskTitle: 'Important Operation',
                        taskDescription: 'Description of operation',
                        priority: 'Medium',
                        taskStatus: 'Pending',
                        classification: 0,
                        assignedTo: '',
                        dueAt: '2026-10-30T10:00:00Z',
                    } as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            // Wait for initial metadata loading
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /evaluate suitability/i })).toBeInTheDocument();
            });

            const triggerBtn = screen.getByRole('button', { name: /evaluate suitability/i });
            fireEvent.click(triggerBtn);

            // Verify evaluation runs and updates recommendation banner with top candidate's rationale/score
            await waitFor(() => {
                expect(screen.getAllByText(/Alice Rivera/i).length).toBeGreaterThanOrEqual(1);
                expect(screen.getByText(/Top suitability with low workload/i)).toBeInTheDocument();
            });

            // Verify API was called
            const suitabilityCalls = (api.get as any).mock.calls.filter(
                (call: any[]) => call[0].includes('/suitability')
            );
            expect(suitabilityCalls.length).toBe(1);
        });

        it('reuses cached recommendations on repeat clicks without refetching', async () => {
            render(
                <TaskModal
                    mode="edit"
                    initial={{
                        taskId: '22222222-2222-2222-2222-222222222222',
                        taskTitle: 'Logistics Task',
                        taskDescription: 'Move crates',
                        priority: 'High',
                        taskStatus: 'Pending',
                        classification: 0,
                        assignedTo: '',
                        dueAt: '2026-10-28T10:00:00Z',
                    } as any}
                    teamMembers={mockTeamMembers}
                    tasks={[]}
                    onSave={vi.fn()}
                    onClose={vi.fn()}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /evaluate suitability/i })).toBeInTheDocument();
            });

            const triggerBtn = screen.getByRole('button', { name: /evaluate suitability/i });

            // 1st click
            fireEvent.click(triggerBtn);
            await waitFor(() => {
                expect(screen.getAllByText(/Alice Rivera/i).length).toBeGreaterThanOrEqual(1);
                expect(screen.getByText(/Top suitability with low workload/i)).toBeInTheDocument();
            });

            const firstCallCount = (api.get as any).mock.calls.filter(
                (call: any[]) => call[0].includes('/suitability')
            ).length;
            expect(firstCallCount).toBe(1);

            // Repeat clicks (2nd and 3rd click)
            fireEvent.click(triggerBtn);
            fireEvent.click(triggerBtn);

            // Verify call count did NOT increase
            const finalCallCount = (api.get as any).mock.calls.filter(
                (call: any[]) => call[0].includes('/suitability')
            ).length;
            expect(finalCallCount).toBe(1);
        });
    });

    describe('AIAssignmentView Suitability Trigger Button', () => {
        it('renders Evaluate Suitability button and triggers evaluation on demand', async () => {
            render(<AIAssignmentView />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /evaluate suitability/i })).toBeInTheDocument();
            });

            const triggerBtn = screen.getByRole('button', { name: /evaluate suitability/i });
            fireEvent.click(triggerBtn);

            await waitFor(() => {
                expect(screen.getByText('0.9500')).toBeInTheDocument();
            });

            const suitabilityCalls = (api.get as any).mock.calls.filter(
                (call: any[]) => call[0].includes('/suitability')
            );
            expect(suitabilityCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('reuses cached recommendations on repeat clicks without refetching in AIAssignmentView', async () => {
            render(<AIAssignmentView />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /evaluate suitability/i })).toBeInTheDocument();
            });

            const triggerBtn = screen.getByRole('button', { name: /evaluate suitability/i });

            // 1st click
            fireEvent.click(triggerBtn);

            await waitFor(() => {
                expect(screen.getByText('0.9500')).toBeInTheDocument();
            });

            const initialCallCount = (api.get as any).mock.calls.filter(
                (call: any[]) => call[0].includes('/suitability')
            ).length;

            // Repeat clicks
            fireEvent.click(triggerBtn);
            fireEvent.click(triggerBtn);

            const afterRepeatCallCount = (api.get as any).mock.calls.filter(
                (call: any[]) => call[0].includes('/suitability')
            ).length;

            expect(afterRepeatCallCount).toBe(initialCallCount);
        });
    });
});
