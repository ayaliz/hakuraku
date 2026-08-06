import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { STRATEGY_DISPLAY_ORDER, STRATEGY_NAMES, STYLE_POP_FILTER_OPTIONS, BAYES_UMA, BAYES_TEAM } from "./constants";
import { PieSlice } from "./types";
import type { CharacterTeamRateRow } from "../../../UmaLogsPage/panelData";
import InfoTooltip from "./InfoTooltip";
import { getCharaIcon } from "./utils";

type BubblePoint = {
    key: string;
    label: string;
    charaId: number;
    cardId: number;
    strategyId: number;
    popPct: number;
    stylePopPct: number;
    winRate: number;
    count: number;
    teamWinRate: number;
};

interface BubblePlotPanelProps {
    rawPopSlices: PieSlice[];
    rawWinsSlices: PieSlice[];
    strategyColors: Record<number, string>;
    characterTeamRates?: CharacterTeamRateRow[];
}

export function BubblePlotPanel({ rawPopSlices, rawWinsSlices, strategyColors, characterTeamRates }: BubblePlotPanelProps) {
    const [hovered, setHovered] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [minPopPct, setMinPopPct] = useState<0 | 1 | 3 | 5>(3);
    const [hiddenStrategies, setHiddenStrategies] = useState<Record<number, boolean>>(
        () => Object.fromEntries(STRATEGY_DISPLAY_ORDER.map((sid) => [sid, false])) as Record<number, boolean>
    );

    useEffect(() => {
        if (!expanded || typeof document === "undefined") return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setExpanded(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [expanded]);

    const winsByKey = useMemo(
        () => new Map(rawWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s.value])),
        [rawWinsSlices],
    );

    const teamWinRateByKey = useMemo((): Map<string, { wins: number; apps: number }> => {
        const result = new Map<string, { wins: number; apps: number }>();
        for (const row of characterTeamRates ?? []) {
            result.set(row.key, { wins: row.wins, apps: row.appearances });
        }
        return result;
    }, [characterTeamRates]);

    const styleAppsByStrategy = useMemo(() => {
        const totals = new Map<number, number>();
        for (const slice of rawPopSlices) {
            if (!slice.charaId) continue;
            const parts = (slice.charaId as string).split('_');
            const strategyId = Number(parts[2]);
            totals.set(strategyId, (totals.get(strategyId) ?? 0) + slice.value);
        }
        return totals;
    }, [rawPopSlices]);

    const allPoints = useMemo((): BubblePoint[] => {
        return rawPopSlices
            .filter(s => s.charaId)
            .map(s => {
                const key = s.charaId as string;
                const parts = key.split('_');
                const wins = winsByKey.get(key) ?? 0;
                const apps = s.value;
                const winRate = apps > 0 ? wins / apps : 0;
                const tw = teamWinRateByKey.get(key);
                const strategyId = Number(parts[2]);
                const styleApps = styleAppsByStrategy.get(strategyId) ?? 0;
                const teamWinRate = tw && tw.apps > 0 ? tw.wins / tw.apps : 0;
                return {
                    key,
                    label: s.fullLabel ?? s.label,
                    charaId: Number(parts[0]),
                    cardId: Number(parts[1]),
                    strategyId,
                    popPct: s.percentage,
                    stylePopPct: styleApps > 0 ? (apps / styleApps) * 100 : 0,
                    winRate,
                    count: apps,
                    teamWinRate,
                };
            })
            .sort((a, b) => b.popPct - a.popPct);
    }, [rawPopSlices, winsByKey, teamWinRateByKey, styleAppsByStrategy]);

    const availableStrategyIds = useMemo(() => {
        const present = new Set(allPoints.map((p) => p.strategyId));
        return STRATEGY_DISPLAY_ORDER.filter((sid) => present.has(sid));
    }, [allPoints]);

    const points = useMemo(() => (
        allPoints.filter((p) => p.stylePopPct >= minPopPct && !hiddenStrategies[p.strategyId])
    ), [allPoints, minPopPct, hiddenStrategies]);

    if (allPoints.length === 0) return null;

    const W = 620, H = 420;
    const PAD = { top: 10, right: 20, bottom: 34, left: 48 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const hasVisiblePoints = points.length > 0;

    const indRates = hasVisiblePoints ? points.map(p => p.winRate) : [BAYES_UMA.PRIOR];
    const xMin = Math.min(...indRates, BAYES_UMA.PRIOR) * 0.85;
    const xMax = Math.max(...indRates, BAYES_UMA.PRIOR) * 1.15;

    const twrValues = hasVisiblePoints ? points.map(p => p.teamWinRate) : [BAYES_TEAM.PRIOR];
    const yMin = Math.min(...twrValues, BAYES_TEAM.PRIOR) * 0.85;
    const yMax = Math.max(...twrValues, BAYES_TEAM.PRIOR) * 1.15;

    const xScale = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * plotW;
    const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const maxPop = hasVisiblePoints ? Math.max(...points.map(p => p.popPct)) : 1;
    const rScale = (pop: number) => 10 + 17 * Math.sqrt(pop / maxPop);

    const yRange = yMax - yMin;
    const yStep = yRange <= 0.04 ? 0.005 : yRange <= 0.08 ? 0.01 : yRange <= 0.2 ? 0.02 : 0.05;
    const yTicks: number[] = [];
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v);

    const xRange = xMax - xMin;
    const xStep = xRange <= 0.04 ? 0.005 : xRange <= 0.08 ? 0.01 : xRange <= 0.2 ? 0.02 : 0.05;
    const xTicks: number[] = [];
    for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) xTicks.push(v);
    const hoveredPoint = hovered ? points.find(p => p.key === hovered) ?? null : null;
    const toggleStrategy = (strategyId: number) => {
        setHiddenStrategies((prev) => ({ ...prev, [strategyId]: !prev[strategyId] }));
    };

    const panel = (
        <div
            className={`sa-panel ca-panel ca-bubble-panel${expanded ? " ca-bubble-panel--expanded" : ""}`}
            role={expanded ? "dialog" : undefined}
            aria-modal={expanded ? true : undefined}
            aria-label={expanded ? "Individual Win% vs Team Win%" : undefined}
        >
            <div className="sa-panel-header">
                <span>
                    Individual Win% vs Team Win%
                    {" "}
                    <InfoTooltip
                        id="individual-vs-team-win-tooltip"
                        tip="Bubble size represents total population."
                    />
                </span>
                <button type="button" className="sa-mobile-expand-btn" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? "Close" : "Expand"}
                </button>
                <div className="bp-pop-filter-toggle">
                    <span className="bp-pop-filter-label">Style pop:</span>
                    {STYLE_POP_FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={`bp-pop-filter-btn${minPopPct === opt.value ? " active" : ""}`}
                            onClick={() => setMinPopPct(opt.value as 0 | 1 | 3 | 5)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="bp-style-legend">
                <span className="bp-style-legend-label">Display:</span>
                {availableStrategyIds.map((strategyId) => {
                    const hidden = hiddenStrategies[strategyId];
                    return (
                        <button
                            key={strategyId}
                            className={`bp-style-chip${hidden ? " bp-style-chip--inactive" : ""}`}
                            onClick={() => toggleStrategy(strategyId)}
                            style={{ "--bp-style-color": strategyColors[strategyId] ?? "#718096" } as React.CSSProperties}
                            type="button"
                        >
                            <span className="bp-style-chip-dot" />
                            {STRATEGY_NAMES[strategyId]}
                        </button>
                    );
                })}
            </div>
            <div className="bp-chart-scroll">
            {points.length === 0 ? (
                <div className="bp-empty-state">No data for the current style filters.</div>
            ) : (
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
                    x1={xScale(BAYES_UMA.PRIOR)} x2={xScale(BAYES_UMA.PRIOR)}
                    y1={PAD.top} y2={PAD.top + plotH}
                    stroke="#718096" strokeWidth={1} strokeDasharray="4,3"
                />
                <text x={xScale(BAYES_UMA.PRIOR) + 3} y={PAD.top + 9} fill="#718096" fontSize={9}>1/9</text>
                <line
                    x1={PAD.left} x2={W - PAD.right}
                    y1={yScale(BAYES_TEAM.PRIOR)} y2={yScale(BAYES_TEAM.PRIOR)}
                    stroke="#718096" strokeWidth={1} strokeDasharray="4,3"
                />
                <text x={W - PAD.right + 4} y={yScale(BAYES_TEAM.PRIOR) + 3} fill="#718096" fontSize={9}>1/3</text>

                {/* Axis labels */}
                <text x={PAD.left + plotW / 2} y={H - 2} textAnchor="middle" fill="#4a5568" fontSize={10}>
                    Individual Win%
                </text>
                <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fill="#4a5568" fontSize={10}
                    transform={`rotate(-90,12,${PAD.top + plotH / 2})`}>
                    Team Win%
                </text>

                {/* Bubbles */}
                {points.map(p => {
                    const cx = xScale(p.winRate);
                    const cy = yScale(p.teamWinRate);
                    const r = rScale(p.popPct);
                    const color = strategyColors[p.strategyId] ?? "#718096";
                    const isHov = hovered === p.key;
                    const icon = getCharaIcon(`${p.charaId}_${p.cardId}`);
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
                            <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={isHov ? 0.55 : 0.38}
                                stroke={isHov ? "#e2e8f0" : color} strokeWidth={isHov ? 2 : 1.5} />
                            {icon && (
                                <image href={icon} x={cx - r + 1.5} y={cy - r + 1.5}
                                    width={(r - 1.5) * 2} height={(r - 1.5) * 2}
                                    clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
                            )}
                        </g>
                    );
                })}
                {hoveredPoint && (() => {
                    const cx = xScale(hoveredPoint.winRate);
                    const cy = yScale(hoveredPoint.teamWinRate);
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
                                Win: {(hoveredPoint.winRate * 100).toFixed(1)}% | Pop: {hoveredPoint.popPct.toFixed(1)}% total
                            </text>
                            <text x={tx + 8} y={ty + 46} fill="#a0aec0" fontSize={10}>
                                Team win: {(hoveredPoint.teamWinRate * 100).toFixed(1)}% | Style pop: {hoveredPoint.stylePopPct.toFixed(1)}%
                            </text>
                        </g>
                    );
                })()}
            </svg>
            )}
            </div>
        </div>
    );

    if (expanded && typeof document !== "undefined") {
        return createPortal(panel, document.body);
    }

    return panel;
}
