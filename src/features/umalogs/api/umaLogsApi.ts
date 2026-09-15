import type { HorseEntry } from "../../../pages/MultiRacePage/types";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import { UMA_LOGS_API_BASE } from "./config";

export { UMA_LOGS_API_BASE };

export function buildRaceTeamUrl(raceId: string, teamId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/races/${encodeURIComponent(raceId)}/teams/${teamId}`;
}

export type SerializedHorseEntry = Omit<HorseEntry, "activatedSkillIds" | "learnedSkillIds" | "trainerName" | "raceDistance" | "isPlayer" | "charaName"> & {
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
};

export function deserializeHorseEntry(entry: SerializedHorseEntry): HorseEntry {
    return {
        ...entry,
        charaName: UMDatabaseWrapper.charas[entry.charaId]?.name ?? `Unknown (${entry.charaId})`,
        trainerName: "",
        raceDistance: 0,
        isPlayer: false,
        activatedSkillIds: new Set(entry.activatedSkillIds),
        learnedSkillIds: new Set(entry.learnedSkillIds),
        supportCardIds: entry.supportCardIds ?? [],
        supportCardLimitBreaks: entry.supportCardLimitBreaks ?? [],
    };
}

export function deserializeHorseEntries(entries: SerializedHorseEntry[] | undefined): HorseEntry[] {
    return (entries ?? []).map(deserializeHorseEntry);
}
