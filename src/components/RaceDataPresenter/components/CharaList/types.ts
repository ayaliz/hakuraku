import { Chara } from "../../../../data/data_pb";
import { RaceSimulateHorseResultData } from "../../../../data/race_data_pb";
import { TrainedCharaData } from "../../../../data/TrainedCharaData";

export type SupportCardEntry = {
    position: number;
    id: number;
    lb: number;
    exp: number;
};

export type ParentEntry = {
    positionId: number;
    cardId: number;
    rank: number;
    factors: { id: number; level: number }[];
};

export type CharaTableData = {
    trainedChara: TrainedCharaData,
    chara: Chara | undefined,

    frameOrder: number,
    finishOrder: number,

    horseResultData: RaceSimulateHorseResultData,

    popularity: number,
    popularityMarks: number[],
    motivation: number,

    activatedSkills: Set<number>,
    activatedSkillCounts: Map<number, number>,

    raceDistance: number,

    deck: SupportCardEntry[],
    parents: ParentEntry[],

    totalSkillPoints: number;

    startDelay?: number;
    isLateStart?: boolean;
    lastSpurtTargetSpeed?: number;
    maxAdjustedSpeed?: number;
    hpOutcome?: { type: 'died'; distance: number; deficit: number; startHp: number } | { type: 'survived'; hp: number; startHp: number };
    duelingTime?: number;
    downhillModeTime?: number;
    paceUpTime?: number;
    paceDownTime?: number;
    timeDiffToPrev?: number;
};

export type AggregatedFactor = {
    id: number;
    level: number;
    nameOverride?: string;
};
