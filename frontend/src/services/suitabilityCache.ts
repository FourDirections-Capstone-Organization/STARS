import { SuitabilityResponseDTO } from './aiService';

export interface CachedSuitabilityEntry {
    items: SuitabilityResponseDTO[];
    timestamp: number;
    isCacheHit: boolean;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class SuitabilityCache {
    private cache = new Map<string, { items: SuitabilityResponseDTO[]; timestamp: number }>();
    private inFlight = new Map<string, Promise<SuitabilityResponseDTO[]>>();
    public hits = 0;
    public misses = 0;

    /**
     * Generates a deterministic cache key from evaluation parameters.
     */
    generateKey(params: { taskId?: string; departmentId?: string; classification?: number }): string {
        if (params.taskId && params.taskId.trim()) {
            return `task:${params.taskId.trim()}`;
        }
        const dept = params.departmentId && params.departmentId.trim() ? params.departmentId.trim() : 'all';
        const cls = params.classification ?? 0;
        return `dept:${dept}:cls:${cls}`;
    }

    /**
     * Returns cached items if available and not expired.
     */
    get(key: string, ttlMs: number = DEFAULT_TTL_MS): CachedSuitabilityEntry | null {
        const entry = this.cache.get(key);
        if (!entry) {
            this.misses++;
            return null;
        }

        if (Date.now() - entry.timestamp > ttlMs) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        this.hits++;
        return {
            items: entry.items,
            timestamp: entry.timestamp,
            isCacheHit: true,
        };
    }

    /**
     * Stores evaluated items in memory.
     */
    set(key: string, items: SuitabilityResponseDTO[]): void {
        this.cache.set(key, {
            items: [...items],
            timestamp: Date.now(),
        });
    }

    /**
     * Checks if a valid, unexpired entry exists for key.
     */
    has(key: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;
        if (Date.now() - entry.timestamp > ttlMs) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    /**
     * Anti-spam helper: deduplicates simultaneous/inflight requests for the same key.
     */
    async getOrFetch(
        key: string,
        fetcher: () => Promise<SuitabilityResponseDTO[]>,
        ttlMs: number = DEFAULT_TTL_MS
    ): Promise<{ items: SuitabilityResponseDTO[]; fromCache: boolean }> {
        const cached = this.get(key, ttlMs);
        if (cached) {
            return { items: cached.items, fromCache: true };
        }

        if (this.inFlight.has(key)) {
            const items = await this.inFlight.get(key)!;
            return { items, fromCache: true };
        }

        const fetchPromise = (async () => {
            try {
                const items = await fetcher();
                if (items && items.length > 0) {
                    this.set(key, items);
                }
                return items;
            } finally {
                this.inFlight.delete(key);
            }
        })();

        this.inFlight.set(key, fetchPromise);
        const items = await fetchPromise;
        return { items, fromCache: false };
    }

    /**
     * Clears all cached entries and resets statistics.
     */
    clear(): void {
        this.cache.clear();
        this.inFlight.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

export const suitabilityCache = new SuitabilityCache();

/**
 * Normalizes suitability candidate items into strictly sequential unique 1..N ranks.
 * Tie-breaking rules:
 * 1. Suitability score descending
 * 2. Active workload ascending
 * 3. FullName ascending
 */
export function reRankSuitabilityItems(items: SuitabilityResponseDTO[]): SuitabilityResponseDTO[] {
    if (!items || items.length === 0) return [];

    // Deduplicate by employeeId keeping the higher score if duplicates exist
    const map = new Map<string, SuitabilityResponseDTO>();
    for (const item of items) {
        if (!map.has(item.employeeId)) {
            map.set(item.employeeId, item);
        } else {
            const existing = map.get(item.employeeId)!;
            if (item.suitabilityScore > existing.suitabilityScore) {
                map.set(item.employeeId, item);
            }
        }
    }

    const uniqueList = Array.from(map.values());

    uniqueList.sort((a, b) => {
        const scoreDiff = (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0);
        if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
        const workloadDiff = (a.workload ?? 0) - (b.workload ?? 0);
        if (workloadDiff !== 0) return workloadDiff;
        return (a.fullName || '').localeCompare(b.fullName || '');
    });

    return uniqueList.map((item, index) => ({
        ...item,
        rank: index + 1,
    }));
}
