import React, { useState, useMemo } from "react";
import { CharacterStats } from "../types";

interface CharacterStatsTableProps {
    stats: CharacterStats[];
}

type SortKey = "charaName" | "totalRaces" | "wins" | "top3Finishes" | "avgFinishPosition" | "winRate";
type SortDir = "asc" | "desc";

const CharacterStatsTable: React.FC<CharacterStatsTableProps> = ({ stats }) => {
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
                case "charaName":
                    cmp = a.charaName.localeCompare(b.charaName);
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
                <div className="empty-state-title">No character data available</div>
            </div>
        );
    }

    return (
        <div className="analysis-table-container">
            <table className="analysis-table">
                <thead>
                    <tr>
                        <th className="sortable" onClick={() => handleSort("charaName")}>
                            Character {renderSortIndicator("charaName")}
                        </th>
                        <th className="sortable" onClick={() => handleSort("totalRaces")}>
                            Races {renderSortIndicator("totalRaces")}
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
                    {sortedStats.map(char => (
                        <tr key={char.charaId}>
                            <td>
                                <strong>{char.charaName}</strong>
                            </td>
                            <td>{char.totalRaces}</td>
                            <td>
                                <span style={{
                                    color: char.wins > 0 ? "#f6e05e" : "#718096",
                                    fontWeight: char.wins > 0 ? 600 : 400
                                }}>
                                    {char.wins}
                                </span>
                            </td>
                            <td>
                                <div className="win-rate-bar">
                                    <div className="win-rate-bg">
                                        <div
                                            className="win-rate-fill"
                                            style={{ width: `${Math.min(char.winRate, 100)}%` }}
                                        />
                                    </div>
                                    <span className="win-rate-value">
                                        {char.winRate.toFixed(1)}%
                                    </span>
                                </div>
                            </td>
                            <td>{char.top3Finishes}</td>
                            <td>{getPositionBadge(char.avgFinishPosition)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default CharacterStatsTable;
