import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { getFactorCategory } from "../../data/VeteransHelper";

export const getCharaImageUrl = (cardId: number): string => {
    const cardIdStr = String(cardId);
    const first4Digits = cardIdStr.substring(0, 4);
    return `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${first4Digits}_${cardId}.png`;
};

export const getCardName = (cardId: number): string => {
    const textData = UMDatabaseWrapper.getTextData(4, cardId);
    if (textData?.text && textData.category === 4) {
        return textData.text;
    }
    return `Card ${cardId}`;
};

export const formatCardName = (cardName: string): string => {
    const match = cardName.match(/^\[.*?\]\s*(.*)$/);
    return match ? match[1] : cardName;
};

export const getFactorColor = (factorId: number, config: any): string => {
    const category = getFactorCategory(factorId);
    switch (category) {
        case 1: return config.blues.color;
        case 2: return config.aptitude.color;
        case 3: return config.uniques.color;
        case 4: return config.races.color;
        case 5: return 'white'; 
        default: return 'inherit';
    }
};