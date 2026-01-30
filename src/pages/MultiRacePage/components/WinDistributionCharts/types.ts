import { HorseEntry, CharacterStats, StrategyStats } from "../../types";

export interface PieSlice {
    value: number;
    percentage: number;
    label: string;
    color: string;
    charaId?: number | string;
    strategyId?: number;
    tooltipLines?: string[];
}

export interface StrategyPieSlice extends PieSlice {
    winningCharacters?: { charaId: number; charaName: string; wins: number }[];
}

export interface PerformanceMetrics {
    id: number | string;
    label: string;
    diff: number; // percentage points
    impact: number; // Ratio (Win% / Pop%)
    winPct: number; // Share of total wins
    actualWinRate: number; // Wins / Entries
    popPct: number;
    popCount: number;
    winCount: number;
}

export interface WinDistributionChartsProps {
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    allHorses: HorseEntry[];
}
