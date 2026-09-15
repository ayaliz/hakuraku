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
import type { UmaLogsQuerySpec } from "./umaLogsQueryShared";
import type {
    GroupDeckData as SharedGroupDeckData,
    GroupPanelData as SharedGroupPanelData,
    OverviewSkillRow as SharedOverviewSkillRow,
    RaceBonusOverviewRow as SharedRaceBonusOverviewRow,
    StyleDeckSummaryRow,
    SupportCardSummaryRow as SharedSupportCardSummaryRow,
} from "../../features/umalogs/model/panelData";
import type { GroupSkillDetailPayload, SerializedSkillOverviewStats } from "./skillCache";
import type { SkillActivationPoint } from "../MultiRacePage/types";
import type { UmaLogsSection } from "../../features/umalogs/model/sections";

export type { UmaLogsSection as Section } from "../../features/umalogs/model/sections";
export {
    UMA_LOGS_PANEL_DATA_SECTIONS as PANEL_DATA_SECTIONS,
    UMA_LOGS_ROUTE_SECTIONS,
    UMA_LOGS_SECTIONS,
} from "../../features/umalogs/model/sections";

export type SerializedSkillStats = Omit<SkillStats, 'learnedByCharaIds' | 'learnedByStrategies'> & {
    learnedByCharaIds: number[];
    learnedByStrategies: number[];
    activationDistances?: number[];
};

export type SerializedHorseEntry = Omit<HorseEntry, 'activatedSkillIds' | 'forcedActivatedSkillIds' | 'learnedSkillIds' | 'trainerName' | 'raceDistance' | 'isPlayer' | 'charaName'> & {
    activatedSkillIds: number[];
    forcedActivatedSkillIds?: number[];
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

export type OverviewSkillRow = SharedOverviewSkillRow;
export type SupportCardSummaryRow = SharedSupportCardSummaryRow;
export type GroupPanelData = SharedGroupPanelData<SerializedHorseEntry>;
export type GroupDeckData = SharedGroupDeckData;

export interface TrackGroup {
    courseId: number;
    trackLabel: string;
    raceCount: number;
    stats: UmaLogsStats;
}

export interface TrackGroupContentProps {
    group: TrackGroup;
    cmId: string | null;
    cmLabel: string;
    section: UmaLogsSection;
    onSectionChange: (section: UmaLogsSection) => void;
    onViewReplaysForHorse: (horse: HorseEntry) => void;
    onFindReplaysForQuery: (querySpec: UmaLogsQuerySpec) => void;
    onEditAsQuery: (query: string) => void;
    initialQuery?: string;
    scoreWinnersOnly: boolean;
    setScoreWinnersOnly: (v: boolean) => void;
    totalRaces: number;
    strategyColors: Record<number, string>;
}

export type StyleDeckRow = StyleDeckSummaryRow;
export type RaceBonusOverviewRow = SharedRaceBonusOverviewRow;

export const RACE_BONUS_OTHER_MIN_POP_PCT = 0.5;
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
