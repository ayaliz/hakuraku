
// Icon cache similar to RaceReplay
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

    // Try to load new thumbnail if we have a valid cardId
    if (cardId) {
        try {
            // "first 4 digits for the first number" -> usually cardId / 100
            const prefix = Math.floor(cardId / 100);
            // Dynamic require for custom thumbs
            url = require(`../../../../data/character_thumbs/chara_stand_${prefix}_${cardId}.png`);
        } catch {
            url = null;
        }
    }

    // Fallback to old icon style if new one failed or no cardId
    if (!url && baseCharaId) {
        try {
            // Fallback: standard character icon
            url = require(`../../../../data/umamusume_icons/chr_icon_${baseCharaId}.png`);
        } catch {
            url = null;
        }
    }

    ICON_CACHE.set(charaId, url);
    return url;
};
