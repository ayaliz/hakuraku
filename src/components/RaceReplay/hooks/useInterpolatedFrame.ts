import { useMemo } from "react";
import { RaceSimulateData } from "../../../data/race_data_pb";
import { bisectFrameIndex, clamp01, lerp } from "../RaceReplay.utils";
import { InterpolatedFrame } from "../RaceReplay.types";

export function useInterpolatedFrame(frames: RaceSimulateData["frame"], renderTime: number): InterpolatedFrame {
    return useMemo<InterpolatedFrame>(() => {
        if (!frames.length) return { time: 0, horseFrame: [] as any[], frameIndex: 0 };
        const i = bisectFrameIndex(frames, renderTime), f0 = frames[i], f1 = frames[i + 1] ?? f0;
        const t0 = f0.time ?? 0, t1 = f1.time ?? 0, a = i < frames.length - 1 ? clamp01((renderTime - t0) / Math.max(1e-9, t1 - t0)) : 0;
        const cnt = Math.min(f0.horseFrame.length, f1.horseFrame.length);
        const horseFrame = Array.from({ length: cnt }, (_, idx) => {
            const h0 = f0.horseFrame[idx], h1 = f1.horseFrame[idx] ?? h0, take1 = a >= 0.5;
            return {
                distance: lerp(h0.distance ?? 0, h1.distance ?? 0, a),
                lanePosition: lerp(h0.lanePosition ?? 0, h1.lanePosition ?? 0, a),
                speed: lerp(h0.speed ?? 0, h1.speed ?? 0, a),
                hp: lerp(h0.hp ?? 0, h1.hp ?? 0, a),
                temptationMode: (take1 ? h1 : h0).temptationMode,
                blockFrontHorseIndex: (take1 ? h1 : h0).blockFrontHorseIndex,
            };
        });
        return { time: lerp(t0, t1, a), horseFrame, frameIndex: i };
    }, [frames, renderTime]);
}
