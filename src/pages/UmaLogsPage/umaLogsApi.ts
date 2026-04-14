import type { HorseEntry } from "../MultiRacePage/types";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";

export type SerializedHorseEntry = Omit<HorseEntry, "activatedSkillIds" | "learnedSkillIds" | "trainerName" | "raceDistance" | "isPlayer" | "charaName"> & {
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
};

const rawUmaLogsApiBase = (import.meta.env.VITE_UMALOGS_API_BASE ?? "").trim();
export const UMA_LOGS_API_BASE = rawUmaLogsApiBase === "same-origin"
    ? ""
    : rawUmaLogsApiBase.replace(/\/$/, "");

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
