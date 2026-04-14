const CHERRY_BLOSSOM_SEASON_KEYS = new Set([
    "5",
    "cherryblossom",
    "cherry_blossom",
    "cherry blossom",
]);

export function normalizeSeasonValue(value: string | number | null | undefined): string | number | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    if (typeof value === "number") {
        return value === 5 ? 1 : value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    return CHERRY_BLOSSOM_SEASON_KEYS.has(trimmed.toLowerCase()) ? "Spring" : trimmed;
}
