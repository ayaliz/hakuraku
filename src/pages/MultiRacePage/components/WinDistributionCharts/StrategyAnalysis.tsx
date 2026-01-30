import React from "react";
import PieChart from "./PieChart";
import PerformancePanel from "./PerformancePanel";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./constants";
import { StrategyPieSlice, PerformanceMetrics, PieSlice } from "./types";

interface StrategyAnalysisProps {
    strategyPieDataAll: StrategyPieSlice[];
    strategyPieDataOpp: StrategyPieSlice[];
    popStrategyData: PieSlice[];
    perfMetrics: PerformanceMetrics[];
}

const StrategyAnalysis: React.FC<StrategyAnalysisProps> = ({
    strategyPieDataAll,
    strategyPieDataOpp,
    popStrategyData,
    perfMetrics,
}) => {
    // Shared legend items (Front Runner, Pace Chaser, etc.)
    const strategies = [1, 2, 3, 4];

    return (
        <div className="pie-chart-container" style={{ marginBottom: "20px" }}>
            <div className="pie-chart-title" style={{ borderBottom: "1px solid #2d3748", paddingBottom: "10px", marginBottom: "20px" }}>
                Strategy Analysis
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-around", gap: "20px" }}>
                {/* Wins Pie (All) */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Wins (All)</div>
                    {strategyPieDataAll.length > 0 ? (
                        <PieChart slices={strategyPieDataAll} size={200} unit="wins" chartId="strat-wins-all" />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No wins
                        </div>
                    )}
                </div>

                {/* Wins Pie (Opponents) */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Best Placing Opponent</div>
                    {strategyPieDataOpp.length > 0 ? (
                        <PieChart slices={strategyPieDataOpp} size={200} unit="wins" chartId="strat-wins-opp" />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No wins
                        </div>
                    )}
                </div>

                {/* Population Pie */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Population (Opp. Only)</div>
                    {popStrategyData.length > 0 ? (
                        <PieChart slices={popStrategyData} size={200} unit="entries" chartId="strat-pop" />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No entries
                        </div>
                    )}
                </div>

                {/* Shared Legend */}
                <div className="pie-legend" style={{ minWidth: "150px" }}>
                    {strategies.map(sId => (
                        <div key={sId} className="pie-legend-item" style={{ marginBottom: "8px" }}>
                            <span
                                className="pie-legend-color"
                                style={{ background: STRATEGY_COLORS[sId] }}
                            />
                            <span className="pie-legend-label" style={{ fontSize: "14px" }}>
                                {STRATEGY_NAMES[sId]}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Performance Panel */}
                <PerformancePanel items={perfMetrics} title="Performance (Opponents)" maxItems={4} columns={1} displayMode="multiplier" />
            </div>
        </div>
    );
};

export default StrategyAnalysis;
