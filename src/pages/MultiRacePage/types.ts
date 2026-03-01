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
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number; // Wit stat
    rankScore: number;
    motivation: number; // 1=Awful, 2=Bad, 3=Normal, 4=Good, 5=Great
    activationChance: number; // Calculated skill activation chance based on wiz and mood
    isPlayer: boolean;
    isDebuffer: boolean; // True if horse has ≥4 skills with debuff icon IDs
    teamId: number; // Room match team (1, 2, 3); 0 = unassigned / NPC
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
    saturation: { count: number; raceCount: number; wins: number }[];
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

// Precomputed activation histogram for a single skill (used by UmaLogs, avoids storing raw points)
export type SkillActivationBuckets = {
    all: number[];                     // counts per distance bucket, all activations
    win: number[];                     // counts per distance bucket, winning horses only
    byStrategy: Record<string, number[]>; // counts per distance bucket, keyed "1"–"4"
};

export type PairSynergyStats = {
    // Canonical ordering: (cardId_x * 10 + strategy_x) ≤ (cardId_y * 10 + strategy_y)
    cardId_x: number;
    strategy_x: number;
    charaId_x: number;
    cardId_y: number;
    strategy_y: number;
    charaId_y: number;
    coApps: number;   // team-race appearances where both were on the same team
    teamWins: number; // of those, times the team produced the race winner
};

export type RoomCompositionEntry = {
    counts: [number, number, number, number]; // [front, pace, late, end] — all horses incl. debuffers
    occurrences: number;
    rate: number; // occurrences / totalRaces
};

export type TeamCompositionStats = {
    members: { charaId: number; cardId: number; strategy: number; charaName: string }[];
    memberWins: number[];    // parallel to members: how many times each member had finishOrder === 1
    appearances: number;
    wins: number;
    expectedWins: number;    // sum of 1/numTeams per appearance
    winRate: number;         // wins / appearances
    impact: number;          // wins / expectedWins
    bayesianWinRate: number; // Bayesian-smoothed win rate (prior = 1/3, k = 5)
};

export type AggregatedStats = {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    rawStrategyTotals: Record<number, number>; // count of all horses (incl. debuffers) per strategy
    roomCompositions: RoomCompositionEntry[];
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    skillActivationBuckets?: Map<number, SkillActivationBuckets>; // precomputed histograms (UmaLogs only)
    allHorses: HorseEntry[];
    teamStats: TeamCompositionStats[];
    pairSynergy: PairSynergyStats[];
};
