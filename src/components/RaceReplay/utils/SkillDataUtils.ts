
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

export function getPassiveStatModifiers(skillId: number, conditionGroupIndex?: number): { [key: string]: number } {
    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return {};

    const mods: { [key: string]: number } = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };

    const groups = conditionGroupIndex === undefined
        ? def.conditionGroups
        : [getSkillConditionGroup(skillId, conditionGroupIndex)].filter(group => group !== undefined);

    groups.forEach(group => {
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
const HIGHEST_STAT_SCALING_SKILLS = new Set([210081, 210082]);

// Skills whose speed effect scales with the runner's fan count rather than being the flat
// value published in skill_data.
const FAN_COUNT_SCALING_SKILLS = new Set([
    210071, // I Wanna Win with You
    210072, // On the Way to Our Dream
]);

// Skills where only PART of the skill_data speed value scales, with the number of green skills
// the runner activated. The scaled portion is listed here; the rest of the value is flat.
// 100981 Luck Runs My Way: effects are 0.25 + 0.05, of which the 0.05 is the scaling step.
const GREEN_SKILL_COUNT_SCALED_PORTION: Record<number, number> = {
    100981: 0.05,
};

// Stat-modifier effect types. A green skill is a passive that grants one of these.
const GREEN_SKILL_STAT_EFFECT_TYPES = new Set([1, 2, 3, 4, 5]);

export type SkillScalingStats = {
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number;
    fanCount?: number;
    greenSkillCount?: number;
};

/**
 * Green skills resolve on frame 0, but frame 0 is not enough on its own to identify them:
 * skills like 202051 (Runaway, effect type 6) and 200432 (Focus, effect type 10) also report a
 * frame time of 0 without being passives. What makes a skill green is that it grants a stat
 * modifier, so require both.
 */
export function isGreenSkill(skillId: number): boolean {
    const def = getSkillDef(skillId);
    if (!def) return false;
    return def.conditionGroups.some(group =>
        group.effects.some(eff => GREEN_SKILL_STAT_EFFECT_TYPES.has(eff.type)));
}

export function countGreenSkills(activations?: { time: number; param: number[] }[]): number {
    if (!activations) return 0;
    const green = new Set<number>();
    for (const activation of activations) {
        if (Math.abs(activation.time) > 1e-9) continue; // frame 0 only
        const skillId = activation.param[1];
        if (isGreenSkill(skillId)) green.add(skillId);
    }
    return green.size;
}

function applyUniqueSkillLevelScaling(skillId: number, speed: number, skillLevel?: number): number {
    if (skillId >= 200000 || speed <= 0) return speed;
    const level = Math.max(1, Math.min(6, Math.floor(skillLevel ?? 1)));
    return speed * UNIQUE_SKILL_LEVEL_SPEED_MULTIPLIERS[level - 1];
}

function getHighestStatScalingMultiplier(stats?: SkillScalingStats): number {
    if (!stats) return 1;
    const highest = Math.max(stats.speed, stats.stamina, stats.pow, stats.guts, stats.wiz);
    if (highest < 600) return 0.8;
    if (highest < 800) return 0.9;
    if (highest < 1000) return 1.0;
    if (highest < 1100) return 1.1;
    return 1.2;
}

function getFanCountScalingMultiplier(fanCount?: number): number {
    if (fanCount === undefined || !Number.isFinite(fanCount)) return 1.2;
    if (fanCount < 20000) return 0.8;
    if (fanCount < 50000) return 0.9;
    if (fanCount < 100000) return 1.0;
    if (fanCount < 160000) return 1.1;
    return 1.2;
}

function getGreenSkillCountMultiplier(greenSkillCount?: number): number {
    const count = greenSkillCount ?? 0;
    if (count < 3) return 0;
    if (count < 5) return 1;
    if (count === 5) return 2;
    return 3;
}

function applySpecialSpeedScaling(skillId: number, speed: number, stats?: SkillScalingStats): number {
    if (speed <= 0) return speed;
    if (HIGHEST_STAT_SCALING_SKILLS.has(skillId)) {
        return speed * getHighestStatScalingMultiplier(stats);
    }
    if (FAN_COUNT_SCALING_SKILLS.has(skillId)) {
        return speed * getFanCountScalingMultiplier(stats?.fanCount);
    }
    const scaledPortion = GREEN_SKILL_COUNT_SCALED_PORTION[skillId];
    if (scaledPortion !== undefined) {
        // skill_data already bakes in one step of the scaled portion; swap it for the real one.
        return speed - scaledPortion + scaledPortion * getGreenSkillCountMultiplier(stats?.greenSkillCount);
    }
    return speed;
}

export function getActiveSpeedModifier(
    skillId: number,
    conditionGroupIndex?: number,
    skillLevel?: number,
    stats?: SkillScalingStats
): number {
    if (skillId in HARDCODED_SPEED_MODIFIERS) return HARDCODED_SPEED_MODIFIERS[skillId];

    const group = getSkillConditionGroup(skillId, conditionGroupIndex);
    if (!group) return 0;

    let speedInc = 0;
    group.effects.forEach(eff => {
        if (eff.type === 22 || eff.type === 27) {
            speedInc += eff.value / 10000; // e.g. 4500 -> 0.45 m/s
        }
    });
    return applySpecialSpeedScaling(skillId, applyUniqueSkillLevelScaling(skillId, speedInc, skillLevel), stats);
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

export function hasTargetDebuffEffect(skillId: number, conditionGroupIndex?: number): boolean {
    const group = getSkillConditionGroup(skillId, conditionGroupIndex);
    if (!group) return false;

    // Targeting is established from the race event's target bitmask. Any negative
    // effect in that group is therefore a debuff, regardless of its effect type.
    return group.effects.some(eff => eff.value < 0 || eff.type === 13);
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

export function getRushedDebuffDurationSecs(skillId: number, conditionGroupIndex?: number): number {
    const group = getSkillConditionGroup(skillId, conditionGroupIndex);
    if (!group) return 0;

    return group.effects.reduce((duration, effect) => (
        effect.type === 13 && effect.value > 0
            ? Math.max(duration, effect.value / 10000)
            : duration
    ), 0);
}

export function getHpDrainRatio(skillId: number, conditionGroupIndex?: number): number {
    const group = getSkillConditionGroup(skillId, conditionGroupIndex);
    if (!group) return 0;

    return group.effects.reduce((total, effect) => (
        effect.type === 9 && effect.value < 0
            ? total + Math.abs(effect.value) / 10000
            : total
    ), 0);
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
