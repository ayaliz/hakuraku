
import React from "react";
import { PerformanceMetrics } from "./types";

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
    // Dynamic Significance Cutoff
    // We want to avoid listing characters with very low sample sizes (e.g. 1 win in 1 race).
    // Rule of thumb: Must have at least a certain number of entries AND represent a meaningful slice of the meta.
    const MIN_POP_COUNT = minPopCount;
    const MIN_POP_PCT = minPopPct; // 1%

    const isSignificant = (m: PerformanceMetrics) => {
        // Special Handling: If dataset is very small, MIN_POP_PCT might be too strict or MIN_POP_COUNT might be too high.
        // But generally, for "Analysis", stats based on < 3 entries are pure noise.
        // For Eishin Flash case (3 entries in 474 total = 0.6%), she fails MIN_POP_PCT.
        if (m.popCount < MIN_POP_COUNT) return false;

        // However, if we have very few total entries (e.g. 50), 3 entries is 6%. MIN_POP_PCT checks out.
        // If we have 1000 entries, 3 entries is 0.3%. Fails.
        // So we enforce BOTH: Must be >= 3 entries, AND must be >= 1% of population.
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

    const renderItem = (item: PerformanceMetrics, isPositive: boolean) => (
        <div
            key={item.id}
            title={`${item.winCount} wins / ${item.popCount} entries\nWin Rate: ${item.actualWinRate.toFixed(1)}%\nWin Share: ${item.winPct.toFixed(1)}%\nPop Share: ${item.popPct.toFixed(1)}%`}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", marginBottom: "4px", cursor: "help" }}
        >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: columns === 2 ? "90px" : "110px", color: isPositive ? "#68d391" : "#fc8181" }}>
                {item.label}
            </span>
            {renderValue(item, isPositive)}
        </div>
    );

    const containerStyle: React.CSSProperties = {
        minWidth: columns === 2 ? "320px" : "180px",
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
