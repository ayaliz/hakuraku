import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import type { SkillDoubleProcStats } from "../../types";

export type LocalDoubleProcSummary = {
    doubleProcHorseCount: number;
    estimatedDoubleOpportunityRate?: number;
};

export type DoubleProcRateSummary = Pick<SkillDoubleProcStats, "estimatedDoubleOpportunityRate"> | LocalDoubleProcSummary | null;

export type DoubleProcBreakdown = {
    overall?: DoubleProcRateSummary;
    byStrategy?: Record<string, DoubleProcRateSummary>;
};

export const STRAT_LABELS: Record<number, string> = { 5: "Runaway", 1: "Front", 2: "Pace", 3: "Late", 4: "End" };
export const STRATS = [5, 1, 2, 3, 4] as const;

export function getSkillGroupBaseIds(representativeSkillId: number): Set<number> {
    const baseId = Math.floor(representativeSkillId / 10);
    const ids = new Set<number>([baseId]);
    if (baseId >= 10000 && baseId < 20000) ids.add(baseId + 80000);
    if (baseId >= 90000 && baseId < 100000) ids.add(baseId - 80000);
    return ids;
}

export function matchesRepresentativeSkillGroup(candidateSkillId: number, representativeSkillId: number): boolean {
    const candidateBaseId = Math.floor(candidateSkillId / 10);
    return getSkillGroupBaseIds(representativeSkillId).has(candidateBaseId);
}

export function isGuaranteedSkill(skillId: number): boolean {
    if (skillId >= 100000 && skillId < 200000) return true;
    const data = UMDatabaseWrapper.skills[skillId];
    return !!data?.conditionGroups?.some(group =>
        group.effects?.some(effect => [1, 2, 3, 4, 5].includes(effect.type))
    );
}
