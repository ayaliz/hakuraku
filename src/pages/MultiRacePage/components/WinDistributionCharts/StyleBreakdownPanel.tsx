import { STRATEGY_NAMES, STYLE_BREAKDOWN_STRATEGY_ORDER } from "./constants";
import type { StrategyStats } from "../../types";
import InfoTooltip from "./InfoTooltip";

export function StyleBreakdownPanel({ strategyStats, totalRaces, strategyColors, shareLabel = "Pop%", shareDescription = "popularity", usageCounts }: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    strategyColors: Record<number, string>;
    shareLabel?: string;
    shareDescription?: string;
    usageCounts?: Record<number, number>;
}) {
    const sumEntries = usageCounts ? Object.values(usageCounts).reduce((a, b) => a + b, 0) : strategyStats.reduce((s, st) => s + st.totalRaces, 0);
    const rows = STYLE_BREAKDOWN_STRATEGY_ORDER.map(sId => {
        const stat = strategyStats.find(s => s.strategy === sId);
        const winShare = stat && totalRaces > 0 ? (stat.wins / totalRaces) * 100 : 0;
        const pickRate = sumEntries > 0 ? ((usageCounts?.[sId] ?? (usageCounts ? 0 : stat?.totalRaces ?? 0)) / sumEntries) * 100 : 0;
        return { sId, winShare, pickRate };
    });
    const globalMax = Math.max(...rows.flatMap(r => [r.winShare, r.pickRate]), 1);

    return (
        <div className="sa-panel sa-panel--breakdown">
            <div className="sa-panel-header">
                <span className="sa-panel-header-title">
                    Style Breakdown
                    <InfoTooltip
                        id="style-breakdown-info"
                        tip={usageCounts ? "Win% is the style's share of wins in the full simulation. Share% is its share of Uma slots across each player's best active team." : `A style's win share exceeding its ${shareDescription} means its win rate is above average.`}
                    />
                </span>
            </div>
            {rows.map(({ sId, winShare, pickRate }) => {
                const color = strategyColors[sId];
                const winW = (winShare / globalMax) * 100;
                const pickW = (pickRate / globalMax) * 100;
                return (
                    <div key={sId} className="sa-sb-row">
                        <div className="sa-sb-strategy-label">
                            <span className="sa-sb-dot" style={{ background: color }} />
                            <span className="sa-sb-strategy-name">{STRATEGY_NAMES[sId]}</span>
                        </div>
                        <div className="sa-sb-bar-row">
                            <div className="sa-sb-bar-label">Win%</div>
                            <div className="sa-sb-track sa-sb-track--win">
                                <div className="sa-sb-bar-fill" style={{ width: `${winW}%`, background: color }} />
                            </div>
                            <div className="sa-sb-value sa-sb-value--win">{winShare.toFixed(1)}%</div>
                        </div>
                        <div className="sa-sb-bar-row">
                            <div className="sa-sb-bar-label">{shareLabel}</div>
                            <div className="sa-sb-track sa-sb-track--pick">
                                <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${pickW}%` }} />
                            </div>
                            <div className="sa-sb-value sa-sb-value--pick">{pickRate.toFixed(1)}%</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
