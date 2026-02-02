import { TrainedCharaData } from "../../../../data/TrainedCharaData";
import { ParsedRace } from "../../types";

export interface CharaHpSpurtStats {
    uniqueId: string;
    charaId: number;
    cardId: number;
    charaName: string;
    trainedChara: TrainedCharaData;
    stats: { speed: number, stamina: number, pow: number, guts: number, wiz: number };
    totalRuns: number;
    wins: number;
    top3Finishes: number;
    skillActivationCounts: Record<number, number>;
    normalizedSkillActivationCounts: Record<number, number>;
    survivalCount: number;
    hpOutcomesFullSpurt: number[];
    hpOutcomesNonFullSpurt: number[];
    recoveryStats: Record<string, RecoveryScenarioStats>;
    sourceRuns: { race: ParsedRace, horseFrameOrder: number }[];
}

export interface RecoveryScenarioStats {
    scenarioId: string;
    label: string;
    activationPattern: string;
    totalRuns: number;
    fullSpurtCount: number;
    survivalCount: number;
    fullSpurtSurvivalCount: number;
    hpOutcomes: number[];
    hpOutcomesFullSpurt: number[];
}
