
import React, { useState } from "react";
import PieChart from "./PieChart";
import PerformancePanel from "./PerformancePanel";
import ChartDetailsModal from "./ChartDetailsModal";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./constants";
import { PieSlice, PerformanceMetrics } from "./types";
import { getCharaIcon } from "./utils";

interface CharacterAnalysisProps {
    winsAll: PieSlice[];
    winsOpp: PieSlice[];
    pop: PieSlice[];
    rawWinsAll: PieSlice[];
    rawWinsOpp: PieSlice[];
    rawPop: PieSlice[];
    legend: { id: number | string; label: string; fullLabel?: string; color: string; strategyId?: number; cardId?: number; charaId?: number }[];
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
    const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; data: PieSlice[]; unit: string; primaryLabel?: string; secondaryLabel?: string }>({
        isOpen: false,
        title: "",
        data: [],
        unit: "wins",
    });

    const openModal = (title: string, data: PieSlice[], unit: string, primaryLabel?: string, secondaryLabel?: string) => {
        setModalState({ isOpen: true, title, data, unit, primaryLabel, secondaryLabel });
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
                primaryLabel={modalState.primaryLabel}
                secondaryLabel={modalState.secondaryLabel}
            />
            <div className="pie-chart-title" style={{ borderBottom: "1px solid #2d3748", paddingBottom: "10px", marginBottom: "20px" }}>
                Character Analysis
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-around", gap: "20px" }}>

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


                <div style={{ textAlign: "center" }}>
                    <div style={{ marginBottom: "10px", color: "#a0aec0", fontSize: "14px" }}>Best Placing Opponent</div>
                    {winsOpp.length > 0 ? (
                        <PieChart
                            slices={winsOpp}
                            size={200}
                            unit="wins"
                            chartId="chara-wins-opp"
                            onClick={() => openModal("Character Wins (Top Opponent)", rawWinsOpp, "wins", "Best Placing Opponent", "Actual Match Wins")}
                        />
                    ) : (
                        <div style={{ height: 200, width: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#718096" }}>
                            No wins
                        </div>
                    )}
                </div>


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

                <div className="pie-legend" style={{ minWidth: "150px" }}>
                    {legend.map(item => {
                        const compositeId = item.cardId && item.strategyId
                            ? `${item.id}_${item.cardId}_${item.strategyId}`
                            : item.id;
                        const iconUrl = getCharaIcon(compositeId);
                        return (
                            <div key={item.id} className="pie-legend-item" style={{ marginBottom: "8px", alignItems: "center", display: "flex" }}>
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: "8px",
                                        height: "20px",
                                        backgroundColor: item.color,
                                        marginRight: "6px",
                                        borderRadius: "2px"
                                    }}
                                />
                                <span
                                    className="pie-legend-label"
                                    style={{ fontSize: "14px", cursor: "default", marginRight: "10px" }}
                                >
                                    {item.label}
                                </span>
                                {iconUrl && item.strategyId && STRATEGY_COLORS[item.strategyId] ? (
                                    <div
                                        style={{ position: "relative", width: "40px", height: "40px", flexShrink: 0, cursor: "help" }}
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
                                    <span
                                        className="pie-legend-color"
                                        style={{ background: item.color, width: "12px", height: "12px", display: "inline-block" }}
                                    />
                                )}
                            </div>
                        );
                    })}

                    {(winsAll.some(s => s.label === "Others") || winsOpp.some(s => s.label === "Others") || pop.some(s => s.label === "Others")) && (
                        <div className="pie-legend-item" style={{ marginBottom: "8px", alignItems: "center", display: "flex" }}>
                            <span
                                className="pie-legend-color"
                                style={{ background: "#718096", marginRight: "8px", width: "12px", height: "12px", display: "inline-block" }}
                            />
                            <span className="pie-legend-label" style={{ fontSize: "14px" }}>
                                Others
                            </span>
                        </div>
                    )}
                </div>


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
