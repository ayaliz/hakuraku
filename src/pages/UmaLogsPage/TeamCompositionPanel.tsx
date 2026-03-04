import React, { useState, useMemo } from "react";
import type { TeamCompositionStats, HorseEntry, SkillStats } from "../MultiRacePage/types";
import AssetLoader from "../../data/AssetLoader";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import "./UmaLogsPage.css";

const MIN_APPEARANCES = 5;
const MAX_ITEMS = 10;
const BAYES_PRIOR = 1 / 3;

interface TeamCompositionPanelProps {
    teamStats: TeamCompositionStats[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
}

const TeamCompositionPanel: React.FC<TeamCompositionPanelProps> = ({ teamStats, allHorses, skillStats }) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const bestHorseByMember = useMemo(() => {
        if (!allHorses) return new Map<string, HorseEntry>();
        const map = new Map<string, HorseEntry>();
        for (const h of allHorses) {
            if (h.rankScore <= 0) continue;
            const key = `${h.cardId}_${h.strategy}`;
            const existing = map.get(key);
            if (!existing || h.rankScore > existing.rankScore) map.set(key, h);
        }
        return map;
    }, [allHorses]);

    const canExpand = !!(allHorses && skillStats);

    const eligible = teamStats.filter(t => t.appearances >= MIN_APPEARANCES);
    if (eligible.length === 0) return null;

    const sorted = [...eligible].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    const overperformers = sorted.filter(t => t.bayesianWinRate > BAYES_PRIOR).slice(0, MAX_ITEMS);
    const underperformers = sorted.filter(t => t.bayesianWinRate < BAYES_PRIOR && t.wins > 0).slice(-MAX_ITEMS).reverse();

    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const renderComposition = (t: TeamCompositionStats, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const key = t.members.map(m => `${m.cardId}_${m.strategy}`).join('__');
        const isSelected = selectedKey === key;
        return (
            <React.Fragment key={key}>
                <div
                    className={`tcp-row${canExpand ? " sa-stcp-item--clickable" : ""}${isSelected ? " ca-row--selected" : ""}`}
                    onClick={canExpand ? () => setSelectedKey(k => k === key ? null : key) : undefined}
                >
                    <div className="tcp-icons">
                        {t.members.map((m, i) => {
                            const src = AssetLoader.getCharaThumb(m.cardId);
                            const stratColor = STRATEGY_COLORS[m.strategy] ?? "#718096";
                            const label = `${m.charaName} (${STRATEGY_NAMES[m.strategy] ?? m.strategy})`;
                            return (
                                <div
                                    key={i}
                                    title={label}
                                    className="tcp-portrait"
                                    style={{ border: `2px solid ${stratColor}` }}
                                >
                                    {src && (
                                        <img
                                            src={src}
                                            alt={label}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="tcp-names">
                        {t.members.map((m, i) => {
                            const memberWins = t.memberWins ?? [];
                            const pct = t.appearances > 0 ? Math.round((memberWins[i] ?? 0) / t.appearances * 100) : 0;
                            return `${m.charaName} (${pct}%)`;
                        }).join(" · ")}
                    </div>
                    <div className="tcp-stats">
                        <span className="tcp-adj-pct" style={{ color: valueColor }}>{(t.bayesianWinRate * 100).toFixed(0)}%</span>
                        <span className="tcp-pipe"> | </span>
                        <span className="tcp-raw-pct">{(t.winRate * 100).toFixed(0)}% ({t.appearances})</span>
                    </div>
                </div>
                {isSelected && canExpand && (
                    <div className="tcp-member-drilldown">
                        <div className="stcp-team-members-row">
                            {t.members.map((m, i) => {
                                const horse = bestHorseByMember.get(`${m.cardId}_${m.strategy}`);
                                if (!horse) return null;
                                return <TeamMemberCard key={i} horse={horse} skillStats={skillStats!} />;
                            })}
                        </div>
                    </div>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="skill-analysis-section">
            <h4 className="section-heading">Team Composition Performance</h4>
            <div className="tcp-container">
                {overperformers.length > 0 && (
                    <div className="tcp-group">
                        <div className="tcp-group-label tcp-group-label--over">Overperformers<span className="tcp-meta"><span className="tcp-meta-adj tcp-meta-adj--over">Adj. win%</span><span className="tcp-meta-raw"> | Raw win% (samples)</span></span></div>
                        {overperformers.map(t => renderComposition(t, true))}
                    </div>
                )}
                {underperformers.length > 0 && (
                    <div className="tcp-group">
                        <div className="tcp-group-label tcp-group-label--under">Underperformers<span className="tcp-meta"><span className="tcp-meta-adj tcp-meta-adj--under">Adj. win%</span><span className="tcp-meta-raw"> | Raw win% (samples)</span></span></div>
                        {underperformers.map(t => renderComposition(t, false))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamCompositionPanel;
