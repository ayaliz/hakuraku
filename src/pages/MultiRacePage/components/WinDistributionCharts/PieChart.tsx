import React from "react";
import { PieSlice, StrategyPieSlice } from "./types";
import { getCharaIcon } from "./utils";
import { STRATEGY_COLORS } from "./constants";

interface PieChartProps {
    slices: PieSlice[];
    size: number;
    unit: string;
    chartId: string;
}

const PieChart: React.FC<PieChartProps> = ({ slices, size, unit, chartId }) => {
    const center = size / 2;
    const radius = size * 0.30; // Reduced radius further to make room for larger icons
    const innerRadius = size * 0.15;
    let currentAngle = -90;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {slices.map((slice, i) => {
                const angle = (slice.percentage / 100) * 360;
                const startAngle = currentAngle;
                const endAngle = currentAngle + angle;
                currentAngle = endAngle;

                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;

                const x1 = center + radius * Math.cos(startRad);
                const y1 = center + radius * Math.sin(startRad);
                const x2 = center + radius * Math.cos(endRad);
                const y2 = center + radius * Math.sin(endRad);

                const ix1 = center + innerRadius * Math.cos(startRad);
                const iy1 = center + innerRadius * Math.sin(startRad);
                const ix2 = center + innerRadius * Math.cos(endRad);
                const iy2 = center + innerRadius * Math.sin(endRad);

                const largeArc = angle > 180 ? 1 : 0;

                const pathD = [
                    `M ${x1} ${y1}`,
                    `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                    `L ${ix2} ${iy2}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
                    `Z`,
                ].join(" ");

                // Label position (inside slice)
                const midAngle = startAngle + angle / 2;
                const midRad = (midAngle * Math.PI) / 180;
                const labelRadius = (radius + innerRadius) / 2;
                const labelX = center + labelRadius * Math.cos(midRad);
                const labelY = center + labelRadius * Math.sin(midRad);

                // Icon position (outside slice)
                const iconRadius = radius + 18;
                const iconX = center + iconRadius * Math.cos(midRad);
                const iconY = center + iconRadius * Math.sin(midRad);
                const iconSize = 32;
                const bgCircleSizeAdjust = -2;
                const bgCircleOffsetX = 0.2;
                const bgCircleOffsetY = 1.5;

                // Only show label/icon if slice is big enough (> 5%)
                const showLabel = slice.percentage > 5;
                const iconUrl = showLabel && slice.charaId ? getCharaIcon(slice.charaId) : null;
                const clipId = `clip-${chartId}-${i}-${slice.charaId || 's'}`;

                // Tooltip
                let tooltipText = `${slice.label}: ${slice.value} ${unit} (${slice.percentage.toFixed(1)}%)`;
                // Add extra info if strategy pie slice has winning characters
                const stratSlice = slice as StrategyPieSlice;
                if (stratSlice.winningCharacters && stratSlice.winningCharacters.length > 0) {
                    tooltipText += `\n\nTop characters:`;
                    stratSlice.winningCharacters.slice(0, 8).forEach(c => {
                        tooltipText += `\n  ${c.charaName}: ${c.wins}`;
                    });
                }
                if (slice.tooltipLines && slice.tooltipLines.length > 0) {
                    tooltipText += "\n\nBreakdown:\n" + slice.tooltipLines.join("\n");
                }

                return (
                    <g key={i}>
                        <path
                            d={pathD}
                            fill={slice.color}
                            stroke="#1a1a2e"
                            strokeWidth="2"
                            style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                        >
                            <title>{tooltipText}</title>
                        </path>
                        {showLabel && (
                            <text
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill="#fff"
                                fontSize="11px"
                                fontWeight="bold"
                                style={{ pointerEvents: "none", textShadow: "0px 0px 3px rgba(0,0,0,0.8)" }}
                            >
                                {Math.round(slice.percentage)}%
                            </text>
                        )}
                        {iconUrl && (
                            <g style={{ pointerEvents: "none" }}>
                                <defs>
                                    <clipPath id={clipId}>
                                        <circle cx={iconX} cy={iconY} r={iconSize / 2} />
                                    </clipPath>
                                </defs>
                                {/* Strategy Background Circle */}
                                {slice.strategyId && STRATEGY_COLORS[slice.strategyId] && (
                                    <circle
                                        cx={iconX + bgCircleOffsetX}
                                        cy={iconY + bgCircleOffsetY}
                                        r={(iconSize / 2) + bgCircleSizeAdjust}
                                        fill={STRATEGY_COLORS[slice.strategyId]}
                                    />
                                )}
                                <image
                                    href={iconUrl}
                                    x={iconX - iconSize / 2}
                                    y={iconY - iconSize / 2}
                                    width={iconSize}
                                    height={iconSize}
                                    clipPath={`url(#${clipId})`}
                                />
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

export default PieChart;
