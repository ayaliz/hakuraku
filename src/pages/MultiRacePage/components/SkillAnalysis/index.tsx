import React, { useState, useMemo, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { SkillStats, SkillActivationPoint, SkillActivationBuckets, CharacterStats, StrategyStats, HorseEntry } from "../../types";
import { CharaHpSpurtStats } from "../HpSpurtAnalysis/types";
import AssetLoader from "../../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import PortraitSelect, { PortraitSelectOption } from "../PortraitSelect";
import type { GroupSkillDetailPayload } from "../../../UmaLogsPage/skillCache";
import { STRATS, DoubleProcBreakdown, LocalDoubleProcSummary, matchesRepresentativeSkillGroup, isGuaranteedSkill } from "./skillUtils";
import WinBreakdownTable from "./WinBreakdownTable";
import SerializedWinBreakdownTable, { filterWinBreakdownRows } from "./SerializedWinBreakdownTable";
import DoubleProcTable, { computeDoubleProcSummary, estimateDoubleOpportunityRate } from "./DoubleProcTable";

interface SkillAnalysisProps {
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    allHorses?: HorseEntry[];
    ownCharas?: CharaHpSpurtStats[];
    precomputedBuckets?: Map<number, SkillActivationBuckets>;
    lazySkillDetails?: Map<number, GroupSkillDetailPayload>;
    onLoadLazySkillDetail?: (skillId: number) => void;
    lazySkillDetailLoadingIds?: Set<number>;
}

type SortKey = "skillName" | "timesActivated" | "learnedByHorses" | "uniqueRaces" | "winRate" | "avgFinishPosition" | "normalizedActivations" | "meanDistance" | "medianDistance";
type SortDir = "asc" | "desc";

const SkillAnalysis: React.FC<SkillAnalysisProps> = ({
    skillStats,
    skillActivations,
    avgRaceDistance,
    strategyStats,
    allHorses = [],
    ownCharas,
    precomputedBuckets,
    lazySkillDetails,
    onLoadLazySkillDetail,
    lazySkillDetailLoadingIds,
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
    const [selectedCharaFilter, setSelectedCharaFilter] = useState<string>("all");
    const [selectedOwnCharaFilter, setSelectedOwnCharaFilter] = useState<string>("all");
    const [minDist, setMinDist] = useState<string>("");
    const [maxDist, setMaxDist] = useState<string>("");

    const allCharaDropdownOptions = useMemo((): PortraitSelectOption[] => {
        const cardsByChara = new Map<number, { name: string; cardIds: Set<number> }>();
        allHorses.forEach(h => {
            if (!cardsByChara.has(h.charaId)) cardsByChara.set(h.charaId, { name: h.charaName, cardIds: new Set() });
            cardsByChara.get(h.charaId)!.cardIds.add(h.cardId);
        });
        const sorted = Array.from(cardsByChara.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));
        const options: PortraitSelectOption[] = [];
        sorted.forEach(([charaId, { name, cardIds }]) => {
            const cardIdArr = Array.from(cardIds);
            if (cardIdArr.length === 1) {
                options.push({ value: `chara:${charaId}`, label: name, portrait: AssetLoader.getCharaThumb(cardIdArr[0]) ?? undefined });
            } else {
                options.push({ value: `chara:${charaId}`, label: `${name} (All)` });
                cardIdArr.forEach(cardId => {
                    const cardName = UMDatabaseWrapper.cards[cardId]?.name ?? name;
                    options.push({ value: `card:${charaId}:${cardId}`, label: cardName, portrait: AssetLoader.getCharaThumb(cardId) ?? undefined, indent: true });
                });
            }
        });
        return options;
    }, [allHorses]);

    const ownCharaDropdownOptions = useMemo((): PortraitSelectOption[] => {
        if (!ownCharas || ownCharas.length === 0) return [];
        const grouped = new Map<number, CharaHpSpurtStats[]>();
        ownCharas.forEach(c => {
            if (!grouped.has(c.charaId)) grouped.set(c.charaId, []);
            grouped.get(c.charaId)!.push(c);
        });
        const options: PortraitSelectOption[] = [];
        grouped.forEach((versions, charaId) => {
            if (versions.length === 1) {
                options.push({ label: versions[0].charaName, value: `unique:${versions[0].uniqueId}`, portrait: AssetLoader.getCharaThumb(versions[0].cardId) ?? undefined });
            } else {
                options.push({ label: `${versions[0].charaName} (All)`, value: `chara:${charaId}` });
                versions.forEach(v => {
                    options.push({ label: `${v.charaName} (${v.trainedChara.rankScore})`, value: `unique:${v.uniqueId}`, portrait: AssetLoader.getCharaThumb(v.cardId) ?? undefined, indent: true });
                });
            }
        });
        return options;
    }, [ownCharas]);

    const ownCharaHorseKeys = useMemo(() => {
        if (selectedOwnCharaFilter === "all" || !ownCharas) return null;
        let relevantStats: CharaHpSpurtStats[] = [];
        if (selectedOwnCharaFilter.startsWith("unique:")) {
            const uid = selectedOwnCharaFilter.slice(7);
            const stat = ownCharas.find(c => c.uniqueId === uid);
            if (stat) relevantStats = [stat];
        } else if (selectedOwnCharaFilter.startsWith("chara:")) {
            const cid = Number(selectedOwnCharaFilter.slice(6));
            relevantStats = ownCharas.filter(c => c.charaId === cid);
        }
        const keys = new Set<string>();
        relevantStats.forEach(stat => {
            stat.sourceRuns.forEach(({ race, horseFrameOrder }) => {
                keys.add(`${race.id}_${horseFrameOrder}`);
            });
        });
        return keys;
    }, [ownCharas, selectedOwnCharaFilter]);
    const [expandedSkillId, setExpandedSkillId] = useState<number | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("timesActivated");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const supportsLocalHorseFilters = !precomputedBuckets && !onLoadLazySkillDetail;
    const hasLazyBucketMode = !precomputedBuckets && !!onLoadLazySkillDetail;

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const renderSortIndicator = (key: SortKey) => {
        if (sortKey !== key) return <span className="sort-indicator">↕</span>;
        return <span className="sort-indicator active">{sortDir === "asc" ? "↑" : "↓"}</span>;
    };

    const skillsArray = useMemo(() => {
        return Array.from(skillStats.values());
    }, [skillStats]);

    // Filter horses based on selection
    const filteredHorses = useMemo(() => {
        return allHorses.filter(h => {
            const matchesStrategy = selectedStrategy === "all" || h.strategy === Number(selectedStrategy);
            let matchesChara = true;
            if (selectedCharaFilter.startsWith("chara:")) {
                matchesChara = h.charaId === Number(selectedCharaFilter.slice(6));
            } else if (selectedCharaFilter.startsWith("card:")) {
                const parts = selectedCharaFilter.split(":");
                matchesChara = h.charaId === Number(parts[1]) && h.cardId === Number(parts[2]);
            }
            const matchesOwnChara = ownCharaHorseKeys === null
                || ownCharaHorseKeys.has(`${h.raceId}_${h.frameOrder}`);
            return matchesStrategy && matchesChara && matchesOwnChara;
        });
    }, [allHorses, selectedStrategy, selectedCharaFilter, ownCharaHorseKeys]);

    // Recalculate skill stats based on filtered horses
    const activeSkillStats = useMemo(() => {
        // Precomputed mode
        if (precomputedBuckets) {
            if (selectedStrategy === "all") return Array.from(skillStats.values());

            const stratKey = String(selectedStrategy);
            const result: SkillStats[] = [];

            for (const skill of skillStats.values()) {
                const b = precomputedBuckets.get(skill.skillId);
                if (!b) continue;
                const stratBuckets = b.byStrategy[stratKey] ?? [];
                if (!stratBuckets.some(c => c > 0)) continue;

                const timesActivated = stratBuckets.reduce((s, c) => s + c, 0);
                const learnedByHorses = skill.learnedByHorsesByStrategy?.[stratKey]
                    ?? filteredHorses.filter(h => {
                        for (const sid of h.learnedSkillIds)
                            if (matchesRepresentativeSkillGroup(sid, skill.skillId)) return true;
                        return false;
                    }).length;

                const horsesWhoActivated = filteredHorses.filter(h => {
                    for (const sid of h.activatedSkillIds)
                        if (matchesRepresentativeSkillGroup(sid, skill.skillId)) return true;
                    return false;
                });
                const uniqueHorses = horsesWhoActivated.length;
                const winsWithSkill = horsesWhoActivated.filter(h => h.finishOrder === 1).length;
                const winRate = uniqueHorses > 0 ? (winsWithSkill / uniqueHorses) * 100 : 0;
                const meanDistance = skill.meanDistanceByStrategy?.[stratKey] ?? skill.meanDistance;
                const medianDistance = skill.medianDistanceByStrategy?.[stratKey] ?? skill.medianDistance;

                result.push({ ...skill, timesActivated, learnedByHorses, uniqueHorses, winRate, meanDistance, medianDistance });
            }

            return result;
        }

        if (hasLazyBucketMode) {
            if (selectedStrategy === "all") {
                return Array.from(skillStats.values());
            }
            const stratKey = String(selectedStrategy);
            return Array.from(skillStats.values())
                .filter((skill) => (skill.timesActivatedByStrategy?.[stratKey] ?? 0) > 0)
                .map((skill) => ({
                    ...skill,
                    timesActivated: skill.timesActivatedByStrategy?.[stratKey] ?? skill.timesActivated,
                    learnedByHorses: skill.learnedByHorsesByStrategy?.[stratKey] ?? skill.learnedByHorses,
                    meanDistance: skill.meanDistanceByStrategy?.[stratKey] ?? skill.meanDistance,
                    medianDistance: skill.medianDistanceByStrategy?.[stratKey] ?? skill.medianDistance,
                }));
        }

        // If no filters active, use original stats (optimization)
        if (selectedStrategy === "all" && selectedCharaFilter === "all" && ownCharaHorseKeys === null && minDist === "" && maxDist === "") {
            return Array.from(skillStats.values());
        }

        const minD = minDist === "" ? -1 : Number(minDist);
        const maxD = maxDist === "" ? Number.MAX_SAFE_INTEGER : Number(maxDist);

        const validHorseKeys = new Set(filteredHorses.map(h => `${h.raceId}_${h.frameOrder}`));
        const filteredStats: SkillStats[] = [];

        skillStats.forEach((baseStat) => {
            // Filter activations
            const baseActivations = skillActivations.get(baseStat.skillId) || [];
            const filteredActivations = baseActivations.filter(p =>
                validHorseKeys.has(`${p.raceId}_${p.horseFrameOrder}`) &&
                (minD === -1 || p.distance >= minD) &&
                (maxD === Number.MAX_SAFE_INTEGER || p.distance <= maxD)
            );

            // A horse learned this representative skill group if it has any matching rank/inherit variant.
            const horsesWhoLearned = filteredHorses.filter(h => {
                for (const learnedId of h.learnedSkillIds) {
                    if (matchesRepresentativeSkillGroup(learnedId, baseStat.skillId)) return true;
                }
                return false;
            });
            const learnedByHorses = horsesWhoLearned.length;

            if (filteredActivations.length === 0) return;

            // Recalculate derived stats
            const uniqueRaces = new Set(filteredActivations.map(p => p.raceId)).size;
            const uniqueHorses = new Set(filteredActivations.map(p => `${p.raceId}_${p.horseFrameOrder}`)).size;



            const horsesWhoActivated = filteredHorses.filter(h => {
                for (const actId of h.activatedSkillIds) {
                    if (matchesRepresentativeSkillGroup(actId, baseStat.skillId)) return true;
                }
                return false;
            });

            const winsWithSkill = horsesWhoActivated.filter(h => h.finishOrder === 1).length;
            const winRate = horsesWhoActivated.length > 0 ? (winsWithSkill / horsesWhoActivated.length) * 100 : 0;

            const uniqueParticipations = new Map<string, SkillActivationPoint>();
            filteredActivations.forEach(p => {
                const key = `${p.raceId}_${p.horseFrameOrder}`;
                if (!uniqueParticipations.has(key)) uniqueParticipations.set(key, p);
            });

            let normalizedActivations = Array.from(uniqueParticipations.values()).reduce((sum, p) => {
                return sum + (1 / p.activationChance);
            }, 0);

            if (isGuaranteedSkill(baseStat.skillId)) normalizedActivations = uniqueParticipations.size;

            const avgFinishPosition = horsesWhoActivated.length > 0
                ? horsesWhoActivated.reduce((sum, h) => sum + h.finishOrder, 0) / horsesWhoActivated.length
                : 0;

            const distances = filteredActivations.map(p => p.distance).sort((a, b) => a - b);
            let meanDistance = 0;
            let medianDistance = 0;

            if (distances.length > 0) {
                meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
                const mid = Math.floor(distances.length / 2);
                medianDistance = distances.length % 2 !== 0
                    ? distances[mid]
                    : (distances[mid - 1] + distances[mid]) / 2;
            }

            filteredStats.push({
                ...baseStat,
                timesActivated: filteredActivations.length,
                normalizedActivations,
                uniqueRaces,
                uniqueHorses,
                learnedByHorses,
                winRate,
                avgFinishPosition,
                activationDistances: distances,
                meanDistance,
                medianDistance,
            });
        });

        return filteredStats;
    }, [skillStats, precomputedBuckets, hasLazyBucketMode, skillActivations, filteredHorses, selectedStrategy, selectedCharaFilter, ownCharaHorseKeys, minDist, maxDist]);

    const filteredSkills = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return activeSkillStats.filter(skill => {
            const matchesSearch = !query ||
                (skill.skillNames?.some(n => n.toLowerCase().includes(query)) || skill.skillName.toLowerCase().includes(query)) ||
                skill.skillId.toString().includes(query);
            return matchesSearch;
        });
    }, [activeSkillStats, searchQuery]);

    const sortedSkills = useMemo(() => {
        return [...filteredSkills].sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case "skillName":
                    cmp = a.skillName.localeCompare(b.skillName);
                    break;
                case "timesActivated":
                    cmp = a.timesActivated - b.timesActivated;
                    break;
                case "uniqueRaces":
                    cmp = a.uniqueRaces - b.uniqueRaces;
                    break;
                case "learnedByHorses":
                    cmp = a.learnedByHorses - b.learnedByHorses;
                    break;
                case "normalizedActivations":
                    const aNorm = a.learnedByHorses > 0 ? a.normalizedActivations / a.learnedByHorses : 0;
                    const bNorm = b.learnedByHorses > 0 ? b.normalizedActivations / b.learnedByHorses : 0;
                    cmp = aNorm - bNorm;
                    break;
                case "winRate":
                    cmp = a.winRate - b.winRate;
                    break;
                case "avgFinishPosition":
                    cmp = a.avgFinishPosition - b.avgFinishPosition;
                    break;
                case "meanDistance":
                    cmp = a.meanDistance - b.meanDistance;
                    break;
                case "medianDistance":
                    cmp = a.medianDistance - b.medianDistance;
                    break;
            }
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [filteredSkills, sortKey, sortDir]);



    const toggleSkill = (skillId: number) => {
        setExpandedSkillId(prev => {
            const next = prev === skillId ? null : skillId;
            if (next !== null && hasLazyBucketMode && !lazySkillDetails?.has(skillId)) {
                onLoadLazySkillDetail?.(skillId);
            }
            return next;
        });
    };

    useEffect(() => {
        if (expandedSkillId !== null && hasLazyBucketMode && !lazySkillDetails?.has(expandedSkillId)) {
            onLoadLazySkillDetail?.(expandedSkillId);
        }
    }, [expandedSkillId, hasLazyBucketMode, lazySkillDetails, onLoadLazySkillDetail]);

    const renderHeatmap = (skill: SkillStats) => {
        // Precomputed path
        if (precomputedBuckets) {
            const b = precomputedBuckets.get(skill.skillId);
            if (!b) return null;
            const buckets = selectedStrategy === "all"
                ? b.all
                : (b.byStrategy[String(selectedStrategy)] ?? b.all);
            const doubleProcBreakdown: DoubleProcBreakdown = selectedStrategy === "all"
                ? {
                    byStrategy: b.doubleProcByStrategy,
                }
                : {
                    byStrategy: {
                        [String(selectedStrategy)]: b.doubleProcByStrategy?.[String(selectedStrategy)] ?? null,
                    },
                };
            const totalActivations = buckets.reduce((s, c) => s + c, 0);
            if (totalActivations === 0) return null;
            const maxCount = Math.max(...buckets, 1);
            const getBarColor = (count: number) => {
                if (count === 0) return "transparent";
                const intensity = count / maxCount;
                return `hsla(240, 80%, ${60 + intensity * 20}%, ${0.15 + intensity * 0.85})`;
            };
            return (
                <tr key={`heatmap-${skill.skillId}`} className="heatmap-row">
                    <td colSpan={6} className="p-0">
                        <div className="inline-heatmap-container">
                            <div className="heatmap-track">
                                {buckets.map((count, i) => {
                                    const pct = (count / totalActivations) * 100;
                                    const distStart = ((i / buckets.length) * avgRaceDistance).toFixed(0);
                                    const distEnd = (((i + 1) / buckets.length) * avgRaceDistance).toFixed(0);
                                    return (
                                        <div key={i} style={{ flex: 1, height: "100%", background: getBarColor(count), transition: "background 0.2s ease", cursor: count > 0 ? "help" : "default" }}
                                            title={count > 0 ? `${distStart}-${distEnd}m: ${count} activation${count > 1 ? 's' : ''} (${pct.toFixed(1)}%)` : undefined} />
                                    );
                                })}
                                <div className="heatmap-phase-marker heatmap-phase-marker--mid" />
                                <div className="heatmap-phase-marker heatmap-phase-marker--late" />
                                <div className="heatmap-phase-marker heatmap-phase-marker--spurt" />
                            </div>
                            <div className="inline-heatmap-legend">
                                <span className="heatmap-label--start">0m</span>
                                <span className="heatmap-label--mid">Middle</span>
                                <span className="heatmap-label--late">Late</span>
                                <span className="heatmap-label--spurt">Spurt</span>
                                <span className="heatmap-label--end">{Math.round(avgRaceDistance)}m</span>
                            </div>
                            <DoubleProcTable breakdown={doubleProcBreakdown} />
                            <WinBreakdownTable skill={skill} horses={filteredHorses} />
                        </div>
                    </td>
                </tr>
            );
        }

        if (hasLazyBucketMode) {
            const detailData = lazySkillDetails?.get(skill.skillId);
            const isLoading = lazySkillDetailLoadingIds?.has(skill.skillId) ?? false;
            if (!detailData) {
                return (
                    <tr key={`heatmap-${skill.skillId}`} className="heatmap-row">
                        <td colSpan={6} className="skill-no-data-cell">
                            {isLoading ? "Loading skill heatmap..." : "Click again to load skill heatmap."}
                        </td>
                    </tr>
                );
            }

            const bucketData = detailData.buckets;
            const buckets = selectedStrategy === "all"
                ? bucketData.all
                : (bucketData.byStrategy[String(selectedStrategy)] ?? bucketData.all);
            const doubleProcBreakdown: DoubleProcBreakdown = selectedStrategy === "all"
                ? {
                    byStrategy: bucketData.doubleProcByStrategy,
                }
                : {
                    byStrategy: {
                        [String(selectedStrategy)]: bucketData.doubleProcByStrategy?.[String(selectedStrategy)] ?? null,
                    },
                };
            const totalActivations = buckets.reduce((s, c) => s + c, 0);
            const filteredWinBreakdown = filterWinBreakdownRows(detailData.winBreakdown, selectedStrategy);
            if (totalActivations === 0) {
                return (
                    <tr key={`heatmap-${skill.skillId}`} className="heatmap-row">
                        <td colSpan={6} className="skill-no-data-cell">
                            No activation data for the current filter.
                        </td>
                    </tr>
                );
            }
            const maxCount = Math.max(...buckets, 1);
            const getBarColor = (count: number) => {
                if (count === 0) return "transparent";
                const intensity = count / maxCount;
                return `hsla(240, 80%, ${60 + intensity * 20}%, ${0.15 + intensity * 0.85})`;
            };
            return (
                <tr key={`heatmap-${skill.skillId}`} className="heatmap-row">
                    <td colSpan={6} className="p-0">
                        <div className="inline-heatmap-container">
                            <div className="heatmap-track">
                                {buckets.map((count, i) => {
                                    const pct = (count / totalActivations) * 100;
                                    const distStart = ((i / buckets.length) * avgRaceDistance).toFixed(0);
                                    const distEnd = (((i + 1) / buckets.length) * avgRaceDistance).toFixed(0);
                                    return (
                                        <div key={i} style={{ flex: 1, height: "100%", background: getBarColor(count), transition: "background 0.2s ease", cursor: count > 0 ? "help" : "default" }}
                                            title={count > 0 ? `${distStart}-${distEnd}m: ${count} activation${count > 1 ? 's' : ''} (${pct.toFixed(1)}%)` : undefined} />
                                    );
                                })}
                                <div className="heatmap-phase-marker heatmap-phase-marker--mid" />
                                <div className="heatmap-phase-marker heatmap-phase-marker--late" />
                                <div className="heatmap-phase-marker heatmap-phase-marker--spurt" />
                            </div>
                            <div className="inline-heatmap-legend">
                                <span className="heatmap-label--start">0m</span>
                                <span className="heatmap-label--mid">Middle</span>
                                <span className="heatmap-label--late">Late</span>
                                <span className="heatmap-label--spurt">Spurt</span>
                                <span className="heatmap-label--end">{Math.round(avgRaceDistance)}m</span>
                            </div>
                            <DoubleProcTable breakdown={doubleProcBreakdown} />
                            <SerializedWinBreakdownTable rows={filteredWinBreakdown} />
                        </div>
                    </td>
                </tr>
            );
        }

        const baseActivations = skillActivations.get(skill.skillId) || [];

        const minD = minDist === "" ? -1 : Number(minDist);
        const maxD = maxDist === "" ? Number.MAX_SAFE_INTEGER : Number(maxDist);

        let activations = baseActivations;
        // Always filter if we have any active filters
        if (selectedStrategy !== "all" || selectedCharaFilter !== "all" || ownCharaHorseKeys !== null || minDist !== "" || maxDist !== "") {
            const validHorseKeys = new Set(filteredHorses.map(h => `${h.raceId}_${h.frameOrder}`));
            activations = baseActivations.filter(p =>
                validHorseKeys.has(`${p.raceId}_${p.horseFrameOrder}`) &&
                (minD === -1 || p.distance >= minD) &&
                (maxD === Number.MAX_SAFE_INTEGER || p.distance <= maxD)
            );
        }

        const doubleProcSummary = computeDoubleProcSummary(activations);
        const doubleProcBreakdown: DoubleProcBreakdown = {};
        if (doubleProcSummary) {
            doubleProcBreakdown.overall = doubleProcSummary;
            const procCountsByHorse = new Map<string, number>();
            activations.forEach((activation) => {
                const key = `${activation.raceId}_${activation.horseFrameOrder}`;
                procCountsByHorse.set(key, (procCountsByHorse.get(key) ?? 0) + 1);
            });
            const learnedHorsesForSkill = filteredHorses.filter((horse) => {
                for (const learnedId of horse.learnedSkillIds) {
                    if (matchesRepresentativeSkillGroup(learnedId, skill.skillId)) return true;
                }
                return false;
            });
            doubleProcSummary.estimatedDoubleOpportunityRate = estimateDoubleOpportunityRate(
                learnedHorsesForSkill.map((horse) => ({
                    activationChance: horse.activationChance,
                    observedCount: procCountsByHorse.get(`${horse.raceId}_${horse.frameOrder}`) ?? 0,
                }))
            );

            const byStrategy: Record<string, LocalDoubleProcSummary | null> = {};
            STRATS.forEach((strategy) => {
                const strategyLearnedHorses = learnedHorsesForSkill.filter((horse) => horse.strategy === strategy);
                const strategyActivations = activations.filter((activation) => {
                    const horse = filteredHorses.find((h) => h.raceId === activation.raceId && h.frameOrder === activation.horseFrameOrder);
                    return horse?.strategy === strategy;
                });
                const strategySummary = computeDoubleProcSummary(strategyActivations);
                if (!strategySummary) return;
                const strategyProcCounts = new Map<string, number>();
                strategyActivations.forEach((activation) => {
                    const key = `${activation.raceId}_${activation.horseFrameOrder}`;
                    strategyProcCounts.set(key, (strategyProcCounts.get(key) ?? 0) + 1);
                });
                strategySummary.estimatedDoubleOpportunityRate = estimateDoubleOpportunityRate(
                    strategyLearnedHorses.map((horse) => ({
                        activationChance: horse.activationChance,
                        observedCount: strategyProcCounts.get(`${horse.raceId}_${horse.frameOrder}`) ?? 0,
                    }))
                );
                byStrategy[String(strategy)] = strategySummary;
            });
            doubleProcBreakdown.byStrategy = byStrategy;
        }

        // Create density buckets (50 buckets across the track)
        const numBuckets = 50;
        const buckets = new Array(numBuckets).fill(0);

        activations.forEach(act => {
            const bucketIndex = Math.min(
                Math.floor((act.distance / avgRaceDistance) * numBuckets),
                numBuckets - 1
            );
            if (bucketIndex >= 0) {
                buckets[bucketIndex]++;
            }
        });

        const maxCount = Math.max(...buckets, 1);

        // Generate color based on density (0 = transparent, max = bright purple)
        const getBarColor = (count: number) => {
            if (count === 0) return "transparent";
            const intensity = count / maxCount;
            // Use a non-linear scale for better visibility of low-density areas
            const alpha = 0.15 + (intensity * 0.85);
            const lightness = 60 + (intensity * 20); // Brighter for higher density
            return `hsla(240, 80%, ${lightness}%, ${alpha})`;
        };

        return (
            <tr key={`heatmap-${skill.skillId}`} className="heatmap-row">
                <td colSpan={7} className="p-0">
                    <div className="inline-heatmap-container">
                        <div className="heatmap-track">
                            {buckets.map((count, i) => {
                                const pct = activations.length > 0 ? (count / activations.length) * 100 : 0;
                                const distStart = ((i / numBuckets) * avgRaceDistance).toFixed(0);
                                const distEnd = (((i + 1) / numBuckets) * avgRaceDistance).toFixed(0);
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            flex: 1,
                                            height: "100%",
                                            background: getBarColor(count),
                                            transition: "background 0.2s ease",
                                            cursor: count > 0 ? "help" : "default",
                                        }}
                                        title={count > 0 ? `${distStart}-${distEnd}m: ${count} activation${count > 1 ? 's' : ''} (${pct.toFixed(1)}%)` : undefined}
                                    />
                                );
                            })}

                            {/* Phase markers: 1/6 = Middle, 2/3 = Late, 5/6 = Spurt */}
                            <div className="heatmap-phase-marker heatmap-phase-marker--mid" />
                            <div className="heatmap-phase-marker heatmap-phase-marker--late" />
                            <div className="heatmap-phase-marker heatmap-phase-marker--spurt" />
                        </div>

                        <div className="inline-heatmap-legend">
                            <span className="heatmap-label--start">0m</span>
                            <span className="heatmap-label--mid">Middle</span>
                            <span className="heatmap-label--late">Late</span>
                            <span className="heatmap-label--spurt">Spurt</span>
                            <span className="heatmap-label--end">{Math.round(avgRaceDistance)}m</span>
                        </div>

                        <DoubleProcTable breakdown={doubleProcBreakdown} />
                        <WinBreakdownTable skill={skill} horses={filteredHorses} />
                    </div>
                </td>
            </tr>
        );
    };

    if (skillsArray.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-title">No skill data available</div>
            </div>
        );
    }

    return (
        <>
            <div className="skill-search-container">
                <input
                    type="text"
                    className="skill-search-input"
                    placeholder="Search skills by name or ID..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />

                <select
                    className="skill-search-input skill-strategy-select"
                    value={selectedStrategy}
                    onChange={e => setSelectedStrategy(e.target.value)}
                >
                    <option value="all">All Styles</option>
                    {strategyStats.map(s => (
                        <option key={s.strategy} value={s.strategy}>{s.strategyName}</option>
                    ))}
                </select>

                {supportsLocalHorseFilters && (
                    <PortraitSelect
                        value={selectedCharaFilter}
                        defaultLabel="All Characters"
                        options={allCharaDropdownOptions}
                        onChange={setSelectedCharaFilter}
                    />
                )}

                {supportsLocalHorseFilters && ownCharaDropdownOptions.length > 0 && (
                    <PortraitSelect
                        value={selectedOwnCharaFilter}
                        defaultLabel="Own Characters"
                        options={ownCharaDropdownOptions}
                        onChange={v => {
                            setSelectedOwnCharaFilter(v);
                            if (v !== "all") {
                                setSelectedCharaFilter("all");
                                setSelectedStrategy("all");
                            }
                        }}
                    />
                )}

                {supportsLocalHorseFilters && (
                    <div className="skill-range-filter">
                        <input
                            type="number"
                            className="skill-search-input skill-range-input"
                            placeholder="Min dist"
                            value={minDist}
                            onChange={e => setMinDist(e.target.value)}
                        />
                        <span className="skill-range-sep">-</span>
                        <input
                            type="number"
                            className="skill-search-input skill-range-input"
                            placeholder="Max dist"
                            value={maxDist}
                            onChange={e => setMaxDist(e.target.value)}
                        />
                    </div>
                )}
                <span className="skill-count-label">
                    {filteredSkills.length} of {skillsArray.length} skills
                </span>
            </div>

            <div className="analysis-table-container">
                <table className="analysis-table skill-table-expandable">
                    <thead>
                        <tr>
                            <th className="sortable" onClick={() => handleSort("skillName")}>
                                Skill {renderSortIndicator("skillName")}
                            </th>
                            <th className="sortable" onClick={() => handleSort("learnedByHorses")}>
                                Learned {renderSortIndicator("learnedByHorses")}
                            </th>
                            <th className="sortable" onClick={() => handleSort("timesActivated")}>
                                Activations {renderSortIndicator("timesActivated")}
                            </th>
                            {supportsLocalHorseFilters && (
                                <th className="sortable" onClick={() => handleSort("normalizedActivations")}>
                                    <OverlayTrigger
                                        placement="top"
                                        overlay={
                                            <Tooltip id="normalized-tooltip">
                                                Estimate for how often the skill's conditions are met with wit checks excluded.
                                            </Tooltip>
                                        }
                                    >
                                        <span className="skill-help-hint">
                                            Normalized
                                        </span>
                                    </OverlayTrigger>
                                    {" "}
                                    {renderSortIndicator("normalizedActivations")}
                                </th>
                            )}
                            <th className="sortable" onClick={() => handleSort("meanDistance")}>
                                Mean Dist {renderSortIndicator("meanDistance")}
                            </th>
                            <th className="sortable" onClick={() => handleSort("medianDistance")}>
                                Median Dist {renderSortIndicator("medianDistance")}
                            </th>
                            <th className="skill-rank-col"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedSkills.map(skill => {
                            const isExpanded = expandedSkillId === skill.skillId;
                            const activationPct = skill.learnedByHorses > 0
                                ? (skill.uniqueHorses / skill.learnedByHorses) * 100
                                : 0;
                            // Normalized (Conditions Met) Percentage
                            const normalizedPct = skill.learnedByHorses > 0
                                ? (skill.normalizedActivations / skill.learnedByHorses) * 100
                                : 0;
                            return [
                                <tr
                                    key={`row-${skill.skillId}`}
                                    className={`skill-row ${isExpanded ? 'expanded' : ''}`}
                                    onClick={() => toggleSkill(skill.skillId)}
                                >
                                    <td>
                                        <div>
                                            {skill.skillNames && skill.skillNames.length > 0 ? (
                                                skill.skillNames.map((name, i) => (
                                                    <div key={i} className="skill-name-line">
                                                        <strong style={{ opacity: i === 0 ? 1 : 0.7 }}>{name}</strong>
                                                    </div>
                                                ))
                                            ) : (
                                                <strong>{skill.skillName}</strong>
                                            )}
                                        </div>
                                    </td>
                                    <td>{skill.learnedByHorses}</td>
                                    <td>
                                        {skill.timesActivated}
                                        <span className="skill-activation-pct">
                                            ({activationPct.toFixed(1)}%)
                                        </span>
                                    </td>
                                    {supportsLocalHorseFilters && (
                                        <td>
                                            {normalizedPct.toFixed(1)}%
                                        </td>
                                    )}
                                    <td>{skill.meanDistance.toFixed(0)}m</td>
                                    <td>{skill.medianDistance.toFixed(0)}m</td>
                                    <td>
                                        <span className="expand-icon">
                                            {isExpanded ? "▼" : "▶"}
                                        </span>
                                    </td>
                                </tr>,
                                isExpanded && renderHeatmap(skill)
                            ];
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
};

export default SkillAnalysis;
