import React, { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql as sqlLang, SQLite } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { autocompletion, closeBrackets, startCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import AssetLoader from "../../data/AssetLoader";
import GameDataLoader from "../../data/GameDataLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import { UMA_LOGS_API_BASE } from "./umaLogsApi";
import type { UmaLogsQuerySpec } from "./umaLogsQueryShared";
import "./UmaLogsPage.css";

type QueryColumn = {
    key: string;
    label: string;
    type: "number" | "percent" | "dimension";
};

type TextQueryResponse = {
    columns: QueryColumn[];
    rows: Array<Record<string, unknown>>;
    limit: number;
    offset: number;
    source?: "aggregate-cache" | "live" | "compiled";
    querySpec?: UmaLogsQuerySpec;
};

interface QueriesTabProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    onFindReplays?: (querySpec: UmaLogsQuerySpec) => void;
    initialQuery?: string;
}

const DEFAULT_QUERY = `select character, style, is_debuffer, entries, wins, win_rate
group by character, style, is_debuffer
order by wins desc
limit 20`;
const QUERY_DRAFT_STORAGE_KEY = "umalogs-query-draft";

const HELP_EXAMPLES = [
    {
        title: "Debuffers by original style",
        query: `select character, style, is_debuffer, entries, win_rate
where style = "Pace Chaser" and is_debuffer = true
group by character, style, is_debuffer
order by entries desc
limit 20`,
    },
    {
        title: "Activation rate for one character",
        query: `select character, style, entries, activated_entries(Angling and Scheming), activation_rate(Angling and Scheming), win_rate
where character = [Reeling in the Big One] and style = "Front Runner"
group by character, style
order by entries desc
limit 20`,
    },
    {
        title: "Activation baseline",
        query: `select entries, activated_entries(Angling and Scheming), activation_rate(Angling and Scheming), win_rate
where character = [Reeling in the Big One] and style = "Front Runner"
limit 1`,
    },
    {
        title: "Activation without another skill",
        query: `select entries, activated_entries(Angling and Scheming), activation_rate(Angling and Scheming), win_rate
where character = [Reeling in the Big One] and style = "Front Runner"
  and not has_skill(Taking the Lead)
limit 1`,
    },
    {
        title: "Find high-score cohorts with either of two skills",
        query: `select character, style, entries, win_rate, avg_speed, avg_stamina, avg_power, avg_wit
where rank_score >= 20000
  and learned has any (Angling and Scheming, Taking the Lead)
group by character, style
order by win_rate desc
limit 25`,
    },
    {
        title: "Support card cohort",
        query: `select card, style, entries, wins, win_rate
where support_cards has [Fire at My Heels] Kitasan Black and speed >= 1200
group by card, style
order by entries desc
limit 20`,
    },
    {
        title: "Room composition comparison",
        query: `select character, style, room_front_count, entries, win_rate
where style = "Pace Chaser" and room_front_count = 0
group by character, style, room_front_count
order by win_rate desc
limit 25`,
    },
    {
        title: "Team composition",
        query: `select character, style, teams, team_wins, team_win_rate
where team has all (
  member(style = "Front Runner" and has_skill(Angling and Scheming)),
  member(style = "Front Runner" and has_skill(Taking the Lead)),
  member(style = "Pace Chaser")
)
group by character, style
order by team_win_rate desc
limit 20`,
    },
    {
        title: "Winning character against a losing character",
        query: `select character, style, entries, wins, win_rate
where winning_team has member(character = [Wild Frontier])
  and losing_team has member(character = [Starlight Beat])
group by character, style
order by wins desc
limit 20`,
    },
];

const FILTER_FIELDS = [
    "frame_order",
    "style / strategy",
    "is_debuffer / debuffer",
    "character / card / card_id",
    "chara_id",
    "speed",
    "stamina",
    "power / pow",
    "guts",
    "wit / wiz",
    "rank_score / score",
    "finish_order / finish",
    "finish_time",
    "race_distance",
    "career_wins",
    "motivation",
    "activation_chance",
    "apt_ground",
    "apt_distance",
    "apt_style",
    "total_skill_points / skill_points",
    "deck_race_bonus",
    "race_type",
    "horse_count",
    "team_count",
    "is_full_room / full_room",
    "has_replay_data",
    "ground_condition",
    "weather",
    "season",
    "room_front_count",
    "room_front_runner_count",
    "room_runaway_count",
    "room_pace_count",
    "room_late_count",
    "room_end_count",
    "room_debuffer_count",
    "winner_team_id",
    "winner_card_id",
    "winner_chara_id",
    "winner_strategy",
    "team_front_count",
    "team_front_runner_count",
    "team_runaway_count",
    "team_pace_count",
    "team_late_count",
    "team_end_count",
    "is_winner_team",
    "team_id",
    "won",
    "team has member(...)",
    "team has all (member(...), member(...))",
    "any_team has member(...)",
    "winning_team has member(...)",
    "losing_team has member(...)",
];

const HELP_SKILL_FIELDS = [
    "learned has Skill Name",
    "activated has Skill Name",
    "learned has any (Skill A, Skill B)",
    "learned has all (Skill A, Skill B)",
    "not learned has Skill Name",
    "has_skill(Skill Name) as an alias for learned has Skill Name",
    "has_activated_skill(Skill Name) as an alias for activated has Skill Name",
    "support_cards has Support Card Name",
    "support_cards has Support Card Name at lb 4",
    "has_support_card(Support Card Name) as an alias for support_cards has Support Card Name",
    "team has member(style = \"Front Runner\" and has_skill(Skill Name))",
    "team has all (member(...), member(...)) requires distinct team members",
    "any_team has member(...) matches any team in the race",
    "winning_team has member(...) matches the race winner's team",
    "losing_team has member(...) matches any non-winning team",
];

const SELECT_FIELDS = [
    "character",
    "card",
    "style",
    "is_debuffer",
    "chara_id",
    "race_distance",
    "ground_condition",
    "weather",
    "season",
    "room_front_count",
    "room_pace_count",
    "room_late_count",
    "room_end_count",
    "room_debuffer_count",
    "winner_strategy",
    "team_pace_count",
    "team_late_count",
    "team_end_count",
    "entries",
    "wins",
    "win_rate",
    "teams",
    "team_wins",
    "team_win_rate",
    "avg_speed",
    "avg_stamina",
    "avg_power",
    "avg_guts",
    "avg_wit",
    "avg_score",
    "activation_rate(Skill Name)",
    "skill_activation_rate(Skill Name)",
    "activated_entries(Skill Name)",
    "skill_activations(Skill Name)",
];

type SkillNameEntry = {
    id: number;
    names: string[];
    iconUrl: string | null;
    isInherited?: boolean;
};

type QueryEntityEntry = {
    id: number;
    names: string[];
    iconUrl: string | null;
    type: "character" | "support";
};

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
    { label: "character", type: "variable", detail: "Specific character variant" },
    { label: "variant", type: "variable", detail: "Alias for character" },
    { label: "card", type: "variable", detail: "Specific character variant" },
    { label: "card_id", type: "variable", detail: "Specific character variant ID" },
    { label: "style", type: "variable", detail: "Running style" },
    { label: "strategy", type: "variable", detail: "Alias for style" },
    { label: "is_debuffer", type: "variable", detail: "Whether the build is classified as a Debuffer" },
    { label: "debuffer", type: "variable", detail: "Alias for is_debuffer" },
    { label: "chara_id", type: "variable", detail: "Base character family" },
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
    { label: "motivation", type: "variable" },
    { label: "activation_chance", type: "variable", detail: "Logged entry activation chance scalar" },
    { label: "apt_ground", type: "variable" },
    { label: "apt_distance", type: "variable" },
    { label: "apt_style", type: "variable" },
    { label: "skill_points", type: "variable", detail: "Alias for total_skill_points" },
    { label: "total_skill_points", type: "variable" },
    { label: "deck_race_bonus", type: "variable" },
    { label: "race_type", type: "variable" },
    { label: "horse_count", type: "variable" },
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
    { label: "member", type: "function", detail: "A same-team character filter", apply: "member()" },
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

function buildTextQueryUrl(cmId: string, courseId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/queries/run`;
}

function normalizeQueryName(value: string): string {
    return value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[◎○×]/g, "")
        .replace(/['"`]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function buildSkillNameEntries(): SkillNameEntry[] {
    const byId = new Map<number, Set<string>>();
    const add = (id: number, name?: string) => {
        if (!id || !name?.trim()) return;
        if (!byId.has(id)) byId.set(id, new Set());
        byId.get(id)!.add(name.trim());
        const withoutMarker = name.replace(/[◎○×]/g, "").trim();
        if (withoutMarker && withoutMarker !== name.trim()) byId.get(id)!.add(withoutMarker);
    };

    Object.values(UMDatabaseWrapper.skills).forEach((skill) => add(skill.id ?? 0, skill.name));
    try {
        GameDataLoader.skillNameFallbacks.forEach((skill) => {
            add(skill.id, skill.enname);
            add(skill.id, skill.jpname);
        });
    } catch {
        // Fallback data is normally initialized before UmaLogs renders, but UMDB names are enough to proceed.
    }

    const addInheritedVariant = (baseId: number, names: Set<string>) => {
        const inheritedId = Number(`9${String(baseId).slice(1)}`);
        if (!inheritedId) return;
        if (!byId.has(inheritedId)) byId.set(inheritedId, new Set());
        names.forEach((name) => byId.get(inheritedId)!.add(name));
    };

    [...byId.entries()].forEach(([id, names]) => {
        if (String(id).startsWith("1")) addInheritedVariant(id, names);
    });

    return [...byId.entries()]
        .map(([id, names]) => {
            const isInherited = String(id).startsWith("9");
            const iconSkillId = resolveIconSkillId(id);
            const iconId = UMDatabaseWrapper.skills[iconSkillId]?.iconId;
            return {
                id,
                names: [...names].filter(Boolean).map((name) => isInherited ? `${name} (inherit)` : name),
                iconUrl: iconId ? AssetLoader.getSkillIcon(iconId) : null,
                isInherited,
            };
        })
        .sort((left, right) => {
            const leftLength = Math.max(...left.names.map((name) => name.replace(/\s+\(inherit\)$/i, "").length));
            const rightLength = Math.max(...right.names.map((name) => name.replace(/\s+\(inherit\)$/i, "").length));
            if (rightLength !== leftLength) return rightLength - leftLength;
            return Number(left.isInherited) - Number(right.isInherited);
        });
}

function buildCharacterNameEntries(): QueryEntityEntry[] {
    return Object.values(UMDatabaseWrapper.cards)
        .filter((card) => card.id && card.name)
        .map((card) => {
            const cardId = card.id!;
            const charaId = Math.floor(cardId / 100);
            const charaName = UMDatabaseWrapper.charas[charaId]?.name;
            const names = new Set<string>([card.name]);
            if (charaName && card.name === charaName) {
                names.add(charaName);
            }
            return {
                id: cardId,
                names: [...names],
                iconUrl: AssetLoader.getCharaThumb(cardId),
                type: "character" as const,
            };
        })
        .sort((left, right) => left.names[0].localeCompare(right.names[0]));
}

function buildSupportCardNameEntries(): QueryEntityEntry[] {
    return Object.values(UMDatabaseWrapper.supportCards)
        .filter((card) => card.id && card.name)
        .map((card) => ({
            id: card.id!,
            names: [card.name],
            iconUrl: AssetLoader.getSupportCardIcon(card.id!),
            type: "support" as const,
        }))
        .sort((left, right) => left.names[0].localeCompare(right.names[0]));
}

function resolveIconSkillId(id: number): number {
    const s = String(id);
    return s.startsWith("9") ? parseInt(`1${s.slice(1)}`, 10) : id;
}

function resolveEntityToken(rawValue: string, entries: QueryEntityEntry[]): string {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return value;
    const normalized = normalizeQueryName(value);
    const match = entries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized));
    return match ? String(match.id) : rawValue.trim();
}

function resolveSkillToken(rawValue: string, skillEntries: SkillNameEntry[]): string {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return value;
    const normalized = normalizeQueryName(value);
    const match = skillEntries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized));
    if (match) return String(match.id);
    if (/\binherit\b/i.test(value)) {
        const baseValue = value.replace(/\s*\(\s*inherit\s*\)\s*$/i, "").trim();
        const baseNormalized = normalizeQueryName(baseValue);
        const baseMatch = skillEntries.find((entry) => !entry.isInherited && String(entry.id).startsWith("1") && entry.names.some((name) => normalizeQueryName(name) === baseNormalized));
        if (baseMatch) return `9${String(baseMatch.id).slice(1)}`;
    }
    return rawValue.trim();
}

function resolveSkillEntry(rawValue: string, skillEntries: SkillNameEntry[]): SkillNameEntry | null {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return skillEntries.find((entry) => entry.id === Number(value)) ?? null;
    const normalized = normalizeQueryName(value);
    return skillEntries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized)) ?? null;
}

function splitKnownEntityList(listText: string, entries: Array<{ names: string[] }>): string[] {
    const knownNames = entries
        .flatMap((entry) => entry.names)
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
    const values: string[] = [];
    let index = 0;
    while (index < listText.length) {
        while (index < listText.length && /[\s,]/.test(listText[index])) index++;
        if (index >= listText.length) break;
        if (listText[index] === "\"" || listText[index] === "'") {
            const quote = listText[index++];
            let end = index;
            while (end < listText.length && listText[end] !== quote) end++;
            values.push(listText.slice(index, end));
            index = end + 1;
        } else {
            const lowerText = listText.toLowerCase();
            const knownName = knownNames.find((name) => {
                if (!lowerText.startsWith(name.toLowerCase(), index)) return false;
                const end = index + name.length;
                return end >= listText.length || /[\s,)]/.test(listText[end]);
            });
            if (knownName) {
                values.push(knownName);
                index += knownName.length;
            } else {
                let end = index;
                while (end < listText.length && listText[end] !== ",") end++;
                values.push(listText.slice(index, end).trim());
                index = end;
            }
        }
        while (index < listText.length && /\s/.test(listText[index])) index++;
        if (listText[index] === ",") index++;
    }
    return values.filter(Boolean);
}

function compileFriendlyNames(
    query: string,
    skillEntries: SkillNameEntry[],
    characterEntries: QueryEntityEntry[],
    supportCardEntries: QueryEntityEntry[],
): string {
    let compiled = query;
    compiled = compiled.replace(/\b(skill_activation_rate)\s*\(\s*([^)]*?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `activation_rate(${resolved})`;
    });
    compiled = compiled.replace(/\b(skill_activations)\s*\(\s*([^)]*?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `activated_entries(${resolved})`;
    });
    compiled = compiled.replace(/\b(activation_rate|activated_entries)\s*\(\s*([^)]*?)\s*\)/gi, (match, functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return /^\d+$/.test(resolved) ? `${functionName}(${resolved})` : match;
    });
    compiled = compiled.replace(/\b(has_skill)\s*\(\s*([^)]*?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `learned has ${resolved}`;
    });
    compiled = compiled.replace(/\b(has_activated_skill)\s*\(\s*([^)]*?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `activated has ${resolved}`;
    });
    compiled = compiled.replace(/\b(has_support_card)\s*\(\s*([^)]*?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveEntityToken(rawValue, supportCardEntries);
        return `support_cards has ${resolved}`;
    });
    compiled = compiled.replace(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+has\s+(any|all)\s*\(([^)]*)\)/gi, (_match, field: string, mode: string, listText: string) => {
        const resolvedList = splitKnownEntityList(listText, skillEntries).map((value) => resolveSkillToken(value, skillEntries));
        return `${field} has ${mode} (${resolvedList.join(", ")})`;
    });
    compiled = compiled.replace(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+(has|contains|includes)\s+([^;\n()]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi, (match, field: string, operator: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return /^\d+$/.test(resolved) ? `${field} ${operator} ${resolved}` : match;
    });
    compiled = compiled.replace(/\b(support|support_card|support_cards)\s+has\s+(any|all)\s*\(([^)]*)\)/gi, (_match, field: string, mode: string, listText: string) => {
        const resolvedList = splitKnownEntityList(listText, supportCardEntries).map((value) => resolveEntityToken(value, supportCardEntries));
        return `${field} has ${mode} (${resolvedList.join(", ")})`;
    });
    compiled = compiled.replace(/\b(support|support_card|support_cards)\s+(has|contains|includes)\s+([^;\n()]*?)(\s+at\s+lb\s+[0-4])?(?=\s+(?:and|or)\b|\)|;|\n|$)/gi, (match, field: string, operator: string, rawValue: string, limitBreakSuffix = "") => {
        const resolved = resolveEntityToken(rawValue, supportCardEntries);
        return /^\d+$/.test(resolved) ? `${field} ${operator} ${resolved}${limitBreakSuffix}` : match;
    });
    compiled = compiled.replace(/\b(character|variant|character_variant|card|card_id|winner_card_id)\s*(=|!=|<>)\s+([^;\n()]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi, (match, field: string, operator: string, rawValue: string) => {
        const resolved = resolveEntityToken(rawValue, characterEntries);
        return /^\d+$/.test(resolved) ? `${field} ${operator} ${resolved}` : match;
    });
    return compiled;
}

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
    for (const match of query.matchAll(/\b(activation_rate|activated_entries|skill_activation_rate|skill_activations|has_skill|has_activated_skill)\s*\(\s*([^)]*?)\s*\)/gi)) {
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

    for (const match of query.matchAll(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+(has|contains|includes)\s+([^;\n()]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi)) {
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
    for (const match of query.matchAll(/\b(character|variant|character_variant|card|card_id|winner_card_id)\s*(=|!=|<>)\s+([^;\n()]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi)) {
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

function queryHighlightExtension(skillEntries: SkillNameEntry[], characterEntries: QueryEntityEntry[], supportCardEntries: QueryEntityEntry[]) {
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

function getSkillCompletionContext(textBeforeCursor: string): { from: number; token: string } | null {
    const functionMatch = textBeforeCursor.match(/\b(?:activation_rate|activated_entries|skill_activation_rate|skill_activations|has_skill|has_activated_skill)\s*\(\s*([^(),]*)$/i);
    if (functionMatch?.index !== undefined) {
        return {
            from: textBeforeCursor.length - functionMatch[1].length,
            token: functionMatch[1],
        };
    }

    const arrayMatch = textBeforeCursor.match(/\b(?:learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+has\s+(?:any\s*\([^)]*|all\s*\([^)]*|)([^,\n()]*)$/i);
    if (arrayMatch?.index !== undefined) {
        return {
            from: textBeforeCursor.length - arrayMatch[1].length,
            token: arrayMatch[1],
        };
    }

    return null;
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
    const label = entry.names[0] ?? `${entry.type === "support" ? "Support" : "Character"} ${entry.id}`;
    return {
        label,
        type: "constant",
        detail: `${entry.type === "support" ? "Support card" : "Character"} ${entry.id}`,
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

function getEntityCompletionContext(textBeforeCursor: string): { from: number; token: string; type: "character" | "support" } | null {
    const compareMatch = textBeforeCursor.match(/\b(character|variant|character_variant|card|card_id|winner_card_id)\s*(?:=|!=|<>)\s*([^,\n()]*)$/i);
    if (compareMatch?.index !== undefined) {
        return {
            from: textBeforeCursor.length - compareMatch[2].length,
            token: compareMatch[2],
            type: "character",
        };
    }

    const supportFunctionMatch = textBeforeCursor.match(/\bhas_support_card\s*\(\s*([^,\n()]*)$/i);
    if (supportFunctionMatch?.index !== undefined) {
        return {
            from: textBeforeCursor.length - supportFunctionMatch[1].length,
            token: supportFunctionMatch[1],
            type: "support",
        };
    }

    const supportMatch = textBeforeCursor.match(/\b(?:support|support_card|support_cards)\s+has\s+(?:any\s*\([^)]*|all\s*\([^)]*|)([^,\n()]*)$/i);
    if (supportMatch?.index !== undefined) {
        return {
            from: textBeforeCursor.length - supportMatch[1].length,
            token: supportMatch[1],
            type: "support",
        };
    }

    return null;
}

function getValueCompletionContext(textBeforeCursor: string): { from: number; token: string; field: string } | null {
    const match = textBeforeCursor.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|!=|<>|>=|<=|>|<)\s*("[^"]*|'[^']*|[^,\n()]*)$/i);
    if (match?.index === undefined) return null;
    return {
        from: textBeforeCursor.length - match[2].length,
        token: match[2].replace(/^['"]/, ""),
        field: match[1].toLowerCase(),
    };
}

function getActiveQueryClause(textBeforeCursor: string): "select" | "where" | "group" | "having" | "order" | "limit" | "offset" | "root" {
    const lower = textBeforeCursor.toLowerCase();
    const clauses = [
        { clause: "group" as const, index: lower.lastIndexOf("group by") },
        { clause: "having" as const, index: lower.lastIndexOf("having") },
        { clause: "order" as const, index: lower.lastIndexOf("order by") },
        { clause: "select" as const, index: lower.lastIndexOf("select") },
        { clause: "where" as const, index: lower.lastIndexOf("where") },
        { clause: "limit" as const, index: lower.lastIndexOf("limit") },
        { clause: "offset" as const, index: lower.lastIndexOf("offset") },
    ].filter((entry) => entry.index >= 0);
    if (!clauses.length) return "root";
    clauses.sort((left, right) => right.index - left.index);
    return clauses[0].clause;
}

function isEmptyCompletionTrigger(textBeforeCursor: string, activeClause: ReturnType<typeof getActiveQueryClause>): boolean {
    if (activeClause === "select") return /(?:\bselect|,)\s*$/i.test(textBeforeCursor);
    if (activeClause === "group") return /(?:\bgroup\s+by|,)\s*$/i.test(textBeforeCursor);
    if (activeClause === "order") return /\border\s+by\s*$/i.test(textBeforeCursor);
    if (activeClause === "having") return /\bhaving\s*$/i.test(textBeforeCursor);
    if (activeClause === "where") return /(?:\bwhere|\band|\bor|\()\s*$/i.test(textBeforeCursor);
    return false;
}

function findTopLevelQueryClause(input: string, phrase: string): number {
    const lower = input.toLowerCase();
    let quote: string | null = null;
    let depth = 0;
    for (let index = 0; index <= input.length - phrase.length; index++) {
        const char = input[index];
        if (quote) {
            if (char === "\\" && index + 1 < input.length) index++;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        if (depth > 0) continue;
        if (lower.slice(index, index + phrase.length) === phrase) {
            const before = index === 0 ? " " : lower[index - 1];
            const after = index + phrase.length >= lower.length ? " " : lower[index + phrase.length];
            if (!/[a-z0-9_]/.test(before) && !/[a-z0-9_]/.test(after)) return index;
        }
    }
    return -1;
}

function splitQueryCommaList(input: string): string[] {
    const parts: string[] = [];
    let quote: string | null = null;
    let depth = 0;
    let start = 0;
    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        if (quote) {
            if (char === "\\" && index + 1 < input.length) index++;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        else if (char === "," && depth === 0) {
            parts.push(input.slice(start, index).trim());
            start = index + 1;
        }
    }
    const tail = input.slice(start).trim();
    if (tail) parts.push(tail);
    return parts;
}

function parseQueryClauses(query: string) {
    const trimmed = query.trim().replace(/;\s*$/, "");
    const whereIndex = findTopLevelQueryClause(trimmed, "where");
    const groupIndex = findTopLevelQueryClause(trimmed, "group by");
    const havingIndex = findTopLevelQueryClause(trimmed, "having");
    const orderIndex = findTopLevelQueryClause(trimmed, "order by");
    const limitIndex = findTopLevelQueryClause(trimmed, "limit");
    const offsetIndex = findTopLevelQueryClause(trimmed, "offset");
    const clauseIndexes = [whereIndex, groupIndex, havingIndex, orderIndex, limitIndex, offsetIndex].filter((index) => index >= 0);
    const firstClauseIndex = clauseIndexes.length ? Math.min(...clauseIndexes) : trimmed.length;
    const sectionEnd = (start: number, candidates: number[]) => {
        const next = candidates.filter((index) => index > start);
        return next.length ? Math.min(...next) : trimmed.length;
    };
    const startsWithSelect = trimmed.toLowerCase().startsWith("select ");
    return {
        startsWithSelect,
        selectText: startsWithSelect ? trimmed.slice("select ".length, firstClauseIndex).trim() : "",
        whereText: whereIndex >= 0 ? trimmed.slice(whereIndex + "where".length, sectionEnd(whereIndex, [groupIndex, havingIndex, orderIndex, limitIndex, offsetIndex])).trim() : "",
        groupText: groupIndex >= 0 ? trimmed.slice(groupIndex + "group by".length, sectionEnd(groupIndex, [havingIndex, orderIndex, limitIndex, offsetIndex])).trim() : "",
        havingText: havingIndex >= 0 ? trimmed.slice(havingIndex + "having".length, sectionEnd(havingIndex, [orderIndex, limitIndex, offsetIndex])).trim() : "",
        orderText: orderIndex >= 0 ? trimmed.slice(orderIndex + "order by".length, sectionEnd(orderIndex, [limitIndex, offsetIndex])).trim() : "",
        limitText: limitIndex >= 0 ? trimmed.slice(limitIndex + "limit".length, sectionEnd(limitIndex, [offsetIndex])).trim() : "",
        offsetText: offsetIndex >= 0 ? trimmed.slice(offsetIndex + "offset".length).trim() : "",
    };
}

const QUERY_FIELD_OUTPUT_ALIASES: Record<string, string> = {
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
    sp: "total_skill_points",
    full_room: "is_full_room",
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
    const functionMatch = normalized.match(/^(activation_rate|activated_entries|skill_activation_rate|skill_activations)\s*\(\s*([^)]*?)\s*\)$/);
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

function getOrderDirectionCompletionContext(textBeforeCursor: string): { from: number; token: string } | null {
    if (getActiveQueryClause(textBeforeCursor) !== "order") return null;
    const match = textBeforeCursor.match(/\border\s+by\s+[A-Za-z_][A-Za-z0-9_]*\s+([A-Za-z]*)$/i);
    if (!match) return null;
    const token = match[1];
    if (token && !/^(a|as|asc|d|de|des|desc)$/i.test(token)) return null;
    return { from: textBeforeCursor.length - token.length, token };
}

function queryCompletionSource(skillEntries: SkillNameEntry[], characterEntries: QueryEntityEntry[], supportCardEntries: QueryEntityEntry[]) {
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

function queryEmptyCompletionTriggerExtension() {
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

function formatValue(column: QueryColumn, value: unknown): string {
    if (value == null) return "-";
    if (column.key === "strategy" || column.key === "winner_strategy") {
        const strategy = Number(value);
        return STRATEGY_NAMES[strategy] ?? `Style ${strategy}`;
    }
    if (column.key === "card_id" || column.key === "winner_card_id") {
        const cardId = Number(value);
        return UMDatabaseWrapper.cards[cardId]?.name ?? `Card ${cardId}`;
    }
    if (column.key === "chara_id" || column.key === "winner_chara_id") {
        const charaId = Number(value);
        return UMDatabaseWrapper.charas[charaId]?.name ?? `Character ${charaId}`;
    }
    if (column.type === "percent") return `${(Number(value) * 100).toFixed(1)}%`;
    if (column.type === "number" && typeof value === "number") {
        return Number.isInteger(value) ? value.toLocaleString() : Math.round(value).toLocaleString();
    }
    return String(value);
}

function asFiniteNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function renderQueryCell(column: QueryColumn, row: Record<string, unknown>): React.ReactNode {
    const value = row[column.key];
    if (value == null) return formatValue(column, value);

    if (column.key === "strategy" || column.key === "winner_strategy") {
        const strategy = asFiniteNumber(value);
        const label = formatValue(column, value);
        return (
            <span className="query-style-result-badge">
                {strategy !== null && (
                    <span
                        className="query-style-result-dot"
                        style={{ background: STRATEGY_COLORS[strategy] ?? "#94a3b8" }}
                    />
                )}
                <span>{label}</span>
                {row.is_debuffer === true && <span className="query-debuffer-badge">Debuffer</span>}
            </span>
        );
    }

    if (column.type === "percent") {
        const percent = Math.max(0, Math.min(100, Number(value) * 100));
        return (
            <span className="query-percent-cell">
                <span className="query-percent-bar" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                </span>
                <span>{formatValue(column, value)}</span>
            </span>
        );
    }

    if (typeof value === "boolean") {
        return (
            <span className={`query-boolean-pill${value ? " query-boolean-pill--true" : ""}`}>
                {value ? "Yes" : "No"}
            </span>
        );
    }

    if (column.key === "card_id" || column.key === "winner_card_id") {
        const cardId = asFiniteNumber(value);
        if (cardId === null) return formatValue(column, value);
        const iconUrl = AssetLoader.getCharaThumb(cardId);
        const label = formatValue(column, value);
        return (
            <span className="query-character-cell">
                {iconUrl && (
                    <span className="query-character-portrait">
                        <img
                            src={iconUrl}
                            alt=""
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    </span>
                )}
                <span>{label}</span>
            </span>
        );
    }

    if (column.key !== "chara_id" && column.key !== "winner_chara_id") return formatValue(column, value);

    const charaId = asFiniteNumber(value);
    if (charaId === null) return formatValue(column, value);
    const iconUrl = getCharaIcon(charaId);
    const label = formatValue(column, value);

    return (
        <span className="query-character-cell">
            {iconUrl && (
                <span className="query-character-portrait">
                    <img
                        src={iconUrl}
                        alt=""
                        onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                </span>
            )}
            <span>{label}</span>
        </span>
    );
}

function renderQueryHeader(column: QueryColumn): React.ReactNode {
    const skillMetric = column.key.match(/^(activation_rate|activated_entries)_(\d+)$/);
    if (!skillMetric) return column.label;
    const skillId = Number(skillMetric[2]);
    const iconSkillId = resolveIconSkillId(skillId);
    const iconId = UMDatabaseWrapper.skills[iconSkillId]?.iconId;
    const iconUrl = iconId ? AssetLoader.getSkillIcon(iconId) : null;
    const name = UMDatabaseWrapper.skillNameWithEnglishFallback(skillId);
    return (
        <span className="query-skill-header">
            {iconUrl && <img src={iconUrl} alt="" />}
            <span>{skillMetric[1] === "activation_rate" ? "Activation" : "Activated"}: {name}</span>
        </span>
    );
}

const QueryHelpSnippet: React.FC<{
    query: string;
    title?: string;
    onUse?: () => void;
    extensions: ReturnType<typeof queryHighlightExtension>[];
}> = ({ query, title = "Query", onUse, extensions }) => (
    <div className="query-help-snippet">
        <div className="query-help-snippet-header">
            <span>{title}</span>
            {onUse && (
                <button className="query-help-use-btn" type="button" onClick={onUse}>
                    Use Query
                </button>
            )}
        </div>
        <CodeMirror
            value={query}
            extensions={[sqlLang({ dialect: SQLite }), ...extensions]}
            theme={oneDark}
            editable={false}
            basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
            }}
            className="query-help-code"
        />
    </div>
);

const QueryHelpModal: React.FC<{
    onClose: () => void;
    onUseExample: (query: string) => void;
    snippetExtensions: ReturnType<typeof queryHighlightExtension>[];
}> = ({ onClose, onUseExample, snippetExtensions }) => (
    <div className="query-help-backdrop" onClick={onClose}>
        <div className="query-help-modal" role="dialog" aria-modal="true" aria-labelledby="umalogs-query-help-title" onClick={(event) => event.stopPropagation()}>
            <div className="query-help-header">
                <div>
                    <h4 id="umalogs-query-help-title">UmaLogs Query Help</h4>
                    <p>Queries use a small SQL-like language for the selected UmaLogs dataset. Start from race entries; no FROM clause is needed.</p>
                </div>
                <button className="query-help-close" type="button" onClick={onClose} aria-label="Close query help">x</button>
            </div>

            <div className="query-help-body">
                <section>
                    <h5>Shape</h5>
                    <p>Clauses are optional. Selecting a dimension such as <code>character</code>, <code>card</code>, or <code>style</code> groups by that dimension automatically.</p>
                    <QueryHelpSnippet
                        query={`select character, style, entries, wins, win_rate
where style = "End Closer" and has_skill(Angling and Scheming)
group by character, style
order by wins desc
limit 20`}
                        extensions={snippetExtensions}
                    />
                </section>

                <section>
                    <h5>Samples and Pages</h5>
                    <p>Use <code>having</code> to remove aggregate rows with small samples. It accepts one selected metric comparison. Use <code>offset</code> with <code>limit</code> to fetch later result pages.</p>
                    <QueryHelpSnippet
                        query={`select character, style, entries, wins, win_rate
group by character, style
having entries >= 20
order by win_rate desc
limit 20
offset 20`}
                        extensions={snippetExtensions}
                    />
                </section>

                <section>
                    <h5>Fields</h5>
                    <div className="query-help-grid">
                        <div>
                            <strong>Filters and groups</strong>
                            <code>{FILTER_FIELDS.join(", ")}</code>
                        </div>
                        <div>
                            <strong>Outputs</strong>
                            <code>{SELECT_FIELDS.join(", ")}</code>
                        </div>
                    </div>
                </section>

                <section>
                    <h5>Filters</h5>
                    <p>Comparisons support <code>=</code>, <code>!=</code>, <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, and <code>&gt;=</code>. Combine filters with <code>and</code>, <code>or</code>, <code>not</code>, and parentheses.</p>
                    <QueryHelpSnippet
                        query={`where style = "End Closer" and speed >= 1700
  and won = true
  and (weather = "rainy" or room_front_count = 0)
  and team_pace_count >= 2`}
                        extensions={snippetExtensions}
                    />
                </section>

                <section>
                    <h5>Skills and Arrays</h5>
                    <p>Skill names and support card names can be written directly in their matching contexts. Recognized skills show an icon in the editor, and numeric IDs also work.</p>
                    <QueryHelpSnippet
                        query={`where has_skill(Angling and Scheming)
  and learned has any (Taking the Lead, Right-Handed)
  and activated has all (Angling and Scheming, Taking the Lead)
  and support_cards has [Fire at My Heels] Kitasan Black`}
                        extensions={snippetExtensions}
                    />
                    <div className="query-help-reference-list">
                        {HELP_SKILL_FIELDS.map((line) => <code key={line}>{line}</code>)}
                    </div>
                </section>

                <section>
                    <h5>Teams and Replays</h5>
                    <p><code>team</code> means the current entry's team. Use <code>any_team</code>, <code>winning_team</code>, or <code>losing_team</code> to match teams across the whole race. <code>has all</code> requires each listed <code>member(...)</code> to be a different character on the same team.</p>
                    <QueryHelpSnippet
                        query={`where winning_team has member(character = [Wild Frontier])
  and losing_team has member(character = [Starlight Beat])`}
                        extensions={snippetExtensions}
                    />
                    <p>Select <strong>Replays</strong> as the output to run the written <code>where</code> clause as a replay search. Race-scoped team predicates are preserved when the Replay results open.</p>
                </section>

                <section>
                    <h5>Examples</h5>
                    <div className="query-help-examples">
                        {HELP_EXAMPLES.map((example) => (
                            <QueryHelpSnippet
                                key={example.title}
                                title={example.title}
                                query={example.query}
                                extensions={snippetExtensions}
                                onUse={() => onUseExample(example.query)}
                            />
                        ))}
                    </div>
                </section>

                <section>
                    <h5>Limits</h5>
                    <p>Queries do not support joins, subqueries, aliases, formulas, or arbitrary SQL. Results are capped at 100 rows. Skill activation metrics are observed rates from UmaLogs entries.</p>
                    <p>The selected fields, grouping, ordering, and limit apply to Aggregate output. Replay output uses the <code>where</code> clause and Replay's own sorting and pagination.</p>
                </section>
            </div>
        </div>
    </div>
);

const QueriesTab: React.FC<QueriesTabProps> = ({ cmId, courseId, apiBase, onFindReplays, initialQuery }) => {
    const [query, setQuery] = useState(() => {
        const requestedQuery = initialQuery?.trim();
        if (requestedQuery) return requestedQuery;
        try {
            return localStorage.getItem(QUERY_DRAFT_STORAGE_KEY)?.trim() || DEFAULT_QUERY;
        } catch {
            return DEFAULT_QUERY;
        }
    });
    const [result, setResult] = useState<TextQueryResponse | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [outputMode, setOutputMode] = useState<"aggregate" | "replays">("aggregate");
    const skillNameEntries = useMemo(buildSkillNameEntries, []);
    const characterNameEntries = useMemo(buildCharacterNameEntries, []);
    const supportCardNameEntries = useMemo(buildSupportCardNameEntries, []);
    useEffect(() => {
        const requestedQuery = initialQuery?.trim();
        if (requestedQuery) setQuery(requestedQuery);
    }, [initialQuery]);
    useEffect(() => {
        try {
            localStorage.setItem(QUERY_DRAFT_STORAGE_KEY, query);
        } catch {
            // Draft persistence is optional when browser storage is unavailable.
        }
    }, [query]);
    const compiledQuery = useMemo(
        () => compileFriendlyNames(query, skillNameEntries, characterNameEntries, supportCardNameEntries),
        [characterNameEntries, query, skillNameEntries, supportCardNameEntries],
    );
    const queryEditorExtensions = useMemo(
        () => [
            sqlLang({ dialect: SQLite }),
            closeBrackets(),
            autocompletion({
                override: [queryCompletionSource(skillNameEntries, characterNameEntries, supportCardNameEntries)],
                activateOnTyping: true,
            }),
            queryEmptyCompletionTriggerExtension(),
            queryHighlightExtension(skillNameEntries, characterNameEntries, supportCardNameEntries),
        ],
        [characterNameEntries, skillNameEntries, supportCardNameEntries],
    );
    const helpSnippetExtensions = useMemo(
        () => [queryHighlightExtension(skillNameEntries, characterNameEntries, supportCardNameEntries)],
        [characterNameEntries, skillNameEntries, supportCardNameEntries],
    );

    const runQuery = (offsetOverride?: number) => {
        if (!cmId || !courseId || !query.trim()) return;
        const requestedOutputMode = outputMode;
        setQueryLoading(true);
        setQueryError(null);
        setResult(null);
        fetch(buildTextQueryUrl(cmId, courseId, apiBase ?? UMA_LOGS_API_BASE), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: compiledQuery,
                compileOnly: requestedOutputMode === "replays",
                ...(offsetOverride === undefined ? {} : { offset: offsetOverride }),
            }),
        })
            .then(async (response) => {
                if (!response.ok) {
                    let message = `HTTP ${response.status} - query failed`;
                    try {
                        const body = await response.json() as { error?: string };
                        if (body.error) message = body.error;
                    } catch {
                        // Use the generic status message.
                    }
                    if (response.status === 405) {
                        message = "The query backend route is not deployed yet. The editor is loaded from local code, but /queries/run is still missing on the live Worker.";
                    }
                    throw new Error(message);
                }
                return response.json() as Promise<TextQueryResponse>;
            })
            .then((json) => {
                if (requestedOutputMode === "replays") {
                    if (!json.querySpec?.where) throw new Error("Replay output requires a WHERE clause.");
                    if (!onFindReplays) throw new Error("Replay output is unavailable here.");
                    onFindReplays(json.querySpec);
                    setQueryLoading(false);
                    return;
                }
                setResult(json);
                setQueryLoading(false);
            })
            .catch((error: Error) => {
                setQueryError(/statement timeout|timed out/i.test(error.message)
                    ? "Query timed out. Narrow the cohort with a more selective filter."
                    : error.message);
                setQueryLoading(false);
            });
    };

    if (!cmId || !courseId) return <div className="exp-empty">Select a dataset first.</div>;

    return (
        <div className="query-tab">
            <div className="query-editor-panel">
                <div className="query-editor-header">
                    <div>
                        <h4>UmaLogs Query</h4>
                        <p>Write a constrained SQL-like query over race entries, learned skills, activated skills, support cards, and character data.</p>
                    </div>
                    <div className="query-editor-actions">
                        <div className="query-output-toggle" role="group" aria-label="Query output">
                            <button
                                type="button"
                                className={outputMode === "aggregate" ? "active" : ""}
                                aria-pressed={outputMode === "aggregate"}
                                onClick={() => setOutputMode("aggregate")}
                            >
                                Aggregate
                            </button>
                            <button
                                type="button"
                                className={outputMode === "replays" ? "active" : ""}
                                aria-pressed={outputMode === "replays"}
                                onClick={() => setOutputMode("replays")}
                                disabled={!onFindReplays}
                            >
                                Replays
                            </button>
                        </div>
                        <button className="query-help-btn" type="button" onClick={() => setHelpOpen(true)}>
                            Help
                        </button>
                        <button className="exp-run-btn" onClick={() => runQuery()} disabled={queryLoading || !query.trim()}>
                            {queryLoading ? "Running..." : outputMode === "replays" ? "Find Replays" : "Run Query"}
                        </button>
                    </div>
                </div>

                <CodeMirror
                    value={query}
                    onChange={(value) => {
                        setQuery(value);
                        setResult(null);
                        setQueryError(null);
                    }}
                    extensions={queryEditorExtensions}
                    theme={oneDark}
                    basicSetup={{ lineNumbers: false, foldGutter: false }}
                    className="query-code-editor"
                />

            </div>

            {queryError && <div className="exp-empty">{queryError}</div>}

            {result && (
                <div className="query-card">
                    <div className="query-results-header">
                        <h5>Results</h5>
                        <div className="query-results-meta">
                            <span>{result.rows.length.toLocaleString()} row(s), offset {result.offset.toLocaleString()}, limit {result.limit}{result.source === "aggregate-cache" ? ", aggregate snapshot" : ""}</span>
                            <button
                                className="query-help-btn"
                                type="button"
                                disabled={queryLoading || result.offset === 0}
                                onClick={() => runQuery(Math.max(0, result.offset - result.limit))}
                            >
                                Previous
                            </button>
                            <button
                                className="query-help-btn"
                                type="button"
                                disabled={queryLoading || result.rows.length < result.limit || result.offset + result.limit > 10_000}
                                onClick={() => runQuery(result.offset + result.limit)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                    {result.rows.length === 0 ? (
                        <div className="exp-empty exp-empty--compact">No matches.</div>
                    ) : (
                        <div className="query-table-wrap">
                            <table className="exp-table query-breakdown-table">
                                <thead>
                                    <tr>
                                        {result.columns.map((column) => (
                                            <th key={column.key} className={`exp-th ${column.type !== "dimension" ? "exp-th--r" : ""}`}>
                                                {renderQueryHeader(column)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="exp-row">
                                            {result.columns.map((column) => (
                                                <td key={column.key} className={`exp-td ${column.type !== "dimension" ? "exp-td--r" : ""}`}>
                                                    {renderQueryCell(column, row)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {helpOpen && (
                <QueryHelpModal
                    onClose={() => setHelpOpen(false)}
                    snippetExtensions={helpSnippetExtensions}
                    onUseExample={(exampleQuery) => {
                        setQuery(exampleQuery);
                        setHelpOpen(false);
                        setResult(null);
                        setQueryError(null);
                    }}
                />
            )}
        </div>
    );
};

export default QueriesTab;
