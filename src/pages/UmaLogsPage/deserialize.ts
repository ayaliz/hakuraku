import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import type {
    SerializedHorseEntry,
    SerializedStats,
    UmaLogsStats,
} from "./umaLogsTypes";
import type { SerializedSkillOverviewStats } from "./skillCache";

export type { UmaLogsStats };

export function deserializeHorseEntries(horses: SerializedHorseEntry[] | undefined): HorseEntry[] {
    return (horses ?? []).map((h) => ({
        ...h,
        charaName: UMDatabaseWrapper.charas[h.charaId]?.name ?? `Unknown (${h.charaId})`,
        trainerName: '',
        raceDistance: 0,
        isPlayer: false,
        activatedSkillIds: new Set(h.activatedSkillIds),
        forcedActivatedSkillIds: new Set(h.forcedActivatedSkillIds ?? []),
        learnedSkillIds: new Set(h.learnedSkillIds),
        careerWinCount: h.careerWinCount ?? 0,
        supportCardIds: h.supportCardIds ?? [],
        supportCardLimitBreaks: h.supportCardLimitBreaks ?? [],
    }));
}

export function deserializeHorseEntry(horse: SerializedHorseEntry | undefined): HorseEntry | null {
    if (!horse) return null;
    return deserializeHorseEntries([horse])[0] ?? null;
}

export function deserializeSkillOverviewStats(entries: [number, SerializedSkillOverviewStats][]): Map<number, SkillStats> {
    return new Map(
        entries.map(([id, skill]) => [
            id,
            {
                ...skill,
                activationDistances: [],
                learnedByCharaIds: new Set(skill.learnedByCharaIds),
                learnedByStrategies: new Set(skill.learnedByStrategies),
                learnedByHorsesByStrategy: skill.learnedByHorsesByStrategy,
                uniqueHorsesByStrategy: skill.uniqueHorsesByStrategy,
                timesActivatedByStrategy: skill.timesActivatedByStrategy,
                meanDistanceByStrategy: skill.meanDistanceByStrategy,
                medianDistanceByStrategy: skill.medianDistanceByStrategy,
            },
        ]),
    );
}

export function deserializeStats(s: SerializedStats): UmaLogsStats {
    const legacyGateWinRatesByFlavor = s.gateWinRatesByFlavor ?? {
        total: s.gateWinRates ?? [],
        front: [],
        pace: [],
        late: [],
        end: [],
    };
    const gateStats = {
        winRatesByFlavor: s.gateStats?.winRatesByFlavor ?? legacyGateWinRatesByFlavor,
        blockedRatesByFlavor: s.gateStats?.blockedRatesByFlavor ?? {
            total: s.gateStats?.blockedRates ?? s.blockedRates ?? [],
            front: [],
            pace: [],
            late: [],
            end: [],
        },
        dodgingDangerRates: s.gateStats?.dodgingDangerRates ?? [],
    };

    return {
        totalRaces: s.totalRaces,
        totalHorses: s.totalHorses,
        avgRaceDistance: s.avgRaceDistance,
        characterStats: s.characterStats,
        strategyStats: s.strategyStats,
        rawStrategyTotals: s.rawStrategyTotals ?? {},
        roomCompositions: s.roomCompositions ?? [],
        skillStats: new Map(
            s.skillStats.map(([id, skill]) => [
                id,
                {
                    ...skill,
                    activationDistances: skill.activationDistances ?? [],
                    learnedByCharaIds: new Set(skill.learnedByCharaIds),
                    learnedByStrategies: new Set(skill.learnedByStrategies),
                },
            ])
        ),
        skillActivations: new Map(),
        skillActivationBuckets: new Map(s.skillBuckets),
        gateStats,
        trueskillRanking: s.trueskillRanking ?? [],
        empiricalBayesRanking: s.empiricalBayesRanking ?? [],
    };
}
