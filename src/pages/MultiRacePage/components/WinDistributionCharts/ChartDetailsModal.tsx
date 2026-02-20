import React, { useState, useEffect } from "react";
import { PieSlice } from "./types";
import { getCharaIcon } from "./utils";
import { STRATEGY_COLORS } from "./constants";

interface ChartDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: PieSlice[];
    unit?: string;
    primaryLabel?: string;
    secondaryLabel?: string;
}

type SortCol = "name" | "primary" | "secondary";

const ChartDetailsModal: React.FC<ChartDetailsModalProps> = ({
    isOpen,
    onClose,
    title,
    data,
    unit = "wins",
    primaryLabel,
    secondaryLabel,
}) => {
    const [sortCol, setSortCol] = useState<SortCol>("primary");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    useEffect(() => {
        if (isOpen) {
            setSortCol("primary");
            setSortDir("desc");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const hasSecondary = secondaryLabel !== undefined && data.some(d => d.secondaryValue !== undefined);
    const resolvedPrimaryLabel = primaryLabel ?? (unit.charAt(0).toUpperCase() + unit.slice(1));

    const handleSort = (col: SortCol) => {
        if (col === sortCol) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
        } else {
            setSortCol(col);
            setSortDir("desc");
        }
    };

    const sortIndicator = (col: SortCol) =>
        sortCol === col ? <span className="cdt-sort-indicator">{sortDir === "asc" ? " ▲" : " ▼"}</span> : null;

    const sortedData = [...data].sort((a, b) => {
        let cmp = 0;
        if (sortCol === "name") {
            cmp = a.label.localeCompare(b.label);
        } else if (sortCol === "primary") {
            cmp = a.value - b.value;
        } else {
            cmp = (a.secondaryValue ?? 0) - (b.secondaryValue ?? 0);
        }
        return sortDir === "asc" ? cmp : -cmp;
    });

    return (
        <div className="cdt-overlay" onClick={onClose}>
            <div className="cdt-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="cdt-header">
                    <h3 className="cdt-title">{title}</h3>
                    <button className="cdt-close-btn" onClick={onClose}>&times;</button>
                </div>

                {/* Content */}
                <div className="cdt-content">
                    <table className="cdt-table">
                        <thead>
                            <tr>
                                <th className="cdt-th-rank">#</th>
                                <th className="cdt-th-sortable" onClick={() => handleSort("name")}>
                                    Name{sortIndicator("name")}
                                </th>
                                <th className="cdt-th-value cdt-th-sortable" onClick={() => handleSort("primary")}>
                                    {resolvedPrimaryLabel}{sortIndicator("primary")}
                                </th>
                                {hasSecondary && (
                                    <th className="cdt-th-value cdt-th-sortable" onClick={() => handleSort("secondary")}>
                                        {secondaryLabel}{sortIndicator("secondary")}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData.map((item, i) => {
                                const iconUrl = item.charaId ? getCharaIcon(item.charaId) : null;
                                const bgColor = item.strategyId && STRATEGY_COLORS[item.strategyId]
                                    ? STRATEGY_COLORS[item.strategyId]
                                    : item.color;

                                return (
                                    <tr key={i} className="cdt-tr">
                                        <td className="cdt-td-rank">{i + 1}</td>
                                        <td>
                                            <div className="cdt-name-cell">
                                                <div className="cdt-portrait">
                                                    {iconUrl ? (
                                                        <>
                                                            <div className="cdt-portrait-bg" style={{ backgroundColor: bgColor }} />
                                                            <img src={iconUrl} alt="" className="cdt-portrait-img" />
                                                        </>
                                                    ) : (
                                                        <div className="cdt-portrait-fallback" style={{ backgroundColor: bgColor }} />
                                                    )}
                                                </div>
                                                <span className="cdt-label" title={item.fullLabel || item.label}>
                                                    {item.label}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="cdt-td-value">
                                            <span className="cdt-value-main">{item.value}</span>
                                            <span className="cdt-value-pct">({item.percentage.toFixed(1)}%)</span>
                                        </td>
                                        {hasSecondary && (
                                            <td className="cdt-td-value">
                                                <span className="cdt-value-main">{item.secondaryValue ?? 0}</span>
                                                <span className="cdt-value-pct">({(item.secondaryPercentage ?? 0).toFixed(1)}%)</span>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ChartDetailsModal;
