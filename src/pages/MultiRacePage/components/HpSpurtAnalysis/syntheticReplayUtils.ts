
import { ParsedRace } from "../../types";
import { CharaHpSpurtStats } from "./types";
import {
    RaceSimulateData,
    RaceSimulateFrameData,
    RaceSimulateHorseFrameData,
    RaceSimulateHorseResultData,
    RaceSimulateData_EventDataWrapper,
    RaceSimulateEventData
} from "../../../../data/race_data_pb";
import { bisectFrameIndex } from "../../../../components/RaceDataPresenter/utils/RacePresenterUtils";

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function createSyntheticReplayData(stats: CharaHpSpurtStats): {
    raceData: RaceSimulateData;
    horseInfo: any[];
    error?: string;
    detectedCourseId?: number;
} {
    if (!stats.sourceRuns || stats.sourceRuns.length === 0) {
        return { raceData: new RaceSimulateData(), horseInfo: [], error: "No source runs found." };
    }

    // Use the first race as reference for course
    const firstRace = stats.sourceRuns[0].race;
    const refDistance = firstRace.raceDistance;
    const detectedCourseId = firstRace.detectedCourseId;

    // Filter runs that match the distance (approximate check)
    const validRuns = stats.sourceRuns.filter(r => Math.abs(r.race.raceDistance - refDistance) < 100);

    if (validRuns.length === 0) {
        return { raceData: new RaceSimulateData(), horseInfo: [], error: "No matching runs found." };
    }

    // Determine Time Axis
    let maxTime = 0;
    validRuns.forEach(run => {
        const f = run.race.raceData.frame;
        if (f && f.length > 0) {
            const t = f[f.length - 1].time ?? 0;
            if (t > maxTime) maxTime = t;
        }
        // Also check finish time to ensure we cover it
        const result = run.race.raceData.horseResult[run.horseFrameOrder];
        if (result?.finishTimeRaw && result.finishTimeRaw > maxTime) {
            maxTime = result.finishTimeRaw;
        }
    });

    // Add a small buffer to ensure we definitely cover the finish
    maxTime += 1.0;

    // Create synthetic timeline
    // Using 0.5s intervals is usually sufficient for playback derived from server data
    const timeStep = 0.5;
    const frameCount = Math.ceil(maxTime / timeStep) + 1;
    const syntheticFrames: RaceSimulateFrameData[] = [];

    const newEvents: RaceSimulateData_EventDataWrapper[] = [];
    const newHorseResults: RaceSimulateHorseResultData[] = [];
    const newHorseInfo: any[] = [];

    // Construct Horse Data
    validRuns.forEach((run, index) => {
        // Horse Info
        const originalInfo = run.race.horseInfo[run.horseFrameOrder];
        const newInfo = { ...originalInfo };
        // Differentiate them by index
        newInfo.trainer_name = `Run #${index + 1}`;
        newInfo.frame_order = index + 1; // Essential for RaceReplay mapping
        if (newInfo.horse_number !== undefined) newInfo.horse_number = index + 1;

        newHorseInfo.push(newInfo);

        // Horse Result
        const originalResult = run.race.raceData.horseResult[run.horseFrameOrder];
        const newResult = new RaceSimulateHorseResultData(originalResult);
        newResult.finishOrder = index + 1; // Fake finish order matching our list
        // Explicitly set raw finish time to ensure it is not undefined
        if (originalResult.finishTimeRaw) {
            newResult.finishTimeRaw = originalResult.finishTimeRaw;
        }

        newHorseResults.push(newResult);

        // Re-map Events
        if (run.race.raceData.event) {
            run.race.raceData.event.forEach(wrapper => {
                const evt = wrapper.event;
                if (evt && evt.param && evt.param.length > 0 && evt.param[0] === run.horseFrameOrder) {
                    const newEvent = new RaceSimulateEventData(evt);
                    newEvent.param = [...evt.param];
                    newEvent.param[0] = index; // Remap to new horse index

                    const newWrapper = new RaceSimulateData_EventDataWrapper({
                        event: newEvent,
                        eventSize: wrapper.eventSize
                    });
                    newEvents.push(newWrapper);
                }
            });
        }
    });

    // Sort events by time
    newEvents.sort((a, b) => (a.event?.frameTime ?? 0) - (b.event?.frameTime ?? 0));

    // Construct Frames with Interpolation
    for (let i = 0; i < frameCount; i++) {
        const t = i * timeStep;

        const horseFrames: RaceSimulateHorseFrameData[] = [];

        validRuns.forEach((run) => {
            const frames = run.race.raceData.frame;
            if (!frames || frames.length === 0) {
                horseFrames.push(new RaceSimulateHorseFrameData());
                return;
            }

            // Find surrounding frames
            const lastIdx = frames.length - 1;
            const startFrame = frames[0];
            const endFrame = frames[lastIdx];

            let hf: RaceSimulateHorseFrameData;

            // Handle boundaries
            if (t <= (startFrame.time ?? 0)) {
                hf = new RaceSimulateHorseFrameData(startFrame.horseFrame?.[run.horseFrameOrder]);
            } else if (t >= (endFrame.time ?? 0)) {
                hf = new RaceSimulateHorseFrameData(endFrame.horseFrame?.[run.horseFrameOrder]);
            } else {
                // Interpolate
                const idx = bisectFrameIndex(frames, t);
                const frameA = frames[idx];
                const frameB = (idx < lastIdx) ? frames[idx + 1] : frameA;

                const tA = frameA.time ?? 0;
                const tB = frameB.time ?? tA;

                const rawHfA = frameA.horseFrame?.[run.horseFrameOrder];
                const rawHfB = frameB.horseFrame?.[run.horseFrameOrder];

                if (rawHfA && rawHfB && tB > tA) {
                    const ratio = (t - tA) / (tB - tA);

                    hf = new RaceSimulateHorseFrameData({
                        distance: lerp(rawHfA.distance ?? 0, rawHfB.distance ?? 0, ratio),
                        lanePosition: lerp(rawHfA.lanePosition ?? 0, rawHfB.lanePosition ?? 0, ratio), // Lane pos technically shouldn't lerp linearly but good enough
                        speed: lerp(rawHfA.speed ?? 0, rawHfB.speed ?? 0, ratio),
                        hp: lerp(rawHfA.hp ?? 0, rawHfB.hp ?? 0, ratio),
                        temptationMode: rawHfA.temptationMode, // Take from previous frame
                        blockFrontHorseIndex: -1 // Blocking info is invalid in synthetic race
                    });
                } else {
                    hf = new RaceSimulateHorseFrameData(rawHfA);
                }
            }

            // Round them to integers as proto fields are uint32 usually (except distance/time)
            // Wait, speed/hp/lanePosition are uint32 in proto definition?
            // Checking proto definition:
            // lanePosition: uint32
            // speed: uint32
            // hp: uint32
            // distance: float

            hf.lanePosition = Math.round(hf.lanePosition ?? 0);
            hf.speed = Math.round(hf.speed ?? 0);
            hf.hp = Math.round(hf.hp ?? 0);

            horseFrames.push(hf);
        });

        const synFrame = new RaceSimulateFrameData({
            time: t,
            horseFrame: horseFrames
        });
        syntheticFrames.push(synFrame);
    }

    const syntheticRaceData = new RaceSimulateData({
        frame: syntheticFrames,
        horseResult: newHorseResults,
        event: newEvents,
        horseNum: validRuns.length,
        frameCount: syntheticFrames.length,
        eventCount: newEvents.length,
        header: {
            maxLength: validRuns[0].race.raceData.header?.maxLength ?? refDistance,
            version: validRuns[0].race.raceData.header?.version ?? 0
        }
    });

    return { raceData: syntheticRaceData, horseInfo: newHorseInfo, detectedCourseId };
}
