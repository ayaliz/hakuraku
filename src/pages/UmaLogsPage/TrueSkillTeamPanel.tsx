import React, { useState } from "react";
import type { TrueSkillTeamEntry, TrueSkillMember, HorseEntry, SkillStats } from "../MultiRacePage/types";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import AssetLoader from "../../data/AssetLoader";
import "./UmaLogsPage.css";

function memberToHorse(m: TrueSkillMember): HorseEntry {
    return {
        raceId: '',
        frameOrder: 0,
        finishOrder: m.finishOrder ?? 0,
        charaId: m.charaId,
        charaName: m.charaName,
        cardId: m.cardId,
        strategy: m.strategy,
        trainerName: '',
        activatedSkillIds: new Set(m.activatedSkillIds),
        learnedSkillIds: new Set(m.learnedSkillIds),
        finishTime: m.finishTime ?? 0,
        raceDistance: 0,
        speed: m.speed,
        stamina: m.stamina,
        pow: m.pow,
        guts: m.guts,
        wiz: m.wiz,
        rankScore: m.rankScore,
        motivation: m.motivation,
        activationChance: 0,
        isPlayer: false,
        teamId: 0,
        supportCardIds: m.supportCardIds,
        supportCardLimitBreaks: m.supportCardLimitBreaks,
        aptGround: m.aptGround,
        aptDistance: m.aptDistance,
        aptStyle: m.aptStyle,
    };
}

interface TrueSkillTeamPanelProps {
    ranking: TrueSkillTeamEntry[];
    skillStats: Map<number, SkillStats>;
}

const TrueSkillTeamPanel: React.FC<TrueSkillTeamPanelProps> = ({ ranking, skillStats }) => {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    if (ranking.length === 0) return null;

    return (
        <div className="skill-analysis-section ts-panel">
            <h4 className="section-heading">Top Teams by <a href="https://trueskill.org/" target="_blank" rel="noopener noreferrer" className="ts-heading-link">TrueSkill</a> Rating</h4>
            <div className="ts-ranking-list">
                {ranking.map((entry, idx) => {
                    const isExpanded = expandedIdx === idx;
                    const winRate = entry.appearances > 0 ? entry.wins / entry.appearances : 0;
                    return (
                        <div key={idx} className="ts-entry">
                            <div
                                className={`ts-entry-header${isExpanded ? " ts-entry-header--open" : ""}`}
                                role="button"
                                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                            >
                                <div className="ts-rank-badge">#{idx + 1}</div>
                                <div className="ts-entry-portraits">
                                    {entry.members.map((m, i) => (
                                        <img
                                            key={i}
                                            src={AssetLoader.getCharaThumb(m.cardId)}
                                            alt={m.charaName}
                                            className="ts-portrait-sm"
                                            title={m.charaName}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    ))}
                                </div>
                                <div className="ts-entry-names">
                                    {entry.members.map(m => m.charaName).join(" · ")}
                                </div>
                                <div className="ts-entry-stats">
                                    <span className="ts-conservative" title="Conservative skill estimate (μ − 3σ)">
                                        {entry.conservative.toFixed(1)}
                                    </span>
                                    <span className="ts-pipe"> | </span>
                                    <span className="ts-mu-sigma" title="μ ± σ">
                                        μ {entry.mu.toFixed(1)} ±{entry.sigma.toFixed(1)}
                                    </span>
                                    <span className="ts-pipe"> | </span>
                                    <span className="ts-appearances" title="Wins / appearances">
                                        {entry.wins}W / {entry.appearances} ({(winRate * 100).toFixed(0)}%)
                                    </span>
                                </div>
                                <div className="ts-expand-hint">{isExpanded ? "▲" : "▼"}</div>
                            </div>
                            {isExpanded && (
                                <div className="ts-entry-cards">
                                    <div className="stcp-team-members-row">
                                        {entry.members.map((m, i) => (
                                            <TeamMemberCard
                                                key={i}
                                                horse={memberToHorse(m)}
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
