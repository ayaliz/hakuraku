import { STRATEGY_NAMES } from "./constants";
import type { StrategyStats, RoomCompositionEntry } from "../../types";
import { ANALYSIS_STRATEGY_IDS } from "./shared";

export function CompositionSection({ strategyStats, totalRaces, roomCompositions, strategyColors }: {
    strategyStats: StrategyStats[];
    totalRaces: number;
    roomCompositions: RoomCompositionEntry[];
    strategyColors: Record<number, string>;
}) {
    const topRows = roomCompositions.slice(0, 12);
    const runawayIdx = ANALYSIS_STRATEGY_IDS.indexOf(5);
    const frontIdx = ANALYSIS_STRATEGY_IDS.indexOf(1);
    const pacePromotionLobbyRate = totalRaces > 0
        ? roomCompositions.reduce((sum, comp) => {
            const hasNoRunaway = runawayIdx < 0 || (comp.counts[runawayIdx] ?? 0) === 0;
            const hasNoFront = frontIdx < 0 || (comp.counts[frontIdx] ?? 0) === 0;
            return hasNoRunaway && hasNoFront
                ? sum + (comp.occurrences / totalRaces)
                : sum;
        }, 0)
        : 0;
    const avgCounts = ANALYSIS_STRATEGY_IDS.map(sId => {
        const stat = strategyStats.find(s => s.strategy === sId);
        return totalRaces > 0 ? (stat?.totalRaces ?? 0) / totalRaces : 0;
    });
    const colMaxes = ANALYSIS_STRATEGY_IDS.map((_, i) =>
        Math.max(...topRows.map(c => c.counts[i]), avgCounts[i], 1)
    );

    const asRgba = (color: string, alpha: number) => {
        if (color.startsWith("#")) {
            const hex = color.slice(1);
            const fullHex = hex.length === 3
                ? hex.split("").map((ch) => ch + ch).join("")
                : hex;
            const value = Number.parseInt(fullHex, 16);
            const r = (value >> 16) & 255;
            const g = (value >> 8) & 255;
            const b = value & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        if (color.startsWith("rgb(")) {
            return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
        }
        return color;
    };

    const makeBg = (value: number, colIdx: number) => {
        if (value === 0) return "transparent";
        const intensity = value / colMaxes[colIdx];
        const strategy = ANALYSIS_STRATEGY_IDS[colIdx];
        const base = strategyColors[strategy];
        return asRgba(base, Number((0.15 + intensity * 0.65).toFixed(2)));
    };

    return (
        <div className="sa-comp-section">
            <div className="sa-comp-header">
                <span>Room Composition</span>
                <span className="sa-comp-header-stat">
                    Rooms with pace promotion: {(pacePromotionLobbyRate * 100).toFixed(1)}%
                </span>
            </div>
            <table className="sa-comp-table">
                <thead>
                    <tr>
                        {ANALYSIS_STRATEGY_IDS.map(sId => (
                            <th key={sId} className="sa-comp-th">
                                <span className="sa-comp-th-label" style={{ color: strategyColors[sId] }}>
                                    {STRATEGY_NAMES[sId].split(" ")[0].toUpperCase()}
                                </span>
                            </th>
                        ))}
                        <th className="sa-comp-th-freq">
                            <span className="sa-comp-th-freq-label">FREQUENCY</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {avgCounts.map((avg, i) => (
                            <td key={i} className="sa-comp-td sa-comp-td--avg" style={{
                                background: makeBg(avg, i),
                                color: avg > 0 ? "#f7fafc" : "#4a5568",
                            }}>
                                {avg > 0 ? avg.toFixed(1) : "-"}
                            </td>
                        ))}
                        <td className="sa-comp-td-avg-freq">all rooms average</td>
                    </tr>
                    {topRows.map((comp, idx) => (
                        <tr key={idx}>
                            {ANALYSIS_STRATEGY_IDS.map((_, i) => {
                                const count = comp.counts[i];
                                return (
                                    <td key={i} className="sa-comp-td sa-comp-td--row" style={{
                                        background: makeBg(count, i),
                                        color: count > 0 ? "#f7fafc" : "#4a5568",
                                    }}>
                                        {count > 0 ? count : "-"}
                                    </td>
                                );
                            })}
                            <td className="sa-comp-td-freq">{(comp.rate * 100).toFixed(1)}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
