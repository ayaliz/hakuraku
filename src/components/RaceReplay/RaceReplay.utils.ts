import { RaceSimulateData } from "../../data/race_data_pb";
import { STACK_BASE_PX, STACK_GAP_PX } from "./RaceReplay.constants";
import AssetLoader from "../../data/AssetLoader";

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

export function stackLabels(baseOffset = STACK_BASE_PX, gap = STACK_GAP_PX, backgroundColor?: string) {
    let n = 0;
    return (text: string, overrideColor?: string) => ({ ...labelStyle(baseOffset + n++ * gap, overrideColor || backgroundColor), formatter: text });
}

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


const ICON_CACHE = new Map<number, string | null>();
export const getCharaIcon = (charaId?: number | null) => {
    if (charaId == null) return null;
    if (ICON_CACHE.has(charaId)) return ICON_CACHE.get(charaId)!;
    const url = AssetLoader.getCharaIcon(charaId);
    ICON_CACHE.set(charaId, url);
    return url;
};
