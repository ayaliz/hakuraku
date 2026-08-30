import { RaceSimulateData } from "../../data/race_data_pb";

export type ParsedRace = {
    id: string;
    fileName: string;
    raceData: RaceSimulateData;
    horseInfo: any[];
    detectedCourseId?: number;
    groundCondition?: number;
    weather?: string | number;
    season?: string | number;
    raceDistance: number;
    uploadedAt: Date;
    playerIndices: Set<number>;
    raceType?: string;
    /** trainedCharaId → support cards in slot order (positions 1–6); non-unique fallback */
    deckByTrainedCharaId: Map<number, { id: number; lb: number }[]>;
    /** "${viewerId}:${cardId}" → support cards; primary lookup key (uniquely identifies a horse in the room) */
    deckByViewerAndCard: Map<string, { id: number; lb: number }[]>;
};

export type HorseEntry = {
    raceId: string;
    frameOrder: number;
    finishOrder: number;
    charaId: number;
    charaName: string;
    cardId: number;
    strategy: number;
    rawStrategy?: number;
    isDebuffer?: boolean;
    trainerName: string;
    activatedSkillIds: Set<number>;
    /** Skills whose recorded activation was caused by 110071/910071 rather than their own trigger. */
    forcedActivatedSkillIds?: Set<number>;
    learnedSkillIds: Set<number>; // All skills the horse has in their skillset
    finishTime: number;
    raceDistance: number;
    careerWinCount: number;
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number; // Wit stat
    rankScore: number;
    scenarioId?: number;
    motivation: number; // 1=Awful, 2=Bad, 3=Normal, 4=Good, 5=Great
    activationChance: number; // Calculated skill activation chance based on wiz and mood
    isPlayer: boolean;
    teamId: number; // Room match team (1, 2, 3); 0 = unassigned / NPC
    supportCardIds: number[];       // 6 support card IDs in slot order (empty if unavailable)
    supportCardLimitBreaks: number[]; // parallel to supportCardIds: limit_break_count for each card
    // Aptitude values extracted during precomputation (see APTITUDE_* constants in precompute-umalogs.mts)
    aptGround?: number;   // aptitude for the tracked ground type (1=G … 8=S)
    aptDistance?: number; // aptitude for the tracked distance category
    aptStyle?: number;    // aptitude for this horse's running style
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
    /** keyed by oppressor strategy; each bucket: wins/subjectCount = per-runner win rate of this style when there are `count` oppressors in room */
    crossSaturation?: Record<number, { count: number; raceCount: number; wins: number; subjectCount: number }[]>;
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
    /** Learned observations where a natural proc remained observable (forced-only observations are censored). */
    activationOpportunities?: number;
    /** Learned horses whose only observed activation was caused by 110071/910071. */
    forcedActivationHorses?: number;
    winRate: number; // % of times the horse with this skill won
    avgFinishPosition: number;
    activationDistances: number[]; // For heatmap
    learnedByCharaIds: Set<number>; // IDs of characters who learned this skill
    learnedByStrategies: Set<number>; // Strategies of horses who learned/used this skill
    learnedByHorsesByStrategy?: Record<string, number>;
    uniqueHorsesByStrategy?: Record<string, number>;
    activationOpportunitiesByStrategy?: Record<string, number>;
    forcedActivationHorsesByStrategy?: Record<string, number>;
    meanDistance: number;
    medianDistance: number;
    timesActivatedByStrategy?: Record<string, number>;
    meanDistanceByStrategy?: Record<string, number>;
    medianDistanceByStrategy?: Record<string, number>;
};

export type SkillActivationPoint = {
    skillId: number;
    raceId: string;
    horseFrameOrder: number;
    distance: number;
    time: number;
    finishOrder: number;
    activationChance: number; // The horse's skill activation chance at time of proc
};

export type SkillDoubleProcStats = {
    estimatedDoubleOpportunityRate: number; // estimated P(two valid proc windows were present | learned)
};

export type SkillActivationBucketSeries = {
    all: number[];
    win: number[];
    byStrategy: Record<string, number[]>;
    winByStrategy?: Record<string, number[]>;
};

// Precomputed activation histogram for a single skill (used by UmaLogs, avoids storing raw points)
export type SkillActivationBuckets = SkillActivationBucketSeries & {
    byVariant?: Record<string, SkillActivationBucketSeries>; // per-rank/variant series (skill detail v3+)
    doubleProc?: SkillDoubleProcStats;
    doubleProcByStrategy?: Record<string, SkillDoubleProcStats>;
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
    winsX: number;    // of teamWins, times entity X individually had finishOrder === 1
    winsY: number;    // of teamWins, times entity Y individually had finishOrder === 1
};

export type RoomCompositionEntry = {
    counts: number[]; // [front, pace, late, end, runaway, ...]
    occurrences: number;
    rate: number; // occurrences / totalRaces
};

export type TeamCompositionStats = {
    buildKey?: string;
    members: { charaId: number; cardId: number; strategy: number; charaName: string }[];
    memberWins: number[];    // parallel to members: how many times each member had finishOrder === 1
    appearances: number;
    wins: number;
    expectedWins: number;    // sum of 1/numTeams per appearance
    winRate: number;         // wins / appearances
    impact: number;          // wins / expectedWins
    bayesianWinRate: number; // Bayesian-smoothed win rate (prior = 1/3, k = 5)
};

export type TeamRankingMember = {
    charaId: number;
    charaName: string;
    cardId: number;
    strategy: number;
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number;
    rankScore: number;
    motivation: number;
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    careerWinCount: number;
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
    aptGround?: number;
    aptDistance?: number;
    aptStyle?: number;
    finishTime?: number;
    finishOrder?: number;
};

export type TrueSkillTeamEntry = {
    members: TeamRankingMember[];  // 3 members, sorted canonically
    appearances: number;
    wins: number;
    mu: number;       // sum of member mu's (team-level mean)
    sigma: number;    // sqrt of sum of member sigma²'s (team-level uncertainty)
    conservative: number; // mu − 3σ (team conservative skill estimate)
};

export type EmpiricalBayesTeamEntry = {
    members: TeamRankingMember[]; // 3 members, sorted canonically
    appearances: number;
    wins: number;
    rawWinRate: number;
    bayesWinRate: number;
};

export type GateWinRateStats = {
    gateNumber: number;
    appearances: number;
    wins: number;
    winRate: number;
};

export type GateBlockedStats = {
    gateNumber: number;
    appearances: number;
    blockedCount: number;
    blockedWins: number;
    blockedRate: number;
    winRateAfterBlock: number;
};

export type GateSkillActivationStats = {
    gateNumber: number;
    opportunities: number;
    activations: number;
    activationWins: number;
    activationRate: number;
    winRateAfterActivation: number;
};

export type GateWinRateFlavor = "total" | "front" | "pace" | "late" | "end";
export type GateStatsMode = "winRate" | "blocked" | "dodgingDanger";

export type GateWinRateSplitStats = Record<GateWinRateFlavor, GateWinRateStats[]>;

export type GateStats = {
    winRatesByFlavor: GateWinRateSplitStats;
    blockedRatesByFlavor: Record<GateWinRateFlavor, GateBlockedStats[]>;
    dodgingDangerRates: GateSkillActivationStats[];
};

export type AggregatedStats = {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    rawStrategyTotals: Record<number, number>; // count of all horses per strategy
    roomCompositions: RoomCompositionEntry[];
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    skillActivationBuckets?: Map<number, SkillActivationBuckets>; // precomputed histograms (UmaLogs only)
    allHorses: HorseEntry[];
    teamStats: TeamCompositionStats[];
    pairSynergy: PairSynergyStats[];
    gateStats: GateStats;
    trueskillRanking?: TrueSkillTeamEntry[];
    empiricalBayesRanking?: EmpiricalBayesTeamEntry[];
};
