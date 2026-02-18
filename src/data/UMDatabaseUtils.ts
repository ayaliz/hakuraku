import {RaceSimulateHorseResultData_RunningStyle} from "./race_data_pb";

export function formatTime(time: number): string {
    const min = Math.floor(time / 60);
    const sec = time - min * 60;
    return `${min}:${sec.toFixed(4).padStart(7, '0')}`;
}

export const distanceLabels: Record<number, string> = {
    1: 'Sprint',
    2: 'Mile',
    3: 'Medium',
    4: 'Long'
};

export const runningStyleLabels: Record<number, string> = {
    [RaceSimulateHorseResultData_RunningStyle.NONE]: "None",
    [RaceSimulateHorseResultData_RunningStyle.NIGE]: "Front Runner",
    [RaceSimulateHorseResultData_RunningStyle.SENKO]: "Pace Chaser",
    [RaceSimulateHorseResultData_RunningStyle.SASHI]: "Late Surger",
    [RaceSimulateHorseResultData_RunningStyle.OIKOMI]: "End Closer"
};

export const motivationLabels: Record<number, string> = {
    1: 'Awful',
    2: 'Bad',
    3: 'Normal',
    4: 'Good',
    5: 'Great'
};

export const charaProperLabels: Record<number, string> =
    {1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S"};
