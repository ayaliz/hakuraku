import { STRATEGY_DISPLAY_ORDER } from "./constants";
import { UMA_LOGS_API_BASE, deserializeHorseEntry, deserializeHorseEntries } from "../../../UmaLogsPage/umaLogsApi";

export type { SerializedHorseEntry } from "../../../UmaLogsPage/umaLogsApi";
export { UMA_LOGS_API_BASE, deserializeHorseEntry, deserializeHorseEntries };

export function buildRaceTeamUrl(raceId: string, teamId: number): string {
    return `${UMA_LOGS_API_BASE}/api/races/${encodeURIComponent(raceId)}/teams/${teamId}`;
}

export function buildCompositionRepsUrl(cmId: string, courseId: number, compositionKey: string, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/composition-reps/${encodeURIComponent(compositionKey)}`;
}

export function buildCompositionTeamsUrl(cmId: string, courseId: number, compositionKey: string, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/composition-teams/${encodeURIComponent(compositionKey)}`;
}

export const ANALYSIS_STRATEGY_IDS = STRATEGY_DISPLAY_ORDER;
export const REPRESENTATIVE_STRATEGY_IDS = [1, 2, 3, 4] as const;
export const FIELD_VIEW_SUBJECT_STRATEGY_IDS: number[] = ANALYSIS_STRATEGY_IDS.filter((sid) => sid !== 5);
export const MOBILE_FIELD_LEGEND_NAMES: Record<number, string> = {
    1: "Front",
    2: "Pace",
    3: "Late",
    4: "End",
    5: "Runaway",
};
export const strategyOrderIndex = (strategy: number) => {
    const idx = ANALYSIS_STRATEGY_IDS.indexOf(strategy as (typeof ANALYSIS_STRATEGY_IDS)[number]);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
};

export const BASELINE = 1 / 9;
export const MIN_STYLE_APPEARANCES = 20;
export const MAX_STYLE_ITEMS = 10;
export const MIN_TEAM_APPEARANCES = 5;

export function makeMemberKey(h: { charaId: number; cardId: number; strategy: number }): string {
    return `${h.charaId}_${h.cardId}_${h.strategy}`;
}

export function makeCompositionKey(members: { cardId: number; strategy: number }[]): string {
    return members
        .slice()
        .sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy))
        .map(m => `${m.cardId}_${m.strategy}`)
        .join("__");
}
