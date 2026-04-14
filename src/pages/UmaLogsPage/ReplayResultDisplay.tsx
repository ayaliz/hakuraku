import React from "react";
import type { ReplayTeamSummary } from "./replaysShared";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import { STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";

export function formatMember(member: { cardId: number; charaId: number; strategy: number }): string {
    const charaName = UMDatabaseWrapper.charas[member.charaId]?.name ?? `Chara ${member.charaId}`;
    return `${charaName} (${STRATEGY_NAMES[member.strategy] ?? member.strategy})`;
}

function orderWinnerTeamMembers(
    members: ReplayTeamSummary["members"],
    winnerCardId: number,
    winnerStrategy: number,
): ReplayTeamSummary["members"] {
    const winner = members.find((member) =>
        member.cardId === winnerCardId && member.strategy === winnerStrategy && member.finishOrder === 1,
    );
    if (!winner) return members;
    return [winner, ...members.filter((member) => member !== winner)];
}

export function ReplayResultPortrait({
    member,
    team,
    winnerCardId,
    winnerStrategy,
    strategyColors,
}: {
    member: ReplayTeamSummary["members"][number];
    team: ReplayTeamSummary;
    winnerCardId: number;
    winnerStrategy: number;
    strategyColors: Record<number, string>;
}) {
    const icon = getCharaIcon(`${member.charaId}_${member.cardId}`);
    const strategyColor = strategyColors[member.strategy] ?? "#718096";
    const rankInfo = getRankIcon(member.rankScore ?? 0);
    const isRaceWinner = team.isWinnerTeam
        && member.cardId === winnerCardId
        && member.strategy === winnerStrategy
        && member.finishOrder === 1;
    return (
        <div
            key={`${team.teamId}-${member.frameOrder}`}
            className={`uma-replays-team-member${isRaceWinner ? " is-race-winner" : ""}`}
            title={formatMember(member)}
            style={{ "--rpl-style-color": strategyColor } as React.CSSProperties}
        >
            <div className="uma-replays-team-member-stack">
                <div className="uma-replays-team-member-frame">
                    {icon ? (
                        <img
                            src={icon}
                            alt={formatMember(member)}
                            className="uma-replays-team-member-img"
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    ) : (
                        <div className="uma-replays-team-member-fallback">{member.cardId}</div>
                    )}
                    {isRaceWinner && <span className="uma-replays-team-member-badge">W</span>}
                </div>
                <div className="uma-replays-team-member-rank" title={member.rankScore ? member.rankScore.toLocaleString() : undefined}>
                    <img
                        src={rankInfo.icon}
                        alt={rankInfo.name}
                        className="uma-replays-team-member-rank-icon"
                    />
                </div>
            </div>
        </div>
    );
}

export function ReplayResultLineup({
    winnerTeam,
    enemyTeams,
    winnerCardId,
    winnerStrategy,
    strategyColors,
}: {
    winnerTeam: ReplayTeamSummary;
    enemyTeams: ReplayTeamSummary[];
    winnerCardId: number;
    winnerStrategy: number;
    strategyColors: Record<number, string>;
}) {
    const teams = [
        { ...winnerTeam, members: orderWinnerTeamMembers(winnerTeam.members, winnerCardId, winnerStrategy) },
        ...enemyTeams,
    ];
    return (
        <div className="uma-replays-lineup" aria-label="Race teams">
            {teams.map((team, teamIndex) => (
                <React.Fragment key={team.teamId}>
                    {teamIndex > 0 && <span className="uma-replays-lineup-separator">|</span>}
                    <div className="uma-replays-lineup-team">
                        {team.members.map((member) => (
                            <ReplayResultPortrait
                                key={`${team.teamId}-${member.frameOrder}`}
                                member={member}
                                team={team}
                                winnerCardId={winnerCardId}
                                winnerStrategy={winnerStrategy}
                                strategyColors={strategyColors}
                            />
                        ))}
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
}
