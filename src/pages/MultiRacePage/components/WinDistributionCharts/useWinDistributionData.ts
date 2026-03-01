import { useMemo } from "react";
import { HorseEntry } from "../../types";
import { CHARACTER_COLORS } from "./constants";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";

export const useWinDistributionData = (allHorses: HorseEntry[]) => {
    const {
        rawUnifiedCharacterWinsAll,
        rawUnifiedCharacterWinsOpp,
        rawUnifiedCharacterPop,
    } = useMemo(() => {
        const getKey = (charaId: number, strategy: number, cardId: number) => `${charaId}_${cardId}_${strategy}`;

        const nonPlayerHorses = allHorses.filter(h => !h.isPlayer);
        const popTotal = nonPlayerHorses.length;

        const popMap = new Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>();
        nonPlayerHorses.forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            if (!popMap.has(key)) popMap.set(key, {
                name: h.charaName,
                fullLabel: h.charaName,
                count: 0, charaId: h.charaId, strategy: h.strategy, cardId: h.cardId
            });
            popMap.get(key)!.count++;
        });

        const winMapAll = new Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>();
        const winnersAll = allHorses.filter(h => h.finishOrder === 1);
        const winTotalAll = winnersAll.length;

        winnersAll.forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            if (!winMapAll.has(key)) winMapAll.set(key, {
                name: h.charaName,
                fullLabel: h.charaName,
                count: 0, charaId: h.charaId, strategy: h.strategy, cardId: h.cardId
            });
            winMapAll.get(key)!.count++;
        });

        const races = new Map<string, HorseEntry[]>();
        allHorses.forEach(h => {
            if (!races.has(h.raceId)) races.set(h.raceId, []);
            races.get(h.raceId)!.push(h);
        });

        const effectiveWinners: HorseEntry[] = [];
        races.forEach(horses => {
            let bestHorse: HorseEntry | null = null;
            let bestOrder = 999;
            horses.forEach(h => {
                if (!h.isPlayer) {
                    if (h.finishOrder < bestOrder) {
                        bestOrder = h.finishOrder;
                        bestHorse = h;
                    }
                }
            });
            if (bestHorse) effectiveWinners.push(bestHorse);
        });

        const winMapOpp = new Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>();
        const winTotalOpp = effectiveWinners.length;
        effectiveWinners.forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            if (!winMapOpp.has(key)) winMapOpp.set(key, {
                name: h.charaName,
                fullLabel: h.charaName,
                count: 0, charaId: h.charaId, strategy: h.strategy, cardId: h.cardId
            });
            winMapOpp.get(key)!.count++;
        });

        const MAX_SLICES = 5;
        const topWinsAll = Array.from(winMapAll.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_SLICES).map(e => e[0]);
        const topWinsOpp = Array.from(winMapOpp.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_SLICES).map(e => e[0]);
        const topPop = Array.from(popMap.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_SLICES).map(e => e[0]);
        const keyIds = Array.from(new Set([...topWinsAll, ...topWinsOpp, ...topPop]));

        const colorMap = new Map<string, string>();
        let colorIndex = 0;
        keyIds.forEach((id) => {
            colorMap.set(id, CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length]);
            colorIndex++;
        });
        const allIds = new Set([...Array.from(winMapAll.keys()), ...Array.from(winMapOpp.keys()), ...Array.from(popMap.keys())]);
        allIds.forEach((id) => {
            if (!colorMap.has(id)) {
                colorMap.set(id, CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length]);
                colorIndex++;
            }
        });

        const actualWinMapOpp = new Map<string, number>();
        allHorses.filter(h => !h.isPlayer && h.finishOrder === 1).forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            actualWinMapOpp.set(key, (actualWinMapOpp.get(key) || 0) + 1);
        });

        const genFullSlices = (sourceMap: Map<string, { name: string; fullLabel: string; count: number; charaId: number; strategy: number; cardId: number }>, total: number, secondaryMap?: Map<string, number>) => {
            return Array.from(sourceMap.entries())
                .map(([id, data]) => {
                    const cardName = data.cardId ? UMDatabaseWrapper.cards[data.cardId]?.name : null;
                    const label = (cardName && cardName !== "") ? cardName : data.name;
                    return {
                        value: data.count,
                        percentage: (data.count / total) * 100,
                        label,
                        fullLabel: data.fullLabel,
                        color: colorMap.get(id) || "#718096",
                        charaId: id,
                        strategyId: data.strategy,
                        cardId: data.cardId,
                        secondaryValue: secondaryMap !== undefined ? (secondaryMap.get(id) ?? 0) : undefined,
                        secondaryPercentage: secondaryMap !== undefined ? ((secondaryMap.get(id) ?? 0) / total) * 100 : undefined,
                    };
                })
                .sort((a, b) => b.value - a.value);
        };

        const rawUnifiedCharacterWinsAll = winTotalAll > 0 ? genFullSlices(winMapAll, winTotalAll) : [];
        const rawUnifiedCharacterWinsOpp = winTotalOpp > 0 ? genFullSlices(winMapOpp, winTotalOpp, actualWinMapOpp) : [];
        const rawUnifiedCharacterPop = popTotal > 0 ? genFullSlices(popMap, popTotal) : [];

        return { rawUnifiedCharacterWinsAll, rawUnifiedCharacterWinsOpp, rawUnifiedCharacterPop };
    }, [allHorses]);

    return { rawUnifiedCharacterWinsAll, rawUnifiedCharacterWinsOpp, rawUnifiedCharacterPop };
};
