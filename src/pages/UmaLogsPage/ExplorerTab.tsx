import React, { useState, useMemo, useRef, useEffect } from "react";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import { STRATEGY_NAMES, STRATEGY_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import { TeamMemberCard } from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import AssetLoader from "../../data/AssetLoader";
import { getHorseDeckRaceBonus } from "./deckUtils";
import "./UmaLogsPage.css";

type FilterProperty = "none" | "speed" | "stamina" | "pow" | "guts" | "wiz" | "totalSkillPoints" | "rankScore" | "careerWinCount" | "deckRaceBonus" | "skill" | "supportCard";
type StatOp = ">" | "<" | "=";
type SortKey = "label" | "entries" | "teams" | "wins" | "awPct";
type SkillFilterMode = "learned" | "activated";
type CharacterMatchMode = "is" | "isNot";
type FeatureCardMode = "include" | "exclude";
type RequirementTruthMode = "require" | "requireNot";

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
    truthMode: RequirementTruthMode;
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
    characterMatchMode: CharacterMatchMode;
    cardMode: FeatureCardMode;
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
    skillStats?: Map<number, SkillStats>;
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

function formatPercent(value: number): string {
    return value.toFixed(1);
}

const SUPPORT_CARD_LB_ANY = -1;

const SUPPORT_CARD_LB_OPTIONS = [
    { value: SUPPORT_CARD_LB_ANY, label: "Any" },
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

const ExplorerInfoIcon = ({ id, tip }: { id: string; tip: React.ReactNode }) => (
    <InfoTooltip
        id={id}
        tip={tip}
        className="exp-info-icon"
        placement="bottom"
        ariaLabel="Explain filter behavior"
    />
);

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
    const matchesCard = feature.cardId === 0
        ? true
        : feature.characterMatchMode === "is"
            ? h.cardId === feature.cardId
            : h.cardId !== feature.cardId;

    return matchesCard &&
        (feature.cardStrategy === null || h.strategy === feature.cardStrategy);
}

function matchesCharacterFeaturePredicate(feature: CharacterFeature, h: HorseEntry): boolean {
    const positiveMatch = matchesFeatureCharacter(feature, h) &&
        feature.requirements.every(req => matchesRequirement(req, h));
    return feature.cardMode === "include" ? positiveMatch : !positiveMatch;
}

function findDistinctFeatureMatches(
    teammates: HorseEntry[],
    features: CharacterFeature[],
): HorseEntry[] | null {
    if (features.length === 0) return [];
    if (features.length > teammates.length) return null;

    const candidateLists = features.map((feature, featureIndex) => ({
        featureIndex,
        candidates: teammates
            .map((teammate, teammateIndex) => ({ teammate, teammateIndex }))
            .filter(({ teammate }) => matchesCharacterFeaturePredicate(feature, teammate)),
    }));

    if (candidateLists.some(entry => entry.candidates.length === 0)) return null;

    candidateLists.sort((a, b) => a.candidates.length - b.candidates.length);
    const assigned = new Array<HorseEntry | null>(features.length).fill(null);
    const usedTeammates = new Set<number>();

    const search = (idx: number): boolean => {
        if (idx >= candidateLists.length) return true;
        const { featureIndex, candidates } = candidateLists[idx];
        for (const { teammate, teammateIndex } of candidates) {
            if (usedTeammates.has(teammateIndex)) continue;
            usedTeammates.add(teammateIndex);
            assigned[featureIndex] = teammate;
            if (search(idx + 1)) return true;
            assigned[featureIndex] = null;
            usedTeammates.delete(teammateIndex);
        }
        return false;
    };

    return search(0) ? assigned.filter((teammate): teammate is HorseEntry => teammate !== null) : null;
}

function matchesPropertyFilter(filter: PropertyFilter, h: HorseEntry): boolean {
    if (filter.property === "skill") {
        if (filter.skillId === null) return false;
        if (filter.skillMode === "learned") return h.learnedSkillIds.has(filter.skillId);
        return h.activatedSkillIds.has(filter.skillId);
    }
    if (filter.property === "supportCard") {
        if (filter.supportCardId === null) return false;
        const hasCard = h.supportCardIds.some((id, index) =>
            id === filter.supportCardId &&
            (filter.supportCardLb === SUPPORT_CARD_LB_ANY || (h.supportCardLimitBreaks[index] ?? 0) === filter.supportCardLb)
        );
        return filter.supportCardPresent ? hasCard : !hasCard;
    }
    return matchStatProperty(filter, h);
}

function matchesRequirement(requirement: CharacterRequirement, h: HorseEntry): boolean {
    const result = matchesPropertyFilter(requirement, h);
    return requirement.truthMode === "require" ? result : !result;
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
        awPct: g.entries > 0 ? (100 * g.wins) / g.entries : 0,
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

const ExplorerTab: React.FC<ExplorerTabProps> = ({ allHorses, skillStats, strategyColors }) => {
    const [characterFeatures, setCharacterFeatures] = useState<CharacterFeature[]>([]);
    const [sortKey, setSortKey] = useState<SortKey>("entries");
    const [sortDesc, setSortDesc] = useState(true);
    const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

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
                skillName: UMDatabaseWrapper.skillNameWithEnglishFallback(skillId),
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
        truthMode: "require",
        property: "none",
        statOp: ">",
        statValue: defaultStatValueForProperty("none"),
        skillId: skillVariants[0]?.skillId ?? null,
        skillMode: "learned",
        supportCardId: supportCardVariants[0]?.supportCardId ?? null,
        supportCardPresent: true,
        supportCardLb: SUPPORT_CARD_LB_ANY,
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
            const matchedCharacterHorses = findDistinctFeatureMatches(teammates, characterFeatures);
            if (!matchedCharacterHorses) continue;
            results.push({ teamKey, teammates, matchedCharacterHorses });
        }
        return results;
    }, [characterFeatures, teamMap]);

    const filteredHorses = useMemo(() => {
        if (characterFeatures.length === 0) return playerHorses;
        const qualifyingKeys = new Set(filteredTeamResults.map(r => r.teamKey));
        return playerHorses.filter(h => qualifyingKeys.has(`${h.raceId}|${h.teamId}`));
    }, [characterFeatures.length, filteredTeamResults, playerHorses]);

    const hasCharacterFilter = characterFeatures.length > 0;

    const displayHorses = useMemo(() => {
        if (hasCharacterFilter) {
            return filteredTeamResults.flatMap(result => result.matchedCharacterHorses.filter(h => h.teamId > 0));
        }
        return filteredHorses;
    }, [filteredHorses, filteredTeamResults, hasCharacterFilter]);

    const aggMode = hasCharacterFilter ? "card-strategy" : "strategy";
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
    const filteredTeamWinPct = filteredTeams > 0 ? (100 * filteredTeamWins) / filteredTeams : 0;
    const isLowTeamWinRate = filteredTeams > 0 && filteredTeamWins * 3 < filteredTeams;


    const addCharacterFeature = () => setCharacterFeatures(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        characterMatchMode: "is",
        cardMode: "include",
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
                    if (patch.property === "supportCard")
                        next.supportCardLb = next.supportCardLb ?? SUPPORT_CARD_LB_ANY;
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

    const showTeamsColumn = !hasCharacterFilter;
    const drilldownColSpan = 3 + (showTeamsColumn ? 1 : 0);
    const selectedRow = useMemo(
        () => rows.find(row => row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined) ?? null,
        [rows, selectedRowKey]
    );

    useEffect(() => {
        if (selectedRowKey && !rows.some(row => row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined)) {
            setSelectedRowKey(null);
        }
    }, [rows, selectedRowKey]);

    const buildDrilldown = (selection: AggRow | null) => {
        if (!selection || selection.cardId === undefined || selection.strategy === undefined) return [];
        const filtered = allHorses.filter(
            h => h.cardId === selection.cardId && h.strategy === selection.strategy && h.rankScore > 0
        );

        const buildMap = new Map<string, { rep: HorseEntry; wins: number; appearances: number }>();
        for (const h of filtered) {
            const key = `${h.rankScore}_${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}`;
            if (!buildMap.has(key)) {
                buildMap.set(key, { rep: h, wins: 0, appearances: 0 });
            }
            const entry = buildMap.get(key)!;
            entry.appearances++;
            if (h.finishOrder === 1) entry.wins++;
        }

        const PRIOR = 1 / 9;
        const K = 54;
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

    const drilldownHorses = useMemo(() => buildDrilldown(selectedRow), [selectedRow, allHorses]);
    const canDrilldown = !!skillStats;

    const renderRow = (row: AggRow) => {
        const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
        const stratColor = row.strategy !== undefined
            ? (activeStrategyColors[row.strategy] ?? "#718096")
            : undefined;
        const rowCanDrilldown = canDrilldown && row.cardId !== undefined && row.strategy !== undefined;
        const isSelected = rowCanDrilldown && selectedRowKey === row.key;
        const iconUrl = row.charaId !== undefined && row.cardId !== undefined
            ? getCharaIcon(`${row.charaId}_${row.cardId}`)
            : null;
        return (
            <React.Fragment key={row.key}>
                <tr
                    className={`exp-row${rowCanDrilldown ? " exp-row--clickable" : ""}${isSelected ? " exp-row--selected" : ""}`}
                    onClick={rowCanDrilldown ? () => setSelectedRowKey(current => current === row.key ? null : row.key) : undefined}
                >
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
                        {row.entries > 0 && <span className="exp-wins-pct"> ({formatPercent(row.awPct)}%)</span>}
                    </td>
                </tr>
                {isSelected && selectedRow && drilldownHorses.length > 0 && (
                    <tr className="exp-drilldown-row">
                        <td className="exp-drilldown-cell" colSpan={drilldownColSpan}>
                            <div className="stcp-drilldown">
                                <div className="stcp-drilldown-header">
                                    <div className="stcp-drilldown-title">
                                        Top performers for {selectedRow.label} ({STRATEGY_NAMES[selectedRow.strategy!]})
                                    </div>
                                    <div className="stcp-drilldown-subtitle">
                                        Unique umas ranked by Bayesian-adjusted win rate across all appearances.
                                    </div>
                                </div>
                                <div className="stcp-team-members-row">
                                    {drilldownHorses.map(({ horse, bayesianWinRate, winRate, appearances }, i) => (
                                        <div key={i} className="sa-reps-drilldown-card">
                                            <div className="sa-reps-drilldown-winrate">
                                                <span className="sa-adj-pct">{(bayesianWinRate * 100).toFixed(0)}%</span>
                                                <span className="sa-pipe"> | </span>
                                                <span className="sa-raw-pct">{(winRate * 100).toFixed(0)}% ({appearances})</span>
                                            </div>
                                            <TeamMemberCard horse={horse} skillStats={skillStats!} strategyColors={activeStrategyColors} allHorses={allHorses} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
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
                            {formatPercent(filteredTeamWinPct)}% team win rate
                        </span>
                        {hasCharacterFilter && (
                            <>{` | ${filteredHorses.length.toLocaleString()} entries`}</>
                        )}
                    </span>
                </div>

                <div className="exp-subsection">
                    <div className="exp-subsection-header">
                        <span className="exp-subsection-title">Your Team</span>
                        <span className="exp-subsection-note">
                            Each card matches a different uma on your team.
                            <ExplorerInfoIcon
                                id="explorer-filter-types-tooltip"
                                tip={
                                    <div className="exp-tooltip-copy">
                                        <div><strong>is / is not</strong>: controls whether the matched uma can be the selected character.</div>
                                        <div><strong>Include / Exclude</strong>: controls whether this full card definition must be present or absent on the team.</div>
                                        <div>Different included cards must be fulfilled by different umas on the same team.</div>
                                    </div>
                                }
                            />
                        </span>
                    </div>
                    <div className="exp-feature-list">
                        {characterFeatures.map(feature => (
                            <div key={feature.id} className="exp-feature-card">
                                <div className="exp-feature-header">
                                    <span className="exp-feature-label">Character</span>
                                    <div className="exp-toggle">
                                        <button
                                            className={`exp-toggle-btn${feature.characterMatchMode === "is" ? " active" : ""}`}
                                            onClick={() => updateCharacterFeature(feature.id, { characterMatchMode: "is" })}
                                        >
                                            is
                                        </button>
                                        <button
                                            className={`exp-toggle-btn${feature.characterMatchMode === "isNot" ? " active" : ""}`}
                                            onClick={() => updateCharacterFeature(feature.id, { characterMatchMode: "isNot" })}
                                        >
                                            is not
                                        </button>
                                    </div>
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
                                    <div className="exp-feature-actions">
                                        <div className="exp-toggle exp-toggle--card-mode">
                                            <button
                                                className={`exp-toggle-btn${feature.cardMode === "include" ? " active" : ""}`}
                                                onClick={() => updateCharacterFeature(feature.id, { cardMode: "include" })}
                                            >
                                                Include
                                            </button>
                                            <button
                                                className={`exp-toggle-btn${feature.cardMode === "exclude" ? " active" : ""}`}
                                                onClick={() => updateCharacterFeature(feature.id, { cardMode: "exclude" })}
                                            >
                                                Exclude
                                            </button>
                                        </div>
                                        <button className="exp-remove-btn" onClick={() => removeCharacterFeature(feature.id)}>x</button>
                                    </div>
                                </div>

                                <div className="exp-feature-reqs">
                                    {feature.requirements.map(req => (
                                        <div key={req.id} className="exp-condition-row exp-condition-row--feature">
                                            <select
                                                className="exp-select"
                                                value={req.truthMode}
                                                onChange={e => updateCharacterRequirement(feature.id, req.id, { truthMode: e.target.value as RequirementTruthMode })}
                                            >
                                                <option value="require">requires</option>
                                                <option value="requireNot">requires not</option>
                                            </select>
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
                                                        <option value="activated">activated</option>
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
                                    {hasCharacterFilter ? "Character / Style" : "Style"} <SortArrow col="label" />
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
