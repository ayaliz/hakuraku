import React from "react";
import { ParsedRace } from "../types";

interface RaceListPanelProps {
    races: ParsedRace[];
    onRemoveRace: (raceId: string) => void;
    onClearAll: () => void;
}

const RaceListPanel: React.FC<RaceListPanelProps> = ({ races, onRemoveRace, onClearAll }) => {
    return (
        <div className="race-list-container">
            <div className="race-list-header">
                <h3 className="race-list-title">
                    Loaded Races
                    <span className="race-count-badge" style={{ marginLeft: "10px" }}>
                        {races.length}
                    </span>
                </h3>
                <button className="clear-all-btn" onClick={onClearAll}>
                    Clear All
                </button>
            </div>
            <div className="race-list">
                {races.map(race => (
                    <div key={race.id} className="race-item">
                        <div className="race-item-info">
                            <span className="race-item-name">{race.fileName}</span>
                            <span className="race-item-details">
                                {race.raceDistance}m • {race.horseInfo.length} horses
                            </span>
                        </div>
                        <button
                            className="race-item-remove"
                            onClick={() => onRemoveRace(race.id)}
                            title="Remove race"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RaceListPanel;
