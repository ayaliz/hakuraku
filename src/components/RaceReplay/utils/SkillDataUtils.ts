
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

export function getActiveSpeedModifier(skillId: number): number {
    if (skillId in HARDCODED_SPEED_MODIFIERS) return HARDCODED_SPEED_MODIFIERS[skillId];

    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return 0;

    let speedInc = 0;
    const group = def.conditionGroups[0];
    group.effects.forEach(eff => {
        if (eff.type === 22 || eff.type === 27) {
            speedInc += eff.value / 10000; // e.g. 4500 -> 0.45 m/s
        }
    });
    return speedInc;
}

export function getActiveSpeedDebuff(skillId: number): number {
    const def = getSkillDef(skillId);
    if (!def) return 0;

    let speedDec = 0;
    def.conditionGroups.forEach(group => {
        group.effects.forEach(eff => {
            if (eff.type === 21) {
                speedDec += Math.abs(eff.value) / 10000;
            }
        });
    });
    return speedDec;
}

export function hasSkillEffect(skillId: number, effectType: number): boolean {
    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return false;

    return def.conditionGroups.some(group =>
        group.effects.some(eff => eff.type === effectType)
    );
}

export function getSkillBaseTime(skillId: number): number {
    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return 0;
    return def.conditionGroups[0].baseTime ?? 0;
}

// Returns skill duration in seconds, derived from base_time * courseDistance/1000.
// Falls back to param[2] (raw event data) if base_time is unavailable, then to 2s as a last resort.
export function getSkillDurationSecs(skillId: number, courseDistance: number, fallbackParam?: number): number {
    const baseTime = getSkillBaseTime(skillId);
    if (baseTime > 0) return (baseTime / 10000) * (courseDistance / 1000);
    if (fallbackParam != null && fallbackParam > 0) return fallbackParam / 10000;
    return 2;
}
