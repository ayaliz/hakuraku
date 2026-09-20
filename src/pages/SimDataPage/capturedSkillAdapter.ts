import type { SkillStats, SkillActivationBuckets } from '../MultiRacePage/types';
import type { GroupSkillDetailPayload, SerializedSkillWinBreakdownRow } from '../../features/umalogs/model/skillCache';
export type Row = [number, string, number, number, number, number, number, number, number, number, number];
export type Overview = { snapshotId: string; races: number; players: number; courseDistance: number; rows: Row[]; allPlayerCounts: Record<string, number>; variants?: Record<string, number[]>; populationByStyle?: Record<string, [number, number]> };
export type Detail = { snapshotId: string; skillId: number; bucketCount: number; courseDistance: number; styles: Record<string, [number, number, number, number, number][]>; variants?: Record<string, { rows: Row[]; styles: Detail['styles'] }> };
export const styles = [{ native: 'Oonige', id: 5, name: 'Runaway' }, { native: 'Nige', id: 1, name: 'Front Runner' }, { native: 'Senko', id: 2, name: 'Pace Chaser' }, { native: 'Sashi', id: 3, name: 'Late Surger' }, { native: 'Oikomi', id: 4, name: 'End Closer' }];
function timing(bins: number[], distance: number) {
    const count = bins.reduce((a, b) => a + b, 0);
    if (!count) return { mean: NaN, median: NaN };
    let cumulative = 0, median = NaN;
    bins.forEach((n, i) => { cumulative += n; if (!Number.isFinite(median) && cumulative >= count / 2) median = (i + .5) * distance / bins.length; });
    return { mean: bins.reduce((sum, n, i) => sum + n * (i + .5) * distance / bins.length, 0) / count, median };
}
export function adaptOverview(data: Overview, details: Map<number, GroupSkillDetailPayload>, name: (id: number) => string) {
    const stats = new Map<number, SkillStats>();
    const players = new Map<number, { all: number; byStrategy: Record<string, number> }>();
    for (const [id, native, owners, owned, active, procs, , wins] of data.rows) {
        const style = styles.find(s => s.native === native);
        if (!style) throw new Error(`Unsupported running style: ${native}`);
        if (!stats.has(id)) {
            const skillName = name(id);
            const variantIds = [id, ...(data.variants?.[id] ?? []).filter(variant => variant !== id)];
            const skillNames = [...new Set(variantIds.map(variant => `${name(variant)}${variant >= 900000 && variant < 1000000 ? ' (Inherit)' : ''}`))];
            stats.set(id, { skillId: id, skillName, skillNames, timesActivated: 0, normalizedActivations: NaN, uniqueRaces: NaN, uniqueHorses: 0, learnedByHorses: 0, activationOpportunities: 0, winRate: 0, avgFinishPosition: NaN, activationDistances: [], learnedByCharaIds: new Set(), learnedByStrategies: new Set(), learnedByHorsesByStrategy: {}, uniqueHorsesByStrategy: {}, activationOpportunitiesByStrategy: {}, timesActivatedByStrategy: {}, meanDistance: NaN, medianDistance: NaN, meanDistanceByStrategy: {}, medianDistanceByStrategy: {} });
            players.set(id, { all: data.allPlayerCounts[id], byStrategy: {} });
        }
        const s = stats.get(id)!;
        s.timesActivated += procs; s.uniqueHorses += active; s.learnedByHorses += owned; s.activationOpportunities! += owned;
        s.winRate += wins; s.learnedByStrategies.add(style.id);
        s.learnedByHorsesByStrategy![style.id] = owned; s.uniqueHorsesByStrategy![style.id] = active;
        s.activationOpportunitiesByStrategy![style.id] = owned; s.timesActivatedByStrategy![style.id] = procs;
        players.get(id)!.byStrategy[style.id] = owners;
    }
    for (const [id, s] of stats) {
        s.winRate = s.uniqueHorses ? 100 * s.winRate / s.uniqueHorses : 0;
        const detail = details.get(id);
        if (!detail) continue;
        const all = timing(detail.buckets.all, data.courseDistance);
        s.meanDistance = all.mean; s.medianDistance = all.median;
        for (const [style, bins] of Object.entries(detail.buckets.byStrategy)) {
            const t = timing(bins, data.courseDistance);
            s.meanDistanceByStrategy![style] = t.mean; s.medianDistanceByStrategy![style] = t.median;
        }
    }
    return { stats, players };
}
export function adaptDetail(detail: Detail, overview: Overview, skillId: number, name: (id: number) => string = String): GroupSkillDetailPayload {
    if (detail.snapshotId !== overview.snapshotId || detail.skillId !== skillId || detail.bucketCount !== 100 || detail.courseDistance !== overview.courseDistance) throw new Error('Skill detail does not match this snapshot.');
    const series = (): SkillActivationBuckets => ({ all: Array(100).fill(0), win: Array(100).fill(0), byStrategy: {}, winByStrategy: {} });
    const buckets = series(), first = series();
    for (const [native, rows] of Object.entries(detail.styles)) {
        const style = styles.find(s => s.native === native);
        if (!style) throw new Error(`Unsupported running style: ${native}`);
        buckets.byStrategy[style.id] = Array(100).fill(0);
        first.byStrategy[style.id] = Array(100).fill(0); first.winByStrategy![style.id] = Array(100).fill(0);
        for (const [bucket, procs, entries, wins] of rows) {
            if (!Number.isInteger(bucket) || bucket < -1 || bucket >= 100 || [procs, entries, wins].some(n => !Number.isSafeInteger(n) || n < 0) || wins > entries || entries > procs) throw new Error('Invalid skill bucket counts.');
            const i = Math.max(0, bucket);
            buckets.all[i] += procs; buckets.byStrategy[style.id][i] += procs;
            first.all[i] += entries; first.win[i] += wins;
            first.byStrategy[style.id][i] += entries; first.winByStrategy![style.id][i] += wins;
        }
    }
    const cohort = (mode: 'active' | 'inactive' | 'notLearned'): SerializedSkillWinBreakdownRow => {
        const active = mode === 'active';
        const cells: SerializedSkillWinBreakdownRow['cellsByStrategy'] = {};
        let apps = 0, wins = 0;
        for (const style of styles) {
            const row = overview.rows.find(r => r[0] === skillId && r[1] === style.native);
            const population = overview.populationByStyle?.[style.native];
            if (!row && !population) continue;
            const cell = active ? { apps: row?.[4] ?? 0, wins: row?.[7] ?? 0 }
                : mode === 'notLearned' ? { apps: population![0] - (row?.[3] ?? 0), wins: population![1] - (row?.[7] ?? 0) - (row?.[8] ?? 0) }
                : { apps: (row?.[3] ?? 0) - (row?.[4] ?? 0), wins: row?.[8] ?? 0 };
            if (cell.apps < 0 || cell.wins < 0 || cell.wins > cell.apps) throw new Error('Invalid activation cohort counts.');
            cells[style.id] = cell; apps += cell.apps; wins += cell.wins;
        }
        return { label: mode === 'notLearned' ? 'Not learned (neither variant)' : overview.variants ? (active ? 'Either activated (learned)' : 'Learned, not activated') : (active ? 'Activated' : 'Not activated (learned)'), apps, isTotal: active, variantId: null, observationUnit: 'entries', cohort: mode === 'notLearned' ? 'notLearned' : active ? 'activatedAny' : 'activatedNeither', cellsByStrategy: cells, total: { apps, wins } };
    };
    const variantRows: SerializedSkillWinBreakdownRow[] = [];
    if (overview.variants) {
        if (!detail.variants || overview.variants[skillId]?.some(id => !detail.variants![id])) throw new Error('Missing skill variant breakdown.');
        buckets.byVariant = {}; first.byVariant = {};
        for (const [id, variant] of Object.entries(detail.variants)) {
            const variantOverview: Overview = { ...overview, rows: variant.rows, variants: undefined, populationByStyle: undefined };
            const adapted = adaptDetail({ ...detail, skillId: Number(id), styles: variant.styles, variants: undefined }, variantOverview, Number(id), name);
            buckets.byVariant[id] = adapted.buckets;
            first.byVariant[id] = adapted.rangeBuckets!;
            const row = adapted.winBreakdown![0];
            variantRows.push({ ...row, label: `${name(Number(id))}${Number(id) >= 900000 && Number(id) < 1000000 ? ' (Inherit)' : ''} · activated`, variantId: Number(id), isTotal: false, cohort: 'variant' });
        }
    }
    // Repeated events are not distinct-runner outcome denominators.
    return { skillDetailVersion: overview.variants ? 3 : undefined, buckets, rangeBuckets: first, rangeObservationLabel: 'first activation', winBreakdown: [...variantRows, cohort('active'), cohort('inactive'), ...(overview.populationByStyle ? [cohort('notLearned')] : [])] };
}
