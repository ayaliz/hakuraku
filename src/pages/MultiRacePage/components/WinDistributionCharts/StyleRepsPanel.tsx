import React, { useMemo, useState } from "react";
import { STRATEGY_NAMES, POP_FILTER_OPTIONS, BAYES_TEAM, BAYES_UMA } from "./constants";
import type { HorseEntry, SkillStats } from "../../types";
import type { CharacterTeamRateRow } from "../../../UmaLogsPage/panelData";
import AssetLoader from "../../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import InfoTooltip from "./InfoTooltip";
import { REPRESENTATIVE_STRATEGY_IDS } from "./shared";
import {
    RepresentativeDrilldown,
    buildStyleRepresentativeUrl,
    deserializeRepresentativeEntries,
    type RepresentativeDrilldownEntry,
    type StyleRepresentativeResponse,
} from "./RepresentativeDrilldown";

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

type StyleRepMetricMode = "team" | "personal";

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
    const [metricMode, setMetricMode] = useState<StyleRepMetricMode>("team");
    const [drilldownCache, setDrilldownCache] = useState<Record<string, RepresentativeDrilldownEntry[]>>({});
    const [teamDrilldownCache, setTeamDrilldownCache] = useState<Record<string, RepresentativeDrilldownEntry[]>>({});
    const [drilldownLoadingKeys, setDrilldownLoadingKeys] = useState<string[]>([]);
    const [drilldownError, setDrilldownError] = useState<string | null>(null);
    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canDrilldown = !!skillStats && canUseApiDrilldown;

    const makeSelectionKey = (selection: StyleRepSelection | null) =>
        selection ? `${selection.strategy}_${selection.cardId}` : null;

    const ensureApiDrilldown = async (selection: StyleRepSelection | null) => {
        const selectionKey = makeSelectionKey(selection);
        if (!selection || !selectionKey || !canUseApiDrilldown) return;
        if (drilldownCache[selectionKey] || drilldownLoadingKeys.includes(selectionKey)) return;

        setDrilldownLoadingKeys((prev) => [...prev, selectionKey]);
        setDrilldownError(null);
        try {
            const response = await fetch(buildStyleRepresentativeUrl(
                cmId!,
                courseId!,
                selection.strategy,
                selection.cardId,
                apiBase ?? "",
            ));
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - representative samples not found`);
            }
            const payload = await response.json() as StyleRepresentativeResponse;
            setDrilldownCache((prev) => ({
                ...prev,
                [selectionKey]: deserializeRepresentativeEntries(payload.samples),
            }));
            setTeamDrilldownCache((prev) => ({
                ...prev,
                [selectionKey]: deserializeRepresentativeEntries(payload.teamSamples),
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
    const teamDrilldownHorses = useMemo(() => {
        const selectionKey = makeSelectionKey(selected);
        return selectionKey ? (teamDrilldownCache[selectionKey] ?? []) : [];
    }, [selected, teamDrilldownCache]);
    const drilldownHorsesInModal = useMemo(() => {
        const selectionKey = makeSelectionKey(selectedInModal);
        return selectionKey ? (drilldownCache[selectionKey] ?? []) : [];
    }, [selectedInModal, drilldownCache]);
    const teamDrilldownHorsesInModal = useMemo(() => {
        const selectionKey = makeSelectionKey(selectedInModal);
        return selectionKey ? (teamDrilldownCache[selectionKey] ?? []) : [];
    }, [selectedInModal, teamDrilldownCache]);

    const teamRateByRepKey = useMemo(() => {
        const map = new Map<string, CharacterTeamRateRow>();
        for (const row of characterTeamRates ?? []) {
            map.set(`${row.strategy}_${row.cardId}`, row);
        }
        return map;
    }, [characterTeamRates]);

    const entriesByStrategy = useMemo(() => (
        Object.fromEntries(
            REPRESENTATIVE_STRATEGY_IDS.map((sId) => {
                const entries: StyleRepEntry[] = [...(styleReps[sId] ?? [])].map((entry) => {
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
                });

                if (metricMode === "team") {
                    const presentCards = new Set(entries.map((entry) => entry.cardId));
                    for (const teamRate of characterTeamRates ?? []) {
                        if (teamRate.strategy !== sId || presentCards.has(teamRate.cardId)) continue;
                        const winRate = teamRate.appearances > 0 ? teamRate.wins / teamRate.appearances : 0;
                        entries.push({
                            cardId: teamRate.cardId,
                            charaId: teamRate.charaId,
                            charaName: UMDatabaseWrapper.charas[teamRate.charaId]?.name ?? `Unknown (${teamRate.charaId})`,
                            wins: 0,
                            appearances: teamRate.appearances,
                            popPct: 0,
                            winRate: 0,
                            bayesianWinRate: (BAYES_UMA.K * BAYES_UMA.PRIOR) / (teamRate.appearances + BAYES_UMA.K),
                            expectedWinRate: BAYES_UMA.PRIOR,
                            scoreAdjustedWinRate: (BAYES_UMA.K * BAYES_UMA.PRIOR) / (teamRate.appearances + BAYES_UMA.K),
                            scoreAdjustedLift: 0,
                            teamWins: teamRate.wins,
                            teamAppearances: teamRate.appearances,
                            teamWinRate: winRate,
                            teamBayesianWinRate: (teamRate.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (teamRate.appearances + BAYES_TEAM.K),
                        });
                        presentCards.add(teamRate.cardId);
                    }
                }

                const teamTotal = entries.reduce((sum, entry) => sum + (entry.teamAppearances ?? 0), 0);
                const filteredEntries = entries
                    .filter(entry => {
                        if (metricMode === "personal") return entry.popPct >= minPopPct;
                        const teamPopPct = teamTotal > 0 ? ((entry.teamAppearances ?? 0) / teamTotal) * 100 : entry.popPct;
                        return teamPopPct >= minPopPct;
                    })
                    .sort((a, b) => {
                        if (metricMode === "personal") {
                            return (b.bayesianWinRate - a.bayesianWinRate)
                                || (b.winRate - a.winRate)
                                || (b.appearances - a.appearances);
                        }
                        return ((b.teamBayesianWinRate ?? 0) - (a.teamBayesianWinRate ?? 0))
                            || ((b.teamWinRate ?? 0) - (a.teamWinRate ?? 0))
                            || ((b.teamAppearances ?? 0) - (a.teamAppearances ?? 0));
                    });
                return [sId, filteredEntries];
            })
        ) as Record<number, StyleRepEntry[]>
    ), [styleReps, teamRateByRepKey, characterTeamRates, minPopPct, metricMode]);

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
                {metricMode === "team" ? (
                    <div className="sa-reps-stats sa-reps-stats--team-summary">
                        <span
                            className="sa-adj-pct sa-reps-stat sa-reps-sort-stat"
                            title={`Adjusted team win rate for teams featuring this character: ${((entry.teamBayesianWinRate ?? 0) * 100).toFixed(1)}%, raw ${((entry.teamWinRate ?? 0) * 100).toFixed(1)}%, team wins ${entry.teamWins ?? 0}, team appearances ${entry.teamAppearances ?? 0}`}
                        >
                            {((entry.teamBayesianWinRate ?? 0) * 100).toFixed(1)}%
                        </span>
                        <span
                            className="sa-adj-pct sa-reps-stat"
                            title={`Personal win rate: ${(entry.winRate * 100).toFixed(1)}%, wins ${entry.wins}, appearances ${entry.appearances}`}
                        >
                            {(entry.winRate * 100).toFixed(1)}%
                        </span>
                        <span
                            className="sa-raw-pct sa-reps-stat"
                            title={`Raw team win rate for teams featuring this character: ${((entry.teamWinRate ?? 0) * 100).toFixed(1)}% across ${entry.teamAppearances ?? 0} samples`}
                        >
                            {((entry.teamWinRate ?? 0) * 100).toFixed(1)}% ({entry.teamAppearances ?? 0})
                        </span>
                    </div>
                ) : (
                    <div className="sa-reps-stats sa-reps-stats--team-summary">
                        <span
                            className="sa-adj-pct sa-reps-stat sa-reps-sort-stat"
                            title={`Adjusted personal win rate: ${(entry.bayesianWinRate * 100).toFixed(1)}%, raw ${(entry.winRate * 100).toFixed(1)}%, wins ${entry.wins}, appearances ${entry.appearances}`}
                        >
                            {(entry.bayesianWinRate * 100).toFixed(1)}%
                        </span>
                        <span
                            className="sa-adj-pct sa-reps-stat"
                            title={`Team win rate for teams featuring this character: ${((entry.teamWinRate ?? 0) * 100).toFixed(1)}%, team wins ${entry.teamWins ?? 0}, team appearances ${entry.teamAppearances ?? 0}`}
                        >
                            {((entry.teamWinRate ?? 0) * 100).toFixed(1)}%
                        </span>
                        <span
                            className="sa-raw-pct sa-reps-stat"
                            title={`Raw personal win rate: ${(entry.winRate * 100).toFixed(1)}% across ${entry.appearances} samples`}
                        >
                            {(entry.winRate * 100).toFixed(1)}% ({entry.appearances})
                        </span>
                    </div>
                )}
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
                            <span className="sa-stats-meta sa-stats-meta--team-summary">
                                {metricMode === "team" ? (
                                    <>
                                        <span className="sa-meta-adj sa-meta-adj--neutral" title="Bayesian-adjusted team win rate">Adj Team win%</span>
                                        <span className="sa-meta-adj sa-meta-adj--neutral" title="Own raw win rate">Own win%</span>
                                        <span className="sa-meta-raw" title="Raw team win rate and samples">Raw Team win%</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="sa-meta-adj sa-meta-adj--neutral" title="Bayesian-adjusted own win rate">Adj Own win%</span>
                                        <span className="sa-meta-adj sa-meta-adj--neutral" title="Raw team win rate">Team win%</span>
                                        <span className="sa-meta-raw" title="Raw own win rate and samples">Raw Own win%</span>
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
        drilldownEntries: RepresentativeDrilldownEntry[],
        teamDrilldownEntries: RepresentativeDrilldownEntry[],
    ) => {
        if (!selection || !skillStats) return null;
        const selectionKey = makeSelectionKey(selection);
        return (
            <RepresentativeDrilldown
                title={`Top performers for ${selection.charaName} (${STRATEGY_NAMES[selection.strategy]})`}
                individualEntries={drilldownEntries}
                teamEntries={teamDrilldownEntries}
                loading={!!selectionKey && drilldownLoadingKeys.includes(selectionKey)}
                error={drilldownError}
                skillStats={skillStats}
                strategyColors={strategyColors}
                onViewReplays={onViewReplays}
            />
        );
    };

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
        drilldownEntries: RepresentativeDrilldownEntry[],
        teamDrilldownEntries: RepresentativeDrilldownEntry[],
    ) => (
        <>
            {mode === "full" && (
                <>
                    {renderPopToggle()}
                </>
            )}
            {renderColumns(mode, selection, setSelection)}
            {renderDrilldown(selection, drilldownEntries, teamDrilldownEntries)}
        </>
    );

    return (
        <div className="sa-reps-panel">
            <div className="sa-panel-header">
                Style Representatives
                <InfoTooltip
                    id="style-representatives-info"
                    tip={metricMode === "team"
                        ? "Top performers per style ranked by adjusted team win rate."
                        : "Top performers per style ranked by adjusted personal win rate."}
                />
                <div className="sa-reps-mode-toggle" aria-label="Style representative metric mode">
                    <button
                        type="button"
                        className={`sa-reps-mode-btn${metricMode === "team" ? " active" : ""}`}
                        onClick={() => setMetricMode("team")}
                    >
                        Team
                    </button>
                    <button
                        type="button"
                        className={`sa-reps-mode-btn${metricMode === "personal" ? " active" : ""}`}
                        onClick={() => setMetricMode("personal")}
                    >
                        Personal
                    </button>
                </div>
            </div>
            {renderPopToggle()}
                    {renderPanelBody("top", selected, setSelected, drilldownHorses, teamDrilldownHorses)}
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
                            {renderPanelBody("full", selectedInModal, setSelectedInModal, drilldownHorsesInModal, teamDrilldownHorsesInModal)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
