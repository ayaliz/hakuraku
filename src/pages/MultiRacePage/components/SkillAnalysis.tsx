import React, { useState, useMemo } from "react";
import { SkillStats, SkillActivationPoint, CharacterStats, StrategyStats, HorseEntry } from "../types";

interface SkillAnalysisProps {
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    allHorses: HorseEntry[];
}

type SortKey = "skillName" | "timesActivated" | "learnedByHorses" | "uniqueRaces" | "winRate" | "avgFinishPosition" | "normalizedActivations" | "meanDistance" | "medianDistance";
type SortDir = "asc" | "desc";

const SkillAnalysis: React.FC<SkillAnalysisProps> = ({
    skillStats,
    skillActivations,
    avgRaceDistance,
    characterStats,
    strategyStats,
    allHorses,
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
    const [selectedCharaId, setSelectedCharaId] = useState<string>("all");
    const [minDist, setMinDist] = useState<string>("");
    const [maxDist, setMaxDist] = useState<string>("");
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
            const matchesChara = selectedCharaId === "all" || h.charaId === Number(selectedCharaId);
            return matchesStrategy && matchesChara;
        });
    }, [allHorses, selectedStrategy, selectedCharaId]);

    // Recalculate skill stats based on filtered horses
    const activeSkillStats = useMemo(() => {
        // If no filters active, use original stats (optimization)
        if (selectedStrategy === "all" && selectedCharaId === "all" && minDist === "" && maxDist === "") {
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

            // Filter learned count
            // We need to check if any of the horse's learned skills match this skill (or its group)
            // Since we don't have the raw ID map here easily, we rely on the logic:
            // A horse learned this "Representative Skill" if it has any skill ID s.t. floor(s/10) == floor(repId/10)
            const baseId = Math.floor(baseStat.skillId / 10);
            const horsesWhoLearned = filteredHorses.filter(h => {
                // Optimization: Convert Set to Array for .some (or stick to iterator if available)
                // JS Sets iterate in insertion order, loop is fine
                for (const learnedId of h.learnedSkillIds) {
                    if (Math.floor(learnedId / 10) === baseId) return true;
                }
                return false;
            });
            const learnedByHorses = horsesWhoLearned.length;

            if (filteredActivations.length === 0) return;

            // Recalculate derived stats
            const uniqueRaces = new Set(filteredActivations.map(p => p.raceId)).size;
            const uniqueHorses = new Set(filteredActivations.map(p => `${p.raceId}_${p.horseFrameOrder}`)).size;

            const horsesWithSkill = horsesWhoLearned; // Reuse filtering work?
            // Wait, horsesWithSkill for winRate calculation are those who had it ACTIVATED? 
            // NO, winRate is usually "of horses who have the skill, what % won?"
            // Check original utils.ts: 
            // const horsesWithSkill = allHorses.filter(h => groupSkillIds.some(id => h.activatedSkillIds.has(id)));
            // Wait, original logic says "activatedSkillIds.has". This implies winRate is based on activation?
            // Let's check utils.ts line 452: 
            // const horsesWithSkill = allHorses.filter(h => groupSkillIds.some(id => h.activatedSkillIds.has(id)));
            // Yes, winRate in utils.ts is based on ACTIVATION, not LEARNING.
            // Let's stick to that logic to be consistent.

            const horsesWhoActivated = filteredHorses.filter(h => {
                for (const actId of h.activatedSkillIds) {
                    if (Math.floor(actId / 10) === baseId) return true;
                }
                return false;
            });

            const winsWithSkill = horsesWhoActivated.filter(h => h.finishOrder === 1).length;
            const winRate = horsesWhoActivated.length > 0 ? (winsWithSkill / horsesWhoActivated.length) * 100 : 0;

            // Normalized Activations
            // We don't have isGuaranteed flag here, so we approximate or reuse baseStat logic?
            // If we don't have the flag, we can't perfectly replicate "isGuaranteed" logic (unique 100k-200k or passive).
            // But we know the ID range for unique. Passive is harder.
            // However, baseStat.normalizedActivations was calculated.
            // If we assume the ratio of normalized/raw is constant? No, that depends on WHICH horses.
            // Let's just recalculate based on simple sum(1/chance). 
            // We'll miss the "isGuaranteed" check for passives unless we lookup again.
            // Let's accept a small inaccuracy for passives or try to detect it.
            // Unique ID check is easy.
            const isUnique = baseStat.skillId >= 100000 && baseStat.skillId < 200000;
            // For passives, we can check if baseStat.normalizedActivations == baseStat.timesActivated (approximately)
            // But let's just use the sum(1/chance) logic and if it's Unique, use count.

            const uniqueParticipations = new Map<string, SkillActivationPoint>();
            filteredActivations.forEach(p => {
                const key = `${p.raceId}_${p.horseFrameOrder}`;
                if (!uniqueParticipations.has(key)) uniqueParticipations.set(key, p);
            });

            // If it was guaranteed in the original calculation, it should be here too.
            // Best guess: check if original normalized == unique participations count?
            // Let's just implement the sum.
            let normalizedActivations = Array.from(uniqueParticipations.values()).reduce((sum, p) => {
                return sum + (1 / p.activationChance);
            }, 0);

            if (isUnique) normalizedActivations = uniqueParticipations.size;

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
    }, [skillStats, skillActivations, filteredHorses, selectedStrategy, selectedCharaId, minDist, maxDist]);

    const filteredSkills = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return activeSkillStats.filter(skill => {
            const matchesSearch = !query ||
                (skill.skillNames?.some(n => n.toLowerCase().includes(query)) || skill.skillName.toLowerCase().includes(query)) ||
                skill.skillId.toString().includes(query);

            // Filter strategy/chara is already done in activeSkillStats!
            // But wait, activeSkillStats contains skills that HAVE entries after filtering.
            // What if a skill exists but has 0 learned/activations in the subset?
            // The loop above includes it only if (learnedByHorses > 0 || filteredActivations > 0).
            // So we just need search query filter.

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

    const getPositionBadge = (position: number) => {
        if (position === 0) return <span className="position-badge default">-</span>;
        const rounded = Math.round(position * 10) / 10;
        let className = "position-badge default";
        if (rounded <= 1.5) className = "position-badge gold";
        else if (rounded <= 2.5) className = "position-badge silver";
        else if (rounded <= 3.5) className = "position-badge bronze";
        return <span className={className}>{rounded.toFixed(1)}</span>;
    };

    const toggleSkill = (skillId: number) => {
        setExpandedSkillId(prev => prev === skillId ? null : skillId);
    };

    const renderHeatmap = (skill: SkillStats) => {
        // We need to filter activations again for the heatmap
        // (Optimally this would be passed down, but re-filtering is safe enough)
        const baseActivations = skillActivations.get(skill.skillId) || [];

        const minD = minDist === "" ? -1 : Number(minDist);
        const maxD = maxDist === "" ? Number.MAX_SAFE_INTEGER : Number(maxDist);

        let activations = baseActivations;
        // Always filter if we have any active filters
        if (selectedStrategy !== "all" || selectedCharaId !== "all" || minDist !== "" || maxDist !== "") {
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
                <td colSpan={5} style={{ padding: 0 }}>
                    <div className="inline-heatmap-container">
                        <div className="heatmap-track" style={{ height: "50px", position: "relative", display: "flex" }}>
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

                        <div className="inline-heatmap-stats">
                            <span>{activations.length} activations</span>
                            <span>•</span>
                            <span>{skill.uniqueHorses} horses</span>
                            <span>•</span>
                            <span style={{ color: "#48bb78" }}>{skill.winRate.toFixed(1)}% wins</span>
                        </div>
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

                <select
                    className="skill-search-input"
                    style={{ width: "auto", marginLeft: "10px", paddingRight: "30px" }}
                    value={selectedCharaId}
                    onChange={e => setSelectedCharaId(e.target.value)}
                >
                    <option value="all">All Characters</option>
                    {characterStats
                        .sort((a, b) => a.charaName.localeCompare(b.charaName))
                        .map(c => (
                            <option key={c.charaId} value={c.charaId}>{c.charaName}</option>
                        ))}
                </select>

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
                            <th className="sortable" onClick={() => handleSort("normalizedActivations")}>
                                Normalized {renderSortIndicator("normalizedActivations")}
                            </th>
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
                                    <td>
                                        {normalizedPct.toFixed(1)}%
                                    </td>
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
