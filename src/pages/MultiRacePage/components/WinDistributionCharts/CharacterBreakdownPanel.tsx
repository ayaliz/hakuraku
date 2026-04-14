import React, { useEffect, useMemo, useState } from "react";
import { STRATEGY_NAMES, BAYES_UMA } from "./constants";
import type { HorseEntry, SkillStats } from "../../types";
import InfoTooltip from "./InfoTooltip";
import { TeamMemberCard } from "./TeamMemberCard";
import { getCharaIcon } from "./utils";
import { PieSlice } from "./types";
import {
    type SerializedHorseEntry,
    deserializeHorseEntry,
    deserializeHorseEntries,
} from "./shared";

const CHAR_BAYES_K = BAYES_UMA.K;
const CHAR_BAYES_PRIOR = BAYES_UMA.PRIOR;

type CharacterRepDrilldownEntry = {
    horse: HorseEntry;
    teamHorses?: HorseEntry[];
    teamOptions?: Array<{
        value: string;
        members: Array<{ cardId: number; strategy: number; winRatePct: number }>;
        samples: number;
        teamHorses: HorseEntry[];
    }>;
    bayesianWinRate: number;
    winRate: number;
    appearances: number;
};

type CharacterRepDrilldownResponse = {
    cmId: string;
    courseId: number;
    strategy: number;
    cardId: number;
    samples: Array<{
        horse: SerializedHorseEntry;
        teamHorses: SerializedHorseEntry[];
        teamOptions: Array<{
            value: string;
            members: Array<{ cardId: number; strategy: number; winRatePct: number }>;
            samples: number;
            teamHorses: SerializedHorseEntry[];
        }>;
        bayesianWinRate: number;
        winRate: number;
        appearances: number;
    }>;
};

function buildStyleRepUrl(cmId: string, courseId: number, strategy: number, cardId: number, apiBase = ""): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/style-reps/${strategy}/${cardId}`;
}

export interface CharacterBreakdownPanelProps {
    title: string;
    rawWinsSlices: PieSlice[];
    rawPopSlices: PieSlice[];
    /** When provided, used instead of rawWinsSlices for adj. win rate computation. */
    rawRatingWinsSlices?: PieSlice[];
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
    includeZeroWinEntries?: boolean;
    useBayesianWinRate?: boolean;
}

export function CharacterBreakdownPanel({
    title,
    rawWinsSlices,
    rawPopSlices,
    rawRatingWinsSlices,
    cmId,
    courseId,
    apiBase,
    apiMode,
    skillStats,
    strategyColors,
    includeZeroWinEntries = false,
    useBayesianWinRate = true,
}: CharacterBreakdownPanelProps) {
    const [sortMode, setSortMode] = useState<"pop" | "winRate">("pop");
    const [fullDataOpen, setFullDataOpen] = useState(false);
    const [fullDataSort, setFullDataSort] = useState<"pop" | "winRate">("pop");
    const [selectedCharKey, setSelectedCharKey] = useState<string | null>(null);
    const [selectedInModal, setSelectedInModal] = useState<string | null>(null);
    const [drilldownCache, setDrilldownCache] = useState<Record<string, CharacterRepDrilldownEntry[]>>({});
    const [drilldownLoadingKeys, setDrilldownLoadingKeys] = useState<string[]>([]);
    const [drilldownError, setDrilldownError] = useState<string | null>(null);

    const rawWinsByKey = new Map(rawWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const rawPopByKey = new Map(rawPopSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const ratingWinsSlices = rawRatingWinsSlices ?? rawWinsSlices;
    const ratingWinsByKey = new Map(ratingWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));

    type CharRow = {
        key: string;
        label: string;
        fullLabel?: string;
        strategyId?: number;
        cardId?: number;
        winsPct: number;
        popPct: number;
        adjRate: number;
        rawRate: number;
        displayRate: number;
        winsCount: number;
        appsCount: number;
    };

    const buildCharRow = (key: string): CharRow => {
        const w = rawWinsByKey.get(key);
        const p = rawPopByKey.get(key);
        const ratingWins = ratingWinsByKey.get(key)?.value ?? 0;
        const apps = p?.value ?? 0;
        const adjRate = (ratingWins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
        const rawRate = apps > 0 ? ratingWins / apps : 0;
        return {
            key,
            label: p?.label ?? w?.label ?? key,
            fullLabel: p?.fullLabel ?? w?.fullLabel,
            strategyId: w?.strategyId ?? p?.strategyId,
            cardId: w?.cardId ?? p?.cardId,
            winsPct: w?.percentage ?? 0,
            popPct: p?.percentage ?? 0,
            adjRate,
            rawRate,
            displayRate: useBayesianWinRate ? adjRate : rawRate,
            winsCount: ratingWins,
            appsCount: apps,
        };
    };

    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canDrilldown = !!(skillStats && canUseApiDrilldown);

    const ensureApiDrilldown = async (charKey: string | null) => {
        if (!canUseApiDrilldown || !charKey || drilldownCache[charKey] || drilldownLoadingKeys.includes(charKey)) return;
        const parts = charKey.split("_");
        const cardId = Number(parts[1]);
        const strategy = Number(parts[2]);
        if (!Number.isFinite(cardId) || !Number.isFinite(strategy) || !cmId || !courseId) return;
        setDrilldownLoadingKeys((keys) => [...keys, charKey]);
        setDrilldownError(null);
        try {
            const response = await fetch(buildStyleRepUrl(cmId, courseId, strategy, cardId, apiBase ?? ""));
            if (!response.ok) throw new Error(`Failed to load representative samples (${response.status})`);
            const payload = await response.json() as CharacterRepDrilldownResponse;
            const entries = payload.samples.map((sample) => ({
                horse: deserializeHorseEntry(sample.horse),
                teamHorses: deserializeHorseEntries(sample.teamHorses),
                teamOptions: sample.teamOptions.map((option) => ({
                    ...option,
                    teamHorses: deserializeHorseEntries(option.teamHorses),
                })),
                bayesianWinRate: sample.bayesianWinRate,
                winRate: sample.winRate,
                appearances: sample.appearances,
            }));
            setDrilldownCache((cache) => ({ ...cache, [charKey]: entries }));
        } catch (error) {
            console.error("Failed to load character representative samples", { charKey, error });
            setDrilldownError(error instanceof Error ? error.message : "Failed to load representative samples.");
            setDrilldownCache((cache) => ({ ...cache, [charKey]: [] }));
        } finally {
            setDrilldownLoadingKeys((keys) => keys.filter((key) => key !== charKey));
        }
    };

    useEffect(() => {
        if (canUseApiDrilldown && selectedCharKey) {
            void ensureApiDrilldown(selectedCharKey);
        }
    }, [canUseApiDrilldown, selectedCharKey]);

    useEffect(() => {
        if (canUseApiDrilldown && selectedInModal) {
            void ensureApiDrilldown(selectedInModal);
        }
    }, [canUseApiDrilldown, selectedInModal]);

    const drilldownHorses = useMemo(
        () => (selectedCharKey ? (drilldownCache[selectedCharKey] ?? []) : []),
        [drilldownCache, selectedCharKey],
    );
    const drilldownInModal = useMemo(
        () => (selectedInModal ? (drilldownCache[selectedInModal] ?? []) : []),
        [drilldownCache, selectedInModal],
    );

    const allPopKeys = rawPopSlices
        .filter(s => s.charaId && (includeZeroWinEntries || (ratingWinsByKey.get(s.charaId as string)?.value ?? 0) > 0))
        .map(s => s.charaId as string);

    const allWinRateKeys = [...allPopKeys]
        .map(key => {
            const apps = rawPopByKey.get(key)?.value ?? 0;
            const wins = ratingWinsByKey.get(key)?.value ?? 0;
            const adjRate = (wins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
            const rawRate = apps > 0 ? wins / apps : 0;
            return { key, rate: useBayesianWinRate ? adjRate : rawRate, wins };
        })
        .filter(x => includeZeroWinEntries || x.wins > 0)
        .sort((a, b) => b.rate - a.rate)
        .map(x => x.key);

    const topPopKeys = allPopKeys.slice(0, 6);
    const topWinRateKeys = allWinRateKeys.slice(0, 6);
    const activeKeys = sortMode === "pop" ? topPopKeys : topWinRateKeys;
    const chars = activeKeys.map(buildCharRow);

    const fullDataKeys = fullDataSort === "pop" ? allPopKeys : allWinRateKeys;
    const fullDataChars = fullDataKeys.map(buildCharRow);

    const maxPct = Math.max(...chars.flatMap(c => [c.displayRate * 100, c.popPct]), 1);
    const fullDataMaxPct = Math.max(...fullDataChars.flatMap(c => [c.displayRate * 100, c.popPct]), 1);

    const renderBarRow = (c: CharRow, maxP: number, inModal: boolean = false) => {
        const icon = getCharaIcon(c.key);
        const color = strategyColors[c.strategyId ?? 0] ?? "#718096";
        const isSelected = inModal ? selectedInModal === c.key : selectedCharKey === c.key;
        return (
            <div
                key={c.key}
                className={`sa-sb-row${canDrilldown ? " sa-stcp-item--clickable" : ""}${isSelected ? " ca-row--selected" : ""}`}
                onClick={canDrilldown ? () => {
                    if (inModal) setSelectedInModal(k => k === c.key ? null : c.key);
                    else setSelectedCharKey(k => k === c.key ? null : c.key);
                } : undefined}
            >
                <div className="ca-char-label">
                    <div className="ca-portrait-wrap">
                        <div className="ca-portrait-ring" style={{ background: color }} />
                        {icon && (
                            <img src={icon} className="ca-portrait-img" alt=""
                                onError={evt => { (evt.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        )}
                    </div>
                    <span className="ca-char-name" title={c.label}>{c.fullLabel ?? c.label}</span>
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label">Win%</div>
                    <div className="sa-sb-track sa-sb-track--win">
                        <div className="sa-sb-bar-fill" style={{ width: `${(c.displayRate * 100 / maxP) * 100}%`, background: color }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--win ca-bar-value-wide">
                        {(c.displayRate * 100).toFixed(1)}% <span className="ca-abs-count">({c.winsCount})</span>
                    </div>
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label">Pop%</div>
                    <div className="sa-sb-track sa-sb-track--pick">
                        <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(c.popPct / maxP) * 100}%` }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--pick ca-bar-value-wide">
                        {c.popPct.toFixed(1)}% <span className="ca-abs-count">({c.appsCount})</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderDrilldown = (horses: CharacterRepDrilldownEntry[], charKey: string | null) => {
        if (!charKey || !skillStats) return null;
        const parts = charKey.split('_');
        const strategy = Number(parts[2]);
        const charaName = buildCharRow(charKey).fullLabel ?? buildCharRow(charKey).label;
        const isLoading = drilldownLoadingKeys.includes(charKey);
        if (isLoading) {
            return (
                <div className="stcp-drilldown">
                    <div className="stcp-drilldown-header">
                        <div className="stcp-drilldown-title">
                            Top performers for {charaName} ({STRATEGY_NAMES[strategy]})
                        </div>
                    </div>
                    <div className="sa-no-data">Loading representative samples...</div>
                </div>
            );
        }
        if (horses.length === 0) {
            return (
                <div className="stcp-drilldown">
                    <div className="stcp-drilldown-header">
                        <div className="stcp-drilldown-title">
                            Top performers for {charaName} ({STRATEGY_NAMES[strategy]})
                        </div>
                    </div>
                    <div className="sa-no-data">{drilldownError ?? "No representative samples available."}</div>
                </div>
            );
        }
        return (
            <div className="stcp-drilldown">
                <div className="stcp-drilldown-header">
                    <div className="stcp-drilldown-title">
                        Top performers for {charaName} ({STRATEGY_NAMES[strategy]})
                    </div>
                    <div className="stcp-drilldown-subtitle">
                        Unique umas ranked by Bayesian-adjusted win rate across all appearances.
                    </div>
                </div>
                <div className="stcp-team-members-row">
                    {horses.map(({ horse, teamHorses, teamOptions, bayesianWinRate, winRate, appearances }, i) => (
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
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="sa-panel ca-panel">
            <div className="sa-panel-header">
                <span>
                    {title}{" "}
                    <InfoTooltip
                        id={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-info`}
                        tip="11.11% win% is average."
                    />
                </span>
                <div className="ca-sort-toggle">
                    <button
                        className={`ca-sort-btn${sortMode === "pop" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("pop")}>
                        Top Population
                    </button>
                    <button
                        className={`ca-sort-btn${sortMode === "winRate" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("winRate")}>
                        {useBayesianWinRate ? "Top Adj. Win%" : "Top Win%"}
                    </button>
                </div>
            </div>

            {chars.length === 0 ? (
                <span className="sa-no-data">No data</span>
            ) : (
                <>
                    {chars.map(c => renderBarRow(c, maxPct, false))}
                    {renderDrilldown(drilldownHorses, selectedCharKey)}
                    <button className="ca-view-all-btn" onClick={() => setFullDataOpen(true)}>
                        View full data
                    </button>
                </>
            )}

            {fullDataOpen && (
                <div className="cdt-overlay" onClick={() => setFullDataOpen(false)}>
                    <div className="cdt-modal ca-full-data-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">{title}</h3>
                            <div className="ca-sort-toggle ca-sort-toggle--modal">
                                <button
                                    className={`ca-sort-btn${fullDataSort === "pop" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setFullDataSort("pop")}>
                                    By Population
                                </button>
                                <button
                                    className={`ca-sort-btn${fullDataSort === "winRate" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setFullDataSort("winRate")}>
                                    {useBayesianWinRate ? "By Adj. Win%" : "By Win%"}
                                </button>
                            </div>
                            <button className="cdt-close-btn" onClick={() => setFullDataOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            {fullDataChars.map(c => (
                                <React.Fragment key={c.key}>
                                    {renderBarRow(c, fullDataMaxPct, true)}
                                    {selectedInModal === c.key && renderDrilldown(drilldownInModal, selectedInModal)}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
