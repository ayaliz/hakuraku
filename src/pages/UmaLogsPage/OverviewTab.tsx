import React from "react";
import type { HorseEntry } from "../MultiRacePage/types";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";
import AssetLoader from "../../data/AssetLoader";
import { formatTime } from "../../data/UMDatabaseUtils";
import { deserializeHorseEntry } from "./deserialize";
import UmaFeatCard from "./FastestUmaPanel";
import GateStatsPanel from "./GateStatsPanel";
import Histogram from "./Histogram";
import TrueSkillTeamPanel from "./TrueSkillTeamPanel";
import type { GroupPanelData, TrackGroup } from "./umaLogsTypes";

type OverviewTabProps = {
    group: TrackGroup;
    panelData: GroupPanelData;
    scoreWinnersOnly: boolean;
    setScoreWinnersOnly: (value: boolean) => void;
    strategyColors: Record<number, string>;
    onViewReplaysForHorse: (horse: HorseEntry) => void;
    onOpenStyleDecks: () => void;
    onOpenCardUsage: () => void;
    onOpenSkills: () => void;
};

const OverviewTab: React.FC<OverviewTabProps> = ({
    group,
    panelData,
    scoreWinnersOnly,
    setScoreWinnersOnly,
    strategyColors,
    onViewReplaysForHorse,
    onOpenStyleDecks,
    onOpenCardUsage,
    onOpenSkills,
}) => {
    const fastestWin = deserializeHorseEntry(panelData.topHorses.fastestWin);
    const slowestWin = deserializeHorseEntry(panelData.topHorses.slowestWin);
    const highestWinner = deserializeHorseEntry(panelData.topHorses.highestWinner);
    const lowestWinner = deserializeHorseEntry(panelData.topHorses.lowestWinner);
    const scoreHistogram = scoreWinnersOnly
        ? panelData.scoreHistogramWinners
        : panelData.scoreHistogramAll;
    const scenarioRows = panelData.scenarioWinBreakdownRows ?? [];

    return (
        <div className="uma-overview-tab">
            <div className="uma-stats-top">
                <div className="uma-overview-main">
                    <div className="uma-overview-left">
                        <div className="uma-win-row">
                            <Histogram
                                data={panelData.winningTimeHistogram}
                                title="Winning Time Distribution"
                                formatX={(value) => {
                                    const minutes = Math.floor(value / 60);
                                    const seconds = value - minutes * 60;
                                    return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
                                }}
                                xAxisLabel="Finish time (M:SS.ss)"
                                tooltipUnit="race"
                            />
                        </div>
                        <div className="uma-score-row">
                            <Histogram
                                data={scoreHistogram}
                                title="Score Distribution"
                                formatX={(value) => Math.round(value).toLocaleString()}
                                xAxisLabel="Score"
                                barColor="#68d391"
                                tooltipUnit="entry"
                                headerRight={(
                                    <div className="histogram-toggle">
                                        <button
                                            className={`histogram-toggle-btn${!scoreWinnersOnly ? " active" : ""}`}
                                            onClick={() => setScoreWinnersOnly(false)}
                                        >
                                            All
                                        </button>
                                        <button
                                            className={`histogram-toggle-btn${scoreWinnersOnly ? " active" : ""}`}
                                            onClick={() => setScoreWinnersOnly(true)}
                                        >
                                            Winners
                                        </button>
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                    {(fastestWin || slowestWin || highestWinner || lowestWinner) && (
                        <div className="uma-overview-mid">
                            <div className="uma-overview-cards-grid">
                                {fastestWin && (
                                    <UmaFeatCard
                                        horse={fastestWin}
                                        label="Fastest Win"
                                        displayValue={formatTime(fastestWin.finishTime)}
                                        skillStats={group.stats.skillStats}
                                        strategyColors={strategyColors}
                                        onViewReplays={onViewReplaysForHorse}
                                    />
                                )}
                                {slowestWin && (
                                    <UmaFeatCard
                                        horse={slowestWin}
                                        label="Slowest Win"
                                        displayValue={formatTime(slowestWin.finishTime)}
                                        skillStats={group.stats.skillStats}
                                        strategyColors={strategyColors}
                                        onViewReplays={onViewReplaysForHorse}
                                    />
                                )}
                                {highestWinner && (
                                    <UmaFeatCard
                                        horse={highestWinner}
                                        label="Highest Winner"
                                        displayValue={highestWinner.rankScore.toLocaleString()}
                                        displayValueColor="#68d391"
                                        showRankIcon
                                        skillStats={group.stats.skillStats}
                                        strategyColors={strategyColors}
                                        onViewReplays={onViewReplaysForHorse}
                                    />
                                )}
                                {lowestWinner && (
                                    <UmaFeatCard
                                        horse={lowestWinner}
                                        label="Lowest Winner"
                                        displayValue={lowestWinner.rankScore.toLocaleString()}
                                        displayValueColor="#68d391"
                                        showRankIcon
                                        skillStats={group.stats.skillStats}
                                        strategyColors={strategyColors}
                                        onViewReplays={onViewReplaysForHorse}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    <GateStatsPanel gateStats={group.stats.gateStats} />
                </div>
                {scenarioRows.length > 0 && (
                    <div className="uma-scenario-panel">
                        <div className="uma-scenario-header">
                            <span>
                                Scenario Breakdown{" "}
                                <InfoTooltip
                                    id="winning-scenario-breakdown-info"
                                    tip="Win% is share of room winners by training scenario. Pop% is share of non-Debuffer entries by training scenario."
                                />
                            </span>
                            <span className="uma-scenario-total">
                                {scenarioRows.reduce((sum, row) => sum + row.wins, 0).toLocaleString()} wins
                            </span>
                        </div>
                        <div className="uma-scenario-list">
                            {scenarioRows.map((row) => (
                                <div key={row.scenarioId} className="uma-scenario-row">
                                    <div className="uma-scenario-label">
                                        <span className="uma-scenario-dot" />
                                        {row.name}
                                    </div>
                                    <div className="uma-scenario-bars">
                                        <div className="uma-scenario-bar-line">
                                            <span className="uma-scenario-bar-label">Win%</span>
                                            <div className="uma-scenario-bar">
                                                <div
                                                    className="uma-scenario-bar-fill uma-scenario-bar-fill--win"
                                                    style={{ width: `${Math.max(0, Math.min(100, row.winPct ?? row.pct))}%` }}
                                                />
                                            </div>
                                            <span className="uma-scenario-bar-value">
                                                {(row.winPct ?? row.pct).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="uma-scenario-bar-line">
                                            <span className="uma-scenario-bar-label">Pop%</span>
                                            <div className="uma-scenario-bar">
                                                <div
                                                    className="uma-scenario-bar-fill uma-scenario-bar-fill--pop"
                                                    style={{ width: `${Math.max(0, Math.min(100, row.popPct ?? 0))}%` }}
                                                />
                                            </div>
                                            <span className="uma-scenario-bar-value uma-scenario-bar-value--pop">
                                                {(row.popPct ?? 0).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="uma-overview-actions">
                    <button className="ca-decks-btn uma-overview-action-btn" onClick={onOpenStyleDecks} title="View style support decks">
                        <img src={AssetLoader.getStatIcon("deck")} alt="" className="ca-decks-btn-icon" />
                        View decks
                    </button>
                    <button className="ca-decks-btn uma-overview-action-btn" onClick={onOpenCardUsage}>
                        <img src={`${import.meta.env.BASE_URL}assets/textures/card.webp`} alt="" className="ca-decks-btn-icon" />
                        View card usage
                    </button>
                    <button className="ca-decks-btn uma-overview-action-btn" onClick={onOpenSkills}>
                        <img src={`${import.meta.env.BASE_URL}assets/textures/skills.webp`} alt="" className="ca-decks-btn-icon" />
                        View skills
                    </button>
                </div>
                {group.stats.trueskillRanking && group.stats.trueskillRanking.length > 0 && (
                    <TrueSkillTeamPanel
                        variant="trueskill"
                        ranking={group.stats.trueskillRanking}
                        skillStats={group.stats.skillStats}
                    />
                )}
                {group.stats.empiricalBayesRanking && group.stats.empiricalBayesRanking.length > 0 && (
                    <TrueSkillTeamPanel
                        variant="empiricalBayes"
                        ranking={group.stats.empiricalBayesRanking}
                        skillStats={group.stats.skillStats}
                    />
                )}
            </div>
        </div>
    );
};

export default OverviewTab;
