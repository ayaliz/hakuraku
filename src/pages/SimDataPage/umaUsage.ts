export type UmaUsagePair = { card: number; chara: number; style: number; players: number };
export type UmaUsage = { snapshotId: string; totalPlayers: number; pairs: UmaUsagePair[]; archetypes?: Record<string, number>; contexts?: Record<string, number>; skills?: { id: number; style: number; players: number }[] };

export function groupUmaUsage(data: UmaUsage) {
    const grouped = new Map<number, { card: number; chara: number; players: number; styles: UmaUsagePair[] }>();
    for (const pair of data.pairs) {
        const row = grouped.get(pair.card) ?? { card: pair.card, chara: pair.chara, players: 0, styles: [] };
        row.players += pair.players;
        row.styles.push(pair);
        grouped.set(pair.card, row);
    }
    return [...grouped.values()].sort((a, b) => b.players - a.players || a.card - b.card)
        .map(row => ({ ...row, usagePct: data.totalPlayers > 0 ? row.players / data.totalPlayers * 100 : 0,
            styles: row.styles.sort((a, b) => a.style - b.style) }));
}

// Performance exposures and outcomes deliberately remain from the full simulation.
export function applyPlayerUsage<T extends import('./types').Summary>(data: T, usage: UmaUsage): T {
    const counts = new Map(usage.pairs.map(p => [`${p.card}:${p.style}`, p.players]));
    const styleCounts = new Map<number, number>();
    for (const p of usage.pairs) styleCounts.set(p.style, (styleCounts.get(p.style) ?? 0) + p.players);
    return { ...data, meta: { ...data.meta, populationOwners: usage.totalPlayers },
        pairs: data.pairs.map(p => ({ ...p, owners: counts.get(p.key) ?? 0,
            pop: usage.totalPlayers ? (counts.get(p.key) ?? 0) / (usage.totalPlayers * 3) : 0,
            stylePop: styleCounts.get(p.style) ? (counts.get(p.key) ?? 0) / styleCounts.get(p.style)! : 0 })),
        archetypes: data.archetypes.map(a => ({ ...a, owners: usage.archetypes?.[a.key] ?? 0 })) };
}

export function supportsPlayerUsage(snapshot: { playerUsage?: { schemaVersion: number } }) {
    return snapshot.playerUsage?.schemaVersion === 1;
}
