
import React from "react";
import { PerformanceMetrics } from "./types";
import { getCharaIcon } from "./utils";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./constants";
import './PerformancePanel.css';

interface PerformancePanelProps {
    items: PerformanceMetrics[];
    title: string;
    maxItems?: number;
    columns?: 1 | 2;
    displayMode?: "multiplier" | "winRatePop";
    minPopCount?: number;
    minPopPct?: number;
    showIcons?: boolean;
    headerNote?: string;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({
    items,
    title,
    maxItems = 3,
    columns = 1,
    displayMode = "multiplier",
    minPopCount = 3,
    minPopPct = 1.0,
    showIcons = true,
    headerNote,
}) => {
    const isSignificant = (m: PerformanceMetrics) => {
        if (m.popCount < minPopCount) return false;
        return m.popPct >= minPopPct;
    };

    const sorted = [...items].sort((a, b) => {
        if (Math.abs(b.impact - a.impact) > 0.004) return b.impact - a.impact;
        return b.diff - a.diff;
    });

    const overperformers = sorted
        .filter(x => x.impact > 1 && isSignificant(x))
        .slice(0, maxItems);

    const underperformers = sorted
        .filter(x => x.impact < 1 && isSignificant(x))
        .slice(-maxItems)
        .reverse();

    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const renderValue = (item: PerformanceMetrics, isPositive: boolean) => {
        const valueColor = isPositive ? "#68d391" : "#fc8181";
        if (displayMode === "winRatePop") {
            return (
                <span className="pp-value" style={{ color: valueColor }}>
                    {item.actualWinRate.toFixed(0)}% <span className="pp-pop-count">({item.popCount})</span>
                </span>
            );
        }
        return (
            <span className="pp-value" style={{ color: valueColor }}>
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
                className="pp-item-row"
            >
                <div className="pp-item-inner">
                    {showIcons && iconUrl && item.strategyId && STRATEGY_COLORS[item.strategyId] ? (
                        <div
                            className="pp-icon-wrap"
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
                                className="pp-icon-img"
                            />
                        </div>
                    ) : (
                        item.strategyId && STRATEGY_COLORS[item.strategyId] && (
                            <span
                                className="pp-strategy-dot"
                                style={{ backgroundColor: STRATEGY_COLORS[item.strategyId] }}
                                title={STRATEGY_NAMES[item.strategyId]}
                            />
                        )
                    )}
                    <span className="pp-item-label" style={{ color: isPositive ? "#68d391" : "#fc8181" }}>
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
            <div className="pp-header">
                {title}
                {headerNote && (
                    <span title={headerNote} className="pp-hint-badge">i</span>
                )}
            </div>

            {overperformers.length > 0 && (
                <div className="pp-section">
                    <div className="pp-section-label pp-section-label--over">Overperformers</div>
                    <div style={gridStyle}>
                        {overperformers.map(item => renderItem(item, true))}
                    </div>
                </div>
            )}

            {underperformers.length > 0 && (
                <div>
                    <div className="pp-section-label pp-section-label--under">Underperformers</div>
                    <div style={gridStyle}>
                        {underperformers.map(item => renderItem(item, false))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PerformancePanel;
