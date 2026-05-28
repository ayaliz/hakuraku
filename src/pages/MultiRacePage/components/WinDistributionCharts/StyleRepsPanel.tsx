import React, { useMemo, useState } from "react";
import { STRATEGY_NAMES, POP_FILTER_OPTIONS, BAYES_TEAM } from "./constants";
import type { HorseEntry, SkillStats } from "../../types";
import type { CharacterTeamRateRow } from "../../../UmaLogsPage/panelData";
import AssetLoader from "../../../../data/AssetLoader";
import InfoTooltip from "./InfoTooltip";
import { type TeamSampleSelectOption } from "./TeamSampleSelect";
import { TeamMemberCard } from "./TeamMemberCard";
import {
    type SerializedHorseEntry,
    deserializeHorseEntry,
    REPRESENTATIVE_STRATEGY_IDS,
} from "./shared";

export type StyleRepEntry = {
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
    teamWins?: number;
    teamAppearances?: number;
    teamWinRate?: number;
    teamBayesianWinRate?: number;
};

type StyleRepSelection = {
    cardId: number;
    strategy: number;
    charaName: string;
};

type StyleRepDrilldownEntry = {
    horse: HorseEntry;
    teamHorses?: HorseEntry[];
    teamOptions?: Array<TeamSampleSelectOption & { teamHorses: HorseEntry[] }>;
    bayesianWinRate: number;
    winRate: number;
    appearances: number;
};

type StyleRepDrilldownResponse = {
    cmId: string;
    courseId: number;
    strategy: number;
    cardId: number;
    samples: Array<{
        horse: SerializedHorseEntry;
        teamHorses: SerializedHorseEntry[];
        teamOptions: Array<TeamSampleSelectOption & { teamHorses: SerializedHorseEntry[] }>;
        bayesianWinRate: number;
        winRate: number;
        appearances: number;
    }>;
};

export function StyleRepsPanel({ cmId, courseId, apiBase, apiMode, styleReps, characterTeamRates, skillStats, strategyColors, onViewReplays }: {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    styleReps: Record<number, StyleRepEntry[]>;
    characterTeamRates?: CharacterTeamRateRow[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
}) {
    const [selected, setSelected] = useState<StyleRepSelection | null>(null);
    const [selectedInModal, setSelectedInModal] = useState<StyleRepSelection | null>(null);
    const [fullDataOpen, setFullDataOpen] = useState(false);
    const [minPopPct, setMinPopPct] = useState<0 | 0.5 | 1 | 2>(1);
    const [rankingMode, setRankingMode] = useState<"bayes" | "team">("bayes");
    const [drilldownCache, setDrilldownCache] = useState<Record<string, StyleRepDrilldownEntry[]>>({});
    const [drilldownLoadingKeys, setDrilldownLoadingKeys] = useState<string[]>([]);
    const [drilldownError, setDrilldownError] = useState<string | null>(null);
    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canDrilldown = !!skillStats && canUseApiDrilldown;
    const rankingOptions = [
        { value: "bayes" as const, label: "By individual win rate" },
        { value: "team" as const, label: "By team win rate" },
    ];

    const makeSelectionKey = (selection: StyleRepSelection | null) =>
        selection ? `${selection.strategy}_${selection.cardId}` : null;

    const ensureApiDrilldown = async (selection: StyleRepSelection | null) => {
        const selectionKey = makeSelectionKey(selection);
        if (!selection || !selectionKey || !canUseApiDrilldown) return;
        if (drilldownCache[selectionKey] || drilldownLoadingKeys.includes(selectionKey)) return;

        setDrilldownLoadingKeys((prev) => [...prev, selectionKey]);
        setDrilldownError(null);
        try {
            const response = await fetch(
                `${apiBase ?? ""}/api/umalogs/${encodeURIComponent(cmId!)}/groups/${courseId}/style-reps/${selection.strategy}/${selection.cardId}`,
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - representative samples not found`);
            }
            const payload = await response.json() as StyleRepDrilldownResponse;
            setDrilldownCache((prev) => ({
                ...prev,
                [selectionKey]: payload.samples.map((sample) => ({
                    horse: deserializeHorseEntry(sample.horse),
                    teamHorses: sample.teamHorses.map(deserializeHorseEntry),
                    teamOptions: sample.teamOptions.map((option) => ({
                        ...option,
                        teamHorses: option.teamHorses.map(deserializeHorseEntry),
                    })),
                    bayesianWinRate: sample.bayesianWinRate,
                    winRate: sample.winRate,
                    appearances: sample.appearances,
                })),
            }));
        } catch (err) {
            setDrilldownError(err instanceof Error ? err.message : "Failed to load representative samples");
        } finally {
            setDrilldownLoadingKeys((prev) => prev.filter((key) => key !== selectionKey));
        }
    };

    const drilldownHorses = useMemo(() => {
        const selectionKey = makeSelectionKey(selected);
        return selectionKey ? (drilldownCache[selectionKey] ?? []) : [];
    }, [selected, drilldownCache]);
    const drilldownHorsesInModal = useMemo(() => {
        const selectionKey = makeSelectionKey(selectedInModal);
        return selectionKey ? (drilldownCache[selectionKey] ?? []) : [];
    }, [selectedInModal, drilldownCache]);

    const teamRateByRepKey = useMemo(() => {
        const map = new Map<string, CharacterTeamRateRow>();
        for (const row of characterTeamRates ?? []) {
            map.set(`${row.strategy}_${row.cardId}`, row);
        }
        return map;
    }, [characterTeamRates]);

    const entriesByStrategy = useMemo(() => (
        Object.fromEntries(
            REPRESENTATIVE_STRATEGY_IDS.map((sId) => [
                sId,
                [...(styleReps[sId] ?? [])]
                    .map((entry) => {
                        const teamRate = teamRateByRepKey.get(`${sId}_${entry.cardId}`);
                        const teamAppearances = entry.teamAppearances ?? teamRate?.appearances ?? 0;
                        const teamWins = entry.teamWins ?? teamRate?.wins ?? 0;
                        return {
                            ...entry,
                            teamWins,
                            teamAppearances,
                            teamWinRate: entry.teamWinRate ?? (teamAppearances > 0 ? teamWins / teamAppearances : 0),
                            teamBayesianWinRate: entry.teamBayesianWinRate
                                ?? ((teamWins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (teamAppearances + BAYES_TEAM.K)),
                        };
                    })
                    .filter(entry => entry.popPct >= minPopPct)
                    .sort((a, b) => {
                        if (rankingMode === "team") {
                            return ((b.teamBayesianWinRate ?? 0) - (a.teamBayesianWinRate ?? 0))
                                || ((b.teamWinRate ?? 0) - (a.teamWinRate ?? 0))
                                || ((b.teamAppearances ?? 0) - (a.teamAppearances ?? 0));
                        }
                        return (b.bayesianWinRate - a.bayesianWinRate)
                            || (b.winRate - a.winRate)
                            || (b.appearances - a.appearances);
                    }),
            ])
        ) as Record<number, StyleRepEntry[]>
    ), [styleReps, teamRateByRepKey, minPopPct, rankingMode]);

    const totalVisibleEntries = REPRESENTATIVE_STRATEGY_IDS.reduce(
        (sum, sId) => sum + (entriesByStrategy[sId]?.length ?? 0),
        0
    );

    const renderEntry = (
        entry: StyleRepEntry,
        sId: number,
        selection: StyleRepSelection | null,
        setSelection: React.Dispatch<React.SetStateAction<StyleRepSelection | null>>,
    ) => {
        const src = AssetLoader.getCharaThumb(entry.cardId);
        const color = strategyColors[sId];
        const isSelected = selection?.cardId === entry.cardId && selection?.strategy === sId;
        return (
            <div
                key={entry.cardId}
                className={`sa-reps-entry${canDrilldown ? " sa-stcp-item--clickable" : ""}${isSelected ? " sa-reps-entry--selected" : ""}`}
                onClick={canDrilldown ? () => {
                    const nextSelection = isSelected ? null : { cardId: entry.cardId, strategy: sId, charaName: entry.charaName };
                    setSelection(nextSelection);
                    if (nextSelection) {
                        void ensureApiDrilldown(nextSelection);
                    }
                } : undefined}
            >
                <div className="sa-reps-portrait" style={{ border: `1px solid ${color}` }}>
                    {src && (
                        <img
                            src={src}
                            alt={entry.charaName}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    )}
                </div>
                <span className="sa-reps-name" title={entry.charaName}>{entry.charaName}</span>
                <div className={`sa-reps-stats sa-reps-stats--${rankingMode === "team" ? "team" : "bayes"}`}>
                    {rankingMode === "team" ? (
                        <>
                            <span
                                className="sa-adj-pct sa-reps-stat"
                                title={`Adjusted win rate for teams featuring this character: ${((entry.teamBayesianWinRate ?? 0) * 100).toFixed(1)}%, raw ${((entry.teamWinRate ?? 0) * 100).toFixed(1)}%, wins ${entry.teamWins ?? 0}, appearances ${entry.teamAppearances ?? 0}`}
                            >
                                {((entry.teamBayesianWinRate ?? 0) * 100).toFixed(1)}%
                            </span>
                            <span
                                className="sa-raw-pct sa-reps-stat"
                                title={`Raw win rate for teams featuring this character: ${((entry.teamWinRate ?? 0) * 100).toFixed(1)}% across ${entry.teamAppearances ?? 0} samples`}
                            >
                                {((entry.teamWinRate ?? 0) * 100).toFixed(1)}% ({entry.teamAppearances ?? 0})
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="sa-adj-pct sa-reps-stat">{(entry.bayesianWinRate * 100).toFixed(1)}%</span>
                            <span className="sa-raw-pct sa-reps-stat">{(entry.winRate * 100).toFixed(1)}% ({entry.appearances})</span>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const renderColumns = (
        mode: "top" | "full",
        selection: StyleRepSelection | null,
        setSelection: React.Dispatch<React.SetStateAction<StyleRepSelection | null>>,
    ) => (
        <div className={`sa-reps-columns${mode === "full" ? " sa-reps-columns--full" : ""}`}>
            {REPRESENTATIVE_STRATEGY_IDS.map(sId => {
                const entries = mode === "full"
                    ? entriesByStrategy[sId] ?? []
                    : (entriesByStrategy[sId] ?? []).slice(0, 5);
                const color = strategyColors[sId];
                return (
                    <div key={sId} className="sa-reps-col">
                        <div className="sa-reps-col-header" style={{ color }}>
                            {STRATEGY_NAMES[sId].split(" ")[0].toUpperCase()}
                            <span className={`sa-stats-meta sa-stats-meta--${rankingMode === "team" ? "team" : "bayes"}`}>
                                {rankingMode === "team" ? (
                                    <>
                                        <span className="sa-meta-adj sa-meta-adj--neutral">Adj. win%</span>
                                        <span className="sa-meta-raw">Raw win% (samples)</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="sa-meta-adj sa-meta-adj--neutral">Adj. win%</span>
                                        <span className="sa-meta-raw">Raw win% (samples)</span>
                                    </>
                                )}
                            </span>
                        </div>
                        {entries.length === 0 ? (
                            <span className="sa-no-data">No representatives at this pop cutoff.</span>
                        ) : entries.map(entry => renderEntry(entry, sId, selection, setSelection))}
                    </div>
                );
            })}
        </div>
    );

    const renderDrilldown = (
        selection: StyleRepSelection | null,
        drilldownEntries: StyleRepDrilldownEntry[],
    ) => {
        if (!selection || !skillStats) return null;
        const selectionKey = makeSelectionKey(selection);
        const isLoading = !!selectionKey && drilldownLoadingKeys.includes(selectionKey);
        if (isLoading) {
            return (
                <div className="stcp-drilldown">
                    <div className="stcp-drilldown-header">
                        <div className="stcp-drilldown-title">
                            Top performers for {selection.charaName} ({STRATEGY_NAMES[selection.strategy]})
                        </div>
                    </div>
                    <div className="sa-no-data">Loading representative samples...</div>
                </div>
            );
        }
        if (drilldownEntries.length === 0) {
            return (
                <div className="stcp-drilldown">
                    <div className="stcp-drilldown-header">
                        <div className="stcp-drilldown-title">
                            Top performers for {selection.charaName} ({STRATEGY_NAMES[selection.strategy]})
                        </div>
                    </div>
                    <div className="sa-no-data">
                        {drilldownError ?? "No representative samples available."}
                    </div>
                </div>
            );
        }
        return (
            <div className="stcp-drilldown">
                <div className="stcp-drilldown-header">
                    <div className="stcp-drilldown-title">
                        Top performers for {selection.charaName} ({STRATEGY_NAMES[selection.strategy]})
                    </div>
                    <div className="stcp-drilldown-subtitle">
                        Unique umas ranked by Bayesian-adjusted win rate across all appearances.
                    </div>
                </div>
                <div className="stcp-team-members-row">
                    {drilldownEntries.map(({ horse, teamHorses, teamOptions, bayesianWinRate, winRate, appearances }, i) => (
                        <div key={i} className="sa-reps-drilldown-card">
                            <div className="sa-reps-drilldown-winrate">
                                <span className="sa-adj-pct">{(bayesianWinRate * 100).toFixed(0)}%</span>
                                <span className="sa-pipe"> | </span>
                                <span className="sa-raw-pct">{(winRate * 100).toFixed(0)}% ({appearances})</span>
                            </div>
                            <TeamMemberCard
                                horse={horse}
                                skillStats={skillStats}
                                strategyColors={strategyColors}
                                teamHorses={teamHorses}
                                teamOptions={teamOptions}
                                onViewReplays={onViewReplays}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderRankingModeToggle = () => (
        <div className="histogram-toggle uma-gate-toggle sa-toggle-row">
            {rankingOptions.map((opt) => (
                <button
                    key={opt.value}
                    className={`histogram-toggle-btn uma-gate-toggle-btn${rankingMode === opt.value ? " active" : ""}`}
                    onClick={() => setRankingMode(opt.value)}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );

    const renderPopToggle = () => (
        <div className="histogram-toggle uma-gate-toggle sa-toggle-row">
            {POP_FILTER_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    className={`histogram-toggle-btn uma-gate-toggle-btn${minPopPct === opt.value ? " active" : ""}`}
                    onClick={() => setMinPopPct(opt.value as 0 | 0.5 | 1 | 2)}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );

    const renderPanelBody = (
        mode: "top" | "full",
        selection: StyleRepSelection | null,
        setSelection: React.Dispatch<React.SetStateAction<StyleRepSelection | null>>,
        drilldownEntries: StyleRepDrilldownEntry[],
    ) => (
        <>
            {mode === "full" && (
                <>
                    {renderRankingModeToggle()}
                    {renderPopToggle()}
                </>
            )}
            {renderColumns(mode, selection, setSelection)}
            {renderDrilldown(selection, drilldownEntries)}
        </>
    );

    return (
        <div className="sa-reps-panel">
            <div className="sa-panel-header">
                Style Representatives
                <InfoTooltip
                    id="style-representatives-info"
                    tip={
                        rankingMode === "bayes"
                            ? "Top 5 performers per style using the current Bayesian-adjusted win rate."
                            : "Top 5 performers per style ranked by adjusted win rate across teams featuring that character. Raw team win rate and adjusted team win rate are shown side by side."
                    }
                />
            </div>
            {renderRankingModeToggle()}
            {renderPopToggle()}
            {renderPanelBody("top", selected, setSelected, drilldownHorses)}
            {totalVisibleEntries > 0 && (
                <div className="sa-reps-actions">
                    <button className="sa-reps-view-all-btn" onClick={() => setFullDataOpen(true)}>
                        View full data
                    </button>
                </div>
            )}
            {fullDataOpen && (
                <div className="cdt-overlay" onClick={() => setFullDataOpen(false)}>
                    <div className="cdt-modal sa-reps-full-data-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Style Representatives</h3>
                            <button className="cdt-close-btn" onClick={() => setFullDataOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            {renderPanelBody("full", selectedInModal, setSelectedInModal, drilldownHorsesInModal)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
