import { RaceSimulateData } from "../../data/race_data_pb";
import AssetLoader from "../../data/AssetLoader";
import { normalizeSeasonValue } from "../../utils/season";

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clampRange = (goal: number, s: number, e: number) => [clamp(s, 0, goal), clamp(e, 0, goal)] as const;

export const labelStyle = (offsetY: number, backgroundColor = "#fff") => ({
    show: true,
    position: "top" as const,
    offset: [0, -offsetY],
    padding: [4, 6],
    backgroundColor,
    borderColor: "#000",
    borderWidth: 1,
    borderRadius: 5,
    color: "#000",
    fontSize: 12,
});

export function mixWithWhite(hex: string, ratio: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const rMix = Math.round(r * (1 - ratio) + 255 * ratio);
    const gMix = Math.round(g * (1 - ratio) + 255 * ratio);
    const bMix = Math.round(b * (1 - ratio) + 255 * ratio);

    return `rgb(${rMix}, ${gMix}, ${bMix})`;
}

export function bisectFrameIndex(frames: RaceSimulateData["frame"], t: number) {
    if (!frames.length) return 0;
    const last = frames.length - 1;
    if (t <= (frames[0].time ?? 0)) return 0;
    if (t >= (frames[last].time ?? 0)) return last;
    let lo = 0, hi = last;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1, tm = frames[mid].time ?? 0;
        if (tm <= t) { if (t < (frames[mid + 1].time ?? tm)) return mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return lo;
}

export function formatSigned(x: number) { const v = x / 100; const s = v.toFixed(2); return (v > 0 ? "+" : "") + s; }

const TRACK_DETAIL_ICON_LABELS = {
    season: {
        "1": { fileName: "Spring", label: "Spring" },
        "2": { fileName: "Summer", label: "Summer" },
        "3": { fileName: "Fall", label: "Fall" },
        "4": { fileName: "Winter", label: "Winter" },
        "5": { fileName: "Spring", label: "Spring" },
        spring: { fileName: "Spring", label: "Spring" },
        summer: { fileName: "Summer", label: "Summer" },
        autumn: { fileName: "Fall", label: "Fall" },
        fall: { fileName: "Fall", label: "Fall" },
        winter: { fileName: "Winter", label: "Winter" },
        cherryblossom: { fileName: "Spring", label: "Spring" },
        cherry_blossom: { fileName: "Spring", label: "Spring" },
        "cherry blossom": { fileName: "Spring", label: "Spring" },
    },
    weather: {
        "1": { fileName: "Sunny", label: "Sunny" },
        "2": { fileName: "Cloudy", label: "Cloudy" },
        "3": { fileName: "Rainy", label: "Rainy" },
        "4": { fileName: "Snowy", label: "Snow" },
        sunny: { fileName: "Sunny", label: "Sunny" },
        cloudy: { fileName: "Cloudy", label: "Cloudy" },
        rainy: { fileName: "Rainy", label: "Rainy" },
        snow: { fileName: "Snowy", label: "Snow" },
        snowy: { fileName: "Snowy", label: "Snow" },
    },
} as const;

export function getTrackDetailIcon(kind: "season" | "weather", value?: string | number | null) {
    if (value == null || value === "") return null;
    const normalizedValue = kind === "season" ? normalizeSeasonValue(value) : value;
    const key = String(normalizedValue).trim().toLowerCase();
    const resolved = TRACK_DETAIL_ICON_LABELS[kind][key as keyof typeof TRACK_DETAIL_ICON_LABELS[typeof kind]];
    if (!resolved) return null;
    return {
        label: resolved.label,
        url: AssetLoader.getAssetUrl(`track_details/${resolved.fileName}.webp`),
    };
}


const ICON_CACHE = new Map<number, string | null>();
export const getCharaIcon = (charaId?: number | null) => {
    if (charaId == null) return null;
    if (ICON_CACHE.has(charaId)) return ICON_CACHE.get(charaId)!;
    const url = AssetLoader.getCharaIcon(charaId);
    ICON_CACHE.set(charaId, url);
    return url;
};
