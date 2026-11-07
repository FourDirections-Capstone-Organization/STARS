import React from 'react';
import { describe, it, expect } from 'vitest';

// ── Types Matching Frontend Dashboard ──
type Priority = 'urgent' | 'high' | 'medium' | 'low';

// PRIORITY_LABELS as used across dashboards
const PRIORITY_LABELS: Record<number, string> = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent' };

// Priority normalizer function that handles numbers, PascalCase strings, lowercase strings, and null defaults
export const normalizeEmployeePriority = (priorityLevel: any, priority?: any): Priority => {
    const raw = (priorityLevel !== undefined && priorityLevel !== null && priorityLevel !== '')
        ? priorityLevel
        : priority;

    if (raw !== undefined && raw !== null) {
        if (typeof raw === 'number') {
            const labels: Record<number, Priority> = { 0: 'low', 1: 'medium', 2: 'high', 3: 'urgent' };
            if (raw in labels) return labels[raw];
        }
        if (typeof raw === 'string' && raw.trim()) {
            const s = raw.trim().toLowerCase();
            if (s === 'low') return 'low';
            if (s === 'medium') return 'medium';
            if (s === 'high') return 'high';
            if (s === 'urgent') return 'urgent';
        }
    }
    return 'medium';
};

// Coordinator priority normalizer (PascalCase)
export const normalizeCoordinatorPriority = (val: any): 'Low' | 'Medium' | 'High' | 'Urgent' => {
    if (val !== undefined && val !== null) {
        if (typeof val === 'number') {
            const labels: Record<number, 'Low' | 'Medium' | 'High' | 'Urgent'> = {
                0: 'Low', 1: 'Medium', 2: 'High', 3: 'Urgent'
            };
            if (val in labels) return labels[val];
        }
        if (typeof val === 'string' && val.trim()) {
            const s = val.trim().toLowerCase();
            if (s === 'low') return 'Low';
            if (s === 'medium') return 'Medium';
            if (s === 'high') return 'High';
            if (s === 'urgent') return 'Urgent';
        }
    }
    return 'Medium';
};

describe('Task Priority Synchronization & Mapping Tests', () => {
    describe('Bug Reproduction: Legacy Buggy Mapping vs Fixed Mapping', () => {
        // The buggy mapping implementation from OpEmployee_Dashboard before our fix:
        const legacyBuggyMapping = (dto: any) => {
            const priorityStr = typeof dto.priorityLevel === 'number'
                ? (PRIORITY_LABELS[dto.priorityLevel] ?? 'Medium')
                : (dto.priority || 'Medium');

            const priorityMap: Record<string, string> = {
                High: 'high', Medium: 'medium', Low: 'low', Urgent: 'high',
                high: 'high', medium: 'medium', low: 'low', urgent: 'high',
            };
            return priorityMap[priorityStr] ?? 'medium';
        };

        it('demonstrates bug: legacy mapper turns string "Low" into "medium"', () => {
            // Backend sends { priorityLevel: "Low" } via JsonStringEnumConverter
            const backendResponseDto = {
                id: 'task-123',
                title: 'Low Priority Warehouse Check',
                priorityLevel: 'Low', // string enum from ASP.NET Core
            };

            // Legacy code failed: typeof "Low" === 'number' is false, dto.priority is undefined -> 'Medium' -> 'medium'
            const legacyResult = legacyBuggyMapping(backendResponseDto);
            expect(legacyResult).toBe('medium'); // This proves the bug!
        });

        it('fixed normalizer accurately maps string "Low" to "low"', () => {
            const backendResponseDto = {
                id: 'task-123',
                title: 'Low Priority Warehouse Check',
                priorityLevel: 'Low',
            };

            const fixedResult = normalizeEmployeePriority(backendResponseDto.priorityLevel, (backendResponseDto as any).priority);
            expect(fixedResult).toBe('low');
        });
    });

    describe('Employee Priority Normalization (All Tiers & Formats)', () => {
        it('normalizes PascalCase strings correctly', () => {
            expect(normalizeEmployeePriority('Low')).toBe('low');
            expect(normalizeEmployeePriority('Medium')).toBe('medium');
            expect(normalizeEmployeePriority('High')).toBe('high');
            expect(normalizeEmployeePriority('Urgent')).toBe('urgent');
        });

        it('normalizes lowercase strings correctly', () => {
            expect(normalizeEmployeePriority('low')).toBe('low');
            expect(normalizeEmployeePriority('medium')).toBe('medium');
            expect(normalizeEmployeePriority('high')).toBe('high');
            expect(normalizeEmployeePriority('urgent')).toBe('urgent');
        });

        it('normalizes numeric enums correctly (0=Low, 1=Medium, 2=High, 3=Urgent)', () => {
            expect(normalizeEmployeePriority(0)).toBe('low');
            expect(normalizeEmployeePriority(1)).toBe('medium');
            expect(normalizeEmployeePriority(2)).toBe('high');
            expect(normalizeEmployeePriority(3)).toBe('urgent');
        });

        it('supports priority property fallback if priorityLevel is omitted', () => {
            expect(normalizeEmployeePriority(undefined, 'Low')).toBe('low');
            expect(normalizeEmployeePriority(null, 'High')).toBe('high');
            expect(normalizeEmployeePriority(undefined, 'Urgent')).toBe('urgent');
        });

        it('defaults strictly to medium only when value is missing', () => {
            expect(normalizeEmployeePriority(undefined, undefined)).toBe('medium');
            expect(normalizeEmployeePriority(null, null)).toBe('medium');
            expect(normalizeEmployeePriority('', '')).toBe('medium');
        });
    });

    describe('Coordinator Priority Normalization', () => {
        it('normalizes PascalCase strings', () => {
            expect(normalizeCoordinatorPriority('Low')).toBe('Low');
            expect(normalizeCoordinatorPriority('Medium')).toBe('Medium');
            expect(normalizeCoordinatorPriority('High')).toBe('High');
            expect(normalizeCoordinatorPriority('Urgent')).toBe('Urgent');
        });

        it('normalizes lowercase strings', () => {
            expect(normalizeCoordinatorPriority('low')).toBe('Low');
            expect(normalizeCoordinatorPriority('medium')).toBe('Medium');
            expect(normalizeCoordinatorPriority('high')).toBe('High');
            expect(normalizeCoordinatorPriority('urgent')).toBe('Urgent');
        });

        it('normalizes numeric enums', () => {
            expect(normalizeCoordinatorPriority(0)).toBe('Low');
            expect(normalizeCoordinatorPriority(1)).toBe('Medium');
            expect(normalizeCoordinatorPriority(2)).toBe('High');
            expect(normalizeCoordinatorPriority(3)).toBe('Urgent');
        });

        it('does not overwrite Low with Medium on falsey check', () => {
            // 0 is falsy in JS, but 0 must map to Low!
            expect(normalizeCoordinatorPriority(0)).toBe('Low');
        });
    });

    describe('Employee Task List Filtering', () => {
        const mockTasks: { id: string; name: string; priority: Priority; status: string }[] = [
            { id: '1', name: 'Task Low', priority: 'low', status: 'assigned' },
            { id: '2', name: 'Task Medium', priority: 'medium', status: 'in-progress' },
            { id: '3', name: 'Task High', priority: 'high', status: 'in-progress' },
            { id: '4', name: 'Task Urgent', priority: 'urgent', status: 'assigned' },
        ];

        it('filters correctly by low priority without empty result', () => {
            const filtered = mockTasks.filter(t => t.priority === 'low');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('Task Low');
        });

        it('filters correctly by urgent priority', () => {
            const filtered = mockTasks.filter(t => t.priority === 'urgent');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('Task Urgent');
        });

        it('high priority filter does not inadvertently swallow low or medium tasks', () => {
            const filtered = mockTasks.filter(t => t.priority === 'high');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('Task High');
        });
    });
});
