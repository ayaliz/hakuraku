import type {
    CharacterStats,
    EmpiricalBayesTeamEntry,
    GateBlockedStats,
    GateStats,
    GateWinRateStats,
    GateWinRateSplitStats,
    HorseEntry,
    RoomCompositionEntry,
    SkillActivationBuckets,
    SkillStats,
    StrategyStats,
    TrueSkillTeamEntry,
} from "../MultiRacePage/types";
import type { PieSlice } from "../MultiRacePage/components/WinDistributionCharts/types";
import type { StyleRepEntry } from "../MultiRacePage/components/WinDistributionCharts/StyleRepsPanel";
import type { HistogramData, StyleCompositionSummaryRow, CharacterTeamRateRow } from "./panelData";
import type { GroupSkillDetailPayload, SerializedSkillOverviewStats } from "./skillCache";
import type { SkillActivationPoint } from "../MultiRacePage/types";

export type SerializedSkillStats = Omit<SkillStats, 'learnedByCharaIds' | 'learnedByStrategies'> & {
    learnedByCharaIds: number[];
    learnedByStrategies: number[];
    activationDistances?: number[];
};

export type SerializedHorseEntry = Omit<HorseEntry, 'activatedSkillIds' | 'learnedSkillIds' | 'trainerName' | 'raceDistance' | 'isPlayer' | 'charaName'> & {
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
};

export type SerializedGateStats = Partial<GateStats> & {
    blockedRates?: GateBlockedStats[];
};

export type SerializedStats = {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    rawStrategyTotals: Record<number, number>;
    roomCompositions: RoomCompositionEntry[];
    skillStats: [number, SerializedSkillStats][];
    skillBuckets: [number, SkillActivationBuckets][];
    gateStats?: SerializedGateStats;
    blockedRates?: GateBlockedStats[];
    gateWinRates?: GateWinRateStats[];
    gateWinRatesByFlavor?: GateWinRateSplitStats;
    trueskillRanking?: TrueSkillTeamEntry[];
    empiricalBayesRanking?: EmpiricalBayesTeamEntry[];
};

export type SerializedGroup = {
    raceId: string;
    courseId: number;
    trackLabel: string;
    raceCount: number;
    stats: SerializedStats;
};

export type UmaLogsData = {
    generatedAt: string;
    cmId?: string;
    cmLabel?: string;
    groups: SerializedGroup[];
};

export type ManifestEntry = {
    cmId: string;
    cmLabel: string;
    generatedAt: string;
    totalRaces: number;
    trackSummary?: string;
};

export type Manifest = {
    datasets: ManifestEntry[];
};

export type GroupSkillOverviewResponse = {
    cmId: string;
    courseId: number;
    skillStats: [number, SerializedSkillOverviewStats][];
};

export type GroupSkillDetailResponse = {
    cmId: string;
    courseId: number;
    skillId: number;
} & GroupSkillDetailPayload;

export type OverviewSkillRow = {
    skillId: number;
    name: string;
    isInherit: boolean;
    appearances: number;
    winAppearances: number;
    popPct: number;
    adjWinRate: number;
};

export type SupportCardSummaryRow = {
    cardId: number;
    appearances: number;
    popPct: number;
    lbDist: number[];
    rawWins: number;
    rawApps: number;
    adjWinRate: number;
};

export type GroupPanelData = {
    cmId: string;
    courseId: number;
    uniqueUmaCount: number;
    winningTimeHistogram: HistogramData | null;
    scoreHistogramAll: HistogramData | null;
    scoreHistogramWinners: HistogramData | null;
    topHorses: {
        fastestWin?: SerializedHorseEntry;
        slowestWin?: SerializedHorseEntry;
        highestWinner?: SerializedHorseEntry;
        lowestWinner?: SerializedHorseEntry;
    };
    skillsByStrategy: Record<number, OverviewSkillRow[]>;
    supportCardRows: SupportCardSummaryRow[];
    raceBonusRows: RaceBonusOverviewRow[];
    styleReps: Record<number, StyleRepEntry[]>;
    styleCompositionRows: StyleCompositionSummaryRow[];
    characterTeamRates: CharacterTeamRateRow[];
    rawUnifiedCharacterWinsAll: PieSlice[];
    rawUnifiedCharacterWinsOpp: PieSlice[];
    rawUnifiedCharacterPop: PieSlice[];
};

export type GroupDeckData = {
    cmId: string;
    courseId: number;
    styleDeckRowsByStyle: Record<number, StyleDeckRow[]>;
};

export interface TrackGroup {
    courseId: number;
    trackLabel: string;
    raceCount: number;
    stats: UmaLogsStats;
}

export type Section = 'introduction' | 'overview' | 'strategy' | 'character' | 'skill' | 'explorer' | 'replays';
export const UMA_LOGS_SECTIONS: readonly Section[] = ['introduction', 'overview', 'strategy', 'character', 'skill', 'explorer', 'replays'];

export interface TrackGroupContentProps {
    group: TrackGroup;
    cmId: string | null;
    cmLabel: string;
    section: Section;
    onSectionChange: (section: Section) => void;
    scoreWinnersOnly: boolean;
    setScoreWinnersOnly: (v: boolean) => void;
    totalRaces: number;
    totalUniqueUmas: number | null;
    strategyColors: Record<number, string>;
}

export type StyleDeckRow = {
    deckKey: string;
    cardIds: number[];
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
    raceBonus: number;
};

export type RaceBonusOverviewRow = {
    bucketStart: number;
    bucketEnd: number;
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
    isOther: boolean;
};

export const RACE_BONUS_OTHER_MIN_POP_PCT = 0.5;
export const PANEL_DATA_SECTIONS: readonly Section[] = ['overview', 'strategy', 'character'];

export type UmaLogsStats = {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    rawStrategyTotals: Record<number, number>;
    roomCompositions: RoomCompositionEntry[];
    skillStats: Map<number, SkillStats>;
    skillActivations: Map<number, SkillActivationPoint[]>;
    skillActivationBuckets?: Map<number, SkillActivationBuckets>;
    gateStats: GateStats;
    trueskillRanking?: TrueSkillTeamEntry[];
    empiricalBayesRanking?: EmpiricalBayesTeamEntry[];
};
