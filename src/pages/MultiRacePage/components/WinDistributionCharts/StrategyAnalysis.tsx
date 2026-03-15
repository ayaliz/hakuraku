import React, { useMemo, useState } from "react";
import { STRATEGY_COLORS, STRATEGY_NAMES, STRATEGY_DISPLAY_ORDER, BAYES_TEAM, SAT_MIN_RACE_FRACTION } from "./constants";
import type { StrategyStats, RoomCompositionEntry, TeamCompositionStats, HorseEntry, SkillStats } from "../../types";
import AssetLoader from "../../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { getRankIcon } from "../../../../components/RaceDataPresenter/components/CharaList/rankUtils";
import TeamSampleSelect from "./TeamSampleSelect";
import "./StrategyAnalysis.css";


export type StyleRepEntry = {
    cardId: number;
    charaId: number;
    charaName: string;
    wins: number;
    appearances: number;
    winRate: number;
    bayesianWinRate: number;
};

interface StrategyAnalysisProps {
    strategyStats?: StrategyStats[];
    totalRaces?: number;
    roomCompositions?: RoomCompositionEntry[];
    teamStats?: TeamCompositionStats[];
    styleReps?: Record<number, StyleRepEntry[]>;
    /** UmaLogs-only: full horse list + skill stats to enable team drilldown cards */
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
}

const CHART_BUCKET_SIZE = 1000;
const ANALYSIS_STRATEGY_IDS = STRATEGY_DISPLAY_ORDER;
const REPRESENTATIVE_STRATEGY_IDS = [1, 2, 3, 4] as const;
const strategyOrderIndex = (strategy: number) => {
    const idx = ANALYSIS_STRATEGY_IDS.indexOf(strategy as (typeof ANALYSIS_STRATEGY_IDS)[number]);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
};

type StratBucket = { bucket: number; strategies: Record<number, { apps: number; wins: number }> };

function trimBuckets(buckets: StratBucket[], roomSampleSize: number): StratBucket[] {
    const leadingThreshold = Math.max(1, Math.floor(roomSampleSize * 0.005));
    const trailingThreshold = Math.max(1, Math.floor(roomSampleSize * 0.0005));
    const hasLeadingData = (b: StratBucket) =>
        ANALYSIS_STRATEGY_IDS.some(sid => (b.strategies[sid]?.apps ?? 0) >= leadingThreshold);
    const hasTrailingData = (b: StratBucket) =>
        ANALYSIS_STRATEGY_IDS.some(sid => (b.strategies[sid]?.apps ?? 0) >= trailingThreshold);
    const first = buckets.findIndex(hasLeadingData);
    if (first < 0) return [];
    const last = buckets.length - 1 - [...buckets].reverse().findIndex(hasTrailingData);
    return buckets.slice(first, last + 1);
}

function computeChartBuckets(horses: HorseEntry[]): StratBucket[] {
    const map = new Map<number, Record<number, { apps: number; wins: number }>>();
    for (const h of horses) {
        const b = Math.floor(h.rankScore / CHART_BUCKET_SIZE) * CHART_BUCKET_SIZE;
        if (!map.has(b)) map.set(b, {});
        const strats = map.get(b)!;
        if (!strats[h.strategy]) strats[h.strategy] = { apps: 0, wins: 0 };
        strats[h.strategy].apps++;
        if (h.finishOrder === 1) strats[h.strategy].wins++;
    }
    return Array.from(map.entries())
        .sort(([a], [b]) => a - b)
        .map(([bucket, strategies]) => ({ bucket, strategies }));
}

function WinRateLineChart({ buckets, strategyColors }: { buckets: StratBucket[]; strategyColors: Record<number, string> }) {
    const W = 460, H = 150;
    const ML = 36, MB = 26, MT = 10, MR = 10;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;
    const BASELINE = 1 / 9;
    const n = buckets.length;

    const trailingThreshold = Math.max(1, Math.floor(buckets.reduce((sum, b) => sum + ANALYSIS_STRATEGY_IDS.reduce((s, sid) => s + (b.strategies[sid]?.apps ?? 0), 0), 0) * 0.0005));
    const allWRs = buckets.flatMap(({ strategies }) =>
        ANALYSIS_STRATEGY_IDS.flatMap(sid => {
            const d = strategies[sid];
            return d && d.apps >= trailingThreshold ? [d.wins / d.apps] : [];
        })
    );
    if (allWRs.length === 0) return <span className="sa-no-data">Not enough data (min {trailingThreshold} appearances per bucket)</span>;

    const dataMax = Math.max(...allWRs, BASELINE);
    const axisMax = Math.ceil(dataMax / 0.05) * 0.05 + 0.05;
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => t * axisMax).filter(t => t <= axisMax + 0.001);
    const toX = (i: number) => n > 1 ? ML + (i / (n - 1)) * plotW : ML + plotW / 2;
    const toY = (wr: number) => MT + plotH * (1 - wr / axisMax);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sa-sb-score-svg">
            {yTicks.map(wr => (
                <line key={wr} x1={ML} x2={ML + plotW} y1={toY(wr)} y2={toY(wr)} stroke="#2d3748" strokeWidth={1} />
            ))}
            <line x1={ML} x2={ML + plotW} y1={toY(BASELINE)} y2={toY(BASELINE)}
                stroke="#718096" strokeWidth={1} strokeDasharray="4 3" />
            <text x={ML + plotW + 2} y={toY(BASELINE) + 3} textAnchor="start" fill="#718096" fontSize={8}>1/9</text>
            {yTicks.map(wr => (
                <text key={wr} x={ML - 4} y={toY(wr) + 4} textAnchor="end" fill="#718096" fontSize={9}>{Math.round(wr * 100)}%</text>
            ))}
            {ANALYSIS_STRATEGY_IDS.map(sid => {
                const color = strategyColors[sid];
                let pathD = '';
                let inSeg = false;
                const dots: { key: string; cx: number; cy: number; label: string }[] = [];
                buckets.forEach(({ strategies, bucket }, i) => {
                    const d = strategies[sid];
                    if (d && d.apps >= trailingThreshold) {
                        const x = toX(i).toFixed(1), y = toY(d.wins / d.apps).toFixed(1);
                        pathD += inSeg ? ` L${x},${y}` : `M${x},${y}`;
                        inSeg = true;
                        dots.push({ key: `${sid}-${bucket}`, cx: toX(i), cy: toY(d.wins / d.apps), label: `${STRATEGY_NAMES[sid]}: ${((d.wins / d.apps) * 100).toFixed(1)}% (${d.apps} apps)` });
                    } else {
                        inSeg = false;
                    }
                });
                return (
                    <g key={sid}>
                        {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
                        {dots.map(({ key, cx, cy, label }) => (
                            <circle key={key} cx={cx} cy={cy} r={3} fill={color}><title>{label}</title></circle>
                        ))}
                    </g>
                );
            })}
            {buckets.map(({ bucket }, i) => (
                <text key={bucket} x={toX(i)} y={MT + plotH + 16} textAnchor="middle" fill="#718096" fontSize={8}>{bucket}</text>
            ))}
            <line x1={ML} x2={ML} y1={MT} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
            <line x1={ML} x2={ML + plotW} y1={MT + plotH} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
        </svg>
    );
}


function StyleBreakdownPanel({ strategyStats, totalRaces, allHorses, strategyColors }: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    allHorses?: HorseEntry[];
    strategyColors: Record<number, string>;
}) {
    const [viewMode, setViewMode] = useState<'bars' | 'score'>('bars');
    const sumEntries = strategyStats.reduce((s, st) => s + st.totalRaces, 0);
    const hasScoreData = !!allHorses && allHorses.length > 0;

    const chartBuckets = useMemo(
        () => hasScoreData ? trimBuckets(computeChartBuckets(allHorses!), allHorses!.length) : [],
        [allHorses, hasScoreData]
    );

    const rows = ANALYSIS_STRATEGY_IDS.map(sId => {
        const stat = strategyStats.find(s => s.strategy === sId);
        const winShare = stat && totalRaces > 0 ? (stat.wins / totalRaces) * 100 : 0;
        const pickRate = stat && sumEntries > 0 ? (stat.totalRaces / sumEntries) * 100 : 0;
        return { sId, winShare, pickRate };
    });
    const globalMax = Math.max(...rows.flatMap(r => [r.winShare, r.pickRate]), 1);

    return (
        <div className="sa-panel sa-panel--breakdown">
            <div className="sa-panel-header">
                Style Breakdown
                {hasScoreData && (
                    <div className="sa-sb-view-toggle">
                        <button className={`sa-sb-toggle-btn${viewMode === 'bars' ? ' sa-sb-toggle-btn--active' : ''}`} onClick={() => setViewMode('bars')}>Overview</button>
                        <button className={`sa-sb-toggle-btn${viewMode === 'score' ? ' sa-sb-toggle-btn--active' : ''}`} onClick={() => setViewMode('score')}>By Score</button>
                    </div>
                )}
            </div>
            {viewMode === 'bars' ? (
                rows.map(({ sId, winShare, pickRate }) => {
                    const color = strategyColors[sId];
                    const winW = (winShare / globalMax) * 100;
                    const pickW = (pickRate / globalMax) * 100;
                    return (
                        <div key={sId} className="sa-sb-row">
                            <div className="sa-sb-strategy-label">
                                <span className="sa-sb-dot" style={{ background: color }} />
                                <span className="sa-sb-strategy-name">{STRATEGY_NAMES[sId]}</span>
                            </div>
                            <div className="sa-sb-bar-row">
                                <div className="sa-sb-bar-label">Win%</div>
                                <div className="sa-sb-track sa-sb-track--win">
                                    <div className="sa-sb-bar-fill" style={{ width: `${winW}%`, background: color }} />
                                </div>
                                <div className="sa-sb-value sa-sb-value--win">{winShare.toFixed(1)}%</div>
                            </div>
                            <div className="sa-sb-bar-row">
                                <div className="sa-sb-bar-label">Pop%</div>
                                <div className="sa-sb-track sa-sb-track--pick">
                                    <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${pickW}%` }} />
                                </div>
                                <div className="sa-sb-value sa-sb-value--pick">{pickRate.toFixed(1)}%</div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="sa-sb-score-view">
                    <div className="sa-sb-score-legend">
                        {ANALYSIS_STRATEGY_IDS.map(sid => (
                            <span key={sid} className="sa-sb-score-legend-item">
                                <span className="sa-sb-score-legend-dot" style={{ background: strategyColors[sid] }} />
                                {STRATEGY_NAMES[sid]}
                            </span>
                        ))}
                    </div>
                    <div className="sa-sb-chart-label">Win Rate by Score</div>
                    <WinRateLineChart buckets={chartBuckets} strategyColors={strategyColors} />
                </div>
            )}
        </div>
    );
}

const BASELINE = 1 / 9;

function SaturationPanel({ strategyStats, totalRaces, strategyColors }: { strategyStats: StrategyStats[]; totalRaces: number; strategyColors: Record<number, string> }) {
    const [view, setView] = useState<'self' | 'field'>('self');
    const W = 560, H = 210;
    const ML = 38, MB = 28, MT = 10, MR = 28;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;

    const minRaceCount = Math.max(1, totalRaces * SAT_MIN_RACE_FRACTION);

    const allCounts = new Set<number>();
    const orderedStrategyStats = [...strategyStats].sort((a, b) => strategyOrderIndex(a.strategy) - strategyOrderIndex(b.strategy));
    orderedStrategyStats.forEach(st => {
        (st.saturation ?? []).forEach(b => {
            if (b.raceCount >= minRaceCount) allCounts.add(b.count);
        });
    });
    const counts = Array.from(allCounts).sort((a, b) => a - b);

    if (counts.length === 0) {
        return (
            <div className="sa-panel sa-panel--center">
                <span className="sa-no-data">Not enough data</span>
            </div>
        );
    }

    const allPerRunnerWRs = strategyStats.flatMap(st =>
        (st.saturation ?? [])
            .filter(b => b.raceCount >= minRaceCount && b.count > 0)
            .map(b => (b.wins / b.raceCount) / b.count)
    );
    const dataMax = Math.max(...allPerRunnerWRs, BASELINE, 0.01);
    const axisMax = Math.ceil(dataMax / 0.05) * 0.05;
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => t * axisMax);

    const minCount = counts[0], maxCount = counts[counts.length - 1];
    const xRange = maxCount - minCount || 1;
    const toX = (c: number) => ML + ((c - minCount) / xRange) * plotW;
    const toY = (wr: number) => MT + plotH - (wr / axisMax) * plotH;

    return (
        <div className="sa-panel sa-panel--saturation">
            <div className="sa-panel-header sa-panel-header--sat">
                <span>Effects of style saturation <span title="Per-uma win rate by how many of that style appear in a race. Decreasing lines show that field saturation reduces individual win rate. Note: saturation buckets are precomputed from the full race data." className="sa-info-icon">i</span></span>
                <div className="sa-sat-view-toggle">
                    <button className={`sa-sat-toggle-btn${view === 'self' ? ' sa-sat-toggle-btn--active' : ''}`} onClick={() => setView('self')}>Self</button>
                    <button className={`sa-sat-toggle-btn${view === 'field' ? ' sa-sat-toggle-btn--active' : ''}`} onClick={() => setView('field')}>Field</button>
                </div>
                {view === 'self' && (
                    <div className="sa-sat-legend">
                        {orderedStrategyStats.map(st => (
                            <div key={st.strategy} className="sa-sat-legend-item">
                                <span className="sa-sat-legend-line" style={{ background: strategyColors[st.strategy] }} />
                                <span className="sa-sat-legend-label">{STRATEGY_NAMES[st.strategy]}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="sa-sat-subtitle">
                {view === 'self'
                    ? 'Per-uma win rate vs. # of that style in a room'
                    : 'Per-uma win rate vs. # of each style in the field'}
            </div>
            {view === 'self' ? (
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sa-sat-svg">
                    {yTicks.map(wr => (
                        <line key={wr} x1={ML} x2={ML + plotW} y1={toY(wr)} y2={toY(wr)} stroke="#2d3748" strokeWidth={1} />
                    ))}
                    <line x1={ML} x2={ML + plotW} y1={toY(BASELINE)} y2={toY(BASELINE)}
                        stroke="#718096" strokeWidth={1} strokeDasharray="4 3" />
                    <text x={ML + plotW + 4} y={toY(BASELINE) + 3} textAnchor="start" fill="#718096" fontSize={8}>1/9</text>
                    {yTicks.map(wr => (
                        <text key={wr} x={ML - 5} y={toY(wr) + 4} textAnchor="end" fill="#718096" fontSize={9}>{Math.round(wr * 100)}%</text>
                    ))}
                    {counts.map(c => (
                        <text key={c} x={toX(c)} y={MT + plotH + 16} textAnchor="middle" fill="#718096" fontSize={9}>{c}</text>
                    ))}
                    {orderedStrategyStats.map(st => {
                        const points = (st.saturation ?? [])
                            .filter(b => b.raceCount >= minRaceCount && b.count > 0)
                            .sort((a, b) => a.count - b.count);
                        if (points.length < 1) return null;
                        const color = strategyColors[st.strategy];
                        const ptsStr = points.map(b => `${toX(b.count)},${toY((b.wins / b.raceCount) / b.count)}`).join(" ");
                        return (
                            <g key={st.strategy}>
                                {points.length > 1 && (
                                    <polyline points={ptsStr} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                                )}
                                {points.map(b => {
                                    const wr = (b.wins / b.raceCount) / b.count;
                                    return (
                                        <circle key={b.count} cx={toX(b.count)} cy={toY(wr)}
                                            r={3.5} fill={color} stroke="#1a202c" strokeWidth={1.5}>
                                            <title>{STRATEGY_NAMES[st.strategy]}: {b.count} in room, {(wr * 100).toFixed(1)}% per horse ({b.raceCount} races)</title>
                                        </circle>
                                    );
                                })}
                            </g>
                        );
                    })}
                    <line x1={ML} x2={ML} y1={MT} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
                    <line x1={ML} x2={ML + plotW} y1={MT + plotH} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
                </svg>
            ) : (
                <CrossSaturationView strategyStats={strategyStats} totalRaces={totalRaces} strategyColors={strategyColors} />
            )}
        </div>
    );
}

function CrossSaturationView({ strategyStats, totalRaces, strategyColors }: { strategyStats: StrategyStats[]; totalRaces: number; strategyColors: Record<number, string> }) {
    const W = 380, H = 150;
    const ML = 34, MB = 22, MT = 8, MR = 12;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;
    const BASELINE = 1 / 9;
    const minRaceCount = Math.max(1, totalRaces * SAT_MIN_RACE_FRACTION);

    return (
        <div className="sa-cross-grid">
            <div className="sa-cross-legend">
                {ANALYSIS_STRATEGY_IDS.map(o => (
                    <div key={o} className="sa-sat-legend-item">
                        <span className="sa-sat-legend-line" style={{ background: strategyColors[o] }} />
                        <span className="sa-sat-legend-label">{STRATEGY_NAMES[o]}</span>
                    </div>
                ))}
            </div>
            <div className="sa-cross-charts">
                {ANALYSIS_STRATEGY_IDS.map(subjectStrat => {
                    const subjStat = strategyStats.find(s => s.strategy === subjectStrat);
                    const crossSat = subjStat?.crossSaturation;
                    if (!crossSat) return null;
                    const color = strategyColors[subjectStrat];

                    const allOppCounts = new Set<number>();
                    for (const oStrat of ANALYSIS_STRATEGY_IDS) {
                        (crossSat[oStrat] ?? []).filter(b => b.raceCount >= minRaceCount).forEach(b => allOppCounts.add(b.count));
                    }
                    const oppCounts = Array.from(allOppCounts).sort((a, b) => a - b);
                    if (oppCounts.length === 0) return null;

                    const allYVals: number[] = [BASELINE];
                    for (const oStrat of ANALYSIS_STRATEGY_IDS) {
                        (crossSat[oStrat] ?? []).filter(b => b.raceCount >= minRaceCount && b.subjectCount > 0)
                            .forEach(b => allYVals.push(b.wins / b.subjectCount));
                    }
                    const axisMax = Math.ceil(Math.max(...allYVals, 0.01) / 0.05) * 0.05;
                    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => t * axisMax);

                    const minCount = oppCounts[0], maxCount = oppCounts[oppCounts.length - 1];
                    const xRange = maxCount - minCount || 1;
                    const toX = (c: number) => ML + ((c - minCount) / xRange) * plotW;
                    const toY = (wr: number) => MT + plotH - (wr / axisMax) * plotH;

                    return (
                        <div key={subjectStrat} className="sa-cross-chart">
                            <div className="sa-cross-title" style={{ color }}>
                                {STRATEGY_NAMES[subjectStrat].split(' ')[0]} win%
                            </div>
                            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sa-cross-svg">
                                {yTicks.map(wr => (
                                    <line key={wr} x1={ML} x2={ML + plotW} y1={toY(wr)} y2={toY(wr)} stroke="#2d3748" strokeWidth={1} />
                                ))}
                                <line x1={ML} x2={ML + plotW} y1={toY(BASELINE)} y2={toY(BASELINE)} stroke="#718096" strokeWidth={1} strokeDasharray="4 3" />
                                <text x={ML + plotW + 3} y={toY(BASELINE) + 3} textAnchor="start" fill="#718096" fontSize={8}>1/9</text>
                                {yTicks.map(wr => (
                                    <text key={wr} x={ML - 4} y={toY(wr) + 3} textAnchor="end" fill="#718096" fontSize={9}>{Math.round(wr * 100)}%</text>
                                ))}
                                {oppCounts.map(c => (
                                    <text key={c} x={toX(c)} y={MT + plotH + 14} textAnchor="middle" fill="#718096" fontSize={9}>{c}</text>
                                ))}
                                {ANALYSIS_STRATEGY_IDS.map(oStrat => {
                                    const buckets = (crossSat[oStrat] ?? [])
                                        .filter(b => b.raceCount >= minRaceCount && b.subjectCount > 0)
                                        .sort((a, b) => a.count - b.count);
                                    if (buckets.length < 1) return null;
                                    const lineColor = strategyColors[oStrat];
                                    const ptsStr = buckets.map(b => `${toX(b.count)},${toY(b.wins / b.subjectCount)}`).join(' ');
                                    return (
                                        <g key={oStrat}>
                                            {buckets.length > 1 && <polyline points={ptsStr} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />}
                                            {buckets.map(b => (
                                                <circle key={b.count} cx={toX(b.count)} cy={toY(b.wins / b.subjectCount)} r={3} fill={lineColor} stroke="#1a202c" strokeWidth={1}>
                                                    <title>{STRATEGY_NAMES[oStrat]}: {b.count} in room → {(b.wins / b.subjectCount * 100).toFixed(1)}% per horse ({b.raceCount} races)</title>
                                                </circle>
                                            ))}
                                        </g>
                                    );
                                })}
                                <line x1={ML} x2={ML} y1={MT} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
                                <line x1={ML} x2={ML + plotW} y1={MT + plotH} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
                            </svg>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function CompositionSection({ strategyStats, totalRaces, roomCompositions, strategyColors }: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    roomCompositions: RoomCompositionEntry[];
    strategyColors: Record<number, string>;
}) {
    const top10 = roomCompositions.slice(0, 10);
    const avgCounts = ANALYSIS_STRATEGY_IDS.map(sId => {
        const stat = strategyStats.find(s => s.strategy === sId);
        return totalRaces > 0 ? (stat?.totalRaces ?? 0) / totalRaces : 0;
    });
    const colMaxes = ANALYSIS_STRATEGY_IDS.map((_, i) =>
        Math.max(...top10.map(c => c.counts[i]), avgCounts[i], 1)
    );

    const asRgba = (color: string, alpha: number) => {
        if (color.startsWith("#")) {
            const hex = color.slice(1);
            const fullHex = hex.length === 3
                ? hex.split("").map((ch) => ch + ch).join("")
                : hex;
            const value = Number.parseInt(fullHex, 16);
            const r = (value >> 16) & 255;
            const g = (value >> 8) & 255;
            const b = value & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        if (color.startsWith("rgb(")) {
            return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
        }
        return color;
    };

    const makeBg = (value: number, colIdx: number) => {
        if (value === 0) return "transparent";
        const intensity = value / colMaxes[colIdx];
        const strategy = ANALYSIS_STRATEGY_IDS[colIdx];
        const base = strategyColors[strategy];
        return asRgba(base, Number((0.15 + intensity * 0.65).toFixed(2)));
    };

    return (
        <div className="sa-comp-section">
            <div className="sa-comp-header">
                Room Composition
                <span title="Top 10 strategy distributions by room frequency. The average row reflects the style totals from Style Breakdown. Frequency % is share of all races with that composition." className="sa-info-icon">i</span>
            </div>
            <table className="sa-comp-table">
                <thead>
                    <tr>
                        {ANALYSIS_STRATEGY_IDS.map(sId => (
                            <th key={sId} className="sa-comp-th">
                                <span className="sa-comp-th-label" style={{ color: strategyColors[sId] }}>
                                    {STRATEGY_NAMES[sId].split(" ")[0].toUpperCase()}
                                </span>
                            </th>
                        ))}
                        <th className="sa-comp-th-freq">
                            <span className="sa-comp-th-freq-label">FREQUENCY</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {avgCounts.map((avg, i) => (
                            <td key={i} className="sa-comp-td sa-comp-td--avg" style={{
                                background: makeBg(avg, i),
                                color: avg > 0 ? "#f7fafc" : "#4a5568",
                            }}>
                                {avg > 0 ? avg.toFixed(1) : "—"}
                            </td>
                        ))}
                        <td className="sa-comp-td-avg-freq">all rooms average</td>
                    </tr>
                    {top10.map((comp, idx) => (
                        <tr key={idx}>
                            {ANALYSIS_STRATEGY_IDS.map((_, i) => {
                                const count = comp.counts[i];
                                return (
                                    <td key={i} className="sa-comp-td sa-comp-td--row" style={{
                                        background: makeBg(count, i),
                                        color: count > 0 ? "#f7fafc" : "#4a5568",
                                    }}>
                                        {count > 0 ? count : "—"}
                                    </td>
                                );
                            })}
                            <td className="sa-comp-td-freq">{(comp.rate * 100).toFixed(1)}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function StyleRepsPanel({ styleReps, allHorses, skillStats, strategyColors }: {
    styleReps: Record<number, StyleRepEntry[]>;
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
}) {
    const [selected, setSelected] = useState<{ cardId: number; strategy: number; charaName: string } | null>(null);
    const canDrilldown = !!(allHorses && skillStats);

    const drilldownHorses = useMemo(() => {
        if (!selected || !allHorses) return [];
        const filtered = allHorses.filter(
            h => h.cardId === selected.cardId && h.strategy === selected.strategy && h.rankScore > 0
        );

        // Group by build fingerprint (stats + rankScore) to find per-build win rate across all races
        const buildMap = new Map<string, { rep: HorseEntry; wins: number; appearances: number }>();
        for (const h of filtered) {
            const key = `${h.rankScore}_${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}`;
            if (!buildMap.has(key)) {
                buildMap.set(key, { rep: h, wins: 0, appearances: 0 });
            }
            const entry = buildMap.get(key)!;
            entry.appearances++;
            if (h.finishOrder === 1) entry.wins++;
            // Keep representative with highest rank score (same key means same stats anyway)
        }

        const PRIOR = 1 / 9;
        const K = 54;
        return Array.from(buildMap.values())
            .map(({ rep, wins, appearances }) => ({
                horse: rep,
                bayesianWinRate: (wins + K * PRIOR) / (appearances + K),
                winRate: wins / appearances,
                appearances,
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    }, [selected, allHorses]);

    return (
        <div className="sa-reps-panel">
            <div className="sa-panel-header">
                Style Representatives
                <span title={`Top 5 card+character combos per style ranked by Bayesian-adjusted win rate (prior: 1/9, strength: 54). Requires ≥5 appearances.`} className="sa-info-icon">i</span>
            </div>
            <div className="sa-reps-columns">
                {REPRESENTATIVE_STRATEGY_IDS.map(sId => {
                    const entries = styleReps[sId] ?? [];
                    const color = strategyColors[sId];
                    return (
                        <div key={sId} className="sa-reps-col">
                            <div className="sa-reps-col-header" style={{ color }}>
                                {STRATEGY_NAMES[sId].split(" ")[0].toUpperCase()}
                                <span className="sa-stats-meta">
                                    <span className="sa-meta-adj sa-meta-adj--neutral">Adj. win%</span>
                                    <span className="sa-meta-raw"> | Raw win% (samples)</span>
                                </span>
                            </div>
                            {entries.map(entry => {
                                const src = AssetLoader.getCharaThumb(entry.cardId);
                                const isSelected = selected?.cardId === entry.cardId && selected?.strategy === sId;
                                return (
                                    <div
                                        key={entry.cardId}
                                        className={`sa-reps-entry${canDrilldown ? " sa-stcp-item--clickable" : ""}${isSelected ? " sa-reps-entry--selected" : ""}`}
                                        onClick={canDrilldown ? () => setSelected(
                                            isSelected ? null : { cardId: entry.cardId, strategy: sId, charaName: entry.charaName }
                                        ) : undefined}
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
                                        <div className="sa-reps-stats">
                                            <span className="sa-adj-pct">{(entry.bayesianWinRate * 100).toFixed(0)}%</span>
                                            <span className="sa-pipe"> | </span>
                                            <span className="sa-raw-pct">{(entry.winRate * 100).toFixed(0)}% ({entry.appearances})</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
            {selected && drilldownHorses.length > 0 && skillStats && (
                <div className="stcp-drilldown">
                    <div className="stcp-drilldown-header">
                        <div className="stcp-drilldown-title">
                            Top performers for {selected.charaName} ({STRATEGY_NAMES[selected.strategy]})
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
                                <TeamMemberCard horse={horse} skillStats={skillStats} strategyColors={strategyColors} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const MIN_STYLE_APPEARANCES = 20;
const MAX_STYLE_ITEMS = 10;

type StyleTeamEntry = {
    key: string;
    strategies: number[];
    label: string;
    appearances: number;
    wins: number;
    winRate: number;
    bayesianWinRate: number;
};

function aggregateStyleTeams(teamStats: TeamCompositionStats[]): StyleTeamEntry[] {
    const map = new Map<string, { strategies: number[]; appearances: number; wins: number }>();
    for (const t of teamStats) {
        const strategies = t.members.map(m => m.strategy).sort((a, b) => strategyOrderIndex(a) - strategyOrderIndex(b));
        const key = strategies.join('_');
        if (!map.has(key)) map.set(key, { strategies, appearances: 0, wins: 0 });
        const e = map.get(key)!;
        e.appearances += t.appearances;
        e.wins += t.wins;
    }
    return Array.from(map.entries()).map(([key, e]) => ({
        key,
        strategies: e.strategies,
        label: e.strategies.map(s => (STRATEGY_NAMES[s] ?? String(s)).split(" ")[0]).join(" · "),
        appearances: e.appearances,
        wins: e.wins,
        winRate: e.wins / e.appearances,
        bayesianWinRate: (e.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (e.appearances + BAYES_TEAM.K),
    }));
}

const MIN_TEAM_APPEARANCES = 5;

function makeMemberKey(h: { charaId: number; cardId: number; strategy: number }): string {
    return `${h.charaId}_${h.cardId}_${h.strategy}`;
}

function makeCompositionKey(members: { cardId: number; strategy: number }[]): string {
    return members
        .slice()
        .sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy))
        .map(m => `${m.cardId}_${m.strategy}`)
        .join("__");
}

function resolveIconSkillId(id: number): number {
    const s = String(id);
    return s.startsWith("9") ? parseInt("1" + s.slice(1), 10) : id;
}

// Grade letter map — 1=G … 8=S (see charaProperLabels in UMDatabaseUtils)
const GRADE_LETTERS: Record<number, string> = { 1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S" };

// Aptitude display labels
const APT_GROUND_LABEL = "Ground";
const APT_DISTANCE_LABEL = "Distance";

interface TeamMemberCardProps {
    horse: HorseEntry;
    skillStats: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
}

export const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ horse, skillStats, strategyColors }) => {
    const [open, setOpen] = useState(false);

    const skillIconMap = useMemo<Map<number, number>>(() => {
        const map = new Map<number, number>();
        for (const [id, s] of Object.entries(UMDatabaseWrapper.skills)) {
            if (s.iconId) map.set(+id, s.iconId);
        }
        return map;
    }, []);

    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const strategyColor = activeStrategyColors[horse.strategy] ?? "#718096";
    const strategyName = STRATEGY_NAMES[horse.strategy] ?? `Strategy ${horse.strategy}`;
    const cardName = UMDatabaseWrapper.cards[horse.cardId]?.name ?? null;
    const rankInfo = getRankIcon(horse.rankScore);

    const portraitUrl = AssetLoader.getCharaThumb(horse.cardId);
    const iconUrlFallback = AssetLoader.getCharaIcon(horse.charaId);

    const styleIconName: Record<number, string> = { 1: "front", 2: "pace", 3: "late", 4: "end" };
    const moodIconName: Record<number, string> = { 1: "awful", 2: "bad", 3: "normal", 4: "good", 5: "great" };
    const styleIcon = AssetLoader.getStatIcon(styleIconName[horse.strategy] ?? "front");
    const moodIcon = AssetLoader.getStatIcon(moodIconName[horse.motivation] ?? "normal");

    const totalSkillPoints = useMemo(() => {
        let total = 0;
        for (const skillId of horse.learnedSkillIds) {
            const base = UMDatabaseWrapper.skillNeedPoints[skillId] ?? 0;
            let upgrade = 0;
            if (UMDatabaseWrapper.skills[skillId]?.rarity === 2) {
                const lastDigit = skillId % 10;
                const flippedId = lastDigit === 1 ? skillId + 1 : skillId - 1;
                upgrade = UMDatabaseWrapper.skillNeedPoints[flippedId] ?? 0;
            } else if (UMDatabaseWrapper.skills[skillId]?.rarity === 1 && skillId % 10 === 1) {
                const pairedId = skillId + 1;
                if (UMDatabaseWrapper.skills[pairedId]?.rarity === 1) {
                    upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
                }
            }
            total += base + upgrade;
        }
        return total;
    }, [horse.learnedSkillIds]);

    const getSkillName = (id: number) =>
        skillStats.get(id)?.skillName ?? UMDatabaseWrapper.skillName(id);

    const getSkillIconUrl = (id: number) => {
        const iconId = skillIconMap.get(resolveIconSkillId(id));
        return iconId ? AssetLoader.getSkillIcon(iconId) : null;
    };

    // For profile view we only care about the raw skill list, not whether a skill happened to
    // activate in a specific match. Merge learned + activated IDs into a single set.
    const allSkillIds = Array.from(
        new Set<number>([
            ...Array.from(horse.learnedSkillIds),
            ...Array.from(horse.activatedSkillIds),
        ])
    );

    const renderSkillChip = (id: number, activated: boolean) => {
        const name = getSkillName(id);
        const icon = getSkillIconUrl(id);
        return (
            <div
                key={id}
                title={`[${id}] ${name}`}
                className={`fup-skill-chip ${activated ? "fup-skill-chip--activated" : "fup-skill-chip--learned"}`}
            >
                {icon && (
                    <img
                        src={icon}
                        alt=""
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                )}
                <span className="fup-skill-chip-name">{name}</span>
            </div>
        );
    };

    const baseStats: [string, string, number][] = [
        ["speed", "Speed", horse.speed],
        ["stamina", "Stamina", horse.stamina],
        ["power", "Power", horse.pow],
        ["guts", "Guts", horse.guts],
        ["wit", "Wit", horse.wiz],
    ];

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const el = e.currentTarget;
        if (el.src !== iconUrlFallback) el.src = iconUrlFallback;
        else el.style.display = "none";
    };

    return (
        <>
            <div
                role="button"
                onClick={() => setOpen(true)}
                className="fastest-card stcp-member-card"
            >
                <div className="fastest-card-label">{horse.charaName}</div>
                <div className="fastest-card-portrait" style={{ border: `2px solid ${strategyColor}` }}>
                    <img src={portraitUrl} alt={horse.charaName} onError={handleImgError} />
                </div>
                <div className="fastest-card-value-row">
                    <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--sm" />
                    <div className="fastest-card-time">
                        {horse.rankScore.toLocaleString()}
                    </div>
                </div>
                <div className="fastest-card-hint">Click for full profile →</div>
            </div>

            {open && (
                <div className="stcp-overlay" onClick={() => setOpen(false)}>
                    <div className="stcp-modal" onClick={e => e.stopPropagation()}>
                        <div className="stcp-modal-header">
                            <div className="fup-modal-title">Team Member — Full Profile</div>
                            <button className="stcp-modal-close" onClick={() => setOpen(false)}>×</button>
                        </div>
                        <div className="stcp-modal-body">
                            <div className="fup-identity">
                                <div className="fup-portrait" style={{ border: `3px solid ${strategyColor}` }}>
                                    <img src={portraitUrl} alt={horse.charaName} onError={handleImgError} />
                                </div>
                                <div className="fup-identity-info">
                                    <div className="fup-name">{horse.charaName}</div>
                                    {cardName && <div className="fup-card-name">{cardName}</div>}
                                    <div className="fup-rank-row">
                                        <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--md" />
                                        <span className="fup-rank-score">{horse.rankScore.toLocaleString()}</span>
                                    </div>
                                </div>
                                {horse.supportCardIds.length > 0 && (
                                    <div className="fup-deck">
                                        {horse.supportCardIds.map((id, i) => (
                                            <div key={i} className="fup-deck-card">
                                                <img
                                                    src={AssetLoader.getSupportCardIcon(id)}
                                                    alt=""
                                                    className="fup-deck-card-img"
                                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                />
                                                <div className="fup-deck-card-lb">LB{horse.supportCardLimitBreaks[i] ?? 0}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="fup-stat-row">
                                <div className="fup-stats">
                                    {baseStats.map(([key, statLabel, value]) => (
                                        <span key={key} className="fup-stat-item">
                                            <img src={AssetLoader.getStatIcon(key)} alt={statLabel} width={20} height={20} />
                                            <span className="fup-stat-value">{value}</span>
                                        </span>
                                    ))}
                                    {totalSkillPoints > 0 && (
                                        <span className="fup-stat-item" title="Undiscounted SP value of learned skills">
                                            <img src={AssetLoader.getStatIcon("hint")} alt="Skill Points" width={20} height={20} />
                                            <span className="fup-stat-value">{totalSkillPoints}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="fup-divider" />
                                <div className="fup-style-mood">
                                    <img src={styleIcon} alt={strategyName} title={strategyName} className="fup-style-icon" />
                                    <img
                                        src={moodIcon}
                                        alt={moodIconName[horse.motivation]}
                                        title={moodIconName[horse.motivation]}
                                        className="fup-style-icon"
                                    />
                                </div>
                                {(horse.aptGround !== undefined || horse.aptDistance !== undefined || horse.aptStyle !== undefined) && (
                                    <>
                                        <div className="fup-divider" />
                                        <div className="fup-aptitudes">
                                            {horse.aptGround !== undefined && (
                                                <div className="fup-apt-item">
                                                    <span className="fup-apt-cat">{APT_GROUND_LABEL}</span>
                                                    <img
                                                        src={AssetLoader.getGradeIcon(GRADE_LETTERS[horse.aptGround]) ?? ""}
                                                        alt={GRADE_LETTERS[horse.aptGround] ?? "?"}
                                                        className="fup-apt-icon"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                </div>
                                            )}
                                            {horse.aptDistance !== undefined && (
                                                <div className="fup-apt-item">
                                                    <span className="fup-apt-cat">{APT_DISTANCE_LABEL}</span>
                                                    <img
                                                        src={AssetLoader.getGradeIcon(GRADE_LETTERS[horse.aptDistance]) ?? ""}
                                                        alt={GRADE_LETTERS[horse.aptDistance] ?? "?"}
                                                        className="fup-apt-icon"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                </div>
                                            )}
                                            {horse.aptStyle !== undefined && (
                                                <div className="fup-apt-item">
                                                    <span className="fup-apt-cat">Style</span>
                                                    <img
                                                        src={AssetLoader.getGradeIcon(GRADE_LETTERS[horse.aptStyle]) ?? ""}
                                                        alt={GRADE_LETTERS[horse.aptStyle] ?? "?"}
                                                        className="fup-apt-icon"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {allSkillIds.length > 0 && (
                                <div className="fup-skills-section">
                                    <div className="fup-skills-heading fup-skills-heading--learned">
                                        Skills ({allSkillIds.length})
                                    </div>
                                    <div className="fup-skills-list">
                                        {allSkillIds.map((id) => renderSkillChip(id, false))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

function StyleTeamCompositionPanel({
    teamStats,
    allHorses,
    skillStats,
    strategyColors,
}: {
    teamStats: TeamCompositionStats[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
}) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedTeamIdx, setSelectedTeamIdx] = useState(0);

    const all = aggregateStyleTeams(teamStats).filter(e => e.appearances >= MIN_STYLE_APPEARANCES);
    if (all.length === 0) return null;

    const sorted = [...all].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    const overperformers = sorted.filter(e => e.bayesianWinRate > BAYES_TEAM.PRIOR).slice(0, MAX_STYLE_ITEMS);
    const underperformers = sorted.filter(e => e.bayesianWinRate < BAYES_TEAM.PRIOR).slice(-MAX_STYLE_ITEMS).reverse();
    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const canDrilldown = !!(allHorses && skillStats);

    const representativeByCompositionAndMemberKey = useMemo(() => {
        if (!allHorses) return new Map<string, Map<string, HorseEntry>>();
        const raceMap = new Map<string, HorseEntry[]>();
        for (const h of allHorses) {
            if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, []);
            raceMap.get(h.raceId)!.push(h);
        }

        const byComp = new Map<string, Map<string, HorseEntry>>();
        for (const raceHorses of raceMap.values()) {
            const teamMap = new Map<number, HorseEntry[]>();
            for (const h of raceHorses) {
                if (h.teamId <= 0) continue;
                if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, []);
                teamMap.get(h.teamId)!.push(h);
            }

            for (const team of teamMap.values()) {
                if (team.length !== 3) continue;
                const compKey = makeCompositionKey(team.map(h => ({ cardId: h.cardId, strategy: h.strategy })));
                if (!byComp.has(compKey)) byComp.set(compKey, new Map());
                const memberMap = byComp.get(compKey)!;
                for (const h of team) {
                    const memberKey = makeMemberKey({ charaId: h.charaId, cardId: h.cardId, strategy: h.strategy });
                    const existing = memberMap.get(memberKey);
                    if (!existing || h.rankScore > existing.rankScore) memberMap.set(memberKey, h);
                }
            }
        }
        return byComp;
    }, [allHorses]);

    const drilldownTeams = useMemo(() => {
        if (!selectedKey) return [];
        return teamStats
            .filter(t => t.members.map(m => m.strategy).sort((a, b) => strategyOrderIndex(a) - strategyOrderIndex(b)).join("_") === selectedKey)
            .filter(t => t.appearances >= MIN_TEAM_APPEARANCES)
            .map(t => ({
                team: t,
                bayesianWinRate: (t.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (t.appearances + BAYES_TEAM.K),
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    }, [selectedKey, teamStats]);

    const renderItem = (e: StyleTeamEntry, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const isSelected = selectedKey === e.key;
        return (
            <div
                key={e.key}
                className={`sa-stcp-item${canDrilldown ? " sa-stcp-item--clickable" : ""}${isSelected ? " sa-stcp-item--selected" : ""}`}
                onClick={canDrilldown ? () => {
                    setSelectedTeamIdx(0);
                    setSelectedKey(k => k === e.key ? null : e.key);
                } : undefined}
            >
                <div className="sa-stcp-dots">
                    {e.strategies.map((s, i) => (
                        <span key={i} className="sa-stcp-dot" style={{ background: strategyColors[s] ?? "#718096" }} />
                    ))}
                </div>
                <div className="sa-stcp-name">{e.label}</div>
                <div className="sa-stcp-stats">
                    <span className="sa-adj-pct" style={{ color: valueColor }}>{(e.bayesianWinRate * 100).toFixed(0)}%</span>
                    <span className="sa-pipe"> | </span>
                    <span className="sa-raw-pct">{(e.winRate * 100).toFixed(0)}% ({e.appearances})</span>
                </div>
            </div>
        );
    };

    const idx = Math.min(selectedTeamIdx, Math.max(0, drilldownTeams.length - 1));
    const selectedTeam = drilldownTeams[idx] ?? null;
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
    const selectedCompositionKey = selectedTeam ? makeCompositionKey(selectedTeam.team.members) : null;
    const representativeByMemberKey = selectedCompositionKey
        ? (representativeByCompositionAndMemberKey.get(selectedCompositionKey) ?? new Map<string, HorseEntry>())
        : new Map<string, HorseEntry>();

    return (
        <div className="sa-stcp-section">
            <div className="sa-stcp-header">
                Style Composition Performance
                <span title="Win rate of 3-player teams grouped by running style trio. Bayesian prior: 1/3, strength: 18 races. Requires \u226520 appearances." className="sa-info-icon">i</span>
            </div>
            <div className="sa-stcp-columns">
                {overperformers.length > 0 && (
                    <div className="sa-stcp-col">
                        <div className="sa-stcp-col-label sa-stcp-col-label--over">OVERPERFORMERS<span className="sa-stats-meta"><span className="sa-meta-adj sa-meta-adj--over">Adj. win%</span><span className="sa-meta-raw"> | Raw win% (samples)</span></span></div>
                        {overperformers.map(e => renderItem(e, true))}
                    </div>
                )}
                {underperformers.length > 0 && (
                    <div className="sa-stcp-col">
                        <div className="sa-stcp-col-label sa-stcp-col-label--under">UNDERPERFORMERS<span className="sa-stats-meta"><span className="sa-meta-adj sa-meta-adj--under">Adj. win%</span><span className="sa-meta-raw"> | Raw win% (samples)</span></span></div>
                        {underperformers.map(e => renderItem(e, false))}
                    </div>
                )}
            </div>
            {canDrilldown && selectedKey && selectedTeam && (
                <div className="tcp-member-drilldown">
                    {drilldownTeams.length > 1 && (
                        <div className="tcp-rep-team-select">
                            <TeamSampleSelect
                                value={String(idx)}
                                options={teamSelectOptions}
                                onChange={(v) => setSelectedTeamIdx(Number(v))}
                                strategyColors={strategyColors}
                            />
                        </div>
                    )}
                    <div className="stcp-team-members-row">
                        {selectedTeam.team.members.map((m, i) => {
                            const rep = representativeByMemberKey.get(makeMemberKey(m));
                            if (!rep) {
                                return (
                                    <div key={i} className="stcp-member-card stcp-member-card--placeholder">
                                        <div className="stcp-member-placeholder-label">{m.charaName}</div>
                                        <div className="stcp-member-placeholder-note">No sample profile available</div>
                                    </div>
                                );
                            }
                            return <TeamMemberCard key={i} horse={rep} skillStats={skillStats!} strategyColors={strategyColors} />;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

const StrategyAnalysis: React.FC<StrategyAnalysisProps> = ({
    strategyStats,
    totalRaces,
    roomCompositions,
    teamStats,
    styleReps,
    allHorses,
    skillStats,
    strategyColors,
}) => {
    const hasData = strategyStats && strategyStats.length > 0 && totalRaces != null && totalRaces > 0;
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;

    return (
        <div className="pie-chart-container sa-main">
            {hasData ? (
                <>
                    <div className="sa-top-panels-row">
                        <StyleBreakdownPanel strategyStats={strategyStats!} totalRaces={totalRaces!} allHorses={allHorses} strategyColors={activeStrategyColors} />
                        <SaturationPanel strategyStats={strategyStats!} totalRaces={totalRaces!} strategyColors={activeStrategyColors} />
                    </div>
                    {roomCompositions && (
                        <div className="sa-comp-row">
                            <CompositionSection
                                strategyStats={strategyStats!}
                                totalRaces={totalRaces!}
                                roomCompositions={roomCompositions ?? []}
                                strategyColors={activeStrategyColors}
                            />
                            {styleReps && <StyleRepsPanel styleReps={styleReps} allHorses={allHorses} skillStats={skillStats} strategyColors={activeStrategyColors} />}
                        </div>
                    )}
                    {teamStats && teamStats.length > 0 && (
                        <StyleTeamCompositionPanel
                            teamStats={teamStats}
                            allHorses={allHorses}
                            skillStats={skillStats}
                            strategyColors={activeStrategyColors}
                        />
                    )}
                </>
            ) : null}
        </div>
    );
};

export default StrategyAnalysis;
