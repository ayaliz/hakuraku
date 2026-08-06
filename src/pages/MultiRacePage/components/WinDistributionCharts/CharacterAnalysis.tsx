import React, { useEffect, useMemo, useState } from "react";
import "./CharacterAnalysis.css";
import { STRATEGY_COLORS, BAYES_TEAM, STRATEGY_NAMES } from "./constants";
import type { CharacterStats, HorseEntry, SkillStats, TeamCompositionStats } from "../../types";
import { PieSlice } from "./types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import InfoTooltip from "./InfoTooltip";
import { TeamMemberCard } from "./TeamMemberCard";
import TeamSampleSelect from "./TeamSampleSelect";
import { getRankIcon } from "../../../../components/RaceDataPresenter/components/CharaList/rankUtils";
import type { CharacterTeamRateRow, StyleCompositionSummaryRow } from "../../../UmaLogsPage/panelData";
import SynergyEntitySelect, { type SynergyEntityInfo } from "./SynergyEntitySelect";
import { CharacterBreakdownPanel } from "./CharacterBreakdownPanel";
import { BubblePlotPanel } from "./BubblePlotPanel";
import { type AverageScoreSummary } from "./CharacterAnalysisUtils";
import {
    type SerializedHorseEntry,
    deserializeHorseEntries,
    buildCompositionRepsUrl,
    makeCompositionKey,
} from "./shared";

export type { AverageScoreSummary } from "./CharacterAnalysisUtils";

// StyleCompEntry is structurally compatible with StyleCompositionSummaryRow but kept
// as a local alias to avoid coupling this component's rendering to the panelData type.
type StyleCompEntry = {
    key: string;
    strategies: number[];
    label: string;
    appearances: number;
    wins: number;
    winRate: number;
    bayesianWinRate: number;
};

type CompositionRepResponse = {
    cmId: string;
    courseId: number;
    compositionKey: string;
    horses: SerializedHorseEntry[];
};

type CompositionTeamsResponse = {
    cmId: string;
    courseId: number;
    compositionKey: string;
    cardId?: number;
    strategy?: number;
    teams: TeamCompositionStats[];
};

type EntityCompositionResponse = {
    cmId: string;
    courseId: number;
    cardId: number;
    strategy: number;
    compositions: StyleCompositionSummaryRow[];
};

function buildEntityCompositionsUrl(cmId: string, courseId: number, cardId: number, strategy: number, apiBase = ""): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/entity-compositions/${cardId}/${strategy}`;
}

// Differs from shared.ts buildCompositionTeamsUrl: includes optional cardId/strategy query params.
function buildCompositionTeamsUrl(cmId: string, courseId: number, compositionKey: string, apiBase = "", cardId?: number, strategy?: number): string {
    const params = new URLSearchParams();
    if (cardId !== undefined) params.set("cardId", String(cardId));
    if (strategy !== undefined) params.set("strategy", String(strategy));
    const query = params.toString();
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/composition-teams/${encodeURIComponent(compositionKey)}${query ? `?${query}` : ""}`;
}

interface CharacterAnalysisProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    rawWinsAll: PieSlice[];
    rawWinsOpp: PieSlice[];
    rawPop: PieSlice[];
    spectatorMode?: boolean;
    characterStats?: CharacterStats[];
    skillStats?: Map<number, SkillStats>;
    characterTeamRates?: CharacterTeamRateRow[];
    strategyColors?: Record<number, string>;
    characterPopOverride?: PieSlice[];
    opponentScoreSummary?: AverageScoreSummary | null;
    bestOpponentScoreSummary?: AverageScoreSummary | null;
}

const MIN_DRILLDOWN_APPEARANCES = 5;

const CharacterAnalysis: React.FC<CharacterAnalysisProps> = ({
    cmId,
    courseId,
    apiBase,
    apiMode,
    rawWinsAll,
    rawWinsOpp,
    rawPop,
    spectatorMode,
    characterStats,
    skillStats,
    characterTeamRates,
    strategyColors,
    characterPopOverride,
    opponentScoreSummary,
    bestOpponentScoreSummary,
}) => {
    const [synEntityKey, setSynEntityKey] = useState<string | null>(null);
    const [selectedCompKey, setSelectedCompKey] = useState<string | null>(null);
    const [selectedDrilldownIdx, setSelectedDrilldownIdx] = useState(0);
    const [entityCompositionCache, setEntityCompositionCache] = useState<Record<string, StyleCompositionSummaryRow[]>>({});
    const [entityCompositionLoadingKeys, setEntityCompositionLoadingKeys] = useState<string[]>([]);
    const [entityCompositionError, setEntityCompositionError] = useState<string | null>(null);
    const [compositionTeamsCache, setCompositionTeamsCache] = useState<Record<string, TeamCompositionStats[]>>({});
    const [compositionTeamsLoadingKeys, setCompositionTeamsLoadingKeys] = useState<string[]>([]);
    const [compositionTeamsError, setCompositionTeamsError] = useState<string | null>(null);
    const [compositionRepCache, setCompositionRepCache] = useState<Record<string, HorseEntry[]>>({});
    const [compositionRepLoadingKeys, setCompositionRepLoadingKeys] = useState<string[]>([]);
    const [compositionRepError, setCompositionRepError] = useState<string | null>(null);
    const unfilteredCharacterPop = characterPopOverride ?? rawPop;

    useEffect(() => { setSelectedCompKey(null); }, [synEntityKey]);
    useEffect(() => { setSelectedDrilldownIdx(0); }, [selectedCompKey]);

    const synEntities = useMemo((): SynergyEntityInfo[] => {
        const charaNameMap = new Map((characterStats ?? []).map(c => [c.charaId, c.charaName]));
        return rawPop
            .filter((slice) => slice.cardId && slice.strategyId && slice.charaId)
            .map((slice) => {
                const keyParts = String(slice.charaId).split("_");
                const charaId = Number(keyParts[0]);
                const cardId = slice.cardId ?? Number(keyParts[1]);
                const strategy = slice.strategyId ?? Number(keyParts[2]);
                return {
                    key: `${cardId}_${strategy}`,
                    cardId,
                    strategy,
                    charaId,
                    cardName: UMDatabaseWrapper.cards[cardId]?.name ?? charaNameMap.get(charaId) ?? `#${charaId}`,
                    charaName: charaNameMap.get(charaId) ?? slice.fullLabel ?? slice.label ?? `#${charaId}`,
                    totalCoApps: slice.value,
                };
            })
            .sort((a, b) => b.totalCoApps - a.totalCoApps);
    }, [characterStats, rawPop]);

    const effectiveEntityKey = synEntityKey ?? synEntities[0]?.key ?? null;
    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canDrilldown = !!(skillStats && canUseApiDrilldown);
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const selectedEntityParts = useMemo(() => {
        if (!effectiveEntityKey) return null;
        const [cardIdText, strategyText] = effectiveEntityKey.split("_");
        const cardId = Number(cardIdText);
        const strategy = Number(strategyText);
        if (!Number.isFinite(cardId) || !Number.isFinite(strategy)) return null;
        return { cardId, strategy };
    }, [effectiveEntityKey]);
    const compositionTeamCacheKey = useMemo(() => {
        if (!selectedCompKey || !effectiveEntityKey) return null;
        return `${effectiveEntityKey}|${selectedCompKey}`;
    }, [effectiveEntityKey, selectedCompKey]);

    useEffect(() => {
        if (!canUseApiDrilldown || !selectedEntityParts || !cmId || !courseId || !effectiveEntityKey) return;
        if (entityCompositionCache[effectiveEntityKey]) return;
        const controller = new AbortController();
        setEntityCompositionLoadingKeys((keys) => [...keys, effectiveEntityKey]);
        setEntityCompositionError(null);
        fetch(buildEntityCompositionsUrl(cmId, courseId, selectedEntityParts.cardId, selectedEntityParts.strategy, apiBase ?? ""), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load style trio data (${response.status})`);
                return await response.json() as EntityCompositionResponse;
            })
            .then((payload) => {
                setEntityCompositionCache((cache) => ({
                    ...cache,
                    [effectiveEntityKey]: payload.compositions,
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load entity compositions", { effectiveEntityKey, error });
                setEntityCompositionError(error instanceof Error ? error.message : "Failed to load style trio data.");
                setEntityCompositionCache((cache) => ({ ...cache, [effectiveEntityKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setEntityCompositionLoadingKeys((keys) => keys.filter((key) => key !== effectiveEntityKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, courseId, effectiveEntityKey, entityCompositionCache, selectedEntityParts]);

    const { overperformers, underperformers } = useMemo((): { overperformers: StyleCompEntry[]; underperformers: StyleCompEntry[] } => {
        const empty = { overperformers: [], underperformers: [] };
        if (!effectiveEntityKey) return empty;
        const all = (entityCompositionCache[effectiveEntityKey] ?? []).filter((entry) => entry.appearances >= MIN_DRILLDOWN_APPEARANCES);
        if (all.length === 0) return empty;
        const sorted = [...all].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
        return {
            overperformers: sorted.filter((entry) => entry.bayesianWinRate > BAYES_TEAM.PRIOR).slice(0, 10),
            underperformers: sorted.filter((entry) => entry.bayesianWinRate < BAYES_TEAM.PRIOR).slice(-10).reverse(),
        };
    }, [effectiveEntityKey, entityCompositionCache]);

    useEffect(() => {
        if (!canUseApiDrilldown || !compositionTeamCacheKey || !selectedCompKey || !selectedEntityParts || !cmId || !courseId) return;
        if (compositionTeamsCache[compositionTeamCacheKey]) return;
        const controller = new AbortController();
        setCompositionTeamsLoadingKeys((keys) => [...keys, compositionTeamCacheKey]);
        setCompositionTeamsError(null);
        fetch(
            buildCompositionTeamsUrl(cmId, courseId, selectedCompKey, apiBase ?? "", selectedEntityParts.cardId, selectedEntityParts.strategy),
            { signal: controller.signal },
        )
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load composition teams (${response.status})`);
                return await response.json() as CompositionTeamsResponse;
            })
            .then((payload) => {
                setCompositionTeamsCache((cache) => ({
                    ...cache,
                    [compositionTeamCacheKey]: payload.teams,
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load composition drilldown teams", { compositionTeamCacheKey, error });
                setCompositionTeamsError(error instanceof Error ? error.message : "Failed to load composition teams.");
                setCompositionTeamsCache((cache) => ({ ...cache, [compositionTeamCacheKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setCompositionTeamsLoadingKeys((keys) => keys.filter((key) => key !== compositionTeamCacheKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, compositionTeamCacheKey, compositionTeamsCache, courseId, selectedCompKey, selectedEntityParts]);

    const drilldownTeams = useMemo(() => {
        if (!compositionTeamCacheKey) return [];
        return (compositionTeamsCache[compositionTeamCacheKey] ?? [])
            .filter((team) => team.appearances >= MIN_DRILLDOWN_APPEARANCES)
            .map((team) => ({
                team,
                bayesianWinRate: (team.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (team.appearances + BAYES_TEAM.K),
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    }, [compositionTeamCacheKey, compositionTeamsCache]);

    const selectedTeamEntry = useMemo(() => {
        if (!selectedCompKey || drilldownTeams.length === 0) return null;
        const idx = Math.min(selectedDrilldownIdx, drilldownTeams.length - 1);
        return drilldownTeams[idx] ?? null;
    }, [selectedCompKey, drilldownTeams, selectedDrilldownIdx]);
    const selectedTeamCompositionKey = useMemo(() => {
        if (!selectedTeamEntry) return null;
        return makeCompositionKey(selectedTeamEntry.team.members);
    }, [selectedTeamEntry]);
    const selectedTeamBuildKey = selectedTeamEntry?.team.buildKey;
    const selectedTeamRepCacheKey = selectedTeamCompositionKey
        ? `${selectedTeamCompositionKey}|${selectedTeamBuildKey ?? ""}`
        : null;

    useEffect(() => {
        if (!canUseApiDrilldown || !selectedTeamCompositionKey || !selectedTeamRepCacheKey || !cmId || !courseId) return;
        if (compositionRepCache[selectedTeamRepCacheKey]) return;
        const controller = new AbortController();
        setCompositionRepLoadingKeys((keys) => [...keys, selectedTeamRepCacheKey]);
        setCompositionRepError(null);
        fetch(buildCompositionRepsUrl(cmId, courseId, selectedTeamCompositionKey, apiBase ?? "", selectedTeamBuildKey), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load representative team samples (${response.status})`);
                return await response.json() as CompositionRepResponse;
            })
            .then((payload) => {
                setCompositionRepCache((cache) => ({
                    ...cache,
                    [selectedTeamRepCacheKey]: deserializeHorseEntries(payload.horses),
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load composition representatives", { selectedTeamCompositionKey, error });
                setCompositionRepError(error instanceof Error ? error.message : "Failed to load representative team samples.");
                setCompositionRepCache((cache) => ({ ...cache, [selectedTeamRepCacheKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setCompositionRepLoadingKeys((keys) => keys.filter((key) => key !== selectedTeamRepCacheKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, compositionRepCache, courseId, selectedTeamBuildKey, selectedTeamCompositionKey, selectedTeamRepCacheKey]);

    const renderScoreSummaryCard = (label: string, summary: AverageScoreSummary | null) => {
        if (!summary) return null;
        const rankInfo = getRankIcon(summary.average);
        return (
            <div
                className="ca-score-summary-card"
                title={`${Math.round(summary.average).toLocaleString()} average score across ${summary.count.toLocaleString()} samples`}
            >
                <div className="ca-score-summary-label">{label}</div>
                <div className="ca-score-summary-value">
                    <img src={rankInfo.icon} alt={rankInfo.name} className="ca-score-summary-icon" />
                    <span>{Math.round(summary.average).toLocaleString()}</span>
                </div>
                <div className="ca-score-summary-meta">{summary.count.toLocaleString()} samples</div>
            </div>
        );
    };

    const renderCompItem = (e: StyleCompEntry, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const isSelected = selectedCompKey === e.key;
        const label = e.strategies.map((strategy) => (STRATEGY_NAMES[strategy] ?? String(strategy)).split(" ")[0]).join(" / ");
        return (
            <div
                key={e.key}
                className={`syn-comp-item${canDrilldown ? " syn-comp-item--clickable" : ""}${isSelected ? " syn-comp-item--selected" : ""}`}
                onClick={canDrilldown ? () => setSelectedCompKey(k => k === e.key ? null : e.key) : undefined}
            >
                <div className="syn-comp-dots">
                    {e.strategies.map((s, i) => (
                        <span key={i} className="syn-comp-dot" style={{ background: activeStrategyColors[s] ?? "#718096" }} />
                    ))}
                </div>
                <div className="syn-comp-name">{label}</div>
                <div className="syn-comp-stats">
                    <span className="sa-adj-pct syn-comp-stat" style={{ color: valueColor }}>{(e.bayesianWinRate * 100).toFixed(1)}%</span>
                    <span className="sa-raw-pct syn-comp-stat">{(e.winRate * 100).toFixed(1)}% ({e.appearances})</span>
                </div>
            </div>
        );
    };

    return (
        <div className="pie-chart-container">
            {!spectatorMode && (opponentScoreSummary || bestOpponentScoreSummary) && (
                <div className="ca-score-summary-row">
                    {renderScoreSummaryCard("Avg Opponent Score", opponentScoreSummary ?? null)}
                    {renderScoreSummaryCard("Avg Best-Placing Opponent Score", bestOpponentScoreSummary ?? null)}
                </div>
            )}
            <div className="sa-top-panels-row">
                <CharacterBreakdownPanel
                    title="Character Breakdown"
                    rawWinsSlices={rawWinsAll}
                    rawPopSlices={unfilteredCharacterPop}
                    cmId={cmId}
                    courseId={courseId}
                    apiBase={apiBase}
                    apiMode={apiMode}
                    skillStats={skillStats}
                    strategyColors={activeStrategyColors}
                    includeZeroWinEntries
                    useBayesianWinRate={!!spectatorMode}
                />
                {!spectatorMode && (
                    <CharacterBreakdownPanel
                        title="Best Placing Opponent"
                        rawWinsSlices={rawWinsOpp}
                        rawPopSlices={rawPop}
                        cmId={cmId}
                        courseId={courseId}
                        apiBase={apiBase}
                        apiMode={apiMode}
                        skillStats={skillStats}
                        strategyColors={activeStrategyColors}
                        useBayesianWinRate={false}
                    />
                )}
                {spectatorMode && (
                    <BubblePlotPanel
                        rawPopSlices={rawPop}
                        rawWinsSlices={rawWinsAll}
                        strategyColors={activeStrategyColors}
                        characterTeamRates={characterTeamRates}
                    />
                )}
            </div>

            {spectatorMode && synEntities.length > 0 && (
                <div className="syn-section">
                <div className="syn-section-header">
                    Style Trio Synergy
                    <InfoTooltip
                        id="style-trio-synergy-info"
                        tip="Highest win rate team compositions for a specific character."
                    />
                </div>
                    <div className="syn-entity-row">
                        <span className="syn-entity-label">Character:</span>
                        <SynergyEntitySelect
                            entities={synEntities}
                            value={effectiveEntityKey}
                            onChange={setSynEntityKey}
                            strategyColors={activeStrategyColors}
                        />
                    </div>
                    {overperformers.length === 0 && underperformers.length === 0 ? (
                        entityCompositionLoadingKeys.includes(effectiveEntityKey ?? "")
                            ? <div className="syn-no-data">Loading composition data...</div>
                            : <div className="syn-no-data">{entityCompositionError ?? "No composition data for this entry."}</div>
                    ) : (
                        <div className="syn-tables-row">
                            {overperformers.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--best">
                                        OVERPERFORMERS
                                        <span className="syn-comp-meta"><span className="sa-meta-adj sa-meta-adj--over">Adj. win%</span><span className="sa-meta-raw">Raw win% (samples)</span></span>
                                    </div>
                                    {overperformers.map(e => renderCompItem(e, true))}
                                </div>
                            )}
                            {underperformers.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--worst">
                                        UNDERPERFORMERS
                                        <span className="syn-comp-meta"><span className="sa-meta-adj sa-meta-adj--under">Adj. win%</span><span className="sa-meta-raw">Raw win% (samples)</span></span>
                                    </div>
                                    {underperformers.map(e => renderCompItem(e, false))}
                                </div>
                            )}
                        </div>
                    )}
                    {canDrilldown && selectedCompKey && (() => {
                        if (canUseApiDrilldown && compositionTeamCacheKey && compositionTeamsLoadingKeys.includes(compositionTeamCacheKey)) {
                            return <div className="sa-no-data">Loading composition teams...</div>;
                        }
                        if (!selectedTeamEntry) {
                            return compositionTeamsError
                                ? <div className="sa-no-data">{compositionTeamsError}</div>
                                : null;
                        }
                        const idx = Math.min(selectedDrilldownIdx, drilldownTeams.length - 1);
                        const selectedTeam = selectedTeamEntry;
                        const compKey = selectedTeamCompositionKey ?? makeCompositionKey(selectedTeam.team.members);
                        const repCacheKey = selectedTeamRepCacheKey ?? compKey;
                        const memberMap = new Map<string, HorseEntry>((compositionRepCache[repCacheKey] ?? []).map((horse) => [`${horse.cardId}_${horse.strategy}`, horse]));
                        const teamSelectOptions = drilldownTeams.map((item, i) => {
                            const n = item.team.appearances;
                            return {
                                value: String(i),
                                samples: n,
                                members: item.team.members.map((m, mi) => ({
                                    cardId: m.cardId,
                                    strategy: m.strategy,
                                    winRatePct: n > 0 ? ((item.team.memberWins[mi] ?? 0) / n) * 100 : 0,
                                })),
                            };
                        });
                        return (
                            <div className="tcp-member-drilldown">
                                {drilldownTeams.length > 1 && (
                                    <div className="tcp-rep-team-select">
                                        <TeamSampleSelect
                                            value={String(idx)}
                                            options={teamSelectOptions}
                                            onChange={(v) => setSelectedDrilldownIdx(Number(v))}
                                            strategyColors={activeStrategyColors}
                                        />
                                    </div>
                                )}
                                {canUseApiDrilldown && compositionRepLoadingKeys.includes(repCacheKey) && (
                                    <div className="sa-no-data">Loading representative team samples...</div>
                                )}
                                {canUseApiDrilldown && !compositionRepLoadingKeys.includes(repCacheKey) && (compositionRepCache[repCacheKey]?.length ?? 0) === 0 && compositionRepError && (
                                    <div className="sa-no-data">{compositionRepError}</div>
                                )}
                                <div className="stcp-team-members-row">
                                    {selectedTeam.team.members.map((m, i) => {
                                        const rep = memberMap.get(`${m.cardId}_${m.strategy}`);
                                        if (!rep) {
                                            return (
                                                <div key={i} className="stcp-member-card stcp-member-card--placeholder">
                                                    <div className="stcp-member-placeholder-label">{m.charaName}</div>
                                                    <div className="stcp-member-placeholder-note">No sample profile available</div>
                                                </div>
                                            );
                                        }
                                        return <TeamMemberCard key={i} horse={rep} skillStats={skillStats!} strategyColors={activeStrategyColors} />;
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

export default CharacterAnalysis;
