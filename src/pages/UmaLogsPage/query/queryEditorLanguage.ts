import { RangeSetBuilder } from "@codemirror/state";
import { startCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from "@codemirror/view";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../../MultiRacePage/components/WinDistributionCharts/constants";
import {
    getActiveQueryClause,
    getEntityCompletionContext,
    getOrderDirectionCompletionContext,
    getSkillCompletionContext,
    getValueCompletionContext,
    isEmptyCompletionTrigger,
    parseQueryClauses,
    splitQueryCommaList,
} from "./queryCompletionContext";
import {
    normalizeQueryName,
    resolveSkillEntry,
    resolveSkillToken,
    type QueryEntityEntry,
    type SkillNameEntry,
} from "./queryFriendlyNames";

type SkillNameRange = {
    from: number;
    to: number;
    entry: SkillNameEntry;
};

type TokenRange = {
    from: number;
    to: number;
    className: string;
    title?: string;
};

type StyleTokenRange = {
    from: number;
    to: number;
    styleId: number;
};

type EntityNameRange = {
    from: number;
    to: number;
    entry: QueryEntityEntry;
};

const QUERY_KEYWORD_COMPLETIONS: Completion[] = [
    { label: "select", type: "keyword", detail: "Choose output columns", apply: "select " },
    { label: "where", type: "keyword", detail: "Filter entries", apply: "where " },
    { label: "group by", type: "keyword", detail: "Aggregate by dimensions", apply: "group by " },
    { label: "having", type: "keyword", detail: "Filter aggregate rows", apply: "having " },
    { label: "order by", type: "keyword", detail: "Sort result rows", apply: "order by " },
    { label: "limit", type: "keyword", detail: "Cap returned rows", apply: "limit " },
    { label: "offset", type: "keyword", detail: "Skip result rows", apply: "offset " },
    { label: "and", type: "keyword" },
    { label: "or", type: "keyword" },
    { label: "not", type: "keyword" },
    { label: "at lb", type: "keyword", detail: "Require a support-card limit break", apply: "at lb " },
];

const QUERY_DIMENSION_COMPLETIONS: Completion[] = [
    { label: "uma", type: "variable", detail: "Specific Uma and outfit" },
    { label: "variant", type: "variable", detail: "Alias for Uma" },
    { label: "card", type: "variable", detail: "Specific Uma and outfit" },
    { label: "card_id", type: "variable", detail: "Specific Uma and outfit ID" },
    { label: "style", type: "variable", detail: "Running style" },
    { label: "strategy", type: "variable", detail: "Alias for style" },
    { label: "is_debuffer", type: "variable", detail: "Whether the build is classified as a Debuffer" },
    { label: "debuffer", type: "variable", detail: "Alias for is_debuffer" },
    { label: "chara_id", type: "variable", detail: "Base Uma identity" },
    { label: "frame_order", type: "variable" },
    { label: "finish_order", type: "variable" },
    { label: "finish_time", type: "variable" },
    { label: "race_distance", type: "variable" },
    { label: "distance", type: "variable", detail: "Alias for race_distance" },
    { label: "speed", type: "variable" },
    { label: "stamina", type: "variable" },
    { label: "power", type: "variable" },
    { label: "guts", type: "variable" },
    { label: "wit", type: "variable" },
    { label: "rank_score", type: "variable" },
    { label: "score", type: "variable", detail: "Alias for rank_score" },
    { label: "career_wins", type: "variable" },
    { label: "mood", type: "variable" },
    { label: "activation_chance", type: "variable", detail: "Logged entry activation chance scalar" },
    { label: "apt_ground", type: "variable" },
    { label: "apt_distance", type: "variable" },
    { label: "apt_style", type: "variable" },
    { label: "skill_points", type: "variable", detail: "Alias for total_skill_points" },
    { label: "total_skill_points", type: "variable" },
    { label: "deck_race_bonus", type: "variable" },
    { label: "race_type", type: "variable" },
    { label: "uma_count", type: "variable" },
    { label: "team_count", type: "variable" },
    { label: "is_player", type: "variable" },
    { label: "is_full_room", type: "variable" },
    { label: "has_replay_data", type: "variable" },
    { label: "weather", type: "variable" },
    { label: "season", type: "variable" },
    { label: "ground_condition", type: "variable" },
    { label: "room_front_count", type: "variable" },
    { label: "front_runners", type: "variable", detail: "Alias for room_front_count" },
    { label: "room_front_runner_count", type: "variable" },
    { label: "room_runaway_count", type: "variable" },
    { label: "room_runaways", type: "variable", detail: "Alias for room_runaway_count" },
    { label: "room_pace_count", type: "variable" },
    { label: "pace_count", type: "variable", detail: "Alias for room_pace_count" },
    { label: "room_late_count", type: "variable" },
    { label: "late_count", type: "variable", detail: "Alias for room_late_count" },
    { label: "room_end_count", type: "variable" },
    { label: "end_count", type: "variable", detail: "Alias for room_end_count" },
    { label: "room_debuffer_count", type: "variable" },
    { label: "winner_team_id", type: "variable" },
    { label: "winner_strategy", type: "variable" },
    { label: "winner_card_id", type: "variable" },
    { label: "winner_chara_id", type: "variable" },
    { label: "team_front_count", type: "variable" },
    { label: "team_front_runner_count", type: "variable" },
    { label: "team_runaway_count", type: "variable" },
    { label: "team_pace_count", type: "variable" },
    { label: "team_pace", type: "variable", detail: "Alias for team_pace_count" },
    { label: "team_late_count", type: "variable" },
    { label: "team_late", type: "variable", detail: "Alias for team_late_count" },
    { label: "team_end_count", type: "variable" },
    { label: "team_end", type: "variable", detail: "Alias for team_end_count" },
    { label: "is_winner_team", type: "variable" },
    { label: "team_id", type: "variable" },
    { label: "won", type: "variable" },
];

const QUERY_FILTER_COMPLETIONS: Completion[] = [
    ...QUERY_DIMENSION_COMPLETIONS,
    { label: "team", type: "property", detail: "Same-team member predicates" },
    { label: "any_team", type: "property", detail: "Any team in the race" },
    { label: "winning_team", type: "property", detail: "The race winner's team" },
    { label: "losing_team", type: "property", detail: "Any non-winning team in the race" },
    { label: "full_room", type: "property", detail: "Alias for is_full_room" },
    { label: "learned", type: "property", detail: "Learned skill IDs/names" },
    { label: "learned_skills", type: "property", detail: "Learned skill IDs/names" },
    { label: "activated", type: "property", detail: "Activated skill IDs/names" },
    { label: "activated_skills", type: "property", detail: "Activated skill IDs/names" },
    { label: "support_cards", type: "property", detail: "Support card IDs/names" },
    { label: "has_skill", type: "function", detail: "Alias for learned has Skill", apply: "has_skill()" },
    { label: "has_activated_skill", type: "function", detail: "Alias for activated has Skill", apply: "has_activated_skill()" },
    { label: "has_support_card", type: "function", detail: "Alias for support_cards has Card", apply: "has_support_card()" },
    { label: "team has member", type: "function", detail: "Filter teams with a matching member", apply: "team has member()" },
    { label: "team has all", type: "function", detail: "Filter teams with distinct matching members", apply: "team has all (member(), member())" },
    { label: "any_team has member", type: "function", detail: "Find races where any team has a matching member", apply: "any_team has member()" },
    { label: "winning_team has member", type: "function", detail: "Find races where the winning team has a matching member", apply: "winning_team has member()" },
    { label: "losing_team has member", type: "function", detail: "Find races where a losing team has a matching member", apply: "losing_team has member()" },
    { label: "member", type: "function", detail: "A same-team Uma filter", apply: "member()" },
];

const QUERY_METRIC_COMPLETIONS: Completion[] = [
    { label: "entries", type: "property", detail: "Count entries" },
    { label: "wins", type: "property", detail: "Count first-place entries" },
    { label: "win_rate", type: "property", detail: "wins / entries" },
    { label: "teams", type: "property", detail: "Count distinct race/team combinations" },
    { label: "team_wins", type: "property", detail: "Count matching teams containing the winner" },
    { label: "team_win_rate", type: "property", detail: "team_wins / teams" },
    { label: "avg_speed", type: "property" },
    { label: "avg_stamina", type: "property" },
    { label: "avg_power", type: "property" },
    { label: "avg_guts", type: "property" },
    { label: "avg_wit", type: "property" },
    { label: "avg_score", type: "property" },
    { label: "activation_rate", type: "function", detail: "Observed share activating a skill", apply: "activation_rate()" },
    { label: "skill_activation_rate", type: "function", detail: "Alias for activation_rate", apply: "skill_activation_rate()" },
    { label: "activated_entries", type: "function", detail: "Count entries activating a skill", apply: "activated_entries()" },
    { label: "skill_activations", type: "function", detail: "Alias for activated_entries", apply: "skill_activations()" },
];

const QUERY_OPERATOR_COMPLETIONS: Completion[] = [
    { label: "=", type: "keyword" },
    { label: "!=", type: "keyword" },
    { label: ">=", type: "keyword" },
    { label: "<=", type: "keyword" },
    { label: ">", type: "keyword" },
    { label: "<", type: "keyword" },
    { label: "has", type: "keyword", detail: "Array contains one item", apply: "has " },
    { label: "has any", type: "keyword", detail: "Array contains at least one listed item", apply: "has any ()" },
    { label: "has all", type: "keyword", detail: "Array contains every listed item", apply: "has all ()" },
    { label: "member", type: "keyword", detail: "Same-team entry filter", apply: "member()" },
];

const STYLE_COMPLETIONS: Completion[] = [
    { label: "Front Runner", type: "constant", detail: "Style name" },
    { label: "Pace Chaser", type: "constant", detail: "Style name" },
    { label: "Late Surger", type: "constant", detail: "Style name" },
    { label: "End Closer", type: "constant", detail: "Style name" },
    { label: "Runaway", type: "constant", detail: "Style name" },
];

const BOOLEAN_COMPLETIONS: Completion[] = [
    { label: "true", type: "constant" },
    { label: "false", type: "constant" },
];

const ORDER_DIRECTION_COMPLETIONS: Completion[] = [
    { label: "desc", type: "keyword", detail: "Highest first", boost: 2 },
    { label: "asc", type: "keyword", detail: "Lowest first" },
];

const STRING_VALUE_COMPLETIONS: Record<string, Completion[]> = {
    weather: ["sunny", "cloudy", "rainy"].map((label) => ({ label, type: "constant" })),
    ground_condition: ["good", "soft", "heavy"].map((label) => ({ label, type: "constant" })),
    season: ["spring", "summer", "autumn", "winter"].map((label) => ({ label, type: "constant" })),
};

const BOOLEAN_FIELDS = new Set(["won", "is_player", "is_full_room", "full_room", "has_replay_data", "is_winner_team"]);
const STYLE_FIELDS = new Set(["style", "strategy", "winner_strategy"]);
const QUERY_METRIC_NAMES = new Set(["entries", "count", "wins", "win_rate", "teams", "team_entries", "team_wins", "team_win_rate", "avg_speed", "avg_stamina", "avg_power", "avg_pow", "avg_guts", "avg_wit", "avg_wiz", "avg_score", "avg_rank_score"]);
const QUERY_FIELD_NAMES = new Set([
    ...QUERY_DIMENSION_COMPLETIONS.map((option) => option.label),
    ...QUERY_FILTER_COMPLETIONS.map((option) => option.label),
]);
const QUERY_FUNCTION_NAMES = new Set(["activation_rate", "activated_entries", "skill_activation_rate", "skill_activations", "has_skill", "has_activated_skill", "has_support_card", "member"]);
const QUERY_KEYWORD_NAMES = new Set(["at", "lb"]);

function findKnownSkillAt(text: string, index: number, skillEntries: SkillNameEntry[]): { entry: SkillNameEntry; to: number } | null {
    const lowerText = text.toLowerCase();
    for (const entry of skillEntries) {
        for (const name of entry.names) {
            if (!name || !lowerText.startsWith(name.toLowerCase(), index)) continue;
            const end = index + name.length;
            if (end < text.length && !/[\s,)]/.test(text[end])) continue;
            return { entry, to: end };
        }
    }
    return null;
}

function collectSkillNameRanges(query: string, skillEntries: SkillNameEntry[]): SkillNameRange[] {
    const ranges: SkillNameRange[] = [];
    for (const match of query.matchAll(/\b(activation_rate|activated_entries|skill_activation_rate|skill_activations|has_skill|has_activated_skill)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)/gi)) {
        const rawValue = match[2];
        const entry = resolveSkillEntry(rawValue, skillEntries);
        if (!entry || match.index == null) continue;
        const valueOffset = match[0].indexOf(rawValue);
        ranges.push({ from: match.index + valueOffset, to: match.index + valueOffset + rawValue.length, entry });
    }

    const addListRanges = (pattern: RegExp, groupIndex: number) => {
        for (const match of query.matchAll(pattern)) {
            const listText = match[groupIndex];
            if (match.index == null) continue;
            const listOffset = match[0].indexOf(listText);
            const base = match.index + listOffset;
            let index = 0;
            while (index < listText.length) {
                while (index < listText.length && /[\s,]/.test(listText[index])) index++;
                const found = findKnownSkillAt(listText, index, skillEntries);
                if (found) {
                    ranges.push({ from: base + index, to: base + found.to, entry: found.entry });
                    index = found.to;
                } else {
                    index++;
                }
            }
        }
    };

    addListRanges(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+has\s+(any|all)\s*\(([^)]*)\)/gi, 3);

    for (const match of query.matchAll(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+(has|contains|includes)\s+([^;\n()]*?(?:\(\s*inherit\s*\))?)(?=\s+(?:and|or)\b|\s*\)|;|\n|$)/gi)) {
        const rawValue = match[3];
        const entry = resolveSkillEntry(rawValue, skillEntries);
        if (!entry || match.index == null) continue;
        const valueOffset = match[0].indexOf(rawValue);
        ranges.push({ from: match.index + valueOffset, to: match.index + valueOffset + rawValue.length, entry });
    }

    return ranges.sort((left, right) => left.from - right.from || left.to - right.to);
}

function resolveEntityEntry(rawValue: string, entries: QueryEntityEntry[]): QueryEntityEntry | null {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return entries.find((entry) => entry.id === Number(value)) ?? null;
    const normalized = normalizeQueryName(value);
    return entries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized)) ?? null;
}

function findKnownEntityAt(text: string, index: number, entries: QueryEntityEntry[]): { entry: QueryEntityEntry; to: number } | null {
    const lowerText = text.toLowerCase();
    const knownEntries = entries
        .flatMap((entry) => entry.names.map((name) => ({ entry, name })))
        .filter(({ name }) => name)
        .sort((left, right) => right.name.length - left.name.length);
    for (const { entry, name } of knownEntries) {
        if (!lowerText.startsWith(name.toLowerCase(), index)) continue;
        const end = index + name.length;
        if (end < text.length && !/[\s,)]/.test(text[end])) continue;
        return { entry, to: end };
    }
    return null;
}

function collectEntityNameRanges(query: string, characterEntries: QueryEntityEntry[], supportCardEntries: QueryEntityEntry[]): EntityNameRange[] {
    const ranges: EntityNameRange[] = [];
    for (const match of query.matchAll(/\b(uma|character|variant|character_variant|card|card_id|winner_card_id)\s*(=|!=|<>)\s+([^;\n()]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi)) {
        const rawValue = match[3];
        const entry = resolveEntityEntry(rawValue, characterEntries);
        if (!entry || match.index == null) continue;
        const valueOffset = match[0].indexOf(rawValue);
        ranges.push({ from: match.index + valueOffset, to: match.index + valueOffset + rawValue.length, entry });
    }

    const addSupportListRanges = (pattern: RegExp, groupIndex: number) => {
        for (const match of query.matchAll(pattern)) {
            const listText = match[groupIndex];
            if (match.index == null) continue;
            const listOffset = match[0].indexOf(listText);
            const base = match.index + listOffset;
            let index = 0;
            while (index < listText.length) {
                while (index < listText.length && /[\s,]/.test(listText[index])) index++;
                const found = findKnownEntityAt(listText, index, supportCardEntries);
                if (found) {
                    ranges.push({ from: base + index, to: base + found.to, entry: found.entry });
                    index = found.to;
                } else {
                    index++;
                }
            }
        }
    };

    for (const match of query.matchAll(/\b(has_support_card)\s*\(\s*([^)]*?)\s*\)/gi)) {
        const rawValue = match[2];
        const entry = resolveEntityEntry(rawValue, supportCardEntries);
        if (!entry || match.index == null) continue;
        const valueOffset = match[0].indexOf(rawValue);
        ranges.push({ from: match.index + valueOffset, to: match.index + valueOffset + rawValue.length, entry });
    }

    addSupportListRanges(/\b(support|support_card|support_cards)\s+has\s+(any|all)\s*\(([^)]*)\)/gi, 3);

    for (const match of query.matchAll(/\b(support|support_card|support_cards)\s+(has|contains|includes)\s+([^;\n()]*?)(?:\s+at\s+lb\s+[0-4])?(?=\s+(?:and|or)\b|\)|;|\n|$)/gi)) {
        const rawValue = match[3];
        const entry = resolveEntityEntry(rawValue, supportCardEntries);
        if (!entry || match.index == null) continue;
        const valueOffset = match[0].indexOf(rawValue);
        ranges.push({ from: match.index + valueOffset, to: match.index + valueOffset + rawValue.length, entry });
    }

    return ranges.sort((left, right) => left.from - right.from || left.to - right.to);
}

function collectTokenRanges(query: string): TokenRange[] {
    const ranges: TokenRange[] = [];
    for (const match of query.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
        if (match.index == null) continue;
        const value = match[0].toLowerCase();
        if (QUERY_FUNCTION_NAMES.has(value)) {
            ranges.push({ from: match.index, to: match.index + match[0].length, className: "query-function-token", title: "Recognized query function" });
        } else if (QUERY_FIELD_NAMES.has(value)) {
            ranges.push({ from: match.index, to: match.index + match[0].length, className: "query-field-token", title: "Recognized query field" });
        } else if (QUERY_KEYWORD_NAMES.has(value)) {
            ranges.push({ from: match.index, to: match.index + match[0].length, className: "query-keyword-token", title: "Recognized query keyword" });
        }
    }
    return ranges;
}

function normalizeStyleToken(value: string): number | null {
    const normalized = normalizeQueryName(value);
    const styles: Record<string, number> = {
        runaway: 5,
        frontrunner: 1,
        front: 1,
        pacechaser: 2,
        pace: 2,
        latesurger: 3,
        late: 3,
        endcloser: 4,
        closer: 4,
        end: 4,
        nige: 5,
        senko: 1,
        sashi: 2,
        oikomi: 4,
        debuffer: 6,
        debuff: 6,
    };
    return styles[normalized.replace(/\s+/g, "")] ?? null;
}

function collectStyleTokenRanges(query: string): StyleTokenRange[] {
    const ranges: StyleTokenRange[] = [];
    for (const match of query.matchAll(/\b(style|strategy|winner_strategy)\s*(=|!=|<>)\s+("[^"]*"|'[^']*'|[A-Za-z][A-Za-z ]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi)) {
        const rawValue = match[3];
        const styleId = normalizeStyleToken(rawValue.replace(/^['"]|['"]$/g, ""));
        if (!styleId || match.index == null) continue;
        const valueOffset = match[0].indexOf(rawValue);
        ranges.push({ from: match.index + valueOffset, to: match.index + valueOffset + rawValue.length, styleId });
    }
    return ranges;
}

class QueryIconWidget extends WidgetType {
    constructor(private readonly iconUrl: string | null, private readonly title: string, private readonly className = "query-skill-icon-widget") {
        super();
    }

    toDOM(): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.className = this.className;
        wrapper.title = this.title;
        if (this.iconUrl) {
            const img = document.createElement("img");
            img.src = this.iconUrl;
            img.alt = "";
            wrapper.appendChild(img);
        }
        return wrapper;
    }
}

class StyleChipWidget extends WidgetType {
    constructor(private readonly styleId: number) {
        super();
    }

    toDOM(): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.className = "query-style-chip-widget";
        wrapper.title = STRATEGY_NAMES[this.styleId] ?? `Style ${this.styleId}`;
        wrapper.style.background = STRATEGY_COLORS[this.styleId] ?? "#94a3b8";
        return wrapper;
    }
}

function buildQueryDecorations(view: EditorView, skillEntries: SkillNameEntry[], characterEntries: QueryEntityEntry[], supportCardEntries: QueryEntityEntry[]): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const decorations: Array<{ from: number; to: number; decoration: Decoration }> = [];
    for (const range of collectSkillNameRanges(text, skillEntries)) {
        decorations.push({
            from: range.from,
            to: range.from,
            decoration: Decoration.widget({ widget: new QueryIconWidget(range.entry.iconUrl, `${range.entry.names[0]} (${range.entry.id})`), side: -1 }),
        });
        decorations.push({ from: range.from, to: range.to, decoration: Decoration.mark({ class: "query-skill-name-token" }) });
    }
    for (const range of collectEntityNameRanges(text, characterEntries, supportCardEntries)) {
        decorations.push({
            from: range.from,
            to: range.from,
            decoration: Decoration.widget({
                widget: new QueryIconWidget(range.entry.iconUrl, `${range.entry.names[0]} (${range.entry.id})`, "query-entity-icon-widget"),
                side: -1,
            }),
        });
        decorations.push({ from: range.from, to: range.to, decoration: Decoration.mark({ class: range.entry.type === "support" ? "query-support-name-token" : "query-character-name-token" }) });
    }
    for (const range of collectStyleTokenRanges(text)) {
        decorations.push({
            from: range.from,
            to: range.from,
            decoration: Decoration.widget({ widget: new StyleChipWidget(range.styleId), side: -1 }),
        });
        decorations.push({ from: range.from, to: range.to, decoration: Decoration.mark({ class: "query-style-name-token" }) });
    }
    for (const range of collectTokenRanges(text)) {
        decorations.push({ from: range.from, to: range.to, decoration: Decoration.mark({ class: range.className, attributes: range.title ? { title: range.title } : undefined }) });
    }
    decorations.sort((left, right) => left.from - right.from || left.to - right.to);
    for (const item of decorations) {
        builder.add(item.from, item.to, item.decoration);
    }
    return builder.finish();
}

export function queryHighlightExtension(skillEntries: SkillNameEntry[], characterEntries: QueryEntityEntry[], supportCardEntries: QueryEntityEntry[]) {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildQueryDecorations(view, skillEntries, characterEntries, supportCardEntries);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = buildQueryDecorations(update.view, skillEntries, characterEntries, supportCardEntries);
            }
        }
    }, {
        decorations: (plugin) => plugin.decorations,
    });
}

function createSkillCompletion(entry: SkillNameEntry): Completion {
    const label = entry.names[0] ?? `Skill ${entry.id}`;
    return {
        label,
        type: "constant",
        detail: `${entry.isInherited ? "Inherited skill" : "Skill"} ${entry.id}`,
        info: entry.iconUrl ? () => {
            const wrapper = document.createElement("div");
            wrapper.className = "query-skill-completion-info";
            const img = document.createElement("img");
            img.src = entry.iconUrl!;
            img.alt = "";
            const text = document.createElement("span");
            text.textContent = label;
            const meta = document.createElement("small");
            meta.textContent = `${entry.isInherited ? "inherit " : ""}${entry.id}`;
            wrapper.append(img, text);
            wrapper.appendChild(meta);
            return wrapper;
        } : undefined,
    };
}

function createInheritedSkillEntry(entry: SkillNameEntry): SkillNameEntry | null {
    if (entry.isInherited || !String(entry.id).startsWith("1")) return null;
    return {
        id: Number(`9${String(entry.id).slice(1)}`),
        names: entry.names.map((name) => `${name} (inherit)`),
        iconUrl: entry.iconUrl,
        isInherited: true,
    };
}

function buildSkillCompletionOptions(skillEntries: SkillNameEntry[], token: string): Completion[] {
    const optionEntries = new Map<number, SkillNameEntry>();
    skillEntries
        .filter((entry) => !token || entry.names.some((name) => normalizeQueryName(name).includes(token)))
        .forEach((entry) => {
            optionEntries.set(entry.id, entry);
            const inheritedEntry = createInheritedSkillEntry(entry);
            if (inheritedEntry) optionEntries.set(inheritedEntry.id, optionEntries.get(inheritedEntry.id) ?? inheritedEntry);
        });

    return [...optionEntries.values()]
        .sort((left, right) => {
            const leftLength = Math.max(...left.names.map((name) => name.replace(/\s+\(inherit\)$/i, "").length));
            const rightLength = Math.max(...right.names.map((name) => name.replace(/\s+\(inherit\)$/i, "").length));
            if (rightLength !== leftLength) return rightLength - leftLength;
            return Number(left.isInherited) - Number(right.isInherited);
        })
        .slice(0, 80)
        .map(createSkillCompletion);
}

function createEntityCompletion(entry: QueryEntityEntry): Completion {
    const label = entry.names[0] ?? `${entry.type === "support" ? "Support" : "Uma"} ${entry.id}`;
    return {
        label,
        type: "constant",
        detail: `${entry.type === "support" ? "Support card" : "Uma"} ${entry.id}`,
        info: entry.iconUrl ? () => {
            const wrapper = document.createElement("div");
            wrapper.className = "query-skill-completion-info";
            const img = document.createElement("img");
            img.src = entry.iconUrl!;
            img.alt = "";
            const text = document.createElement("span");
            text.textContent = label;
            const meta = document.createElement("small");
            meta.textContent = String(entry.id);
            wrapper.append(img, text);
            wrapper.appendChild(meta);
            return wrapper;
        } : undefined,
    };
}

function buildEntityCompletionOptions(entries: QueryEntityEntry[], token: string): Completion[] {
    return entries
        .filter((entry) => !token || entry.names.some((name) => normalizeQueryName(name).includes(token)))
        .slice(0, 80)
        .map(createEntityCompletion);
}

const QUERY_FIELD_OUTPUT_ALIASES: Record<string, string> = {
    uma: "card_id",
    character: "card_id",
    variant: "card_id",
    character_variant: "card_id",
    card: "card_id",
    style: "strategy",
    strategy: "strategy",
    chara: "chara_id",
    distance: "race_distance",
    finish: "finish_order",
    score: "rank_score",
    rank: "rank_score",
    mood: "motivation",
    sp: "total_skill_points",
    full_room: "is_full_room",
    uma_count: "horse_count",
    front_runners: "room_front_count",
    room_front_runners: "room_front_count",
    room_runaways: "room_runaway_count",
    pace_count: "room_pace_count",
    late_count: "room_late_count",
    end_count: "room_end_count",
    team_pace: "team_pace_count",
    team_late: "team_late_count",
    team_end: "team_end_count",
};

const QUERY_SCALAR_FIELD_NAMES = new Set([
    ...QUERY_DIMENSION_COMPLETIONS.map((option) => option.label.toLowerCase()),
    "chara",
    "finish",
    "career_win_count",
    "pow",
    "wiz",
    "rank",
    "sp",
    "full_room",
]);

function outputKeyForSelectPart(part: string, skillEntries: SkillNameEntry[]): string | null {
    const normalized = part.trim().toLowerCase();
    if (!normalized) return null;
    const functionMatch = normalized.match(/^(activation_rate|activated_entries|skill_activation_rate|skill_activations)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)$/);
    if (functionMatch) {
        const resolvedSkillId = resolveSkillToken(functionMatch[2], skillEntries);
        if (!/^\d+$/.test(resolvedSkillId)) return null;
        const functionName = functionMatch[1] === "skill_activation_rate" ? "activation_rate" : functionMatch[1] === "skill_activations" ? "activated_entries" : functionMatch[1];
        return `${functionName}_${resolvedSkillId}`;
    }
    if (QUERY_METRIC_NAMES.has(normalized)) {
        if (normalized === "count") return "entries";
        if (normalized === "team_entries") return "teams";
        if (normalized === "avg_pow") return "avg_power";
        if (normalized === "avg_wiz") return "avg_wit";
        if (normalized === "avg_rank_score") return "avg_score";
        return normalized;
    }
    if (QUERY_SCALAR_FIELD_NAMES.has(normalized)) return QUERY_FIELD_OUTPUT_ALIASES[normalized] ?? normalized;
    return null;
}

function selectedOutputKeysForQuery(query: string, skillEntries: SkillNameEntry[]): string[] {
    const clauses = parseQueryClauses(query);
    const selectedParts = splitQueryCommaList(clauses.selectText);
    return selectedParts.flatMap((part) => {
        const key = outputKeyForSelectPart(part, skillEntries);
        return key ? [key] : [];
    });
}

function buildOrderByCompletions(query: string, skillEntries: SkillNameEntry[]): Completion[] {
    const selected = selectedOutputKeysForQuery(query, skillEntries);
    const selectedOptions = selected.map((label) => ({ label, type: "property" as const, detail: "Selected output" }));
    return selectedOptions.length ? selectedOptions : [...QUERY_DIMENSION_COMPLETIONS, ...QUERY_METRIC_COMPLETIONS];
}

export function queryCompletionSource(skillEntries: SkillNameEntry[], characterEntries: QueryEntityEntry[], supportCardEntries: QueryEntityEntry[]) {
    return (context: CompletionContext) => {
        const beforeCursor = context.state.sliceDoc(0, context.pos);
        const skillContext = getSkillCompletionContext(beforeCursor);
        if (skillContext) {
            const token = normalizeQueryName(skillContext.token);
            const options = buildSkillCompletionOptions(skillEntries, token);
            return options.length || context.explicit
                ? { from: skillContext.from, options, validFor: /[^,\n()]*/ }
                : null;
        }

        const entityContext = getEntityCompletionContext(beforeCursor);
        if (entityContext) {
            const token = normalizeQueryName(entityContext.token);
            const options = buildEntityCompletionOptions(entityContext.type === "support" ? supportCardEntries : characterEntries, token);
            return options.length || context.explicit
                ? { from: entityContext.from, options, validFor: /[^,\n()]*/ }
                : null;
        }

        const valueContext = getValueCompletionContext(beforeCursor);
        if (valueContext) {
            const token = normalizeQueryName(valueContext.token);
            let options: Completion[] = [];
            if (STYLE_FIELDS.has(valueContext.field)) options = STYLE_COMPLETIONS;
            else if (BOOLEAN_FIELDS.has(valueContext.field)) options = BOOLEAN_COMPLETIONS;
            else options = STRING_VALUE_COMPLETIONS[valueContext.field] ?? [];
            options = options.filter((option) => !token || normalizeQueryName(option.label).includes(token));
            if (options.length || context.explicit) {
                return { from: valueContext.from, options, validFor: /[^,\n()]*/ };
            }
        }

        const orderDirectionContext = getOrderDirectionCompletionContext(beforeCursor);
        if (orderDirectionContext) {
            const token = orderDirectionContext.token.toLowerCase();
            const options = ORDER_DIRECTION_COMPLETIONS.filter((option) => !token || option.label.startsWith(token));
            return options.length || context.explicit
                ? { from: orderDirectionContext.from, options, validFor: /[A-Za-z]*/ }
                : null;
        }

        const activeClause = getActiveQueryClause(beforeCursor);
        const afterField = activeClause === "where" && /\b[A-Za-z_][A-Za-z0-9_]*\s+$/.test(beforeCursor);
        const emptyTrigger = isEmptyCompletionTrigger(beforeCursor, activeClause);
        const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
        if (!word && !context.explicit && !emptyTrigger && !afterField) return null;
        let options: Completion[];
        if (afterField) options = QUERY_OPERATOR_COMPLETIONS;
        else if (activeClause === "select") options = [...QUERY_DIMENSION_COMPLETIONS, ...QUERY_METRIC_COMPLETIONS];
        else if (activeClause === "where") options = [...QUERY_FILTER_COMPLETIONS, ...QUERY_KEYWORD_COMPLETIONS, ...QUERY_OPERATOR_COMPLETIONS];
        else if (activeClause === "group") options = QUERY_DIMENSION_COMPLETIONS;
        else if (activeClause === "having") options = buildOrderByCompletions(context.state.doc.toString(), skillEntries);
        else if (activeClause === "order") options = buildOrderByCompletions(context.state.doc.toString(), skillEntries);
        else options = [...QUERY_KEYWORD_COMPLETIONS, ...QUERY_DIMENSION_COMPLETIONS, ...QUERY_METRIC_COMPLETIONS];
        return {
            from: word?.from ?? context.pos,
            options,
            validFor: afterField ? /[=!<>]*/ : /[A-Za-z_][A-Za-z0-9_]*/,
        };
    };
}

export function queryEmptyCompletionTriggerExtension() {
    return EditorView.updateListener.of((update) => {
        if (!update.docChanged || !update.state.selection.main.empty) return;
        const cursor = update.state.selection.main.head;
        const beforeCursor = update.state.sliceDoc(0, cursor);
        const activeClause = getActiveQueryClause(beforeCursor);
        const afterField = activeClause === "where" && /\b[A-Za-z_][A-Za-z0-9_]*\s+$/.test(beforeCursor);
        if (isEmptyCompletionTrigger(beforeCursor, activeClause) || afterField || getOrderDirectionCompletionContext(beforeCursor)) {
            startCompletion(update.view);
        }
    });
}
