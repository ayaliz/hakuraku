import { useMemo, useState } from 'react';
import { CompositionSection } from '../MultiRacePage/components/WinDistributionCharts/CompositionSection';
import { SaturationPanel } from '../MultiRacePage/components/WinDistributionCharts/SaturationPanel';
import { StyleBreakdownPanel } from '../MultiRacePage/components/WinDistributionCharts/StyleBreakdownPanel';
import { STRATEGY_DISPLAY_ORDER, STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import { StyleRepsPanel, type StyleRepEntry } from '../MultiRacePage/components/WinDistributionCharts/StyleRepsPanel';
import { StyleTeamCompositionPanel } from '../MultiRacePage/components/WinDistributionCharts/StyleTeamCompositionPanel';
import type { StrategyStats } from '../MultiRacePage/types';
import type { StyleCompositionSummaryRow } from '../../features/umalogs/model/panelData';
import { compositionQuery, saturationStats } from './query';
import { useStrategyColors, type FindTeams } from './components';
import type { Summary } from './types';

export default function Strategy({ data, onPair, onTeams }: { data: Summary; onPair: (key: string) => void; onTeams: FindTeams }) {
    const strategyColors = useStrategyColors();
    const [rare, setRare] = useState(false);
    const strategyStats = useMemo<StrategyStats[]>(() => saturationStats(data).map(stat => {
        const row = data.styles.find(candidate => candidate.style === stat.strategy)!;
        return {
            ...stat,
            strategyName: STRATEGY_NAMES[stat.strategy],
            totalRaces: row.runners,
            wins: row.winShare * data.meta.populationRaces,
            top3Finishes: 0,
            avgFinishPosition: 0,
            winningCharacters: [],
        };
    }), [data]);
    const styleReps = useMemo(() => {
        const grouped: Record<number, StyleRepEntry[]> = {};
        for (const style of STRATEGY_DISPLAY_ORDER) grouped[style] = [];
        for (const pair of data.pairs) {
            if (pair.owners < 30) continue;
            grouped[pair.style].push({
                cardId: pair.card,
                charaId: pair.chara,
                charaName: pair.name,
                wins: pair.individualWins,
                appearances: pair.runnerExposures,
                popPct: pair.stylePop * 100,
                winRate: pair.individual,
                bayesianWinRate: pair.individualAdjusted,
                expectedWinRate: 1 / 9,
                scoreAdjustedWinRate: pair.individualAdjusted,
                scoreAdjustedLift: pair.individualAdjusted - (1 / 9),
                teamWins: pair.teamWins,
                teamAppearances: pair.teamExposures,
                teamWinRate: pair.team,
                teamBayesianWinRate: pair.teamAdjusted,
            });
        }
        return grouped;
    }, [data.pairs]);
    const roomCompositions = useMemo(() => data.rooms.rows.map(room => ({
        counts: STRATEGY_DISPLAY_ORDER.map(style => room.counts[style - 1]),
        occurrences: room.races,
        rate: room.frequency,
    })), [data.rooms.rows]);
    const averageRoomCounts = useMemo(
        () => STRATEGY_DISPLAY_ORDER.map(style => data.rooms.average[style - 1] ?? 0),
        [data.rooms.average],
    );
    const compositionRows = useMemo<StyleCompositionSummaryRow[]>(() => data.archetypes
        .filter(row => rare || row.owners >= 30)
        .map(row => ({
            key: row.key,
            strategies: row.key.split('-').map(Number),
            label: row.name,
            appearances: row.teamExposures,
            wins: row.teamWins,
            winRate: row.team,
            bayesianWinRate: row.teamAdjusted,
            confidenceInterval: row.teamCI,
        })), [data.archetypes, rare]);
    return <div className="sa-main sim-strategy-analysis">
        <div className="sa-top-panels-row">
            <StyleBreakdownPanel strategyStats={strategyStats} totalRaces={data.meta.populationRaces} strategyColors={strategyColors} shareLabel="Share%" shareDescription="simulated field share" />
            <SaturationPanel strategyStats={strategyStats} totalRaces={data.meta.populationRaces} strategyColors={strategyColors} />
        </div>
        <div className="sa-comp-row">
            <CompositionSection
                totalRaces={data.meta.populationRaces}
                roomCompositions={roomCompositions}
                strategyColors={strategyColors}
                averageCounts={averageRoomCounts}
                pacePromotionRate={data.rooms.noDisplayedFront}
            />
            <StyleRepsPanel
                styleReps={styleReps}
                strategyColors={strategyColors}
                onSelectRepresentative={(entry, style) => {
                    const pair = data.pairs.find(candidate => candidate.card === entry.cardId && candidate.style === style);
                    if (pair) onPair(pair.key);
                }}
                useAdjustedRates={false}
            />
        </div>
        <StyleTeamCompositionPanel
            styleCompositionRows={compositionRows}
            strategyColors={strategyColors}
            minimumAppearances={0}
            headerControls={<label className="sim-check"><input type="checkbox" checked={rare} onChange={event => setRare(event.target.checked)} /> Include rare compositions</label>}
            onSelectComposition={row => onTeams(compositionQuery(row.key))}
            useAdjustedRates={false}
        />
    </div>;
}
