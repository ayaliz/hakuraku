import { RaceSimulateData } from "../../data/race_data_pb";

export type ParsedRace = {
    id: string;
    fileName: string;
    raceData: RaceSimulateData;
    horseInfo: any[];
    detectedCourseId?: number;
    raceDistance: number;
    uploadedAt: Date;
    playerIndices: Set<number>;
    raceType?: string;
};

export type HorseEntry = {
    raceId: string;
    frameOrder: number;
    finishOrder: number;
    charaId: number;
    charaName: string;
    cardId: number;
    strategy: number;
    trainerName: string;
    activatedSkillIds: Set<number>;
    learnedSkillIds: Set<number>; // All skills the horse has in their skillset
    finishTime: number;
    raceDistance: number;
    wiz: number; // Wit stat
    motivation: number; // 1=Awful, 2=Bad, 3=Normal, 4=Good, 5=Great
    activationChance: number; // Calculated skill activation chance based on wiz and mood
    isPlayer: boolean;
};

export type CharacterStats = {
    charaId: number;
    charaName: string;
    totalRaces: number;
    wins: number;
    top3Finishes: number;
    avgFinishPosition: number;
    avgFinishTime: number;
};

export type StrategyStats = {
    strategy: number;
    strategyName: string;
    totalRaces: number;
    wins: number;
    top3Finishes: number;
    avgFinishPosition: number;
    winningCharacters: { charaId: number; charaName: string; wins: number }[];
};

export type SkillStats = {
    skillId: number;
    skillName: string;
    skillNames: string[]; // List of all variant names (e.g. Normal and Rare versions)
    timesActivated: number;
    normalizedActivations: number; // Activations weighted by 1/activationChance to isolate conditions from RNG
    uniqueRaces: number;
    uniqueHorses: number;
    learnedByHorses: number; // How many horses had this skill in their skillset
    winRate: number; // % of times the horse with this skill won
    avgFinishPosition: number;
    activationDistances: number[]; // For heatmap
    learnedByCharaIds: Set<number>; // IDs of characters who learned this skill
    learnedByStrategies: Set<number>; // Strategies (1-4) of horses who learned/used this skill
    meanDistance: number;
    medianDistance: number;
};

export type SkillActivationPoint = {
    raceId: string;
    horseFrameOrder: number;
    distance: number;
    time: number;
    finishOrder: number;
    activationChance: number; // The horse's skill activation chance at time of proc
};

export type AggregatedStats = {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    allHorses: HorseEntry[];
};
