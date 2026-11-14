/**
 * Driver and courier identification display utilities.
 * Normalizes driver identifiers across dashboards, cards, modals, and exports into the
 * standard STARS/DMS format: "EMP-008 · Ricardo Bautista" (or ID fallback when name is absent).
 */

export interface DriverDisplayInfo {
    displayText: string;
    isInactive: boolean;
    employeeId?: string | null;
    fullName?: string | null;
}

export interface FormatDriverOptions {
    /**
     * Formatting layout:
     * - 'id-first': "EMP-008 · Ricardo Bautista" (standard across STARS/DMS)
     * - 'name-first': "Ricardo Bautista (EMP-008)" (legacy layout)
     * - 'name-only': "Ricardo Bautista" (clean courier name with fallback to employee ID/Unassigned)
     * Defaults to 'id-first'.
     */
    layout?: 'id-first' | 'name-first' | 'name-only';
    /**
     * Fallback text when neither employee ID nor full name is available.
     * Defaults to 'Unassigned'.
     */
    fallback?: string;
}

/**
 * Standard driver separator: middle dot with surrounding spaces.
 */
export const DRIVER_DISPLAY_SEPARATOR = ' · ';

export interface DriverObjectInput {
    fullName?: string | null;
    employeeId?: string | null;
    courierFullName?: string | null;
    courierEmployeeId?: string | null;
    driverName?: string | null;
    driverId?: string | null;
    isActive?: boolean | null;
    courierIsActive?: boolean | null;
    driverIsActive?: boolean | null;
    isInactive?: boolean | null;
}

/**
 * Formats driver / courier identification into a unified label.
 *
 * Standard format ('id-first'):
 * - Both ID and name present: "EMP-008 · Ricardo Bautista"
 * - ID only present (or name identical to ID): "EMP-008"
 * - Name only present (no ID): "Ricardo Bautista"
 * - Neither present: "Unassigned" (or options.fallback)
 *
 * Supports positional arguments (fullName, employeeId, isActive, options)
 * or a single driver object.
 *
 * Flags isInactive = true only when isActive === false.
 */
export function formatDriverDisplay(
    fullNameOrObj?: string | null | DriverObjectInput,
    employeeId?: string | null,
    isActive?: boolean | null,
    options?: FormatDriverOptions
): DriverDisplayInfo {
    let rawName: string | null = null;
    let rawEmpId: string | null = null;
    let rawIsActive: boolean | null | undefined = isActive;

    if (fullNameOrObj && typeof fullNameOrObj === 'object') {
        const obj = fullNameOrObj as DriverObjectInput;
        rawName = obj.fullName ?? obj.courierFullName ?? obj.driverName ?? null;
        rawEmpId = obj.employeeId ?? obj.courierEmployeeId ?? obj.driverId ?? null;
        rawIsActive = obj.isActive ?? obj.courierIsActive ?? obj.driverIsActive;
        if (obj.isInactive === true) rawIsActive = false;
    } else {
        rawName = fullNameOrObj ?? null;
        rawEmpId = employeeId ?? null;
    }

    const fallback = options?.fallback ?? 'Unassigned';
    const layout = options?.layout ?? 'id-first';

    const cleanName = (rawName || '').trim();
    const cleanEmpId = (rawEmpId || '').trim();

    // Determine whether name and empId are meaningful
    const hasEmp = cleanEmpId.length > 0 && cleanEmpId.toLowerCase() !== 'unassigned';
    const hasName =
        cleanName.length > 0 &&
        cleanName.toLowerCase() !== 'unassigned' &&
        (!hasEmp || cleanName !== cleanEmpId);

    let displayText = fallback;

    if (layout === 'name-only') {
        if (hasName) {
            if (cleanName.includes(DRIVER_DISPLAY_SEPARATOR)) {
                const parts = cleanName.split(DRIVER_DISPLAY_SEPARATOR);
                displayText = parts[parts.length - 1].trim();
            } else if (cleanEmpId && cleanName.startsWith(`${cleanEmpId} - `)) {
                displayText = cleanName.substring(cleanEmpId.length + 3).trim();
            } else {
                displayText = cleanName;
            }
        } else if (hasEmp) {
            displayText = cleanEmpId;
        } else {
            displayText = fallback;
        }
    } else if (hasEmp && hasName) {
        // If the name already contains the paired layout, avoid duplication
        if (cleanName.includes(DRIVER_DISPLAY_SEPARATOR)) {
            displayText = cleanName;
        } else if (cleanName.startsWith(`${cleanEmpId} - `) || cleanName.startsWith(`${cleanEmpId}: `)) {
            const stripped = cleanName.substring(cleanEmpId.length + 3).trim();
            displayText = `${cleanEmpId}${DRIVER_DISPLAY_SEPARATOR}${stripped}`;
        } else if (layout === 'name-first') {
            displayText = `${cleanName} (${cleanEmpId})`;
        } else {
            displayText = `${cleanEmpId}${DRIVER_DISPLAY_SEPARATOR}${cleanName}`;
        }
    } else if (hasEmp) {
        displayText = cleanEmpId;
    } else if (hasName) {
        displayText = cleanName;
    } else {
        displayText = fallback;
    }

    const isInactive = rawIsActive === false;

    return {
        displayText,
        isInactive,
        employeeId: hasEmp ? cleanEmpId : null,
        fullName: hasName ? cleanName : null,
    };
}

