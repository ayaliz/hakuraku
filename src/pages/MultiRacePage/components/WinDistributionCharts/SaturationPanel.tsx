import { useEffect, useState } from "react";
import { STRATEGY_NAMES, SAT_MIN_RACE_FRACTION } from "./constants";
import type { StrategyStats } from "../../types";
import InfoTooltip from "./InfoTooltip";
import { MobilePanelExpandDialog } from "./MobilePanelExpandDialog";
import {
    ANALYSIS_STRATEGY_IDS,
    FIELD_VIEW_SUBJECT_STRATEGY_IDS,
    MOBILE_FIELD_LEGEND_NAMES,
    strategyOrderIndex,
    BASELINE,
} from "./shared";

function CrossSaturationView({
    strategyStats,
    totalRaces,
    strategyColors,
    expanded = false,
    compactLegend = false,
}: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    strategyColors: Record<number, string>;
    expanded?: boolean;
    compactLegend?: boolean;
}) {
    const W = 380, H = 150;
    const ML = 34, MB = 22, MT = 8, MR = 12;
    const plotW = W - ML - MR;
    const plotH = H - MT - MB;
    const minRaceCount = Math.max(1, totalRaces * SAT_MIN_RACE_FRACTION);

    return (
        <div className={`sa-cross-grid${expanded ? " sa-cross-grid--expanded" : ""}`}>
            <div className="sa-cross-legend">
                {ANALYSIS_STRATEGY_IDS.map(o => (
                    <div key={o} className="sa-sat-legend-item">
                        <span className="sa-sat-legend-line" style={{ background: strategyColors[o] }} />
                        <span className="sa-sat-legend-label">
                            {compactLegend ? (MOBILE_FIELD_LEGEND_NAMES[o] ?? STRATEGY_NAMES[o]) : STRATEGY_NAMES[o]}
                        </span>
                    </div>
                ))}
            </div>
            <div className="sa-cross-charts">
                {FIELD_VIEW_SUBJECT_STRATEGY_IDS.map(subjectStrat => {
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
                                                    <title>{STRATEGY_NAMES[oStrat]}: {b.count} in room to {(b.wins / b.subjectCount * 100).toFixed(1)}% per horse ({b.raceCount} races)</title>
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

export function SaturationPanel({ strategyStats, totalRaces, strategyColors }: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    strategyColors: Record<number, string>;
}) {
    const [view, setView] = useState<'self' | 'field'>('self');
    const [expanded, setExpanded] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== "undefined" && window.innerWidth <= 768);
    const H = 210;
    const ML = 38, MB = 28, MT = 10, MR = 28;
    const plotH = H - MT - MB;

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onResize = () => setIsMobileViewport(window.innerWidth <= 768);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

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
    const toY = (wr: number) => MT + plotH - (wr / axisMax) * plotH;

    const renderSelfView = (isExpanded = false) => {
        const chartW = isExpanded || !isMobileViewport ? 560 : 320;
        const chartPlotW = chartW - ML - MR;
        const chartToX = (c: number) => ML + ((c - minCount) / xRange) * chartPlotW;
        const svg = (
            <svg
                viewBox={`0 0 ${chartW} ${H}`}
                preserveAspectRatio={isMobileViewport || isExpanded ? "xMidYMid meet" : "none"}
                className={`sa-sat-svg${isExpanded ? " sa-sat-svg--expanded" : ""}`}
            >
                {yTicks.map(wr => (
                    <line key={wr} x1={ML} x2={ML + chartPlotW} y1={toY(wr)} y2={toY(wr)} stroke="#2d3748" strokeWidth={1} />
                ))}
                <line x1={ML} x2={ML + chartPlotW} y1={toY(BASELINE)} y2={toY(BASELINE)}
                    stroke="#718096" strokeWidth={1} strokeDasharray="4 3" />
                <text x={ML + chartPlotW + 4} y={toY(BASELINE) + 3} textAnchor="start" fill="#718096" fontSize={8}>1/9</text>
                {yTicks.map(wr => (
                    <text key={wr} x={ML - 5} y={toY(wr) + 4} textAnchor="end" fill="#718096" fontSize={9}>{Math.round(wr * 100)}%</text>
                ))}
                {counts.map(c => (
                    <text key={c} x={chartToX(c)} y={MT + plotH + 16} textAnchor="middle" fill="#718096" fontSize={9}>{c}</text>
                ))}
                {orderedStrategyStats.map(st => {
                    const points = (st.saturation ?? [])
                        .filter(b => b.raceCount >= minRaceCount && b.count > 0)
                        .sort((a, b) => a.count - b.count);
                    if (points.length < 1) return null;
                    const color = strategyColors[st.strategy];
                    const ptsStr = points.map(b => `${chartToX(b.count)},${toY((b.wins / b.raceCount) / b.count)}`).join(" ");
                    return (
                        <g key={st.strategy}>
                            {points.length > 1 && (
                                <polyline points={ptsStr} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                            )}
                            {points.map(b => {
                                const wr = (b.wins / b.raceCount) / b.count;
                                return (
                                    <circle key={b.count} cx={chartToX(b.count)} cy={toY(wr)}
                                        r={3.5} fill={color} stroke="#1a202c" strokeWidth={1.5}>
                                        <title>{STRATEGY_NAMES[st.strategy]}: {b.count} in room, {(wr * 100).toFixed(1)}% per horse ({b.raceCount} races)</title>
                                    </circle>
                                );
                            })}
                        </g>
                    );
                })}
                <line x1={ML} x2={ML} y1={MT} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
                <line x1={ML} x2={ML + chartPlotW} y1={MT + plotH} y2={MT + plotH} stroke="#4a5568" strokeWidth={1} />
            </svg>
        );

        if (!isExpanded) return svg;

        return (
            <div className="sa-mobile-chart-scroll">
                <div className="sa-mobile-chart-scroll-inner sa-mobile-chart-scroll-inner--wide">
                    {svg}
                </div>
            </div>
        );
    };

    const renderFieldView = (isExpanded = false) => {
        const content = (
            <CrossSaturationView
                strategyStats={strategyStats}
                totalRaces={totalRaces}
                strategyColors={strategyColors}
                expanded={isExpanded}
                compactLegend={isMobileViewport}
            />
        );
        if (!isExpanded) return content;
        return (
            <div className="sa-mobile-chart-scroll">
                <div className="sa-mobile-chart-scroll-inner sa-mobile-chart-scroll-inner--wide">
                    {content}
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="sa-panel sa-panel--saturation">
                <div className="sa-panel-header sa-panel-header--sat">
                    <span className="sa-panel-header-title">
                        Effects of style saturation{" "}
                        <InfoTooltip
                            id="style-saturation-info"
                            tip="Per-uma win rate by how many of that style appear in a race. Buckets only appear when they account for at least 1% of total races."
                        />
                    </span>
                    <div className="sa-sat-view-toggle">
                        <button className={`sa-sat-toggle-btn${view === 'self' ? ' sa-sat-toggle-btn--active' : ''}`} onClick={() => setView('self')}>Self</button>
                        <button className={`sa-sat-toggle-btn${view === 'field' ? ' sa-sat-toggle-btn--active' : ''}`} onClick={() => setView('field')}>Field</button>
                    </div>
                    <button type="button" className="sa-mobile-expand-btn" onClick={() => setExpanded(true)}>
                        Expand
                    </button>
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
                {view === 'self' ? renderSelfView(false) : renderFieldView(false)}
            </div>
            <MobilePanelExpandDialog
                open={expanded}
                title={view === "self" ? "Effects of style saturation" : "Field saturation"}
                onClose={() => setExpanded(false)}
            >
                {view === 'self' ? renderSelfView(true) : renderFieldView(true)}
            </MobilePanelExpandDialog>
        </>
    );
}
