import React, { useState, useEffect } from "react";
import type { TeamCompositionStats, HorseEntry, SkillStats } from "../MultiRacePage/types";
import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/TeamMemberCard";
import "./UmaLogsPage.css";

const MIN_APPEARANCES = 5;
const MAX_ITEMS = 10;
const BAYES_PRIOR = 1 / 3;

interface TeamCompositionPanelProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    teamStats: TeamCompositionStats[];
    skillStats?: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
}

type SerializedHorseEntry = Omit<HorseEntry, "activatedSkillIds" | "learnedSkillIds" | "trainerName" | "raceDistance" | "isPlayer" | "charaName"> & {
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
};

type CompositionRepResponse = {
    cmId: string;
    courseId: number;
    compositionKey: string;
    horses: SerializedHorseEntry[];
};

function deserializeHorseEntry(entry: SerializedHorseEntry): HorseEntry {
    return {
        ...entry,
        charaName: UMDatabaseWrapper.charas[entry.charaId]?.name ?? `Unknown (${entry.charaId})`,
        trainerName: "",
        raceDistance: 0,
        isPlayer: false,
        activatedSkillIds: new Set(entry.activatedSkillIds),
        learnedSkillIds: new Set(entry.learnedSkillIds),
        supportCardIds: entry.supportCardIds ?? [],
        supportCardLimitBreaks: entry.supportCardLimitBreaks ?? [],
    };
}

function deserializeHorseEntries(entries: SerializedHorseEntry[] | undefined): HorseEntry[] {
    return (entries ?? []).map(deserializeHorseEntry);
}

function buildCompositionRepsUrl(cmId: string, courseId: number, compositionKey: string, apiBase = ""): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/composition-reps/${encodeURIComponent(compositionKey)}`;
}

const TeamCompositionPanel: React.FC<TeamCompositionPanelProps> = ({ cmId, courseId, apiBase, apiMode, teamStats, skillStats, strategyColors }) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [compositionRepCache, setCompositionRepCache] = useState<Record<string, HorseEntry[]>>({});
    const [compositionRepLoadingKeys, setCompositionRepLoadingKeys] = useState<string[]>([]);
    const [compositionRepError, setCompositionRepError] = useState<string | null>(null);

    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canExpand = !!(skillStats && canUseApiDrilldown);

    useEffect(() => {
        if (!canUseApiDrilldown || !selectedKey || !cmId || !courseId) return;
        if (compositionRepCache[selectedKey] || compositionRepLoadingKeys.includes(selectedKey)) return;
        const controller = new AbortController();
        setCompositionRepLoadingKeys((keys) => [...keys, selectedKey]);
        setCompositionRepError(null);
        fetch(buildCompositionRepsUrl(cmId, courseId, selectedKey, apiBase ?? ""), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load representative team (${response.status})`);
                return await response.json() as CompositionRepResponse;
            })
            .then((payload) => {
                setCompositionRepCache((cache) => ({
                    ...cache,
                    [payload.compositionKey]: deserializeHorseEntries(payload.horses),
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load team composition representatives", { selectedKey, error });
                setCompositionRepError(error instanceof Error ? error.message : "Failed to load representative team.");
                setCompositionRepCache((cache) => ({ ...cache, [selectedKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setCompositionRepLoadingKeys((keys) => keys.filter((key) => key !== selectedKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, compositionRepCache, compositionRepLoadingKeys, courseId, selectedKey]);

    const eligible = teamStats.filter(t => t.appearances >= MIN_APPEARANCES);
    if (eligible.length === 0) return null;

    const sorted = [...eligible].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    const overperformers = sorted.filter(t => t.bayesianWinRate > BAYES_PRIOR).slice(0, MAX_ITEMS);
    const underperformers = sorted.filter(t => t.bayesianWinRate < BAYES_PRIOR && t.wins > 0).slice(-MAX_ITEMS).reverse();

    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const renderComposition = (t: TeamCompositionStats, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const key = t.members
            .slice()
            .sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy))
            .map(m => `${m.cardId}_${m.strategy}`)
            .join('__');
        const isSelected = selectedKey === key;
        return (
            <React.Fragment key={key}>
                <div
                    className={`tcp-row${canExpand ? " sa-stcp-item--clickable" : ""}${isSelected ? " ca-row--selected" : ""}`}
                    onClick={canExpand ? () => {
                        setSelectedKey(k => {
                            return k === key ? null : key;
                        });
                    } : undefined}
                >
                    <div className="tcp-icons">
                        {t.members.map((m, i) => {
                            const src = AssetLoader.getCharaThumb(m.cardId);
                            const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
                            const stratColor = activeStrategyColors[m.strategy] ?? "#718096";
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
                        {canUseApiDrilldown && compositionRepLoadingKeys.includes(key) && (
                            <div className="sa-no-data">Loading representative team samples...</div>
                        )}
                        {canUseApiDrilldown && !compositionRepLoadingKeys.includes(key) && (compositionRepCache[key]?.length ?? 0) === 0 && compositionRepError && (
                            <div className="sa-no-data">{compositionRepError}</div>
                        )}
                        <div className="stcp-team-members-row">
                            {(compositionRepCache[key] ?? []).map((horse, i) => (
                                <TeamMemberCard key={i} horse={horse} skillStats={skillStats!} strategyColors={strategyColors} />
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
