import { useState } from "react";
import { Modal, ProgressBar } from "react-bootstrap";
import {
    firstSpurtHpMargin,
    extraHpNeededForRate,
    extraMaxHpNeeded,
    hpRateMilestones,
    placementHistogram,
    raceWinRatePercent,
    survivalHpMargin,
    rawStaminaNeededForMaxHp,
    type RaceWinRateBatch,
    type RaceWinRateRunner,
    type RaceWinRateRace,
    type RaceWinRateTeam,
} from "../data/RaceWinRateSimulation";
import AssetLoader from "../data/AssetLoader";
import { getSkillIconUrl } from "../data/skillIcons";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import { getRankIcon } from "./RaceDataPresenter/components/CharaList/rankUtils";
import "./RaceWinRateResults.css";

const SHOW_RUNNER_DETAILS = true;

type Props = {
    batch: RaceWinRateBatch;
    active?: boolean;
    title?: string;
    onClose?: () => void;
    getTeamLabel?: (team: RaceWinRateTeam, teamIndex: number, runners: RaceWinRateRunner[]) => string;
    getRunnerLabel?: (runner: RaceWinRateRunner) => string;
    getRunnerBuild?: (runner: RaceWinRateRunner) => RaceWinRateRunnerBuild | undefined;
    onViewRace?: (race: RaceWinRateRace) => void;
};

export type RaceWinRateRunnerBuild = {
    rankScore: number;
    stats: [number, number, number, number, number];
    skillPoints: number;
    skillIds: number[];
    rawStamina?: number;
    motivation?: number;
    /** Internal running-style index: Nige=0 through Oonige=4. */
    runningStyle?: number;
};

const runnerStatIcons = [
    ["speed", "Speed"],
    ["stamina", "Stamina"],
    ["power", "Power"],
    ["guts", "Guts"],
    ["wit", "Wit"],
    ["hint", "Skill points"],
] as const;

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

function RunnerStats({ build, className = "" }: { build: RaceWinRateRunnerBuild; className?: string }) {
    const statValues = [...build.stats, build.skillPoints];
    return <span className={`race-win-rate-runner-stats${className ? ` ${className}` : ""}`}>
        {runnerStatIcons.map(([icon, name], index) => <span key={icon} title={name}>
            <img src={AssetLoader.getStatIcon(icon)} alt={name} />
            {statValues[index].toLocaleString()}
        </span>)}
    </span>;
}

function formatHpMargin(value: number): string {
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded} HP`;
    if (rounded < 0) return `−${Math.abs(rounded)} HP`;
    return "0 HP";
}

function HistoryHpMetrics({ race, runnerIndex }: { race: RaceWinRateRace; runnerIndex: number }) {
    const spurtMargin = firstSpurtHpMargin(race, runnerIndex);
    const survivalMargin = survivalHpMargin(race, runnerIndex);
    if (spurtMargin === null && survivalMargin === null) return null;
    const checkHp = race.checkHp?.[runnerIndex]?.[0];
    const requiredHp = race.fullSpurtNeedHp?.[runnerIndex]?.[0];
    const finalHp = race.finalHp?.[runnerIndex];
    const deficit = race.hpDeficit?.[runnerIndex];
    return <span className="race-win-rate-history-hp">
        {spurtMargin !== null && <span
            className={spurtMargin >= 0 ? "is-positive" : "is-negative"}
            title={`First spurt check: ${Math.round(Number(checkHp))} HP available, ${Math.round(Number(requiredHp))} HP required.`}
        >
            <span className="race-win-rate-history-hp-label">Spurt</span>
            <span>{formatHpMargin(spurtMargin)}</span>
            <strong aria-label={spurtMargin >= 0 ? "Enough HP for full spurt" : "Not enough HP for full spurt"}>
                {spurtMargin >= 0 ? "✓" : "×"}
            </strong>
        </span>}
        {survivalMargin !== null && <span
            className={survivalMargin > 0 ? "is-positive" : "is-negative"}
            title={survivalMargin > 0
                ? `Finished with ${Math.round(Number(finalHp))} HP.`
                : `Needed ${Math.round(Number(deficit ?? Math.abs(survivalMargin)))} more HP to survive.`}
        >
            <span className="race-win-rate-history-hp-label">Survival</span>
            <span>{formatHpMargin(survivalMargin)}</span>
            <strong aria-label={survivalMargin > 0 ? "Survived" : "Did not survive"}>
                {survivalMargin > 0 ? "✓" : "×"}
            </strong>
        </span>}
    </span>;
}

function placementLabel(index: number): string {
    if (index === 0) return "1st";
    if (index === 1) return "2nd";
    if (index === 2) return "3rd";
    return `${index + 1}th`;
}

function hpRequirementLabel(extraHp: number): string {
    return `+${Math.ceil(extraHp)} HP`;
}

function HpMarginBreakdown({ title, margins, maxHpNeeds, runner, build }: {
    title: string;
    margins: number[];
    maxHpNeeds: number[];
    runner: RaceWinRateRunner;
    build?: RaceWinRateRunnerBuild;
}) {
    const sorted = margins.filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return <section className="race-win-rate-detail-section">
        <h4>{title}</h4>
        <p className="race-win-rate-detail-empty">HP data was not returned for these races.</p>
    </section>;
    const milestones = hpRateMilestones(sorted);
    const currentRate = sorted.filter(value => value >= 0).length / sorted.length;
    const rawStamina = Number(runner.rawStamina ?? build?.rawStamina);
    const motivation = Number(runner.motivation ?? build?.motivation);
    const runningStyle = Number(runner.runningStyle ?? build?.runningStyle);
    const staminaRequirements = maxHpNeeds.length === margins.length
        ? milestones.map(item => {
            const extraMaxHp = extraHpNeededForRate(maxHpNeeds, item.rate);
            return extraMaxHp === null ? null : rawStaminaNeededForMaxHp(
                extraMaxHp,
                rawStamina,
                motivation,
                runningStyle,
            );
        })
        : [];
    const hasStaminaRequirements = staminaRequirements.length === milestones.length
        && staminaRequirements.every(value => value !== null);
    return <section className="race-win-rate-detail-section">
        <div className="race-win-rate-detail-section-heading">
            <h4>{title}</h4>
            <div className="race-win-rate-current-rate">
                <span>Current</span>
                <strong>{raceWinRatePercent(currentRate)}</strong>
            </div>
        </div>
        {milestones.length > 0 && <div
            className={`race-win-rate-hp-rail${hasStaminaRequirements ? " has-stamina" : ""}`}
            style={{ gridTemplateColumns: `repeat(${milestones.length + 1}, minmax(0, 1fr))` }}
            aria-label={`${title} HP requirements`}
        >
            <div className="is-current">
                <strong>{raceWinRatePercent(currentRate)}</strong>
                <i />
                <span>Current</span>
            </div>
            {milestones.map((item, index) => <div key={item.rate}>
                <strong>{raceWinRatePercent(item.rate)}</strong>
                <i />
                <span>{hpRequirementLabel(item.extraHp)}</span>
                {hasStaminaRequirements && <small>+{staminaRequirements[index]} Stamina</small>}
            </div>)}
        </div>}
        {!milestones.length && <p className="race-win-rate-all-passed">Every simulated race already passed this HP check.</p>}
    </section>;
}

function RunnerSkillActivations({ runner, build, raceCount }: {
    runner: RaceWinRateRunner;
    build?: RaceWinRateRunnerBuild;
    raceCount: number;
}) {
    if (!runner.skillActivations) return null;
    const byId = new Map(runner.skillActivations.map(item => [item.skillId, item]));
    const skillIds = [...new Set([...(build?.skillIds ?? []), ...byId.keys()])];
    const skills = skillIds.map(skillId => {
        const activation = byId.get(skillId);
        return {
            skillId,
            name: UMDatabaseWrapper.skillNameWithEnglishFallback(skillId),
            icon: getSkillIconUrl(skillId),
            racesActivated: activation?.racesActivated ?? 0,
            activations: activation?.activations ?? 0,
        };
    }).sort((left, right) => right.racesActivated - left.racesActivated
        || right.activations - left.activations
        || left.name.localeCompare(right.name)
        || left.skillId - right.skillId);
    const denominator = Math.max(1, raceCount);
    return <section className="race-win-rate-detail-section race-win-rate-skill-section">
        <div className="race-win-rate-detail-section-heading">
            <h4>Skill activations</h4>
            <span>{skills.filter(skill => skill.racesActivated > 0).length} of {skills.length} activated</span>
        </div>
        {skills.length ? <ul className="race-win-rate-skill-grid">{skills.map(skill => {
            const rate = skill.racesActivated / denominator;
            return <li key={skill.skillId}>
                {skill.icon
                    ? <img src={skill.icon} alt="" loading="lazy" />
                    : <span className="race-win-rate-skill-placeholder" aria-hidden="true">◇</span>}
                <span className="race-win-rate-skill-name">
                    <strong>{skill.name}</strong>
                </span>
                <b className={skill.racesActivated > 0 ? "is-active" : ""}>{raceWinRatePercent(rate)}</b>
            </li>;
        })}</ul> : <p className="race-win-rate-detail-empty">No equipped or activated skills were returned.</p>}
    </section>;
}

function RunnerDetailsModal({ runner, label, build, races, runnerIndex, onClose }: {
    runner: RaceWinRateRunner;
    label: string;
    build?: RaceWinRateRunnerBuild;
    races: RaceWinRateRace[];
    runnerIndex: number;
    onClose: () => void;
}) {
    const placements = placementHistogram(races, runnerIndex);
    const countedPlacements = placements.reduce((sum, count) => sum + count, 0);
    const spurtMargins = races.map(race => firstSpurtHpMargin(race, runnerIndex))
        .filter((value): value is number => value !== null);
    const survivalMargins = races.map(race => survivalHpMargin(race, runnerIndex))
        .filter((value): value is number => value !== null);
    const spurtMaxHpNeeds = races.map(race => extraMaxHpNeeded(race, runnerIndex, "spurt"))
        .filter((value): value is number => value !== null);
    const survivalMaxHpNeeds = races.map(race => extraMaxHpNeeded(race, runnerIndex, "survival"))
        .filter((value): value is number => value !== null);
    const rank = build ? getRankIcon(build.rankScore) : undefined;
    const placementRate = (lastIndex: number) => countedPlacements
        ? placements.slice(0, lastIndex + 1).reduce((sum, count) => sum + count, 0) / countedPlacements
        : 0;
    const maxPlacementCount = Math.max(1, ...placements);
    return <Modal show onHide={onClose} centered size="xl" scrollable className="race-win-rate-details-modal"
        contentClassName="bg-dark text-light border-secondary">
        <Modal.Header closeButton closeVariant="white" className="border-secondary">
            <Modal.Title>
                <RunnerPortrait runner={runner} label={label} />
                <span className="race-win-rate-modal-runner-info">
                    <span className="race-win-rate-modal-runner-name">
                        <strong>{label}</strong>
                        {rank && <img
                            src={rank.icon}
                            alt={rank.name}
                            title={`${build!.rankScore.toLocaleString()} rank score`}
                        />}
                    </span>
                    {build && <RunnerStats build={build} className="race-win-rate-modal-stats" />}
                </span>
            </Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <section className="race-win-rate-detail-section">
                <div className="race-win-rate-placement-headlines">
                    <div><strong>{raceWinRatePercent(placementRate(0))}</strong><span>Win</span></div>
                    <div><strong>{raceWinRatePercent(placementRate(2))}</strong><span>Podium</span></div>
                    <div><strong>{raceWinRatePercent(placementRate(4))}</strong><span>Top 5</span></div>
                </div>
                <h5 className="race-win-rate-placement-title">Exact placements</h5>
                <div className="race-win-rate-placement-histogram">
                    {placements.map((count, index) => <div key={index}>
                        <strong>{countedPlacements ? raceWinRatePercent(count / countedPlacements) : "0%"}</strong>
                        <div><i style={{ height: `${count / maxPlacementCount * 100}%` }} /></div>
                        <span>{placementLabel(index)}</span>
                        <small>{count} {count === 1 ? "race" : "races"}</small>
                    </div>)}
                </div>
            </section>
            <div className="race-win-rate-hp-detail-grid">
                <HpMarginBreakdown
                    title="Full spurt chance"
                    margins={spurtMargins}
                    maxHpNeeds={spurtMaxHpNeeds}
                    runner={runner}
                    build={build}
                />
                <HpMarginBreakdown
                    title="Finish survival chance"
                    margins={survivalMargins}
                    maxHpNeeds={survivalMaxHpNeeds}
                    runner={runner}
                    build={build}
                />
            </div>
            <RunnerSkillActivations runner={runner} build={build} raceCount={races.length} />
        </Modal.Body>
    </Modal>;
}

export default function RaceWinRateResults({
    batch,
    active = false,
    title = "Estimated win rate",
    onClose,
    getTeamLabel = (_team, teamIndex) => `Team ${teamIndex + 1}`,
    getRunnerLabel = runner => `Gate ${runner.gateNumber}`,
    getRunnerBuild,
    onViewRace,
}: Props) {
    const [selectedRunnerSlot, setSelectedRunnerSlot] = useState<number | null>(null);
    const outcomeIndex = (runner: RaceWinRateRunner) => Number.isInteger(runner.frameOrder)
        ? runner.frameOrder
        : runner.slot;
    const runnerByOutcomeIndex = new Map(batch.results.runners.map(runner => [outcomeIndex(runner), runner]));
    const selectedRunner = selectedRunnerSlot === null
        ? undefined
        : batch.results.runners.find(runner => runner.slot === selectedRunnerSlot);
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
                                    const build = getRunnerBuild?.(runner);
                                    const rank = build ? getRankIcon(build.rankScore) : undefined;
                                    return <div className="race-win-rate-runner" key={runner.slot}>
                                        <span
                                            className="race-win-rate-runner-fill"
                                            style={{ width: `${Math.max(0, Math.min(100, runner.winRate * 100))}%` }}
                                            aria-hidden="true"
                                        />
                                        <RunnerPortrait runner={runner} label={label} />
                                        <span className="race-win-rate-runner-info">
                                            <span className="race-win-rate-runner-name-wrap">
                                                <span className="race-win-rate-runner-name">{label}</span>
                                                {rank && <img
                                                    className="race-win-rate-runner-rank"
                                                    src={rank.icon}
                                                    alt={rank.name}
                                                    title={`${build!.rankScore.toLocaleString()} rank score`}
                                                />}
                                            </span>
                                            {build && <RunnerStats build={build} />}
                                        </span>
                                        {SHOW_RUNNER_DETAILS && batch.results.races?.length > 0 && <button
                                            type="button"
                                            className="race-win-rate-runner-details"
                                            onClick={() => setSelectedRunnerSlot(runner.slot)}
                                            aria-label={`View simulation details for ${label}`}
                                        >View details</button>}
                                        <strong>{raceWinRatePercent(runner.winRate)}</strong>
                                    </div>;
                                })}
                        </div>
                    </div>;
                })}
        </div>}
        {onViewRace && batch.results.races?.length > 0 && <details className="race-win-rate-history">
            <summary>Race history <span>{batch.results.races.length} races</span></summary>
            <div className="race-win-rate-history-list">
                {batch.results.races.map((race, position) => {
                    const order = Array.isArray(race.finishOrder) ? race.finishOrder : [];
                    const winnerIndex = order[0] ?? race.winner?.runnerIndex;
                    const winningRunner = winnerIndex === undefined ? undefined : runnerByOutcomeIndex.get(winnerIndex);
                    const placementByOutcomeIndex = new Map(order.slice(0, 3).map((runnerIndex, index) => [runnerIndex, index + 1]));
                    return <div className="race-win-rate-history-row" key={`${race.seed}-${race.index ?? position}`}>
                        <span className="race-win-rate-history-number">#{(race.index ?? position) + 1}</span>
                        <div className="race-win-rate-history-teams">
                            {batch.results.teams.map((team, teamIndex) => {
                                const runners = batch.results.runners
                                    .filter(runner => runner.teamIndex === teamIndex || runner.teamId === team.teamId)
                                    .sort((left, right) => left.memberIndex - right.memberIndex);
                                const teamWon = winningRunner?.teamIndex === teamIndex
                                    || (race.winner?.teamId !== undefined && String(race.winner.teamId) === String(team.teamId));
                                return <div
                                    className={`race-win-rate-history-team${teamWon ? " is-winner" : ""}`}
                                    key={`${team.teamId}-${teamIndex}`}
                                    title={`${getTeamLabel(team, teamIndex, runners)}${teamWon ? " — winning team" : ""}`}
                                >
                                    <span className="race-win-rate-history-portraits">
                                        {runners.map(runner => {
                                            const runnerIndex = outcomeIndex(runner);
                                            const winner = runnerIndex === winnerIndex;
                                            const placement = placementByOutcomeIndex.get(runnerIndex) ?? (winner ? 1 : undefined);
                                            const placementLabel = placement === 1 ? "1st" : placement === 2 ? "2nd" : placement === 3 ? "3rd" : null;
                                            const label = getRunnerLabel(runner);
                                            return <span
                                                className={`race-win-rate-history-portrait${winner ? " is-winner" : ""}`}
                                                title={`${label}${winner ? " — winner" : ""}`}
                                                key={runner.slot}
                                            >
                                                <HistoryHpMetrics race={race} runnerIndex={runnerIndex} />
                                                <span className="race-win-rate-history-portrait-image">
                                                    <RunnerPortrait runner={runner} label={label} />
                                                    {placementLabel && <span
                                                        className={`race-win-rate-history-crown is-place-${placement}`}
                                                        aria-label={`${placementLabel} place`}
                                                    >{placementLabel}</span>}
                                                </span>
                                            </span>;
                                        })}
                                    </span>
                                </div>;
                            })}
                        </div>
                        {onViewRace && <button type="button" onClick={() => onViewRace(race)}>View race</button>}
                    </div>;
                })}
            </div>
        </details>}
        {SHOW_RUNNER_DETAILS && selectedRunner && <RunnerDetailsModal
            runner={selectedRunner}
            label={getRunnerLabel(selectedRunner)}
            build={getRunnerBuild?.(selectedRunner)}
            races={batch.results.races}
            runnerIndex={outcomeIndex(selectedRunner)}
            onClose={() => setSelectedRunnerSlot(null)}
        />}
    </section>;
}
