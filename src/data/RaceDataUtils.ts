import {RaceSimulateData, RaceSimulateEventData, RaceSimulateEventData_SimulateEventType} from "./race_data_pb";

type CustomSkillHitContext = {
    raceSimulateData: RaceSimulateData;
    raceHorseInfo?: any[];
    event: RaceSimulateEventData;
    casterFrameOrder: number;
    targetFrameOrder: number;
};

export type SkillTargetingState = "hit" | "miss" | "ambiguous-hit" | "ambiguous-miss";

// Return undefined when the detector cannot decide, so the recorded bitmask remains the fallback.
export type CustomSkillHitDetector = (context: CustomSkillHitContext) => boolean | SkillTargetingState | undefined;

const customSkillHitDetectors = new Map<number, CustomSkillHitDetector>();
const OPPONENTS_AHEAD_TARGET_DISTANCE_AMBIGUITY = 0.2;

export function registerCustomSkillHitDetector(skillIds: number[], detector: CustomSkillHitDetector): void {
    skillIds.forEach(skillId => customSkillHitDetectors.set(skillId, detector));
}

function distanceAtTime(raceSimulateData: RaceSimulateData, frameOrder: number, time: number): number | undefined {
    const frames = raceSimulateData.frame ?? [];
    if (frames.length === 0) return undefined;
    let previous = frames[0];
    for (let index = 1; index < frames.length; index++) {
        const next = frames[index];
        if ((next.time ?? 0) >= time) {
            const previousHorse = previous.horseFrame?.[frameOrder];
            const nextHorse = next.horseFrame?.[frameOrder];
            if (!previousHorse || !nextHorse) return undefined;
            const previousTime = previous.time ?? 0;
            const nextTime = next.time ?? previousTime;
            const ratio = nextTime > previousTime ? (time - previousTime) / (nextTime - previousTime) : 0;
            return (previousHorse.distance ?? 0) + ((nextHorse.distance ?? 0) - (previousHorse.distance ?? 0)) * ratio;
        }
        previous = next;
    }
    return previous.horseFrame?.[frameOrder]?.distance;
}

function horseInfoByFrameOrder(raceHorseInfo: any[] | undefined, frameOrder: number): any | undefined {
    return raceHorseInfo?.find(horse => Number(horse?.frame_order ?? horse?.frameOrder) - 1 === frameOrder);
}

const opponentsAheadHitDetector: CustomSkillHitDetector = ({ raceSimulateData, raceHorseInfo, event, casterFrameOrder, targetFrameOrder }) => {
    if (targetFrameOrder === casterFrameOrder) return false;
    const casterInfo = horseInfoByFrameOrder(raceHorseInfo, casterFrameOrder);
    const targetInfo = horseInfoByFrameOrder(raceHorseInfo, targetFrameOrder);
    const casterTeamId = Number(casterInfo?.team_id ?? casterInfo?.teamId ?? 0);
    const targetTeamId = Number(targetInfo?.team_id ?? targetInfo?.teamId ?? 0);
    if (casterTeamId > 0 && targetTeamId === casterTeamId) return false;

    const activationTime = event.frameTime ?? 0;
    const casterDistance = distanceAtTime(raceSimulateData, casterFrameOrder, activationTime);
    const targetDistance = distanceAtTime(raceSimulateData, targetFrameOrder, activationTime);
    if (casterDistance === undefined || targetDistance === undefined) return undefined;
    if (Math.abs(targetDistance - casterDistance) <= OPPONENTS_AHEAD_TARGET_DISTANCE_AMBIGUITY) {
        return targetDistance > casterDistance ? "ambiguous-hit" : "ambiguous-miss";
    }
    return targetDistance > casterDistance;
};

registerCustomSkillHitDetector([200691, 200692, 110301, 910301], opponentsAheadHitDetector);

// frameOrder should be 0-indexed.
export function filterRaceEvents(raceSimulateData: RaceSimulateData, frameOrder: number, eventType: RaceSimulateEventData_SimulateEventType): RaceSimulateEventData[] {
    return raceSimulateData.event.map(e => e.event!)
        .filter(event => event.type === eventType && event.param[0] === frameOrder);
}

// frameOrder should be 0-indexed.
export function filterCharaSkills(raceSimulateData: RaceSimulateData, frameOrder: number): RaceSimulateEventData[] {
    return filterRaceEvents(raceSimulateData, frameOrder, RaceSimulateEventData_SimulateEventType.SKILL);
}

// frameOrder should be 0-indexed.
export function getCharaActivatedSkillIds(raceSimulateData: RaceSimulateData, frameOrder: number): Set<number> {
    return new Set(filterCharaSkills(raceSimulateData, frameOrder).map(event => event.param[1]));
}

export function isSkillEventTargetingFrame(
    raceSimulateData: RaceSimulateData,
    event: RaceSimulateEventData,
    targetFrameOrder: number,
    raceHorseInfo?: any[],
): boolean {
    const state = getSkillEventTargetingState(raceSimulateData, event, targetFrameOrder, raceHorseInfo);
    return state === "hit" || state === "ambiguous-hit";
}

export function getSkillEventTargetingState(
    raceSimulateData: RaceSimulateData,
    event: RaceSimulateEventData,
    targetFrameOrder: number,
    raceHorseInfo?: any[],
): SkillTargetingState {
    if (event.param[0] === targetFrameOrder) return "miss";
    const detector = customSkillHitDetectors.get(event.param[1]);
    if (detector) {
        const customHit = detector({
            raceSimulateData,
            raceHorseInfo,
            event,
            casterFrameOrder: event.param[0],
            targetFrameOrder,
        });
        if (typeof customHit === "string") return customHit;
        if (customHit !== undefined) return customHit ? "hit" : "miss";
    }
    return event.paramCount! >= 5 && Boolean(event.param[4] & (1 << targetFrameOrder)) ? "hit" : "miss";
}

// frameOrder should be 0-indexed. This excludes skills casted by self.
export function filterCharaTargetedSkills(raceSimulateData: RaceSimulateData, frameOrder: number, raceHorseInfo?: any[]): RaceSimulateEventData[] {
    return raceSimulateData.event.map(e => e.event!)
        .filter(event => event.type === RaceSimulateEventData_SimulateEventType.SKILL &&
            isSkillEventTargetingFrame(raceSimulateData, event, frameOrder, raceHorseInfo));
}
