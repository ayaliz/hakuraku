import React, { useState, useMemo, useRef, useEffect } from "react";
import type { HorseEntry } from "../MultiRacePage/types";
import { STRATEGY_NAMES, STRATEGY_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import "./UmaLogsPage.css";

type FilterMode = "includes" | "excludes";
type FilterKind = "character" | "strategy";
type FilterProperty = "none" | "speed" | "stamina" | "pow" | "guts" | "wiz" | "totalSkillPoints" | "rankScore" | "skill";
type StatOp = ">=" | "<";
type SortKey = "label" | "entries" | "teams" | "wins" | "awPct";

interface CharaVariant {
    cardId: number;
    charaId: number;
    charaName: string;
    cardName: string;
    count: number;
}

interface SkillVariant {
    skillId: number;
    skillName: string;
    isInherit: boolean;
    count: number;
}

interface FilterCondition {
    id: string;
    mode: FilterMode;
    kind: FilterKind;
    // character kind
    cardId: number | null;
    cardStrategy: number | null;
    // strategy kind
    strategy: number | null;
    // optional "with" clause — applies to the matched candidates
    property: FilterProperty;
    statOp: StatOp;
    statValue: number;
    skillId: number | null;
    skillPresent: boolean;
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
}

interface ExplorerTabProps {
    allHorses: HorseEntry[];
    strategyColors?: Record<number, string>;
}

interface CharaSelectProps {
    variants: CharaVariant[];
    value: number | null;
    onChange: (cardId: number) => void;
}

interface SkillSelectProps {
    variants: SkillVariant[];
    value: number | null;
    onChange: (skillId: number) => void;
}

const PROPERTY_LABELS: Record<FilterProperty, string> = {
    none: "—",
    speed: "Speed",
    stamina: "Stamina",
    pow: "Power",
    guts: "Guts",
    wiz: "Wit",
    totalSkillPoints: "Skill pts",
    rankScore: "Score",
    skill: "Skill",
};

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

const SkillSelect: React.FC<SkillSelectProps> = ({ variants, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find(v => v.skillId === value) ?? variants[0] ?? null;

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
        ? variants.filter(v => {
            const label = v.isInherit ? `${v.skillName} inherit` : v.skillName;
            return label.toLowerCase().includes(q);
        })
        : variants;

    const renderSkillLabel = (v: SkillVariant) => (
        <>
            <span>{v.skillName}</span>
            {v.isInherit && <span className="exp-skill-inherit-tag">(inherit)</span>}
        </>
    );

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn exp-chara-select-btn--skill" onClick={() => setOpen(o => !o)}>
                <span className="exp-name-block">
                    {renderSkillLabel(selected)}
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
                    ) : filtered.map(v => (
                        <div
                            key={v.skillId}
                            className={`exp-chara-select-option${v.skillId === value ? " active" : ""}`}
                            onClick={() => { onChange(v.skillId); setOpen(false); }}
                        >
                            <span className="exp-name-block">
                                {renderSkillLabel(v)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const STRATEGIES = [1, 2, 3, 4] as const;

function computeSkillPoints(learnedSkillIds: Set<number>): number {
    let total = 0;
    for (const skillId of learnedSkillIds) {
        const base = UMDatabaseWrapper.skillNeedPoints[skillId] ?? 0;
        let upgrade = 0;
        if (UMDatabaseWrapper.skills[skillId]?.rarity === 2) {
            const lastDigit = skillId % 10;
            const flippedId = lastDigit === 1 ? skillId + 1 : skillId - 1;
            upgrade = UMDatabaseWrapper.skillNeedPoints[flippedId] ?? 0;
        } else if (UMDatabaseWrapper.skills[skillId]?.rarity === 1 && skillId % 10 === 1) {
            const pairedId = skillId + 1;
            if (UMDatabaseWrapper.skills[pairedId]?.rarity === 1) {
                upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
            }
        }
        total += base + upgrade;
    }
    return total;
}

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

function matchProperty(cond: FilterCondition, h: HorseEntry): boolean {
    if (cond.property === "none") return true;
    if (cond.property === "skill") {
        const has = cond.skillId !== null && h.learnedSkillIds.has(cond.skillId);
        return cond.skillPresent ? has : !has;
    }
    const val = cond.property === "totalSkillPoints"
        ? computeSkillPoints(h.learnedSkillIds)
        : h[cond.property as Exclude<FilterProperty, "none" | "skill" | "totalSkillPoints">] as number;
    return cond.statOp === ">=" ? val >= cond.statValue : val < cond.statValue;
}

function matchCondition(cond: FilterCondition, teammates: HorseEntry[]): boolean {
    let hasMatch: boolean;
    if (cond.kind === "character") {
        hasMatch = teammates.some(h =>
            h.cardId === cond.cardId &&
            (cond.cardStrategy === null || h.strategy === cond.cardStrategy) &&
            matchProperty(cond, h)
        );
    } else {
        hasMatch = teammates.some(h =>
            h.strategy === cond.strategy &&
            matchProperty(cond, h)
        );
    }
    return cond.mode === "includes" ? hasMatch : !hasMatch;
}

function aggregateHorses(
    horses: HorseEntry[],
    mode: "strategy" | "card-strategy",
    sortKey: SortKey,
    sortDesc: boolean,
): AggRow[] {
    const groups = new Map<string, {
        label: string; sublabel?: string;
        charaId?: number; cardId?: number; strategy?: number;
        entries: number; teams: Set<string>; wins: number;
    }>();

    for (const h of horses) {
        const key = mode === "card-strategy"
            ? `cd${h.cardId}_s${h.strategy}`
            : `s${h.strategy}`;

        if (!groups.has(key)) {
            if (mode === "card-strategy") {
                const cardName = UMDatabaseWrapper.cards[h.cardId]?.name ?? h.charaName;
                const stratName = STRATEGY_NAMES[h.strategy] ?? `Strategy ${h.strategy}`;
                groups.set(key, {
                    label: cardName, sublabel: stratName,
                    charaId: h.charaId, cardId: h.cardId, strategy: h.strategy,
                    entries: 0, teams: new Set(), wins: 0,
                });
            } else {
                groups.set(key, {
                    label: STRATEGY_NAMES[h.strategy] ?? `Strategy ${h.strategy}`,
                    strategy: h.strategy,
                    entries: 0, teams: new Set(), wins: 0,
                });
            }
        }
        const g = groups.get(key)!;
        g.entries++;
        g.teams.add(`${h.raceId}|${h.teamId}`);
        if (h.finishOrder === 1) g.wins++;
    }

    const result: AggRow[] = Array.from(groups.values()).map(g => ({
        key: g.cardId !== undefined ? `cd${g.cardId}_s${g.strategy}` : `s${g.strategy}`,
        label: g.label, sublabel: g.sublabel,
        charaId: g.charaId, cardId: g.cardId, strategy: g.strategy,
        entries: g.entries, teams: g.teams.size, wins: g.wins,
        awPct: g.entries > 0 ? Math.round(100 * g.wins / g.entries) : 0,
    }));

    result.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (typeof va === "string" && typeof vb === "string")
            return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
        return sortDesc ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
}

const ExplorerTab: React.FC<ExplorerTabProps> = ({ allHorses, strategyColors }) => {
    const [conditions, setConditions] = useState<FilterCondition[]>([]);
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

    const skillVariants = useMemo((): SkillVariant[] => {
        const map = new Map<number, number>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            for (const skillId of h.learnedSkillIds) {
                map.set(skillId, (map.get(skillId) ?? 0) + 1);
            }
        }
        return Array.from(map.entries())
            .map(([skillId, count]) => ({
                skillId,
                skillName: UMDatabaseWrapper.skillName(skillId),
                isInherit: skillId >= 900000 && skillId < 1000000,
                count,
            }))
            .sort((a, b) => b.count - a.count);
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

    const displayHorses = useMemo(() => {
        if (!hasCharFilter) return filteredHorses;
        return filteredHorses.filter(h =>
            includeCharConds.some(c =>
                h.cardId === c.cardId &&
                (c.cardStrategy === null || h.strategy === c.cardStrategy)
            )
        );
    }, [filteredHorses, includeCharConds, hasCharFilter]);

    const aggMode = hasCharFilter ? "card-strategy" : "strategy";
    const rows = useMemo(
        () => aggregateHorses(displayHorses, aggMode, sortKey, sortDesc),
        [displayHorses, aggMode, sortKey, sortDesc]
    );

    const totalTeams = teamMap.size;
    const { filteredTeams, filteredTeamWins } = useMemo(() => {
        const keys = new Set(filteredHorses.map(h => `${h.raceId}|${h.teamId}`));
        const winKeys = new Set(filteredHorses.filter(h => h.finishOrder === 1).map(h => `${h.raceId}|${h.teamId}`));
        return { filteredTeams: keys.size, filteredTeamWins: winKeys.size };
    }, [filteredHorses]);
    const filteredTeamWinPct = filteredTeams > 0 ? Math.round(100 * filteredTeamWins / filteredTeams) : 0;


    const addCondition = () => setConditions(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        mode: "includes",
        kind: "character",
        cardId: cardVariants[0]?.cardId ?? null,
        cardStrategy: null,
        strategy: 1,
        property: "none",
        statOp: ">=",
        statValue: 1200,
        skillId: skillVariants[0]?.skillId ?? null,
        skillPresent: true,
    }]);

    const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id));

    const updateCondition = (id: string, patch: Partial<FilterCondition>) =>
        setConditions(prev => prev.map(c => {
            if (c.id !== id) return c;
            const next = { ...c, ...patch };
            if (patch.kind !== undefined && patch.kind !== c.kind) {
                if (patch.kind === "character") { next.cardId = cardVariants[0]?.cardId ?? null; next.cardStrategy = null; }
                else if (patch.kind === "strategy") { next.strategy = 1; }
            }
            if (patch.property === "skill" && next.skillId === null)
                next.skillId = skillVariants[0]?.skillId ?? null;
            return next;
        }));

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDesc(d => !d);
        else { setSortKey(key); setSortDesc(true); }
    };

    const maxAwPct = Math.max(...rows.map(r => r.awPct), 1);

    const SortArrow = ({ col }: { col: SortKey }) =>
        sortKey === col ? <span className="exp-sort-arrow">{sortDesc ? "↓" : "↑"}</span> : null;

    const renderRow = (row: AggRow) => {
        const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
        const stratColor = row.strategy !== undefined
            ? (activeStrategyColors[row.strategy] ?? "#718096")
            : undefined;
        const iconUrl = row.charaId !== undefined && row.cardId !== undefined
            ? getCharaIcon(`${row.charaId}_${row.cardId}`)
            : null;
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
                        {row.sublabel && <span className="exp-sublabel">{row.sublabel}</span>}
                    </span>
                </td>
                <td className="exp-td exp-td--r">{row.entries}</td>
                <td className="exp-td exp-td--r">{row.teams}</td>
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
            </tr>
        );
    };

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
                        {' · '}{filteredTeamWins.toLocaleString()} wins
                        {' · '}<span className="exp-filter-winpct">{filteredTeamWinPct}% team win rate</span>
                        {conditions.length > 0 && <> · {filteredHorses.length.toLocaleString()} entries</>}
                    </span>
                </div>

                <div className="exp-conditions">
                    {conditions.map(cond => (
                        <div key={cond.id} className="exp-condition-row">
                            {/* contains / excludes */}
                            <div className="exp-toggle">
                                <button className={`exp-toggle-btn${cond.mode === "includes" ? " active" : ""}`}
                                    onClick={() => updateCondition(cond.id, { mode: "includes" })}>contains</button>
                                <button className={`exp-toggle-btn${cond.mode === "excludes" ? " active" : ""}`}
                                    onClick={() => updateCondition(cond.id, { mode: "excludes" })}>excludes</button>
                            </div>

                            {/* kind */}
                            <select className="exp-select" value={cond.kind}
                                onChange={e => updateCondition(cond.id, { kind: e.target.value as FilterKind })}>
                                <option value="character">character</option>
                                <option value="strategy">strategy</option>
                            </select>

                            {/* subject selector */}
                            {cond.kind === "character" && (
                                <>
                                    <CharaSelect
                                        variants={cardVariants}
                                        value={cond.cardId}
                                        onChange={cardId => updateCondition(cond.id, { cardId })}
                                    />
                                    <span className="exp-as-label">as</span>
                                    <select className="exp-select"
                                        value={cond.cardStrategy ?? ""}
                                        onChange={e => updateCondition(cond.id, {
                                            cardStrategy: e.target.value === "" ? null : Number(e.target.value)
                                        })}>
                                        <option value="">any strategy</option>
                                        {STRATEGIES.map(s => (
                                            <option key={s} value={s}>{STRATEGY_NAMES[s] ?? `Strategy ${s}`}</option>
                                        ))}
                                    </select>
                                </>
                            )}

                            {cond.kind === "strategy" && (
                                <select className="exp-select exp-select--wide"
                                    value={cond.strategy ?? 1}
                                    onChange={e => updateCondition(cond.id, { strategy: Number(e.target.value) })}>
                                    {STRATEGIES.map(s => (
                                        <option key={s} value={s}>{STRATEGY_NAMES[s] ?? `Strategy ${s}`}</option>
                                    ))}
                                </select>
                            )}

                            {/* optional "with" clause */}
                            <span className="exp-with-label">with</span>
                            <select className="exp-select" value={cond.property}
                                onChange={e => updateCondition(cond.id, { property: e.target.value as FilterProperty })}>
                                {(Object.keys(PROPERTY_LABELS) as FilterProperty[]).map(k => (
                                    <option key={k} value={k}>{PROPERTY_LABELS[k]}</option>
                                ))}
                            </select>

                            {/* property controls */}
                            {cond.property !== "none" && cond.property !== "skill" && (
                                <>
                                    <div className="exp-toggle">
                                        <button className={`exp-toggle-btn${cond.statOp === ">=" ? " active" : ""}`}
                                            onClick={() => updateCondition(cond.id, { statOp: ">=" })}>≥</button>
                                        <button className={`exp-toggle-btn${cond.statOp === "<" ? " active" : ""}`}
                                            onClick={() => updateCondition(cond.id, { statOp: "<" })}>&lt;</button>
                                    </div>
                                    <input
                                        type="number"
                                        className="exp-stat-input"
                                        value={cond.statValue}
                                        min={0}
                                        onChange={e => updateCondition(cond.id, { statValue: Number(e.target.value) })}
                                    />
                                </>
                            )}

                            {cond.property === "skill" && (
                                <>
                                    <div className="exp-toggle">
                                        <button className={`exp-toggle-btn${cond.skillPresent ? " active" : ""}`}
                                            onClick={() => updateCondition(cond.id, { skillPresent: true })}>has</button>
                                        <button className={`exp-toggle-btn${!cond.skillPresent ? " active" : ""}`}
                                            onClick={() => updateCondition(cond.id, { skillPresent: false })}>hasn't</button>
                                    </div>
                                    <SkillSelect
                                        variants={skillVariants}
                                        value={cond.skillId}
                                        onChange={skillId => updateCondition(cond.id, { skillId })}
                                    />
                                </>
                            )}

                            <button className="exp-remove-btn" onClick={() => removeCondition(cond.id)}>×</button>
                        </div>
                    ))}
                </div>

                <button className="exp-add-btn" onClick={addCondition}>+ Add condition</button>
            </div>

            <div className="exp-panel exp-panel--results">
                {rows.length === 0 ? (
                    <div className="exp-empty">No teams match the current filter.</div>
                ) : (
                    <table className="exp-table">
                        <thead>
                            <tr>
                                <th className="exp-th" onClick={() => handleSort("label")}>{hasCharFilter ? "Character / Style" : "Style"} <SortArrow col="label" /></th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("entries")} title="Total horse-race appearances">Entries <SortArrow col="entries" /></th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("teams")} title="Distinct teams that ran this strategy">Teams <SortArrow col="teams" /></th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("wins")} title="1st place finishes">Wins <SortArrow col="wins" /></th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("awPct")} title="Entry Win Rate — wins ÷ entries">Entry Win% <SortArrow col="awPct" /></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(renderRow)}
                        </tbody>
                    </table>
                )}
            </div>

        </div>
    );
};

export default ExplorerTab;
