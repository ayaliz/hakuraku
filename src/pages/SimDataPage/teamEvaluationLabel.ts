import type { Performer } from './types';

export function teamBenchReason(team: Performer): string {
    if (team.benchReason === 'retained-team cap') return 'maximum per-player team cap';
    if (team.benchReason?.includes('interval separated from leader')) return "performance gap to player's best team";
    return team.benchReason ?? 'final bench decision';
}

export function teamBenchMessage(team: Performer): string {
    const date = team.benchDate ?? team.evaluatedSnapshotId?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (team.benchReason === 'retained-team cap') return `Paused${date ? ` after ${date}` : ''} due to maximum per-player team cap; eligible for prescreening review`;
    return `Removed from future simulations${date ? ` after ${date}` : ''} due to ${teamBenchReason(team)}`;
}

export function teamEvaluationLabel(team: Performer, snapshotId: string): string {
    const status = team.benched ? `${team.benchReason === 'retained-team cap' ? 'Paused' : 'Benched'} due to ${teamBenchReason(team)} - ` : '';
    if (team.n <= 0) return `${status}Not yet simulated`;
    // Historical/benched rows must never be presented as evaluated today when
    // their last evaluation provenance is unavailable in an older static index.
    const snapshot = team.evaluatedSnapshotId ?? (team.benched || team.historical ? undefined : snapshotId);
    const date = snapshot?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return `${status}Last simulated ${date ?? snapshot ?? 'date unavailable'}`;
}
