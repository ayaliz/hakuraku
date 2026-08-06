import React from "react";
import { Alert, Spinner } from "react-bootstrap";
import { POP_FILTER_OPTIONS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import AssetLoader from "../../data/AssetLoader";
import type { StyleDeckRow } from "./umaLogsTypes";

interface StyleDecksModalProps {
    open: boolean;
    onClose: () => void;
    deckDataLoading: boolean;
    deckDataUnavailable: boolean;
    deckDataError: string | null;
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
                    {deckDataLoading && deckDataUnavailable ? null : selectedStyleDeckList.length === 0 ? (
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
                </div>
            </div>
        </div>
    );
};

export default StyleDecksModal;
