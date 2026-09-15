import React, { useEffect, useMemo, useState } from "react";
import type {
    GateStats,
    GateStatsMode,
    GateWinRateFlavor,
} from "../MultiRacePage/types";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";

const GATE_FLAVOR_LABELS: Record<GateWinRateFlavor, string> = {
    total: "Total",
    front: "Front",
    pace: "Pace",
    late: "Late",
    end: "End",
};

const GATE_MODE_LABELS: Record<GateStatsMode, string> = {
    winRate: "Win Rate",
    blocked: "Blocked",
    dodgingDanger: "Dodging Danger",
};

function gateRateColor(value: number, baseline: number, invert = false): string {
    const rawDelta = value - baseline;
    const delta = invert ? -rawDelta : rawDelta;
    const intensity = Math.min(Math.abs(delta) / 0.03, 1);
    const from = [203, 213, 224];
    const to = delta >= 0 ? [104, 211, 145] : [252, 129, 129];
    const red = Math.round(from[0] + (to[0] - from[0]) * intensity);
    const green = Math.round(from[1] + (to[1] - from[1]) * intensity);
    const blue = Math.round(from[2] + (to[2] - from[2]) * intensity);
    return `rgb(${red}, ${green}, ${blue})`;
}

type GateStatsPanelProps = {
    gateStats: GateStats;
};

const GateStatsPanel: React.FC<GateStatsPanelProps> = ({ gateStats }) => {
    const [mode, setMode] = useState<GateStatsMode>("winRate");
    const [flavor, setFlavor] = useState<GateWinRateFlavor>("total");
    const winRates = gateStats.winRatesByFlavor[flavor] ?? [];
    const blockedRates = gateStats.blockedRatesByFlavor[flavor] ?? [];
    const dodgingDangerRates = gateStats.dodgingDangerRates ?? [];
    const winBaseline = useMemo(() => {
        const totals = gateStats.winRatesByFlavor.total.reduce(
            (acc, gate) => ({
                wins: acc.wins + gate.wins,
                appearances: acc.appearances + gate.appearances,
            }),
            { wins: 0, appearances: 0 },
        );
        return totals.appearances > 0 ? totals.wins / totals.appearances : 1 / 9;
    }, [gateStats.winRatesByFlavor]);
    const modeBaseline = useMemo(() => {
        if (mode === "blocked") {
            const totals = blockedRates.reduce(
                (acc, gate) => ({
                    blocked: acc.blocked + gate.blockedCount,
                    appearances: acc.appearances + gate.appearances,
                }),
                { blocked: 0, appearances: 0 },
            );
            return totals.appearances > 0 ? totals.blocked / totals.appearances : 0;
        }
        if (mode === "dodgingDanger") {
            const totals = dodgingDangerRates.reduce(
                (acc, gate) => ({
                    activations: acc.activations + gate.activations,
                    opportunities: acc.opportunities + gate.opportunities,
                }),
                { activations: 0, opportunities: 0 },
            );
            return totals.opportunities > 0 ? totals.activations / totals.opportunities : 0;
        }
        const totals = winRates.reduce(
            (acc, gate) => ({
                wins: acc.wins + gate.wins,
                appearances: acc.appearances + gate.appearances,
            }),
            { wins: 0, appearances: 0 },
        );
        return totals.appearances > 0 ? totals.wins / totals.appearances : winBaseline;
    }, [blockedRates, dodgingDangerRates, mode, winBaseline, winRates]);

    useEffect(() => {
        if (mode === "dodgingDanger" && flavor !== "front") setFlavor("front");
    }, [flavor, mode]);

    const hasStats =
        gateStats.winRatesByFlavor.total.length > 0 ||
        gateStats.blockedRatesByFlavor.total.length > 0 ||
        gateStats.dodgingDangerRates.length > 0;

    if (!hasStats) return null;

    const gridTemplateColumns = mode === "winRate" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr";

    return (
        <div className="uma-gate-panel">
            <div className="uma-gate-panel-title">
                Gate Stats
                <InfoTooltip id="gate-stats-info" tip="Runaway is included in Front." />
            </div>
            <div className="histogram-toggle uma-gate-toggle">
                {(Object.keys(GATE_MODE_LABELS) as GateStatsMode[]).map((candidate) => (
                    <button
                        key={candidate}
                        className={`histogram-toggle-btn uma-gate-toggle-btn${mode === candidate ? " active" : ""}`}
                        onClick={() => setMode(candidate)}
                    >
                        {GATE_MODE_LABELS[candidate]}
                    </button>
                ))}
            </div>
            <div className="histogram-toggle uma-gate-toggle">
                {(Object.keys(GATE_FLAVOR_LABELS) as GateWinRateFlavor[]).map((candidate) => {
                    const disabled = mode === "dodgingDanger" && candidate !== "front";
                    return (
                        <button
                            key={candidate}
                            className={`histogram-toggle-btn uma-gate-toggle-btn${flavor === candidate ? " active" : ""}`}
                            onClick={() => !disabled && setFlavor(candidate)}
                            disabled={disabled}
                        >
                            {GATE_FLAVOR_LABELS[candidate]}
                        </button>
                    );
                })}
            </div>
            <div className="uma-gate-table-wrap">
                {mode === "winRate" && (
                    <>
                        <div className="uma-gate-head-row" style={{ gridTemplateColumns }}>
                            <div>Gate</div>
                            <div className="uma-gate-cell--r">Wins</div>
                            <div className="uma-gate-cell--r">Entries</div>
                            <div className="uma-gate-cell--r">Win%</div>
                        </div>
                        <div className="uma-gate-body">
                            {winRates.map((gate) => (
                                <div key={gate.gateNumber} className="uma-gate-body-row" style={{ gridTemplateColumns }}>
                                    <div>{gate.gateNumber}</div>
                                    <div className="uma-gate-cell--r">{gate.wins}</div>
                                    <div className="uma-gate-cell--r">{gate.appearances}</div>
                                    <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.winRate, modeBaseline) }}>
                                        {(gate.winRate * 100).toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                            {winRates.length === 0 && (
                                <div className="uma-gate-body-row" style={{ gridTemplateColumns }}>
                                    <div className="uma-gate-no-data-wide">No data</div>
                                </div>
                            )}
                        </div>
                    </>
                )}
                {mode === "blocked" && (
                    <>
                        <div className="uma-gate-head-row" style={{ gridTemplateColumns }}>
                            <div>Gate</div>
                            <div className="uma-gate-cell--r">Blocked%</div>
                            <div className="uma-gate-cell--r">Win% after block</div>
                        </div>
                        <div className="uma-gate-body">
                            {blockedRates.map((gate) => (
                                <div key={gate.gateNumber} className="uma-gate-body-row" style={{ gridTemplateColumns }}>
                                    <div>{gate.gateNumber}</div>
                                    <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.blockedRate, modeBaseline, true) }}>
                                        {(gate.blockedRate * 100).toFixed(1)}%
                                    </div>
                                    <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.winRateAfterBlock, winBaseline) }}>
                                        {(gate.winRateAfterBlock * 100).toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                            {blockedRates.length === 0 && (
                                <div className="uma-gate-body-row" style={{ gridTemplateColumns }}>
                                    <div className="uma-gate-no-data">No data</div>
                                </div>
                            )}
                        </div>
                    </>
                )}
                {mode === "dodgingDanger" && (
                    <>
                        <div className="uma-gate-head-row" style={{ gridTemplateColumns }}>
                            <div>Gate</div>
                            <div className="uma-gate-cell--r">Activation%</div>
                            <div className="uma-gate-cell--r">Win% after activation</div>
                        </div>
                        <div className="uma-gate-body">
                            {dodgingDangerRates.map((gate) => (
                                <div key={gate.gateNumber} className="uma-gate-body-row" style={{ gridTemplateColumns }}>
                                    <div>{gate.gateNumber}</div>
                                    <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.activationRate, modeBaseline) }}>
                                        {(gate.activationRate * 100).toFixed(1)}%
                                    </div>
                                    <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.winRateAfterActivation, winBaseline) }}>
                                        {(gate.winRateAfterActivation * 100).toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                            {dodgingDangerRates.length === 0 && (
                                <div className="uma-gate-body-row" style={{ gridTemplateColumns }}>
                                    <div className="uma-gate-no-data">No data</div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default GateStatsPanel;
