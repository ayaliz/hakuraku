import { useMemo } from "react";
import { RaceSimulateData } from "../../../data/race_data_pb";

export function useCurrentAcceleration(frames: RaceSimulateData["frame"], frameIndex: number) {
    return useMemo(() => {
        if (!frames.length) return {} as Record<number, number>;
        const i = Math.min(frameIndex, frames.length - 1);
        const f0 = frames[i];
        const f1 = frames[i + 1];
        if (!f0 || !f1) {
            const acc: Record<number, number> = {};
            (f0?.horseFrame ?? []).forEach((_, idx) => (acc[idx] = 0));
            return acc;
        }
        const t0 = f0.time ?? 0;
        const t1 = f1.time ?? 0;
        const dt = Math.max(1e-9, t1 - t0);
        const cnt = Math.min(f0.horseFrame.length, f1.horseFrame.length);
        const acc: Record<number, number> = {};
        for (let idx = 0; idx < cnt; idx++) {
            const s0 = f0.horseFrame[idx]?.speed ?? 0;
            const s1 = f1.horseFrame[idx]?.speed ?? 0;
            acc[idx] = (s1 - s0) / dt;
        }
        return acc;
    }, [frames, frameIndex]);
}
