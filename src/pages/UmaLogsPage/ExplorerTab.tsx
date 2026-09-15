import React, { useState, useMemo, useEffect } from "react";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import { STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import {
    sanitizeCharacterFeatures,
    type AggRow, type CharaVariant, type SkillVariant, type SupportCardVariant,
    type CharacterFeature, type ExplorerBootstrapPayload,
    type SortKey,
} from "./explorerShared";
import { UMA_LOGS_API_BASE } from "./umaLogsApi";
import { buildExplorerQueryRequest, buildExplorerQuerySpec, serializeUmaLogsQuerySpec } from "./umaLogsQueryShared";
import RaceFilterRows from "../../features/umalogs/components/filters/RaceFilterRows";
import ExplorerResults, { type ExplorerQueryResponse } from "./ExplorerResults";
import ExplorerCharacterFilterEditor from "./ExplorerCharacterFilterEditor";
import {
    createRaceFilter,
    removeRaceFilter as removeRaceFilterFromList,
    sanitizeStoredRaceFilters,
    updateRaceFilter as updateRaceFilterInList,
    type ReplayRaceFilter,
} from "../../features/umalogs/model/raceFilters";
import { useLatestRequest } from "../../features/umalogs/api/latestRequest";
import "./UmaLogsControls.css";

interface ExplorerTabProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    skillStats?: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
    onEditAsQuery?: (query: string) => void;
}

type SavedExplorerState = {
    characterFeatures: CharacterFeature[];
    appliedCharacterFeatures: CharacterFeature[];
    hasRunQuery: boolean;
    sortKey: SortKey;
    sortDesc: boolean;
    hideLowQuantity: boolean;
    minimumEntries: number;
    raceFilters: ReplayRaceFilter[];
    appliedRaceFilters: ReplayRaceFilter[];
};

function explorerStateKey(cmId?: string | null, courseId?: number): string | null {
    return cmId && courseId ? `umalogs-explorer-${cmId}-${courseId}` : null;
}

function readSavedExplorerState(cmId?: string | null, courseId?: number): SavedExplorerState | null {
    const key = explorerStateKey(cmId, courseId);
    if (!key) return null;
    try {
        const parsed = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<SavedExplorerState> | null;
        if (!parsed || !Array.isArray(parsed.characterFeatures) || !Array.isArray(parsed.appliedCharacterFeatures)) return null;
        return {
            characterFeatures: sanitizeCharacterFeatures(parsed.characterFeatures),
            appliedCharacterFeatures: sanitizeCharacterFeatures(parsed.appliedCharacterFeatures),
            hasRunQuery: parsed.hasRunQuery === true,
            sortKey: parsed.sortKey ?? "entries",
            sortDesc: parsed.sortDesc !== false,
            hideLowQuantity: parsed.hideLowQuantity === true,
            minimumEntries: Math.max(0, Number(parsed.minimumEntries) || 200),
            raceFilters: sanitizeStoredRaceFilters(parsed.raceFilters),
            appliedRaceFilters: sanitizeStoredRaceFilters(parsed.appliedRaceFilters),
        };
    } catch {
        return null;
    }
}

function formatPercent(value: number): string {
    return value.toFixed(1);
}

const ExplorerInfoIcon = ({ id, tip }: { id: string; tip: React.ReactNode }) => (
    <InfoTooltip
        id={id}
        tip={tip}
        className="exp-info-icon"
        placement="bottom"
        ariaLabel="Explain filter behavior"
    />
);

function buildExplorerBootstrapUrl(cmId: string, courseId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/explorer/bootstrap`;
}

function buildExplorerQueryUrl(cmId: string, courseId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/explorer/query`;
}

function normalizeCardVariant(variant: CharaVariant): CharaVariant {
    const charaName = variant.cardId === 0
        ? ""
        : UMDatabaseWrapper.charas[variant.charaId]?.name ?? variant.charaName ?? `Unknown (${variant.charaId})`;
    const cardName = variant.cardId === 0
        ? "Any Uma"
        : UMDatabaseWrapper.cards[variant.cardId]?.name ?? variant.cardName ?? charaName;
    return { ...variant, charaName, cardName };
}

function normalizeSkillVariant(variant: SkillVariant): SkillVariant {
    return { ...variant, skillName: UMDatabaseWrapper.skillNameWithEnglishFallback(variant.skillId) };
}

function normalizeSupportCardVariant(variant: SupportCardVariant): SupportCardVariant {
    return {
        ...variant,
        name: UMDatabaseWrapper.supportCards[variant.supportCardId]?.name ?? variant.name ?? `Card ${variant.supportCardId}`,
    };
}

function normalizeAggRow(row: AggRow): AggRow {
    if (row.cardId === undefined || row.cardId === 0 || row.charaId === undefined) {
        return row;
    }
    const charaName = UMDatabaseWrapper.charas[row.charaId]?.name ?? row.label;
    const cardName = UMDatabaseWrapper.cards[row.cardId]?.name ?? row.label;
    return {
        ...row,
        label: cardName === charaName ? charaName : `${charaName} ${cardName}`,
        sublabel: row.strategy !== undefined ? (STRATEGY_NAMES[row.strategy] ?? row.sublabel) : row.sublabel,
    };
}

const ExplorerTab: React.FC<ExplorerTabProps> = ({ cmId, courseId, apiBase, apiMode, skillStats, strategyColors, onViewReplays, onEditAsQuery }) => {
    const initialSavedState = useMemo(() => readSavedExplorerState(cmId, courseId), [cmId, courseId]);
    const [characterFeatures, setCharacterFeatures] = useState<CharacterFeature[]>(initialSavedState?.characterFeatures ?? []);
    const [appliedCharacterFeatures, setAppliedCharacterFeatures] = useState<CharacterFeature[]>(initialSavedState?.appliedCharacterFeatures ?? []);
    const [queryVersion, setQueryVersion] = useState(initialSavedState?.hasRunQuery ? 1 : 0);
    const [sortKey, setSortKey] = useState<SortKey>(initialSavedState?.sortKey ?? "entries");
    const [sortDesc, setSortDesc] = useState(initialSavedState?.sortDesc ?? true);
    const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
    const [bootstrap, setBootstrap] = useState<ExplorerBootstrapPayload | null>(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [queryResult, setQueryResult] = useState<ExplorerQueryResponse | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [hideLowQuantity, setHideLowQuantity] = useState(initialSavedState?.hideLowQuantity ?? false);
    const [minimumEntries, setMinimumEntries] = useState(initialSavedState?.minimumEntries ?? 200);
    const [raceFilters, setRaceFilters] = useState<ReplayRaceFilter[]>(initialSavedState?.raceFilters ?? []);
    const [appliedRaceFilters, setAppliedRaceFilters] = useState<ReplayRaceFilter[]>(initialSavedState?.appliedRaceFilters ?? []);
    const [loadedStateKey, setLoadedStateKey] = useState(explorerStateKey(cmId, courseId));
    const { runLatest: runLatestBootstrap, cancelLatest: cancelLatestBootstrap } = useLatestRequest();
    const { runLatest: runLatestQuery, cancelLatest: cancelLatestQuery } = useLatestRequest();

    const cardVariants = useMemo(
        () => bootstrap?.cardVariants ?? [],
        [bootstrap],
    );
    const skillVariants = bootstrap?.skillVariants ?? [];
    const supportCardVariants = bootstrap?.supportCardVariants ?? [];

    const effectiveCharacterFeatures = useMemo(
        () => sanitizeCharacterFeatures(characterFeatures),
        [characterFeatures],
    );
    useEffect(() => {
        const saved = readSavedExplorerState(cmId, courseId);
        cancelLatestBootstrap();
        cancelLatestQuery();
        setBootstrap(null);
        setBootstrapLoading(false);
        setBootstrapError(null);
        setQueryResult(null);
        setQueryLoading(false);
        setQueryError(null);
        setCharacterFeatures(saved?.characterFeatures ?? []);
        setAppliedCharacterFeatures(saved?.appliedCharacterFeatures ?? []);
        setQueryVersion(saved?.hasRunQuery ? 1 : 0);
        setSortKey(saved?.sortKey ?? "entries");
        setSortDesc(saved?.sortDesc ?? true);
        setSelectedRowKey(null);
        setHideLowQuantity(saved?.hideLowQuantity ?? false);
        setMinimumEntries(saved?.minimumEntries ?? 200);
        setRaceFilters(saved?.raceFilters ?? []);
        setAppliedRaceFilters(saved?.appliedRaceFilters ?? []);
        setLoadedStateKey(explorerStateKey(cmId, courseId));
    }, [cancelLatestBootstrap, cancelLatestQuery, cmId, courseId]);

    useEffect(() => {
        const key = explorerStateKey(cmId, courseId);
        if (!key || key !== loadedStateKey) return;
        const saved: SavedExplorerState = {
            characterFeatures,
            appliedCharacterFeatures,
            hasRunQuery: queryVersion > 0,
            sortKey,
            sortDesc,
            hideLowQuantity,
            minimumEntries,
            raceFilters,
            appliedRaceFilters,
        };
        sessionStorage.setItem(key, JSON.stringify(saved));
    }, [appliedCharacterFeatures, appliedRaceFilters, characterFeatures, cmId, courseId, hideLowQuantity, loadedStateKey, minimumEntries, queryVersion, raceFilters, sortDesc, sortKey]);

    useEffect(() => {
        if (!apiMode || !cmId || !courseId || bootstrap !== null) return;
        setBootstrapLoading(true);
        setBootstrapError(null);
        void runLatestBootstrap(async (signal) => {
            const response = await fetch(buildExplorerBootstrapUrl(cmId, courseId, apiBase ?? UMA_LOGS_API_BASE), { signal });
            if (!response.ok) throw new Error(`HTTP ${response.status} - explorer bootstrap not found`);
            return await response.json() as ExplorerBootstrapPayload;
        }).then((outcome) => {
            if (outcome.status === "cancelled") return;
            if (outcome.status === "error") {
                setBootstrapError(outcome.error.message);
                setBootstrapLoading(false);
                return;
            }
            const json = outcome.value;
            setBootstrap({
                ...json,
                cardVariants: json.cardVariants.map(normalizeCardVariant),
                skillVariants: json.skillVariants.map(normalizeSkillVariant),
                supportCardVariants: json.supportCardVariants.map(normalizeSupportCardVariant),
            });
            setBootstrapLoading(false);
        });
        return cancelLatestBootstrap;
    }, [apiBase, apiMode, bootstrap, cancelLatestBootstrap, cmId, courseId, runLatestBootstrap]);

    useEffect(() => {
        if (!apiMode || !cmId || !courseId || !bootstrap) return;
        if (queryVersion === 0) return;
        const timeout = window.setTimeout(() => {
            setQueryLoading(true);
            setQueryError(null);
            void runLatestQuery(async (signal) => {
                const response = await fetch(buildExplorerQueryUrl(cmId, courseId, apiBase ?? UMA_LOGS_API_BASE), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildExplorerQueryRequest(
                    appliedCharacterFeatures,
                    sortKey,
                    sortDesc,
                    selectedRowKey,
                    appliedRaceFilters,
                )),
                    signal,
                });
                if (!response.ok) {
                    let message = `HTTP ${response.status} - explorer query failed`;
                    try {
                        const errorBody = await response.json() as { error?: string };
                        if (errorBody?.error) message = errorBody.error;
                    } catch {
                        // fall back to the generic HTTP error above
                    }
                    throw new Error(message);
                }
                return await response.json() as ExplorerQueryResponse;
            }).then((outcome) => {
                if (outcome.status === "cancelled") return;
                if (outcome.status === "error") {
                    setQueryError(outcome.error.message);
                    setQueryLoading(false);
                    return;
                }
                const json = outcome.value;
                setQueryResult({ ...json, rows: json.rows.map(normalizeAggRow) });
                setQueryLoading(false);
            });
        }, 150);
        return () => {
            window.clearTimeout(timeout);
            cancelLatestQuery();
        };
    }, [apiBase, apiMode, appliedCharacterFeatures, appliedRaceFilters, bootstrap, cancelLatestQuery, cmId, courseId, queryVersion, runLatestQuery, selectedRowKey, sortDesc, sortKey]);

    const addRaceFilter = () => setRaceFilters((current) => [
        ...current,
        createRaceFilter(`${Date.now()}-${Math.random()}`),
    ]);
    const updateRaceFilter = (id: string, patch: Partial<ReplayRaceFilter>) =>
        setRaceFilters((current) => updateRaceFilterInList(current, id, patch));
    const removeRaceFilter = (id: string) =>
        setRaceFilters((current) => removeRaceFilterFromList(current, id));

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDesc(d => !d);
        else { setSortKey(key); setSortDesc(true); }
    };


    const hasCharacterFilter = queryResult?.hasCharacterFilter ?? characterFeatures.length > 0;
    const totalTeams = queryResult?.totalTeams ?? bootstrap?.totalTeams ?? 0;
    const filteredTeams = queryResult?.filteredTeams ?? 0;
    const filteredTeamWins = queryResult?.filteredTeamWins ?? 0;
    const filteredTeamWinPct = queryResult?.filteredTeamWinPct ?? 0;
    const filteredEntries = queryResult?.filteredEntries ?? 0;
    const isLowTeamWinRate = filteredTeams > 0 && filteredTeamWins * 3 < filteredTeams;
    const effectiveFeatureSignature = useMemo(() => JSON.stringify(effectiveCharacterFeatures), [effectiveCharacterFeatures]);
    const appliedFeatureSignature = useMemo(() => JSON.stringify(appliedCharacterFeatures), [appliedCharacterFeatures]);
    const raceFilterSignature = useMemo(() => JSON.stringify(raceFilters), [raceFilters]);
    const appliedRaceFilterSignature = useMemo(() => JSON.stringify(appliedRaceFilters), [appliedRaceFilters]);
    const filtersDirty = effectiveFeatureSignature !== appliedFeatureSignature || raceFilterSignature !== appliedRaceFilterSignature;
    const hasRunQuery = queryVersion > 0;
    const runQuery = () => {
        setAppliedCharacterFeatures(effectiveCharacterFeatures);
        setAppliedRaceFilters(raceFilters);
        setQueryVersion((current) => current + 1);
        setSelectedRowKey(null);
    };
    const resetQuery = () => {
        const key = explorerStateKey(cmId, courseId);
        if (key) sessionStorage.removeItem(key);
        setCharacterFeatures([]);
        setAppliedCharacterFeatures([]);
        setRaceFilters([]);
        setAppliedRaceFilters([]);
        setQueryVersion(0);
        setSortKey("entries");
        setSortDesc(true);
        setSelectedRowKey(null);
        setQueryResult(null);
        setQueryError(null);
        setHideLowQuantity(false);
        setMinimumEntries(200);
    };


    useEffect(() => {
        if (filtersDirty && selectedRowKey !== null) setSelectedRowKey(null);
    }, [filtersDirty, selectedRowKey]);


    if (!apiMode || !cmId || !courseId) {
        return <div className="exp-empty">Explorer requires the UmaLogs API path.</div>;
    }

    return (
        <div className="exp-container">
            <div className="exp-panel">
                <div className="exp-panel-header">
                    <span className="exp-panel-note">Filter teams by your own criteria.</span>
                    <span className="exp-filter-summary">
                        {filteredTeams.toLocaleString()} / {totalTeams.toLocaleString()} teams
                        {" | "}{filteredTeamWins.toLocaleString()} wins
                        {" | "}
                        <span className={`exp-filter-winpct${isLowTeamWinRate ? " exp-filter-winpct--low" : ""}`}>
                            {formatPercent(filteredTeamWinPct)}% team win rate
                        </span>
                        {hasCharacterFilter && (
                            <>{` | ${filteredEntries.toLocaleString()} entries`}</>
                        )}
                    </span>
                </div>

                {bootstrapError && <div className="exp-empty">{bootstrapError}</div>}
                {queryError && <div className="exp-empty">{queryError}</div>}

                <div className="exp-subsection">
                    <div className="exp-subsection-header">
                        <span className="exp-subsection-title">Race Conditions</span>
                        <span className="exp-subsection-note">Apply constraints to the whole room.</span>
                        <div className="exp-subsection-actions">
                            <button type="button" className="exp-add-btn" onClick={addRaceFilter}>+ Add condition</button>
                        </div>
                    </div>
                    <RaceFilterRows filters={raceFilters} onUpdate={updateRaceFilter} onRemove={removeRaceFilter} />
                </div>

                <div className="exp-subsection">
                    <div className="exp-subsection-header">
                        <span className="exp-subsection-title">Your Team</span>
                        <span className="exp-subsection-note">
                            Each card matches a different uma on your team.
                            <ExplorerInfoIcon
                                id="explorer-filter-types-tooltip"
                                tip={
                                    <div className="exp-tooltip-copy">
                                        <div><strong>is / is not</strong>: controls whether the matched Uma can be the selected Uma.</div>
                                        <div><strong>Include / Exclude</strong>: controls whether this full card definition must be present or absent on the team.</div>
                                        <div>Different included cards must be fulfilled by different umas on the same team.</div>
                                    </div>
                                }
                            />
                        </span>
                        <div className="exp-subsection-actions">
                            {filtersDirty && <span className="exp-dirty-note">Unsaved filter changes</span>}
                            {onEditAsQuery && (
                                <button
                                    className="query-help-btn"
                                    type="button"
                                    onClick={() => onEditAsQuery(serializeUmaLogsQuerySpec(buildExplorerQuerySpec(effectiveCharacterFeatures, sortKey, sortDesc, raceFilters)))}
                                >
                                    Edit as query
                                </button>
                            )}
                            <button
                                className="query-help-btn"
                                type="button"
                                onClick={resetQuery}
                                disabled={queryLoading || (!characterFeatures.length && !raceFilters.length && !hasRunQuery && sortKey === "entries" && sortDesc && !hideLowQuantity && minimumEntries === 200)}
                            >
                                Reset
                            </button>
                            <button
                                className="exp-run-btn"
                                onClick={runQuery}
                                disabled={!bootstrap || queryLoading || (!filtersDirty && hasRunQuery)}
                            >
                                {queryLoading ? "Running..." : "Run Query"}
                            </button>
                        </div>
                    </div>
                    <ExplorerCharacterFilterEditor
                        features={characterFeatures}
                        setFeatures={setCharacterFeatures}
                        cardVariants={cardVariants}
                        skillVariants={skillVariants}
                        supportCardVariants={supportCardVariants}
                        hideLowQuantity={hideLowQuantity}
                        onHideLowQuantityChange={setHideLowQuantity}
                        minimumEntries={minimumEntries}
                        onMinimumEntriesChange={setMinimumEntries}
                    />
                </div>
            </div>

            <ExplorerResults
                result={queryResult}
                bootstrapLoading={bootstrapLoading}
                queryLoading={queryLoading}
                hasRunQuery={hasRunQuery}
                hideLowQuantity={hideLowQuantity}
                minimumEntries={minimumEntries}
                sortKey={sortKey}
                sortDesc={sortDesc}
                selectedRowKey={selectedRowKey}
                onSelectedRowKeyChange={setSelectedRowKey}
                onSort={handleSort}
                skillStats={skillStats}
                strategyColors={strategyColors}
                onViewReplays={onViewReplays}
            />
        </div>
    );
};

export default ExplorerTab;
