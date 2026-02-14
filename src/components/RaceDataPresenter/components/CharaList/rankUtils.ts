import AssetLoader from "../../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";

let _sorted: { id: number; min_value: number }[] | null = null;

function getSortedRanks() {
    if (!_sorted) {
        _sorted = UMDatabaseWrapper.singleModeRanks
            .map(r => ({ id: r.id!, min_value: r.minValue! }))
            .sort((a, b) => b.min_value - a.min_value);
    }
    return _sorted;
}

function rankIconFilename(id: number): string {
    const idx = (id - 1).toString().padStart(2, "0");
    return `utx_ico_statusrank_${idx}`;
}

export function getRankIcon(score: number): { icon: string; name: string } {
    const ranks = getSortedRanks();
    for (const rank of ranks) {
        if (score >= rank.min_value) {
            const icon = AssetLoader.getRankIcon(rankIconFilename(rank.id)) ?? "";
            return { icon, name: `rank_${rank.id}` };
        }
    }
    const first = ranks[ranks.length - 1];
    const fallback = AssetLoader.getRankIcon(rankIconFilename(first.id)) ?? "";
    return { icon: fallback, name: `rank_${first.id}` };
}
