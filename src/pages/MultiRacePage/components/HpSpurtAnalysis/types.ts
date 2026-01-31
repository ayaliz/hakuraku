import { TrainedCharaData } from "../../../../data/TrainedCharaData";
import { ParsedRace } from "../../types";

export interface CharaHpSpurtStats {
    uniqueId: string; // aggregated key
    charaId: number;
    cardId: number;
    charaName: string;
    trainedChara: TrainedCharaData; // Representative trained chara data
    stats: { speed: number, stamina: number, pow: number, guts: number, wiz: number }; // Added stats
    totalRuns: number;
    wins: number;
    top3Finishes: number;
    skillActivationCounts: Record<number, number>; // SkillID -> Count
    normalizedSkillActivationCounts: Record<number, number>; // SkillID -> Normalized Count
    fullSpurtCount: number;
    survivalCount: number;
    hpOutcomesFullSpurt: number[];
    hpOutcomesNonFullSpurt: number[];
    recoveryStats: Record<string, RecoveryScenarioStats>;
    sourceRuns: { race: ParsedRace, horseFrameOrder: number }[];
}

export interface RecoveryScenarioStats {
    scenarioId: string; // Unique ID for the scenario
    label: string;      // Human readable label
    activationPattern: string; // e.g. "101" indicating which skills activated
    totalRuns: number;
    fullSpurtCount: number;
    survivalCount: number;
    hpOutcomes: number[];
}
