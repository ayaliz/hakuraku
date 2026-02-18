import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import { Veteran, OptimizerConfig } from "../pages/VeteransPage/types";

type FactorItem = {
    name: string;
    level: number;
    isGold: boolean;
    factorId: number;
    category: number;
};

// 1: Blue, 2: Aptitude, 3: Unique, 4: Races, 5: Skills
export const getFactorCategory = (factorId: number): number => {
    const idStr = String(factorId);
    const length = idStr.length;

    if (length === 3) return 1; 
    if (length === 4) return 2; 
    if (length === 8) return 3; 
    if (length === 7 && (idStr.startsWith('1') || idStr.startsWith('3'))) return 4; 
    return 5; 
};

const formatFactor = (factorId: number): { name: string; level: number } | null => {
    const level = factorId % 100;
    const textData = UMDatabaseWrapper.getTextData(147, factorId);

    if (textData?.text && textData.category === 147) {
        return { name: textData.text, level };
    }
    return null;
};

export const aggregateFactors = (veteran: Veteran): FactorItem[] => {
    const allFactors: FactorItem[] = [];

    const processIDs = (ids: number[], isGold: boolean) => {
        ids.forEach(factorId => {
            const formatted = formatFactor(factorId);
            if (formatted) {
                allFactors.push({
                    name: formatted.name,
                    level: formatted.level,
                    isGold: isGold,
                    factorId: factorId,
                    category: getFactorCategory(factorId)
                });
            }
        });
    };

    processIDs(veteran.factor_id_array, true);

    veteran.succession_chara_array.forEach((p) => {
        if (p.position_id === 10 || p.position_id === 20) {
            processIDs(p.factor_id_array, false);
        }
    });

    return allFactors.sort((a, b) => {
        if (a.category !== b.category) return a.category - b.category;

        const hasGoldA = a.isGold ? 0 : 1;
        const hasGoldB = b.isGold ? 0 : 1;
        if (hasGoldA !== hasGoldB) return hasGoldA - hasGoldB;

        if (a.category === 4) {
            const idStrA = String(a.factorId);
            const idStrB = String(b.factorId);
            const startsWithA = idStrA.startsWith('1') ? 0 : 1;
            const startsWithB = idStrB.startsWith('1') ? 0 : 1;
            if (startsWithA !== startsWithB) return startsWithA - startsWithB;
        }

        if (b.level !== a.level) return b.level - a.level;
        return a.name.localeCompare(b.name);
    });
};

type RaceBonusEntry = { saddleId: number; name: string; bonus: number };
type RaceBonusResult = { entries: RaceBonusEntry[]; total: number };

export const calculateRaceBonus = (veteran: Veteran): RaceBonusResult => {
    const gp1 = veteran.succession_chara_array.find(p => p.position_id === 10);
    const gp2 = veteran.succession_chara_array.find(p => p.position_id === 20);
    const gp1Races = new Set(gp1?.win_saddle_id_array ?? []);
    const gp2Races = new Set(gp2?.win_saddle_id_array ?? []);

    const entries: RaceBonusEntry[] = (veteran.win_saddle_id_array ?? []).map(saddleId => {
        const bonus = (gp1Races.has(saddleId) ? 1 : 0) + (gp2Races.has(saddleId) ? 1 : 0);
        const name = UMDatabaseWrapper.getTextData(111, saddleId)?.text ?? `Race ${saddleId}`;
        return { saddleId, name, bonus };
    });
    const total = entries.reduce((s, e) => s + e.bonus, 0);
    return { entries, total };
};

const sumSharedRelationPoints = (setA: Set<number>, setB: Set<number>, setC?: Set<number>): number => {
    let total = 0;
    for (const rt of setA) {
        if (setB.has(rt) && (setC === undefined || setC.has(rt))) {
            total += UMDatabaseWrapper.relationPoints[rt] ?? 0;
        }
    }
    return total;
};

export const calculateAffinity = (veteran: Veteran, targetCharaId: number): number => {
    const veteranCharaId = Math.floor(veteran.card_id / 100);
    const veteranRelations = UMDatabaseWrapper.charaRelationTypes[veteranCharaId] ?? new Set<number>();
    const targetRelations = UMDatabaseWrapper.charaRelationTypes[targetCharaId] ?? new Set<number>();

    const gp1 = veteran.succession_chara_array.find(p => p.position_id === 10);
    const gp2 = veteran.succession_chara_array.find(p => p.position_id === 20);
    const gp1CharaId = gp1 ? Math.floor(gp1.card_id / 100) : null;
    const gp2CharaId = gp2 ? Math.floor(gp2.card_id / 100) : null;
    const gp1Relations = (gp1CharaId && gp1CharaId !== targetCharaId) ? (UMDatabaseWrapper.charaRelationTypes[gp1CharaId] ?? new Set<number>()) : new Set<number>();
    const gp2Relations = (gp2CharaId && gp2CharaId !== targetCharaId) ? (UMDatabaseWrapper.charaRelationTypes[gp2CharaId] ?? new Set<number>()) : new Set<number>();

    const sum1 = sumSharedRelationPoints(targetRelations, veteranRelations);
    const sum2 = sumSharedRelationPoints(targetRelations, veteranRelations, gp1Relations);
    const sum3 = sumSharedRelationPoints(targetRelations, veteranRelations, gp2Relations);
    const raceBonus = calculateRaceBonus(veteran).total;

    return sum1 + sum2 + sum3 + raceBonus;
};

export const calculateOptimizerScore = (veteran: Veteran, config: OptimizerConfig): number => {
    const factors = aggregateFactors(veteran);

    const bluesStars = factors.filter(f => f.category === 1 && f.isGold).reduce((s, f) => s + f.level, 0);
    const aptStars = factors.filter(f => f.category === 2 && f.isGold).reduce((s, f) => s + f.level, 0);
    const uniqueStars = factors.filter(f => f.category === 3 && f.isGold).reduce((s, f) => s + f.level, 0);
    const skillStars = factors.filter(f => f.category === 5 && f.isGold).reduce((s, f) => s + f.level, 0);

    const skillIds = new Set(veteran.skill_array.map(s => s.skill_id));
    const highValueSkillCount = config.highValueSkills.filter(id => skillIds.has(id)).length;

    // Scenario sparks: category 4 factors whose ID starts with '3' (e.g. 3000101, 3000202)
    const scenarioStars = factors
        .filter(f => f.isGold && f.category === 4 && String(f.factorId).startsWith('3'))
        .reduce((s, f) => s + f.level, 0);

    return (
        bluesStars * config.bluesWeight +
        aptStars * config.aptWeight +
        uniqueStars * config.uniqueWeight +
        skillStars * config.skillWeight +
        scenarioStars * config.scenarioWeight +
        highValueSkillCount * config.highValueSkillBonus
    );
};