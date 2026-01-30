import React from "react";
import { AggregatedStats } from "../types";

interface StatsOverviewProps {
    stats: AggregatedStats;
}

const StatsOverview: React.FC<StatsOverviewProps> = ({ stats }) => {
    const topCharacter = stats.characterStats.length > 0
        ? [...stats.characterStats].sort((a, b) => b.wins - a.wins)[0]
        : null;

    const topStrategy = stats.strategyStats.length > 0
        ? [...stats.strategyStats].sort((a, b) => b.wins - a.wins)[0]
        : null;

    return (
        <div className="stats-grid">
            <div className="stat-card">
                <div className="stat-value">{stats.totalRaces}</div>
                <div className="stat-label">Races Analyzed</div>
            </div>
            <div className="stat-card">
                <div className="stat-value">{stats.totalHorses}</div>
                <div className="stat-label">Total Entries</div>
            </div>
            <div className="stat-card">
                <div className="stat-value">{Math.round(stats.avgRaceDistance)}m</div>
                <div className="stat-label">Avg Distance</div>
            </div>
            <div className="stat-card">
                <div className="stat-value">{stats.skillStats.size}</div>
                <div className="stat-label">Unique Skills</div>
            </div>
            {topCharacter && (
                <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: "20px" }}>
                        {topCharacter.charaName}
                    </div>
                    <div className="stat-label">
                        Top Winner ({topCharacter.wins} wins)
                    </div>
                </div>
            )}
            {topStrategy && (
                <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: "18px" }}>
                        {topStrategy.strategyName}
                    </div>
                    <div className="stat-label">
                        Best Strategy ({topStrategy.wins} wins)
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatsOverview;
