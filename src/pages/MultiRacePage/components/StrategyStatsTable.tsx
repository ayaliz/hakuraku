import React, { useState, useMemo } from "react";
import { StrategyStats } from "../types";

interface StrategyStatsTableProps {
    stats: StrategyStats[];
}

type SortKey = "strategyName" | "totalRaces" | "wins" | "top3Finishes" | "avgFinishPosition" | "winRate";
type SortDir = "asc" | "desc";

const STRATEGY_COLORS: Record<number, string> = {
    1: "#e53e3e", // Nige - Red
    2: "#ed8936", // Senkou - Orange
    3: "#48bb78", // Sashi - Green
    4: "#667eea", // Oikomi - Blue
};

const StrategyStatsTable: React.FC<StrategyStatsTableProps> = ({ stats }) => {
    const [sortKey, setSortKey] = useState<SortKey>("wins");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const sortedStats = useMemo(() => {
        const arr = [...stats].map(s => ({
            ...s,
            winRate: s.totalRaces > 0 ? (s.wins / s.totalRaces) * 100 : 0,
        }));

        return arr.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case "strategyName":
                    cmp = a.strategyName.localeCompare(b.strategyName);
                    break;
                case "totalRaces":
                    cmp = a.totalRaces - b.totalRaces;
                    break;
                case "wins":
                    cmp = a.wins - b.wins;
                    break;
                case "top3Finishes":
                    cmp = a.top3Finishes - b.top3Finishes;
                    break;
                case "avgFinishPosition":
                    cmp = a.avgFinishPosition - b.avgFinishPosition;
                    break;
                case "winRate":
                    cmp = a.winRate - b.winRate;
                    break;
            }
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [stats, sortKey, sortDir]);

    const renderSortIndicator = (key: SortKey) => {
        if (sortKey !== key) return <span className="sort-indicator">↕</span>;
        return <span className="sort-indicator active">{sortDir === "asc" ? "↑" : "↓"}</span>;
    };

    const getPositionBadge = (position: number) => {
        const rounded = Math.round(position * 10) / 10;
        let className = "position-badge default";
        if (rounded <= 1.5) className = "position-badge gold";
        else if (rounded <= 2.5) className = "position-badge silver";
        else if (rounded <= 3.5) className = "position-badge bronze";
        return <span className={className}>{rounded.toFixed(1)}</span>;
    };

    if (stats.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-title">No strategy data available</div>
            </div>
        );
    }

    return (
        <div className="analysis-table-container">
            <table className="analysis-table">
                <thead>
                    <tr>
                        <th className="sortable" onClick={() => handleSort("strategyName")}>
                            Strategy {renderSortIndicator("strategyName")}
                        </th>
                        <th className="sortable" onClick={() => handleSort("totalRaces")}>
                            Entries {renderSortIndicator("totalRaces")}
                        </th>
                        <th className="sortable" onClick={() => handleSort("wins")}>
                            Wins {renderSortIndicator("wins")}
                        </th>
                        <th className="sortable" onClick={() => handleSort("winRate")}>
                            Win Rate {renderSortIndicator("winRate")}
                        </th>
                        <th className="sortable" onClick={() => handleSort("top3Finishes")}>
                            Top 3 {renderSortIndicator("top3Finishes")}
                        </th>
                        <th className="sortable" onClick={() => handleSort("avgFinishPosition")}>
                            Avg Position {renderSortIndicator("avgFinishPosition")}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sortedStats.map(strat => (
                        <tr key={strat.strategy}>
                            <td>
                                <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "8px"
                                }}>
                                    <span
                                        style={{
                                            width: "12px",
                                            height: "12px",
                                            borderRadius: "50%",
                                            background: STRATEGY_COLORS[strat.strategy] || "#718096",
                                        }}
                                    />
                                    <strong>{strat.strategyName}</strong>
                                </span>
                            </td>
                            <td>{strat.totalRaces}</td>
                            <td>
                                <span style={{
                                    color: strat.wins > 0 ? "#f6e05e" : "#718096",
                                    fontWeight: strat.wins > 0 ? 600 : 400
                                }}>
                                    {strat.wins}
                                </span>
                            </td>
                            <td>
                                <div className="win-rate-bar">
                                    <div className="win-rate-bg">
                                        <div
                                            className="win-rate-fill"
                                            style={{
                                                width: `${Math.min(strat.winRate, 100)}%`,
                                                background: STRATEGY_COLORS[strat.strategy] || "#48bb78"
                                            }}
                                        />
                                    </div>
                                    <span className="win-rate-value" style={{
                                        color: STRATEGY_COLORS[strat.strategy] || "#48bb78"
                                    }}>
                                        {strat.winRate.toFixed(1)}%
                                    </span>
                                </div>
                            </td>
                            <td>{strat.top3Finishes}</td>
                            <td>{getPositionBadge(strat.avgFinishPosition)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default StrategyStatsTable;
