
import AssetLoader from "../../../../data/AssetLoader";

const ICON_CACHE = new Map<string | number, string | null>();

export const getCharaIcon = (charaId?: number | string | null): string | null => {
    if (charaId == null) return null;

    if (ICON_CACHE.has(charaId)) return ICON_CACHE.get(charaId)!;

    let url: string | null = null;
    let cardId: number | null = null;
    let baseCharaId: number | null = null;

    if (typeof charaId === 'string') {
        const parts = charaId.split('_');
        const p0 = parseInt(parts[0], 10);
        if (!isNaN(p0)) baseCharaId = p0;

        if (parts.length > 1) {
            const p1 = parseInt(parts[1], 10);
            if (!isNaN(p1) && p1 > 0) cardId = p1;
        }
    } else {
        baseCharaId = charaId;
    }

    if (cardId) {
        url = AssetLoader.getCharaThumb(cardId);
    }

    if (!url && baseCharaId) {
        url = AssetLoader.getCharaIcon(baseCharaId);
    }

    ICON_CACHE.set(charaId, url);
    return url;
};
