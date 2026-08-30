import {
    SUPPORT_CARD_LB_ANY,
    type CharacterFeature,
    type CharacterRequirement,
    type SortKey,
} from "./explorerShared";
import type {
    ReplayScopedTeamFilter,
    ReplayRaceFilter,
    ReplaySearchRequest,
    ReplaySortDir,
    ReplaySortKey,
    ReplayTeamMemberFilter,
} from "./replaysShared";

export type UmaLogsQuerySubject = "entries" | "teams" | "replays";
export type UmaLogsQueryBooleanOperator = "and" | "or";
export type UmaLogsQueryComparisonOperator = "=" | "!=" | "<" | "<=" | ">" | ">=";
export type UmaLogsQueryArrayMode = "has" | "any" | "all";
export type UmaLogsQueryTeamScope = "current" | "any" | "winner" | "loser";

export type UmaLogsQueryPredicate =
    | {
        type: "group";
        operator: UmaLogsQueryBooleanOperator;
        predicates: UmaLogsQueryPredicate[];
    }
    | {
        type: "not";
        predicate: UmaLogsQueryPredicate;
    }
    | {
        type: "compare";
        field: string;
        operator: UmaLogsQueryComparisonOperator;
        value: number | boolean | string;
    }
    | {
        type: "array";
        field: "learned" | "activated" | "support_cards";
        mode: UmaLogsQueryArrayMode;
        values: number[];
        supportCardLimitBreak?: number;
    }
    | {
        type: "member";
        predicate: UmaLogsQueryPredicate;
    }
    | {
        type: "team";
        scope: UmaLogsQueryTeamScope;
        distinctMembers: boolean;
        members: UmaLogsQueryPredicate[];
        excludedMembers: UmaLogsQueryPredicate[];
    }
    | {
        type: "race_teams";
        distinctTeams: boolean;
        teams: Array<{
            scope: Exclude<UmaLogsQueryTeamScope, "current">;
            predicate: UmaLogsQueryPredicate;
        }>;
    };

export type UmaLogsQueryOrder = {
    field: string;
    direction: "asc" | "desc";
};

export type UmaLogsQueryHaving = {
    field: string;
    operator: UmaLogsQueryComparisonOperator;
    value: number;
};

export type UmaLogsQuerySpec = {
    version: 1;
    subject: UmaLogsQuerySubject;
    where: UmaLogsQueryPredicate | null;
    select: string[];
    groupBy: string[];
    orderBy: UmaLogsQueryOrder[];
    limit: number;
    having?: UmaLogsQueryHaving | null;
    offset?: number;
};

export type UmaLogsQueryValidationResult =
    | { ok: true; spec: UmaLogsQuerySpec }
    | { ok: false; error: string };

export function validateUmaLogsQuerySpec(
    input: unknown,
    expectedSubject?: UmaLogsQuerySubject,
): UmaLogsQueryValidationResult {
    if (!input || typeof input !== "object") return { ok: false, error: "Query specification must be an object" };
    try {
        if (JSON.stringify(input).length > 20_000) return { ok: false, error: "Query specification is too large" };
    } catch {
        return { ok: false, error: "Query specification is not serializable" };
    }

    const record = input as Record<string, unknown>;
    if (record.version !== 1) return { ok: false, error: "Unsupported query specification version" };
    if (!["entries", "teams", "replays"].includes(String(record.subject))) {
        return { ok: false, error: "Unknown query subject" };
    }
    if (expectedSubject && record.subject !== expectedSubject) {
        return { ok: false, error: `Query specification must target ${expectedSubject}` };
    }
    if (!Array.isArray(record.select) || record.select.length > 40 || !record.select.every((field) => typeof field === "string" && field.length > 0 && field.length <= 64)) {
        return { ok: false, error: "Invalid selected fields" };
    }
    if (!Array.isArray(record.groupBy) || record.groupBy.length > 20 || !record.groupBy.every((field) => typeof field === "string" && field.length > 0 && field.length <= 64)) {
        return { ok: false, error: "Invalid grouped fields" };
    }
    if (!Array.isArray(record.orderBy) || record.orderBy.length > 10 || !record.orderBy.every((order) => {
        if (!order || typeof order !== "object") return false;
        const item = order as Record<string, unknown>;
        return typeof item.field === "string" && item.field.length > 0 && item.field.length <= 64 && ["asc", "desc"].includes(String(item.direction));
    })) {
        return { ok: false, error: "Invalid ordering fields" };
    }
    if (!Number.isInteger(record.limit) || Number(record.limit) < 1 || Number(record.limit) > 100) {
        return { ok: false, error: "Query limit must be between 1 and 100" };
    }
    if (record.offset !== undefined && (!Number.isInteger(record.offset) || Number(record.offset) < 0 || Number(record.offset) > 10_000)) {
        return { ok: false, error: "Query offset must be between 0 and 10000" };
    }
    if (record.having !== undefined && record.having !== null) {
        if (typeof record.having !== "object") return { ok: false, error: "Invalid HAVING filter" };
        const having = record.having as Record<string, unknown>;
        if (typeof having.field !== "string" || having.field.length < 1 || having.field.length > 64
            || !["=", "!=", "<", "<=", ">", ">="].includes(String(having.operator))
            || typeof having.value !== "number" || !Number.isFinite(having.value)) {
            return { ok: false, error: "Invalid HAVING filter" };
        }
    }

    let predicateCount = 0;
    const validatePredicate = (predicate: unknown, depth: number): string | null => {
        predicateCount += 1;
        if (depth > 8) return "Query filters are nested too deeply";
        if (predicateCount > 80) return "Query has too many filter predicates";
        if (!predicate || typeof predicate !== "object") return "Query predicate must be an object";
        const item = predicate as Record<string, unknown>;
        if (item.type === "group") {
            if (!["and", "or"].includes(String(item.operator)) || !Array.isArray(item.predicates) || item.predicates.length < 1 || item.predicates.length > 40) {
                return "Invalid predicate group";
            }
            for (const child of item.predicates) {
                const error = validatePredicate(child, depth + 1);
                if (error) return error;
            }
            return null;
        }
        if (item.type === "not" || item.type === "member") return validatePredicate(item.predicate, depth + 1);
        if (item.type === "compare") {
            if (typeof item.field !== "string" || item.field.length < 1 || item.field.length > 64) return "Invalid comparison field";
            if (!["=", "!=", "<", "<=", ">", ">="].includes(String(item.operator))) return "Invalid comparison operator";
            if (!["string", "number", "boolean"].includes(typeof item.value)) return "Invalid comparison value";
            if (typeof item.value === "number" && !Number.isFinite(item.value)) return "Comparison value must be finite";
            if (typeof item.value === "string" && item.value.length > 256) return "Comparison string is too long";
            return null;
        }
        if (item.type === "array") {
            if (!["learned", "activated", "support_cards"].includes(String(item.field)) || !["has", "any", "all"].includes(String(item.mode))) {
                return "Invalid array membership predicate";
            }
            if (!Array.isArray(item.values) || item.values.length < 1 || item.values.length > 20 || !item.values.every((value) => Number.isInteger(value) && Number(value) > 0)) {
                return "Array membership expects positive integer ids";
            }
            if (item.supportCardLimitBreak !== undefined && (!Number.isInteger(item.supportCardLimitBreak) || Number(item.supportCardLimitBreak) < 0 || Number(item.supportCardLimitBreak) > 4)) {
                return "Support-card limit break must be between 0 and 4";
            }
            return null;
        }
        if (item.type === "team") {
            if (!["current", "any", "winner", "loser"].includes(String(item.scope)) || typeof item.distinctMembers !== "boolean") return "Invalid team predicate";
            if (!Array.isArray(item.members) || item.members.length > 3 || !Array.isArray(item.excludedMembers) || item.excludedMembers.length > 6) {
                return "Team filters support up to 3 required and 6 excluded members";
            }
            for (const child of [...item.members, ...item.excludedMembers]) {
                const error = validatePredicate(child, depth + 1);
                if (error) return error;
            }
            return null;
        }
        if (item.type === "race_teams") {
            if (typeof item.distinctTeams !== "boolean" || !Array.isArray(item.teams) || item.teams.length < 1 || item.teams.length > 4) {
                return "Replay queries support 1 to 4 team predicates";
            }
            for (const team of item.teams) {
                if (!team || typeof team !== "object") return "Invalid replay team predicate";
                const scopedTeam = team as Record<string, unknown>;
                if (!["any", "winner", "loser"].includes(String(scopedTeam.scope))) return "Invalid replay team scope";
                const error = validatePredicate(scopedTeam.predicate, depth + 1);
                if (error) return error;
            }
            return null;
        }
        return `Unknown query predicate type "${String(item.type)}"`;
    };

    if (record.where !== null) {
        const error = validatePredicate(record.where, 0);
        if (error) return { ok: false, error };
    }
    return { ok: true, spec: input as UmaLogsQuerySpec };
}

const REQUIREMENT_FIELD_MAP: Record<Exclude<CharacterRequirement["property"], "none" | "skill" | "supportCard" | "isDebuffer">, string> = {
    speed: "speed",
    stamina: "stamina",
    pow: "power",
    guts: "guts",
    wiz: "wit",
    aptGround: "apt_ground",
    aptDistance: "apt_distance",
    aptStyle: "apt_style",
    totalSkillPoints: "total_skill_points",
    rankScore: "rank_score",
    careerWinCount: "career_wins",
    deckRaceBonus: "deck_race_bonus",
};

function groupPredicates(operator: UmaLogsQueryBooleanOperator, predicates: Array<UmaLogsQueryPredicate | null>): UmaLogsQueryPredicate | null {
    const present = predicates.filter((predicate): predicate is UmaLogsQueryPredicate => predicate !== null);
    if (present.length === 0) return null;
    if (present.length === 1) return present[0];
    return { type: "group", operator, predicates: present };
}

function maybeNot(predicate: UmaLogsQueryPredicate, shouldNegate: boolean): UmaLogsQueryPredicate {
    return shouldNegate ? { type: "not", predicate } : predicate;
}

export function characterRequirementToQueryPredicate(requirement: CharacterRequirement): UmaLogsQueryPredicate | null {
    let predicate: UmaLogsQueryPredicate | null = null;
    if (requirement.property === "none") return null;
    if (requirement.property === "isDebuffer") {
        predicate = {
            type: "compare",
            field: "is_debuffer",
            operator: "=",
            value: true,
        };
    } else if (requirement.property === "skill" && requirement.skillId !== null) {
        predicate = {
            type: "array",
            field: requirement.skillMode === "activated" ? "activated" : "learned",
            mode: "has",
            values: [requirement.skillId],
        };
    } else if (requirement.property === "supportCard" && requirement.supportCardId !== null) {
        predicate = {
            type: "array",
            field: "support_cards",
            mode: "has",
            values: [requirement.supportCardId],
            supportCardLimitBreak: requirement.supportCardLb === SUPPORT_CARD_LB_ANY
                ? undefined
                : requirement.supportCardLb,
        };
        predicate = maybeNot(predicate, !requirement.supportCardPresent);
    } else if (requirement.property !== "skill" && requirement.property !== "supportCard") {
        predicate = {
            type: "compare",
            field: REQUIREMENT_FIELD_MAP[requirement.property],
            operator: requirement.statOp,
            value: requirement.statValue,
        };
    }
    return predicate ? maybeNot(predicate, requirement.truthMode === "requireNot") : null;
}

export function replayMemberToQueryPredicate(member: ReplayTeamMemberFilter): UmaLogsQueryPredicate | null {
    const conditions: Array<UmaLogsQueryPredicate | null> = [
        member.cardId === null ? null : {
            type: "compare",
            field: "character",
            operator: member.characterMatchMode === "isNot" ? "!=" : "=",
            value: member.cardId,
        },
        member.strategy === null ? null : {
            type: "compare",
            field: "style",
            operator: "=",
            value: member.strategy,
        },
        ...member.requirements.map(characterRequirementToQueryPredicate),
    ];
    const predicate = groupPredicates("and", conditions);
    return predicate ? { type: "member", predicate } : null;
}

export function characterFeatureToQueryPredicate(feature: CharacterFeature): UmaLogsQueryPredicate | null {
    const member = replayMemberToQueryPredicate({
        characterMatchMode: feature.characterMatchMode,
        cardId: feature.cardId,
        strategy: feature.cardStrategy,
        requirements: feature.requirements,
    });
    return member ? maybeNot(member, feature.cardMode === "exclude") : null;
}

export function buildExplorerQuerySpec(
    features: CharacterFeature[],
    sortKey: SortKey,
    sortDesc: boolean,
    raceFilters: ReplayRaceFilter[] = [],
): UmaLogsQuerySpec {
    const orderField: Record<SortKey, string> = {
        label: "character",
        entries: "entries",
        teams: "teams",
        wins: "wins",
        teamWins: "team_wins",
        awPct: "win_rate",
    };
    const includedMembers = features
        .filter((feature) => feature.cardMode === "include")
        .map((feature) => characterFeatureToQueryPredicate({ ...feature, cardMode: "include" }))
        .filter((predicate): predicate is UmaLogsQueryPredicate => predicate !== null);
    const excludedMembers = features
        .filter((feature) => feature.cardMode === "exclude")
        .map((feature) => replayMemberToQueryPredicate({
            characterMatchMode: feature.characterMatchMode,
            cardId: feature.cardId,
            strategy: feature.cardStrategy,
            requirements: feature.requirements,
        }))
        .filter((predicate): predicate is UmaLogsQueryPredicate => predicate !== null);
    const teamPredicate = includedMembers.length > 0 || excludedMembers.length > 0
        ? {
            type: "team" as const,
            scope: "current" as const,
            distinctMembers: true,
            members: includedMembers,
            excludedMembers,
        }
        : null;
    const racePredicate = groupPredicates("and", raceFilters.map((filter) => ({
        type: "compare",
        field: filter.field,
        operator: filter.operator,
        value: filter.value,
    })));
    return {
        version: 1,
        subject: "teams",
        where: groupPredicates("and", [racePredicate, teamPredicate]),
        select: ["character", "style", "is_debuffer", "entries", "teams", "wins", "team_wins", "team_win_rate"],
        groupBy: ["character", "style", "is_debuffer"],
        orderBy: [{ field: orderField[sortKey], direction: sortDesc ? "desc" : "asc" }],
        limit: 100,
    };
}

export function buildExplorerQueryRequest(
    features: CharacterFeature[],
    sortKey: SortKey,
    sortDesc: boolean,
    selectedRowKey: string | null,
    raceFilters: ReplayRaceFilter[] = [],
) {
    return {
        querySpec: buildExplorerQuerySpec(features, sortKey, sortDesc, raceFilters),
        sortKey,
        sortDesc,
        selectedRowKey,
    };
}

export function buildReplayQuerySpec(
    teamFilters: ReplayScopedTeamFilter[],
    sortKey: ReplaySortKey,
    sortDir: ReplaySortDir,
    raceFilters: ReplayRaceFilter[] = [],
): UmaLogsQuerySpec {
    const teams = teamFilters.flatMap((filter) => {
        const members = filter.members
            .map(replayMemberToQueryPredicate)
            .filter((predicate): predicate is UmaLogsQueryPredicate => predicate !== null);
        if (members.length === 0) return [];
        return [{
            scope: filter.scope,
            predicate: {
                type: "team" as const,
                scope: filter.scope,
                distinctMembers: true,
                members,
                excludedMembers: [],
            },
        }];
    });
    const racePredicate = groupPredicates("and", raceFilters.map((filter) => ({
        type: "compare",
        field: filter.field,
        operator: filter.operator,
        value: filter.value,
    })));
    const teamPredicate: UmaLogsQueryPredicate | null = teams.length > 0
        ? { type: "race_teams", distinctTeams: true, teams }
        : null;
    return {
        version: 1,
        subject: "replays",
        where: groupPredicates("and", [racePredicate, teamPredicate]),
        select: ["replay", "date", "winner_character", "winner_style", "finish_time"],
        groupBy: [],
        orderBy: [{ field: sortKey, direction: sortDir }],
        limit: 100,
    };
}

export function buildReplaySearchRequest(
    teamFilters: ReplayScopedTeamFilter[],
    sortKey: ReplaySortKey,
    sortDir: ReplaySortDir,
    raceFilters: ReplayRaceFilter[] = [],
    uqlWhere: string | null = null,
    entryQuerySpec: UmaLogsQuerySpec | null = null,
): Omit<ReplaySearchRequest, "limit" | "offset"> {
    return {
        querySpec: buildReplayQuerySpec(teamFilters, sortKey, sortDir, raceFilters),
        entryQuerySpec,
        uqlWhere,
        sortKey,
        sortDir,
    };
}

function serializeValue(value: number | boolean | string): string {
    if (typeof value !== "string") return String(value);
    return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

export function serializeUmaLogsQueryPredicate(predicate: UmaLogsQueryPredicate): string {
    switch (predicate.type) {
        case "group":
            return `(${predicate.predicates.map(serializeUmaLogsQueryPredicate).join(` ${predicate.operator} `)})`;
        case "not":
            return `not ${serializeUmaLogsQueryPredicate(predicate.predicate)}`;
        case "compare":
            return `${predicate.field} ${predicate.operator} ${serializeValue(predicate.value)}`;
        case "array": {
            const values = predicate.values.join(", ");
            const membership = predicate.mode === "has"
                ? `${predicate.field} has ${values}`
                : `${predicate.field} has ${predicate.mode} (${values})`;
            return predicate.supportCardLimitBreak === undefined
                ? membership
                : `${membership} at lb ${predicate.supportCardLimitBreak}`;
        }
        case "member":
            return `member(${serializeUmaLogsQueryPredicate(predicate.predicate)})`;
        case "team": {
            const scope = predicate.scope === "current"
                ? "team"
                : predicate.scope === "winner"
                    ? "winning_team"
                    : predicate.scope === "loser"
                        ? "losing_team"
                        : "any_team";
            const required = predicate.members.length === 0
                ? []
                : predicate.members.length === 1
                    ? [`${scope} has ${serializeUmaLogsQueryPredicate(predicate.members[0])}`]
                    : [`${scope} has ${predicate.distinctMembers ? "all" : "any"} (${predicate.members.map(serializeUmaLogsQueryPredicate).join(", ")})`];
            const excluded = predicate.excludedMembers.map((member) => `not ${scope} has ${serializeUmaLogsQueryPredicate(member)}`);
            return [...required, ...excluded].join(" and ") || "true";
        }
        case "race_teams":
            return predicate.teams
                .map((team) => serializeUmaLogsQueryPredicate(team.predicate))
                .join(" and ");
    }
}

export function serializeUmaLogsQuerySpec(spec: UmaLogsQuerySpec): string {
    const lines = [
        `select ${spec.select.join(", ")}`,
    ];
    if (spec.where) lines.push(`where ${serializeUmaLogsQueryPredicate(spec.where)}`);
    if (spec.groupBy.length > 0) lines.push(`group by ${spec.groupBy.join(", ")}`);
    if (spec.having) lines.push(`having ${spec.having.field} ${spec.having.operator} ${spec.having.value}`);
    if (spec.orderBy.length > 0) {
        lines.push(`order by ${spec.orderBy.map((order) => `${order.field} ${order.direction}`).join(", ")}`);
    }
    lines.push(`limit ${spec.limit}`);
    if ((spec.offset ?? 0) > 0) lines.push(`offset ${spec.offset}`);
    return lines.join("\n");
}
