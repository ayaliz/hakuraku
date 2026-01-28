import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { AggregatedFactor, ParentEntry } from "./types";

export const getFactorCategory = (factorId: number): number => {
    const idStr = String(factorId);
    const length = idStr.length;

    if (length === 3) return 1;
    if (length === 4) return 2;
    if (length === 8) return 3;
    if (length === 7 && (idStr.startsWith('1') || idStr.startsWith('3'))) return 4;
    return 5;
};

export const getFactorColor = (factorId: number): string => {
    const category = getFactorCategory(factorId);
    switch (category) {
        case 1: return 'rgb(55, 183, 244)'; // Blue
        case 2: return 'rgb(255, 118, 178)'; // Pink/Red
        case 3: return 'rgb(120, 208, 96)';  // Green
        case 4: return 'rgb(200, 162, 200)'; // Purple
        default: return '#fff';
    }
};

export const formatFactor = (factorId: number): { name: string; level: number } | null => {
    const level = factorId % 100;
    const textData = UMDatabaseWrapper.getTextData(147, factorId);

    if (textData?.text && textData.category === 147) {
        return { name: textData.text, level };
    }
    return null;
};

export const getCharaImageUrl = (cardId: number): string => {
    const cardIdStr = String(cardId);
    const first4Digits = cardIdStr.substring(0, 4);
    return `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${first4Digits}_${cardId}.png`;
};

export const aggregateFactors = (parents: ParentEntry[]): AggregatedFactor[] => {
    const map = new Map<string, { totalLevel: number, representativeId: number }>();

    parents.forEach(p => {
        p.factors.forEach(f => {
            const formatted = formatFactor(f.id);
            const name = formatted ? formatted.name : `Factor ${f.id}`;

            let itemLevel = f.level;
            if (!itemLevel || itemLevel === 0) {
                const cat = getFactorCategory(f.id);
                if (formatted && (cat === 1 || cat === 2 || cat === 3)) {
                    itemLevel = formatted.level;
                }
            }
            const valToAdd = itemLevel || 0;

            const current = map.get(name);
            if (current) {
                current.totalLevel += valToAdd;
            } else {
                map.set(name, { totalLevel: valToAdd, representativeId: f.id });
            }
        });
    });

    const result: AggregatedFactor[] = [];
    map.forEach((val, name) => {
        result.push({
            id: val.representativeId,
            level: val.totalLevel,
            nameOverride: name
        });
    });

    return result.sort((a, b) => {
        const catA = getFactorCategory(a.id);
        const catB = getFactorCategory(b.id);
        if (catA !== catB) return catA - catB;
        return a.id - b.id;
    });
};
