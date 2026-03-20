import React, { useState, useMemo, useRef, useEffect } from "react";
import type { HorseEntry } from "../MultiRacePage/types";
import { STRATEGY_NAMES, STRATEGY_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import AssetLoader from "../../data/AssetLoader";
import { getHorseDeckRaceBonus } from "./deckUtils";
import "./UmaLogsPage.css";

type FilterProperty = "none" | "speed" | "stamina" | "pow" | "guts" | "wiz" | "totalSkillPoints" | "rankScore" | "careerWinCount" | "deckRaceBonus" | "skill" | "supportCard";
type StatOp = ">" | "<" | "=";
type SortKey = "label" | "entries" | "teams" | "wins" | "awPct";
type SkillFilterMode = "learned" | "notLearned" | "activated" | "notActivated";

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

interface CharacterRequirement {
    id: string;
    property: FilterProperty;
    statOp: StatOp;
    statValue: number;
    skillId: number | null;
    skillMode: SkillFilterMode;
    supportCardId: number | null;
    supportCardPresent: boolean;
    supportCardLb: number;
}

interface CharacterFeature {
    id: string;
    cardId: number | null;
    cardStrategy: number | null;
    requirements: CharacterRequirement[];
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

interface SupportCardVariant {
    supportCardId: number;
    name: string;
    count: number;
}

interface SupportCardSelectProps {
    variants: SupportCardVariant[];
    value: number | null;
    onChange: (supportCardId: number) => void;
}

const SUPPORT_CARD_LB_OPTIONS = [
    { value: 0, label: "0LB" },
    { value: 1, label: "1LB" },
    { value: 2, label: "2LB" },
    { value: 3, label: "3LB" },
    { value: 4, label: "MLB" },
] as const;

const PROPERTY_LABELS: Record<FilterProperty, string> = {
    none: "—",
    speed: "Speed",
    stamina: "Stamina",
    pow: "Power",
    guts: "Guts",
    wiz: "Wit",
    totalSkillPoints: "Skill pts",
    rankScore: "Score",
    careerWinCount: "Career wins",
    deckRaceBonus: "Deck race bonus",
    skill: "Skill",
    supportCard: "Support card",
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

    const selectedIcon = selected.cardId !== 0 ? getCharaIcon(`${selected.charaId}_${selected.cardId}`) : null;

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
                    <span>{selected.charaName || selected.cardName}</span>
                    {selected.cardName !== selected.charaName && selected.cardName && (
                        <span className="exp-sublabel">{selected.cardName}</span>
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
                        const icon = v.cardId !== 0 ? getCharaIcon(`${v.charaId}_${v.cardId}`) : null;
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
                                    <span>{v.charaName || v.cardName}</span>
                                    {v.cardName !== v.charaName && v.cardName && (
                                        <span className="exp-sublabel">{v.cardName}</span>
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

const SupportCardSelect: React.FC<SupportCardSelectProps> = ({ variants, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find(v => v.supportCardId === value) ?? variants[0] ?? null;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    useEffect(() => { if (open) inputRef.current?.focus(); else setSearch(""); }, [open]);

    if (!selected) return null;

    const q = search.toLowerCase();
    const filtered = q ? variants.filter(v => v.name.toLowerCase().includes(q)) : variants;

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn" onClick={() => setOpen(o => !o)}>
                <div className="exp-chara-select-portrait">
                    <img src={AssetLoader.getSupportCardIcon(selected.supportCardId)} alt=""
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
                <span className="exp-name-block">
                    <span>{selected.name}</span>
                </span>
                <span className="exp-chara-select-arrow">▾</span>
            </button>

            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input ref={inputRef} type="text" className="exp-chara-search-input"
                            placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map(v => (
                        <div key={v.supportCardId}
                            className={`exp-chara-select-option${v.supportCardId === value ? " active" : ""}`}
                            onClick={() => { onChange(v.supportCardId); setOpen(false); }}>
                            <div className="exp-chara-select-portrait">
                                <img src={AssetLoader.getSupportCardIcon(v.supportCardId)} alt=""
                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </div>
                            <span className="exp-name-block">
                                <span>{v.name}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const STRATEGIES = [5, 1, 2, 3, 4] as const;

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

type PropertyFilter = Pick<CharacterRequirement, "property" | "statOp" | "statValue" | "skillId" | "skillMode" | "supportCardId" | "supportCardPresent" | "supportCardLb">;

function matchStatProperty(filter: PropertyFilter, h: HorseEntry): boolean {
    if (filter.property === "none") return true;
    const val = filter.property === "totalSkillPoints"
        ? computeSkillPoints(h.learnedSkillIds)
        : filter.property === "deckRaceBonus"
            ? getHorseDeckRaceBonus(h)
            : h[filter.property as Exclude<FilterProperty, "none" | "skill" | "totalSkillPoints" | "deckRaceBonus" | "supportCard">] as number;
    if (val === null) return false;
    if (filter.statOp === ">") return val > filter.statValue;
    if (filter.statOp === "<") return val < filter.statValue;
    return val === filter.statValue;
}

function matchesFeatureCharacter(feature: CharacterFeature, h: HorseEntry): boolean {
    return (feature.cardId === 0 || h.cardId === feature.cardId) &&
        (feature.cardStrategy === null || h.strategy === feature.cardStrategy);
}

function matchesPropertyFilter(filter: PropertyFilter, h: HorseEntry): boolean {
    if (filter.property === "skill") {
        if (filter.skillId === null) return false;
        if (filter.skillMode === "learned") return h.learnedSkillIds.has(filter.skillId);
        if (filter.skillMode === "notLearned") return !h.learnedSkillIds.has(filter.skillId);
        if (filter.skillMode === "activated") return h.activatedSkillIds.has(filter.skillId);
        return !h.activatedSkillIds.has(filter.skillId);
    }
    if (filter.property === "supportCard") {
        if (filter.supportCardId === null) return false;
        const hasCard = h.supportCardIds.some((id, index) =>
            id === filter.supportCardId && (h.supportCardLimitBreaks[index] ?? 0) === filter.supportCardLb
        );
        return filter.supportCardPresent ? hasCard : !hasCard;
    }
    return matchStatProperty(filter, h);
}

function defaultStatValueForProperty(property: FilterProperty): number {
    switch (property) {
        case "speed":
        case "stamina":
        case "pow":
        case "guts":
        case "wiz":
            return 1200;
        case "totalSkillPoints":
            return 3000;
        case "careerWinCount":
            return 35;
        case "deckRaceBonus":
            return 50;
        default:
            return 35;
    }
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
                const label = cardName === h.charaName ? h.charaName : `${h.charaName} ${cardName}`;
                const stratName = STRATEGY_NAMES[h.strategy] ?? `Strategy ${h.strategy}`;
                groups.set(key, {
                    label, sublabel: stratName,
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
        if (sortKey === "wins") {
            if (a.awPct !== b.awPct) {
                return sortDesc ? b.awPct - a.awPct : a.awPct - b.awPct;
            }
            if (a.wins !== b.wins) {
                return sortDesc ? b.wins - a.wins : a.wins - b.wins;
            }
            return sortDesc ? b.entries - a.entries : a.entries - b.entries;
        }
        const va = a[sortKey], vb = b[sortKey];
        if (typeof va === "string" && typeof vb === "string")
            return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
        return sortDesc ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
}

const ExplorerTab: React.FC<ExplorerTabProps> = ({ allHorses, strategyColors }) => {
        const [characterFeatures, setCharacterFeatures] = useState<CharacterFeature[]>([]);
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
        const any: CharaVariant = { cardId: 0, charaId: 0, charaName: "", cardName: "Any character", count: 0 };
        return [any, ...Array.from(map.values()).sort((a, b) => b.count - a.count)];
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

    const supportCardVariants = useMemo((): SupportCardVariant[] => {
        const map = new Map<number, number>();
        for (const h of allHorses) {
            if (h.teamId <= 0) continue;
            for (const id of h.supportCardIds) {
                map.set(id, (map.get(id) ?? 0) + 1);
            }
        }
        return Array.from(map.entries())
            .map(([supportCardId, count]) => ({
                supportCardId,
                name: UMDatabaseWrapper.supportCards[supportCardId]?.name ?? `Card ${supportCardId}`,
                count,
            }))
            .sort((a, b) => b.count - a.count);
    }, [allHorses]);

    const teamMap = useMemo(() => buildTeamMap(allHorses), [allHorses]);
    const playerHorses = useMemo(() => allHorses.filter(h => h.teamId > 0), [allHorses]);

    const createDefaultRequirement = (): CharacterRequirement => ({
        id: `${Date.now()}-${Math.random()}`,
        property: "none",
        statOp: ">",
        statValue: defaultStatValueForProperty("none"),
        skillId: skillVariants[0]?.skillId ?? null,
        skillMode: "learned",
        supportCardId: supportCardVariants[0]?.supportCardId ?? null,
        supportCardPresent: true,
        supportCardLb: 4,
    });

    const filteredTeamResults = useMemo(() => {
        if (characterFeatures.length === 0) {
            return Array.from(teamMap.entries()).map(([teamKey, teammates]) => ({
                teamKey,
                teammates,
                matchedCharacterHorses: [] as HorseEntry[],
            }));
        }

        const results: { teamKey: string; teammates: HorseEntry[]; matchedCharacterHorses: HorseEntry[] }[] = [];
        for (const [teamKey, teammates] of teamMap) {
            const matchedByFeature = characterFeatures.map(feature => {
                const candidates = teammates.filter(h => matchesFeatureCharacter(feature, h));
                return candidates.filter(h => feature.requirements.every(req => matchesPropertyFilter(req, h)));
            });
            if (matchedByFeature.some(matches => matches.length === 0)) continue;
            const matchedCharacterHorses = matchedByFeature.flat();
            results.push({ teamKey, teammates, matchedCharacterHorses });
        }
        return results;
    }, [characterFeatures, teamMap]);

    const filteredHorses = useMemo(() => {
        if (characterFeatures.length === 0) return playerHorses;
        const qualifyingKeys = new Set(filteredTeamResults.map(r => r.teamKey));
        return playerHorses.filter(h => qualifyingKeys.has(`${h.raceId}|${h.teamId}`));
    }, [characterFeatures.length, filteredTeamResults, playerHorses]);

    const hasCharFilter = characterFeatures.length > 0;

    const displayHorses = useMemo(() => {
        if (hasCharFilter) {
            return filteredTeamResults.flatMap(result => result.matchedCharacterHorses.filter(h => h.teamId > 0));
        }
        return filteredHorses;
    }, [filteredHorses, filteredTeamResults, hasCharFilter]);

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
    const isLowTeamWinRate = filteredTeams > 0 && filteredTeamWins * 3 < filteredTeams;


    const addCharacterFeature = () => setCharacterFeatures(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        cardId: cardVariants[0]?.cardId ?? null,
        cardStrategy: null,
        requirements: [createDefaultRequirement()],
    }]);

    const removeCharacterFeature = (id: string) => { setCharacterFeatures(prev => prev.filter(f => f.id !== id)); };
    const addCharacterRequirement = (featureId: string) =>
        setCharacterFeatures(prev => prev.map(feature =>
            feature.id === featureId
                ? { ...feature, requirements: [...feature.requirements, createDefaultRequirement()] }
                : feature
        ));
    const removeCharacterRequirement = (featureId: string, requirementId: string) =>
        setCharacterFeatures(prev => prev.map(feature =>
            feature.id === featureId
                ? {
                    ...feature,
                    requirements: feature.requirements.filter(req => req.id !== requirementId),
                }
                : feature
        ));

    const updateCharacterFeature = (id: string, patch: Partial<CharacterFeature>) =>
        setCharacterFeatures(prev => prev.map(feature => {
            if (feature.id !== id) return feature;
            return { ...feature, ...patch };
        }));

    const updateCharacterRequirement = (featureId: string, requirementId: string, patch: Partial<CharacterRequirement>) =>
        setCharacterFeatures(prev => prev.map(feature => {
            if (feature.id !== featureId) return feature;
            return {
                ...feature,
                requirements: feature.requirements.map(req => {
                    if (req.id !== requirementId) return req;
                    const next = { ...req, ...patch };
                    if (patch.property === "skill" && next.skillId === null)
                        next.skillId = skillVariants[0]?.skillId ?? null;
                    if (patch.property === "supportCard" && next.supportCardId === null)
                        next.supportCardId = supportCardVariants[0]?.supportCardId ?? null;
                    if (patch.property === "supportCard" && next.supportCardLb === undefined)
                        next.supportCardLb = 4;
                    if (patch.property !== undefined)
                        next.statValue = defaultStatValueForProperty(patch.property);
                    return next;
                }),
            };
        }));

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDesc(d => !d);
        else { setSortKey(key); setSortDesc(true); }
    };

    const SortArrow = ({ col }: { col: SortKey }) =>
        sortKey === col ? <span className="exp-sort-arrow">{sortDesc ? "v" : "^"}</span> : null;

    const showTeamsColumn = !hasCharFilter;

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
                {showTeamsColumn && <td className="exp-td exp-td--r">{row.teams}</td>}
                <td className="exp-td exp-td--r">
                    {row.wins}
                    {row.entries > 0 && <span className="exp-wins-pct"> ({row.awPct}%)</span>}
                </td>
            </tr>
        );
    };

    return (
        <div className="exp-container">
            <div className="exp-panel">
                <div className="exp-panel-header">
                    <span className="exp-panel-note">Filter teams by your own criteria.</span>
                    <span className="exp-filter-summary">
                        {filteredTeams.toLocaleString()} / {totalTeams.toLocaleString()} teams
                        {" | "}{filteredTeamWins.toLocaleString()} wins
                        {" | "}
                        <span className={`exp-filter-winpct${isLowTeamWinRate ? " exp-filter-winpct--low" : ""}`}>
                            {filteredTeamWinPct}% team win rate
                        </span>
                        {characterFeatures.length > 0 && (
                            <>{` | ${filteredHorses.length.toLocaleString()} entries`}</>
                        )}
                    </span>
                </div>

                <div className="exp-subsection">
                    <div className="exp-feature-list">
                        {characterFeatures.map(feature => (
                            <div key={feature.id} className="exp-feature-card">
                                <div className="exp-feature-header">
                                    <span className="exp-feature-label">Character</span>
                                    <CharaSelect variants={cardVariants} value={feature.cardId} onChange={cardId => updateCharacterFeature(feature.id, { cardId })} />
                                    <span className="exp-as-label">as</span>
                                    <select
                                        className="exp-select"
                                        value={feature.cardStrategy ?? ""}
                                        onChange={e => updateCharacterFeature(feature.id, { cardStrategy: e.target.value === "" ? null : Number(e.target.value) })}
                                    >
                                        <option value="">any strategy</option>
                                        {STRATEGIES.map(s => (
                                            <option key={s} value={s}>{STRATEGY_NAMES[s] ?? `Strategy ${s}`}</option>
                                        ))}
                                    </select>
                                    <button className="exp-remove-btn" onClick={() => removeCharacterFeature(feature.id)}>x</button>
                                </div>

                                <div className="exp-feature-reqs">
                                    {feature.requirements.map(req => (
                                        <div key={req.id} className="exp-condition-row exp-condition-row--feature">
                                            <span className="exp-with-label">requires</span>
                                            <select
                                                className="exp-select"
                                                value={req.property}
                                                onChange={e => updateCharacterRequirement(feature.id, req.id, { property: e.target.value as FilterProperty })}
                                            >
                                                {(Object.keys(PROPERTY_LABELS) as FilterProperty[]).map(k => (
                                                    <option key={k} value={k}>{PROPERTY_LABELS[k]}</option>
                                                ))}
                                            </select>

                                            {req.property !== "none" && req.property !== "skill" && req.property !== "supportCard" && (
                                                <>
                                                    <div className="exp-toggle">
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === ">" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: ">" })}
                                                        >
                                                            {">"}
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === "=" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: "=" })}
                                                        >
                                                            =
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${req.statOp === "<" ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { statOp: "<" })}
                                                        >
                                                            &lt;
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="exp-stat-input"
                                                        value={req.statValue}
                                                        min={0}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { statValue: Number(e.target.value) })}
                                                    />
                                                </>
                                            )}

                                            {req.property === "supportCard" && (
                                                <>
                                                    <div className="exp-toggle">
                                                        <button
                                                            className={`exp-toggle-btn${req.supportCardPresent ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { supportCardPresent: true })}
                                                        >
                                                            used
                                                        </button>
                                                        <button
                                                            className={`exp-toggle-btn${!req.supportCardPresent ? " active" : ""}`}
                                                            onClick={() => updateCharacterRequirement(feature.id, req.id, { supportCardPresent: false })}
                                                        >
                                                            not used
                                                        </button>
                                                    </div>
                                                    <SupportCardSelect
                                                        variants={supportCardVariants}
                                                        value={req.supportCardId}
                                                        onChange={supportCardId => updateCharacterRequirement(feature.id, req.id, { supportCardId })}
                                                    />
                                                    <select
                                                        className="exp-select"
                                                        value={req.supportCardLb}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { supportCardLb: Number(e.target.value) })}
                                                    >
                                                        {SUPPORT_CARD_LB_OPTIONS.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </>
                                            )}

                                            {req.property === "skill" && (
                                                <>
                                                    <select
                                                        className="exp-select exp-select--wide"
                                                        value={req.skillMode}
                                                        onChange={e => updateCharacterRequirement(feature.id, req.id, { skillMode: e.target.value as SkillFilterMode })}
                                                    >
                                                        <option value="learned">learned</option>
                                                        <option value="notLearned">not learned</option>
                                                        <option value="activated">activated</option>
                                                        <option value="notActivated">not activated</option>
                                                    </select>
                                                    <SkillSelect variants={skillVariants} value={req.skillId} onChange={skillId => updateCharacterRequirement(feature.id, req.id, { skillId })} />
                                                </>
                                            )}

                                            <button className="exp-remove-btn" onClick={() => removeCharacterRequirement(feature.id, req.id)}>x</button>
                                        </div>
                                    ))}
                                </div>
                                <button className="exp-add-btn" onClick={() => addCharacterRequirement(feature.id)}>+ Add requirement</button>
                            </div>
                        ))}
                    </div>
                    <button className="exp-add-btn" onClick={addCharacterFeature}>+ Add character filter</button>
                </div>
            </div>

            <div className="exp-panel exp-panel--results">
                {rows.length === 0 ? (
                    <div className="exp-empty">No teams match the current filter.</div>
                ) : (
                    <table className="exp-table">
                        <thead>
                            <tr>
                                <th className="exp-th" onClick={() => handleSort("label")}>
                                    {hasCharFilter ? "Character / Style" : "Style"} <SortArrow col="label" />
                                </th>
                                <th className="exp-th exp-th--r" onClick={() => handleSort("entries")} title="Total horse-race appearances">
                                    Entries <SortArrow col="entries" />
                                </th>
                                {showTeamsColumn && (
                                    <th className="exp-th exp-th--r" onClick={() => handleSort("teams")} title="Distinct teams that ran this strategy">
                                        Teams <SortArrow col="teams" />
                                    </th>
                                )}
                                <th className="exp-th exp-th--r" onClick={() => handleSort("wins")} title="1st place finishes">
                                    Wins <SortArrow col="wins" />
                                </th>
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
