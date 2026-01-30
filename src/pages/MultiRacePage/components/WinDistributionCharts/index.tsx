import React from "react";
import { WinDistributionChartsProps } from "./types";
import { useWinDistributionData } from "./useWinDistributionData";
import StrategyAnalysis from "./StrategyAnalysis";
import CharacterAnalysis from "./CharacterAnalysis";

const WinDistributionCharts: React.FC<WinDistributionChartsProps> = ({
    characterStats,
    strategyStats,
    allHorses,
}) => {
    const {
        strategyPieDataAll,
        strategyPieDataOpp,
        popStrategyData,
        strategyPerfMetrics,
        unifiedCharacterWinsAll,
        unifiedCharacterWinsOpp,
        unifiedCharacterPop,
        characterLegend,
        characterPerfMetrics,
    } = useWinDistributionData(characterStats, strategyStats, allHorses);

    return (
        <div className="win-distribution-section">
            <StrategyAnalysis
                strategyPieDataAll={strategyPieDataAll}
                strategyPieDataOpp={strategyPieDataOpp}
                popStrategyData={popStrategyData}
                perfMetrics={strategyPerfMetrics}
            />
            <CharacterAnalysis
                winsAll={unifiedCharacterWinsAll}
                winsOpp={unifiedCharacterWinsOpp}
                pop={unifiedCharacterPop}
                legend={characterLegend}
                perfMetrics={characterPerfMetrics}
            />
        </div>
    );
};

export default WinDistributionCharts;
