/**
 * Utility to calculate next incremental title when an existing identical title is found.
 */
export function resolveIncrementalTitlePreview(baseTitle: string, existingTitles: string[]): string {
    if (!baseTitle || !baseTitle.trim()) return baseTitle;
    const trimmed = baseTitle.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, 'i');

    let baseExists = false;
    const existingSuffixes = new Set<number>();

    for (const title of existingTitles) {
        if (!title || !title.trim()) continue;
        const match = regex.exec(title.trim());
        if (match) {
            if (match[1] !== undefined && match[1] !== '') {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) {
                    existingSuffixes.add(num);
                }
            } else {
                baseExists = true;
            }
        }
    }

    if (!baseExists) return trimmed;

    let nextNumber = 1;
    while (existingSuffixes.has(nextNumber)) {
        nextNumber++;
    }

    return `${trimmed} ${nextNumber}`;
}
