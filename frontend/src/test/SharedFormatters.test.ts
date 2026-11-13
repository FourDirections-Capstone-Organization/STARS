import { describe, it, expect } from 'vitest';
import {
    formatDateOnly,
    formatDateToIsoDate,
    parseLocalDate,
} from '../utils/dateUtils';
import {
    formatDriverDisplay,
    DRIVER_DISPLAY_SEPARATOR,
} from '../utils/driverUtils';

describe('Shared Date-Only Formatter (formatDateOnly)', () => {
    describe('Standard and edge-case date string conversions', () => {
        it('formats standard YYYY-MM-DD to DD/MM/YYYY', () => {
            expect(formatDateOnly('2026-11-13')).toBe('13/11/2026');
            expect(formatDateOnly('2026-05-04')).toBe('04/05/2026');
            expect(formatDateOnly('2026-01-01')).toBe('01/01/2026');
        });

        it('normalizes UTC midnight ISO timestamp without timezone drift', () => {
            // Defect scenario: UTC midnight shifting to 08:00 or wrong day
            expect(formatDateOnly('2026-11-13T00:00:00Z')).toBe('13/11/2026');
            expect(formatDateOnly('2026-11-13T00:00:00.000Z')).toBe('13/11/2026');
            expect(formatDateOnly('2026-11-13T00:00:00')).toBe('13/11/2026');
        });

        it('handles timestamps near midnight (1s before and 1s after)', () => {
            // 1 second after midnight UTC
            expect(formatDateOnly('2026-11-13T00:00:01Z')).toBe('13/11/2026');
            // 1 second before midnight UTC (23:59:59)
            expect(formatDateOnly('2026-11-13T23:59:59Z')).toBe('13/11/2026');
            // Midnight with timezone offset
            expect(formatDateOnly('2026-11-13T00:00:00+08:00')).toBe('13/11/2026');
            expect(formatDateOnly('2026-11-13T00:00:00-05:00')).toBe('13/11/2026');
        });

        it('handles Date objects accurately', () => {
            const localDate = new Date(2026, 10, 13); // Nov 13, 2026
            expect(formatDateOnly(localDate)).toBe('13/11/2026');

            const utcDate = new Date('2026-11-13T00:00:00Z');
            expect(formatDateOnly(utcDate)).toBe('13/11/2026');
        });

        it('returns em-dash fallback for null, undefined, and empty values', () => {
            expect(formatDateOnly(null)).toBe('—');
            expect(formatDateOnly(undefined)).toBe('—');
            expect(formatDateOnly('')).toBe('—');
            expect(formatDateOnly('   ')).toBe('—');
            expect(formatDateOnly('—')).toBe('—');
        });

        it('gracefully handles invalid date strings and impossible dates', () => {
            expect(formatDateOnly('invalid-date')).toBe('—');
            expect(formatDateOnly('not-a-timestamp')).toBe('—');
            // Feb 30 does not exist
            expect(formatDateOnly('2026-02-30')).toBe('—');
            // Month 13 does not exist
            expect(formatDateOnly('2026-13-01')).toBe('—');
        });
    });

    describe('parseLocalDate & formatDateToIsoDate utilities', () => {
        it('parseLocalDate safely parses YYYY-MM-DD and UTC midnight ISO timestamps', () => {
            const d1 = parseLocalDate('2026-11-13');
            expect(d1).not.toBeNull();
            expect(d1?.getFullYear()).toBe(2026);
            expect(d1?.getMonth()).toBe(10); // November (0-indexed)
            expect(d1?.getDate()).toBe(13);

            const d2 = parseLocalDate('2026-11-13T00:00:00Z');
            expect(d2).not.toBeNull();
            expect(d2?.getFullYear()).toBe(2026);
            expect(d2?.getMonth()).toBe(10);
            expect(d2?.getDate()).toBe(13);

            expect(parseLocalDate(null)).toBeNull();
            expect(parseLocalDate('')).toBeNull();
            expect(parseLocalDate('invalid')).toBeNull();
        });

        it('formatDateToIsoDate formats dates into YYYY-MM-DD for date inputs', () => {
            expect(formatDateToIsoDate('2026-11-13T00:00:00Z')).toBe('2026-11-13');
            expect(formatDateToIsoDate('2026-11-13')).toBe('2026-11-13');
            expect(formatDateToIsoDate(new Date(2026, 10, 13))).toBe('2026-11-13');
            expect(formatDateToIsoDate(null)).toBe('');
            expect(formatDateToIsoDate('')).toBe('');
        });
    });
});

describe('Shared Driver Formatter (formatDriverDisplay)', () => {
    describe('Standard STARS/DMS format ("EMP-008 · Ricardo Bautista")', () => {
        it('formats active driver returning "EMP-008 · Ricardo Bautista"', () => {
            const res = formatDriverDisplay('Ricardo Bautista', 'EMP-008', true);
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
            expect(res.isInactive).toBe(false);
            expect(res.employeeId).toBe('EMP-008');
            expect(res.fullName).toBe('Ricardo Bautista');
        });

        it('defaults isActive to active when omitted or null', () => {
            const res = formatDriverDisplay('Ricardo Bautista', 'EMP-008');
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
            expect(res.isInactive).toBe(false);
        });

        it('flags isInactive = true when driver account is inactive', () => {
            const res = formatDriverDisplay('Ricardo Bautista', 'EMP-008', false);
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
            expect(res.isInactive).toBe(true);
        });
    });

    describe('ID Fallback and Missing Names', () => {
        it('returns ID fallback when full name is missing (null or undefined)', () => {
            const resNull = formatDriverDisplay(null, 'EMP-008');
            expect(resNull.displayText).toBe('EMP-008');
            expect(resNull.employeeId).toBe('EMP-008');
            expect(resNull.fullName).toBeNull();

            const resUndef = formatDriverDisplay(undefined, 'EMP-008');
            expect(resUndef.displayText).toBe('EMP-008');
        });

        it('returns ID fallback when full name is empty or whitespace', () => {
            expect(formatDriverDisplay('', 'EMP-008').displayText).toBe('EMP-008');
            expect(formatDriverDisplay('   ', 'EMP-008').displayText).toBe('EMP-008');
        });

        it('returns ID fallback when full name is identical to employee ID', () => {
            expect(formatDriverDisplay('EMP-008', 'EMP-008').displayText).toBe('EMP-008');
        });

        it('returns ID fallback when full name is literal "Unassigned"', () => {
            expect(formatDriverDisplay('Unassigned', 'EMP-008').displayText).toBe('EMP-008');
        });

        it('returns full name fallback when employee ID is missing', () => {
            const res = formatDriverDisplay('Ricardo Bautista', null);
            expect(res.displayText).toBe('Ricardo Bautista');
            expect(res.employeeId).toBeNull();
            expect(res.fullName).toBe('Ricardo Bautista');
        });

        it('returns "Unassigned" when neither employee ID nor name is provided', () => {
            expect(formatDriverDisplay(null, null).displayText).toBe('Unassigned');
            expect(formatDriverDisplay(undefined, undefined).displayText).toBe('Unassigned');
            expect(formatDriverDisplay('', '').displayText).toBe('Unassigned');
            expect(formatDriverDisplay('Unassigned', null).displayText).toBe('Unassigned');
            expect(formatDriverDisplay(null, 'Unassigned').displayText).toBe('Unassigned');
        });

        it('supports custom fallback string', () => {
            const res = formatDriverDisplay(null, null, undefined, { fallback: 'Auto / Pool' });
            expect(res.displayText).toBe('Auto / Pool');
        });
    });

    describe('Driver Object Input Support', () => {
        it('accepts driver object input with courier properties', () => {
            const res = formatDriverDisplay({
                courierFullName: 'Ricardo Bautista',
                courierEmployeeId: 'EMP-008',
                courierIsActive: true,
            });
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
            expect(res.isInactive).toBe(false);
        });

        it('accepts driver object input with driver properties and inactive status', () => {
            const res = formatDriverDisplay({
                driverName: 'Ricardo Bautista',
                driverId: 'EMP-008',
                driverIsActive: false,
            });
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
            expect(res.isInactive).toBe(true);
        });
    });

    describe('Layout Options & Idempotency', () => {
        it('supports legacy layout option ("Ricardo Bautista (EMP-008)")', () => {
            const res = formatDriverDisplay('Ricardo Bautista', 'EMP-008', true, { layout: 'name-first' });
            expect(res.displayText).toBe('Ricardo Bautista (EMP-008)');
        });

        it('is idempotent when name already contains standard separator', () => {
            const res = formatDriverDisplay('EMP-008 · Ricardo Bautista', 'EMP-008');
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
        });

        it('normalizes legacy dash separator prefix', () => {
            const res = formatDriverDisplay('EMP-008 - Ricardo Bautista', 'EMP-008');
            expect(res.displayText).toBe('EMP-008 · Ricardo Bautista');
        });

        it('exports the standard separator', () => {
            expect(DRIVER_DISPLAY_SEPARATOR).toBe(' · ');
        });
    });
});

