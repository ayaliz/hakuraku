import { STRATEGY_DISPLAY_ORDER, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import type { BuildDetailFilter, Card, Pair, Requirement, TeamMatcher } from "./types";

export type FilterOption = {
    key: string;
    matcher: TeamMatcher;
    cardId: number;
    charaId: number;
    name: string;
    detail: string;
    search: string;
    style: number;
    popularity: number;
};

function hasMatcher(value: TeamMatcher): boolean {
    return value.card !== undefined || value.chara !== undefined || value.style !== undefined;
}

export function matcherKey(value: TeamMatcher): string | null {
    if (value.card !== undefined && value.style !== undefined) return `${value.card}_${value.style}`;
    if (value.card !== undefined) return `card_${value.card}_any`;
    if (value.chara !== undefined && value.style !== undefined) return `chara_${value.chara}_${value.style}`;
    if (value.chara !== undefined) return `chara_${value.chara}_any`;
    if (value.style !== undefined) return `style_${value.style}`;
    return null;
}

export function matchersFromRequirement(value: Requirement): TeamMatcher[] {
    if (value.anyOf?.length) return value.anyOf;
    const matcher = { card: value.card, chara: value.chara, style: value.style };
    return hasMatcher(matcher) ? [matcher] : [];
}

export function requirementFromMatchers(values: TeamMatcher[], exclude = false, details: BuildDetailFilter[] = []): Requirement {
    const base = values.length > 1 ? { anyOf: values } : values[0] ?? {};
    return { ...base, ...(exclude && values.length ? { exclude: true } : {}), ...(details.length ? { details } : {}) };
}

export function legacyFilterOption(value: TeamMatcher, cards: Record<number, Card>): FilterOption | undefined {
    const cardId = value.card ?? Number(Object.keys(cards).find((id) => cards[Number(id)].chara === value.chara) ?? 0);
    const card = cards[cardId];
    if (!card && value.style === undefined) return undefined;
    const name = card?.name ?? "Any Uma";
    const detail = value.card !== undefined
        ? "Any style"
        : value.chara !== undefined && value.style !== undefined
            ? `${STRATEGY_NAMES[value.style]} · any outfit`
            : value.chara !== undefined
                ? "Any outfit / style"
                : STRATEGY_NAMES[value.style!];
    return {
        key: matcherKey(value) ?? "legacy",
        matcher: value,
        cardId,
        charaId: value.chara ?? card?.chara ?? 0,
        name,
        detail,
        search: "",
        style: value.style ?? 0,
        popularity: 0,
    };
}

export function buildPerformerFilterOptions(pairs: Pair[]): FilterOption[] {
    const orderedPairs = [...pairs].sort((a, b) => b.teamExposures - a.teamExposures || a.name.localeCompare(b.name) || a.card - b.card || a.style - b.style);
    const styles: FilterOption[] = STRATEGY_DISPLAY_ORDER.map((style) => ({
        key: `style_${style}`,
        matcher: { style },
        cardId: 0,
        charaId: 0,
        name: "Any Uma",
        detail: STRATEGY_NAMES[style],
        search: `any character ${STRATEGY_NAMES[style]}`.toLowerCase(),
        style,
        popularity: Number.MAX_SAFE_INTEGER,
    }));
    const pairsByCard = new Map<number, Pair[]>();
    for (const pair of orderedPairs) {
        const cardPairs = pairsByCard.get(pair.card) ?? [];
        cardPairs.push(pair);
        pairsByCard.set(pair.card, cardPairs);
    }
    const costumes = [...pairsByCard.values()].flatMap((cardPairs) => {
        const representative = cardPairs[0];
        const anyStyle: FilterOption = {
            key: `card_${representative.card}_any`,
            matcher: { card: representative.card, chara: representative.chara },
            cardId: representative.card,
            charaId: representative.chara,
            name: representative.name,
            detail: "Any style",
            search: `${representative.name} ${representative.outfit} any style`.toLowerCase(),
            style: 0,
            popularity: cardPairs.reduce((total, pair) => total + pair.teamExposures, 0),
        };
        const exact = cardPairs.map((pair): FilterOption => ({
            key: `${pair.card}_${pair.style}`,
            matcher: { card: pair.card, chara: pair.chara, style: pair.style },
            cardId: pair.card,
            charaId: pair.chara,
            name: pair.name,
            detail: STRATEGY_NAMES[pair.style],
            search: `${pair.name} ${pair.outfit} ${STRATEGY_NAMES[pair.style]}`.toLowerCase(),
            style: pair.style,
            popularity: pair.teamExposures,
        }));
        return [anyStyle, ...exact];
    });
    return [...styles, ...costumes];
}
