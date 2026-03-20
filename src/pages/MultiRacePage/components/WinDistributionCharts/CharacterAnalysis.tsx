import React, { useState, useMemo, useRef, useEffect } from "react";
import "./CharacterAnalysis.css";
import { STRATEGY_COLORS, STRATEGY_NAMES, STRATEGY_DISPLAY_ORDER, BAYES_UMA, BAYES_TEAM } from "./constants";
import { PieSlice } from "./types";
import { getCharaIcon } from "./utils";
import type { CharacterStats, HorseEntry, SkillStats, TeamCompositionStats } from "../../types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { TeamMemberCard } from "./StrategyAnalysis";
import TeamSampleSelect from "./TeamSampleSelect";

type SynergyEntityInfo = {
    key: string;         // `${cardId}_${strategy}`
    cardId: number;
    strategy: number;
    charaId: number;
    cardName: string;
    charaName: string;
    totalCoApps: number;
};

type StyleCompEntry = {
    key: string; // sorted strategies joined by _
    strategies: number[];
    label: string;
    appearances: number;
    wins: number;
    winRate: number;
    bayesianWinRate: number;
};

const strategyOrderIndex = (strategy: number) => {
    const idx = STRATEGY_DISPLAY_ORDER.indexOf(strategy as (typeof STRATEGY_DISPLAY_ORDER)[number]);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
};

interface SynergyEntitySelectProps {
    entities: SynergyEntityInfo[];
    value: string | null;
    onChange: (key: string) => void;
    strategyColors: Record<number, string>;
}

const SynergyEntitySelect: React.FC<SynergyEntitySelectProps> = ({ entities, value, onChange, strategyColors }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = entities.find(e => e.key === value) ?? entities[0] ?? null;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    if (!selected) return null;

    const q = search.toLowerCase();
    const filtered = q
        ? entities.filter(e =>
            e.cardName.toLowerCase().includes(q) ||
            e.charaName.toLowerCase().includes(q) ||
            (STRATEGY_NAMES[e.strategy] ?? "").toLowerCase().includes(q))
        : entities;

    const selectedIcon = getCharaIcon(`${selected.charaId}_${selected.cardId}`);
    const selectedStratColor = strategyColors[selected.strategy] ?? "#718096";

    return (
        <div ref={ref} className="syn-select">
            <button type="button" onClick={() => setOpen(o => !o)} className="syn-select-btn">
                <div className="syn-select-portrait">
                    <div className="syn-select-ring" style={{ background: selectedStratColor }} />
                    {selectedIcon && (
                        <img src={selectedIcon} alt="" className="syn-select-img"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    )}
                </div>
                <span className="syn-select-text">
                    <span className="syn-select-name">{selected.charaName}</span>
                    <span className="syn-select-strategy" style={{ color: selectedStratColor }}>{STRATEGY_NAMES[selected.strategy] ?? `Strategy ${selected.strategy}`}</span>
                </span>
                <span className="syn-select-arrow">▾</span>
            </button>

            {open && (
                <div className="syn-select-dropdown">
                    <div className="syn-select-search">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="syn-select-input"
                        />
                    </div>
                    <div className="syn-select-list">
                        {filtered.length === 0 ? (
                            <div className="syn-select-no-matches">No matches</div>
                        ) : filtered.map(e => {
                            const icon = getCharaIcon(`${e.charaId}_${e.cardId}`);
                            const stratColor = strategyColors[e.strategy] ?? "#718096";
                            const isSelected = e.key === (value ?? entities[0]?.key);
                            return (
                                <div
                                    key={e.key}
                                    onClick={() => { onChange(e.key); setOpen(false); }}
                                    className={`syn-select-option${isSelected ? " syn-select-option--active" : ""}`}
                                >
                                    <div className="syn-select-portrait">
                                        <div className="syn-select-ring" style={{ background: stratColor }} />
                                        {icon && (
                                            <img src={icon} alt="" className="syn-select-img"
                                                onError={e2 => { (e2.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                        )}
                                    </div>
                                    <span>
                                        <span className="syn-select-option-name">{e.charaName}</span>
                                        <span className="syn-select-option-strategy" style={{ color: stratColor }}>{STRATEGY_NAMES[e.strategy] ?? `Strategy ${e.strategy}`}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const CHAR_BAYES_K = BAYES_UMA.K;
const CHAR_BAYES_PRIOR = BAYES_UMA.PRIOR;

interface CharacterBreakdownPanelProps {
    title: string;
    rawWinsSlices: PieSlice[];
    rawPopSlices: PieSlice[];
    /** When provided, used instead of rawWinsSlices for adj. win rate computation. */
    rawRatingWinsSlices?: PieSlice[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
}

function CharacterBreakdownPanel({ title, rawWinsSlices, rawPopSlices, rawRatingWinsSlices, allHorses, skillStats, strategyColors }: CharacterBreakdownPanelProps) {
    const [sortMode, setSortMode] = useState<"pop" | "winRate">("pop");
    const [fullDataOpen, setFullDataOpen] = useState(false);
    const [fullDataSort, setFullDataSort] = useState<"pop" | "winRate">("pop");
    const [selectedCharKey, setSelectedCharKey] = useState<string | null>(null);
    const [selectedInModal, setSelectedInModal] = useState<string | null>(null);

    const rawWinsByKey = new Map(rawWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const rawPopByKey = new Map(rawPopSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const ratingWinsSlices = rawRatingWinsSlices ?? rawWinsSlices;
    const ratingWinsByKey = new Map(ratingWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));

    type CharRow = { key: string; label: string; fullLabel?: string; strategyId?: number; cardId?: number; winsPct: number; popPct: number; adjRate: number; winsCount: number; appsCount: number; };

    const buildCharRow = (key: string): CharRow => {
        const w = rawWinsByKey.get(key);
        const p = rawPopByKey.get(key);
        const ratingWins = ratingWinsByKey.get(key)?.value ?? 0;
        const apps = p?.value ?? 0;
        const adjRate = (ratingWins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
        return {
            key,
            label: p?.label ?? w?.label ?? key,
            fullLabel: p?.fullLabel ?? w?.fullLabel,
            strategyId: w?.strategyId ?? p?.strategyId,
            cardId: w?.cardId ?? p?.cardId,
            winsPct: w?.percentage ?? 0,
            popPct: p?.percentage ?? 0,
            adjRate,
            winsCount: ratingWins,
            appsCount: apps,
        };
    };

    const canDrilldown = !!(allHorses && skillStats);

    const buildDrilldown = (charKey: string | null) => {
        if (!charKey || !allHorses) return [];
        const parts = charKey.split('_');
        const cardId = Number(parts[1]);
        const strategy = Number(parts[2]);
        const filtered = allHorses.filter(h => h.cardId === cardId && h.strategy === strategy && h.rankScore > 0);
        const buildMap = new Map<string, { rep: HorseEntry; wins: number; appearances: number }>();
        for (const h of filtered) {
            const bkey = `${h.rankScore}_${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}`;
            if (!buildMap.has(bkey)) buildMap.set(bkey, { rep: h, wins: 0, appearances: 0 });
            const entry = buildMap.get(bkey)!;
            entry.appearances++;
            if (h.finishOrder === 1) entry.wins++;
        }
        const PRIOR = 1 / 9, K = 54;
        return Array.from(buildMap.values())
            .map(({ rep, wins, appearances }) => ({
                horse: rep,
                bayesianWinRate: (wins + K * PRIOR) / (appearances + K),
                winRate: wins / appearances,
                appearances,
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    };

    const drilldownHorses = useMemo(() => buildDrilldown(selectedCharKey), [selectedCharKey, allHorses]);
    const drilldownInModal = useMemo(() => buildDrilldown(selectedInModal), [selectedInModal, allHorses]);

    const allPopKeys = rawPopSlices.filter(s => s.charaId && (ratingWinsByKey.get(s.charaId as string)?.value ?? 0) > 0).map(s => s.charaId as string);

    const allWinRateKeys = [...allPopKeys]
        .map(key => {
            const apps = rawPopByKey.get(key)?.value ?? 0;
            const wins = ratingWinsByKey.get(key)?.value ?? 0;
            const adjRate = (wins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
            return { key, adjRate, wins };
        })
        .filter(x => x.wins > 0)
        .sort((a, b) => b.adjRate - a.adjRate)
        .map(x => x.key);

    const topPopKeys = allPopKeys.slice(0, 6);
    const topWinRateKeys = allWinRateKeys.slice(0, 6);
    const activeKeys = sortMode === "pop" ? topPopKeys : topWinRateKeys;
    const chars = activeKeys.map(buildCharRow);

    const fullDataKeys = fullDataSort === "pop" ? allPopKeys : allWinRateKeys;
    const fullDataChars = fullDataKeys.map(buildCharRow);

    const maxPct = Math.max(...chars.flatMap(c => [c.adjRate * 100, c.popPct]), 1);
    const fullDataMaxPct = Math.max(...fullDataChars.flatMap(c => [c.adjRate * 100, c.popPct]), 1);

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
                        <div className="sa-sb-bar-fill" style={{ width: `${(c.adjRate * 100 / maxP) * 100}%`, background: color }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                        {(c.adjRate * 100).toFixed(1)}% <span className="ca-abs-count">({c.winsCount})</span>
                    </div>
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label">Pop%</div>
                    <div className="sa-sb-track sa-sb-track--pick">
                        <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(c.popPct / maxP) * 100}%` }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                        {c.popPct.toFixed(1)}% <span className="ca-abs-count">({c.appsCount})</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderDrilldown = (horses: typeof drilldownHorses, charKey: string | null) => {
        if (!charKey || horses.length === 0 || !skillStats) return null;
        const parts = charKey.split('_');
        const strategy = Number(parts[2]);
        const charaName = buildCharRow(charKey).fullLabel ?? buildCharRow(charKey).label;
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
                    {horses.map(({ horse, bayesianWinRate, winRate, appearances }, i) => (
                        <div key={i} className="sa-reps-drilldown-card">
                            <div className="sa-reps-drilldown-winrate">
                                <span className="sa-adj-pct">{(bayesianWinRate * 100).toFixed(0)}%</span>
                                <span className="sa-pipe"> | </span>
                                <span className="sa-raw-pct">{(winRate * 100).toFixed(0)}% ({appearances})</span>
                            </div>
                            <TeamMemberCard horse={horse} skillStats={skillStats} strategyColors={strategyColors} allHorses={allHorses} />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="sa-panel ca-panel">
            <div className="sa-panel-header">
                <span>{title} <span title="11.11% win% is average." className="sa-info-icon">i</span></span>
                <div className="ca-sort-toggle">
                    <button
                        className={`ca-sort-btn${sortMode === "pop" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("pop")}>
                        Top Population
                    </button>
                    <button
                        className={`ca-sort-btn${sortMode === "winRate" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("winRate")}>
                        Top Adj. Win%
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
                                    By Adj. Win%
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

interface BubblePlotPanelProps {
    rawPopSlices: PieSlice[];
    rawWinsSlices: PieSlice[];
    strategyColors: Record<number, string>;
    allHorses?: HorseEntry[];
}

type BubblePoint = {
    key: string;
    label: string;
    charaId: number;
    cardId: number;
    strategyId: number;
    popPct: number;
    adjWinRate: number;
    count: number;
    adjTeamWinRate: number;
};

const TEAM_BAYES_K = 18;
const TEAM_BAYES_PRIOR = 1 / 3;

const POP_FILTER_OPTS = [
    { value: 0.5, label: "≥0.5%" },
    { value: 1,   label: "≥1%" },
    { value: 2,   label: "≥2%" },
    { value: 0,   label: "All" },
] as const;

function BubblePlotPanel({ rawPopSlices, rawWinsSlices, strategyColors, allHorses }: BubblePlotPanelProps) {
    const [hovered, setHovered] = useState<string | null>(null);
    const [minPopPct, setMinPopPct] = useState<number>(1);

    const winsByKey = useMemo(
        () => new Map(rawWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s.value])),
        [rawWinsSlices],
    );

    const teamWinRateByKey = useMemo((): Map<string, { wins: number; apps: number }> => {
        if (!allHorses) return new Map();
        // Build per-race winner team
        const raceWinTeam = new Map<string, number>();
        const raceHorses = new Map<string, HorseEntry[]>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            if (!raceHorses.has(h.raceId)) raceHorses.set(h.raceId, []);
            raceHorses.get(h.raceId)!.push(h);
        }
        for (const [raceId, horses] of raceHorses) {
            const winner = horses.reduce((best, h) => h.finishOrder < best.finishOrder ? h : best, horses[0]);
            raceWinTeam.set(raceId, winner.teamId);
        }
        // Accumulate team wins/apps per character key
        const result = new Map<string, { wins: number; apps: number }>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            const key = `${h.charaId}_${h.cardId}_${h.strategy}`;
            const entry = result.get(key) ?? { wins: 0, apps: 0 };
            entry.apps++;
            if (raceWinTeam.get(h.raceId) === h.teamId) entry.wins++;
            result.set(key, entry);
        }
        return result;
    }, [allHorses]);

    const points = useMemo((): BubblePoint[] => {
        const all = rawPopSlices
            .filter(s => s.charaId)
            .map(s => {
                const key = s.charaId as string;
                const parts = key.split('_');
                const wins = winsByKey.get(key) ?? 0;
                const apps = s.value;
                const adjWinRate = (wins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
                const tw = teamWinRateByKey.get(key);
                const adjTeamWinRate = tw
                    ? (tw.wins + TEAM_BAYES_K * TEAM_BAYES_PRIOR) / (tw.apps + TEAM_BAYES_K)
                    : TEAM_BAYES_PRIOR;
                return {
                    key,
                    label: s.fullLabel ?? s.label,
                    charaId: Number(parts[0]),
                    cardId: Number(parts[1]),
                    strategyId: Number(parts[2]),
                    popPct: s.percentage,
                    adjWinRate,
                    count: apps,
                    adjTeamWinRate,
                };
            })
            .sort((a, b) => b.popPct - a.popPct);
        return minPopPct > 0 ? all.filter(p => p.popPct >= minPopPct) : all;
    }, [rawPopSlices, winsByKey, teamWinRateByKey, minPopPct]);

    if (points.length === 0) return null;

    // SVG layout
    const W = 620, H = 420;
    const PAD = { top: 10, right: 20, bottom: 34, left: 48 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // X: individual win rate, Y: team win rate, size: popularity
    const indRates = points.map(p => p.adjWinRate);
    const xMin = Math.min(...indRates, CHAR_BAYES_PRIOR) * 0.85;
    const xMax = Math.max(...indRates, CHAR_BAYES_PRIOR) * 1.15;

    const twrValues = points.map(p => p.adjTeamWinRate);
    const yMin = Math.min(...twrValues, TEAM_BAYES_PRIOR) * 0.85;
    const yMax = Math.max(...twrValues, TEAM_BAYES_PRIOR) * 1.15;

    const xScale = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * plotW;
    const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    // Bubble radius: sqrt-scaled by pick rate (popularity)
    const maxPop = Math.max(...points.map(p => p.popPct));
    const rScale = (pop: number) => 10 + 17 * Math.sqrt(pop / maxPop);

    // Y-axis ticks
    const yRange = yMax - yMin;
    const yStep = yRange <= 0.04 ? 0.005 : yRange <= 0.08 ? 0.01 : yRange <= 0.2 ? 0.02 : 0.05;
    const yTicks: number[] = [];
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v);

    // X-axis ticks
    const xRange = xMax - xMin;
    const xStep = xRange <= 0.04 ? 0.005 : xRange <= 0.08 ? 0.01 : xRange <= 0.2 ? 0.02 : 0.05;
    const xTicks: number[] = [];
    for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) xTicks.push(v);
    const hoveredPoint = hovered ? points.find(p => p.key === hovered) ?? null : null;

    return (
        <div className="sa-panel ca-panel">
            <div className="sa-panel-header">
                <span>Individual Win% vs Team Win% <span title="Bubble size represents population." className="sa-info-icon">i</span></span>
                <div className="bp-pop-filter-toggle">
                    <span className="bp-pop-filter-label">Pop:</span>
                    {POP_FILTER_OPTS.map(opt => (
                        <button
                            key={opt.value}
                            className={`bp-pop-filter-btn${minPopPct === opt.value ? " active" : ""}`}
                            onClick={() => setMinPopPct(opt.value)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
            <svg className="score-winrate-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                {/* Y grid + labels */}
                {yTicks.map(v => (
                    <g key={v}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="#2d3748" strokeWidth={1} />
                        <text x={PAD.left - 6} y={yScale(v) + 3} textAnchor="end" fill="#718096" fontSize={10}>
                            {(v * 100).toFixed(1)}%
                        </text>
                    </g>
                ))}

                {/* X grid + labels */}
                {xTicks.map(v => (
                    <g key={v}>
                        <line x1={xScale(v)} x2={xScale(v)} y1={PAD.top} y2={PAD.top + plotH} stroke="#2d3748" strokeWidth={1} />
                        <text x={xScale(v)} y={H - PAD.bottom + 14} textAnchor="middle" fill="#718096" fontSize={10}>
                            {(v * 100).toFixed(1)}%
                        </text>
                    </g>
                ))}

                {/* Baselines */}
                <line
                    x1={xScale(CHAR_BAYES_PRIOR)} x2={xScale(CHAR_BAYES_PRIOR)}
                    y1={PAD.top} y2={PAD.top + plotH}
                    stroke="#718096" strokeWidth={1} strokeDasharray="4,3"
                />
                <text x={xScale(CHAR_BAYES_PRIOR) + 3} y={PAD.top + 9} fill="#718096" fontSize={9}>1/9</text>
                <line
                    x1={PAD.left} x2={W - PAD.right}
                    y1={yScale(TEAM_BAYES_PRIOR)} y2={yScale(TEAM_BAYES_PRIOR)}
                    stroke="#718096" strokeWidth={1} strokeDasharray="4,3"
                />
                <text x={W - PAD.right + 4} y={yScale(TEAM_BAYES_PRIOR) + 3} fill="#718096" fontSize={9}>1/3</text>

                {/* Axis labels */}
                <text x={PAD.left + plotW / 2} y={H - 2} textAnchor="middle" fill="#4a5568" fontSize={10}>
                    Adj. Individual Win%
                </text>
                <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fill="#4a5568" fontSize={10}
                    transform={`rotate(-90,12,${PAD.top + plotH / 2})`}>
                    Adj. Team Win%
                </text>

                {/* Bubbles */}
                {points.map(p => {
                    const cx = xScale(p.adjWinRate);
                    const cy = yScale(p.adjTeamWinRate);
                    const r = rScale(p.popPct);
                    const color = strategyColors[p.strategyId] ?? "#718096";
                    const isHov = hovered === p.key;
                    const icon = getCharaIcon(`${p.charaId}_${p.cardId}`);

                    // Unique clipPath id
                    const clipId = `bp-clip-${p.key}`;
                    return (
                        <g key={p.key}
                            onMouseEnter={() => setHovered(p.key)}
                            onMouseLeave={() => setHovered(null)}
                            style={{ cursor: "default" }}>
                            <defs>
                                <clipPath id={clipId}>
                                    <circle cx={cx} cy={cy} r={r - 1.5} />
                                </clipPath>
                            </defs>
                            {/* Strategy-colored ring */}
                            <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={isHov ? 0.55 : 0.38}
                                stroke={isHov ? "#e2e8f0" : color} strokeWidth={isHov ? 2 : 1.5} />
                            {/* Character portrait */}
                            {icon && (
                                <image href={icon} x={cx - r + 1.5} y={cy - r + 1.5}
                                    width={(r - 1.5) * 2} height={(r - 1.5) * 2}
                                    clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
                            )}
                        </g>
                    );
                })}
                {hoveredPoint && (() => {
                    const cx = xScale(hoveredPoint.adjWinRate);
                    const cy = yScale(hoveredPoint.adjTeamWinRate);
                    const r = rScale(hoveredPoint.popPct);
                    const TW = 168, TH = 56;
                    const aboveFits = cy - r - 8 - TH >= PAD.top;
                    const ty = aboveFits ? cy - r - 8 - TH : cy + r + 8;
                    const txRaw = cx - TW / 2;
                    const tx = Math.max(PAD.left, Math.min(txRaw, W - PAD.right - TW));
                    const stratName = (STRATEGY_NAMES[hoveredPoint.strategyId] ?? `Strategy ${hoveredPoint.strategyId}`).split(" ")[0];
                    return (
                        <g>
                            <rect x={tx} y={ty} width={TW} height={TH} rx={4}
                                fill="#1a202c" stroke="#4a5568" strokeWidth={1} opacity={0.95} />
                            <text x={tx + 8} y={ty + 16} fill="#e2e8f0" fontSize={11} fontWeight="bold">
                                {hoveredPoint.label} [{stratName}]
                            </text>
                            <text x={tx + 8} y={ty + 31} fill="#a0aec0" fontSize={10}>
                                Win: {(hoveredPoint.adjWinRate * 100).toFixed(1)}% | Pop: {hoveredPoint.popPct.toFixed(1)}%
                            </text>
                            <text x={tx + 8} y={ty + 46} fill="#a0aec0" fontSize={10}>
                                Team win: {(hoveredPoint.adjTeamWinRate * 100).toFixed(1)}%
                            </text>
                        </g>
                    );
                })()}
            </svg>
        </div>
    );
}

interface CharacterAnalysisProps {
    rawWinsAll: PieSlice[];
    rawWinsOpp: PieSlice[];
    rawPop: PieSlice[];
    spectatorMode?: boolean;
    characterStats?: CharacterStats[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    teamStats?: TeamCompositionStats[];
    strategyColors?: Record<number, string>;
}

const MIN_DRILLDOWN_APPEARANCES = 5;

const CharacterAnalysis: React.FC<CharacterAnalysisProps> = ({
    rawWinsAll,
    rawWinsOpp,
    rawPop,
    spectatorMode,
    characterStats,
    allHorses,
    skillStats,
    teamStats,
    strategyColors,
}) => {
    const [synEntityKey, setSynEntityKey] = useState<string | null>(null);
    const [selectedCompKey, setSelectedCompKey] = useState<string | null>(null);
    const [selectedDrilldownIdx, setSelectedDrilldownIdx] = useState(0);

    useEffect(() => { setSelectedCompKey(null); }, [synEntityKey]);
    useEffect(() => { setSelectedDrilldownIdx(0); }, [selectedCompKey]);

    const synEntities = useMemo((): SynergyEntityInfo[] => {
        if (!allHorses || !characterStats) return [];
        const charaNameMap = new Map(characterStats.map(c => [c.charaId, c.charaName]));
        const entityMap = new Map<string, SynergyEntityInfo>();

        const upsert = (cardId: number, strategy: number, charaId: number, apps: number) => {
            const key = `${cardId}_${strategy}`;
            if (!entityMap.has(key)) {
                const cardName = UMDatabaseWrapper.cards[cardId]?.name ?? charaNameMap.get(charaId) ?? `#${charaId}`;
                entityMap.set(key, { key, cardId, strategy, charaId, cardName, charaName: charaNameMap.get(charaId) ?? `#${charaId}`, totalCoApps: 0 });
            }
            entityMap.get(key)!.totalCoApps += apps;
        };

        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            upsert(h.cardId, h.strategy, h.charaId, 1);
        }

        return Array.from(entityMap.values()).sort((a, b) => b.totalCoApps - a.totalCoApps);
    }, [allHorses, characterStats]);

    const effectiveEntityKey = synEntityKey ?? synEntities[0]?.key ?? null;

    const bestHorseByFullComp = useMemo(() => {
        if (!allHorses) return new Map<string, Map<string, HorseEntry>>();
        const raceMap = new Map<string, HorseEntry[]>();
        for (const h of allHorses) {
            if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, []);
            raceMap.get(h.raceId)!.push(h);
        }
        const result = new Map<string, Map<string, HorseEntry>>();
        for (const raceHorses of raceMap.values()) {
            const teamMap = new Map<number, HorseEntry[]>();
            for (const h of raceHorses) {
                if (h.teamId <= 0) continue;
                if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, []);
                teamMap.get(h.teamId)!.push(h);
            }
            for (const team of teamMap.values()) {
                if (team.length !== 3) continue;
                const sorted = [...team].sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));
                const compKey = sorted.map(h => `${h.cardId}_${h.strategy}`).join("__");
                if (!result.has(compKey)) result.set(compKey, new Map());
                const memberMap = result.get(compKey)!;
                for (const h of sorted) {
                    const mk = `${h.cardId}_${h.strategy}`;
                    const ex = memberMap.get(mk);
                    if (!ex || h.rankScore > ex.rankScore) memberMap.set(mk, h);
                }
            }
        }
        return result;
    }, [allHorses]);

    const drilldownTeams = useMemo(() => {
        if (!selectedCompKey || !teamStats || !effectiveEntityKey) return [];
        const [selCardIdStr, selStrategyStr] = effectiveEntityKey.split('_');
        const selCardId = Number(selCardIdStr);
        const selStrategy = Number(selStrategyStr);
        return teamStats
            .filter(t => {
                const key = t.members.map(m => m.strategy).sort((a, b) => strategyOrderIndex(a) - strategyOrderIndex(b)).join('_');
                return key === selectedCompKey
                    && t.members.some(m => m.cardId === selCardId && m.strategy === selStrategy);
            })
            .filter(t => t.appearances >= MIN_DRILLDOWN_APPEARANCES)
            .map(t => ({
                team: t,
                bayesianWinRate: (t.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (t.appearances + BAYES_TEAM.K),
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    }, [selectedCompKey, teamStats, effectiveEntityKey]);

    const { overperformers, underperformers } = useMemo((): { overperformers: StyleCompEntry[]; underperformers: StyleCompEntry[] } => {
        const empty = { overperformers: [], underperformers: [] };
        if (!allHorses || !effectiveEntityKey) return empty;

        const [selCardIdStr, selStrategyStr] = effectiveEntityKey.split('_');
        const selCardId = Number(selCardIdStr);
        const selStrategy = Number(selStrategyStr);
        if (!Number.isFinite(selCardId) || !Number.isFinite(selStrategy)) return empty;

        // Group by race -> team, tracking if the team won
        const raceMap = new Map<string, Map<number, { horses: HorseEntry[]; teamWon: boolean }>>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, new Map());
            const teamMap = raceMap.get(h.raceId)!;
            if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, { horses: [], teamWon: false });
            const t = teamMap.get(h.teamId)!;
            t.horses.push(h);
            if (h.finishOrder === 1) t.teamWon = true;
        }

        type CompTally = { strategies: number[]; appearances: number; wins: number };
        const compMap = new Map<string, CompTally>();

        for (const teamMap of raceMap.values()) {
            for (const { horses, teamWon } of teamMap.values()) {
                // Only include teams that contain the selected (cardId, strategy) entity
                if (!horses.some(h => h.cardId === selCardId && h.strategy === selStrategy)) continue;
                if (horses.length !== 3) continue;

                const strategies = horses.map(h => h.strategy).sort((a, b) => strategyOrderIndex(a) - strategyOrderIndex(b));
                const key = strategies.join('_');
                if (!compMap.has(key)) compMap.set(key, { strategies, appearances: 0, wins: 0 });
                const tally = compMap.get(key)!;
                tally.appearances++;
                if (teamWon) tally.wins++;
            }
        }

        const MIN_APPEARANCES = 5;
        const MAX_ITEMS = 10;

        const all = Array.from(compMap.entries())
            .map(([key, t]) => {
                const winRate = t.appearances > 0 ? t.wins / t.appearances : 0;
                const bayesianWinRate = (t.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (t.appearances + BAYES_TEAM.K);
                const label = t.strategies.map(s => (STRATEGY_NAMES[s] ?? String(s)).split(" ")[0]).join(" · ");
                return {
                    key,
                    strategies: t.strategies,
                    label,
                    appearances: t.appearances,
                    wins: t.wins,
                    winRate,
                    bayesianWinRate,
                };
            })
            .filter(e => e.appearances >= MIN_APPEARANCES);

        if (all.length === 0) return empty;

        const sorted = [...all].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
        const overperformers = sorted.filter(e => e.bayesianWinRate > BAYES_TEAM.PRIOR).slice(0, MAX_ITEMS);
        const underperformers = sorted.filter(e => e.bayesianWinRate < BAYES_TEAM.PRIOR).slice(-MAX_ITEMS).reverse();
        return { overperformers, underperformers };
    }, [allHorses, effectiveEntityKey]);

    const canDrilldown = !!(teamStats && allHorses && skillStats);
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;

    const renderCompItem = (e: StyleCompEntry, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const isSelected = selectedCompKey === e.key;
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
                <div className="syn-comp-name">{e.label}</div>
                <div className="syn-comp-stats">
                    <span className="sa-adj-pct" style={{ color: valueColor }}>{(e.bayesianWinRate * 100).toFixed(0)}%</span>
                    <span className="sa-pipe"> | </span>
                    <span className="sa-raw-pct">{(e.winRate * 100).toFixed(0)}% ({e.appearances})</span>
                </div>
            </div>
        );
    };

    return (
        <div className="pie-chart-container">
            <div className="sa-top-panels-row">
                <CharacterBreakdownPanel
                    title="Character Breakdown"
                    rawWinsSlices={rawWinsAll}
                    rawPopSlices={rawPop}
                    rawRatingWinsSlices={spectatorMode ? undefined : rawWinsOpp}
                    allHorses={allHorses}
                    skillStats={skillStats}
                    strategyColors={activeStrategyColors}
                />
                {!spectatorMode && (
                    <CharacterBreakdownPanel
                        title="Best Placing Opponent"
                        rawWinsSlices={rawWinsOpp}
                        rawPopSlices={rawPop}
                        allHorses={allHorses}
                        skillStats={skillStats}
                        strategyColors={activeStrategyColors}
                    />
                )}
                {spectatorMode && (
                    <BubblePlotPanel
                        rawPopSlices={rawPop}
                        rawWinsSlices={rawWinsAll}
                        strategyColors={activeStrategyColors}
                        allHorses={allHorses}
                    />
                )}
            </div>

            {spectatorMode && synEntities.length > 0 && (
                <div className="syn-section">
                    <div className="syn-section-header">
                        Style Trio Synergy
                        <span title="Highest win rate team compositions for a specific character." className="sa-info-icon">i</span>
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
                        <div className="syn-no-data">No composition data for this entry.</div>
                    ) : (
                        <div className="syn-tables-row">
                            {overperformers.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--best">
                                        OVERPERFORMERS
                                        <span className="sa-stats-meta"><span className="sa-meta-adj sa-meta-adj--over">Adj. win%</span><span className="sa-meta-raw"> | Raw win% (samples)</span></span>
                                    </div>
                                    {overperformers.map(e => renderCompItem(e, true))}
                                </div>
                            )}
                            {underperformers.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--worst">
                                        UNDERPERFORMERS
                                        <span className="sa-stats-meta"><span className="sa-meta-adj sa-meta-adj--under">Adj. win%</span><span className="sa-meta-raw"> | Raw win% (samples)</span></span>
                                    </div>
                                    {underperformers.map(e => renderCompItem(e, false))}
                                </div>
                            )}
                        </div>
                    )}
                    {canDrilldown && selectedCompKey && drilldownTeams.length > 0 && (() => {
                        const idx = Math.min(selectedDrilldownIdx, drilldownTeams.length - 1);
                        const selectedTeam = drilldownTeams[idx];
                        const compKey = selectedTeam.team.members
                            .map(mem => `${mem.cardId}_${mem.strategy}`)
                            .sort((a, b) => {
                                const [ac, as_] = a.split('_').map(Number);
                                const [bc, bs_] = b.split('_').map(Number);
                                return (ac * 10 + as_) - (bc * 10 + bs_);
                            })
                            .join("__");
                        const memberMap = bestHorseByFullComp.get(compKey) ?? new Map<string, HorseEntry>();
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
                                        return <TeamMemberCard key={i} horse={rep} skillStats={skillStats!} strategyColors={activeStrategyColors} allHorses={allHorses} />;
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
