import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import { Veteran } from "../pages/VeteransPage/types"; 

export type FactorItem = {
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

export const formatFactor = (factorId: number): { name: string; level: number } | null => {
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