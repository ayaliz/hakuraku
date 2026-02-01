import { useMemo } from "react";
import { HorseEntry, CharacterStats, StrategyStats } from "../../types";
import { STRATEGY_NAMES, STRATEGY_NAMES_SHORT, STRATEGY_COLORS, CHARACTER_COLORS } from "./constants";
import { StrategyPieSlice, PieSlice, PerformanceMetrics } from "./types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";

export const useWinDistributionData = (
    characterStats: CharacterStats[],
    strategyStats: StrategyStats[],
    allHorses: HorseEntry[]
) => {
    // -------------------------------------------------------------------------
    // 1. Calculate OPPONENT-ONLY stats (Effective Winners)
    // -------------------------------------------------------------------------
    const { opponentCharacterStats, opponentStrategyStats } = useMemo(() => {
        // Group by race to determine effective winners (best placing non-player)
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
            if (bestHorse) {
                effectiveWinners.push(bestHorse);
            }
        });

        // Recalculate Character Stats for Opponents
        const charaMap = new Map<number, { charaName: string; wins: number }>();
        effectiveWinners.forEach(h => {
            if (!charaMap.has(h.charaId)) {
                charaMap.set(h.charaId, { charaName: h.charaName, wins: 0 });
            }
            charaMap.get(h.charaId)!.wins++;
        });

        const oppCharaStats: CharacterStats[] = Array.from(charaMap.entries()).map(([charaId, s]) => ({
            charaId,
            charaName: s.charaName,
            wins: s.wins,
            totalRaces: 0, top3Finishes: 0, avgFinishPosition: 0, avgFinishTime: 0
        }));

        // Recalculate Strategy Stats for Opponents
        const stratMap = new Map<number, { wins: number; winnersByChara: Map<number, { charaName: string; wins: number }> }>();
        effectiveWinners.forEach(h => {
            if (!stratMap.has(h.strategy)) {
                stratMap.set(h.strategy, { wins: 0, winnersByChara: new Map() });
            }
            const s = stratMap.get(h.strategy)!;
            s.wins++;

            if (!s.winnersByChara.has(h.charaId)) {
                s.winnersByChara.set(h.charaId, { charaName: h.charaName, wins: 0 });
            }
            s.winnersByChara.get(h.charaId)!.wins++;
        });

        const oppStratStats: StrategyStats[] = Array.from(stratMap.entries()).map(([strategy, s]) => ({
            strategy,
            strategyName: STRATEGY_NAMES[strategy] || `Strategy ${strategy}`,
            wins: s.wins,
            totalRaces: 0, top3Finishes: 0, avgFinishPosition: 0, avgFinishTime: 0,
            winningCharacters: Array.from(s.winnersByChara.entries())
                .map(([charaId, data]) => ({ charaId, charaName: data.charaName, wins: data.wins }))
                .sort((a, b) => b.wins - a.wins)
        }));

        return { opponentCharacterStats: oppCharaStats, opponentStrategyStats: oppStratStats };
    }, [allHorses]);

    // -------------------------------------------------------------------------
    // 2. Prepare Strategy Pie Data (Wins All, Wins Opp, Pop Opp)
    // -------------------------------------------------------------------------
    const strategyPieDataAll = useMemo((): StrategyPieSlice[] => {
        const totalWins = strategyStats.reduce((sum, s) => sum + s.wins, 0);
        if (totalWins === 0) return [];
        return strategyStats
            .filter(s => s.wins > 0)
            .map(s => ({
                value: s.wins,
                percentage: (s.wins / totalWins) * 100,
                label: s.strategyName,
                color: STRATEGY_COLORS[s.strategy] || "#9ca3af",
                winningCharacters: s.winningCharacters,
            }))
            .sort((a, b) => b.value - a.value);
    }, [strategyStats]);

    const strategyPieDataOpp = useMemo((): StrategyPieSlice[] => {
        const totalWins = opponentStrategyStats.reduce((sum, s) => sum + s.wins, 0);
        if (totalWins === 0) return [];
        return opponentStrategyStats
            .filter(s => s.wins > 0)
            .map(s => ({
                value: s.wins,
                percentage: (s.wins / totalWins) * 100,
                label: s.strategyName,
                color: STRATEGY_COLORS[s.strategy] || "#9ca3af",
                winningCharacters: s.winningCharacters,
            }))
            .sort((a, b) => b.value - a.value);
    }, [opponentStrategyStats]);

    // Population Stats (Strategies)
    const popStrategyData = useMemo(() => {
        const nonPlayerHorses = allHorses.filter(h => !h.isPlayer);
        const total = nonPlayerHorses.length;
        if (total === 0) return [];

        const stratMap = new Map<number, number>();
        nonPlayerHorses.forEach(h => {
            stratMap.set(h.strategy, (stratMap.get(h.strategy) || 0) + 1);
        });

        return Array.from(stratMap.entries())
            .map(([strategy, count]) => ({
                value: count,
                percentage: (count / total) * 100,
                label: STRATEGY_NAMES[strategy] || `Strategy ${strategy}`,
                color: STRATEGY_COLORS[strategy] || "#9ca3af",
            }))
            .sort((a, b) => b.value - a.value);
    }, [allHorses]);

    // Strategy Performance Metrics
    const strategyPerfMetrics = useMemo(() => {
        const strategies = [1, 2, 3, 4];

        // 1. Calculate Pop Pcts
        const nonPlayerHorses = allHorses.filter(h => !h.isPlayer);
        const totalPop = nonPlayerHorses.length || 1;
        const popMap = new Map<number, number>();
        nonPlayerHorses.forEach(h => popMap.set(h.strategy, (popMap.get(h.strategy) || 0) + 1));

        // 2. Calculate Win Pcts
        const totalWins = opponentStrategyStats.reduce((sum, s) => sum + s.wins, 0) || 1;
        const winsMap = new Map<number, number>();
        opponentStrategyStats.forEach(s => winsMap.set(s.strategy, s.wins));

        // 3. Build Metrics
        return strategies.map(stratId => {
            const popCount = popMap.get(stratId) || 0;
            const winCount = winsMap.get(stratId) || 0;
            const popPct = (popCount / totalPop) * 100;
            const winPct = (winCount / totalWins) * 100;
            const impact = popPct > 0 ? winPct / popPct : 0;
            const actualWinRate = popCount > 0 ? (winCount / popCount) * 100 : 0;
            return {
                id: stratId,
                label: STRATEGY_NAMES[stratId],
                diff: winPct - popPct,
                impact,
                winPct,
                actualWinRate,
                popPct,
                popCount,
                winCount
            };
        }).filter(m => m.popCount > 0 || m.winCount > 0);
    }, [allHorses, opponentStrategyStats]);

    // Unified Character Data with consistent colors and grouping

    const {
        unifiedCharacterWinsAll,
        unifiedCharacterWinsOpp,
        unifiedCharacterPop,
        rawUnifiedCharacterWinsAll,
        rawUnifiedCharacterWinsOpp,
        rawUnifiedCharacterPop,
        characterLegend,
        characterPerfMetrics
    } = useMemo(() => {

        const getKey = (charaId: number, strategy: number, cardId: number) => `${charaId}_${cardId}_${strategy}`;
        const getLabel = (name: string, strategy: number) => `[${STRATEGY_NAMES_SHORT[strategy]}] ${name}`;

        // 1. Get filtered horses (for population)
        const nonPlayerHorses = allHorses.filter(h => !h.isPlayer);
        const popTotal = nonPlayerHorses.length;

        // 2. Count raw stats (Population)

        const popMap = new Map<string, { name: string; count: number; charaId: number; strategy: number; cardId: number }>();
        nonPlayerHorses.forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            if (!popMap.has(key)) popMap.set(key, { name: getLabel(h.charaName, h.strategy), count: 0, charaId: h.charaId, strategy: h.strategy, cardId: h.cardId });
            popMap.get(key)!.count++;
        });

        // 3. Wins (All) - Recalculate from allHorses to support Strategy split
        const winMapAll = new Map<string, { name: string; count: number; charaId: number; strategy: number; cardId: number }>();
        const winnersAll = allHorses.filter(h => h.finishOrder === 1);
        const winTotalAll = winnersAll.length;

        winnersAll.forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            if (!winMapAll.has(key)) winMapAll.set(key, { name: getLabel(h.charaName, h.strategy), count: 0, charaId: h.charaId, strategy: h.strategy, cardId: h.cardId });
            winMapAll.get(key)!.count++;
        });

        // 4. Wins (Opponents) - Recalculate from effective effective winners

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

        const winMapOpp = new Map<string, { name: string; count: number; charaId: number; strategy: number; cardId: number }>();
        const winTotalOpp = effectiveWinners.length;
        effectiveWinners.forEach(h => {
            const key = getKey(h.charaId, h.strategy, h.cardId);
            if (!winMapOpp.has(key)) winMapOpp.set(key, { name: getLabel(h.charaName, h.strategy), count: 0, charaId: h.charaId, strategy: h.strategy, cardId: h.cardId });
            winMapOpp.get(key)!.count++;
        });

        // 5. Determine "Key Characters" (Tuples)
        const MAX_SLICES = 6; // Increased slightly since tuples add fragmentation
        const topWinsAll = Array.from(winMapAll.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_SLICES).map(e => e[0]);
        const topWinsOpp = Array.from(winMapOpp.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_SLICES).map(e => e[0]);
        const topPop = Array.from(popMap.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_SLICES).map(e => e[0]);

        const keyIds = Array.from(new Set([...topWinsAll, ...topWinsOpp, ...topPop]));

        // 6. Assign Colors
        const colorMap = new Map<string, string>();
        let colorIndex = 0;

        // Assign to Key IDs first (stable for legend/pie)
        keyIds.forEach((id) => {
            colorMap.set(id, CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length]);
            colorIndex++;
        });

        // Assign to everyone else
        const allIds = new Set([...Array.from(winMapAll.keys()), ...Array.from(winMapOpp.keys()), ...Array.from(popMap.keys())]);
        allIds.forEach((id) => {
            if (!colorMap.has(id)) {
                colorMap.set(id, CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length]);
                colorIndex++;
            }
        });

        // 7. Generate Slices
        const commonGenSlices = (sourceMap: Map<string, { name: string; count: number; charaId: number; strategy: number; cardId: number }>, total: number) => {
            const slices: PieSlice[] = [];
            let othersCount = 0;
            const othersDetails: string[] = [];

            // First, key characters
            keyIds.forEach(id => {
                if (sourceMap.has(id)) {
                    const data = sourceMap.get(id)!;
                    slices.push({
                        value: data.count,
                        percentage: (data.count / total) * 100,
                        label: data.name,
                        color: colorMap.get(id)!,
                        charaId: id, // String ID
                        strategyId: data.strategy,
                    });
                }
            });

            // Then everyone else
            sourceMap.forEach((data, id) => {
                if (!keyIds.includes(id)) {
                    othersCount += data.count;
                    othersDetails.push(`${data.name}: ${data.count}`);
                }
            });

            slices.sort((a, b) => b.value - a.value);

            if (othersCount > 0) {
                const tooltipLines = othersDetails.sort((a, b) => 0).slice(0, 15);
                if (othersDetails.length > 15) {
                    tooltipLines.push(`...and ${othersDetails.length - 15} more`);
                }

                slices.push({
                    value: othersCount,
                    percentage: (othersCount / total) * 100,
                    label: "Others",
                    color: "#718096",
                    tooltipLines,
                });
            }

            return slices;
        };

        // Helper to generate ALL slices without "Others" grouping (for Bar Chart)
        const genFullSlices = (sourceMap: Map<string, { name: string; count: number; charaId: number; strategy: number; cardId: number }>, total: number) => {
            return Array.from(sourceMap.entries())
                .map(([id, data]) => {
                    const cardName = data.cardId ? UMDatabaseWrapper.cards[data.cardId]?.name : null;
                    const label = (cardName && cardName !== "") ? cardName : data.name;

                    return {
                        value: data.count,
                        percentage: (data.count / total) * 100,
                        label: label,
                        color: colorMap.get(id) || "#718096", // Default color if not in keyIds
                        charaId: id,
                        strategyId: data.strategy,
                    };
                })
                .sort((a, b) => b.value - a.value);
        };

        const unifiedCharacterWinsAll = winTotalAll > 0 ? commonGenSlices(winMapAll, winTotalAll) : [];
        const unifiedCharacterWinsOpp = winTotalOpp > 0 ? commonGenSlices(winMapOpp, winTotalOpp) : [];
        const unifiedCharacterPop = popTotal > 0 ? commonGenSlices(popMap, popTotal) : [];

        const rawUnifiedCharacterWinsAll = winTotalAll > 0 ? genFullSlices(winMapAll, winTotalAll) : [];
        const rawUnifiedCharacterWinsOpp = winTotalOpp > 0 ? genFullSlices(winMapOpp, winTotalOpp) : [];
        const rawUnifiedCharacterPop = popTotal > 0 ? genFullSlices(popMap, popTotal) : [];

        // 8. Legend Data
        const characterLegend = keyIds
            .filter(id => (winMapAll.has(id) || winMapOpp.has(id) || popMap.has(id)))
            .map(id => ({
                id, // string
                label: (winMapAll.get(id)?.name || winMapOpp.get(id)?.name || popMap.get(id)?.name || "Unknown"),
                color: colorMap.get(id)!
            }));

        // 9. Performance Metrics
        const allPerfIds = Array.from(new Set([...Array.from(popMap.keys()), ...Array.from(winMapOpp.keys())]));
        const totalWinsMetric = winTotalOpp || 1;
        const totalPopMetric = popTotal || 1;

        const characterPerfMetrics: PerformanceMetrics[] = allPerfIds.map(id => {
            const popData = popMap.get(id);
            const winData = winMapOpp.get(id);
            const popCount = popData?.count || 0;
            const winCount = winData?.count || 0;
            // Use name from either source
            const name = popData?.name || winData?.name || `ID ${id}`;

            const popPct = (popCount / totalPopMetric) * 100;
            const winPct = (winCount / totalWinsMetric) * 100;
            const impact = popPct > 0 ? winPct / popPct : 0;
            const actualWinRate = popCount > 0 ? (winCount / popCount) * 100 : 0;

            return {
                id,
                label: name,
                diff: winPct - popPct,
                impact,
                winPct,
                actualWinRate,
                popPct,
                popCount,
                winCount
            };
        });

        return {
            unifiedCharacterWinsAll,
            unifiedCharacterWinsOpp,
            unifiedCharacterPop,
            rawUnifiedCharacterWinsAll,
            rawUnifiedCharacterWinsOpp,
            rawUnifiedCharacterPop,
            characterLegend,
            characterPerfMetrics
        };

    }, [allHorses]);

    return {
        opponentCharacterStats,
        opponentStrategyStats,
        strategyPieDataAll,
        strategyPieDataOpp,
        popStrategyData,
        strategyPerfMetrics,
        unifiedCharacterWinsAll,
        unifiedCharacterWinsOpp,
        unifiedCharacterPop,
        rawUnifiedCharacterWinsAll,
        rawUnifiedCharacterWinsOpp,
        rawUnifiedCharacterPop,
        characterLegend,
        characterPerfMetrics,
    };
};
