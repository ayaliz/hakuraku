import type { HorseEntry } from "../MultiRacePage/types";
import { STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { getHorseDeckRaceBonus } from "./deckUtils";

export type FilterProperty =
    | "none"
    | "speed"
    | "stamina"
    | "pow"
    | "guts"
    | "wiz"
    | "aptGround"
    | "aptDistance"
    | "aptStyle"
    | "totalSkillPoints"
    | "rankScore"
    | "careerWinCount"
    | "deckRaceBonus"
    | "skill"
    | "supportCard";
export type StatOp = ">" | "<" | "=";
export type SortKey = "label" | "entries" | "teams" | "wins" | "teamWins" | "awPct";
export type SkillFilterMode = "learned" | "activated";
export type CharacterMatchMode = "is" | "isNot";
export type FeatureCardMode = "include" | "exclude";
export type RequirementTruthMode = "require" | "requireNot";

export interface CharacterRequirement {
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

export interface CharacterFeature {
    id: string;
    characterMatchMode: CharacterMatchMode;
    cardMode: FeatureCardMode;
    cardId: number | null;
    cardStrategy: number | null;
    requirements: CharacterRequirement[];
}

export interface AggRow {
    key: string;
    label: string;
    sublabel?: string;
    charaId?: number;
    cardId?: number;
    strategy?: number;
    entries: number;
    teams: number;
    wins: number;
    teamWins: number;
    awPct: number;
    teamWinPct: number;
}

export interface CharaVariant {
    cardId: number;
    charaId: number;
    charaName: string;
    cardName: string;
    count: number;
}

export interface SkillVariant {
    skillId: number;
    skillName: string;
    isInherit: boolean;
    count: number;
}

export interface SupportCardVariant {
    supportCardId: number;
    name: string;
    count: number;
}

export interface ExplorerDrilldownEntry {
    horse: HorseEntry;
    bayesianWinRate: number;
    winRate: number;
    appearances: number;
}

export interface ExplorerBootstrapPayload {
    totalTeams: number;
    cardVariants: CharaVariant[];
    skillVariants: SkillVariant[];
    supportCardVariants: SupportCardVariant[];
}

export interface ExplorerQueryPayload {
    totalTeams: number;
    filteredTeams: number;
    filteredTeamWins: number;
    filteredTeamWinPct: number;
    filteredEntries: number;
    hasCharacterFilter: boolean;
    rows: AggRow[];
    drilldown: ExplorerDrilldownEntry[];
}

export const SUPPORT_CARD_LB_ANY = -1;

type PropertyFilter = Pick<CharacterRequirement, "property" | "statOp" | "statValue" | "skillId" | "skillMode" | "supportCardId" | "supportCardPresent" | "supportCardLb">;

function resolveSkillName(skillId: number): string {
    return UMDatabaseWrapper.skills[skillId]?.name ?? `Unknown Skill ${skillId}`;
}

export function computeSkillPoints(learnedSkillIds: Set<number>): number {
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

export function buildTeamMap(horses: HorseEntry[]): Map<string, HorseEntry[]> {
    const map = new Map<string, HorseEntry[]>();
    for (const horse of horses) {
        if (horse.teamId <= 0) continue;
        const key = `${horse.raceId}|${horse.teamId}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(horse);
    }
    return map;
}

function matchStatProperty(filter: PropertyFilter, horse: HorseEntry): boolean {
    if (filter.property === "none") return true;
    const value = filter.property === "totalSkillPoints"
        ? computeSkillPoints(horse.learnedSkillIds)
        : filter.property === "deckRaceBonus"
            ? getHorseDeckRaceBonus(horse)
            : horse[filter.property as Exclude<FilterProperty, "none" | "skill" | "totalSkillPoints" | "deckRaceBonus" | "supportCard">] as number;
    if (value == null) return false;
    if (filter.statOp === ">") return value > filter.statValue;
    if (filter.statOp === "<") return value < filter.statValue;
    return value === filter.statValue;
}

function matchesFeatureCharacter(feature: CharacterFeature, horse: HorseEntry): boolean {
    const matchesCard = feature.cardId === 0
        ? true
        : feature.characterMatchMode === "is"
            ? horse.cardId === feature.cardId
            : horse.cardId !== feature.cardId;
    return matchesCard && (feature.cardStrategy === null || horse.strategy === feature.cardStrategy);
}

function matchesPropertyFilter(filter: PropertyFilter, horse: HorseEntry): boolean {
    if (filter.property === "skill") {
        if (filter.skillId === null) return false;
        return filter.skillMode === "learned"
            ? horse.learnedSkillIds.has(filter.skillId)
            : horse.activatedSkillIds.has(filter.skillId);
    }
    if (filter.property === "supportCard") {
        if (filter.supportCardId === null) return false;
        const hasCard = horse.supportCardIds.some((id, index) =>
            id === filter.supportCardId &&
            (filter.supportCardLb === SUPPORT_CARD_LB_ANY || (horse.supportCardLimitBreaks[index] ?? 0) === filter.supportCardLb)
        );
        return filter.supportCardPresent ? hasCard : !hasCard;
    }
    return matchStatProperty(filter, horse);
}

function matchesRequirement(requirement: CharacterRequirement, horse: HorseEntry): boolean {
    const result = matchesPropertyFilter(requirement, horse);
    return requirement.truthMode === "require" ? result : !result;
}

export function matchesCharacterFeaturePredicate(feature: CharacterFeature, horse: HorseEntry): boolean {
    const positiveMatch = matchesFeatureCharacter(feature, horse) &&
        feature.requirements.every((requirement) => matchesRequirement(requirement, horse));
    return feature.cardMode === "include" ? positiveMatch : !positiveMatch;
}

export function sanitizeCharacterRequirement(requirement: CharacterRequirement): CharacterRequirement | null {
    if (requirement.property === "none") return null;
    return requirement;
}

export function sanitizeCharacterFeature(feature: CharacterFeature): CharacterFeature {
    return {
        ...feature,
        requirements: feature.requirements
            .map(sanitizeCharacterRequirement)
            .filter((requirement): requirement is CharacterRequirement => requirement !== null),
    };
}

export function sanitizeCharacterFeatures(features: CharacterFeature[]): CharacterFeature[] {
    return features.map(sanitizeCharacterFeature);
}

export function findDistinctFeatureMatches(teammates: HorseEntry[], features: CharacterFeature[]): HorseEntry[] | null {
    if (features.length === 0) return [];
    if (features.length > teammates.length) return null;

    const candidateLists = features.map((feature, featureIndex) => ({
        featureIndex,
        candidates: teammates
            .map((teammate, teammateIndex) => ({ teammate, teammateIndex }))
            .filter(({ teammate }) => matchesCharacterFeaturePredicate(feature, teammate)),
    }));

    if (candidateLists.some((entry) => entry.candidates.length === 0)) return null;

    candidateLists.sort((a, b) => a.candidates.length - b.candidates.length);
    const assigned = new Array<HorseEntry | null>(features.length).fill(null);
    const usedTeammates = new Set<number>();

    const search = (index: number): boolean => {
        if (index >= candidateLists.length) return true;
        const { featureIndex, candidates } = candidateLists[index];
        for (const { teammate, teammateIndex } of candidates) {
            if (usedTeammates.has(teammateIndex)) continue;
            usedTeammates.add(teammateIndex);
            assigned[featureIndex] = teammate;
            if (search(index + 1)) return true;
            assigned[featureIndex] = null;
            usedTeammates.delete(teammateIndex);
        }
        return false;
    };

    return search(0) ? assigned.filter((teammate): teammate is HorseEntry => teammate !== null) : null;
}

export function defaultStatValueForProperty(property: FilterProperty): number {
    switch (property) {
        case "speed":
        case "stamina":
        case "pow":
        case "guts":
        case "wiz":
            return 1200;
        case "aptGround":
        case "aptDistance":
        case "aptStyle":
            return 8;
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

export function aggregateHorses(
    horses: HorseEntry[],
    mode: "strategy" | "card-strategy",
    sortKey: SortKey,
    sortDesc: boolean,
): AggRow[] {
    const groups = new Map<string, {
        label: string;
        sublabel?: string;
        charaId?: number;
        cardId?: number;
        strategy?: number;
        entries: number;
        teams: Set<string>;
        winningTeams: Set<string>;
        wins: number;
    }>();

    for (const horse of horses) {
        const key = mode === "card-strategy"
            ? `cd${horse.cardId}_s${horse.strategy}`
            : `s${horse.strategy}`;

        if (!groups.has(key)) {
            if (mode === "card-strategy") {
                const cardName = UMDatabaseWrapper.cards[horse.cardId]?.name ?? horse.charaName;
                const label = cardName === horse.charaName ? horse.charaName : `${horse.charaName} ${cardName}`;
                const stratName = STRATEGY_NAMES[horse.strategy] ?? `Strategy ${horse.strategy}`;
                groups.set(key, {
                    label,
                    sublabel: stratName,
                    charaId: horse.charaId,
                    cardId: horse.cardId,
                    strategy: horse.strategy,
                    entries: 0,
                    teams: new Set(),
                    winningTeams: new Set(),
                    wins: 0,
                });
            } else {
                groups.set(key, {
                    label: STRATEGY_NAMES[horse.strategy] ?? `Strategy ${horse.strategy}`,
                    strategy: horse.strategy,
                    entries: 0,
                    teams: new Set(),
                    winningTeams: new Set(),
                    wins: 0,
                });
            }
        }

        const group = groups.get(key)!;
        const teamKey = `${horse.raceId}|${horse.teamId}`;
        group.entries += 1;
        group.teams.add(teamKey);
        if (horse.finishOrder === 1) group.wins += 1;
        if (horse.finishOrder === 1) group.winningTeams.add(teamKey);
    }

    const result: AggRow[] = Array.from(groups.values()).map((group) => ({
        key: group.cardId !== undefined ? `cd${group.cardId}_s${group.strategy}` : `s${group.strategy}`,
        label: group.label,
        sublabel: group.sublabel,
        charaId: group.charaId,
        cardId: group.cardId,
        strategy: group.strategy,
        entries: group.entries,
        teams: group.teams.size,
        wins: group.wins,
        teamWins: group.winningTeams.size,
        awPct: group.entries > 0 ? (100 * group.wins) / group.entries : 0,
        teamWinPct: group.teams.size > 0 ? (100 * group.winningTeams.size) / group.teams.size : 0,
    }));

    result.sort((a, b) => {
        if (sortKey === "wins") {
            if (a.awPct !== b.awPct) return sortDesc ? b.awPct - a.awPct : a.awPct - b.awPct;
            if (a.wins !== b.wins) return sortDesc ? b.wins - a.wins : a.wins - b.wins;
            return sortDesc ? b.entries - a.entries : a.entries - b.entries;
        }
        if (sortKey === "teamWins") {
            if (a.teamWinPct !== b.teamWinPct) return sortDesc ? b.teamWinPct - a.teamWinPct : a.teamWinPct - b.teamWinPct;
            if (a.teamWins !== b.teamWins) return sortDesc ? b.teamWins - a.teamWins : a.teamWins - b.teamWins;
            return sortDesc ? b.teams - a.teams : a.teams - b.teams;
        }
        const va = a[sortKey];
        const vb = b[sortKey];
        if (typeof va === "string" && typeof vb === "string") {
            return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
        }
        return sortDesc ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
}

export function buildCardVariants(horses: HorseEntry[]): CharaVariant[] {
    const map = new Map<number, CharaVariant>();
    for (const horse of horses) {
        if (horse.teamId <= 0) continue;
        if (!map.has(horse.cardId)) {
            map.set(horse.cardId, {
                cardId: horse.cardId,
                charaId: horse.charaId,
                charaName: horse.charaName,
                cardName: UMDatabaseWrapper.cards[horse.cardId]?.name ?? horse.charaName,
                count: 0,
            });
        }
        map.get(horse.cardId)!.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function buildSkillVariants(horses: HorseEntry[]): SkillVariant[] {
    const map = new Map<number, number>();
    for (const horse of horses) {
        if (horse.teamId <= 0) continue;
        for (const skillId of horse.learnedSkillIds) {
            map.set(skillId, (map.get(skillId) ?? 0) + 1);
        }
    }
    return Array.from(map.entries())
        .map(([skillId, count]) => ({
            skillId,
            skillName: resolveSkillName(skillId),
            isInherit: skillId >= 900000 && skillId < 1000000,
            count,
        }))
        .sort((a, b) => b.count - a.count);
}

export function buildSupportCardVariants(horses: HorseEntry[]): SupportCardVariant[] {
    const map = new Map<number, number>();
    for (const horse of horses) {
        if (horse.teamId <= 0) continue;
        for (const id of horse.supportCardIds) {
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
}

export function buildExplorerBootstrap(horses: HorseEntry[]): ExplorerBootstrapPayload {
    return {
        totalTeams: buildTeamMap(horses).size,
        cardVariants: buildCardVariants(horses),
        skillVariants: buildSkillVariants(horses),
        supportCardVariants: buildSupportCardVariants(horses),
    };
}

export function buildExplorerDrilldown(horses: HorseEntry[], selection: AggRow | null): ExplorerDrilldownEntry[] {
    if (!selection || selection.cardId === undefined || selection.strategy === undefined) return [];
    const filtered = horses.filter(
        (horse) => horse.cardId === selection.cardId && horse.strategy === selection.strategy && horse.rankScore > 0,
    );

    const buildMap = new Map<string, { rep: HorseEntry; wins: number; appearances: number }>();
    for (const horse of filtered) {
        const key = `${horse.rankScore}_${horse.speed}_${horse.stamina}_${horse.pow}_${horse.guts}_${horse.wiz}`;
        if (!buildMap.has(key)) {
            buildMap.set(key, { rep: horse, wins: 0, appearances: 0 });
        }
        const entry = buildMap.get(key)!;
        entry.appearances += 1;
        if (horse.finishOrder === 1) entry.wins += 1;
    }

    const prior = 1 / 9;
    const k = 54;
    return Array.from(buildMap.values())
        .map(({ rep, wins, appearances }) => ({
            horse: rep,
            bayesianWinRate: (wins + k * prior) / (appearances + k),
            winRate: wins / appearances,
            appearances,
        }))
        .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
        .slice(0, 6);
}

export function runExplorerQuery(
    horses: HorseEntry[],
    characterFeatures: CharacterFeature[],
    sortKey: SortKey,
    sortDesc: boolean,
    selectedRowKey: string | null,
): ExplorerQueryPayload {
    const teamMap = buildTeamMap(horses);
    const hasCharacterFilter = characterFeatures.length > 0;
    const displayHorses: HorseEntry[] = [];
    let filteredTeams = 0;
    let filteredEntries = 0;
    let filteredTeamWins = 0;

    for (const teammates of teamMap.values()) {
        const matchedCharacterHorses = hasCharacterFilter
            ? findDistinctFeatureMatches(teammates, characterFeatures)
            : [];
        if (hasCharacterFilter && matchedCharacterHorses === null) continue;

        filteredTeams += 1;
        let teamWon = false;

        for (const horse of teammates) {
            if (horse.teamId <= 0) continue;
            filteredEntries += 1;
            if (horse.finishOrder === 1) teamWon = true;
            if (!hasCharacterFilter) displayHorses.push(horse);
        }

        if (teamWon) filteredTeamWins += 1;

        if (hasCharacterFilter && matchedCharacterHorses) {
            for (const horse of matchedCharacterHorses) {
                if (horse.teamId > 0) displayHorses.push(horse);
            }
        }
    }

    const rows = aggregateHorses(displayHorses, hasCharacterFilter ? "card-strategy" : "strategy", sortKey, sortDesc);
    const selectedRow = rows.find((row) => row.key === selectedRowKey && row.cardId !== undefined && row.strategy !== undefined) ?? null;

    return {
        totalTeams: teamMap.size,
        filteredTeams,
        filteredTeamWins,
        filteredTeamWinPct: filteredTeams > 0 ? (100 * filteredTeamWins) / filteredTeams : 0,
        filteredEntries,
        hasCharacterFilter,
        rows,
        drilldown: buildExplorerDrilldown(horses, selectedRow),
    };
}
