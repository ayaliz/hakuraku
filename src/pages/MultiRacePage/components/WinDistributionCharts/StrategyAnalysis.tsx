import React from "react";
import { STRATEGY_COLORS } from "./constants";
import type { HorseEntry, StrategyStats, RoomCompositionEntry, SkillStats } from "../../types";
import type { CharacterTeamRateRow, StyleCompositionSummaryRow } from "../../../UmaLogsPage/panelData";
import { StyleBreakdownPanel } from "./StyleBreakdownPanel";
import { SaturationPanel } from "./SaturationPanel";
import { CompositionSection } from "./CompositionSection";
import { StyleRepsPanel } from "./StyleRepsPanel";
import { StyleTeamCompositionPanel } from "./StyleTeamCompositionPanel";
import "./StrategyAnalysis.css";

export type { StyleRepEntry } from "./StyleRepsPanel";
export { TeamMemberCard } from "./TeamMemberCard";
export type { TeamMemberCardProps } from "./TeamMemberCard";

interface StrategyAnalysisProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    strategyStats?: StrategyStats[];
    totalRaces?: number;
    roomCompositions?: RoomCompositionEntry[];
    styleCompositionRows?: StyleCompositionSummaryRow[];
    styleReps?: Parameters<typeof StyleRepsPanel>[0]["styleReps"];
    characterTeamRates?: CharacterTeamRateRow[];
    skillStats?: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
    hideSaturation?: boolean;
}

const StrategyAnalysis: React.FC<StrategyAnalysisProps> = ({
    cmId,
    courseId,
    apiBase,
    apiMode,
    strategyStats,
    totalRaces,
    roomCompositions,
    styleCompositionRows,
    styleReps,
    characterTeamRates,
    skillStats,
    strategyColors,
    onViewReplays,
    hideSaturation = false,
}) => {
    const hasData = strategyStats && strategyStats.length > 0 && totalRaces != null && totalRaces > 0;
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;

    return (
        <div className="pie-chart-container sa-main">
            {hasData ? (
                <>
                    <div className="sa-top-panels-row">
                        <StyleBreakdownPanel strategyStats={strategyStats!} totalRaces={totalRaces!} strategyColors={activeStrategyColors} />
                        {!hideSaturation && (
                            <SaturationPanel strategyStats={strategyStats!} totalRaces={totalRaces!} strategyColors={activeStrategyColors} />
                        )}
                        {hideSaturation && roomCompositions && (
                            <CompositionSection
                                totalRaces={totalRaces!}
                                roomCompositions={roomCompositions}
                                strategyColors={activeStrategyColors}
                            />
                        )}
                    </div>
                    {roomCompositions && (!hideSaturation || styleReps) && (
                        <div className="sa-comp-row">
                            {!hideSaturation && (
                                <CompositionSection
                                    totalRaces={totalRaces!}
                                    roomCompositions={roomCompositions}
                                    strategyColors={activeStrategyColors}
                                />
                            )}
                            {styleReps && (
                                <StyleRepsPanel
                                    cmId={cmId}
                                    courseId={courseId}
                                    apiBase={apiBase}
                                    apiMode={apiMode}
                                    styleReps={styleReps}
                                    characterTeamRates={characterTeamRates}
                                    skillStats={skillStats}
                                    strategyColors={activeStrategyColors}
                                    onViewReplays={onViewReplays}
                                />
                            )}
                        </div>
                    )}
                    {styleCompositionRows && styleCompositionRows.length > 0 && (
                        <StyleTeamCompositionPanel
                            cmId={cmId}
                            courseId={courseId}
                            apiBase={apiBase}
                            apiMode={apiMode}
                            styleCompositionRows={styleCompositionRows}
                            skillStats={skillStats}
                            strategyColors={activeStrategyColors}
                            onViewReplays={onViewReplays}
                        />
                    )}
                </>
            ) : null}
        </div>
    );
};

export default StrategyAnalysis;
