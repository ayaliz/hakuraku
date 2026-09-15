import { useEffect, useState } from 'react';
import { ungzip } from 'pako';
import { expandPerformerIndex } from './serialization';

export const DATA_ROOT = `${import.meta.env.BASE_URL}data/simdata`;
const rawApiBase = (import.meta.env.VITE_SIMDATA_API_BASE ?? "").trim();
export const SIMDATA_API_BASE = rawApiBase === "same-origin" ? "" : rawApiBase.replace(/\/$/, "");
export const simDataApiUrl = (path: string) => `${SIMDATA_API_BASE}${path}`;
const cache = new Map<string, unknown>();

export function useSimData<T>(url: string | null, snapshotId?: string, fallbackUrl?: string) {
    const [result, setResult] = useState<{ url: string | null; data?: T; error?: string }>({ url: null });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!url) return;
        if (cache.has(url)) { setResult({ url, data: cache.get(url) as T }); return; }
        const controller = new AbortController();
        setResult({ url });
        const load = async () => {
            let lastError: unknown;
            for (const candidate of [url, fallbackUrl].filter((value): value is string => Boolean(value))) {
                try {
                    const response = await fetch(candidate, { signal: controller.signal });
                    if (!response.ok) throw new Error(`Data is unavailable (HTTP ${response.status}).`);
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? ungzip(bytes, { to: 'string' }) : new TextDecoder().decode(bytes);
                    let data = JSON.parse(json);
                    if (snapshotId && data.snapshotId !== snapshotId) throw new Error('These results belong to a different snapshot. Reload the page.');
                    if ((data.format === 2 || data.format === 3) && Array.isArray(data.builds) && Array.isArray(data.teams)) data = expandPerformerIndex(data);
                    if (!controller.signal.aborted) { cache.set(url, data); setResult({ url, data }); }
                    return;
                } catch (error) {
                    if (controller.signal.aborted) return;
                    lastError = error;
                }
            }
            throw lastError;
        };
        load().catch(error => {
            if (!controller.signal.aborted) setResult({ url, error: error instanceof Error ? error.message : 'Could not load the results.' });
        });
        return () => controller.abort();
    }, [url, snapshotId, fallbackUrl, attempt]);
    return { data: result.url === url ? result.data : undefined, error: result.url === url ? result.error : undefined,
        retry: () => setAttempt(value => value + 1) };
}
