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

export default function Strategy({ data, onTeams }: { data: Summary; onTeams: FindTeams }) {
    const strategyColors = useStrategyColors();
    const [minimumPlayerShare, setMinimumPlayerShare] = useState(0.01);
    const minimumPlayers = Math.ceil(data.meta.populationOwners * minimumPlayerShare);
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
            grouped[pair.style].push({
                cardId: pair.card,
                charaId: pair.chara,
                charaName: pair.name,
                wins: pair.individualWins,
                appearances: pair.runnerExposures,
                players: pair.owners,
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
        .filter(row => row.owners >= minimumPlayers)
        .map(row => ({
            key: row.key,
            strategies: row.key.split('-').map(Number),
            label: row.name,
            appearances: row.teamExposures,
            wins: row.teamWins,
            winRate: row.team,
            bayesianWinRate: row.teamAdjusted,
            confidenceInterval: row.teamCI,
        })), [data.archetypes, minimumPlayers]);
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
                onSelectRepresentative={(entry, style) => onTeams([{ card: entry.cardId, chara: entry.charaId, style }, {}, {}])}
                useAdjustedRates={false}
                showPlayers
            />
        </div>
        <StyleTeamCompositionPanel
            styleCompositionRows={compositionRows}
            strategyColors={strategyColors}
            minimumAppearances={0}
            playerCounts={Object.fromEntries(data.archetypes.map(row => [row.key, row.owners]))}
            expandToAllOverperformers
            headerControls={<div className="bp-pop-filter-toggle" role="group" aria-label="Minimum player share">
                <span className="bp-pop-filter-label" title="Share of distinct simulated players with at least one team using this archetype. Each player counts once per archetype.">Player share:</span>
                {[0.005, 0.01, 0.02, 0.05, 0].map(share => <button type="button" key={share}
                    className={`bp-pop-filter-btn${minimumPlayerShare === share ? ' active' : ''}`}
                    aria-pressed={minimumPlayerShare === share}
                    title={share === 0 ? 'Show all archetypes' : `At least ${Math.ceil(data.meta.populationOwners * share).toLocaleString('en-US')} distinct players`}
                    onClick={() => setMinimumPlayerShare(share)}>
                    {share === 0 ? 'All' : `≥${share * 100}%`}
                </button>)}
            </div>}
            onSelectComposition={row => onTeams(compositionQuery(row.key))}
            useAdjustedRates={false}
        />
    </div>;
}
