
import React from "react";
import { PerformanceMetrics } from "./types";
import { getCharaIcon } from "./utils";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./constants";

interface PerformancePanelProps {
    items: PerformanceMetrics[];
    title: string;
    maxItems?: number;
    columns?: 1 | 2;
    displayMode?: "multiplier" | "winRatePop";
    minPopCount?: number;
    minPopPct?: number;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({
    items,
    title,
    maxItems = 3,
    columns = 1,
    displayMode = "multiplier",
    minPopCount = 3,
    minPopPct = 1.0
}) => {
    const MIN_POP_COUNT = minPopCount;
    const MIN_POP_PCT = minPopPct;

    const isSignificant = (m: PerformanceMetrics) => {
        if (m.popCount < MIN_POP_COUNT) return false;
        return m.popPct >= MIN_POP_PCT;
    };

    // Sort by impact (Ratio). Secondary sort by diff (to rank 0-win entries by population size)
    const sorted = [...items].sort((a, b) => {
        if (Math.abs(b.impact - a.impact) > 0.01) return b.impact - a.impact;
        return b.diff - a.diff;
    });

    // Overperformers: Impact > 1 & Significant
    const overperformers = sorted
        .filter(x => x.impact > 1 && isSignificant(x))
        .slice(0, maxItems);

    // Underperformers: Impact < 1 & Significant
    const underperformers = sorted
        .filter(x => x.impact < 1 && isSignificant(x))
        .slice(-maxItems)
        .reverse();

    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const renderValue = (item: PerformanceMetrics, isPositive: boolean) => {
        if (displayMode === "winRatePop") {
            return (
                <span style={{ marginLeft: "4px", fontWeight: "bold", color: isPositive ? "#68d391" : "#fc8181" }}>
                    {item.actualWinRate.toFixed(0)}% <span style={{ fontSize: "0.9em", opacity: 0.8 }}>({item.popCount})</span>
                </span>
            );
        }
        // Default "multiplier"
        return (
            <span style={{ marginLeft: "4px", fontWeight: "bold", color: isPositive ? "#68d391" : "#fc8181" }}>
                x{item.impact.toFixed(2)}
            </span>
        );
    };

    const renderItem = (item: PerformanceMetrics, isPositive: boolean) => {
        const compositeId = item.cardId && item.strategyId
            ? `${item.id}_${item.cardId}_${item.strategyId}`
            : item.id;
        const iconUrl = getCharaIcon(compositeId);

        return (
            <div
                key={item.id}
                title={`${item.fullLabel || item.label}\n${item.winCount} wins / ${item.popCount} entries\nWin Rate: ${item.actualWinRate.toFixed(1)}%\nWin Share: ${item.winPct.toFixed(1)}%\nPop Share: ${item.popPct.toFixed(1)}%`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", marginBottom: "8px", cursor: "help" }}
            >
                <div style={{ display: "flex", alignItems: "center", overflow: "hidden", maxWidth: columns === 2 ? "180px" : "180px" }}>
                    {iconUrl && item.strategyId && STRATEGY_COLORS[item.strategyId] ? (
                        <div
                            style={{ position: "relative", width: "40px", height: "40px", flexShrink: 0, marginRight: "10px" }}
                            title={STRATEGY_NAMES[item.strategyId]}
                        >
                            <div
                                style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "50%",
                                    transform: "translate(-50%, -50%) translate(0.3px, 1.9px)",
                                    width: "35px",
                                    height: "35px",
                                    backgroundColor: STRATEGY_COLORS[item.strategyId],
                                    borderRadius: "50%",
                                    opacity: 0.8
                                }}
                            />
                            <img
                                src={iconUrl}
                                alt={item.label}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: "50%"
                                }}
                            />
                        </div>
                    ) : (
                        item.strategyId && STRATEGY_COLORS[item.strategyId] && (
                            <span
                                style={{
                                    display: "inline-block",
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    backgroundColor: STRATEGY_COLORS[item.strategyId],
                                    marginRight: "4px",
                                    flexShrink: 0,
                                }}
                                title={STRATEGY_NAMES[item.strategyId]}
                            />
                        )
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isPositive ? "#68d391" : "#fc8181" }}>
                        {item.label}
                    </span>
                </div>
                {renderValue(item, isPositive)}
            </div>
        );
    };

    const containerStyle: React.CSSProperties = {
        minWidth: columns === 2 ? "400px" : "220px",
        padding: "10px",
        background: "rgba(0,0,0,0.2)",
        borderRadius: "8px",
        border: "1px solid #4a5568"
    };

    const gridStyle: React.CSSProperties = columns === 2 ? { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "16px" } : {};

    return (
        <div className="performance-panel" style={containerStyle}>
            <div style={{ fontSize: "13px", fontWeight: "bold", color: "#a0aec0", marginBottom: "8px", borderBottom: "1px solid #4a5568", paddingBottom: "4px" }}>
                {title}
            </div>

            {overperformers.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontSize: "11px", color: "#68d391", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Overperformers</div>
                    <div style={gridStyle}>
                        {overperformers.map(item => renderItem(item, true))}
                    </div>
                </div>
            )}

            {underperformers.length > 0 && (
                <div style={{}}>
                    <div style={{ fontSize: "11px", color: "#fc8181", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Underperformers</div>
                    <div style={gridStyle}>
                        {underperformers.map(item => renderItem(item, false))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PerformancePanel;
