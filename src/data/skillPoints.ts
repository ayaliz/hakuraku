import UMDatabaseWrapper from "./UMDatabaseWrapper";

export function computeSkillPoints(learnedSkillIds: ReadonlySet<number>): number {
    let total = 0;
    for (const skillId of learnedSkillIds) {
        const base = UMDatabaseWrapper.skillNeedPoints[skillId] ?? 0;
        let upgrade = 0;
        if (UMDatabaseWrapper.skills[skillId]?.rarity === 2) {
            const lastDigit = skillId % 10;
            const pairedId = lastDigit === 1 ? skillId + 1 : skillId - 1;
            upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
        } else if (UMDatabaseWrapper.skills[skillId]?.rarity === 1 && skillId % 10 === 1) {
            const pairedId = skillId + 1;
            if (UMDatabaseWrapper.skills[pairedId]?.rarity === 1) {
                upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
            }
        }
        total += base + upgrade;
    }
    return total;
}
