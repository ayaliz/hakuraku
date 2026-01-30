// Icon cache similar to RaceReplay
const ICON_CACHE = new Map<number, string | null>();

export const getCharaIcon = (charaId?: number | string | null): string | null => {
    if (charaId == null) return null;

    let numericId: number;
    if (typeof charaId === 'string') {
        // Handle composite keys like "1001_1" by extracting the first part
        const parts = charaId.split('_');
        numericId = parseInt(parts[0], 10);
    } else {
        numericId = charaId;
    }

    if (isNaN(numericId)) return null;

    if (ICON_CACHE.has(numericId)) return ICON_CACHE.get(numericId)!;
    let url: string | null = null;
    try {
        // Updated relative path for the new location: one level deeper than before
        url = require(`../../../../data/umamusume_icons/chr_icon_${numericId}.png`);
    } catch {
        url = null;
    }
    ICON_CACHE.set(numericId, url);
    return url;
};
