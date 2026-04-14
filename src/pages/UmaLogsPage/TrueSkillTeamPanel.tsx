import React, { useState } from "react";
import type {
    EmpiricalBayesTeamEntry,
    HorseEntry,
    SkillStats,
    TeamRankingMember,
    TrueSkillTeamEntry,
} from "../MultiRacePage/types";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/TeamMemberCard";
import AssetLoader from "../../data/AssetLoader";
import "./UmaLogsPage.css";

type TeamRankingVariant = "trueskill" | "empiricalBayes";
type TeamRankingEntry = TrueSkillTeamEntry | EmpiricalBayesTeamEntry;

function memberToHorse(member: TeamRankingMember): HorseEntry {
    return {
        raceId: "",
        frameOrder: 0,
        finishOrder: member.finishOrder ?? 0,
        charaId: member.charaId,
        charaName: member.charaName,
        cardId: member.cardId,
        strategy: member.strategy,
        trainerName: "",
        activatedSkillIds: new Set(member.activatedSkillIds),
        learnedSkillIds: new Set(member.learnedSkillIds),
        finishTime: member.finishTime ?? 0,
        raceDistance: 0,
        careerWinCount: member.careerWinCount ?? 0,
        speed: member.speed,
        stamina: member.stamina,
        pow: member.pow,
        guts: member.guts,
        wiz: member.wiz,
        rankScore: member.rankScore,
        motivation: member.motivation,
        activationChance: 0,
        isPlayer: false,
        teamId: 0,
        supportCardIds: member.supportCardIds,
        supportCardLimitBreaks: member.supportCardLimitBreaks,
        aptGround: member.aptGround,
        aptDistance: member.aptDistance,
        aptStyle: member.aptStyle,
    };
}

function renderTitle(variant: TeamRankingVariant) {
    if (variant === "empiricalBayes") {
        return "Top Teams by Empirical-Bayes Win Rate";
    }
    return (
        <>
            Top Teams by <a href="https://trueskill.org/" target="_blank" rel="noopener noreferrer" className="ts-heading-link">TrueSkill</a> Rating
        </>
    );
}

function renderStats(entry: TeamRankingEntry, variant: TeamRankingVariant) {
    const winRate = entry.appearances > 0 ? entry.wins / entry.appearances : 0;
    if (variant === "empiricalBayes") {
        const empiricalBayesEntry = entry as EmpiricalBayesTeamEntry;
        return (
            <>
                <span className="ts-conservative" title="Posterior team win rate after shrinkage toward the room baseline.">
                    {(empiricalBayesEntry.bayesWinRate * 100).toFixed(1)}%
                </span>
                <span className="ts-pipe"> | </span>
                <span className="ts-mu-sigma" title="Raw observed win rate before shrinkage">
                    raw {(empiricalBayesEntry.rawWinRate * 100).toFixed(1)}%
                </span>
                <span className="ts-pipe"> | </span>
                <span className="ts-appearances" title="Wins / appearances">
                    {entry.wins}W / {entry.appearances} ({(winRate * 100).toFixed(0)}%)
                </span>
            </>
        );
    }

    const trueSkillEntry = entry as TrueSkillTeamEntry;
    return (
        <>
            <span className="ts-conservative" title="Conservative skill estimate (mu - 3 sigma)">
                {trueSkillEntry.conservative.toFixed(1)}
            </span>
            <span className="ts-pipe"> | </span>
            <span className="ts-mu-sigma" title="mu plus/minus sigma">
                mu {trueSkillEntry.mu.toFixed(1)} +/-{trueSkillEntry.sigma.toFixed(1)}
            </span>
            <span className="ts-pipe"> | </span>
            <span className="ts-appearances" title="Wins / appearances">
                {entry.wins}W / {entry.appearances} ({(winRate * 100).toFixed(0)}%)
            </span>
        </>
    );
}

interface TrueSkillTeamPanelProps {
    variant?: TeamRankingVariant;
    ranking: TeamRankingEntry[];
    skillStats: Map<number, SkillStats>;
}

const TrueSkillTeamPanel: React.FC<TrueSkillTeamPanelProps> = ({ variant = "trueskill", ranking, skillStats }) => {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    if (ranking.length === 0) return null;

    return (
        <div className="skill-analysis-section ts-panel">
            <h4 className="section-heading">{renderTitle(variant)}</h4>
            <div className="ts-ranking-list">
                {ranking.map((entry, idx) => {
                    const isExpanded = expandedIdx === idx;
                    return (
                        <div key={idx} className="ts-entry">
                            <div
                                className={`ts-entry-header${isExpanded ? " ts-entry-header--open" : ""}`}
                                role="button"
                                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                            >
                                <div className="ts-rank-badge">#{idx + 1}</div>
                                <div className="ts-entry-portraits">
                                    {entry.members.map((member, memberIdx) => (
                                        <img
                                            key={memberIdx}
                                            src={AssetLoader.getCharaThumb(member.cardId)}
                                            alt={member.charaName}
                                            className="ts-portrait-sm"
                                            title={member.charaName}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    ))}
                                </div>
                                <div className="ts-entry-names">
                                    {entry.members.map((member) => member.charaName).join(" · ")}
                                </div>
                                <div className="ts-entry-stats">
                                    {renderStats(entry, variant)}
                                </div>
                                <div className="ts-expand-hint">{isExpanded ? "▲" : "▼"}</div>
                            </div>
                            {isExpanded && (
                                <div className="ts-entry-cards">
                                    <div className="stcp-team-members-row">
                                        {entry.members.map((member, memberIdx) => (
                                            <TeamMemberCard
                                                key={memberIdx}
                                                horse={memberToHorse(member)}
                                                skillStats={skillStats}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TrueSkillTeamPanel;
