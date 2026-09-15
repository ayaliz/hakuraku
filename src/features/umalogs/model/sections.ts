export type UmaLogsSection =
    | "introduction"
    | "overview"
    | "strategy"
    | "character"
    | "skill"
    | "queries"
    | "explorer"
    | "replays";

export const UMA_LOGS_SECTIONS: readonly UmaLogsSection[] = [
    "introduction",
    "overview",
    "strategy",
    "character",
    "skill",
    "explorer",
    "replays",
];

export const UMA_LOGS_ROUTE_SECTIONS: readonly UmaLogsSection[] = [
    ...UMA_LOGS_SECTIONS,
    "queries",
];

export const UMA_LOGS_PANEL_DATA_SECTIONS: readonly UmaLogsSection[] = [
    "overview",
    "strategy",
    "character",
];

export const UMA_LOGS_SECTION_LABELS: Readonly<Record<UmaLogsSection, string>> = {
    introduction: "Introduction",
    overview: "Overview",
    strategy: "Strategy Analysis",
    character: "Uma Analysis",
    skill: "Skill Analysis",
    queries: "Queries",
    explorer: "Explorer",
    replays: "Replays",
};

export function isUmaLogsSection(value: string | null): value is UmaLogsSection {
    return value !== null && UMA_LOGS_ROUTE_SECTIONS.includes(value as UmaLogsSection);
}
