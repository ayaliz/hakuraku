import React, { useState } from "react";
import { STRATEGY_COLORS, STRATEGY_NAMES, BAYES_TEAM, SAT_MIN_RACE_FRACTION } from "./constants";
import type { StrategyStats, RoomCompositionEntry, TeamCompositionStats } from "../../types";
import AssetLoader from "../../../../data/AssetLoader";
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
}

// ── Panel 1: Style Breakdown (bullet chart) ───────────────────────────────────
function StyleBreakdownPanel({ strategyStats, totalRaces }: { strategyStats: StrategyStats[]; totalRaces: number }) {
    const sumEntries = strategyStats.reduce((s, st) => s + st.totalRaces, 0);

    const rows = [1, 2, 3, 4].map(sId => {
        const stat = strategyStats.find(s => s.strategy === sId);
        const winShare = stat && totalRaces > 0 ? (stat.wins / totalRaces) * 100 : 0;
        const pickRate = stat && sumEntries > 0 ? (stat.totalRaces / sumEntries) * 100 : 0;
        return { sId, winShare, pickRate };
    });
    const globalMax = Math.max(...rows.flatMap(r => [r.winShare, r.pickRate]), 1);

    return (
        <div className="sa-panel">
            <div className="sa-panel-header">
                Style Breakdown
            </div>
            {rows.map(({ sId, winShare, pickRate }) => {
                const color = STRATEGY_COLORS[sId];
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
            })}
        </div>
    );
}

// ── Panel 2: Effects of style saturation ─────────────────────────────────────
const BASELINE = 1 / 9;

function SaturationPanel({ strategyStats, totalRaces }: { strategyStats: StrategyStats[]; totalRaces: number }) {
    const [view, setView] = useState<'self' | 'field'>('self');
    const W = 500, H = 180;
    const ML = 38, MB = 28, MT = 10, MR = 28;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;

    const minRaceCount = Math.max(1, totalRaces * SAT_MIN_RACE_FRACTION);

    const allCounts = new Set<number>();
    strategyStats.forEach(st => {
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
        <div className="sa-panel">
            <div className="sa-panel-header sa-panel-header--sat">
                <span>Effects of style saturation <span title="Per-uma win rate by how many of that style appear in a race. Decreasing lines show that field saturation reduces individual win rate. Note: saturation buckets are precomputed from the full race data." className="sa-info-icon">i</span></span>
                <div className="sa-sat-view-toggle">
                    <button className={`sa-sat-toggle-btn${view === 'self' ? ' sa-sat-toggle-btn--active' : ''}`} onClick={() => setView('self')}>Self</button>
                    <button className={`sa-sat-toggle-btn${view === 'field' ? ' sa-sat-toggle-btn--active' : ''}`} onClick={() => setView('field')}>Field</button>
                </div>
                {view === 'self' && (
                    <div className="sa-sat-legend">
                        {strategyStats.map(st => (
                            <div key={st.strategy} className="sa-sat-legend-item">
                                <span className="sa-sat-legend-line" style={{ background: STRATEGY_COLORS[st.strategy] }} />
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
                    {strategyStats.map(st => {
                        const points = (st.saturation ?? [])
                            .filter(b => b.raceCount >= minRaceCount && b.count > 0)
                            .sort((a, b) => a.count - b.count);
                        if (points.length < 1) return null;
                        const color = STRATEGY_COLORS[st.strategy];
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
                <CrossSaturationView strategyStats={strategyStats} totalRaces={totalRaces} />
            )}
        </div>
    );
}

// ── Cross-saturation: 2×2 grid, one chart per subject style ─────────────────
function CrossSaturationView({ strategyStats, totalRaces }: { strategyStats: StrategyStats[]; totalRaces: number }) {
    const W = 380, H = 150;
    const ML = 34, MB = 22, MT = 8, MR = 12;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;
    const BASELINE = 1 / 9;
    const minRaceCount = Math.max(1, totalRaces * SAT_MIN_RACE_FRACTION);

    return (
        <div className="sa-cross-grid">
            <div className="sa-cross-legend">
                {[1, 2, 3, 4].map(o => (
                    <div key={o} className="sa-sat-legend-item">
                        <span className="sa-sat-legend-line" style={{ background: STRATEGY_COLORS[o] }} />
                        <span className="sa-sat-legend-label">{STRATEGY_NAMES[o]}</span>
                    </div>
                ))}
            </div>
            <div className="sa-cross-charts">
                {[1, 2, 3, 4].map(subjectStrat => {
                    const subjStat = strategyStats.find(s => s.strategy === subjectStrat);
                    const crossSat = subjStat?.crossSaturation;
                    if (!crossSat) return null;
                    const color = STRATEGY_COLORS[subjectStrat];

                    const allOppCounts = new Set<number>();
                    for (const oStrat of [1, 2, 3, 4]) {
                        (crossSat[oStrat] ?? []).filter(b => b.raceCount >= minRaceCount).forEach(b => allOppCounts.add(b.count));
                    }
                    const oppCounts = Array.from(allOppCounts).sort((a, b) => a - b);
                    if (oppCounts.length === 0) return null;

                    const allYVals: number[] = [BASELINE];
                    for (const oStrat of [1, 2, 3, 4]) {
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
                                {[1, 2, 3, 4].map(oStrat => {
                                    const buckets = (crossSat[oStrat] ?? [])
                                        .filter(b => b.raceCount >= minRaceCount && b.subjectCount > 0)
                                        .sort((a, b) => a.count - b.count);
                                    if (buckets.length < 1) return null;
                                    const lineColor = STRATEGY_COLORS[oStrat];
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

// ── Panel 3: Room Composition ──────────────────────────────────────────────────
function CompositionSection({ strategyStats, totalRaces, roomCompositions }: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    roomCompositions: RoomCompositionEntry[];
}) {
    const top10 = roomCompositions.slice(0, 10);
    const avgCounts = [1, 2, 3, 4].map(sId => {
        const stat = strategyStats.find(s => s.strategy === sId);
        return totalRaces > 0 ? (stat?.totalRaces ?? 0) / totalRaces : 0;
    });
    const colMaxes = [0, 1, 2, 3].map(i =>
        Math.max(...top10.map(c => c.counts[i]), avgCounts[i], 1)
    );

    const makeBg = (value: number, colIdx: number) => {
        if (value === 0) return "transparent";
        const intensity = value / colMaxes[colIdx];
        const base = STRATEGY_COLORS[colIdx + 1];
        return base.replace("rgb(", "rgba(").replace(")", `, ${(0.15 + intensity * 0.65).toFixed(2)})`);
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
                        {[1, 2, 3, 4].map(sId => (
                            <th key={sId} className="sa-comp-th">
                                <span className="sa-comp-th-label" style={{ color: STRATEGY_COLORS[sId] }}>
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
                            {[0, 1, 2, 3].map(i => {
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

// ── Style Representatives panel ───────────────────────────────────────────────
function StyleRepsPanel({ styleReps }: { styleReps: Record<number, StyleRepEntry[]> }) {
    return (
        <div className="sa-reps-panel">
            <div className="sa-panel-header">
                Style Representatives
                <span title={`Top 5 card+character combos per style ranked by Bayesian-adjusted win rate (prior: 1/9, strength: 54). Requires ≥5 appearances.`} className="sa-info-icon">i</span>
            </div>
            <div className="sa-reps-columns">
                {[1, 2, 3, 4].map(sId => {
                    const entries = styleReps[sId] ?? [];
                    const color = STRATEGY_COLORS[sId];
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
                                return (
                                    <div key={entry.cardId} className="sa-reps-entry">
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
        </div>
    );
}

// ── Panel 4: Style Composition Performance ────────────────────────────────────
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
        const strategies = t.members.map(m => m.strategy).sort((a, b) => a - b);
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

function StyleTeamCompositionPanel({ teamStats }: { teamStats: TeamCompositionStats[] }) {
    const all = aggregateStyleTeams(teamStats).filter(e => e.appearances >= MIN_STYLE_APPEARANCES);
    if (all.length === 0) return null;

    const sorted = [...all].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    const overperformers = sorted.filter(e => e.bayesianWinRate > BAYES_TEAM.PRIOR).slice(0, MAX_STYLE_ITEMS);
    const underperformers = sorted.filter(e => e.bayesianWinRate < BAYES_TEAM.PRIOR).slice(-MAX_STYLE_ITEMS).reverse();
    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const renderItem = (e: StyleTeamEntry, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        return (
            <div key={e.key} className="sa-stcp-item">
                <div className="sa-stcp-dots">
                    {e.strategies.map((s, i) => (
                        <span key={i} className="sa-stcp-dot" style={{ background: STRATEGY_COLORS[s] ?? "#718096" }} />
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

    return (
        <div className="sa-stcp-section">
            <div className="sa-stcp-header">
                Style Composition Performance
                <span title="Win rate of 3-player teams grouped by running style trio. A team wins when any of its members finishes in 1st place. Bayesian prior: 1/3, strength: 18 races. Requires ≥20 appearances." className="sa-info-icon">i</span>
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
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
const StrategyAnalysis: React.FC<StrategyAnalysisProps> = ({
    strategyStats,
    totalRaces,
    roomCompositions,
    teamStats,
    styleReps,
}) => {
    const hasData = strategyStats && strategyStats.length > 0 && totalRaces != null && totalRaces > 0;

    return (
        <div className="pie-chart-container sa-main">
            {hasData ? (
                <>
                    <div className="sa-top-panels-row">
                        <StyleBreakdownPanel strategyStats={strategyStats!} totalRaces={totalRaces!} />
                        <SaturationPanel strategyStats={strategyStats!} totalRaces={totalRaces!} />
                    </div>
                    {roomCompositions && (
                        <div className="sa-comp-row">
                            <CompositionSection
                                strategyStats={strategyStats!}
                                totalRaces={totalRaces!}
                                roomCompositions={roomCompositions ?? []}
                            />
                            {styleReps && <StyleRepsPanel styleReps={styleReps} />}
                        </div>
                    )}
                    {teamStats && teamStats.length > 0 && (
                        <StyleTeamCompositionPanel teamStats={teamStats} />
                    )}
                </>
            ) : null}
        </div>
    );
};

export default StrategyAnalysis;
