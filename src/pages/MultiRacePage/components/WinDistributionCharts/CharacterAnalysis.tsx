import React, { useState } from "react";
import PieChart from "./PieChart";
import PerformancePanel from "./PerformancePanel";
import ChartDetailsModal from "./ChartDetailsModal";
import { PieSlice, PerformanceMetrics } from "./types";

interface CharacterAnalysisProps {
    winsAll: PieSlice[];
    winsOpp: PieSlice[];
    pop: PieSlice[];
    rawWinsAll: PieSlice[];
    rawWinsOpp: PieSlice[];
    rawPop: PieSlice[];
    legend: { id: number | string; label: string; color: string }[];
    perfMetrics: PerformanceMetrics[];
}

const CharacterAnalysis: React.FC<CharacterAnalysisProps> = ({
    winsAll,
    winsOpp,
    pop,
    rawWinsAll,
    rawWinsOpp,
    rawPop,
    legend,
    perfMetrics,
}) => {
    const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; data: PieSlice[]; unit: string }>({
        isOpen: false,
        title: "",
        data: [],
        unit: "wins",
    });

    const openModal = (title: string, data: PieSlice[], unit: string) => {
        setModalState({ isOpen: true, title, data, unit });
    };

    const closeModal = () => {
        setModalState({ ...modalState, isOpen: false });
    };

    return (
        <div className="pie-chart-container">
            <ChartDetailsModal
                isOpen={modalState.isOpen}
                onClose={closeModal}
                title={modalState.title}
                data={modalState.data}
                unit={modalState.unit}
            />
            <div className="pie-chart-title" style={{ borderBottom: "1px solid #2d3748", paddingBottom: "10px", marginBottom: "20px" }}>
                Character Analysis
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-around", gap: "20px" }}>
                {/* Wins Pie (All) */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Wins (All)</div>
                    {winsAll.length > 0 ? (
                        <PieChart
                            slices={winsAll}
                            size={200}
                            unit="wins"
                            chartId="chara-wins-all"
                            onClick={() => openModal("Character Wins (All)", rawWinsAll, "wins")}
                        />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No wins
                        </div>
                    )}
                </div>

                {/* Wins Pie (Opponents) */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Best Placing Opponent</div>
                    {winsOpp.length > 0 ? (
                        <PieChart
                            slices={winsOpp}
                            size={200}
                            unit="wins"
                            chartId="chara-wins-opp"
                            onClick={() => openModal("Character Wins (Top Opponent)", rawWinsOpp, "wins")}
                        />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No wins
                        </div>
                    )}
                </div>

                {/* Population Pie */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Population (Opp. Only)</div>
                    {pop.length > 0 ? (
                        <PieChart
                            slices={pop}
                            size={200}
                            unit="entries"
                            chartId="chara-pop"
                            onClick={() => openModal("Character Population (Opponents)", rawPop, "entries")}
                        />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No entries
                        </div>
                    )}
                </div>

                {/* Shared Legend */}
                <div className="pie-legend" style={{ minWidth: "150px" }}>
                    {legend.map(item => (
                        <div key={item.id} className="pie-legend-item" style={{ marginBottom: "8px" }}>
                            <span
                                className="pie-legend-color"
                                style={{ background: item.color }}
                            />
                            <span className="pie-legend-label" style={{ fontSize: "14px" }}>
                                {item.label}
                            </span>
                        </div>
                    ))}
                    {/* Manual "Others" legend entry if either chart has others */}
                    {(winsAll.some(s => s.label === "Others") || winsOpp.some(s => s.label === "Others") || pop.some(s => s.label === "Others")) && (
                        <div className="pie-legend-item" style={{ marginBottom: "8px" }}>
                            <span
                                className="pie-legend-color"
                                style={{ background: "#718096" }}
                            />
                            <span className="pie-legend-label" style={{ fontSize: "14px" }}>
                                Others
                            </span>
                        </div>
                    )}
                </div>

                {/* Performance Panel */}
                <PerformancePanel
                    items={perfMetrics}
                    title="Performance (Opponents)"
                    maxItems={6}
                    columns={2}
                    displayMode="winRatePop"
                />
            </div>
        </div>
    );
};

export default CharacterAnalysis;
