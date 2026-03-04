import React, { useState, useMemo } from "react";
import type { TeamCompositionStats, HorseEntry, SkillStats } from "../MultiRacePage/types";
import AssetLoader from "../../data/AssetLoader";
import { STRATEGY_COLORS, STRATEGY_NAMES, BAYES_TEAM } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import "./UmaLogsPage.css";

const MIN_APPEARANCES = 5;
const MAX_ITEMS = 10;
const BAYES_PRIOR = 1 / 3;

interface TeamCompositionPanelProps {
    teamStats: TeamCompositionStats[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
}

const TeamCompositionPanel: React.FC<TeamCompositionPanelProps> = ({ teamStats, allHorses, skillStats }) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedTeamInstanceKey, setSelectedTeamInstanceKey] = useState<string | null>(null);

    const teamInstancesByCompositionKey = useMemo(() => {
        type TeamInstance = {
            instanceKey: string;
            horses: HorseEntry[];
            appearances: number;
            wins: number;
            memberWins: number[];
        };
        const bayesTeamWR = (wins: number, appearances: number) =>
            (wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (appearances + BAYES_TEAM.K);

        const compMap = new Map<string, Map<string, TeamInstance>>();
        if (!allHorses) return new Map<string, TeamInstance[]>();

        const raceMap = new Map<string, HorseEntry[]>();
        for (const h of allHorses) {
            if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, []);
            raceMap.get(h.raceId)!.push(h);
        }

        for (const horses of raceMap.values()) {
            const teamMap = new Map<number, HorseEntry[]>();
            for (const h of horses) {
                if (h.teamId === 0) continue;
                if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, []);
                teamMap.get(h.teamId)!.push(h);
            }

            const winningTeamId = horses.find(h => h.finishOrder === 1)?.teamId ?? 0;

            for (const team of teamMap.values()) {
                if (team.length !== 3) continue;
                const sorted = [...team].sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));
                const compKey = sorted.map(h => `${h.cardId}_${h.strategy}`).join("__");
                const instanceKey = sorted
                    .map(h => `${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}_${h.rankScore}`)
                    .join("__");

                const teamId = sorted[0]?.teamId ?? 0;
                const teamWon = teamId > 0 && teamId === winningTeamId;
                const firstPlaceHorse = teamWon ? sorted.find(h => h.finishOrder === 1) ?? null : null;

                if (!compMap.has(compKey)) compMap.set(compKey, new Map());
                const byFingerprint = compMap.get(compKey)!;
                if (!byFingerprint.has(instanceKey)) {
                    byFingerprint.set(instanceKey, {
                        instanceKey,
                        horses: sorted,
                        appearances: 0,
                        wins: 0,
                        memberWins: new Array(sorted.length).fill(0),
                    });
                }

                const inst = byFingerprint.get(instanceKey)!;
                inst.appearances++;
                if (teamWon) {
                    inst.wins++;
                    if (firstPlaceHorse) {
                        const idx = inst.horses.findIndex(h => h.cardId === firstPlaceHorse.cardId && h.strategy === firstPlaceHorse.strategy);
                        if (idx >= 0) inst.memberWins[idx]++;
                    }
                }
            }
        }

        const out: Map<string, TeamInstance[]> = new Map();
        for (const [compKey, byFingerprint] of compMap) {
            const instances = Array.from(byFingerprint.values());
            instances.sort((a, b) => {
                const aBayes = bayesTeamWR(a.wins, a.appearances);
                const bBayes = bayesTeamWR(b.wins, b.appearances);
                if (bBayes !== aBayes) return bBayes - aBayes;
                if (b.appearances !== a.appearances) return b.appearances - a.appearances;
                const aBest = Math.max(...a.horses.map(h => h.rankScore ?? 0), 0);
                const bBest = Math.max(...b.horses.map(h => h.rankScore ?? 0), 0);
                if (bBest !== aBest) return bBest - aBest;
                return a.instanceKey.localeCompare(b.instanceKey);
            });
            out.set(compKey, instances);
        }

        return out;
    }, [allHorses]);

    const canExpand = !!(allHorses && skillStats);

    const eligible = teamStats.filter(t => t.appearances >= MIN_APPEARANCES);
    if (eligible.length === 0) return null;

    const sorted = [...eligible].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    const overperformers = sorted.filter(t => t.bayesianWinRate > BAYES_PRIOR).slice(0, MAX_ITEMS);
    const underperformers = sorted.filter(t => t.bayesianWinRate < BAYES_PRIOR && t.wins > 0).slice(-MAX_ITEMS).reverse();

    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const renderComposition = (t: TeamCompositionStats, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const key = t.members.map(m => `${m.cardId}_${m.strategy}`).join('__');
        const isSelected = selectedKey === key;
        const instances = canExpand ? (teamInstancesByCompositionKey.get(key) ?? []) : [];
        const selectedInstance = isSelected
            ? (instances.find(i => i.instanceKey === selectedTeamInstanceKey) ?? instances[0] ?? null)
            : null;

        const getInstanceLabel = (inst: { horses: HorseEntry[]; appearances: number; memberWins: number[] }) => {
            const n = inst.appearances;
            const parts = inst.horses.map((h, i) => {
                const pct = n > 0 ? ((inst.memberWins[i] ?? 0) / n) * 100 : 0;
                return `${h.charaName} ${pct.toFixed(0)}%`;
            });
            return `${parts.join(" · ")} (${n} samples)`;
        };
        return (
            <React.Fragment key={key}>
                <div
                    className={`tcp-row${canExpand ? " sa-stcp-item--clickable" : ""}${isSelected ? " ca-row--selected" : ""}`}
                    onClick={canExpand ? () => {
                        setSelectedKey(k => {
                            const next = k === key ? null : key;
                            if (next === key) {
                                const first = (teamInstancesByCompositionKey.get(key) ?? [])[0]?.instanceKey ?? null;
                                setSelectedTeamInstanceKey(first);
                            } else {
                                setSelectedTeamInstanceKey(null);
                            }
                            return next;
                        });
                    } : undefined}
                >
                    <div className="tcp-icons">
                        {t.members.map((m, i) => {
                            const src = AssetLoader.getCharaThumb(m.cardId);
                            const stratColor = STRATEGY_COLORS[m.strategy] ?? "#718096";
                            const label = `${m.charaName} (${STRATEGY_NAMES[m.strategy] ?? m.strategy})`;
                            return (
                                <div
                                    key={i}
                                    title={label}
                                    className="tcp-portrait"
                                    style={{ border: `2px solid ${stratColor}` }}
                                >
                                    {src && (
                                        <img
                                            src={src}
                                            alt={label}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="tcp-names">
                        {t.members.map((m, i) => {
                            const memberWins = t.memberWins ?? [];
                            const pct = t.appearances > 0 ? Math.round((memberWins[i] ?? 0) / t.appearances * 100) : 0;
                            return `${m.charaName} (${pct}%)`;
                        }).join(" · ")}
                    </div>
                    <div className="tcp-stats">
                        <span className="tcp-adj-pct" style={{ color: valueColor }}>{(t.bayesianWinRate * 100).toFixed(0)}%</span>
                        <span className="tcp-pipe"> | </span>
                        <span className="tcp-raw-pct">{(t.winRate * 100).toFixed(0)}% ({t.appearances})</span>
                    </div>
                </div>
                {isSelected && canExpand && (
                    <div className="tcp-member-drilldown">
                        {instances.length > 1 && (
                            <div className="tcp-rep-team-select">
                                <select
                                    value={selectedInstance?.instanceKey ?? ""}
                                    onChange={(e) => setSelectedTeamInstanceKey(e.target.value)}
                                >
                                    {instances.map(inst => (
                                        <option key={inst.instanceKey} value={inst.instanceKey}>{getInstanceLabel(inst)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="stcp-team-members-row">
                            {(selectedInstance?.horses ?? []).map((horse, i) => (
                                <TeamMemberCard key={i} horse={horse} skillStats={skillStats!} />
                            ))}
                        </div>
                    </div>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="skill-analysis-section">
            <h4 className="section-heading">Team Composition Performance</h4>
            <div className="tcp-container">
                {overperformers.length > 0 && (
                    <div className="tcp-group">
                        <div className="tcp-group-label tcp-group-label--over">Overperformers<span className="tcp-meta"><span className="tcp-meta-adj tcp-meta-adj--over">Adj. win%</span><span className="tcp-meta-raw"> | Raw win% (samples)</span></span></div>
                        {overperformers.map(t => renderComposition(t, true))}
                    </div>
                )}
                {underperformers.length > 0 && (
                    <div className="tcp-group">
                        <div className="tcp-group-label tcp-group-label--under">Underperformers<span className="tcp-meta"><span className="tcp-meta-adj tcp-meta-adj--under">Adj. win%</span><span className="tcp-meta-raw"> | Raw win% (samples)</span></span></div>
                        {underperformers.map(t => renderComposition(t, false))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamCompositionPanel;
