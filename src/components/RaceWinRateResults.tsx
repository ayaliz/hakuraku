import { ProgressBar } from "react-bootstrap";
import {
    raceWinRatePercent,
    type RaceWinRateBatch,
    type RaceWinRateRunner,
    type RaceWinRateTeam,
} from "../data/RaceWinRateSimulation";
import AssetLoader from "../data/AssetLoader";
import "./RaceWinRateResults.css";

type Props = {
    batch: RaceWinRateBatch;
    active?: boolean;
    title?: string;
    onClose?: () => void;
    getTeamLabel?: (team: RaceWinRateTeam, teamIndex: number, runners: RaceWinRateRunner[]) => string;
    getRunnerLabel?: (runner: RaceWinRateRunner) => string;
};

function statusText(batch: RaceWinRateBatch): string {
    if (batch.status === "queued") {
        return `Queued at position ${batch.queue?.position ?? "…"}${batch.queue?.racesAhead
            ? ` · ${batch.queue.racesAhead} races ahead`
            : ""}`;
    }
    if (batch.status === "running") return `Running ${batch.completedRaces} of ${batch.totalRaces} races`;
    if (batch.status === "cancel_requested") return "Cancelling after the current race…";
    if (batch.status === "completed") return `${batch.completedRaces} races completed`;
    if (batch.status === "cancelled") return `Cancelled after ${batch.completedRaces} races`;
    return "";
}

function RunnerPortrait({ runner, label }: { runner: RaceWinRateRunner; label: string }) {
    const fallback = AssetLoader.getCharaIcon(runner.charaId || Math.floor(runner.cardId / 100));
    const source = runner.cardId ? AssetLoader.getCharaThumb(runner.cardId) : fallback;
    return <span className="race-win-rate-portrait" data-initial={label.trim().charAt(0) || "?"}>
        <img
            src={source}
            alt=""
            loading="lazy"
            onError={event => {
                if (event.currentTarget.src !== new URL(fallback, window.location.href).href) {
                    event.currentTarget.src = fallback;
                } else {
                    event.currentTarget.hidden = true;
                }
            }}
        />
    </span>;
}

export default function RaceWinRateResults({
    batch,
    active = false,
    title = "Estimated win rate",
    onClose,
    getTeamLabel = (_team, teamIndex) => `Team ${teamIndex + 1}`,
    getRunnerLabel = runner => `Gate ${runner.gateNumber}`,
}: Props) {
    return <section className="race-win-rate" aria-live="polite">
        <div className="race-win-rate-header">
            <div>
                <h2>{title}</h2>
                <div className="race-win-rate-status">{statusText(batch)}</div>
            </div>
            <div className="race-win-rate-header-actions">
                <div className="race-win-rate-seed">Starting seed {batch.seedStart}</div>
                {onClose && <button
                    type="button"
                    className="race-win-rate-close"
                    onClick={onClose}
                    aria-label="Close win-rate estimate"
                    title="Close"
                >×</button>}
            </div>
        </div>
        {active && <ProgressBar
            now={batch.progress * 100}
            min={0}
            max={100}
            animated={batch.status === "running"}
            className="race-win-rate-progress"
            aria-label="Win-rate simulation progress"
        />}
        {batch.results.teams.length > 0 && <div className="race-win-rate-teams">
            {batch.results.teams.map((team, teamIndex) => ({ team, teamIndex }))
                .map(({ team, teamIndex }) => {
                    const runners = batch.results.runners.filter(runner =>
                        runner.teamIndex === teamIndex || runner.teamId === team.teamId);
                    return <div className="race-win-rate-team" key={`${team.teamId}-${teamIndex}`}>
                        <div className="race-win-rate-team-summary">
                            <span>{getTeamLabel(team, teamIndex, runners)}</span>
                            <strong>{raceWinRatePercent(team.winRate)}</strong>
                        </div>
                        <div className="race-win-rate-runners">
                            {runners
                                .sort((left, right) => left.memberIndex - right.memberIndex)
                                .map(runner => {
                                    const label = getRunnerLabel(runner);
                                    return <div className="race-win-rate-runner" key={runner.slot}>
                                        <span
                                            className="race-win-rate-runner-fill"
                                            style={{ width: `${Math.max(0, Math.min(100, runner.winRate * 100))}%` }}
                                            aria-hidden="true"
                                        />
                                        <RunnerPortrait runner={runner} label={label} />
                                        <span className="race-win-rate-runner-name">{label}</span>
                                        <strong>{raceWinRatePercent(runner.winRate)}</strong>
                                    </div>;
                                })}
                        </div>
                    </div>;
                })}
        </div>}
    </section>;
}
