import React, { useState, useMemo } from "react";
import "./SupportCardPanel.css";
import type { HorseEntry } from "../../types";
import AssetLoader from "../../../../data/AssetLoader";

import { BAYES_UMA } from "./constants";

const LB_COLORS = ["#4a5568", "#718096", "#4299e1", "#ed8936", "#ecc94b"];
const LB_LABELS = ["0", "1", "2", "3", "4"];

const FINGERPRINT = (h: HorseEntry) =>
    `${h.cardId}_${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}_${h.rankScore}_${Array.from(h.learnedSkillIds).sort().join(',')}`;

interface SupportCardRow {
    cardId: number;
    // pop / LB — deduped per unique uma
    appearances: number;
    popPct: number;
    lbDist: number[];
    // win stats — raw per match
    rawWins: number;
    rawApps: number;
    adjWinRate: number;
}

interface SupportCardPanelProps {
    horses: HorseEntry[];
}

const SupportCardPanel: React.FC<SupportCardPanelProps> = ({ horses }) => {
    const [sortMode, setSortMode] = useState<"pop" | "winRate">("pop");

    const rows = useMemo((): SupportCardRow[] => {
        if (horses.length === 0) return [];

        // Bayesian prior from raw per-match data
        const rawTotal = horses.filter(h => h.supportCardIds.length > 0).length;
        const rawTotalWins = horses.filter(h => h.supportCardIds.length > 0 && h.finishOrder === 1).length;
        const priorMean = rawTotal > 0 ? rawTotalWins / rawTotal : 1 / 9;

        // Per-card raw win stats (per match, not deduped)
        const rawMap = new Map<number, { wins: number; apps: number }>();
        for (const h of horses) {
            for (const cardId of h.supportCardIds) {
                if (!rawMap.has(cardId)) rawMap.set(cardId, { wins: 0, apps: 0 });
                const r = rawMap.get(cardId)!;
                r.apps++;
                if (h.finishOrder === 1) r.wins++;
            }
        }

        // Per-card pop and LB distribution (deduped per unique uma)
        const seen = new Set<string>();
        const dedupMap = new Map<number, { apps: number; lbDist: number[] }>();
        for (const h of horses) {
            if (h.supportCardIds.length === 0) continue;
            const fp = FINGERPRINT(h);
            if (seen.has(fp)) continue;
            seen.add(fp);
            for (let i = 0; i < h.supportCardIds.length; i++) {
                const cardId = h.supportCardIds[i];
                const lb = h.supportCardLimitBreaks[i] ?? 0;
                if (!dedupMap.has(cardId)) dedupMap.set(cardId, { apps: 0, lbDist: [0, 0, 0, 0, 0] });
                const d = dedupMap.get(cardId)!;
                d.apps++;
                d.lbDist[Math.min(lb, 4)]++;
            }
        }
        const dedupeTotal = seen.size;

        return Array.from(rawMap.entries()).map(([cardId, { wins, apps }]) => {
            const d = dedupMap.get(cardId) ?? { apps: 0, lbDist: [0, 0, 0, 0, 0] };
            return {
                cardId,
                appearances: d.apps,
                popPct: dedupeTotal > 0 ? (d.apps / dedupeTotal) * 100 : 0,
                lbDist: d.lbDist,
                rawWins: wins,
                rawApps: apps,
                adjWinRate: (wins + BAYES_UMA.K * priorMean) / (apps + BAYES_UMA.K),
            };
        });
    }, [horses]);

    const sorted = useMemo(() => {
        if (sortMode === "pop") return [...rows].sort((a, b) => b.appearances - a.appearances);
        return [...rows].filter(r => r.rawWins > 0).sort((a, b) => b.adjWinRate - a.adjWinRate);
    }, [rows, sortMode]);

    const maxPct = Math.max(...sorted.flatMap(r => [r.popPct, r.adjWinRate * 100]), 1);

    return (
        <div className="scp-panel">
            <div className="scp-controls">
                <div className="ca-sort-toggle">
                    <button
                        className={`ca-sort-btn${sortMode === "pop" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("pop")}>
                        By Population
                    </button>
                    <button
                        className={`ca-sort-btn${sortMode === "winRate" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("winRate")}>
                        By Adj. Win%
                    </button>
                </div>
                <span className="scp-info-icon" title="Card population and limit breaks are counted per unique uma. Win rate reflects all match appearances.">ⓘ</span>
            </div>
            {sorted.length === 0 ? (
                <span className="sa-no-data">No card data.</span>
            ) : sorted.map(row => {
                const lbTotal = row.lbDist.reduce((a, b) => a + b, 0);
                return (
                    <div key={row.cardId} className="sa-sb-row scp-row">
                        <img
                            src={AssetLoader.getSupportCardIcon(row.cardId)}
                            alt={`Card ${row.cardId}`}
                            className="scp-card-icon"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="deck-bars">
                            <div className="sa-sb-bar-row">
                                <div className="sa-sb-bar-label">Pop%</div>
                                <div className="sa-sb-track sa-sb-track--pick">
                                    <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / maxPct) * 100}%` }} />
                                </div>
                                <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                                    {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                                </div>
                            </div>
                            <div className="sa-sb-bar-row">
                                <div className="sa-sb-bar-label">Win%</div>
                                <div className="sa-sb-track sa-sb-track--win">
                                    <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / maxPct) * 100}%`, background: "#68d391" }} />
                                </div>
                                <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                                    {(row.adjWinRate * 100).toFixed(1)}%
                                </div>
                            </div>
                            {lbTotal > 0 && (
                                <div className="sa-sb-bar-row">
                                    <div className="sa-sb-bar-label scp-lb-label">LB</div>
                                    <div className="scp-lb-bar">
                                        {row.lbDist.map((count, lb) => count > 0 && (
                                            <div
                                                key={lb}
                                                className="scp-lb-segment"
                                                style={{ width: `${(count / lbTotal) * 100}%`, background: LB_COLORS[lb] }}
                                                title={`LB${lb}: ${((count / lbTotal) * 100).toFixed(1)}% (${count})`}
                                            >
                                                {(count / lbTotal) >= 0.07 && LB_LABELS[lb]}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="scp-lb-spacer" />
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default SupportCardPanel;
