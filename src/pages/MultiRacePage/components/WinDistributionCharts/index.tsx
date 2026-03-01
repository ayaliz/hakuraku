import React from "react";
import { WinDistributionChartsProps } from "./types";
import { useWinDistributionData } from "./useWinDistributionData";
import StrategyAnalysis from "./StrategyAnalysis";
import CharacterAnalysis from "./CharacterAnalysis";

const WinDistributionCharts: React.FC<WinDistributionChartsProps> = ({
    characterStats,
    allHorses,
    spectatorMode,
}) => {
    const {
        rawUnifiedCharacterWinsAll,
        rawUnifiedCharacterWinsOpp,
        rawUnifiedCharacterPop,
    } = useWinDistributionData(allHorses);

    return (
        <div className="win-distribution-section">
            <StrategyAnalysis />
            <CharacterAnalysis
                rawWinsAll={rawUnifiedCharacterWinsAll}
                rawWinsOpp={rawUnifiedCharacterWinsOpp}
                rawPop={rawUnifiedCharacterPop}
                spectatorMode={spectatorMode}
                characterStats={characterStats}
                allHorses={allHorses}
            />
        </div>
    );
};

export default WinDistributionCharts;
