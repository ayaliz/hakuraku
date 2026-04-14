import React from "react";
import { Alert, Spinner } from "react-bootstrap";
import { POP_FILTER_OPTIONS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import AssetLoader from "../../data/AssetLoader";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";
import type { RaceBonusOverviewRow, StyleDeckRow } from "./umaLogsTypes";
import { RACE_BONUS_OTHER_MIN_POP_PCT } from "./umaLogsTypes";

interface StyleDecksModalProps {
    open: boolean;
    onClose: () => void;
    deckDataLoading: boolean;
    deckDataUnavailable: boolean;
    deckDataError: string | null;
    deckModalTab: "overview" | "decks";
    setDeckModalTab: (t: "overview" | "decks") => void;
    raceBonusRows: RaceBonusOverviewRow[];
    availableDeckStyleIds: number[];
    selectedDeckStyle: number;
    setSelectedDeckStyle: (n: number) => void;
    styleDeckSort: "pop" | "winRate";
    setStyleDeckSort: (s: "pop" | "winRate") => void;
    styleDeckMinPopPct: 0 | 0.5 | 1 | 2;
    setStyleDeckMinPopPct: (v: 0 | 0.5 | 1 | 2) => void;
    selectedStyleDeckList: StyleDeckRow[];
    selectedStyleDeckMaxPct: number;
}

const StyleDecksModal: React.FC<StyleDecksModalProps> = ({
    open,
    onClose,
    deckDataLoading,
    deckDataUnavailable,
    deckDataError,
    deckModalTab,
    setDeckModalTab,
    raceBonusRows,
    availableDeckStyleIds,
    selectedDeckStyle,
    setSelectedDeckStyle,
    styleDeckSort,
    setStyleDeckSort,
    styleDeckMinPopPct,
    setStyleDeckMinPopPct,
    selectedStyleDeckList,
    selectedStyleDeckMaxPct,
}) => {
    if (!open) return null;
    return (
        <div className="cdt-overlay" onClick={onClose}>
            <div className="cdt-modal ca-decks-modal" onClick={e => e.stopPropagation()}>
                <div className="cdt-header">
                    <h3 className="cdt-title">Decks</h3>
                    <div className="ca-sort-toggle ca-sort-toggle--modal">
                        <button
                            className={`ca-sort-btn${deckModalTab === "overview" ? " ca-sort-btn--active" : ""}`}
                            onClick={() => setDeckModalTab("overview")}>
                            Overview
                        </button>
                        <button
                            className={`ca-sort-btn${deckModalTab === "decks" ? " ca-sort-btn--active" : ""}`}
                            onClick={() => setDeckModalTab("decks")}>
                            Decks
                        </button>
                    </div>
                    <button className="cdt-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="cdt-content">
                    {deckDataLoading && deckDataUnavailable && (
                        <div className="p-4 text-center">
                            <Spinner animation="border" /> Loading deck data...
                        </div>
                    )}
                    {deckDataError && deckDataUnavailable && (
                        <Alert variant="warning" className="mb-3">
                            <strong>Deck data not available.</strong>
                            <br />
                            <small className="text-muted">{deckDataError}</small>
                        </Alert>
                    )}
                    {deckModalTab === "overview" && (() => {
                        const maxPct = Math.max(...raceBonusRows.filter(r => !r.isOther).map(r => Math.max(r.popPct, r.adjWinRate * 100)), 1);
                        return raceBonusRows.length === 0
                            ? <span className="sa-no-data">No deck data available.</span>
                            : (
                                <table className="rb-table">
                                    <thead>
                                        <tr>
                                            <th className="rb-th">Race Bonus</th>
                                            <th className="rb-th rb-th--r">Entries</th>
                                            <th className="rb-th rb-th--r">Wins</th>
                                            <th className="rb-th rb-th--bars">Pop% / Adj. Win%</th>
                                        </tr>
                                    </thead>
                                        <tbody>
                                            {raceBonusRows.map(row => (
                                            <tr key={row.isOther ? "other" : row.bucketStart} className="rb-row">
                                                <td className="rb-td rb-td--bonus">
                                                    {row.isOther ? (
                                                        <span className="uma-muted-inline">
                                                            Other{" "}
                                                            <InfoTooltip
                                                                id="race-bonus-other-info"
                                                                tip={`Race bonus buckets with under ${RACE_BONUS_OTHER_MIN_POP_PCT}% population are grouped here.`}
                                                            />
                                                        </span>
                                                    ) : `${row.bucketStart}-${row.bucketEnd}%`}
                                                </td>
                                                <td className="rb-td rb-td--r">{row.appearances}</td>
                                                <td className="rb-td rb-td--r">{row.wins}</td>
                                                <td className="rb-td rb-td--bars">
                                                    <div className="sa-sb-bar-row">
                                                        <div className="sa-sb-bar-label">Pop%</div>
                                                        <div className="sa-sb-track sa-sb-track--pick">
                                                            <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / maxPct) * 100}%` }} />
                                                        </div>
                                                        <div className="sa-sb-value sa-sb-value--pick">{row.popPct.toFixed(1)}%</div>
                                                    </div>
                                                    {!row.isOther && (
                                                        <div className="sa-sb-bar-row">
                                                            <div className="sa-sb-bar-label">Win%</div>
                                                            <div className="sa-sb-track sa-sb-track--win">
                                                                <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / maxPct) * 100}%`, background: "#68d391" }} />
                                                            </div>
                                                            <div className="sa-sb-value sa-sb-value--win">{(row.adjWinRate * 100).toFixed(1)}%</div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            );
                    })()}
                    {deckModalTab === "decks" && (
                        <>
                            <div className="histogram-toggle uma-gate-toggle uma-toggle-row-spaced">
                                {availableDeckStyleIds.map((sid) => (
                                    <button
                                        key={sid}
                                        className={`histogram-toggle-btn uma-gate-toggle-btn${selectedDeckStyle === sid ? " active" : ""}`}
                                        onClick={() => setSelectedDeckStyle(sid)}
                                    >
                                        {STRATEGY_NAMES[sid] ?? `Style ${sid}`}
                                    </button>
                                ))}
                            </div>
                            <div className="ca-sort-toggle uma-toggle-row-spaced">
                                <button
                                    className={`ca-sort-btn${styleDeckSort === "pop" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setStyleDeckSort("pop")}>
                                    By Population
                                </button>
                                <button
                                    className={`ca-sort-btn${styleDeckSort === "winRate" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setStyleDeckSort("winRate")}>
                                    By Adj. Win%
                                </button>
                            </div>
                            {styleDeckSort === "winRate" && (
                                <div className="histogram-toggle uma-gate-toggle uma-toggle-row-spaced">
                                    {POP_FILTER_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            className={`histogram-toggle-btn uma-gate-toggle-btn${styleDeckMinPopPct === opt.value ? " active" : ""}`}
                                            onClick={() => setStyleDeckMinPopPct(opt.value as 0 | 0.5 | 1 | 2)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedStyleDeckList.length === 0 ? (
                                <span className="sa-no-data">No deck data for this style.</span>
                            ) : selectedStyleDeckList.slice(0, 20).map(row => (
                                <div key={`${selectedDeckStyle}_${row.deckKey}`} className="sa-sb-row deck-row">
                                    <div className="deck-cards-grid">
                                        {row.cardIds.map((id, i) => (
                                            <img
                                                key={i}
                                                src={AssetLoader.getSupportCardIcon(id)}
                                                alt={`Card ${id}`}
                                                className="deck-card-icon"
                                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ))}
                                    </div>
                                    <div className="deck-bars">
                                        <div className="uma-race-bonus-line">Race bonus: <span className="uma-race-bonus-value">{row.raceBonus}%</span></div>
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Pop%</div>
                                            <div className="sa-sb-track sa-sb-track--pick">
                                                <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / selectedStyleDeckMaxPct) * 100}%` }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--pick uma-bar-value-wide">
                                                {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                                            </div>
                                        </div>
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Win%</div>
                                            <div className="sa-sb-track sa-sb-track--win">
                                                <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / selectedStyleDeckMaxPct) * 100}%`, background: "#68d391" }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--win uma-bar-value-wide">
                                                {(row.adjWinRate * 100).toFixed(1)}% <span className="ca-abs-count">({row.wins})</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StyleDecksModal;
