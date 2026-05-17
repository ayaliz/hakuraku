
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import type { Skill } from "../../../data/data_pb";

export function getSkillDef(skillId: number): Skill | undefined {
    const direct = UMDatabaseWrapper.skills[skillId];
    if (direct) return direct;

    // Handle inherited unique skills (9xxxxx) — look up parent (1xxxxx)
    if (skillId >= 900000 && skillId < 1000000) {
        return UMDatabaseWrapper.skills[skillId - 800000];
    }
    return undefined;
}

function getSkillConditionGroup(skillId: number, conditionGroupIndex?: number) {
    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return undefined;

    if (
        conditionGroupIndex !== undefined
        && Number.isInteger(conditionGroupIndex)
        && conditionGroupIndex >= 0
        && conditionGroupIndex < def.conditionGroups.length
    ) {
        return def.conditionGroups[conditionGroupIndex];
    }

    return def.conditionGroups[0];
}

export function getPassiveStatModifiers(skillId: number): { [key: string]: number } {
    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return {};

    const mods: { [key: string]: number } = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };

    def.conditionGroups.forEach(group => {
        group.effects.forEach(eff => {
            const val = eff.value / 10000; // e.g. 400000 -> 40
            switch (eff.type) {
                case 1: mods.speed += val; break;
                case 2: mods.stamina += val; break;
                case 3: mods.power += val; break;
                case 4: mods.guts += val; break;
                case 5: mods.wisdom += val; break;
            }
        });
    });
    return mods;
}

// Hardcoded for special skills whose effects are custom-scripted and absent from skill_data
const HARDCODED_SPEED_MODIFIERS: Record<number, number> = {
    210061: 0.3,
    210062: 0.06,
};

const UNIQUE_SKILL_LEVEL_SPEED_MULTIPLIERS = [1, 1.01, 1.04, 1.07, 1.10, 1.13];

function applyUniqueSkillLevelScaling(skillId: number, speed: number, skillLevel?: number): number {
    if (skillId >= 200000 || speed <= 0) return speed;
    const level = Math.max(1, Math.min(6, Math.floor(skillLevel ?? 1)));
    return speed * UNIQUE_SKILL_LEVEL_SPEED_MULTIPLIERS[level - 1];
}

export function getActiveSpeedModifier(skillId: number, conditionGroupIndex?: number, skillLevel?: number): number {
    if (skillId in HARDCODED_SPEED_MODIFIERS) return HARDCODED_SPEED_MODIFIERS[skillId];

    const group = getSkillConditionGroup(skillId, conditionGroupIndex);
    if (!group) return 0;

    let speedInc = 0;
    group.effects.forEach(eff => {
        if (eff.type === 22 || eff.type === 27) {
            speedInc += eff.value / 10000; // e.g. 4500 -> 0.45 m/s
        }
    });
    return applyUniqueSkillLevelScaling(skillId, speedInc, skillLevel);
}

export function getActiveSpeedDebuff(skillId: number, conditionGroupIndex?: number): number {
    const group = getSkillConditionGroup(skillId, conditionGroupIndex);
    if (!group) return 0;

    let speedDec = 0;
    group.effects.forEach(eff => {
        if (eff.type === 21) {
            speedDec += Math.abs(eff.value) / 10000;
        }
    });
    return speedDec;
}

export function hasSkillEffect(skillId: number, effectType: number, conditionGroupIndex?: number): boolean {
    if (conditionGroupIndex !== undefined) {
        const group = getSkillConditionGroup(skillId, conditionGroupIndex);
        return group?.effects.some(eff => eff.type === effectType) ?? false;
    }

    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return false;

    return def.conditionGroups.some(group =>
        group.effects.some(eff => eff.type === effectType)
    );
}

export function getSkillBaseTime(skillId: number, conditionGroupIndex?: number): number {
    return getSkillConditionGroup(skillId, conditionGroupIndex)?.baseTime ?? 0;
}

// Skill timing is hybrid:
// - frame_time === 0 skills still use the local base_time calculation
// - later skills trust the server-reported duration in param[2]
// - 0 / -1 / missing durations fall back to 2 seconds
export function getSkillDurationSecs(
    skillId: number,
    courseDistance: number,
    frameTime?: number,
    reportedDurationParam?: number,
    conditionGroupIndex?: number
): number {
    if (frameTime != null && Math.abs(frameTime) > 1e-9) {
        if (reportedDurationParam != null && reportedDurationParam > 0) {
            return reportedDurationParam / 10000;
        }
        return 2;
    }

    const baseTime = getSkillBaseTime(skillId, conditionGroupIndex);
    if (baseTime > 0) return (baseTime / 10000) * (courseDistance / 1000);
    return 2;
}
