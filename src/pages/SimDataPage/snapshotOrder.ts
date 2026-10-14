import type { Snapshot } from './types';

function cmNumber(snapshot: Snapshot): number {
    const match = snapshot.cmId.trim().match(/^cm(\d+)/i);
    return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
}

/** Match the dataset selector's newest-competition ordering, not manifest order. */
export function newestCmBadgeLabel(snapshots: { cmId: string }[]): string {
    const numbers = snapshots.flatMap(snapshot => {
        const match = snapshot.cmId?.trim().match(/^cm(\d+)(?:$|[-_.])/i);
        return match ? [Number(match[1])] : [];
    });
    return numbers.length ? `CM${Math.max(...numbers)} updated!` : 'Check this out!';
}

function snapshotDate(snapshot: Snapshot): string {
    const capturedThrough = snapshot.meta.capturedThrough?.trim();
    if (capturedThrough) return capturedThrough;
    return snapshot.snapshotId.match(/\d{4}-?\d{2}-?\d{2}/)?.[0] ?? '';
}

/** Newest competition first, then newest daily snapshot within that competition. */
export function newestSimDataSnapshots(snapshots: Snapshot[]): Snapshot[] {
    return snapshots.map((snapshot, manifestIndex) => ({ snapshot, manifestIndex }))
        .sort((left, right) => {
            const cmDifference = cmNumber(right.snapshot) - cmNumber(left.snapshot);
            if (cmDifference) return cmDifference;
            const dateDifference = snapshotDate(right.snapshot).localeCompare(snapshotDate(left.snapshot));
            if (dateDifference) return dateDifference;
            return left.manifestIndex - right.manifestIndex;
        })
        .map(({ snapshot }) => snapshot);
}
