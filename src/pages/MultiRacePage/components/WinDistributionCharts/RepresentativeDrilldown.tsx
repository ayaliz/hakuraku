import type { HorseEntry, SkillStats } from "../../types";
import type { SerializedHorseEntry } from "./shared";
import { deserializeHorseEntry, deserializeHorseEntries } from "./shared";
import type { TeamSampleSelectOption } from "./TeamSampleSelect";
import { TeamMemberCard } from "./TeamMemberCard";

export type RepresentativeDrilldownEntry = {
    horse: HorseEntry;
    teamHorses?: HorseEntry[];
    teamOptions?: Array<TeamSampleSelectOption & { teamHorses: HorseEntry[] }>;
    bayesianWinRate: number;
    winRate: number;
    appearances: number;
    teamBayesianWinRate?: number;
    teamWinRate?: number;
    teamWins?: number;
    teamAppearances?: number;
};

type SerializedRepresentativeDrilldownEntry = {
    horse: SerializedHorseEntry;
    teamHorses?: SerializedHorseEntry[];
    teamOptions?: Array<TeamSampleSelectOption & { teamHorses: SerializedHorseEntry[] }>;
    bayesianWinRate: number;
    winRate: number;
    appearances: number;
    teamBayesianWinRate?: number;
    teamWinRate?: number;
    teamWins?: number;
    teamAppearances?: number;
};

export type StyleRepresentativeResponse = {
    cmId: string;
    courseId: number;
    strategy: number;
    cardId: number;
    samples: SerializedRepresentativeDrilldownEntry[];
    teamSamples?: SerializedRepresentativeDrilldownEntry[];
};

export function buildStyleRepresentativeUrl(
    cmId: string,
    courseId: number,
    strategy: number,
    cardId: number,
    apiBase = "",
): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/style-reps/${strategy}/${cardId}`;
}

export function deserializeRepresentativeEntries(
    samples: SerializedRepresentativeDrilldownEntry[] | undefined,
): RepresentativeDrilldownEntry[] {
    return (samples ?? []).map((sample) => ({
        horse: deserializeHorseEntry(sample.horse),
        teamHorses: deserializeHorseEntries(sample.teamHorses ?? []),
        teamOptions: (sample.teamOptions ?? []).map((option) => ({
            ...option,
            teamHorses: deserializeHorseEntries(option.teamHorses),
        })),
        bayesianWinRate: sample.bayesianWinRate,
        winRate: sample.winRate,
        appearances: sample.appearances,
        teamBayesianWinRate: sample.teamBayesianWinRate,
        teamWinRate: sample.teamWinRate,
        teamWins: sample.teamWins,
        teamAppearances: sample.teamAppearances,
    }));
}

export function RepresentativeDrilldown({
    title,
    individualEntries,
    teamEntries,
    loading = false,
    error,
    skillStats,
    strategyColors,
    onViewReplays,
}: {
    title: string;
    individualEntries: RepresentativeDrilldownEntry[];
    teamEntries: RepresentativeDrilldownEntry[];
    loading?: boolean;
    error?: string | null;
    skillStats: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
}) {
    const renderCards = (entries: RepresentativeDrilldownEntry[], mode: "personal" | "team") => (
        <div className="stcp-team-members-row">
            {entries.slice(0, 6).map((entry, index) => (
                <div
                    key={`${mode}-${entry.horse.raceId}-${entry.horse.frameOrder}-${index}`}
                    className="sa-reps-drilldown-card"
                >
                    <div className="sa-reps-drilldown-winrate">
                        {mode === "team" ? (
                            <>
                                <span className="sa-adj-pct">{((entry.teamBayesianWinRate ?? 0) * 100).toFixed(0)}%</span>
                                <span className="sa-pipe"> | </span>
                                <span className="sa-raw-pct">
                                    {((entry.teamWinRate ?? 0) * 100).toFixed(0)}% ({entry.teamAppearances ?? entry.appearances})
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="sa-adj-pct">{(entry.bayesianWinRate * 100).toFixed(0)}%</span>
                                <span className="sa-pipe"> | </span>
                                <span className="sa-raw-pct">
                                    {(entry.winRate * 100).toFixed(0)}% ({entry.appearances})
                                </span>
                            </>
                        )}
                    </div>
                    <TeamMemberCard
                        horse={entry.horse}
                        skillStats={skillStats}
                        strategyColors={strategyColors}
                        teamHorses={entry.teamHorses}
                        teamOptions={entry.teamOptions}
                        onViewReplays={onViewReplays}
                    />
                </div>
            ))}
        </div>
    );

    return (
        <div className="stcp-drilldown">
            <div className="stcp-drilldown-header">
                <div className="stcp-drilldown-title">{title}</div>
                {!loading && (individualEntries.length > 0 || teamEntries.length > 0) && (
                    <div className="stcp-drilldown-subtitle">
                        Unique umas ranked separately by individual and team Bayesian-adjusted win rate.
                    </div>
                )}
            </div>
            {loading ? (
                <div className="sa-no-data">Loading representative samples...</div>
            ) : individualEntries.length === 0 && teamEntries.length === 0 ? (
                <div className="sa-no-data">{error ?? "No representative samples available."}</div>
            ) : (
                <>
                    <div className="stcp-drilldown-section-title">Individual win rate</div>
                    {individualEntries.length > 0
                        ? renderCards(individualEntries, "personal")
                        : <div className="sa-no-data">No individual representatives available.</div>}
                    <div className="stcp-drilldown-section-title">Team win rate</div>
                    {teamEntries.length > 0
                        ? renderCards(teamEntries, "team")
                        : <div className="sa-no-data">No team representatives available.</div>}
                </>
            )}
        </div>
    );
}
