import {toKatakana, toRomaji} from "wanakana";
import {Chara, SupportCard} from './data_pb';
import {RaceSimulateHorseResultData_RunningStyle} from "./race_data_pb";

const normalizeRomaji = (s: string) => toRomaji(s).toLowerCase();
const normalizeKatakana = (s: string) => toKatakana(s).toLowerCase(); // To support ローマ字入力

export function charaNameWithIdAndCast(chara: Chara) {
    return `${chara.id} - ${charaNameWithCast(chara)}`;
}

export function charaNameWithCast(chara: Chara) {
    return `${chara.name} (${chara.castName})`;
}

export function supportCardNameWithId(supportCard: SupportCard) {
    return `${supportCard.id} - ${supportCard.name}`;
}

export function getPopularityMark(n: number) {
    const mark = n === 1 ? '◎' : n === 2 ? '○' : n === 3 ? '▲' : n === 4 || n === 5 ? '△' : '';
    return `${n}${mark}`;
}


export function formatTime(time: number): string {
    const min = Math.floor(time / 60);
    const sec = time - min * 60;
    return `${min}:${sec.toFixed(4).padStart(7, '0')}`;
}

export const teamRaceDistanceLabels: Record<number, string> = {
    1: 'Short Distance',
    2: 'Mile',
    3: 'Middle Distance',
    4: 'Long Distance',
    5: 'Dirt'
};

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

export const seasonLabels: Record<number, string> = {
    1: 'Spring',
    2: 'Summer',
    3: 'Autumn',
    4: 'Winter',
    5: 'Spring'
};

export const groundConditionLabels: Record<number, string> = {
    1: 'Firm',
    2: 'Good',
    3: 'Soft',
    4: 'Heavy'
};

export const weatherLabels: Record<number, string> = {
    1: 'Sunny',
    2: 'Cloudy',
    3: 'Rainy',
    4: 'Snowy'
};

export const charaProperLabels: Record<number, string> =
    {1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S"};
