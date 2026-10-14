import type { Snapshot } from './types';
import { newestSimDataSnapshots } from './snapshotOrder';

export const SNAPSHOT_CHECK_EVENT = 'simdata-check-snapshot';
export const SNAPSHOT_UPDATE_MESSAGE = 'This snapshot may have been replaced. Use the update prompt above to view the latest results.';

export function replacementSnapshot(current: Snapshot | undefined, snapshots: Snapshot[]): Snapshot | undefined {
    if (!current) return undefined;
    const latest = newestSimDataSnapshots(snapshots.filter(snapshot => snapshot.cmId === current.cmId))[0];
    return latest && latest.snapshotId !== current.snapshotId ? latest : undefined;
}

export async function readSimDataResponse(response: Response): Promise<unknown> {
    if (!response.ok) throw new Error(`Data is unavailable (HTTP ${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { ungzip } = await import('pako');
    const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? ungzip(bytes, { to: 'string' }) : new TextDecoder().decode(bytes);
    if (json.trimStart().startsWith('<')) throw new Error('The server returned a page instead of result data. Please retry.');
    return JSON.parse(json);
}
