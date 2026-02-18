
import GameDataLoader from "../../../data/GameDataLoader";

type SkillEffect = {
    type: number;
    value: number;
};

type SkillDef = {
    id: number;
    condition_groups: {
        effects: SkillEffect[];
    }[];
};

let skillsMap: Map<number, SkillDef> | null = null;
function getSkillsMap(): Map<number, SkillDef> {
    if (!skillsMap) {
        skillsMap = new Map<number, SkillDef>();
        (GameDataLoader.skills as any[]).forEach((s: any) => {
            skillsMap!.set(s.id, s);
        });
    }
    return skillsMap;
}

export function getSkillDef(skillId: number): SkillDef | undefined {
    const map = getSkillsMap();
    const direct = map.get(skillId);
    if (direct) return direct;

    // Handle inherited unique skills (9xxxxx)
    // These are looked up by converting to 1xxxxx and checking gene_version
    if (skillId >= 900000 && skillId < 1000000) {
        const parentId = skillId - 800000;
        const parentDef = map.get(parentId);
        if (parentDef && (parentDef as any).gene_version) {
            return (parentDef as any).gene_version;
        }
    }
    return undefined;
}

export function getPassiveStatModifiers(skillId: number): { [key: string]: number } {
    const def = getSkillDef(skillId);
    if (!def || !def.condition_groups || def.condition_groups.length === 0) return {};

    const mods: { [key: string]: number } = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };

    def.condition_groups.forEach(group => {
        if (group.effects) {
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
        }
    });
    return mods;
}

export function getActiveSpeedModifier(skillId: number): number {
    const def = getSkillDef(skillId);
    if (!def || !def.condition_groups || def.condition_groups.length === 0) return 0;

    let speedInc = 0;
    const group = def.condition_groups[0]; // TODO: maybe implement condition evaluation later

    if (group.effects) {
        group.effects.forEach(eff => {
            if (eff.type === 27) {
                speedInc += eff.value / 10000; // e.g. 4500 -> 0.45 m/s
            }
        });
    }
    return speedInc;
}

export function getActiveSpeedDebuff(skillId: number): number {
    const def = getSkillDef(skillId);
    if (!def || !def.condition_groups) return 0;

    let speedDec = 0;
    def.condition_groups.forEach(group => {
        if (group.effects) {
            group.effects.forEach(eff => {
                if (eff.type === 21) {
                    speedDec += Math.abs(eff.value) / 10000;
                }
            });
        }
    });
    return speedDec;
}

export function hasSkillEffect(skillId: number, effectType: number): boolean {
    const def = getSkillDef(skillId);
    if (!def || !def.condition_groups || def.condition_groups.length === 0) return false;

    return def.condition_groups.some(group =>
        group.effects && group.effects.some(eff => eff.type === effectType)
    );
}

export function getSkillBaseTime(skillId: number): number {
    const def = getSkillDef(skillId);
    if (!def || !def.condition_groups || def.condition_groups.length === 0) return 0;
    return (def.condition_groups[0] as any).base_time ?? 0;
}

// Returns skill duration in seconds, derived from skill.json base_time * courseDistance/1000.
// Falls back to param[2] (raw event data) if base_time is unavailable, then to 2s as a last resort.
export function getSkillDurationSecs(skillId: number, courseDistance: number, fallbackParam?: number): number {
    const baseTime = getSkillBaseTime(skillId);
    if (baseTime > 0) return (baseTime / 10000) * (courseDistance / 1000);
    if (fallbackParam != null && fallbackParam > 0) return fallbackParam / 10000;
    return 2;
}
