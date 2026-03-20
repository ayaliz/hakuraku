import type { HorseEntry } from "../MultiRacePage/types";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";

export function getSupportCardRaceBonusAtLimitBreak(supportCardId: number, limitBreakCount?: number): number {
    const bonuses = UMDatabaseWrapper.supportCardRaceBonusByLimitBreak[supportCardId];
    if (bonuses && bonuses.length > 0) {
        const clampedLimitBreak = Math.max(0, Math.min(4, limitBreakCount ?? 4));
        return bonuses[clampedLimitBreak] ?? bonuses[bonuses.length - 1] ?? 0;
    }
    return UMDatabaseWrapper.supportCardRaceBonus[supportCardId] ?? 0;
}

export function getSupportDeckRaceBonus(supportCardIds: number[], supportCardLimitBreaks?: number[]): number | null {
    if (supportCardIds.length !== 6) return null;
    return supportCardIds.reduce(
        (sum, id, index) => sum + getSupportCardRaceBonusAtLimitBreak(id, supportCardLimitBreaks?.[index]),
        0
    );
}

export function getHorseDeckRaceBonus(horse: Pick<HorseEntry, "supportCardIds" | "supportCardLimitBreaks">): number | null {
    return getSupportDeckRaceBonus(horse.supportCardIds, horse.supportCardLimitBreaks);
}
