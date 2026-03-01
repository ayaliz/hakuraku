import React, { useState, useMemo, useRef, useEffect } from "react";
import type { HorseEntry } from "../MultiRacePage/types";
import { STRATEGY_NAMES, STRATEGY_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import "./UmaLogsPage.css";

type FilterMode = "includes" | "excludes";
type FilterKind = "character" | "strategy";
type GroupBy = "card" | "strategy";
type SortKey = "label" | "entries" | "teams" | "wins" | "awPct" | "twPct";

interface CharaVariant {
    cardId: number;
    charaId: number;
    charaName: string;
    cardName: string;
    count: number;
}

interface FilterCondition {
    id: string;
    mode: FilterMode;
    kind: FilterKind;
    cardId: number | null;
    strategy: number | null;
}

interface AggRow {
    key: string;
    label: string;
    sublabel?: string;
    charaId?: number;
    cardId?: number;
    strategy?: number;
    entries: number;
    teams: number;
    wins: number;
    awPct: number;
    twPct: number;
}

interface ExplorerTabProps {
    allHorses: HorseEntry[];
}

interface CharaSelectProps {
    variants: CharaVariant[];
    value: number | null;
    onChange: (cardId: number) => void;
}

const CharaSelect: React.FC<CharaSelectProps> = ({ variants, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find(v => v.cardId === value) ?? variants[0] ?? null;

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
        ? variants.filter(v =>
            v.cardName.toLowerCase().includes(q) ||
            v.charaName.toLowerCase().includes(q))
        : variants;

    const selectedIcon = getCharaIcon(`${selected.charaId}_${selected.cardId}`);

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn" onClick={() => setOpen(o => !o)}>
                {selectedIcon && (
                    <div className="exp-chara-select-portrait">
                        <img src={selectedIcon} alt=""
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    </div>
                )}
                <span className="exp-name-block">
                    <span>{selected.cardName}</span>
                    {selected.cardName !== selected.charaName && (
                        <span className="exp-sublabel">{selected.charaName}</span>
                    )}
                </span>
                <span className="exp-chara-select-arrow">▾</span>
            </button>

            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="exp-chara-search-input"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map(v => {
                        const icon = getCharaIcon(`${v.charaId}_${v.cardId}`);
                        return (
                            <div
                                key={v.cardId}
                                className={`exp-chara-select-option${v.cardId === value ? " active" : ""}`}
                                onClick={() => { onChange(v.cardId); setOpen(false); }}
                            >
                                {icon && (
                                    <div className="exp-chara-select-portrait">
                                        <img src={icon} alt=""
                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                    </div>
                                )}
                                <span className="exp-name-block">
                                    <span>{v.cardName}</span>
                                    {v.cardName !== v.charaName && (
                                        <span className="exp-sublabel">{v.charaName}</span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const STRATEGIES = [1, 2, 3, 4] as const;

function buildTeamMap(horses: HorseEntry[]): Map<string, HorseEntry[]> {
    const map = new Map<string, HorseEntry[]>();
    for (const h of horses) {
        if (h.teamId <= 0) continue;
        const key = `${h.raceId}|${h.teamId}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(h);
    }
    return map;
}

function matchCondition(cond: FilterCondition, teammates: HorseEntry[]): boolean {
    let hasMatch: boolean;
    if (cond.kind === "character") {
        hasMatch = teammates.some(h =>
            h.cardId === cond.cardId &&
            (cond.strategy === null || h.strategy === cond.strategy)
        );
    } else {
        hasMatch = teammates.some(h => h.strategy === cond.strategy);
    }
    return cond.mode === "includes" ? hasMatch : !hasMatch;
}

function aggregateHorses(
    horses: HorseEntry[],
    groupBy: GroupBy,
    sortKey: SortKey,
    sortDesc: boolean,
): AggRow[] {
    const groups = new Map<string, {
        label: string; sublabel?: string;
        charaId?: number; cardId?: number; strategy?: number;
        entries: number; teams: Set<string>; wins: number;
    }>();

    for (const h of horses) {
        let key: string, label: string, sublabel: string | undefined;
        let charaId: number | undefined, cardId: number | undefined, strategy: number | undefined;

        if (groupBy === "card") {
            key = `cd${h.cardId}`;
            label = UMDatabaseWrapper.cards[h.cardId]?.name ?? h.charaName;
            sublabel = h.charaName;
            charaId = h.charaId;
            cardId = h.cardId;
        } else {
            key = `s${h.strategy}`;
            label = STRATEGY_NAMES[h.strategy] ?? `Strategy ${h.strategy}`;
            strategy = h.strategy;
        }

        if (!groups.has(key))
            groups.set(key, { label, sublabel, charaId, cardId, strategy, entries: 0, teams: new Set(), wins: 0 });
        const g = groups.get(key)!;
        g.entries++;
        g.teams.add(`${h.raceId}|${h.teamId}`);
        if (h.finishOrder === 1) g.wins++;
    }

    const result: AggRow[] = Array.from(groups.values()).map(g => ({
        key: g.cardId !== undefined ? `cd${g.cardId}` : `s${g.strategy}`,
        label: g.label, sublabel: g.sublabel,
        charaId: g.charaId, cardId: g.cardId, strategy: g.strategy,
        entries: g.entries, teams: g.teams.size, wins: g.wins,
        awPct: g.entries > 0 ? Math.round(100 * g.wins / g.entries) : 0,
        twPct: g.teams.size > 0 ? Math.round(100 * g.wins / g.teams.size) : 0,
    }));

    result.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (typeof va === "string" && typeof vb === "string")
            return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
        return sortDesc ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
}

const ExplorerTab: React.FC<ExplorerTabProps> = ({ allHorses }) => {
    const [conditions, setConditions] = useState<FilterCondition[]>([]);
    const [groupBy, setGroupBy] = useState<GroupBy>("card");
    const [sortKey, setSortKey] = useState<SortKey>("entries");
    const [sortDesc, setSortDesc] = useState(true);

    const cardVariants = useMemo((): CharaVariant[] => {
        const map = new Map<number, CharaVariant>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            if (!map.has(h.cardId)) {
                map.set(h.cardId, {
                    cardId: h.cardId,
                    charaId: h.charaId,
                    charaName: h.charaName,
                    cardName: UMDatabaseWrapper.cards[h.cardId]?.name ?? h.charaName,
                    count: 0,
                });
            }
            map.get(h.cardId)!.count++;
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [allHorses]);

    const teamMap = useMemo(() => buildTeamMap(allHorses), [allHorses]);
    const playerHorses = useMemo(() => allHorses.filter(h => h.teamId > 0), [allHorses]);

    const filteredHorses = useMemo(() => {
        if (conditions.length === 0) return playerHorses;
        const qualifyingKeys = new Set<string>();
        for (const [teamKey, teammates] of teamMap) {
            if (conditions.every(cond => matchCondition(cond, teammates)))
                qualifyingKeys.add(teamKey);
        }
        return playerHorses.filter(h => qualifyingKeys.has(`${h.raceId}|${h.teamId}`));
    }, [playerHorses, teamMap, conditions]);

    const includeCharConds = useMemo(
        () => conditions.filter(c => c.mode === "includes" && c.kind === "character"),
        [conditions]
    );
    const hasCharFilter = includeCharConds.length > 0;
    const showSplit = hasCharFilter && groupBy === "strategy";

    const selfHorses = useMemo(() => {
        if (!hasCharFilter) return [];
        return filteredHorses.filter(h =>
            includeCharConds.some(c =>
                h.cardId === c.cardId &&
                (c.strategy === null || h.strategy === c.strategy)
            )
        );
    }, [filteredHorses, includeCharConds, hasCharFilter]);

    const teammateHorses = useMemo(() => {
        if (!hasCharFilter) return [];
        return filteredHorses.filter(h =>
            !includeCharConds.some(c =>
                h.cardId === c.cardId &&
                (c.strategy === null || h.strategy === c.strategy)
            )
        );
    }, [filteredHorses, includeCharConds, hasCharFilter]);

    const rows = useMemo(
        () => showSplit ? [] : aggregateHorses(filteredHorses, groupBy, sortKey, sortDesc),
        [filteredHorses, groupBy, sortKey, sortDesc, showSplit]
    );
    const selfRows = useMemo(
        () => showSplit ? aggregateHorses(selfHorses, "strategy", sortKey, sortDesc) : [],
        [selfHorses, sortKey, sortDesc, showSplit]
    );
    const teammateRows = useMemo(
        () => showSplit ? aggregateHorses(teammateHorses, "strategy", sortKey, sortDesc) : [],
        [teammateHorses, sortKey, sortDesc, showSplit]
    );


    const totalTeams = teamMap.size;
    const filteredTeams = useMemo(() => {
        const keys = new Set(filteredHorses.map(h => `${h.raceId}|${h.teamId}`));
        return keys.size;
    }, [filteredHorses]);

    const addCondition = () => setConditions(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        mode: "includes",
        kind: "character",
        cardId: cardVariants[0]?.cardId ?? null,
        strategy: null,
    }]);

    const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id));

    const updateCondition = (id: string, patch: Partial<FilterCondition>) =>
        setConditions(prev => prev.map(c => {
            if (c.id !== id) return c;
            const next = { ...c, ...patch };
            if (patch.kind !== undefined && patch.kind !== c.kind) {
                if (patch.kind === "character") { next.cardId = cardVariants[0]?.cardId ?? null; next.strategy = null; }
                else { next.cardId = null; next.strategy = 1; }
            }
            return next;
        }));

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDesc(d => !d);
        else { setSortKey(key); setSortDesc(true); }
    };

    const allDisplayRows = showSplit ? [...selfRows, ...teammateRows] : rows;
    const maxTwPct = Math.max(...allDisplayRows.map(r => r.twPct), 1);
    const maxAwPct = Math.max(...allDisplayRows.map(r => r.awPct), 1);

    let selfSectionLabel = "Filtered Characters";
    let selfSectionIcon: string | null = null;
    if (includeCharConds.length === 1) {
        const v = cardVariants.find(cv => cv.cardId === includeCharConds[0].cardId);
        if (v) {
            selfSectionLabel = v.cardName;
            selfSectionIcon = getCharaIcon(`${v.charaId}_${v.cardId}`);
        }
    }

    const SortArrow = ({ col }: { col: SortKey }) =>
        sortKey === col ? <span className="exp-sort-arrow">{sortDesc ? "↓" : "↑"}</span> : null;

    const renderRow = (row: AggRow) => {
        const iconUrl = row.cardId !== undefined && row.charaId !== undefined
            ? getCharaIcon(`${row.charaId}_${row.cardId}`)
            : null;
        const stratColor = row.strategy !== undefined
            ? (STRATEGY_COLORS[row.strategy] ?? "#718096")
            : undefined;
        return (
            <tr key={row.key} className="exp-row">
                <td className="exp-td exp-td--name">
                    {iconUrl && (
                        <div className="exp-card-portrait">
                            <img src={iconUrl} alt=""
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        </div>
                    )}
                    {stratColor && <span className="exp-dot" style={{ background: stratColor }} />}
                    <span className="exp-name-block">
                        <span>{row.label}</span>
                        {row.sublabel && row.sublabel !== row.label && (
                            <span className="exp-sublabel">{row.sublabel}</span>
                        )}
                    </span>
                </td>
                <td className="exp-td exp-td--r">{row.entries}</td>
                {groupBy === "strategy" && (
                    <td className="exp-td exp-td--r">{row.teams}</td>
                )}
                <td className="exp-td exp-td--r">
                    {row.wins}
                    {row.entries > 0 && <span className="exp-wins-pct"> ({row.awPct}%)</span>}
                </td>
                <td className="exp-td exp-td--r">
                    <div className="exp-pct-cell">
                        <div className="exp-bar-track">
                            <div className="exp-bar exp-bar--aw" style={{ width: `${(row.awPct / maxAwPct) * 100}%` }} />
                        </div>
                        <span className="exp-pct-val">{row.awPct}%</span>
                    </div>
                </td>
                {groupBy === "strategy" && (
                    <td className="exp-td exp-td--r">
                        <div className="exp-pct-cell">
                            <div className="exp-bar-track">
                                <div className="exp-bar exp-bar--tw" style={{ width: `${(row.twPct / maxTwPct) * 100}%` }} />
                            </div>
                            <span className="exp-pct-val">{row.twPct}%</span>
                        </div>
                    </td>
                )}
            </tr>
        );
    };

    const isEmpty = showSplit
        ? selfRows.length === 0 && teammateRows.length === 0
        : rows.length === 0;

    const colSpan = groupBy === "strategy" ? 6 : 4;

    return (
        <div className="exp-container">
            <div className="exp-panel">
                <div className="exp-panel-header">
                    <span className="exp-panel-label">Team Filter</span>
                    <span className="exp-panel-note">
                        Filter teams however you want.
                    </span>
                    <span className="exp-filter-summary">
                        {filteredTeams.toLocaleString()} / {totalTeams.toLocaleString()} teams
                        {conditions.length > 0 && <> · {filteredHorses.length.toLocaleString()} entries</>}
                    </span>
                </div>

                <div className="exp-conditions">
                    {conditions.map(cond => (
                        <div key={cond.id} className="exp-condition-row">
                            <div className="exp-toggle">
                                <button className={`exp-toggle-btn${cond.mode === "includes" ? " active" : ""}`}
                                    onClick={() => updateCondition(cond.id, { mode: "includes" })}>contains</button>
                                <button className={`exp-toggle-btn${cond.mode === "excludes" ? " active" : ""}`}
                                    onClick={() => updateCondition(cond.id, { mode: "excludes" })}>excludes</button>
                            </div>

                            <select className="exp-select" value={cond.kind}
                                onChange={e => updateCondition(cond.id, { kind: e.target.value as FilterKind })}>
                                <option value="character">Character</option>
                                <option value="strategy">Strategy</option>
                            </select>

                            {cond.kind === "character" ? (
                                <>
                                    <CharaSelect
                                        variants={cardVariants}
                                        value={cond.cardId}
                                        onChange={cardId => updateCondition(cond.id, { cardId })}
                                    />
                                    <span className="exp-as-label">as</span>
                                    <select className="exp-select"
                                        value={cond.strategy ?? ""}
                                        onChange={e => updateCondition(cond.id, {
                                            strategy: e.target.value === "" ? null : Number(e.target.value)
                                        })}>
                                        <option value="">Any strategy</option>
                                        {STRATEGIES.map(s => (
                                            <option key={s} value={s}>{STRATEGY_NAMES[s] ?? `Strategy ${s}`}</option>
                                        ))}
                                    </select>
                                </>
                            ) : (
                                <select className="exp-select exp-select--wide"
                                    value={cond.strategy ?? 1}
                                    onChange={e => updateCondition(cond.id, { strategy: Number(e.target.value) })}>
                                    {STRATEGIES.map(s => (
                                        <option key={s} value={s}>{STRATEGY_NAMES[s] ?? `Strategy ${s}`}</option>
                                    ))}
                                </select>
                            )}

                            <button className="exp-remove-btn" onClick={() => removeCondition(cond.id)}>×</button>
                        </div>
                    ))}
                </div>

                <button className="exp-add-btn" onClick={addCondition}>+ Add condition</button>
            </div>

            <div className="exp-panel exp-panel--results">
                <div className="exp-panel-header">
                    <span className="exp-panel-label">Group by</span>
                    <div className="exp-toggle">
                        <button className={`exp-toggle-btn${groupBy === "card" ? " active" : ""}`}
                            onClick={() => setGroupBy("card")}>Character</button>
                        <button className={`exp-toggle-btn${groupBy === "strategy" ? " active" : ""}`}
                            onClick={() => setGroupBy("strategy")}>Strategy</button>
                    </div>
                </div>

                {isEmpty ? (
                    <div className="exp-empty">No teams match the current filter.</div>
                ) : (
                    <table className="exp-table">
                        <thead>
                            <tr>
                                <th className="exp-th" onClick={() => handleSort("label")}>Name <SortArrow col="label" /></th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("entries")} title="Total horse-race appearances">Entries <SortArrow col="entries" /></th>
                                {groupBy === "strategy" && (
                                    <th className="exp-th exp-th--r" onClick={() => handleSort("teams")} title="Distinct teams that ran this strategy">Teams <SortArrow col="teams" /></th>
                                )}
                                <th className="exp-th exp-th--r" onClick={() => handleSort("wins")} title="1st place finishes">Wins <SortArrow col="wins" /></th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("awPct")} title={groupBy === "card" ? "Win Rate — wins ÷ entries" : "Entry Win Rate — wins ÷ entries"}>
                                    {groupBy === "card" ? "Win%" : "Entry Win%"} <SortArrow col="awPct" />
                                </th>
                                {groupBy === "strategy" && (
                                    <th className="exp-th exp-th--r" onClick={() => handleSort("twPct")} title="Team Win Rate — wins ÷ teams entered">Team Win% <SortArrow col="twPct" /></th>
                                )}
                            </tr>
                        </thead>
                        {showSplit ? (
                            <>
                                <tbody>
                                    <tr className="exp-section-hdr">
                                        <td colSpan={colSpan}>
                                            <div className="exp-section-hdr-content">
                                                {selfSectionIcon && (
                                                    <div className="exp-section-portrait">
                                                        <img src={selfSectionIcon} alt=""
                                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                                    </div>
                                                )}
                                                {selfSectionLabel}
                                            </div>
                                        </td>
                                    </tr>
                                    {selfRows.map(renderRow)}
                                </tbody>
                                <tbody>
                                    <tr className="exp-section-hdr exp-section-hdr--teammates">
                                        <td colSpan={colSpan}>
                                            <div className="exp-section-hdr-content">Teammates</div>
                                        </td>
                                    </tr>
                                    {teammateRows.map(renderRow)}
                                </tbody>
                            </>
                        ) : (
                            <tbody>
                                {rows.map(renderRow)}
                            </tbody>
                        )}
                    </table>
                )}
            </div>

        </div>
    );
};

export default ExplorerTab;
