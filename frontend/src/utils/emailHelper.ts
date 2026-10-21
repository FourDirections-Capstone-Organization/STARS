// Common typo corrections for standard email service providers
const DOMAIN_CORRECTIONS: Record<string, string> = {
    // Gmail variants & typos
    'gmaill.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gmaik.com': 'gmail.com',
    'gemail.com': 'gmail.com',
    'gmeil.com': 'gmail.com',
    'gmaul.com': 'gmail.com',
    'gmaio.com': 'gmail.com',
    'gmaol.com': 'gmail.com',
    'gmali.com': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.co': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gmail.comm': 'gmail.com',
    'gmaill.con': 'gmail.com',
    'gmaill.co': 'gmail.com',
    'gmaill.comm': 'gmail.com',
    'gmai.con': 'gmail.com',
    'gamil.con': 'gmail.com',
    'gmial.con': 'gmail.com',
    'googlemail.con': 'googlemail.com',

    // Yahoo variants & typos
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
    'yaho.co': 'yahoo.com',
    'yahoo.con': 'yahoo.com',
    'yahu.com': 'yahoo.com',
    'yaho.comm': 'yahoo.com',
    'yahoo.comm': 'yahoo.com',
    'yaho.com.ph': 'yahoo.com.ph',
    'yahooo.com.ph': 'yahoo.com.ph',
    'yahoo.con.ph': 'yahoo.com.ph',

    // Outlook variants & typos
    'outlok.com': 'outlook.com',
    'outloo.com': 'outlook.com',
    'outlook.con': 'outlook.com',
    'outlock.com': 'outlook.com',
    'outlook.co': 'outlook.com',
    'outlook.comm': 'outlook.com',
    'outllok.com': 'outlook.com',
    'outluk.com': 'outlook.com',

    // Hotmail variants & typos
    'hotmial.com': 'hotmail.com',
    'hotmaill.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'hotmali.com': 'hotmail.com',
    'hotmail.con': 'hotmail.com',
    'hotmaill.con': 'hotmail.com',
    'hotmail.comm': 'hotmail.com',
    'hotmil.com': 'hotmail.com',

    // iCloud variants & typos
    'iclou.com': 'icloud.com',
    'icloudd.com': 'icloud.com',
    'icloud.con': 'icloud.com',
    'iclould.com': 'icloud.com',
    'icloud.comm': 'icloud.com',
    'icluod.com': 'icloud.com',
};

export interface AutoCorrectEmailResult {
    email: string;
    wasCorrected: boolean;
    originalDomain?: string;
    correctedDomain?: string;
}

/**
 * Checks an email string for standard provider typos and generic TLD typos (.con, .comm -> .com)
 * and returns the corrected email and whether a correction took place.
 */
export function autoCorrectEmail(rawEmail: string): AutoCorrectEmailResult {
    if (!rawEmail) {
        return { email: '', wasCorrected: false };
    }

    const trimmed = rawEmail.trim();
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex <= 0 || atIndex >= trimmed.length - 1) {
        return { email: trimmed, wasCorrected: false };
    }

    const localPart = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1).toLowerCase();

    // 1. Check exact dictionary match
    if (DOMAIN_CORRECTIONS[domain]) {
        const correctedDomain = DOMAIN_CORRECTIONS[domain];
        return {
            email: `${localPart}@${correctedDomain}`,
            wasCorrected: true,
            originalDomain: domain,
            correctedDomain,
        };
    }

    // 2. Generic TLD typos: .con -> .com
    if (domain.endsWith('.con')) {
        const base = domain.slice(0, -4);
        const correctedDomain = `${base}.com`;
        return {
            email: `${localPart}@${correctedDomain}`,
            wasCorrected: true,
            originalDomain: domain,
            correctedDomain,
        };
    }

    // 3. Generic TLD typos: .comm or .coom -> .com
    if (domain.endsWith('.comm') || domain.endsWith('.coom')) {
        const base = domain.slice(0, -5);
        const correctedDomain = `${base}.com`;
        return {
            email: `${localPart}@${correctedDomain}`,
            wasCorrected: true,
            originalDomain: domain,
            correctedDomain,
        };
    }

    return { email: `${localPart}@${domain}`, wasCorrected: false };
}

/**
 * Returns the corrected email string directly.
 */
export function cleanEmail(rawEmail: string): string {
    return autoCorrectEmail(rawEmail).email;
}
