import React from "react";
import { POP_FILTER_OPTIONS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import type { OverviewSkillRow } from "./umaLogsTypes";

interface SkillsByStrategyModalProps {
    open: boolean;
    onClose: () => void;
    skillsByStrategy: Record<number, OverviewSkillRow[]>;
    skillsStrategyTab: number;
    setSkillsStrategyTab: (n: number) => void;
    skillsSort: "pop" | "winRate";
    setSkillsSort: (s: "pop" | "winRate") => void;
    skillsMinPopPct: 0 | 0.5 | 1 | 2;
    setSkillsMinPopPct: (v: 0 | 0.5 | 1 | 2) => void;
    getSkillIconUrl: (id: number) => string | null;
}

const SkillsByStrategyModal: React.FC<SkillsByStrategyModalProps> = ({
    open,
    onClose,
    skillsByStrategy,
    skillsStrategyTab,
    setSkillsStrategyTab,
    skillsSort,
    setSkillsSort,
    skillsMinPopPct,
    setSkillsMinPopPct,
    getSkillIconUrl,
}) => {
    if (!open) return null;

    const strategyRows = skillsByStrategy[skillsStrategyTab] ?? [];
    const effectiveMinPop = skillsSort === "winRate" ? skillsMinPopPct : 0;
    const filtered = effectiveMinPop > 0 ? strategyRows.filter(r => r.popPct >= effectiveMinPop) : strategyRows;
    const sorted = skillsSort === "pop"
        ? [...filtered].sort((a, b) => b.popPct - a.popPct)
        : [...filtered].filter(r => r.winAppearances > 0).sort((a, b) => b.adjWinRate - a.adjWinRate);
    const maxP = Math.max(...sorted.map(r => Math.max(r.popPct, r.adjWinRate * 100)), 1);
    const activeStrategies = ([5, 1, 2, 3, 4] as const).filter(s => (skillsByStrategy[s]?.length ?? 0) > 0);

    return (
        <div className="cdt-overlay" onClick={onClose}>
            <div className="cdt-modal ca-skills-modal" onClick={e => e.stopPropagation()}>
                <div className="cdt-header">
                    <h3 className="cdt-title">Skills by Strategy</h3>
                    <div className="ca-sort-toggle ca-sort-toggle--modal">
                        <button className={`ca-sort-btn${skillsSort === "pop" ? " ca-sort-btn--active" : ""}`} onClick={() => setSkillsSort("pop")}>By Population</button>
                        <button className={`ca-sort-btn${skillsSort === "winRate" ? " ca-sort-btn--active" : ""}`} onClick={() => setSkillsSort("winRate")}>By Adj. Win%</button>
                    </div>
                    <button className="cdt-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="cdt-content">
                    <div className="histogram-toggle uma-gate-toggle uma-toggle-row-spaced">
                        {activeStrategies.map(sId => (
                            <button
                                key={sId}
                                className={`histogram-toggle-btn uma-gate-toggle-btn${skillsStrategyTab === sId ? " active" : ""}`}
                                onClick={() => setSkillsStrategyTab(sId)}
                            >
                                {STRATEGY_NAMES[sId] ?? `Strategy ${sId}`}
                            </button>
                        ))}
                    </div>
                    {skillsSort === "winRate" && (
                        <div className="scp-pop-filter-toggle uma-toggle-row-spaced">
                            {POP_FILTER_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    className={`scp-pop-filter-btn${skillsMinPopPct === opt.value ? " active" : ""}`}
                                    onClick={() => setSkillsMinPopPct(opt.value as 0 | 0.5 | 1 | 2)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {sorted.length === 0 ? (
                        <span className="sa-no-data">No skill data for this strategy.</span>
                    ) : sorted.map(row => {
                        const iconUrl = getSkillIconUrl(row.skillId);
                        return (
                        <div key={row.skillId} className="sa-sb-row">
                            <div className="ca-char-label">
                                {iconUrl && <img src={iconUrl} alt="" className="ca-skills-skill-icon" />}
                                <span className="ca-skills-skill-name">{row.name}</span>
                                {row.isInherit && <span className="exp-skill-inherit-tag">(inherit)</span>}
                            </div>
                            <div className="sa-sb-bar-row">
                                <div className="sa-sb-bar-label">Pop%</div>
                                <div className="sa-sb-track sa-sb-track--pick">
                                    <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / maxP) * 100}%` }} />
                                </div>
                                <div className="sa-sb-value sa-sb-value--pick uma-bar-value-wide">
                                    {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                                </div>
                            </div>
                            <div className="sa-sb-bar-row">
                                <div className="sa-sb-bar-label">Win%</div>
                                <div className="sa-sb-track sa-sb-track--win">
                                    <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / maxP) * 100}%`, background: "#68d391" }} />
                                </div>
                                <div className="sa-sb-value sa-sb-value--win uma-bar-value-wide">
                                    {(row.adjWinRate * 100).toFixed(1)}% <span className="ca-abs-count">({row.winAppearances})</span>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SkillsByStrategyModal;
