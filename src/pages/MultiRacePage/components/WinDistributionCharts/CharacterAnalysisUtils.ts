import type { HorseEntry } from "../../types";
import { PieSlice } from "./types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";

export type AverageScoreSummary = { average: number; count: number };

export function buildAverageScoreSummary(horses: HorseEntry[]): AverageScoreSummary | null {
    let total = 0;
    let count = 0;
    for (const horse of horses) {
        if (horse.rankScore <= 0) continue;
        total += horse.rankScore;
        count += 1;
    }
    return count > 0 ? { average: total / count, count } : null;
}

export function buildCharacterPopulationSlices(horses: HorseEntry[]): PieSlice[] {
    const getKey = (horse: HorseEntry) => `${horse.charaId}_${horse.cardId}_${horse.strategy}`;
    const popMap = new Map<string, { count: number; charaId: number; strategy: number; cardId: number; fullLabel: string }>();

    for (const horse of horses) {
        const key = getKey(horse);
        if (!popMap.has(key)) {
            popMap.set(key, {
                count: 0,
                charaId: horse.charaId,
                strategy: horse.strategy,
                cardId: horse.cardId,
                fullLabel: horse.charaName,
            });
        }
        popMap.get(key)!.count++;
    }

    const total = horses.length;
    if (total <= 0) return [];

    return Array.from(popMap.entries())
        .map(([id, data]) => {
            const cardName = data.cardId ? UMDatabaseWrapper.cards[data.cardId]?.name : null;
            const label = (cardName && cardName !== "") ? cardName : data.fullLabel;
            return {
                value: data.count,
                percentage: (data.count / total) * 100,
                label,
                fullLabel: data.fullLabel,
                color: "#718096",
                charaId: id,
                strategyId: data.strategy,
                cardId: data.cardId,
            };
        })
        .sort((a, b) => b.value - a.value);
}

export function getBestPlacingOpponents(allHorses: HorseEntry[]): HorseEntry[] {
    const races = new Map<string, HorseEntry[]>();
    for (const horse of allHorses) {
        if (!races.has(horse.raceId)) races.set(horse.raceId, []);
        races.get(horse.raceId)!.push(horse);
    }

    const bestOpponents: HorseEntry[] = [];
    races.forEach((horses) => {
        let bestHorse: HorseEntry | null = null;
        let bestOrder = Number.MAX_SAFE_INTEGER;
        for (const horse of horses) {
            if (horse.isPlayer) continue;
            if (horse.finishOrder < bestOrder) {
                bestOrder = horse.finishOrder;
                bestHorse = horse;
            }
        }
        if (bestHorse) bestOpponents.push(bestHorse);
    });

    return bestOpponents;
}
