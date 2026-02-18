import React from "react";
import { PieSlice } from "./types";
import { getCharaIcon } from "./utils";
import { STRATEGY_COLORS } from "./constants";

interface ChartDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: PieSlice[];
    unit?: string;
}

const ChartDetailsModal: React.FC<ChartDetailsModalProps> = ({
    isOpen,
    onClose,
    title,
    data,
    unit: _unit = "wins",
}) => {
    if (!isOpen) return null;

    const maxValue = Math.max(...data.map((d) => d.value));

    // Sort data descending just in case
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: "#1a202c",
                    border: "1px solid #2d3748",
                    borderRadius: "8px",
                    width: "800px",
                    maxWidth: "95vw",
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "16px 24px",
                        borderBottom: "1px solid #2d3748",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: "18px", color: "#e2e8f0" }}>{title}</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#a0aec0",
                            fontSize: "24px",
                            cursor: "pointer",
                            lineHeight: 1,
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
                    {sortedData.map((item, i) => {
                        const barWidth = (item.value / maxValue) * 100;
                        const iconUrl = item.charaId ? getCharaIcon(item.charaId) : null;

                        return (
                            <div
                                key={i}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    marginBottom: "12px",
                                }}
                            >
                                {/* Label & Icon */}
                                <div
                                    style={{
                                        width: "200px",
                                        marginRight: "12px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "flex-end",
                                        textAlign: "right",
                                    }}
                                >
                                    <span
                                        style={{
                                            marginRight: "10px",
                                            fontSize: "14px",
                                            color: "#e2e8f0",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                        title={item.label}
                                    >
                                        {item.label}
                                    </span>
                                    {iconUrl ? (
                                        <div style={{ position: "relative", width: "48px", height: "48px", flexShrink: 0 }}>
                                            {item.strategyId && STRATEGY_COLORS[item.strategyId] && (
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        top: -2,
                                                        right: -2,
                                                        width: "14px",
                                                        height: "14px",
                                                        borderRadius: "50%",
                                                        backgroundColor: STRATEGY_COLORS[item.strategyId],
                                                        border: "1px solid #1a202c",
                                                    }}
                                                />
                                            )}
                                            <img
                                                src={iconUrl}
                                                alt=""
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    borderRadius: "50%",
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ width: "48px", height: "48px" }} />
                                    )}
                                </div>

                                {/* Bar Area */}
                                <div style={{ flex: 1, marginRight: "12px", position: "relative", height: "24px" }}>
                                    {/* Bar Background */}
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            right: 0,
                                            backgroundColor: "#2d3748",
                                            borderRadius: "4px",
                                            opacity: 0.3,
                                        }}
                                    />
                                    {/* Bar Foreground */}
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: `${barWidth}%`,
                                            backgroundColor: item.color,
                                            borderRadius: "4px",
                                            transition: "width 0.5s ease-out",
                                        }}
                                    />
                                </div>

                                {/* Value Area */}
                                <div style={{ width: "80px", color: "#a0aec0", fontSize: "14px" }}>
                                    <span style={{ color: "#e2e8f0", fontWeight: "bold" }}>{item.value}</span>
                                    <span style={{ fontSize: "12px", marginLeft: "4px" }}>
                                        ({item.percentage.toFixed(1)}%)
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ChartDetailsModal;
