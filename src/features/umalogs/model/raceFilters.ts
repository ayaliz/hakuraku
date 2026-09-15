export const RACE_FILTER_FIELDS = [
    { value: "room_runaway_count", label: "Room Runaways" },
    { value: "room_front_count", label: "Room Front Runners" },
    { value: "room_pace_count", label: "Room Pace Chasers" },
    { value: "room_late_count", label: "Room Late Surgers" },
    { value: "room_end_count", label: "Room End Closers" },
    { value: "room_debuffer_count", label: "Room Debuffers" },
] as const;

export type ReplayRaceFilterField = typeof RACE_FILTER_FIELDS[number]["value"];
export type ReplayRaceFilterOperator = "=" | "<=" | ">=";

export type ReplayRaceFilter = {
    id: string;
    field: ReplayRaceFilterField;
    operator: ReplayRaceFilterOperator;
    value: number;
};

const RACE_FILTER_FIELD_SET = new Set<string>(RACE_FILTER_FIELDS.map(({ value }) => value));
const RACE_FILTER_OPERATOR_SET = new Set<string>(["=", "<=", ">="]);

export function createRaceFilter(id: string): ReplayRaceFilter {
    return {
        id,
        field: "room_front_count",
        operator: "=",
        value: 0,
    };
}

export function updateRaceFilter(
    filters: ReplayRaceFilter[],
    id: string,
    patch: Partial<ReplayRaceFilter>,
): ReplayRaceFilter[] {
    return filters.map((filter) => filter.id === id ? { ...filter, ...patch } : filter);
}

export function removeRaceFilter(filters: ReplayRaceFilter[], id: string): ReplayRaceFilter[] {
    return filters.filter((filter) => filter.id !== id);
}

/** Restores the browser-session form while discarding stale or malformed entries. */
export function sanitizeStoredRaceFilters(input: unknown): ReplayRaceFilter[] {
    if (!Array.isArray(input)) return [];
    return input.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const filter = value as Partial<ReplayRaceFilter>;
        if (
            typeof filter.id !== "string"
            || !filter.id
            || !RACE_FILTER_FIELD_SET.has(String(filter.field))
            || !RACE_FILTER_OPERATOR_SET.has(String(filter.operator))
        ) return [];
        const numericValue = Number(filter.value);
        if (!Number.isFinite(numericValue) || numericValue < 0) return [];
        return [{
            id: filter.id,
            field: filter.field as ReplayRaceFilterField,
            operator: filter.operator as ReplayRaceFilterOperator,
            value: Math.floor(numericValue),
        }];
    }).slice(0, 10);
}
