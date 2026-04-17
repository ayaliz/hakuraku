import React, { useState, useMemo, useEffect } from "react";
import type { SkillStats } from "../MultiRacePage/types";
import { STRATEGY_NAMES, STRATEGY_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/TeamMemberCard";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import {
    defaultStatValueForProperty, sanitizeCharacterFeatures, SUPPORT_CARD_LB_ANY,
    type AggRow, type CharaVariant, type SkillVariant, type SupportCardVariant,
    type CharacterRequirement, type CharacterFeature, type ExplorerBootstrapPayload,
    type FilterProperty, type SortKey, type SkillFilterMode, type RequirementTruthMode,
} from "./explorerShared";
import { SerializedHorseEntry, UMA_LOGS_API_BASE, deserializeHorseEntry } from "./umaLogsApi";
import { CharaSelect, SkillSelect, SupportCardSelect } from "./ExplorerSelects";
import "./UmaLogsPage.css";

interface ExplorerTabProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    skillStats?: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
}

function formatPercent(value: number): string {
    return value.toFixed(1);
}

const SUPPORT_CARD_LB_OPTIONS = [
    { value: SUPPORT_CARD_LB_ANY, label: "Any" },
    { value: 0, label: "0LB" },
    { value: 1, label: "1LB" },
    { value: 2, label: "2LB" },
    { value: 3, label: "3LB" },
    { value: 4, label: "MLB" },
] as const;

const PROPERTY_LABELS: Record<FilterProperty, string> = {
    none: "—",
    speed: "Speed",
    stamina: "Stamina",
    pow: "Power",
    guts: "Guts",
    wiz: "Wit",
    aptGround: "Aptitude (Ground)",
    aptDistance: "Aptitude (Distance)",
    aptStyle: "Aptitude (Style)",
    totalSkillPoints: "Skill pts",
    rankScore: "Score",
    careerWinCount: "Career wins",
    deckRaceBonus: "Deck race bonus",
    skill: "Skill",
    supportCard: "Support card",
};

const STRATEGIES = [5, 1, 2, 3, 4] as const;
const APTITUDE_GRADE_OPTIONS = [
    { value: 8, label: "S" },
    { value: 7, label: "A" },
    { value: 6, label: "B" },
    { value: 5, label: "C" },
    { value: 4, label: "D" },
    { value: 3, label: "E" },
    { value: 2, label: "F" },
    { value: 1, label: "G" },
] as const;

const ExplorerInfoIcon = ({ id, tip }: { id: string; tip: React.ReactNode }) => (
    <InfoTooltip
        id={id}
        tip={tip}
        className="exp-info-icon"
        placement="bottom"
        ariaLabel="Explain filter behavior"
    />
);

type ExplorerQueryResponse = {
    totalTeams: number;
    filteredTeams: number;
    filteredTeamWins: number;
    filteredTeamWinPct: number;
    filteredEntries: number;
    hasCharacterFilter: boolean;
    rows: AggRow[];
    drilldown: Array<{
        horse: SerializedHorseEntry;
        bayesianWinRate: number;
        winRate: number;
        appearances: number;
    }>;
};

function buildExplorerBootstrapUrl(cmId: string, courseId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/explorer/bootstrap`;
}

function buildExplorerQueryUrl(cmId: string, courseId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/explorer/query`;
}

function normalizeCardVariant(variant: CharaVariant): CharaVariant {
    const charaName = UMDatabaseWrapper.charas[variant.charaId]?.name ?? variant.charaName ?? `Unknown (${variant.charaId})`;
    const cardName = UMDatabaseWrapper.cards[variant.cardId]?.name ?? variant.cardName ?? charaName;
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

const ExplorerTab: React.FC<ExplorerTabProps> = ({ cmId, courseId, apiBase, apiMode, skillStats, strategyColors }) => {
    const [characterFeatures, setCharacterFeatures] = useState<CharacterFeature[]>([]);
    const [appliedCharacterFeatures, setAppliedCharacterFeatures] = useState<CharacterFeature[]>([]);
    const [queryVersion, setQueryVersion] = useState(0);
    const [sortKey, setSortKey] = useState<SortKey>("entries");
    const [sortDesc, setSortDesc] = useState(true);
    const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
    const [bootstrap, setBootstrap] = useState<ExplorerBootstrapPayload | null>(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [queryResult, setQueryResult] = useState<ExplorerQueryResponse | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);

    const cardVariants = useMemo(
        () => (bootstrap?.cardVariants ?? []).filter((variant) => variant.cardId !== 0),
        [bootstrap],
    );
    const skillVariants = bootstrap?.skillVariants ?? [];
    const supportCardVariants = bootstrap?.supportCardVariants ?? [];

    const createDefaultRequirement = (): CharacterRequirement => ({
        id: `${Date.now()}-${Math.random()}`,
        truthMode: "require",
        property: "none",
        statOp: ">",
        statValue: defaultStatValueForProperty("none"),
        skillId: skillVariants[0]?.skillId ?? null,
        skillMode: "learned",
        supportCardId: supportCardVariants[0]?.supportCardId ?? null,
        supportCardPresent: true,
        supportCardLb: SUPPORT_CARD_LB_ANY,
    });

    const effectiveCharacterFeatures = useMemo(
        () => sanitizeCharacterFeatures(characterFeatures),
        [characterFeatures],
    );

    useEffect(() => {
        setBootstrap(null);
        setBootstrapLoading(false);
        setBootstrapError(null);
        setQueryResult(null);
        setQueryLoading(false);
        setQueryError(null);
        setCharacterFeatures([]);
        setAppliedCharacterFeatures([]);
        setQueryVersion(0);
        setSelectedRowKey(null);
    }, [cmId, courseId]);

    useEffect(() => {
        if (!apiMode || !cmId || !courseId || bootstrap !== null) return;
        const controller = new AbortController();
        setBootstrapLoading(true);
        setBootstrapError(null);
        fetch(buildExplorerBootstrapUrl(cmId, courseId, apiBase ?? UMA_LOGS_API_BASE), {
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status} - explorer bootstrap not found`);
                return response.json() as Promise<ExplorerBootstrapPayload>;
            })
            .then((json) => {
                setBootstrap({
                    ...json,
                    cardVariants: json.cardVariants.map(normalizeCardVariant),
                    skillVariants: json.skillVariants.map(normalizeSkillVariant),
                    supportCardVariants: json.supportCardVariants.map(normalizeSupportCardVariant),
                });
                setBootstrapLoading(false);
            })
            .catch((error: Error) => {
                if (error.name === "AbortError") return;
                setBootstrapError(error.message);
                setBootstrapLoading(false);
            });
        return () => controller.abort();
    }, [apiBase, apiMode, bootstrap, cmId, courseId]);

    useEffect(() => {
        if (!apiMode || !cmId || !courseId || !bootstrap) return;
        if (queryVersion === 0) return;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            setQueryLoading(true);
            setQueryError(null);
            fetch(buildExplorerQueryUrl(cmId, courseId, apiBase ?? UMA_LOGS_API_BASE), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    characterFeatures: appliedCharacterFeatures,
                    sortKey,
                    sortDesc,
                    selectedRowKey,
                }),
                signal: controller.signal,
            })
                .then(async (response) => {
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
                    return response.json() as Promise<ExplorerQueryResponse>;
                })
                .then((json) => {
                    setQueryResult({ ...json, rows: json.rows.map(normalizeAggRow) });
                    setQueryLoading(false);
                })
                .catch((error: Error) => {
                    if (error.name === "AbortError") return;
                    setQueryError(error.message);
                    setQueryLoading(false);
                });
        }, 150);
        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [apiBase, apiMode, appliedCharacterFeatures, bootstrap, cmId, courseId, queryVersion, selectedRowKey, sortDesc, sortKey]);

    useEffect(() => {
        const fallbackCardId = cardVariants[0]?.cardId ?? null;
        if (fallbackCardId === null) return;
        setCharacterFeatures((previous) =>
            previous.map((feature) => (
                feature.cardId === 0
                    ? { ...feature, cardId: fallbackCardId }
                    : feature
            )),
        );
        setAppliedCharacterFeatures((previous) =>
            previous.map((feature) => (
                feature.cardId === 0
                    ? { ...feature, cardId: fallbackCardId }
                    : feature
            )),
        );
    }, [cardVariants]);

    const addCharacterFeature = () => setCharacterFeatures(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        characterMatchMode: "is",
        cardMode: "include",
        cardId: cardVariants[0]?.cardId ?? null,
        cardStrategy: null,
        requirements: [createDefaultRequirement()],
    }]);

    const removeCharacterFeature = (id: string) => setCharacterFeatures(prev => prev.filter(f => f.id !== id));

    const addCharacterRequirement = (featureId: string) =>
        setCharacterFeatures(prev => prev.map(feature =>
            feature.id === featureId
                ? { ...feature, requirements: [...feature.requirements, createDefaultRequirement()] }
                : feature
        ));

    const removeCharacterRequirement = (featureId: string, requirementId: string) =>
        setCharacterFeatures(prev => prev.map(feature =>
            feature.id === featureId
                ? { ...feature, requirements: feature.requirements.filter(req => req.id !== requirementId) }
                : feature
        ));

    const updateCharacterFeature = (id: string, patch: Partial<CharacterFeature>) =>
        setCharacterFeatures(prev => prev.map(feature =>
            feature.id !== id ? feature : { ...feature, ...patch }
        ));

    const updateCharacterRequirement = (featureId: string, requirementId: string, patch: Partial<CharacterRequirement>) =>
        setCharacterFeatures(prev => prev.map(feature => {
            if (feature.id !== featureId) return feature;
            return {
                ...feature,
                requirements: feature.requirements.map(req => {
                    if (req.id !== requirementId) return req;
                    const next = { ...req, ...patch };
                    if (patch.property === "skill" && next.skillId === null)
                        next.skillId = skillVariants[0]?.skillId ?? null;
                    if (patch.property === "supportCard" && next.supportCardId === null)
                        next.supportCardId = supportCardVariants[0]?.supportCardId ?? null;
                    if (patch.property === "supportCard")
                        next.supportCardLb = next.supportCardLb ?? SUPPORT_CARD_LB_ANY;
                    if (patch.property !== undefined)
                        next.statValue = defaultStatValueForProperty(patch.property);
                    return next;
                }),
            };
        }));

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDesc(d => !d);
        else { setSortKey(key); setSortDesc(true); }
    };

    const SortArrow = ({ col }: { col: SortKey }) =>
        sortKey === col ? <span className="exp-sort-arrow">{sortDesc ? "v" : "^"}</span> : null;

    const hasCharacterFilter = queryResult?.hasCharacterFilter ?? characterFeatures.length > 0;
    const rows = queryResult?.rows ?? [];
    const showTeamsColumn = !hasCharacterFilter;
    const drilldownColSpan = 3 + (showTeamsColumn ? 1 : 0);
    const selectedRow = useMemo(
        () => rows.find(row => row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined) ?? null,
        [rows, selectedRowKey]
    );
    const drilldownHorses = useMemo(
        () => (queryResult?.drilldown ?? []).map((entry) => ({
            horse: deserializeHorseEntry(entry.horse),
            bayesianWinRate: entry.bayesianWinRate,
            winRate: entry.winRate,
            appearances: entry.appearances,
        })),
        [queryResult],
    );
    const totalTeams = queryResult?.totalTeams ?? bootstrap?.totalTeams ?? 0;
    const filteredTeams = queryResult?.filteredTeams ?? 0;
    const filteredTeamWins = queryResult?.filteredTeamWins ?? 0;
    const filteredTeamWinPct = queryResult?.filteredTeamWinPct ?? 0;
    const filteredEntries = queryResult?.filteredEntries ?? 0;
    const isLowTeamWinRate = filteredTeams > 0 && filteredTeamWins * 3 < filteredTeams;
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const effectiveFeatureSignature = useMemo(() => JSON.stringify(effectiveCharacterFeatures), [effectiveCharacterFeatures]);
    const appliedFeatureSignature = useMemo(() => JSON.stringify(appliedCharacterFeatures), [appliedCharacterFeatures]);
    const filtersDirty = effectiveFeatureSignature !== appliedFeatureSignature;
    const hasRunQuery = queryVersion > 0;
    const runQuery = () => {
        setAppliedCharacterFeatures(effectiveCharacterFeatures);
        setQueryVersion((current) => current + 1);
        setSelectedRowKey(null);
    };

    useEffect(() => {
        if (selectedRowKey && !rows.some(row => row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined)) {
            setSelectedRowKey(null);
        }
    }, [rows, selectedRowKey]);

    useEffect(() => {
        if (filtersDirty && selectedRowKey !== null) setSelectedRowKey(null);
    }, [filtersDirty, selectedRowKey]);

    const canDrilldown = !!skillStats;
    const isAptitudeProperty = (property: FilterProperty) =>
        property === "aptGround" || property === "aptDistance" || property === "aptStyle";

    const renderRow = (row: AggRow) => {
        const stratColor = row.strategy !== undefined
            ? (activeStrategyColors[row.strategy] ?? "#718096")
            : undefined;
        const rowCanDrilldown = canDrilldown && row.cardId !== undefined && row.strategy !== undefined;
        const isSelected = rowCanDrilldown && selectedRowKey === row.key;
        const iconUrl = row.charaId !== undefined && row.cardId !== undefined
            ? getCharaIcon(`${row.charaId}_${row.cardId}`)
            : null;
        return (
            <React.Fragment key={row.key}>
                <tr
                    className={`exp-row${rowCanDrilldown ? " exp-row--clickable" : ""}${isSelected ? " exp-row--selected" : ""}`}
                    onClick={rowCanDrilldown ? () => setSelectedRowKey(current => current === row.key ? null : row.key) : undefined}
                >
                    <td className="exp-td exp-td--name">
                        {iconUrl && (
                            <div className="exp-card-portrait">
                                <img src={iconUrl} alt=""
                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </div>
                        )}
                        {stratColor && <span className="exp-dot" style={{ background: stratColor }} />}
                        <span className="exp-name-block">
                            <span>{row.label}</span>
                            {row.sublabel && <span className="exp-sublabel">{row.sublabel}</span>}
                        </span>
                    </td>
                    <td className="exp-td exp-td--r">{row.entries}</td>
                    {showTeamsColumn && <td className="exp-td exp-td--r">{row.teams}</td>}
                    <td className="exp-td exp-td--r">
                        {row.wins}
                        {row.entries > 0 && <span className="exp-wins-pct"> ({formatPercent(row.awPct)}%)</span>}
                    </td>
                </tr>
                {isSelected && selectedRow && drilldownHorses.length > 0 && (
                    <tr className="exp-drilldown-row">
                        <td className="exp-drilldown-cell" colSpan={drilldownColSpan}>
                            <div className="stcp-drilldown">
                                <div className="stcp-drilldown-header">
                                    <div className="stcp-drilldown-title">
                                        Top performers for {selectedRow.label} ({STRATEGY_NAMES[selectedRow.strategy!]})
                                    </div>
                                    <div className="stcp-drilldown-subtitle">
                                        Unique umas ranked by Bayesian-adjusted win rate across all appearances.
                                    </div>
                                </div>
                                <div className="stcp-team-members-row">
                                    {drilldownHorses.map(({ horse, bayesianWinRate, winRate, appearances }, i) => (
                                        <div key={i} className="sa-reps-drilldown-card">
                                            <div className="sa-reps-drilldown-winrate">
                                                <span className="sa-adj-pct">{(bayesianWinRate * 100).toFixed(0)}%</span>
                                                <span className="sa-pipe"> | </span>
                                                <span className="sa-raw-pct">{(winRate * 100).toFixed(0)}% ({appearances})</span>
                                            </div>
                                            <TeamMemberCard horse={horse} skillStats={skillStats!} strategyColors={activeStrategyColors} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

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
                        <span className="exp-subsection-title">Your Team</span>
                        <span className="exp-subsection-note">
                            Each card matches a different uma on your team.
                            <ExplorerInfoIcon
                                id="explorer-filter-types-tooltip"
                                tip={
                                    <div className="exp-tooltip-copy">
                                        <div><strong>is / is not</strong>: controls whether the matched uma can be the selected character.</div>
                                        <div><strong>Include / Exclude</strong>: controls whether this full card definition must be present or absent on the team.</div>
                                        <div>Different included cards must be fulfilled by different umas on the same team.</div>
                                    </div>
                                }
                            />
                        </span>
                        <div className="exp-subsection-actions">
                            {filtersDirty && <span className="exp-dirty-note">Unsaved filter changes</span>}
                            <button
                                className="exp-run-btn"
                                onClick={runQuery}
                                disabled={!bootstrap || queryLoading || (!filtersDirty && hasRunQuery)}
                            >
                                {queryLoading ? "Running..." : "Run Query"}
                            </button>
                        </div>
                    </div>
                    <div className="exp-feature-list">
                        {characterFeatures.map(feature => (
                            <div key={feature.id} className="exp-feature-card">
                                <div className="exp-feature-header">
                                    <span className="exp-feature-label">Character</span>
                                    <div className="exp-toggle">
                                        <button
                                            className={`exp-toggle-btn${feature.characterMatchMode === "is" ? " active" : ""}`}
                                            onClick={() => updateCharacterFeature(feature.id, { characterMatchMode: "is" })}
                                        >
                                            is
                                        </button>
                                        <button
                                            className={`exp-toggle-btn${feature.characterMatchMode === "isNot" ? " active" : ""}`}
                                            onClick={() => updateCharacterFeature(feature.id, { characterMatchMode: "isNot" })}
                                        >
                                            is not
                                        </button>
                                    </div>
                                    <CharaSelect variants={cardVariants} value={feature.cardId} onChange={cardId => updateCharacterFeature(feature.id, { cardId })} />
                                    <span className="exp-as-label">as</span>
                                    <select
                                        className="exp-select"
                                        value={feature.cardStrategy ?? ""}
                                        onChange={e => updateCharacterFeature(feature.id, { cardStrategy: e.target.value === "" ? null : Number(e.target.value) })}
                                    >
                                        <option value="">any strategy</option>
                                        {STRATEGIES.map(s => (
                                            <option key={s} value={s}>{STRATEGY_NAMES[s] ?? `Strategy ${s}`}</option>
                                        ))}
                                    </select>
                                    <div className="exp-feature-actions">
                                        <div className="exp-toggle exp-toggle--card-mode">
                                            <button
                                                className={`exp-toggle-btn${feature.cardMode === "include" ? " active" : ""}`}
                                                onClick={() => updateCharacterFeature(feature.id, { cardMode: "include" })}
                                            >
                                                Include
                                            </button>
                                            <button
                                                className={`exp-toggle-btn${feature.cardMode === "exclude" ? " active" : ""}`}
                                                onClick={() => updateCharacterFeature(feature.id, { cardMode: "exclude" })}
                                            >
                                                Exclude
                                            </button>
                                        </div>
                                        <button className="exp-remove-btn" onClick={() => removeCharacterFeature(feature.id)}>x</button>
                                    </div>
                                </div>

                                <div className="exp-feature-reqs">
                                    {feature.requirements.map(req => (
                                        <div key={req.id} className="exp-condition-row exp-condition-row--feature">
                                            <select
                                                className="exp-select"
                                                value={req.truthMode}
                                                onChange={e => updateCharacterRequirement(feature.id, req.id, { truthMode: e.target.value as RequirementTruthMode })}
                                            >
                                                <option value="require">requires</option>
                                                <option value="requireNot">requires not</option>
                                            </select>
                                            <select
                                                className="exp-select"
                                                value={req.property}
                                                onChange={e => updateCharacterRequirement(feature.id, req.id, { property: e.target.value as FilterProperty })}
                                            >
                                                {(Object.keys(PROPERTY_LABELS) as FilterProperty[]).map(k => (
                                                    <option key={k} value={k}>{PROPERTY_LABELS[k]}</option>
                                                ))}
                                            </select>

                                            {req.property !== "none" && req.property !== "skill" && req.property !== "supportCard" && !isAptitudeProperty(req.property) && (
                                                <>
                                                    <div className="exp-toggle">
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === ">" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: ">" })}
                                                        >
                                                            {">"}
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === "=" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: "=" })}
                                                        >
                                                            =
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === "<" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: "<" })}
                                                        >
                                                            &lt;
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="exp-stat-input"
                                                        value={req.statValue}
                                                        min={0}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { statValue: Number(e.target.value) })}
                                                    />
                                                </>
                                            )}
                                            {isAptitudeProperty(req.property) && (
                                                <>
                                                    <div className="exp-toggle">
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === ">" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: ">" })}
                                                        >
                                                            {">"}
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === "=" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: "=" })}
                                                        >
                                                            =
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === "<" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: "<" })}
                                                        >
                                                            &lt;
                                                        </button>
                                                    </div>
                                                    <select
                                                        className="exp-select"
                                                        value={req.statValue}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { statValue: Number(e.target.value) })}
                                                    >
                                                        {APTITUDE_GRADE_OPTIONS.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </>
                                            )}

                                            {req.property === "supportCard" && (
                                                <>
                                                    <div className="exp-toggle">
                                                        <button
                                                            className={`exp-toggle-btn${req.supportCardPresent ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { supportCardPresent: true })}
                                                        >
                                                            used
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${!req.supportCardPresent ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { supportCardPresent: false })}
                                                        >
                                                            not used
                                                        </button>
                                                    </div>
                                                    <SupportCardSelect
                                                        variants={supportCardVariants}
                                                        value={req.supportCardId}
                                                        onChange={supportCardId => updateCharacterRequirement(feature.id, req.id, { supportCardId })}
                                                    />
                                                    <select
                                                        className="exp-select"
                                                        value={req.supportCardLb}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { supportCardLb: Number(e.target.value) })}
                                                    >
                                                        {SUPPORT_CARD_LB_OPTIONS.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </>
                                            )}

                                            {req.property === "skill" && (
                                                <>
                                                    <select
                                                        className="exp-select exp-select--wide"
                                                        value={req.skillMode}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { skillMode: e.target.value as SkillFilterMode })}
                                                    >
                                                        <option value="learned">learned</option>
                                                        <option value="activated">activated</option>
                                                    </select>
                                                    <SkillSelect variants={skillVariants} value={req.skillId} onChange={skillId => updateCharacterRequirement(feature.id, req.id, { skillId })} />
                                                </>
                                            )}

                                            <button className="exp-remove-btn" onClick={() => removeCharacterRequirement(feature.id, req.id)}>x</button>
                                        </div>
                                    ))}
                                </div>
                                <button className="exp-add-btn" onClick={() => addCharacterRequirement(feature.id)}>+ Add requirement</button>
                            </div>
                        ))}
                    </div>
                    <button className="exp-add-btn" onClick={addCharacterFeature}>+ Add character filter</button>
                </div>
            </div>

            <div className="exp-panel exp-panel--results">
                {bootstrapLoading || (queryLoading && !queryResult) ? (
                    <div className="exp-empty">Loading explorer data...</div>
                ) : !hasRunQuery ? (
                    <div className="exp-empty">Set your filters, then click Run Query.</div>
                ) : rows.length === 0 ? (
                    <div className="exp-empty">No teams match the current filter.</div>
                ) : (
                    <table className="exp-table">
                        <thead>
                            <tr>
                                <th className="exp-th" onClick={() => handleSort("label")}>
                                    {hasCharacterFilter ? "Character / Style" : "Style"} <SortArrow col="label" />
                                </th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("entries")} title="Total horse-race appearances">
                                    Entries <SortArrow col="entries" />
                                </th>
                                {showTeamsColumn && (
                                    <th className="exp-th exp-th--r" onClick={() => handleSort("teams")} title="Distinct teams that ran this strategy">
                                        Teams <SortArrow col="teams" />
                                    </th>
                                )}
                                <th className="exp-th exp-th--r" onClick={() => handleSort("wins")} title="1st place finishes">
                                    Wins <SortArrow col="wins" />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(renderRow)}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ExplorerTab;
