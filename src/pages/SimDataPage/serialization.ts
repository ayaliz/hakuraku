import type { CompactPerformerIndex, PerformerIndex } from './types';

function wilson(wins: number, n: number): [number, number] {
    const z = 1.959963984540054, p = wins / n, d = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / d;
    const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function expandPerformerIndex(data: CompactPerformerIndex): PerformerIndex {
    if (data.format === 3 && (data.teamIds?.length !== data.teams.length
        || data.teamIds.some(id => !/^[a-f0-9]{64}$/.test(id)))) {
        throw new Error('The performer archive team ID mapping is invalid.');
    }
    const builds = data.builds.map(([card, chara, style, racingStyle, score], i) => ({ id: `b${i}`, card, chara, style: style as 1 | 2 | 3 | 4 | 5 | 6, racingStyle, score }));
    const owners = new Map<number, { id: string; names: string[] }>();
    return { snapshotId: data.snapshotId, teams: data.teams.map(([owner, a, b, c, n, wa, wb, wc], i) => {
        if (!owners.has(owner)) owners.set(owner, { id: `p${owner}`, names: [`Player ${owner + 1}`] });
        const wins = wa + wb + wc;
        return { id: data.teamIds?.[i] ?? `t${i}`, archiveIndex: i, owner: owners.get(owner)!, members: [builds[a], builds[b], builds[c]], n, wins, memberWins: [wa, wb, wc], ci: wilson(wins, n) };
    }) };
}

