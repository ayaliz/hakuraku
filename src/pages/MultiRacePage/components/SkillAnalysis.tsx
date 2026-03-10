import React, { useState, useMemo } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { SkillStats, SkillActivationPoint, SkillActivationBuckets, CharacterStats, StrategyStats, HorseEntry } from "../types";
import { CharaHpSpurtStats } from "./HpSpurtAnalysis/types";
import AssetLoader from "../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import GameDataLoader from "../../../data/GameDataLoader";
import PortraitSelect, { PortraitSelectOption } from "./PortraitSelect";

interface SkillAnalysisProps {
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    allHorses: HorseEntry[];
    ownCharas?: CharaHpSpurtStats[];
    precomputedBuckets?: Map<number, SkillActivationBuckets>;
}

type SortKey = "skillName" | "timesActivated" | "learnedByHorses" | "uniqueRaces" | "winRate" | "avgFinishPosition" | "normalizedActivations" | "meanDistance" | "medianDistance";

const STRAT_LABELS: Record<number, string> = { 1: "FR", 2: "PC", 3: "LS", 4: "EC" };
const STRATS = [1, 2, 3, 4] as const;
let _skillsJsonMap: Map<number, any> | null = null;

function getSkillsJsonMap() {
    if (!_skillsJsonMap) {
        _skillsJsonMap = new Map((GameDataLoader.skills as any[]).map(s => [s.id, s]));
    }
    return _skillsJsonMap;
}

function getSkillGroupBaseIds(representativeSkillId: number): Set<number> {
    const baseId = Math.floor(representativeSkillId / 10);
    const ids = new Set<number>([baseId]);
    if (baseId >= 10000 && baseId < 20000) ids.add(baseId + 80000);
    if (baseId >= 90000 && baseId < 100000) ids.add(baseId - 80000);
    return ids;
}

function matchesRepresentativeSkillGroup(candidateSkillId: number, representativeSkillId: number): boolean {
    const candidateBaseId = Math.floor(candidateSkillId / 10);
    return getSkillGroupBaseIds(representativeSkillId).has(candidateBaseId);
}

function isGuaranteedSkill(skillId: number): boolean {
    if (skillId >= 100000 && skillId < 200000) return true;
    const data = getSkillsJsonMap().get(skillId);
    return !!data?.condition_groups?.some((group: any) =>
        group.effects?.some((effect: any) => [1, 2, 3, 4, 5].includes(effect.type))
    );
}

function renderWinBreakdown(skill: SkillStats, horses: HorseEntry[]) {
    const baseId = Math.floor(skill.skillId / 10);
    // Inherited unique skills (9xxxxx) have baseIds offset by +80000 from their 1xxxxx counterparts
    const inheritedBaseId = (skill.skillId >= 100000 && skill.skillId < 200000) ? baseId + 80000 : null;

    type Cell = { apps: number; wins: number };
    const variantSet = new Set<number>();
    const byVariantStrat = new Map<string, Cell>();
    const byVariantAll = new Map<number, Cell>();
    const byStratAll = new Map<number, Cell>();
    let totalApps = 0, totalWins = 0;

    const bump = (map: Map<any, Cell>, key: any, won: boolean) => {
        if (!map.has(key)) map.set(key, { apps: 0, wins: 0 });
        const c = map.get(key)!;
        c.apps++;
        if (won) c.wins++;
    };

    for (const h of horses) {
        const won = h.finishOrder === 1;
        let activatedAny = false;
        for (const id of h.activatedSkillIds) {
            const idBase = Math.floor(id / 10);
            if (idBase !== baseId && idBase !== inheritedBaseId) continue;
            variantSet.add(id);
            bump(byVariantStrat, `${id}:${h.strategy}`, won);
            bump(byVariantAll, id, won);
            activatedAny = true;
        }
        if (activatedAny) {
            bump(byStratAll, h.strategy, won);
            totalApps++;
            if (won) totalWins++;
        }
    }

    if (variantSet.size === 0) return null;

    const variantIds = [...variantSet].sort();
    const showVariants = variantIds.length > 1;

    const fmtCell = (cell: Cell | undefined) => {
        if (!cell || cell.apps === 0) return { el: <span className="swb-empty">—</span>, title: undefined };
        return {
            el: <span className="swb-pct">{(cell.wins / cell.apps * 100).toFixed(1)}%</span>,
            title: `${cell.wins}W / ${cell.apps}`,
        };
    };

    const rows: { label: string; apps: number; isTotal: boolean; variantId: number | null }[] = [];
    if (showVariants) {
        for (const vid of variantIds) {
            const baseName = UMDatabaseWrapper.skills[vid]?.name ?? `#${vid}`;
            const label = (vid >= 900000 && vid < 1000000) ? `${baseName} (Inherit)` : baseName;
            const apps = byVariantAll.get(vid)?.apps ?? 0;
            rows.push({ label, apps, isTotal: false, variantId: vid });
        }
    }
    rows.push({ label: "All", apps: totalApps, isTotal: true, variantId: null });

    return (
        <div className="swb-container">
            <div className="swb-header">Win rates if skill activated</div>
            <table className="swb-table">
                <thead>
                    <tr>
                        <th className="swb-label-col" />
                        {STRATS.map(s => <th key={s} className="swb-strat-col">{STRAT_LABELS[s]}</th>)}
                        <th className="swb-total-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ label, apps, isTotal, variantId }) => (
                        <tr key={variantId ?? 'all'} className={isTotal ? 'swb-row--total' : ''}>
                            <td className="swb-label" title={`${label} (${apps} activations)`}>
                                {label}
                                <span className="swb-apps"> ({apps} activations)</span>
                            </td>
                            {STRATS.map(s => {
                                const cell = variantId !== null
                                    ? byVariantStrat.get(`${variantId}:${s}`)
                                    : byStratAll.get(s);
                                const { el, title } = fmtCell(cell);
                                return <td key={s} className="swb-cell" title={title}>{el}</td>;
                            })}
                            {(() => {
                                const cell = variantId !== null
                                    ? byVariantAll.get(variantId)
                                    : { apps: totalApps, wins: totalWins };
                                const { el, title } = fmtCell(cell);
                                return <td className="swb-cell swb-cell--all" title={title}>{el}</td>;
                            })()}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
type SortDir = "asc" | "desc";

const SkillAnalysis: React.FC<SkillAnalysisProps> = ({
    skillStats,
    skillActivations,
    avgRaceDistance,
    strategyStats,
    allHorses,
    ownCharas,
    precomputedBuckets,
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

                const learnedByHorses = filteredHorses.filter(h => {
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

                result.push({ ...skill, timesActivated, learnedByHorses, uniqueHorses, winRate });
            }

            return result;
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
    }, [skillStats, skillActivations, filteredHorses, selectedStrategy, selectedCharaFilter, ownCharaHorseKeys, minDist, maxDist]);

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
        setExpandedSkillId(prev => prev === skillId ? null : skillId);
    };

    const renderHeatmap = (skill: SkillStats) => {
        // Precomputed path
        if (precomputedBuckets) {
            const b = precomputedBuckets.get(skill.skillId);
            if (!b) return null;
            const buckets = selectedStrategy === "all"
                ? b.all
                : (b.byStrategy[String(selectedStrategy)] ?? b.all);
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
                    <td colSpan={6} style={{ padding: 0 }}>
                        <div className="inline-heatmap-container">
                            <div className="heatmap-track" style={{ height: "65px", position: "relative", display: "flex" }}>
                                {buckets.map((count, i) => {
                                    const pct = (count / totalActivations) * 100;
                                    const distStart = ((i / buckets.length) * avgRaceDistance).toFixed(0);
                                    const distEnd = (((i + 1) / buckets.length) * avgRaceDistance).toFixed(0);
                                    return (
                                        <div key={i} style={{ flex: 1, height: "100%", background: getBarColor(count), transition: "background 0.2s ease", cursor: count > 0 ? "help" : "default" }}
                                            title={count > 0 ? `${distStart}-${distEnd}m: ${count} activation${count > 1 ? 's' : ''} (${pct.toFixed(1)}%)` : undefined} />
                                    );
                                })}
                                <div style={{ position: "absolute", left: "16.67%", top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
                                <div style={{ position: "absolute", left: "66.67%", top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
                                <div style={{ position: "absolute", left: "83.33%", top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
                            </div>
                            <div className="inline-heatmap-legend">
                                <span style={{ position: "absolute", left: 0 }}>0m</span>
                                <span style={{ position: "absolute", left: "16.67%", transform: "translateX(-50%)" }}>Middle</span>
                                <span style={{ position: "absolute", left: "66.67%", transform: "translateX(-50%)" }}>Late</span>
                                <span style={{ position: "absolute", left: "83.33%", transform: "translateX(-50%)" }}>Spurt</span>
                                <span style={{ position: "absolute", right: 0 }}>{Math.round(avgRaceDistance)}m</span>
                            </div>
                            {renderWinBreakdown(skill, filteredHorses)}
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
                <td colSpan={7} style={{ padding: 0 }}>
                    <div className="inline-heatmap-container">
                        <div className="heatmap-track" style={{ height: "65px", position: "relative", display: "flex" }}>
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
                            <div style={{
                                position: "absolute",
                                left: "16.67%",
                                top: 0,
                                bottom: 0,
                                width: "1px",
                                background: "rgba(255,255,255,0.4)",
                                pointerEvents: "none",
                            }} />
                            <div style={{
                                position: "absolute",
                                left: "66.67%",
                                top: 0,
                                bottom: 0,
                                width: "1px",
                                background: "rgba(255,255,255,0.4)",
                                pointerEvents: "none",
                            }} />
                            <div style={{
                                position: "absolute",
                                left: "83.33%",
                                top: 0,
                                bottom: 0,
                                width: "1px",
                                background: "rgba(255,255,255,0.4)",
                                pointerEvents: "none",
                            }} />
                        </div>

                        <div className="inline-heatmap-legend">
                            <span style={{ position: "absolute", left: 0 }}>0m</span>
                            <span style={{ position: "absolute", left: "16.67%", transform: "translateX(-50%)" }}>Middle</span>
                            <span style={{ position: "absolute", left: "66.67%", transform: "translateX(-50%)" }}>Late</span>
                            <span style={{ position: "absolute", left: "83.33%", transform: "translateX(-50%)" }}>Spurt</span>
                            <span style={{ position: "absolute", right: 0 }}>{Math.round(avgRaceDistance)}m</span>
                        </div>

                        {renderWinBreakdown(skill, filteredHorses)}
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
                    className="skill-search-input"
                    style={{ width: "auto", marginLeft: "10px", paddingRight: "30px" }}
                    value={selectedStrategy}
                    onChange={e => setSelectedStrategy(e.target.value)}
                >
                    <option value="all">All Styles</option>
                    {strategyStats.map(s => (
                        <option key={s.strategy} value={s.strategy}>{s.strategyName}</option>
                    ))}
                </select>

                {!precomputedBuckets && (
                    <PortraitSelect
                        value={selectedCharaFilter}
                        defaultLabel="All Characters"
                        options={allCharaDropdownOptions}
                        onChange={setSelectedCharaFilter}
                    />
                )}

                {!precomputedBuckets && ownCharaDropdownOptions.length > 0 && (
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

                {!precomputedBuckets && (
                    <div style={{ display: "inline-flex", alignItems: "center", marginLeft: "10px" }}>
                        <input
                            type="number"
                            className="skill-search-input"
                            style={{ width: "110px", padding: "12px 10px" }}
                            placeholder="Min dist"
                            value={minDist}
                            onChange={e => setMinDist(e.target.value)}
                        />
                        <span style={{ color: "#718096", margin: "0 8px" }}>-</span>
                        <input
                            type="number"
                            className="skill-search-input"
                            style={{ width: "110px", padding: "12px 10px" }}
                            placeholder="Max dist"
                            value={maxDist}
                            onChange={e => setMaxDist(e.target.value)}
                        />
                    </div>
                )}
                <span style={{ color: "#718096", marginLeft: "15px", fontSize: "13px" }}>
                    {filteredSkills.length} of {skillsArray.length} skills
                </span>
            </div>

            <div className="analysis-table-container" style={{ maxHeight: "500px", overflowY: "auto" }}>
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
                            {!precomputedBuckets && (
                                <th className="sortable" onClick={() => handleSort("normalizedActivations")}>
                                    <OverlayTrigger
                                        placement="top"
                                        overlay={
                                            <Tooltip id="normalized-tooltip">
                                                Estimate for how often the skill's conditions are met with wit checks excluded.
                                            </Tooltip>
                                        }
                                    >
                                        <span style={{ borderBottom: "1px dotted #a0aec0", cursor: "help" }}>
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
                            <th style={{ width: "40px" }}></th>
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
                                                    <div key={i} style={{ lineHeight: "1.2", marginBottom: "2px" }}>
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
                                        <span style={{
                                            color: "#718096",
                                            marginLeft: "6px",
                                            fontSize: "12px"
                                        }}>
                                            ({activationPct.toFixed(1)}%)
                                        </span>
                                    </td>
                                    {!precomputedBuckets && (
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
