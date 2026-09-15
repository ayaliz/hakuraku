import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import type { SkillEffectMetric } from "./types";

export function signed(value: number, digits: number) {
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function effectClass(result: Pick<SkillEffectMetric, "ci95">) {
    return result.ci95[0] > 0 ? "sim-skill-positive" : result.ci95[1] < 0 ? "sim-skill-negative" : "sim-skill-neutral";
}

export function skillIcon(skillId: number) {
    const exact = UMDatabaseWrapper.skills[skillId];
    const base = UMDatabaseWrapper.skills[Math.floor(skillId / 10) * 10 + 1];
    const icon = exact?.iconId ?? base?.iconId;
    return icon ? AssetLoader.getSkillIcon(icon) : null;
}
