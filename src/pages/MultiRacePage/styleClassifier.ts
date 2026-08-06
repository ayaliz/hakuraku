import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import type { HorseEntry } from "./types";

export const DEBUFFER_STRATEGY_ID = 6;

const DEBUFFER_ENABLER_SKILL_IDS = new Set([110071, 910071]);
const DEBUFF_EFFECT_TYPES = new Set([9, 13, 21, 29, 31]);
const DEBUFFER_BASE_RATIO = 1 / 3;
const DEBUFFER_LOW_SCORE_RATIO = 1 / 5;

export type DebufferClassifierOptions = {
    lowScoreRankThreshold?: number | null;
};

export function skillHasDebuffComponent(skillId: number): boolean {
    const skill = UMDatabaseWrapper.skills[skillId];
    return skill?.conditionGroups?.some((group) =>
        group.effects?.some((effect) => (
            DEBUFF_EFFECT_TYPES.has(effect.type)
            && (effect.type === 13 || effect.value < 0)
        ))
    ) ?? false;
}

export function isDebufferHorse(
    horse: Pick<HorseEntry, "learnedSkillIds"> & Partial<Pick<HorseEntry, "rankScore" | "isDebuffer">>,
    options: DebufferClassifierOptions = {},
): boolean {
    if (typeof horse.isDebuffer === "boolean") return horse.isDebuffer;
    const learnedSkillIds = Array.from(horse.learnedSkillIds);
    if (learnedSkillIds.length === 0) return false;

    const debuffSkillCount = learnedSkillIds.filter(skillHasDebuffComponent).length;
    const debuffRatio = debuffSkillCount / learnedSkillIds.length;
    if (debuffRatio >= DEBUFFER_BASE_RATIO) return true;

    const lowScoreThreshold = Number(options.lowScoreRankThreshold ?? 0);
    if (
        lowScoreThreshold > 0
        && Number(horse.rankScore ?? 0) > 0
        && Number(horse.rankScore ?? 0) <= lowScoreThreshold
        && debuffRatio >= DEBUFFER_LOW_SCORE_RATIO
    ) {
        return true;
    }

    const knowsDebufferEnabler = learnedSkillIds.some((skillId) => DEBUFFER_ENABLER_SKILL_IDS.has(skillId));
    if (!knowsDebufferEnabler) return false;

    const rarityTwoSkills = learnedSkillIds.filter((skillId) => UMDatabaseWrapper.skills[skillId]?.rarity === 2);
    return rarityTwoSkills.length > 0 && rarityTwoSkills.every(skillHasDebuffComponent);
}

export function originalStrategyForHorse(
    horse: Pick<HorseEntry, "strategy"> & Partial<Pick<HorseEntry, "rawStrategy">>,
): number {
    return horse.rawStrategy ?? horse.strategy;
}

export function effectiveStrategyForHorse(
    horse: Pick<HorseEntry, "strategy" | "learnedSkillIds"> & Partial<Pick<HorseEntry, "rankScore">>,
    options: DebufferClassifierOptions = {},
): number {
    return isDebufferHorse(horse, options) ? DEBUFFER_STRATEGY_ID : horse.strategy;
}
