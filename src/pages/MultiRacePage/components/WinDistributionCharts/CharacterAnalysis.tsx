import React, { useState, useMemo, useRef, useEffect } from "react";
import "./CharacterAnalysis.css";
import { STRATEGY_COLORS, STRATEGY_NAMES, STRATEGY_DISPLAY_ORDER, BAYES_UMA, BAYES_TEAM } from "./constants";
import { PieSlice } from "./types";
import { getCharaIcon } from "./utils";
import type { CharacterStats, HorseEntry, SkillStats, TeamCompositionStats } from "../../types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import AssetLoader from "../../../../data/AssetLoader";
import SupportCardPanel from "./SupportCardPanel";
import { TeamMemberCard } from "./StrategyAnalysis";
import TeamSampleSelect from "./TeamSampleSelect";

type SynergyEntityInfo = {
    key: string;         // `${cardId}_${strategy}`
    cardId: number;
    strategy: number;
    charaId: number;
    cardName: string;
    charaName: string;
    totalCoApps: number;
};

type StyleCompEntry = {
    key: string; // sorted strategies joined by _
    strategies: number[];
    label: string;
    appearances: number;
    wins: number;
    winRate: number;
    bayesianWinRate: number;
};

const strategyOrderIndex = (strategy: number) => {
    const idx = STRATEGY_DISPLAY_ORDER.indexOf(strategy as (typeof STRATEGY_DISPLAY_ORDER)[number]);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
};

interface SynergyEntitySelectProps {
    entities: SynergyEntityInfo[];
    value: string | null;
    onChange: (key: string) => void;
    strategyColors: Record<number, string>;
}

const SynergyEntitySelect: React.FC<SynergyEntitySelectProps> = ({ entities, value, onChange, strategyColors }) => {
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
    const selectedStratColor = strategyColors[selected.strategy] ?? "#718096";

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
                            const stratColor = strategyColors[e.strategy] ?? "#718096";
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

const CHAR_BAYES_K = BAYES_UMA.K;
const CHAR_BAYES_PRIOR = BAYES_UMA.PRIOR;

interface CharacterBreakdownPanelProps {
    title: string;
    rawWinsSlices: PieSlice[];
    rawPopSlices: PieSlice[];
    /** When provided, used instead of rawWinsSlices for adj. win rate computation. */
    rawRatingWinsSlices?: PieSlice[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
}

function CharacterBreakdownPanel({ title, rawWinsSlices, rawPopSlices, rawRatingWinsSlices, allHorses, skillStats, strategyColors }: CharacterBreakdownPanelProps) {
    const [sortMode, setSortMode] = useState<"pop" | "winRate">("pop");
    const [fullDataOpen, setFullDataOpen] = useState(false);
    const [fullDataSort, setFullDataSort] = useState<"pop" | "winRate">("pop");
    const [selectedCharKey, setSelectedCharKey] = useState<string | null>(null);
    const [selectedInModal, setSelectedInModal] = useState<string | null>(null);

    const rawWinsByKey = new Map(rawWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const rawPopByKey = new Map(rawPopSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));
    const ratingWinsSlices = rawRatingWinsSlices ?? rawWinsSlices;
    const ratingWinsByKey = new Map(ratingWinsSlices.filter(s => s.charaId).map(s => [s.charaId as string, s]));

    type CharRow = { key: string; label: string; fullLabel?: string; strategyId?: number; cardId?: number; winsPct: number; popPct: number; adjRate: number; winsCount: number; appsCount: number; };

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
            cardId: w?.cardId ?? p?.cardId,
            winsPct: w?.percentage ?? 0,
            popPct: p?.percentage ?? 0,
            adjRate,
            winsCount: ratingWins,
            appsCount: apps,
        };
    };

    const canDrilldown = !!(allHorses && skillStats);

    const buildDrilldown = (charKey: string | null) => {
        if (!charKey || !allHorses) return [];
        const parts = charKey.split('_');
        const cardId = Number(parts[1]);
        const strategy = Number(parts[2]);
        const filtered = allHorses.filter(h => h.cardId === cardId && h.strategy === strategy && h.rankScore > 0);
        const buildMap = new Map<string, { rep: HorseEntry; wins: number; appearances: number }>();
        for (const h of filtered) {
            const bkey = `${h.rankScore}_${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}`;
            if (!buildMap.has(bkey)) buildMap.set(bkey, { rep: h, wins: 0, appearances: 0 });
            const entry = buildMap.get(bkey)!;
            entry.appearances++;
            if (h.finishOrder === 1) entry.wins++;
        }
        const PRIOR = 1 / 9, K = 54;
        return Array.from(buildMap.values())
            .map(({ rep, wins, appearances }) => ({
                horse: rep,
                bayesianWinRate: (wins + K * PRIOR) / (appearances + K),
                winRate: wins / appearances,
                appearances,
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    };

    const drilldownHorses = useMemo(() => buildDrilldown(selectedCharKey), [selectedCharKey, allHorses]);
    const drilldownInModal = useMemo(() => buildDrilldown(selectedInModal), [selectedInModal, allHorses]);

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

    const renderBarRow = (c: CharRow, maxP: number, inModal: boolean = false) => {
        const icon = getCharaIcon(c.key);
        const color = strategyColors[c.strategyId ?? 0] ?? "#718096";
        const isSelected = inModal ? selectedInModal === c.key : selectedCharKey === c.key;
        return (
            <div
                key={c.key}
                className={`sa-sb-row${canDrilldown ? " sa-stcp-item--clickable" : ""}${isSelected ? " ca-row--selected" : ""}`}
                onClick={canDrilldown ? () => {
                    if (inModal) setSelectedInModal(k => k === c.key ? null : c.key);
                    else setSelectedCharKey(k => k === c.key ? null : c.key);
                } : undefined}
            >
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

    const renderDrilldown = (horses: typeof drilldownHorses, charKey: string | null) => {
        if (!charKey || horses.length === 0 || !skillStats) return null;
        const parts = charKey.split('_');
        const strategy = Number(parts[2]);
        const charaName = buildCharRow(charKey).fullLabel ?? buildCharRow(charKey).label;
        return (
            <div className="stcp-drilldown">
                <div className="stcp-drilldown-header">
                    <div className="stcp-drilldown-title">
                        Top performers for {charaName} ({STRATEGY_NAMES[strategy]})
                    </div>
                    <div className="stcp-drilldown-subtitle">
                        Unique umas ranked by Bayesian-adjusted win rate across all appearances.
                    </div>
                </div>
                <div className="stcp-team-members-row">
                    {horses.map(({ horse, bayesianWinRate, winRate, appearances }, i) => (
                        <div key={i} className="sa-reps-drilldown-card">
                            <div className="sa-reps-drilldown-winrate">
                                <span className="sa-adj-pct">{(bayesianWinRate * 100).toFixed(0)}%</span>
                                <span className="sa-pipe"> | </span>
                                <span className="sa-raw-pct">{(winRate * 100).toFixed(0)}% ({appearances})</span>
                            </div>
                            <TeamMemberCard horse={horse} skillStats={skillStats} strategyColors={strategyColors} />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="sa-panel ca-panel">
            <div className="sa-panel-header">
                <span>{title} <span title="Win% is Bayesian-adjusted (prior: 1/9, strength: 54 races). Pop% is share of all race appearances." className="sa-info-icon">i</span></span>
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
                    {chars.map(c => renderBarRow(c, maxPct, false))}
                    {renderDrilldown(drilldownHorses, selectedCharKey)}
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
                            {fullDataChars.map(c => (
                                <React.Fragment key={c.key}>
                                    {renderBarRow(c, fullDataMaxPct, true)}
                                    {selectedInModal === c.key && renderDrilldown(drilldownInModal, selectedInModal)}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface CharacterBuildsPanelProps {
    rawPopSlices: PieSlice[];
    allHorses: HorseEntry[];
    characterStats?: CharacterStats[];
    strategyColors: Record<number, string>;
}

type SkillRow = {
    skillId: number;
    name: string;
    appearances: number;
    winAppearances: number;
    popPct: number;
    adjWinRate: number;
};

type DeckRow = {
    deckKey: string;
    cardIds: number[];  // in slot order
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
};

function CharacterBuildsPanel({ rawPopSlices, allHorses, characterStats, strategyColors }: CharacterBuildsPanelProps) {
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

        const BAYES_K = BAYES_UMA.K;
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
        const BAYES_K = BAYES_UMA.K;
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
                <span>Character Builds <span title="Skill Win% = Bayesian-adjusted win rate among races where the selected character had this skill learned (prior = character's base win rate, strength: 54). Pop% = fraction of this character's appearances where the skill was in their learned set." className="sa-info-icon">i</span></span>
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
                <SynergyEntitySelect entities={entities} value={effectiveKey} onChange={setSelectedKey} strategyColors={strategyColors} />
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
    characterStats?: CharacterStats[];
    allHorses?: HorseEntry[];
    skillStats?: Map<number, SkillStats>;
    teamStats?: TeamCompositionStats[];
    strategyColors?: Record<number, string>;
}

const MIN_DRILLDOWN_APPEARANCES = 5;

const CharacterAnalysis: React.FC<CharacterAnalysisProps> = ({
    rawWinsAll,
    rawWinsOpp,
    rawPop,
    spectatorMode,
    characterStats,
    allHorses,
    skillStats,
    teamStats,
    strategyColors,
}) => {
    const [synEntityKey, setSynEntityKey] = useState<string | null>(null);
    const [selectedCompKey, setSelectedCompKey] = useState<string | null>(null);
    const [selectedDrilldownIdx, setSelectedDrilldownIdx] = useState(0);

    useEffect(() => { setSelectedCompKey(null); }, [synEntityKey]);
    useEffect(() => { setSelectedDrilldownIdx(0); }, [selectedCompKey]);

    const synEntities = useMemo((): SynergyEntityInfo[] => {
        if (!allHorses || !characterStats) return [];
        const charaNameMap = new Map(characterStats.map(c => [c.charaId, c.charaName]));
        const entityMap = new Map<string, SynergyEntityInfo>();

        const upsert = (cardId: number, strategy: number, charaId: number, apps: number) => {
            const key = `${cardId}_${strategy}`;
            if (!entityMap.has(key)) {
                const cardName = UMDatabaseWrapper.cards[cardId]?.name ?? charaNameMap.get(charaId) ?? `#${charaId}`;
                entityMap.set(key, { key, cardId, strategy, charaId, cardName, charaName: charaNameMap.get(charaId) ?? `#${charaId}`, totalCoApps: 0 });
            }
            entityMap.get(key)!.totalCoApps += apps;
        };

        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            upsert(h.cardId, h.strategy, h.charaId, 1);
        }

        return Array.from(entityMap.values()).sort((a, b) => b.totalCoApps - a.totalCoApps);
    }, [allHorses, characterStats]);

    const effectiveEntityKey = synEntityKey ?? synEntities[0]?.key ?? null;

    const bestHorseByFullComp = useMemo(() => {
        if (!allHorses) return new Map<string, Map<string, HorseEntry>>();
        const raceMap = new Map<string, HorseEntry[]>();
        for (const h of allHorses) {
            if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, []);
            raceMap.get(h.raceId)!.push(h);
        }
        const result = new Map<string, Map<string, HorseEntry>>();
        for (const raceHorses of raceMap.values()) {
            const teamMap = new Map<number, HorseEntry[]>();
            for (const h of raceHorses) {
                if (h.teamId <= 0) continue;
                if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, []);
                teamMap.get(h.teamId)!.push(h);
            }
            for (const team of teamMap.values()) {
                if (team.length !== 3) continue;
                const sorted = [...team].sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));
                const compKey = sorted.map(h => `${h.cardId}_${h.strategy}`).join("__");
                if (!result.has(compKey)) result.set(compKey, new Map());
                const memberMap = result.get(compKey)!;
                for (const h of sorted) {
                    const mk = `${h.cardId}_${h.strategy}`;
                    const ex = memberMap.get(mk);
                    if (!ex || h.rankScore > ex.rankScore) memberMap.set(mk, h);
                }
            }
        }
        return result;
    }, [allHorses]);

    const drilldownTeams = useMemo(() => {
        if (!selectedCompKey || !teamStats || !effectiveEntityKey) return [];
        const [selCardIdStr, selStrategyStr] = effectiveEntityKey.split('_');
        const selCardId = Number(selCardIdStr);
        const selStrategy = Number(selStrategyStr);
        return teamStats
            .filter(t => {
                const key = t.members.map(m => m.strategy).sort((a, b) => strategyOrderIndex(a) - strategyOrderIndex(b)).join('_');
                return key === selectedCompKey
                    && t.members.some(m => m.cardId === selCardId && m.strategy === selStrategy);
            })
            .filter(t => t.appearances >= MIN_DRILLDOWN_APPEARANCES)
            .map(t => ({
                team: t,
                bayesianWinRate: (t.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (t.appearances + BAYES_TEAM.K),
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    }, [selectedCompKey, teamStats, effectiveEntityKey]);

    const { overperformers, underperformers } = useMemo((): { overperformers: StyleCompEntry[]; underperformers: StyleCompEntry[] } => {
        const empty = { overperformers: [], underperformers: [] };
        if (!allHorses || !effectiveEntityKey) return empty;

        const [selCardIdStr, selStrategyStr] = effectiveEntityKey.split('_');
        const selCardId = Number(selCardIdStr);
        const selStrategy = Number(selStrategyStr);
        if (!Number.isFinite(selCardId) || !Number.isFinite(selStrategy)) return empty;

        // Group by race -> team, tracking if the team won
        const raceMap = new Map<string, Map<number, { horses: HorseEntry[]; teamWon: boolean }>>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, new Map());
            const teamMap = raceMap.get(h.raceId)!;
            if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, { horses: [], teamWon: false });
            const t = teamMap.get(h.teamId)!;
            t.horses.push(h);
            if (h.finishOrder === 1) t.teamWon = true;
        }

        type CompTally = { strategies: number[]; appearances: number; wins: number };
        const compMap = new Map<string, CompTally>();

        for (const teamMap of raceMap.values()) {
            for (const { horses, teamWon } of teamMap.values()) {
                // Only include teams that contain the selected (cardId, strategy) entity
                if (!horses.some(h => h.cardId === selCardId && h.strategy === selStrategy)) continue;
                if (horses.length !== 3) continue;

                const strategies = horses.map(h => h.strategy).sort((a, b) => strategyOrderIndex(a) - strategyOrderIndex(b));
                const key = strategies.join('_');
                if (!compMap.has(key)) compMap.set(key, { strategies, appearances: 0, wins: 0 });
                const tally = compMap.get(key)!;
                tally.appearances++;
                if (teamWon) tally.wins++;
            }
        }

        const MIN_APPEARANCES = 5;
        const MAX_ITEMS = 10;

        const all = Array.from(compMap.entries())
            .map(([key, t]) => {
                const winRate = t.appearances > 0 ? t.wins / t.appearances : 0;
                const bayesianWinRate = (t.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (t.appearances + BAYES_TEAM.K);
                const label = t.strategies.map(s => STRATEGY_NAMES[s] ?? `Strategy ${s}`).join('-');
                return {
                    key,
                    strategies: t.strategies,
                    label,
                    appearances: t.appearances,
                    wins: t.wins,
                    winRate,
                    bayesianWinRate,
                };
            })
            .filter(e => e.appearances >= MIN_APPEARANCES);

        if (all.length === 0) return empty;

        const sorted = [...all].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
        const overperformers = sorted.filter(e => e.bayesianWinRate > BAYES_TEAM.PRIOR).slice(0, MAX_ITEMS);
        const underperformers = sorted.filter(e => e.bayesianWinRate < BAYES_TEAM.PRIOR).slice(-MAX_ITEMS).reverse();
        return { overperformers, underperformers };
    }, [allHorses, effectiveEntityKey]);

    const canDrilldown = !!(teamStats && allHorses && skillStats);
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;

    const renderCompItem = (e: StyleCompEntry, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const isSelected = selectedCompKey === e.key;
        return (
            <div
                key={e.key}
                className={`syn-comp-item${canDrilldown ? " syn-comp-item--clickable" : ""}${isSelected ? " syn-comp-item--selected" : ""}`}
                onClick={canDrilldown ? () => setSelectedCompKey(k => k === e.key ? null : e.key) : undefined}
            >
                <div className="syn-comp-dots">
                    {e.strategies.map((s, i) => (
                        <span key={i} className="syn-comp-dot" style={{ background: activeStrategyColors[s] ?? "#718096" }} />
                    ))}
                </div>
                <div className="syn-comp-name">{e.label}</div>
                <div className="syn-comp-stats">
                    <span className="syn-comp-adj" style={{ color: valueColor }}>{(e.bayesianWinRate * 100).toFixed(0)}%</span>
                    <span className="syn-comp-pipe"> | </span>
                    <span className="syn-comp-raw">{(e.winRate * 100).toFixed(0)}% ({e.appearances})</span>
                </div>
            </div>
        );
    };

    return (
        <div className="pie-chart-container">
            <div className="sa-top-panels-row">
                <CharacterBreakdownPanel
                    title="Character Breakdown"
                    rawWinsSlices={rawWinsAll}
                    rawPopSlices={rawPop}
                    rawRatingWinsSlices={spectatorMode ? undefined : rawWinsOpp}
                    allHorses={allHorses}
                    skillStats={skillStats}
                    strategyColors={activeStrategyColors}
                />
                {!spectatorMode && (
                    <CharacterBreakdownPanel
                        title="Best Placing Opponent"
                        rawWinsSlices={rawWinsOpp}
                        rawPopSlices={rawPop}
                        allHorses={allHorses}
                        skillStats={skillStats}
                        strategyColors={activeStrategyColors}
                    />
                )}
                {spectatorMode && allHorses && (
                    <CharacterBuildsPanel
                        rawPopSlices={rawPop}
                        allHorses={allHorses}
                        characterStats={characterStats}
                        strategyColors={activeStrategyColors}
                    />
                )}
            </div>

            {spectatorMode && synEntities.length > 0 && (
                <div className="syn-section">
                    <div className="pie-chart-title syn-section-header">
                        Style Trio Synergy
                        <span title="Team win rate for the selected character+style, grouped by the 3-player running style trio (e.g. Front-Front-End). Bayesian prior: 1/3, strength: 18 races. Requires ≥5 appearances." className="sa-info-icon">i</span>
                    </div>
                    <div className="syn-entity-row">
                        <span className="syn-entity-label">Character:</span>
                        <SynergyEntitySelect
                            entities={synEntities}
                            value={effectiveEntityKey}
                            onChange={setSynEntityKey}
                            strategyColors={activeStrategyColors}
                        />
                    </div>
                    {overperformers.length === 0 && underperformers.length === 0 ? (
                        <div className="syn-no-data">No composition data for this entry.</div>
                    ) : (
                        <div className="syn-tables-row">
                            {overperformers.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--best">
                                        <span>▲</span> Overperformers
                                        <span className="syn-comp-meta"><span className="syn-comp-meta-adj syn-comp-meta-adj--best">Adj. win%</span><span className="syn-comp-meta-raw"> | Raw win% (samples)</span></span>
                                    </div>
                                    {overperformers.map(e => renderCompItem(e, true))}
                                </div>
                            )}
                            {underperformers.length > 0 && (
                                <div className="syn-table-col">
                                    <div className="syn-table-col-label syn-table-col-label--worst">
                                        <span>▼</span> Underperformers
                                        <span className="syn-comp-meta"><span className="syn-comp-meta-adj syn-comp-meta-adj--worst">Adj. win%</span><span className="syn-comp-meta-raw"> | Raw win% (samples)</span></span>
                                    </div>
                                    {underperformers.map(e => renderCompItem(e, false))}
                                </div>
                            )}
                        </div>
                    )}
                    {canDrilldown && selectedCompKey && drilldownTeams.length > 0 && (() => {
                        const idx = Math.min(selectedDrilldownIdx, drilldownTeams.length - 1);
                        const selectedTeam = drilldownTeams[idx];
                        const compKey = selectedTeam.team.members
                            .map(mem => `${mem.cardId}_${mem.strategy}`)
                            .sort((a, b) => {
                                const [ac, as_] = a.split('_').map(Number);
                                const [bc, bs_] = b.split('_').map(Number);
                                return (ac * 10 + as_) - (bc * 10 + bs_);
                            })
                            .join("__");
                        const memberMap = bestHorseByFullComp.get(compKey) ?? new Map<string, HorseEntry>();
                        const teamSelectOptions = drilldownTeams.map((item, i) => {
                            const n = item.team.appearances;
                            return {
                                value: String(i),
                                samples: n,
                                members: item.team.members.map((m, mi) => ({
                                    cardId: m.cardId,
                                    strategy: m.strategy,
                                    winRatePct: n > 0 ? ((item.team.memberWins[mi] ?? 0) / n) * 100 : 0,
                                })),
                            };
                        });
                        return (
                            <div className="tcp-member-drilldown">
                                {drilldownTeams.length > 1 && (
                                    <div className="tcp-rep-team-select">
                                        <TeamSampleSelect
                                            value={String(idx)}
                                            options={teamSelectOptions}
                                            onChange={(v) => setSelectedDrilldownIdx(Number(v))}
                                            strategyColors={activeStrategyColors}
                                        />
                                    </div>
                                )}
                                <div className="stcp-team-members-row">
                                    {selectedTeam.team.members.map((m, i) => {
                                        const rep = memberMap.get(`${m.cardId}_${m.strategy}`);
                                        if (!rep) {
                                            return (
                                                <div key={i} className="stcp-member-card stcp-member-card--placeholder">
                                                    <div className="stcp-member-placeholder-label">{m.charaName}</div>
                                                    <div className="stcp-member-placeholder-note">No sample profile available</div>
                                                </div>
                                            );
                                        }
                                        return <TeamMemberCard key={i} horse={rep} skillStats={skillStats!} strategyColors={activeStrategyColors} />;
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

export default CharacterAnalysis;
