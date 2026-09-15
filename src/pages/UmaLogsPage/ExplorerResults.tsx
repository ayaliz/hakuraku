import React, { useEffect, useMemo } from "react";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import {
    STRATEGY_COLORS,
    STRATEGY_NAMES,
} from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import { RepresentativeDrilldown } from "../MultiRacePage/components/WinDistributionCharts/RepresentativeDrilldown";
import { formatTime } from "../../data/UMDatabaseUtils";
import type { AggRow, SortKey } from "./explorerShared";
import { deserializeHorseEntry, type SerializedHorseEntry } from "./umaLogsApi";

export type ExplorerQueryResponse = {
    totalTeams: number;
    filteredTeams: number;
    filteredTeamWins: number;
    filteredTeamWinPct: number;
    filteredEntries: number;
    hasCharacterFilter: boolean;
    rows: AggRow[];
    drilldown: Array<{
        horse: SerializedHorseEntry;
        bayesianWinRate: number;
        winRate: number;
        appearances: number;
        teamBayesianWinRate?: number;
        teamWinRate?: number;
        teamWins?: number;
        teamAppearances?: number;
    }>;
    teamDrilldown?: ExplorerQueryResponse["drilldown"];
};

type ExplorerResultsProps = {
    result: ExplorerQueryResponse | null;
    bootstrapLoading: boolean;
    queryLoading: boolean;
    hasRunQuery: boolean;
    hideLowQuantity: boolean;
    minimumEntries: number;
    sortKey: SortKey;
    sortDesc: boolean;
    selectedRowKey: string | null;
    onSelectedRowKeyChange: (key: string | null) => void;
    onSort: (key: SortKey) => void;
    skillStats?: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
};

function formatPercent(value: number): string {
    return value.toFixed(1);
}

const ExplorerResults: React.FC<ExplorerResultsProps> = ({
    result,
    bootstrapLoading,
    queryLoading,
    hasRunQuery,
    hideLowQuantity,
    minimumEntries,
    sortKey,
    sortDesc,
    selectedRowKey,
    onSelectedRowKeyChange,
    onSort,
    skillStats,
    strategyColors = STRATEGY_COLORS,
    onViewReplays,
}) => {
    const rows = result?.rows ?? [];
    const displayedRows = useMemo(
        () => hideLowQuantity ? rows.filter((row) => row.entries >= minimumEntries) : rows,
        [hideLowQuantity, minimumEntries, rows],
    );
    const hasCharacterFilter = result?.hasCharacterFilter ?? false;
    const showTeamsColumn = !hasCharacterFilter;
    const drilldownColSpan = 4 + (showTeamsColumn ? 1 : 0) + (hasCharacterFilter ? 2 : 0);
    const selectedRow = useMemo(
        () => displayedRows.find((row) => row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined) ?? null,
        [displayedRows, selectedRowKey],
    );
    const drilldownHorses = useMemo(
        () => (result?.drilldown ?? []).map((entry) => ({
            horse: deserializeHorseEntry(entry.horse),
            bayesianWinRate: entry.bayesianWinRate,
            winRate: entry.winRate,
            appearances: entry.appearances,
            teamBayesianWinRate: entry.teamBayesianWinRate,
            teamWinRate: entry.teamWinRate,
            teamWins: entry.teamWins,
            teamAppearances: entry.teamAppearances,
        })),
        [result],
    );
    const teamDrilldownHorses = useMemo(
        () => (result?.teamDrilldown ?? []).map((entry) => ({
            horse: deserializeHorseEntry(entry.horse),
            bayesianWinRate: entry.bayesianWinRate,
            winRate: entry.winRate,
            appearances: entry.appearances,
            teamBayesianWinRate: entry.teamBayesianWinRate,
            teamWinRate: entry.teamWinRate,
            teamWins: entry.teamWins,
            teamAppearances: entry.teamAppearances,
        })),
        [result],
    );

    useEffect(() => {
        if (selectedRowKey && !displayedRows.some((row) => (
            row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined
        ))) {
            onSelectedRowKeyChange(null);
        }
    }, [displayedRows, onSelectedRowKeyChange, selectedRowKey]);

    const SortArrow = ({ column }: { column: SortKey }) => (
        sortKey === column ? <span className="exp-sort-arrow">{sortDesc ? "v" : "^"}</span> : null
    );

    const renderRow = (row: AggRow) => {
        const strategyColor = row.strategy !== undefined
            ? (strategyColors[row.strategy] ?? "#718096")
            : undefined;
        const canDrilldown = !!skillStats && row.cardId !== undefined && row.strategy !== undefined;
        const isSelected = canDrilldown && selectedRowKey === row.key;
        const iconUrl = row.charaId !== undefined && row.cardId !== undefined
            ? getCharaIcon(`${row.charaId}_${row.cardId}`)
            : null;

        return (
            <React.Fragment key={row.key}>
                <tr
                    className={`exp-row${canDrilldown ? " exp-row--clickable" : ""}${isSelected ? " exp-row--selected" : ""}`}
                    onClick={canDrilldown ? () => onSelectedRowKeyChange(selectedRowKey === row.key ? null : row.key) : undefined}
                >
                    <td className="exp-td exp-td--name">
                        {iconUrl && (
                            <div className="exp-card-portrait">
                                <img src={iconUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                            </div>
                        )}
                        {strategyColor && <span className="exp-dot" style={{ background: strategyColor }} />}
                        <span className="exp-name-block">
                            <span>{row.label}</span>
                            {(row.sublabel || row.isDebuffer) && (
                                <span className="exp-sublabel">
                                    {row.sublabel}
                                    {row.isDebuffer && <span className="exp-debuffer-badge">Debuffer</span>}
                                </span>
                            )}
                        </span>
                    </td>
                    <td className="exp-td exp-td--r">{row.entries}</td>
                    {showTeamsColumn && <td className="exp-td exp-td--r">{row.teams}</td>}
                    <td className="exp-td exp-td--r">
                        {row.wins}
                        {row.entries > 0 && <span className="exp-wins-pct"> ({formatPercent(row.awPct)}%)</span>}
                    </td>
                    <td className="exp-td exp-td--r">
                        {row.teamWins}
                        {row.teams > 0 && <span className="exp-wins-pct"> ({formatPercent(row.teamWinPct)}%)</span>}
                    </td>
                    {hasCharacterFilter && <td className="exp-td exp-td--r">{row.meanFinishTime ? formatTime(row.meanFinishTime) : "-"}</td>}
                    {hasCharacterFilter && <td className="exp-td exp-td--r">{row.medianFinishTime ? formatTime(row.medianFinishTime) : "-"}</td>}
                </tr>
                {isSelected && selectedRow && (drilldownHorses.length > 0 || teamDrilldownHorses.length > 0) && (
                    <tr className="exp-drilldown-row">
                        <td className="exp-drilldown-cell" colSpan={drilldownColSpan}>
                            <RepresentativeDrilldown
                                title={`Top performers for ${selectedRow.label} (${STRATEGY_NAMES[selectedRow.strategy!]}${selectedRow.isDebuffer ? ", Debuffer" : ""})`}
                                individualEntries={drilldownHorses}
                                teamEntries={teamDrilldownHorses}
                                skillStats={skillStats!}
                                strategyColors={strategyColors}
                                onViewReplays={onViewReplays}
                            />
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="exp-panel exp-panel--results">
            {bootstrapLoading || (queryLoading && !result) ? (
                <div className="exp-empty">Loading explorer data...</div>
            ) : !hasRunQuery ? (
                <div className="exp-empty">Set your filters, then click Run Query.</div>
            ) : rows.length === 0 ? (
                <div className="exp-empty">No teams match the current filter.</div>
            ) : displayedRows.length === 0 ? (
                <div className="exp-empty">No results meet the minimum entry quantity.</div>
            ) : (
                <table className="exp-table">
                    <thead>
                        <tr>
                            <th className="exp-th" onClick={() => onSort("label")}>
                                {hasCharacterFilter ? "Uma / Style" : "Style"} <SortArrow column="label" />
                            </th>
                            <th className="exp-th exp-th--r" onClick={() => onSort("entries")} title="Total race appearances">
                                Entries <SortArrow column="entries" />
                            </th>
                            {showTeamsColumn && (
                                <th className="exp-th exp-th--r" onClick={() => onSort("teams")} title="Distinct teams that ran this strategy">
                                    Teams <SortArrow column="teams" />
                                </th>
                            )}
                            <th className="exp-th exp-th--r" onClick={() => onSort("wins")} title="1st place finishes">
                                Wins <SortArrow column="wins" />
                            </th>
                            <th className="exp-th exp-th--r" onClick={() => onSort("teamWins")} title="Distinct teams containing this row that won the race">
                                Team Wins <SortArrow column="teamWins" />
                            </th>
                            {hasCharacterFilter && <th className="exp-th exp-th--r">Mean Time</th>}
                            {hasCharacterFilter && <th className="exp-th exp-th--r">Median Time</th>}
                        </tr>
                    </thead>
                    <tbody>{displayedRows.map(renderRow)}</tbody>
                </table>
            )}
        </div>
    );
};

export default ExplorerResults;
