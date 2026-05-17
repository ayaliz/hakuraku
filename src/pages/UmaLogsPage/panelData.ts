import type { HorseEntry, TeamCompositionStats } from "../MultiRacePage/types";
import { BAYES_TEAM, BAYES_UMA, CHARACTER_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { getHorseDeckRaceBonus } from "./deckUtils";

export type OverviewSkillRow = {
    skillId: number;
    name: string;
    isInherit: boolean;
    appearances: number;
    winAppearances: number;
    popPct: number;
    adjWinRate: number;
};

export type SupportCardSummaryRow = {
    cardId: number;
    appearances: number;
    popPct: number;
    lbDist: number[];
    rawWins: number;
    rawApps: number;
    adjWinRate: number;
};

export type StyleDeckSummaryRow = {
    deckKey: string;
    cardIds: number[];
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
    raceBonus: number;
};

export type RaceBonusOverviewRow = {
    bucketStart: number;
    bucketEnd: number;
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
    isOther: boolean;
};

export type CharacterSlice = {
    value: number;
    percentage: number;
    label: string;
    fullLabel: string;
    color: string;
    charaId: string;
    strategyId: number;
    cardId: number;
    secondaryValue?: number;
    secondaryPercentage?: number;
};

export type PanelStyleRepEntry = {
    cardId: number;
    charaId: number;
    charaName: string;
    wins: number;
    appearances: number;
    popPct: number;
    winRate: number;
    bayesianWinRate: number;
    expectedWinRate: number;
    scoreAdjustedWinRate: number;
    scoreAdjustedLift: number;
    teamWins: number;
    teamAppearances: number;
    teamWinRate: number;
    teamBayesianWinRate: number;
};

export type StyleCompositionSummaryRow = {
    key: string;
    strategies: number[];
    label: string;
    appearances: number;
    wins: number;
    winRate: number;
    bayesianWinRate: number;
};

export type CharacterTeamRateRow = {
    key: string;
    charaId: number;
    cardId: number;
    strategy: number;
    wins: number;
    appearances: number;
};

export type HistogramBin = {
    start: number;
    count: number;
};

export type HistogramData = {
    bins: HistogramBin[];
    step: number;
    mean: number;
    median: number;
};

export type GroupPanelData = {
    cmId: string;
    courseId: number;
    uniqueUmaCount: number;
    winningTimeHistogram: HistogramData | null;
    scoreHistogramAll: HistogramData | null;
    scoreHistogramWinners: HistogramData | null;
    topHorses: {
        fastestWin?: HorseEntry;
        slowestWin?: HorseEntry;
        highestWinner?: HorseEntry;
        lowestWinner?: HorseEntry;
    };
    skillsByStrategy: Record<number, OverviewSkillRow[]>;
    supportCardRows: SupportCardSummaryRow[];
    raceBonusRows: RaceBonusOverviewRow[];
    styleReps: Record<number, PanelStyleRepEntry[]>;
    styleCompositionRows: StyleCompositionSummaryRow[];
    characterTeamRates: CharacterTeamRateRow[];
    rawUnifiedCharacterWinsAll: CharacterSlice[];
    rawUnifiedCharacterWinsOpp: CharacterSlice[];
    rawUnifiedCharacterPop: CharacterSlice[];
};

export type GroupDeckData = {
    cmId: string;
    courseId: number;
    styleDeckRowsByStyle: Record<number, StyleDeckSummaryRow[]>;
};

export type GroupTeamData = {
    cmId: string;
    courseId: number;
    teamStats: TeamCompositionStats[];
};

const RACE_BONUS_OTHER_MIN_POP_PCT = 0.5;

function niceHistogramStep(range: number): number {
    const raw = range / 20;
    for (const step of [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
        if (raw <= step) return step;
    }
    return 2000;
}

export function buildHistogramData(values: number[]): HistogramData | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const step = niceHistogramStep(Math.max(max - min, 0.5));
    const binStart = Math.floor(min / step) * step;
    const numBins = Math.ceil((max - binStart) / step) + 1;

    const counts = new Array<number>(numBins).fill(0);
    for (const value of sorted) {
        const index = Math.min(Math.floor((value - binStart) / step), numBins - 1);
        counts[index] += 1;
    }

    const sum = sorted.reduce((acc, value) => acc + value, 0);
    const mean = sum / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    return {
        bins: counts.map((count, index) => ({
            start: binStart + index * step,
            count,
        })),
        step,
        mean,
        median,
    };
}

export function computeUniqueUmaCount(horses: HorseEntry[]): number {
    const seen = new Set<string>();
    for (const horse of horses) {
        const skillKey = Array.from(horse.learnedSkillIds).sort((a, b) => a - b).join(",");
        seen.add(`${horse.cardId}_${horse.speed}_${horse.stamina}_${horse.pow}_${horse.guts}_${horse.wiz}_${skillKey}`);
    }
    return seen.size;
}

export function computeOverviewSkillRows(horses: HorseEntry[]): Record<number, OverviewSkillRow[]> {
    const result: Record<number, OverviewSkillRow[]> = {};
    for (const strategyId of [1, 2, 3, 4, 5]) {
        const strategyHorses = horses.filter((horse) => horse.strategy === strategyId);
        const total = strategyHorses.length;
        if (total === 0) continue;
        const totalWins = strategyHorses.filter((horse) => horse.finishOrder === 1).length;
        const priorMean = totalWins / total;
        const counts = new Map<number, { apps: number; winApps: number }>();
        for (const horse of strategyHorses) {
            for (const skillId of horse.learnedSkillIds) {
                const count = counts.get(skillId) ?? { apps: 0, winApps: 0 };
                count.apps += 1;
                if (horse.finishOrder === 1) count.winApps += 1;
                counts.set(skillId, count);
            }
        }
        result[strategyId] = Array.from(counts.entries()).map(([skillId, count]) => ({
            skillId,
            name: UMDatabaseWrapper.skillName(skillId),
            isInherit: skillId >= 900000 && skillId < 1000000,
            appearances: count.apps,
            winAppearances: count.winApps,
            popPct: (count.apps / total) * 100,
            adjWinRate: (count.winApps + BAYES_UMA.K * priorMean) / (count.apps + BAYES_UMA.K),
        }));
    }
    return result;
}

export function computeSupportCardRows(horses: HorseEntry[]): SupportCardSummaryRow[] {
    if (horses.length === 0) return [];
    const rawTotal = horses.filter((horse) => horse.supportCardIds.length > 0).length;
    const rawTotalWins = horses.filter((horse) => horse.supportCardIds.length > 0 && horse.finishOrder === 1).length;
    const priorMean = rawTotal > 0 ? rawTotalWins / rawTotal : BAYES_UMA.PRIOR;
    const rawMap = new Map<number, { wins: number; apps: number }>();
    for (const horse of horses) {
        for (const cardId of horse.supportCardIds) {
            const entry = rawMap.get(cardId) ?? { wins: 0, apps: 0 };
            entry.apps += 1;
            if (horse.finishOrder === 1) entry.wins += 1;
            rawMap.set(cardId, entry);
        }
    }

    const seen = new Set<string>();
    const dedupMap = new Map<number, { apps: number; lbDist: number[] }>();
    for (const horse of horses) {
        if (horse.supportCardIds.length === 0) continue;
        const fingerprint = `${horse.cardId}_${horse.speed}_${horse.stamina}_${horse.pow}_${horse.guts}_${horse.wiz}_${horse.rankScore}_${Array.from(horse.learnedSkillIds).sort((a, b) => a - b).join(",")}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        for (let index = 0; index < horse.supportCardIds.length; index++) {
            const cardId = horse.supportCardIds[index];
            const lb = horse.supportCardLimitBreaks[index] ?? 0;
            const entry = dedupMap.get(cardId) ?? { apps: 0, lbDist: [0, 0, 0, 0, 0] };
            entry.apps += 1;
            entry.lbDist[Math.min(lb, 4)] += 1;
            dedupMap.set(cardId, entry);
        }
    }
    const dedupeTotal = seen.size;

    return Array.from(rawMap.entries()).map(([cardId, raw]) => {
        const dedup = dedupMap.get(cardId) ?? { apps: 0, lbDist: [0, 0, 0, 0, 0] };
        return {
            cardId,
            appearances: dedup.apps,
            popPct: dedupeTotal > 0 ? (dedup.apps / dedupeTotal) * 100 : 0,
            lbDist: dedup.lbDist,
            rawWins: raw.wins,
            rawApps: raw.apps,
            adjWinRate: (raw.wins + BAYES_UMA.K * priorMean) / (raw.apps + BAYES_UMA.K),
        };
    });
}

export function computeRaceBonusRows(horses: HorseEntry[]): RaceBonusOverviewRow[] {
    const deckHorses = horses.filter((horse) => horse.supportCardIds.length === 6);
    const map = new Map<number, { appearances: number; wins: number }>();
    for (const horse of deckHorses) {
        const raceBonus = getHorseDeckRaceBonus(horse);
        if (raceBonus === null) continue;
        const bucketStart = Math.floor(raceBonus / 5) * 5;
        const entry = map.get(bucketStart) ?? { appearances: 0, wins: 0 };
        entry.appearances += 1;
        if (horse.finishOrder === 1) entry.wins += 1;
        map.set(bucketStart, entry);
    }
    const total = deckHorses.length;
    const priorMean = total > 0 ? deckHorses.filter((horse) => horse.finishOrder === 1).length / total : BAYES_UMA.PRIOR;
    const threshold = (appearances: number) => total > 0 && (appearances / total) * 100 >= RACE_BONUS_OTHER_MIN_POP_PCT;
    const entries = Array.from(map.entries());
    const rows = entries
        .filter(([, value]) => threshold(value.appearances))
        .map(([bucketStart, value]) => ({
            bucketStart,
            bucketEnd: bucketStart + 4,
            appearances: value.appearances,
            wins: value.wins,
            popPct: (value.appearances / total) * 100,
            adjWinRate: (value.wins + BAYES_UMA.K * priorMean) / (value.appearances + BAYES_UMA.K),
            isOther: false,
        }))
        .sort((a, b) => a.bucketStart - b.bucketStart);
    const otherEntries = entries.filter(([, value]) => !threshold(value.appearances));
    const otherAppearances = otherEntries.reduce((sum, [, value]) => sum + value.appearances, 0);
    const otherWins = otherEntries.reduce((sum, [, value]) => sum + value.wins, 0);
    if (otherAppearances > 0) {
        rows.push({
            bucketStart: -1,
            bucketEnd: -1,
            appearances: otherAppearances,
            wins: otherWins,
            popPct: (otherAppearances / total) * 100,
            adjWinRate: 0,
            isOther: true,
        });
    }
    return rows;
}

export function computeStyleDeckRowsByStyle(horses: HorseEntry[]): Record<number, StyleDeckSummaryRow[]> {
    const result: Record<number, StyleDeckSummaryRow[]> = {};
    const styleIds = new Set(horses.filter((horse) => horse.supportCardIds.length === 6).map((horse) => horse.strategy));
    for (const styleId of styleIds) {
        const styleHorses = horses.filter((horse) => horse.strategy === styleId && horse.supportCardIds.length === 6);
        const total = styleHorses.length;
        if (total === 0) {
            result[styleId] = [];
            continue;
        }
        const priorMean = styleHorses.filter((horse) => horse.finishOrder === 1).length / total;
        const deckMap = new Map<string, { cardIds: number[]; apps: number; wins: number; raceBonus: number }>();
        for (const horse of styleHorses) {
            const raceBonus = getHorseDeckRaceBonus(horse);
            if (raceBonus === null) continue;
            const cardIds = [...horse.supportCardIds].sort((a, b) => a - b);
            const key = `${cardIds.join("_")}|rb${raceBonus}`;
            const entry = deckMap.get(key) ?? { cardIds, apps: 0, wins: 0, raceBonus };
            entry.apps += 1;
            if (horse.finishOrder === 1) entry.wins += 1;
            deckMap.set(key, entry);
        }
        result[styleId] = Array.from(deckMap.values()).map((entry) => ({
            deckKey: `${entry.cardIds.join("_")}|rb${entry.raceBonus}`,
            cardIds: entry.cardIds,
            appearances: entry.apps,
            wins: entry.wins,
            popPct: (entry.apps / total) * 100,
            adjWinRate: (entry.wins + BAYES_UMA.K * priorMean) / (entry.apps + BAYES_UMA.K),
            raceBonus: entry.raceBonus,
        }));
    }
    return result;
}

function computeTeamStatsFromHorses(horses: HorseEntry[]): TeamCompositionStats[] {
    const races = new Map<string, HorseEntry[]>();
    for (const horse of horses) {
        if (!races.has(horse.raceId)) races.set(horse.raceId, []);
        races.get(horse.raceId)!.push(horse);
    }

    const compMap = new Map<string, Omit<TeamCompositionStats, "winRate" | "impact" | "bayesianWinRate">>();
    for (const raceHorses of races.values()) {
        const teamsById = new Map<number, HorseEntry[]>();
        for (const horse of raceHorses) {
            if (!teamsById.has(horse.teamId)) teamsById.set(horse.teamId, []);
            teamsById.get(horse.teamId)!.push(horse);
        }

        const teams = Array.from(teamsById.values()).filter((team) => team.length > 0);
        const expected = teams.length > 0 ? 1 / teams.length : 0;
        for (const team of teams) {
            const sorted = [...team].sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));
            const key = sorted.map((horse) => `${horse.cardId}_${horse.strategy}`).join("__");
            const entry = compMap.get(key) ?? {
                members: sorted.map((horse) => ({
                    charaId: horse.charaId,
                    cardId: horse.cardId,
                    strategy: horse.strategy,
                    charaName: horse.charaName,
                })),
                memberWins: new Array(sorted.length).fill(0),
                appearances: 0,
                wins: 0,
                expectedWins: 0,
            };
            entry.appearances += 1;
            entry.expectedWins += expected;
            if (team.some((horse) => horse.finishOrder === 1)) entry.wins += 1;
            for (let index = 0; index < sorted.length; index++) {
                if (sorted[index].finishOrder === 1) entry.memberWins[index] += 1;
            }
            compMap.set(key, entry);
        }
    }

    return Array.from(compMap.values()).map((entry) => ({
        ...entry,
        winRate: entry.appearances > 0 ? entry.wins / entry.appearances : 0,
        impact: entry.expectedWins > 0 ? entry.wins / entry.expectedWins : 0,
        bayesianWinRate: (entry.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (entry.appearances + BAYES_TEAM.K),
    }));
}

function computeCharacterTeamRates(teamStats: TeamCompositionStats[]): CharacterTeamRateRow[] {
    const tallies = new Map<string, CharacterTeamRateRow>();
    for (const team of teamStats) {
        for (const member of team.members) {
            const key = `${member.charaId}_${member.cardId}_${member.strategy}`;
            const tally = tallies.get(key) ?? {
                key,
                charaId: member.charaId,
                cardId: member.cardId,
                strategy: member.strategy,
                wins: 0,
                appearances: 0,
            };
            tally.appearances += team.appearances;
            tally.wins += team.wins;
            tallies.set(key, tally);
        }
    }

    return Array.from(tallies.values()).sort((a, b) => b.appearances - a.appearances || b.wins - a.wins || a.key.localeCompare(b.key));
}

export function computeStyleReps(horses: HorseEntry[]): Record<number, PanelStyleRepEntry[]> {
    const DISTANCE_PRIOR_K = 72;
    const SCORE_BUCKET_K = 24;
    const SCORE_BUCKET_SIZE = 500;
    type Tally = {
        cardId: number;
        charaId: number;
        charaName: string;
        wins: number;
        appearances: number;
        expectedWins: number;
    };
    type CountStat = { wins: number; appearances: number };
    const tallies = new Map<string, Tally>();
    const totalsByStrategy = new Map<number, number>();
    const strategyStrength = new Map<number, CountStat>();
    const distanceStrength = new Map<string, CountStat>();
    const scoreBucketStrength = new Map<string, CountStat>();
    const characterTeamRates = computeCharacterTeamRates(computeTeamStatsFromHorses(horses));
    const teamRateByRepKey = new Map(characterTeamRates.map((row) => [`${row.strategy}_${row.cardId}`, row] as const));

    const recordCount = (statsMap: Map<number | string, CountStat>, key: number | string, win: boolean) => {
        const entry = statsMap.get(key) ?? { wins: 0, appearances: 0 };
        entry.appearances += 1;
        if (win) entry.wins += 1;
        statsMap.set(key, entry);
    };

    const expectedWinRate = (horse: HorseEntry): number => {
        const strategyStats = strategyStrength.get(horse.strategy);
        const strategyPrior = strategyStats && strategyStats.appearances > 0
            ? strategyStats.wins / strategyStats.appearances
            : BAYES_UMA.PRIOR;
        if (horse.rankScore <= 0) return strategyPrior;
        const aptDistance = Number(horse.aptDistance ?? 0);
        const distanceKey = `${horse.strategy}_${aptDistance}`;
        const scoreBucket = Math.floor(horse.rankScore / SCORE_BUCKET_SIZE) * SCORE_BUCKET_SIZE;
        const scoreBucketKey = `${distanceKey}_${scoreBucket}`;
        const distanceStats = distanceStrength.get(distanceKey);
        const distancePrior = distanceStats && distanceStats.appearances > 0
            ? (distanceStats.wins + DISTANCE_PRIOR_K * strategyPrior) / (distanceStats.appearances + DISTANCE_PRIOR_K)
            : strategyPrior;
        const bucketStats = scoreBucketStrength.get(scoreBucketKey);
        return bucketStats && bucketStats.appearances > 0
            ? (bucketStats.wins + SCORE_BUCKET_K * distancePrior) / (bucketStats.appearances + SCORE_BUCKET_K)
            : distancePrior;
    };

    for (const horse of horses) {
        const win = horse.finishOrder === 1;
        totalsByStrategy.set(horse.strategy, (totalsByStrategy.get(horse.strategy) ?? 0) + 1);
        recordCount(strategyStrength, horse.strategy, win);
        if (horse.rankScore > 0) {
            const aptDistance = Number(horse.aptDistance ?? 0);
            const distanceKey = `${horse.strategy}_${aptDistance}`;
            const scoreBucket = Math.floor(horse.rankScore / SCORE_BUCKET_SIZE) * SCORE_BUCKET_SIZE;
            recordCount(distanceStrength, distanceKey, win);
            recordCount(scoreBucketStrength, `${distanceKey}_${scoreBucket}`, win);
        }
    }

    for (const horse of horses) {
        const key = `${horse.strategy}_${horse.cardId}`;
        const tally = tallies.get(key) ?? {
            cardId: horse.cardId,
            charaId: horse.charaId,
            charaName: horse.charaName,
            wins: 0,
            appearances: 0,
            expectedWins: 0,
        };
        tally.appearances += 1;
        if (horse.finishOrder === 1) tally.wins += 1;
        tally.expectedWins += expectedWinRate(horse);
        tallies.set(key, tally);
    }

    const result: Record<number, PanelStyleRepEntry[]> = {};
    for (const [key, tally] of tallies.entries()) {
        if (tally.wins === 0) continue;
        const strategy = Number(key.split("_")[0]);
        const totalAppearances = totalsByStrategy.get(strategy) ?? 0;
        const expected = tally.expectedWins / Math.max(tally.appearances, 1);
        const scoreAdjustedWinRate = (tally.wins + BAYES_UMA.K * expected) / (tally.appearances + BAYES_UMA.K);
        const teamRate = teamRateByRepKey.get(`${strategy}_${tally.cardId}`);
        const teamAppearances = teamRate?.appearances ?? 0;
        const teamWins = teamRate?.wins ?? 0;
        const entry: PanelStyleRepEntry = {
            ...tally,
            popPct: totalAppearances > 0 ? (tally.appearances / totalAppearances) * 100 : 0,
            winRate: tally.wins / tally.appearances,
            bayesianWinRate: (tally.wins + BAYES_UMA.K * BAYES_UMA.PRIOR) / (tally.appearances + BAYES_UMA.K),
            expectedWinRate: expected,
            scoreAdjustedWinRate,
            scoreAdjustedLift: scoreAdjustedWinRate - expected,
            teamWins,
            teamAppearances,
            teamWinRate: teamAppearances > 0 ? teamWins / teamAppearances : 0,
            teamBayesianWinRate: (teamWins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (teamAppearances + BAYES_TEAM.K),
        };
        if (!result[strategy]) result[strategy] = [];
        result[strategy].push(entry);
    }
    for (const strategy of Object.keys(result)) {
        result[Number(strategy)].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    }
    return result;
}

export function computeCharacterSlices(horses: HorseEntry[]): {
    rawUnifiedCharacterWinsAll: CharacterSlice[];
    rawUnifiedCharacterWinsOpp: CharacterSlice[];
    rawUnifiedCharacterPop: CharacterSlice[];
} {
    const keyForHorse = (horse: HorseEntry) => `${horse.charaId}_${horse.cardId}_${horse.strategy}`;
    const popMap = new Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>();
    const winMapAll = new Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>();
    const winMapOpp = new Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>();
    const races = new Map<string, HorseEntry[]>();

    const nonPlayerHorses = horses.filter((horse) => !horse.isPlayer);
    for (const horse of nonPlayerHorses) {
        const key = keyForHorse(horse);
        const entry = popMap.get(key) ?? {
            name: horse.charaName,
            fullLabel: horse.charaName,
            count: 0,
            charaId: horse.charaId,
            strategy: horse.strategy,
            cardId: horse.cardId,
        };
        entry.count += 1;
        popMap.set(key, entry);
    }

    for (const horse of horses.filter((horse) => horse.finishOrder === 1)) {
        const key = keyForHorse(horse);
        const entry = winMapAll.get(key) ?? {
            name: horse.charaName,
            fullLabel: horse.charaName,
            count: 0,
            charaId: horse.charaId,
            strategy: horse.strategy,
            cardId: horse.cardId,
        };
        entry.count += 1;
        winMapAll.set(key, entry);
    }

    for (const horse of horses) {
        if (!races.has(horse.raceId)) races.set(horse.raceId, []);
        races.get(horse.raceId)!.push(horse);
    }

    const effectiveWinners: HorseEntry[] = [];
    for (const raceHorses of races.values()) {
        let bestHorse: HorseEntry | null = null;
        let bestOrder = Number.MAX_SAFE_INTEGER;
        for (const horse of raceHorses) {
            if (horse.isPlayer) continue;
            if (horse.finishOrder < bestOrder) {
                bestOrder = horse.finishOrder;
                bestHorse = horse;
            }
        }
        if (bestHorse) effectiveWinners.push(bestHorse);
    }

    for (const horse of effectiveWinners) {
        const key = keyForHorse(horse);
        const entry = winMapOpp.get(key) ?? {
            name: horse.charaName,
            fullLabel: horse.charaName,
            count: 0,
            charaId: horse.charaId,
            strategy: horse.strategy,
            cardId: horse.cardId,
        };
        entry.count += 1;
        winMapOpp.set(key, entry);
    }

    const topWinsAll = Array.from(winMapAll.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map((entry) => entry[0]);
    const topWinsOpp = Array.from(winMapOpp.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map((entry) => entry[0]);
    const topPop = Array.from(popMap.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map((entry) => entry[0]);
    const prioritizedKeys = Array.from(new Set([...topWinsAll, ...topWinsOpp, ...topPop]));
    const colorMap = new Map<string, string>();
    let colorIndex = 0;
    for (const key of prioritizedKeys) {
        colorMap.set(key, CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length]);
        colorIndex += 1;
    }
    for (const key of new Set([...winMapAll.keys(), ...winMapOpp.keys(), ...popMap.keys()])) {
        if (!colorMap.has(key)) {
            colorMap.set(key, CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length]);
            colorIndex += 1;
        }
    }

    const actualWinMapOpp = new Map<string, number>();
    for (const horse of horses.filter((horse) => !horse.isPlayer && horse.finishOrder === 1)) {
        const key = keyForHorse(horse);
        actualWinMapOpp.set(key, (actualWinMapOpp.get(key) ?? 0) + 1);
    }

    const toSlices = (
        sourceMap: Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>,
        total: number,
        secondaryMap?: Map<string, number>,
    ): CharacterSlice[] => {
        if (total <= 0) return [];
        return Array.from(sourceMap.entries())
            .map(([key, value]) => {
                const cardName = value.cardId ? UMDatabaseWrapper.cards[value.cardId]?.name : null;
                const label = cardName && cardName !== "" ? cardName : value.name;
                const secondaryValue = secondaryMap?.get(key);
                return {
                    value: value.count,
                    percentage: (value.count / total) * 100,
                    label,
                    fullLabel: value.fullLabel,
                    color: colorMap.get(key) ?? "#718096",
                    charaId: key,
                    strategyId: value.strategy,
                    cardId: value.cardId,
                    secondaryValue,
                    secondaryPercentage: secondaryValue !== undefined ? (secondaryValue / total) * 100 : undefined,
                };
            })
            .sort((a, b) => b.value - a.value);
    };

    return {
        rawUnifiedCharacterWinsAll: toSlices(winMapAll, horses.filter((horse) => horse.finishOrder === 1).length),
        rawUnifiedCharacterWinsOpp: toSlices(winMapOpp, effectiveWinners.length, actualWinMapOpp),
        rawUnifiedCharacterPop: toSlices(popMap, nonPlayerHorses.length),
    };
}

export function buildGroupPanelData(cmId: string, courseId: number, horses: HorseEntry[]): GroupPanelData {
    const winners = horses.filter((horse) => horse.finishOrder === 1 && horse.finishTime > 0);
    const scoredWinners = winners.filter((horse) => horse.rankScore > 0);
    const teamStats = computeTeamStatsFromHorses(horses);
    const fastestWin = winners.reduce<HorseEntry | null>((best, horse) => !best || horse.finishTime < best.finishTime ? horse : best, null);
    const slowestWin = winners.reduce<HorseEntry | null>((best, horse) => !best || horse.finishTime > best.finishTime ? horse : best, null);
    const highestWinner = scoredWinners.reduce<HorseEntry | null>((best, horse) => !best || horse.rankScore > best.rankScore ? horse : best, null);
    const lowestWinner = scoredWinners.reduce<HorseEntry | null>((best, horse) => !best || horse.rankScore < best.rankScore ? horse : best, null);

    return {
        cmId,
        courseId,
        uniqueUmaCount: computeUniqueUmaCount(horses),
        winningTimeHistogram: buildHistogramData(winners.map((horse) => horse.finishTime)),
        scoreHistogramAll: buildHistogramData(horses.filter((horse) => horse.rankScore > 0).map((horse) => horse.rankScore)),
        scoreHistogramWinners: buildHistogramData(horses.filter((horse) => horse.rankScore > 0 && horse.finishOrder === 1).map((horse) => horse.rankScore)),
        topHorses: {
            fastestWin: fastestWin ?? undefined,
            slowestWin: slowestWin ?? undefined,
            highestWinner: highestWinner ?? undefined,
            lowestWinner: lowestWinner ?? undefined,
        },
        skillsByStrategy: computeOverviewSkillRows(horses),
        supportCardRows: computeSupportCardRows(horses),
        raceBonusRows: computeRaceBonusRows(horses),
        styleReps: computeStyleReps(horses),
        styleCompositionRows: [],
        characterTeamRates: computeCharacterTeamRates(teamStats),
        ...computeCharacterSlices(horses),
    };
}

export function buildGroupDeckData(cmId: string, courseId: number, horses: HorseEntry[]): GroupDeckData {
    return {
        cmId,
        courseId,
        styleDeckRowsByStyle: computeStyleDeckRowsByStyle(horses),
    };
}
