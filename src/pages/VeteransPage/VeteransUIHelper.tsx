import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { getFactorCategory } from "../../data/VeteransHelper";
import AssetLoader from "../../data/AssetLoader";

export const getCharaImageUrl = (cardId: number): string => {
    return AssetLoader.getCharaThumb(cardId) ?? "";
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