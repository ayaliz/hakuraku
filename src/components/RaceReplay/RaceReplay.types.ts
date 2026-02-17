import { RaceSimulateData } from "../../data/race_data_pb";

export type RaceReplayProps = {
    raceData: RaceSimulateData;
    raceHorseInfo: any[];
    displayNames: Record<number, string>;
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]>;
    otherEvents: Record<number, { time: number; duration: number; name: string }[]>;
    trainerColors?: Record<number, string>;
    detectedCourseId?: number;
    onTrackChange?: (courseId: number | undefined) => void;
};

export type InterpolatedFrame = {
    time: number;
    horseFrame: any[];
    frameIndex: number;
};
