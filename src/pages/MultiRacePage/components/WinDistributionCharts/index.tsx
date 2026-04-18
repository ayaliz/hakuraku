import React from "react";
import { WinDistributionChartsProps } from "./types";
import { useWinDistributionData } from "./useWinDistributionData";
import StrategyAnalysis from "./StrategyAnalysis";
import CharacterAnalysis from "./CharacterAnalysis";
import { buildAverageScoreSummary, buildCharacterPopulationSlices, getBestPlacingOpponents } from "./CharacterAnalysisUtils";

const WinDistributionCharts: React.FC<WinDistributionChartsProps> = ({
    characterStats,
    strategyStats,
    totalRaces,
    roomCompositions,
    allHorses,
    skillStats,
    spectatorMode,
}) => {
    const {
        rawUnifiedCharacterWinsAll,
        rawUnifiedCharacterWinsOpp,
        rawUnifiedCharacterPop,
    } = useWinDistributionData(allHorses);
    const opponentScoreSummary = !spectatorMode
        ? buildAverageScoreSummary(allHorses.filter((horse) => !horse.isPlayer))
        : null;
    const bestOpponentScoreSummary = !spectatorMode
        ? buildAverageScoreSummary(getBestPlacingOpponents(allHorses))
        : null;
    const characterPopOverride = !spectatorMode
        ? buildCharacterPopulationSlices(allHorses)
        : undefined;

    return (
        <div className="win-distribution-section">
            <StrategyAnalysis
                strategyStats={strategyStats}
                totalRaces={totalRaces}
                roomCompositions={roomCompositions}
                skillStats={skillStats}
            />
            <CharacterAnalysis
                rawWinsAll={rawUnifiedCharacterWinsAll}
                rawWinsOpp={rawUnifiedCharacterWinsOpp}
                rawPop={rawUnifiedCharacterPop}
                spectatorMode={spectatorMode}
                characterStats={characterStats}
                skillStats={skillStats}
                characterPopOverride={characterPopOverride}
                opponentScoreSummary={opponentScoreSummary}
                bestOpponentScoreSummary={bestOpponentScoreSummary}
            />
        </div>
    );
};

export default WinDistributionCharts;
