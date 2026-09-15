import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import PaginationControls from "../../components/PaginationControls";
import type { ReplaySearchResponse, ReplaySortDir, ReplaySortKey } from "./replaysShared";
import { ReplayResultLineup } from "./ReplayResultDisplay";

export const REPLAY_RESULTS_PAGE_SIZE = 20;

type ReplayResultsPanelProps = {
    results: ReplaySearchResponse | null;
    currentPage: number;
    queryLoading: boolean;
    sortKey: ReplaySortKey;
    sortDir: ReplaySortDir;
    strategyColors: Record<number, string>;
    containerRef: RefObject<HTMLDivElement | null>;
    onPageChange: (page: number) => void;
    onSortKeyChange: (key: ReplaySortKey) => void;
    onSortDirectionToggle: () => void;
};

function toRaceRouteId(raceUid: string): string {
    const lastSegment = raceUid.split("/").pop() ?? raceUid;
    return lastSegment.endsWith(".json") ? lastSegment.slice(0, -5) : lastSegment;
}

function formatFinishTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00.00";
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

export default function ReplayResultsPanel({
    results,
    currentPage,
    queryLoading,
    sortKey,
    sortDir,
    strategyColors,
    containerRef,
    onPageChange,
    onSortKeyChange,
    onSortDirectionToggle,
}: ReplayResultsPanelProps) {
    const navigate = useNavigate();
    const openReplay = (raceUid: string, inNewTab = false) => {
        const route = `/racedata/${encodeURIComponent(toRaceRouteId(raceUid))}`;
        if (inNewTab) {
            window.open(route, "_blank", "noopener,noreferrer");
            return;
        }
        navigate(route);
    };

    return (
        <div className="uma-replays-layout">
            <div ref={containerRef} className="uma-replays-results">
                <div className="uma-replays-results-header">
                    <div className="uma-replays-results-header-top">
                        <strong>Results</strong>
                        {results && results.total > REPLAY_RESULTS_PAGE_SIZE && (
                            <PaginationControls
                                currentPage={currentPage}
                                totalItems={results.total}
                                pageSize={REPLAY_RESULTS_PAGE_SIZE}
                                disabled={queryLoading}
                                showSummary={false}
                                className="pagination-controls--header pagination-controls--compact"
                                onPageChange={onPageChange}
                            />
                        )}
                    </div>
                    <div className="uma-replays-results-header-meta">
                        <div className="uma-replays-sort-controls">
                            <label className="uma-replays-sort-label">
                                Sort by
                                <select
                                    className="uma-replays-sort-select"
                                    value={sortKey}
                                    onChange={(event) => onSortKeyChange(event.target.value as ReplaySortKey)}
                                >
                                    <option value="finishTime">Finish time</option>
                                    <option value="date">Date</option>
                                </select>
                            </label>
                            <button
                                type="button"
                                className="uma-replays-sort-dir-btn"
                                onClick={onSortDirectionToggle}
                                title={sortDir === "desc" ? "Descending" : "Ascending"}
                            >
                                {sortDir === "desc" ? "Desc" : "Asc"}
                            </button>
                        </div>
                        <span>{results ? `${results.total.toLocaleString()} match(es)` : "No query run yet"}</span>
                    </div>
                </div>
                <div className="uma-replays-results-body">
                    {!results && !queryLoading && (
                        <div className="uma-replays-placeholder">
                            Set your replay filters, then click <strong>Run Replay Query</strong>.
                        </div>
                    )}
                    {results && results.races.length === 0 && (
                        <div className="uma-replays-placeholder">No races matched the current replay filter.</div>
                    )}
                    {results?.races.map((row) => (
                        <div
                            key={row.raceUid}
                            className="uma-replays-result-row"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => openReplay(row.raceUid, event.ctrlKey || event.metaKey)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    openReplay(row.raceUid);
                                }
                            }}
                        >
                            <div className="uma-replays-result-head">
                                <div className="uma-replays-result-subtitle">
                                    Room R{row.roomRunawayCount}/F{row.roomFrontCount}/P{row.roomPaceCount}/L{row.roomLateCount}/E{row.roomEndCount}
                                </div>
                                <div className="uma-replays-result-meta">
                                    <span className="uma-replays-result-time">{formatFinishTime(row.finishTime)}</span>
                                    <button
                                        type="button"
                                        className="uma-replays-open-tab-btn"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openReplay(row.raceUid, true);
                                        }}
                                        title="Open replay in new tab"
                                    >
                                        Open
                                    </button>
                                </div>
                            </div>
                            <ReplayResultLineup
                                winnerTeam={row.winnerTeam}
                                enemyTeams={row.enemyTeams}
                                winnerCardId={row.winnerCardId}
                                winnerStrategy={row.winnerStrategy}
                                strategyColors={strategyColors}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
