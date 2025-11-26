import { RaceSimulateData, RaceSimulateEventData_SimulateEventType, RaceSimulateHorseResultData } from "../data/race_data_pb";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";

export const unknownCharaTag = 'Unknown Chara / Mob';

export const otherRaceEventLabels = new Map([
    [RaceSimulateEventData_SimulateEventType.COMPETE_TOP, 'COMPETE_TOP'],
    [RaceSimulateEventData_SimulateEventType.COMPETE_FIGHT, 'COMPETE_FIGHT'],
    [RaceSimulateEventData_SimulateEventType.RELEASE_CONSERVE_POWER, 'RELEASE_CONSERVE_POWER'],
    [RaceSimulateEventData_SimulateEventType.STAMINA_LIMIT_BREAK_BUFF, 'STAMINA_LIMIT_BREAK_BUFF'],
    [RaceSimulateEventData_SimulateEventType.COMPETE_BEFORE_SPURT, 'COMPETE_BEFORE_SPURT'],
    [RaceSimulateEventData_SimulateEventType.STAMINA_KEEP, 'STAMINA_KEEP'],
    [RaceSimulateEventData_SimulateEventType.SECURE_LEAD, 'SECURE_LEAD'],
]);

export function getColorForSpurtDelay(delay: number): string {
    if (delay < 4) return '#28a745'; // Green
    if (delay > 20) return '#dc3545'; // Red

    // Gradient from Green (4) to Yellow (12) to Red (20)
    if (delay <= 12) {
        // Green to Yellow
        const t = (delay - 4) / 8;
        // Green: 40, 167, 69
        // Yellow: 255, 193, 7
        const r = 40 + t * (255 - 40);
        const g = 167 + t * (193 - 167);
        const b = 69 + t * (7 - 69);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    } else {
        // Yellow to Red
        const t = (delay - 12) / 8;
        // Yellow: 255, 193, 7
        // Red: 220, 53, 69
        const r = 255 + t * (220 - 255);
        const g = 193 + t * (53 - 193);
        const b = 7 + t * (69 - 7);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
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

export function calculateRaceDistance(raceData: RaceSimulateData) {
    const frames = raceData.frame ?? [];
    let winnerIndex = -1, winnerFinish = Number.POSITIVE_INFINITY;
    (raceData.horseResult ?? []).forEach((hr, idx) => { const t = hr?.finishTimeRaw; if (typeof t === "number" && t > 0 && t < winnerFinish) { winnerFinish = t; winnerIndex = idx; } });
    if (winnerIndex >= 0 && frames.length && isFinite(winnerFinish)) {
        const i = bisectFrameIndex(frames, winnerFinish);
        const d0 = frames[i]?.horseFrame?.[winnerIndex]?.distance ?? 0;
        return Math.round(d0 / 100) * 100;
    }
    return 0;
}

export const runningStyleLabel = (horseResultData: RaceSimulateHorseResultData, activatedSkills: Set<number>) => {
    if (activatedSkills.has(202051)) {
        return '大逃げ';
    }
    return UMDatabaseUtils.runningStyleLabels[horseResultData.runningStyle!];
};
