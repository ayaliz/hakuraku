
import React, { useState, useMemo, useRef, useEffect } from "react";
import "./CharacterAnalysis.css";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./constants";
import { PieSlice } from "./types";
import { getCharaIcon } from "./utils";
import type { CharacterStats, HorseEntry, PairSynergyStats } from "../../types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import AssetLoader from "../../../../data/AssetLoader";
import SupportCardPanel from "./SupportCardPanel";

const PRIOR_MEAN = 1 / 3;
const PRIOR_STRENGTH = 18;

type SynergyEntityInfo = {
    key: string;         // `${cardId}_${strategy}`
    cardId: number;
    strategy: number;
    charaId: number;
    cardName: string;
    charaName: string;
    totalCoApps: number;
};

type SynergyDisplayRow = {
    key: string;
    cardId: number;
    strategy: number;
    charaId: number;
    cardName: string;
    charaName: string;
    coApps: number;
    teamWins: number;
    smoothedRate: number;
    selectedWins: number; // times the selected/filtered entity had finishOrder === 1 in co-appearances
    teammateWins: number; // times this row's entity had finishOrder === 1 in co-appearances
};

interface SynergyEntitySelectProps {
    entities: SynergyEntityInfo[];
    value: string | null;
    onChange: (key: string) => void;
}

const SynergyEntitySelect: React.FC<SynergyEntitySelectProps> = ({ entities, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = entities.find(e => e.key === value) ?? entities[0] ?? null;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    if (!selected) return null;

    const q = search.toLowerCase();
    const filtered = q
        ? entities.filter(e =>
            e.cardName.toLowerCase().includes(q) ||
            e.charaName.toLowerCase().includes(q) ||
            (STRATEGY_NAMES[e.strategy] ?? "").toLowerCase().includes(q))
        : entities;

    const selectedIcon = getCharaIcon(`${selected.charaId}_${selected.cardId}`);
    const selectedStratColor = STRATEGY_COLORS[selected.strategy] ?? "#718096";

    return (
        <div ref={ref} className="syn-select">
            <button type="button" onClick={() => setOpen(o => !o)} className="syn-select-btn">
                <div className="syn-select-portrait">
                    <div className="syn-select-ring" style={{ background: selectedStratColor }} />
                    {selectedIcon && (
                        <img src={selectedIcon} alt="" className="syn-select-img"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    )}
                </div>
                <span className="syn-select-text">
                    <span className="syn-select-name">{selected.charaName}</span>
                    <span className="syn-select-strategy" style={{ color: selectedStratColor }}>{STRATEGY_NAMES[selected.strategy] ?? `Strategy ${selected.strategy}`}</span>
                </span>
                <span className="syn-select-arrow">▾</span>
            </button>

            {open && (
                <div className="syn-select-dropdown">
                    <div className="syn-select-search">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="syn-select-input"
                        />
                    </div>
                    <div className="syn-select-list">
                        {filtered.length === 0 ? (
                            <div className="syn-select-no-matches">No matches</div>
                        ) : filtered.map(e => {
                            const icon = getCharaIcon(`${e.charaId}_${e.cardId}`);
                            const stratColor = STRATEGY_COLORS[e.strategy] ?? "#718096";
                            const isSelected = e.key === (value ?? entities[0]?.key);
                            return (
                                <div
                                    key={e.key}
                                    onClick={() => { onChange(e.key); setOpen(false); }}
                                    className={`syn-select-option${isSelected ? " syn-select-option--active" : ""}`}
                                >
                                    <div className="syn-select-portrait">
                                        <div className="syn-select-ring" style={{ background: stratColor }} />
                                        {icon && (
                                            <img src={icon} alt="" className="syn-select-img"
                                                onError={e2 => { (e2.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                        )}
                                    </div>
                                    <span>
                                        <span className="syn-select-option-name">{e.charaName}</span>
                                        <span className="syn-select-option-strategy" style={{ color: stratColor }}>{STRATEGY_NAMES[e.strategy] ?? `Strategy ${e.strategy}`}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const CHAR_BAYES_K = 54;
const CHAR_BAYES_PRIOR = 1 / 9;

interface CharacterBreakdownPanelProps {
    title: string;
    rawWinsSlices: PieSlice[];
    rawPopSlices: PieSlice[];
    /** When provided, used instead of rawWinsSlices for adj. win rate computation. */
    rawRatingWinsSlices?: PieSlice[];
}

function CharacterBreakdownPanel({ title, rawWinsSlices, rawPopSlices, rawRatingWinsSlices }: CharacterBreakdownPanelProps) {
    const [sortMode, setSortMode] = useState<"pop" | "winRate">("pop");
    const [fullDataOpen, setFullDataOpen] = useState(false);
    const [fullDataSort, setFullDataSort] = useState<"pop" | "winRate">("pop");

    const rawWinsByKey = new Map(rawWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const rawPopByKey = new Map(rawPopSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const ratingWinsSlices = rawRatingWinsSlices ?? rawWinsSlices;
    const ratingWinsByKey = new Map(ratingWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));

    type CharRow = { key: string; label: string; fullLabel?: string; strategyId?: number; winsPct: number; popPct: number; adjRate: number; winsCount: number; appsCount: number; };

    const buildCharRow = (key: string): CharRow => {
        const w = rawWinsByKey.get(key);
        const p = rawPopByKey.get(key);
        const ratingWins = ratingWinsByKey.get(key)?.value ?? 0;
        const apps = p?.value ?? 0;
        const adjRate = (ratingWins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
        return {
            key,
            label: p?.label ?? w?.label ?? key,
            fullLabel: p?.fullLabel ?? w?.fullLabel,
            strategyId: w?.strategyId ?? p?.strategyId,
            winsPct: w?.percentage ?? 0,
            popPct: p?.percentage ?? 0,
            adjRate,
            winsCount: ratingWins,
            appsCount: apps,
        };
    };

    const allPopKeys = rawPopSlices.filter(s => s.charaId && (ratingWinsByKey.get(s.charaId as string)?.value ?? 0) > 0).map(s => s.charaId as string);

    const allWinRateKeys = [...allPopKeys]
        .map(key => {
            const apps = rawPopByKey.get(key)?.value ?? 0;
            const wins = ratingWinsByKey.get(key)?.value ?? 0;
            const adjRate = (wins + CHAR_BAYES_K * CHAR_BAYES_PRIOR) / (apps + CHAR_BAYES_K);
            return { key, adjRate, wins };
        })
        .filter(x => x.wins > 0)
        .sort((a, b) => b.adjRate - a.adjRate)
        .map(x => x.key);

    const topPopKeys = allPopKeys.slice(0, 5);
    const topWinRateKeys = allWinRateKeys.slice(0, 5);
    const activeKeys = sortMode === "pop" ? topPopKeys : topWinRateKeys;
    const chars = activeKeys.map(buildCharRow);

    const fullDataKeys = fullDataSort === "pop" ? allPopKeys : allWinRateKeys;
    const fullDataChars = fullDataKeys.map(buildCharRow);

    const maxPct = Math.max(...chars.flatMap(c => [c.adjRate * 100, c.popPct]), 1);
    const fullDataMaxPct = Math.max(...fullDataChars.flatMap(c => [c.adjRate * 100, c.popPct]), 1);

    const renderBarRow = (c: CharRow, maxP: number) => {
        const icon = getCharaIcon(c.key);
        const color = STRATEGY_COLORS[c.strategyId ?? 0] ?? "#718096";
        return (
            <div key={c.key} className="sa-sb-row">
                <div className="ca-char-label">
                    <div className="ca-portrait-wrap">
                        <div className="ca-portrait-ring" style={{ background: color }} />
                        {icon && (
                            <img src={icon} className="ca-portrait-img" alt=""
                                onError={evt => { (evt.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        )}
                    </div>
                    <span className="ca-char-name" title={c.label}>{c.fullLabel ?? c.label}</span>
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label">Win%</div>
                    <div className="sa-sb-track sa-sb-track--win">
                        <div className="sa-sb-bar-fill" style={{ width: `${(c.adjRate * 100 / maxP) * 100}%`, background: color }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                        {(c.adjRate * 100).toFixed(1)}% <span className="ca-abs-count">({c.winsCount})</span>
                    </div>
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label">Pop%</div>
                    <div className="sa-sb-track sa-sb-track--pick">
                        <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(c.popPct / maxP) * 100}%` }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                        {c.popPct.toFixed(1)}% <span className="ca-abs-count">({c.appsCount})</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="sa-panel ca-panel">
            <div className="sa-panel-header">
                {title}
                <div className="ca-sort-toggle">
                    <button
                        className={`ca-sort-btn${sortMode === "pop" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("pop")}>
                        Top Population
                    </button>
                    <button
                        className={`ca-sort-btn${sortMode === "winRate" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("winRate")}>
                        Top Adj. Win%
                    </button>
                </div>
            </div>

            {chars.length === 0 ? (
                <span className="sa-no-data">No data</span>
            ) : (
                <>
                    {chars.map(c => renderBarRow(c, maxPct))}
                    <button className="ca-view-all-btn" onClick={() => setFullDataOpen(true)}>
                        View full data
                    </button>
                </>
            )}

            {fullDataOpen && (
                <div className="cdt-overlay" onClick={() => setFullDataOpen(false)}>
                    <div className="cdt-modal ca-full-data-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">{title}</h3>
                            <div className="ca-sort-toggle ca-sort-toggle--modal">
                                <button
                                    className={`ca-sort-btn${fullDataSort === "pop" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setFullDataSort("pop")}>
                                    By Population
                                </button>
                                <button
                                    className={`ca-sort-btn${fullDataSort === "winRate" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setFullDataSort("winRate")}>
                                    By Adj. Win%
                                </button>
                            </div>
                            <button className="cdt-close-btn" onClick={() => setFullDataOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            {fullDataChars.map(c => renderBarRow(c, fullDataMaxPct))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface SkillRow {
    skillId: number;
    name: string;
    appearances: number;
    winAppearances: number;
    popPct: number;
    adjWinRate: number; // Bayesian-smoothed win rate (0–1), prior = variant base win rate, k=54
}

interface CharacterBuildsPanelProps {
    rawPopSlices: PieSlice[];
    allHorses: HorseEntry[];
    characterStats?: CharacterStats[];
}

type DeckRow = {
    deckKey: string;
    cardIds: number[];  // in slot order
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
};

function CharacterBuildsPanel({ rawPopSlices, allHorses, characterStats }: CharacterBuildsPanelProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<"pop" | "winRate">("pop");
    const [fullDataOpen, setFullDataOpen] = useState(false);
    const [fullDataSort, setFullDataSort] = useState<"pop" | "winRate">("pop");
    const [decksOpen, setDecksOpen] = useState(false);
    const [deckSort, setDeckSort] = useState<"pop" | "winRate">("pop");
    const [cardsOpen, setCardsOpen] = useState(false);

    const charaNameMap = useMemo(
        () => new Map((characterStats ?? []).map(c => [c.charaId, c.charaName])),
        [characterStats],
    );

    const entities = useMemo((): SynergyEntityInfo[] =>
        rawPopSlices
            .filter(s => s.charaId)
            .map(s => {
                const parts = (s.charaId as string).split('_');
                const charaId = Number(parts[0]);
                const cardId = Number(parts[1]);
                const strategy = Number(parts[2]);
                const cardName = UMDatabaseWrapper.cards[cardId]?.name ?? s.label;
                const charaName = charaNameMap.get(charaId) ?? s.fullLabel ?? s.label;
                return { key: s.charaId as string, cardId, strategy, charaId, cardName, charaName, totalCoApps: s.value };
            }),
        [rawPopSlices, charaNameMap],
    );

    const effectiveKey = selectedKey ?? entities[0]?.key ?? null;

    const { selCardId, selStrategy } = useMemo(() => {
        if (!effectiveKey) return { selCardId: null, selStrategy: null };
        const parts = effectiveKey.split('_');
        return { selCardId: Number(parts[1]), selStrategy: Number(parts[2]) };
    }, [effectiveKey]);

    const allSkillRows = useMemo((): SkillRow[] => {
        if (selCardId === null || selStrategy === null) return [];
        const horses = allHorses.filter(h => h.cardId === selCardId && h.strategy === selStrategy);
        const total = horses.length;
        const totalWins = horses.filter(h => h.finishOrder === 1).length;
        if (total === 0) return [];

        const BAYES_K = 54;
        const priorMean = totalWins / total; // variant's base win rate

        const counts = new Map<number, { apps: number; winApps: number }>();
        for (const h of horses) {
            const isWinner = (h.finishOrder === 1);
            for (const sid of h.learnedSkillIds) {
                const c = counts.get(sid) ?? { apps: 0, winApps: 0 };
                c.apps++;
                if (isWinner) c.winApps++;
                counts.set(sid, c);
            }
        }

        const rows: SkillRow[] = [];
        for (const [skillId, { apps, winApps }] of counts) {
            const name = UMDatabaseWrapper.skillName(skillId);
            const adjWinRate = (winApps + BAYES_K * priorMean) / (apps + BAYES_K);
            rows.push({
                skillId, name,
                appearances: apps,
                winAppearances: winApps,
                popPct: (apps / total) * 100,
                adjWinRate,
            });
        }
        return rows;
    }, [allHorses, selCardId, selStrategy]);

    const allDeckRows = useMemo((): DeckRow[] => {
        if (selCardId === null || selStrategy === null) return [];
        const horses = allHorses.filter(h => h.cardId === selCardId && h.strategy === selStrategy && h.supportCardIds.length === 6);
        const total = horses.length;
        if (total === 0) return [];
        const totalWins = horses.filter(h => h.finishOrder === 1).length;
        const BAYES_K = 54;
        const priorMean = totalWins / total;

        const deckMap = new Map<string, { cardIds: number[]; apps: number; wins: number }>();
        for (const h of horses) {
            const key = [...h.supportCardIds].sort((a, b) => a - b).join('_');
            if (!deckMap.has(key)) deckMap.set(key, { cardIds: h.supportCardIds, apps: 0, wins: 0 });
            const d = deckMap.get(key)!;
            d.apps++;
            if (h.finishOrder === 1) d.wins++;
        }

        return Array.from(deckMap.values()).map(({ cardIds, apps, wins }) => ({
            deckKey: [...cardIds].sort((a, b) => a - b).join('_'),
            cardIds,
            appearances: apps,
            wins,
            popPct: (apps / total) * 100,
            adjWinRate: (wins + BAYES_K * priorMean) / (apps + BAYES_K),
        }));
    }, [allHorses, selCardId, selStrategy]);

    const decksByPop = useMemo(() => [...allDeckRows].sort((a, b) => b.appearances - a.appearances), [allDeckRows]);
    const decksByWin = useMemo(() => [...allDeckRows].filter(r => r.wins > 0).sort((a, b) => b.adjWinRate - a.adjWinRate), [allDeckRows]);
    const deckList = deckSort === "pop" ? decksByPop : decksByWin;
    const deckMaxPct = Math.max(...deckList.slice(0, 20).flatMap(r => [r.popPct, r.adjWinRate * 100]), 1);

    const sortedByPop = useMemo(() => [...allSkillRows].sort((a, b) => b.popPct - a.popPct), [allSkillRows]);
    const sortedByWin = useMemo(() => [...allSkillRows].filter(r => r.winAppearances > 0).sort((a, b) => b.adjWinRate - a.adjWinRate), [allSkillRows]);

    const top5 = (sortMode === "pop" ? sortedByPop : sortedByWin).slice(0, 5);
    const fullList = fullDataSort === "pop" ? sortedByPop : sortedByWin;

    const maxPct = Math.max(...top5.flatMap(r => [r.popPct, r.adjWinRate * 100]), 1);
    const fullDataMaxPct = Math.max(...fullList.flatMap(r => [r.popPct, r.adjWinRate * 100]), 1);

    const renderSkillRow = (row: SkillRow, maxP: number) => (
        <div key={row.skillId} className="sa-sb-row">
            <div className="ca-char-label">
                <span className="ca-char-name">{row.name}</span>
            </div>
            <div className="sa-sb-bar-row">
                <div className="sa-sb-bar-label">Pop%</div>
                <div className="sa-sb-track sa-sb-track--pick">
                    <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / maxP) * 100}%` }} />
                </div>
                <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                    {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                </div>
            </div>
            <div className="sa-sb-bar-row">
                <div className="sa-sb-bar-label">Win%</div>
                <div className="sa-sb-track sa-sb-track--win">
                    <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / maxP) * 100}%`, background: "#68d391" }} />
                </div>
                <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                    {(row.adjWinRate * 100).toFixed(1)}% <span className="ca-abs-count">({row.winAppearances})</span>
                </div>
            </div>
        </div>
    );

    if (entities.length === 0) return null;

    return (
        <div className="sa-panel ca-panel">
            <div className="sa-panel-header">
                Character Builds
                <div className="ca-sort-toggle">
                    <button
                        className={`ca-sort-btn${sortMode === "pop" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("pop")}>
                        Top Population
                    </button>
                    <button
                        className={`ca-sort-btn${sortMode === "winRate" ? " ca-sort-btn--active" : ""}`}
                        onClick={() => setSortMode("winRate")}>
                        Top Adj. Win%
                    </button>
                </div>
            </div>
            <div className="ca-builds-select">
                <SynergyEntitySelect entities={entities} value={effectiveKey} onChange={setSelectedKey} />
                <button className="ca-decks-btn" onClick={() => setDecksOpen(true)} title="View support card decks">
                    <img src={AssetLoader.getStatIcon("deck")} alt="" className="ca-decks-btn-icon" />
                    View Decks
                </button>
                <button className="ca-decks-btn" onClick={() => setCardsOpen(true)} title="View support card usage">
                    <img src={AssetLoader.getStatIcon("card")} alt="" className="ca-decks-btn-icon" />
                    View Cards
                </button>
            </div>
            {top5.length === 0 ? (
                <span className="sa-no-data">No skill data</span>
            ) : (
                <>
                    {top5.map(r => renderSkillRow(r, maxPct))}
                    <button className="ca-view-all-btn" onClick={() => setFullDataOpen(true)}>
                        View full data
                    </button>
                </>
            )}
            {fullDataOpen && (
                <div className="cdt-overlay" onClick={() => setFullDataOpen(false)}>
                    <div className="cdt-modal ca-full-data-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Character Builds</h3>
                            <div className="ca-sort-toggle ca-sort-toggle--modal">
                                <button
                                    className={`ca-sort-btn${fullDataSort === "pop" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setFullDataSort("pop")}>
                                    By Population
                                </button>
                                <button
                                    className={`ca-sort-btn${fullDataSort === "winRate" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setFullDataSort("winRate")}>
                                    By Adj. Win%
                                </button>
                            </div>
                            <button className="cdt-close-btn" onClick={() => setFullDataOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            {fullList.map(r => renderSkillRow(r, fullDataMaxPct))}
                        </div>
                    </div>
                </div>
            )}
            {decksOpen && (
                <div className="cdt-overlay" onClick={() => setDecksOpen(false)}>
                    <div className="cdt-modal ca-decks-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Support Decks</h3>
                            <div className="ca-sort-toggle ca-sort-toggle--modal">
                                <button
                                    className={`ca-sort-btn${deckSort === "pop" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setDeckSort("pop")}>
                                    By Population
                                </button>
                                <button
                                    className={`ca-sort-btn${deckSort === "winRate" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setDeckSort("winRate")}>
                                    By Adj. Win%
                                </button>
                            </div>
                            <button className="cdt-close-btn" onClick={() => setDecksOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            {deckList.length === 0 ? (
                                <span className="sa-no-data">No deck data for this character.</span>
                            ) : deckList.slice(0, 20).map(row => (
                                <div key={row.deckKey} className="sa-sb-row deck-row">
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
                                                <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / deckMaxPct) * 100}%` }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                                                {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                                            </div>
                                        </div>
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Win%</div>
                                            <div className="sa-sb-track sa-sb-track--win">
                                                <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / deckMaxPct) * 100}%`, background: "#68d391" }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                                                {(row.adjWinRate * 100).toFixed(1)}% <span className="ca-abs-count">({row.wins})</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {cardsOpen && selCardId !== null && selStrategy !== null && (
                <div className="cdt-overlay" onClick={() => setCardsOpen(false)}>
                    <div className="cdt-modal ca-cards-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Support Card Usage</h3>
                            <button className="cdt-close-btn" onClick={() => setCardsOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            <SupportCardPanel
                                horses={allHorses.filter(h => h.cardId === selCardId && h.strategy === selStrategy)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface CharacterAnalysisProps {
    rawWinsAll: PieSlice[];
    rawWinsOpp: PieSlice[];
    rawPop: PieSlice[];
    spectatorMode?: boolean;
    pairSynergy?: PairSynergyStats[];
    characterStats?: CharacterStats[];
    allHorses?: HorseEntry[];
}

const CharacterAnalysis: React.FC<CharacterAnalysisProps> = ({
    rawWinsAll,
    rawWinsOpp,
    rawPop,
    spectatorMode,
    pairSynergy,
    characterStats,
    allHorses,
}) => {
    const [synEntityKey, setSynEntityKey] = useState<string | null>(null);

    const synEntities = useMemo((): SynergyEntityInfo[] => {
        if (!pairSynergy || !characterStats) return [];
        const charaNameMap = new Map(characterStats.map(c => [c.charaId, c.charaName]));
        const entityMap = new Map<string, SynergyEntityInfo>();

        const upsert = (cardId: number, strategy: number, charaId: number, coApps: number) => {
            const key = `${cardId}_${strategy}`;
            if (!entityMap.has(key)) {
                const cardName = UMDatabaseWrapper.cards[cardId]?.name ?? charaNameMap.get(charaId) ?? `#${charaId}`;
                entityMap.set(key, { key, cardId, strategy, charaId, cardName, charaName: charaNameMap.get(charaId) ?? `#${charaId}`, totalCoApps: 0 });
            }
            entityMap.get(key)!.totalCoApps += coApps;
        };

        for (const p of pairSynergy) {
            upsert(p.cardId_x, p.strategy_x, p.charaId_x, p.coApps);
            upsert(p.cardId_y, p.strategy_y, p.charaId_y, p.coApps);
        }

        return Array.from(entityMap.values()).sort((a, b) => b.totalCoApps - a.totalCoApps);
    }, [pairSynergy, characterStats]);

    const effectiveEntityKey = synEntityKey ?? synEntities[0]?.key ?? null;
    const selectedSynEntity = synEntities.find(e => e.key === effectiveEntityKey) ?? null;

    const { topRows, bottomRows, maxRate } = useMemo((): { topRows: SynergyDisplayRow[]; bottomRows: SynergyDisplayRow[]; maxRate: number } => {
        const empty = { topRows: [], bottomRows: [], maxRate: 0.01 };
        if (!pairSynergy || !effectiveEntityKey || !characterStats) return empty;
        const charaNameMap = new Map(characterStats.map(c => [c.charaId, c.charaName]));

        const pairs: SynergyDisplayRow[] = pairSynergy
            .filter(p => `${p.cardId_x}_${p.strategy_x}` === effectiveEntityKey || `${p.cardId_y}_${p.strategy_y}` === effectiveEntityKey)
            .map(p => {
                const isX = `${p.cardId_x}_${p.strategy_x}` === effectiveEntityKey;
                const cardId = isX ? p.cardId_y : p.cardId_x;
                const strategy = isX ? p.strategy_y : p.strategy_x;
                const charaId = isX ? p.charaId_y : p.charaId_x;
                const cardName = UMDatabaseWrapper.cards[cardId]?.name ?? charaNameMap.get(charaId) ?? `#${charaId}`;
                const charaName = charaNameMap.get(charaId) ?? `#${charaId}`;
                const smoothedRate = (p.teamWins + PRIOR_STRENGTH * PRIOR_MEAN) / (p.coApps + PRIOR_STRENGTH);
                const selectedWins = isX ? p.winsX : p.winsY;
                const teammateWins = isX ? p.winsY : p.winsX;
                return { key: `${cardId}_${strategy}`, cardId, strategy, charaId, cardName, charaName, coApps: p.coApps, teamWins: p.teamWins, smoothedRate, selectedWins, teammateWins };
            });

        if (pairs.length === 0) return empty;

        const sorted = [...pairs].sort((a, b) => b.smoothedRate - a.smoothedRate);
        const topRows = sorted.slice(0, 10);
        const topKeys = new Set(topRows.map(r => r.key));
        const bottomRows = [...sorted].reverse().filter(r => !topKeys.has(r.key)).slice(0, 10);
        const maxRate = Math.max(...topRows.map(r => r.smoothedRate), ...bottomRows.map(r => r.smoothedRate), 0.01);
        return { topRows, bottomRows, maxRate };
    }, [pairSynergy, effectiveEntityKey, characterStats]);

    const renderSynergyTable = (rows: SynergyDisplayRow[], accentColor: string, selectedEntityName: string) => (
        <table className="syn-table">
            <thead>
                <tr>
                    <th>Teammate</th>
                    <th title="Combined Adj. win% = Bayesian-smoothed team win rate (prior: 33%, strength: 18 races) | Raw win% = raw team wins / co-appearances">
                        <span className="syn-table-adj-label">Combined Adj. win%</span>
                        <span className="syn-table-raw-label"> | Raw win% (samples)</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {rows.map(row => {
                    const icon = getCharaIcon(`${row.charaId}_${row.cardId}`);
                    const stratColor = STRATEGY_COLORS[row.strategy] ?? "#718096";
                    const rawPct = Math.round(100 * row.teamWins / row.coApps);
                    const smoothedPct = Math.round(row.smoothedRate * 100);
                    const selectedPct = Math.round(100 * row.selectedWins / row.coApps);
                    const teammatePct = Math.round(100 * row.teammateWins / row.coApps);
                    return (
                        <tr key={row.key}>
                            <td className="syn-table-name-cell">
                                <div className="syn-table-name-inner">
                                    <div className="syn-select-portrait">
                                        <div className="syn-select-ring" style={{ background: stratColor }} />
                                        {icon && (
                                            <img src={icon} alt="" className="syn-select-img"
                                                onError={evt => { (evt.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                        )}
                                    </div>
                                    <span>
                                        <span className="syn-table-char-name">{row.charaName}</span>
                                        <span className="syn-table-char-strategy" style={{ color: stratColor }}>{STRATEGY_NAMES[row.strategy] ?? `Strategy ${row.strategy}`}</span>
                                        <span className="syn-table-win-split">{selectedEntityName} ({selectedPct}%) · {row.charaName} ({teammatePct}%)</span>
                                    </span>
                                </div>
                            </td>
                            <td className="syn-table-rate-cell">
                                <div className="syn-table-rate-inner">
                                    <div className="syn-table-bar-track">
                                        <div className="syn-table-bar-fill" style={{ width: `${(row.smoothedRate / maxRate) * 100}%`, background: accentColor }} />
                                    </div>
                                    <span className="syn-table-pct">{smoothedPct}%</span>
                                    <span className="syn-table-raw-pct">| {rawPct}% ({row.coApps})</span>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    return (
        <div className="pie-chart-container">
            <div className="sa-top-panels-row">
                <CharacterBreakdownPanel
                    title="Character Breakdown"
                    rawWinsSlices={rawWinsAll}
                    rawPopSlices={rawPop}
                    rawRatingWinsSlices={spectatorMode ? undefined : rawWinsOpp}
                />
                {!spectatorMode && (
                    <CharacterBreakdownPanel
                        title="Best Placing Opponent"
                        rawWinsSlices={rawWinsOpp}
                        rawPopSlices={rawPop}
                    />
                )}
                {allHorses && (
                    <CharacterBuildsPanel
                        rawPopSlices={rawPop}
                        allHorses={allHorses}
                        characterStats={characterStats}
                    />
                )}
            </div>

            {pairSynergy && pairSynergy.length > 0 && synEntities.length > 0 && (
                <div className="syn-section">
                    <div className="pie-chart-title syn-section-header">
                        Pair Synergy
                    </div>
                    <div className="syn-entity-row">
                        <span className="syn-entity-label">Character:</span>
                        <SynergyEntitySelect
                            entities={synEntities}
                            value={effectiveEntityKey}
                            onChange={setSynEntityKey}
                        />
                    </div>
                    {topRows.length === 0 && bottomRows.length === 0 ? (
                        <div className="syn-no-data">No synergy data for this entry.</div>
                    ) : (
                        <div className="syn-tables-row">
                            {topRows.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--best">
                                        <span>▲</span> Best Synergies
                                    </div>
                                    {renderSynergyTable(topRows, "#68d391", selectedSynEntity?.charaName ?? "")}
                                </div>
                            )}
                            {bottomRows.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--worst">
                                        <span>▼</span> Worst Synergies
                                    </div>
                                    {renderSynergyTable(bottomRows, "#fc8181", selectedSynEntity?.charaName ?? "")}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CharacterAnalysis;
