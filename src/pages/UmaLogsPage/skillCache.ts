import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import type { HorseEntry, SkillActivationBuckets } from "../MultiRacePage/types";

export type SerializedSkillOverviewStats = {
    skillId: number;
    skillName: string;
    skillNames: string[];
    timesActivated: number;
    normalizedActivations: number;
    uniqueRaces: number;
    uniqueHorses: number;
    learnedByHorses: number;
    winRate: number;
    avgFinishPosition: number;
    learnedByCharaIds: number[];
    learnedByStrategies: number[];
    learnedByHorsesByStrategy?: Record<string, number>;
    meanDistance: number;
    medianDistance: number;
    timesActivatedByStrategy?: Record<string, number>;
    meanDistanceByStrategy?: Record<string, number>;
    medianDistanceByStrategy?: Record<string, number>;
};

export type SerializedSkillWinBreakdownCell = {
    apps: number;
    wins: number;
};

export type SerializedSkillWinBreakdownRow = {
    label: string;
    apps: number;
    isTotal: boolean;
    variantId: number | null;
    cellsByStrategy: Record<string, SerializedSkillWinBreakdownCell | null>;
    total: SerializedSkillWinBreakdownCell | null;
};

export type GroupSkillDetailPayload = {
    buckets: SkillActivationBuckets;
    winBreakdown: SerializedSkillWinBreakdownRow[] | null;
};

export type GroupSkillCachePayload = {
    cmId: string;
    courseId: number;
    skillStats: [number, SerializedSkillOverviewStats][];
};

type SkillBreakdownSourceHorse = Pick<HorseEntry, "finishOrder" | "strategy"> & {
    activatedSkillIds: number[] | Set<number>;
};

type SerializedStatsWithSkillData = {
    skillStats?: [number, any][];
    skillBuckets?: [number, SkillActivationBuckets][];
};

type SerializedGroupWithSkillData = {
    courseId: number;
    stats: SerializedStatsWithSkillData;
};

type UmaLogsDataWithGroups = {
    groups: SerializedGroupWithSkillData[];
};

const STRATS = [5, 1, 2, 3, 4] as const;

function getSkillGroupBaseIds(representativeSkillId: number): Set<number> {
    const baseId = Math.floor(representativeSkillId / 10);
    const ids = new Set<number>([baseId]);
    if (baseId >= 10000 && baseId < 20000) ids.add(baseId + 80000);
    if (baseId >= 90000 && baseId < 100000) ids.add(baseId - 80000);
    return ids;
}

function getSkillVariantLabel(skillId: number): string {
    const baseName = UMDatabaseWrapper.skillNameWithEnglishFallback(skillId);
    if (skillId >= 900000 && skillId < 1000000) {
        return `${baseName} (Inherit)`;
    }
    return baseName;
}

export function buildSkillWinBreakdownRows(
    representativeSkillId: number,
    sourceHorses: SkillBreakdownSourceHorse[],
): SerializedSkillWinBreakdownRow[] | null {
    type Cell = SerializedSkillWinBreakdownCell;

    const relevantBaseIds = getSkillGroupBaseIds(representativeSkillId);
    const variantSet = new Set<number>();
    const byVariantStrat = new Map<string, Cell>();
    const byVariantAll = new Map<number, Cell>();
    const byStratAll = new Map<number, Cell>();
    let totalApps = 0;
    let totalWins = 0;

    const bump = (map: Map<string | number, Cell>, key: string | number, won: boolean) => {
        if (!map.has(key)) {
            map.set(key, { apps: 0, wins: 0 });
        }
        const cell = map.get(key)!;
        cell.apps += 1;
        if (won) {
            cell.wins += 1;
        }
    };

    for (const horse of sourceHorses) {
        const won = horse.finishOrder === 1;
        let activatedAny = false;
        for (const activatedSkillId of horse.activatedSkillIds) {
            const baseId = Math.floor(activatedSkillId / 10);
            if (!relevantBaseIds.has(baseId)) continue;

            variantSet.add(activatedSkillId);
            bump(byVariantStrat, `${activatedSkillId}:${horse.strategy}`, won);
            bump(byVariantAll, activatedSkillId, won);
            activatedAny = true;
        }
        if (activatedAny) {
            bump(byStratAll, horse.strategy, won);
            totalApps += 1;
            if (won) {
                totalWins += 1;
            }
        }
    }

    if (variantSet.size === 0) return null;

    const rows: SerializedSkillWinBreakdownRow[] = [];
    const variantIds = Array.from(variantSet).sort((a, b) => a - b);
    const showVariants = variantIds.length > 1;

    if (showVariants) {
        for (const variantId of variantIds) {
            rows.push({
                label: getSkillVariantLabel(variantId),
                apps: byVariantAll.get(variantId)?.apps ?? 0,
                isTotal: false,
                variantId,
                cellsByStrategy: Object.fromEntries(
                    STRATS.map((strategy) => [
                        String(strategy),
                        byVariantStrat.get(`${variantId}:${strategy}`) ?? null,
                    ]),
                ),
                total: byVariantAll.get(variantId) ?? null,
            });
        }
    }

    rows.push({
        label: "All",
        apps: totalApps,
        isTotal: true,
        variantId: null,
        cellsByStrategy: Object.fromEntries(
            STRATS.map((strategy) => [
                String(strategy),
                byStratAll.get(strategy) ?? null,
            ]),
        ),
        total: totalApps > 0 ? { apps: totalApps, wins: totalWins } : null,
    });

    return rows;
}

export function extractGroupSkillCachePayload(cmId: string, group: SerializedGroupWithSkillData): GroupSkillCachePayload {
    const bucketMap = new Map<number, SkillActivationBuckets>(group.stats.skillBuckets ?? []);
    return {
        cmId,
        courseId: group.courseId,
        skillStats: (group.stats.skillStats ?? []).map(([skillId, skill]) => {
            const buckets = bucketMap.get(skillId);
            const timesActivatedByStrategy = buckets
                ? Object.fromEntries(
                    Object.entries(buckets.byStrategy ?? {}).map(([strategyId, values]) => [
                        strategyId,
                        values.reduce((sum, count) => sum + count, 0),
                    ]),
                )
                : undefined;
            return [
                skillId,
                {
                    skillId: skill.skillId,
                    skillName: skill.skillName,
                    skillNames: skill.skillNames ?? [],
                    timesActivated: skill.timesActivated,
                    normalizedActivations: skill.normalizedActivations,
                    uniqueRaces: skill.uniqueRaces,
                    uniqueHorses: skill.uniqueHorses,
                    learnedByHorses: skill.learnedByHorses,
                    winRate: skill.winRate,
                    avgFinishPosition: skill.avgFinishPosition,
                    learnedByCharaIds: skill.learnedByCharaIds ?? [],
                    learnedByStrategies: skill.learnedByStrategies ?? [],
                    learnedByHorsesByStrategy: skill.learnedByHorsesByStrategy,
                    meanDistance: skill.meanDistance,
                    medianDistance: skill.medianDistance,
                    timesActivatedByStrategy,
                    meanDistanceByStrategy: skill.meanDistanceByStrategy,
                    medianDistanceByStrategy: skill.medianDistanceByStrategy,
                } satisfies SerializedSkillOverviewStats,
            ] as [number, SerializedSkillOverviewStats];
        }),
    };
}

export function extractGroupSkillDetailEntries(
    group: SerializedGroupWithSkillData,
    sourceHorses: SkillBreakdownSourceHorse[],
): [number, GroupSkillDetailPayload][] {
    const bucketMap = new Map<number, SkillActivationBuckets>(group.stats.skillBuckets ?? []);
    return (group.stats.skillStats ?? [])
        .map(([skillId, skill]) => {
            const buckets = bucketMap.get(skillId);
            if (!buckets) return null;
            return [
                skillId,
                {
                    buckets,
                    winBreakdown: buildSkillWinBreakdownRows(skill.skillId, sourceHorses),
                } satisfies GroupSkillDetailPayload,
            ] as [number, GroupSkillDetailPayload];
        })
        .filter((entry): entry is [number, GroupSkillDetailPayload] => entry !== null);
}

export function pruneUmaLogsSummarySkillData<T extends UmaLogsDataWithGroups>(dataset: T): T {
    return {
        ...dataset,
        groups: dataset.groups.map((group) => ({
            ...group,
            stats: {
                ...group.stats,
                skillStats: [],
                skillBuckets: [],
            },
        })),
    };
}
