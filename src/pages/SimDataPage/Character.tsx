import { useMemo, useState } from 'react';
import { BubblePlotPanel, type BubblePlotPoint } from '../MultiRacePage/components/WinDistributionCharts/BubblePlotPanel';
import { CharacterBreakdownPanel } from '../MultiRacePage/components/WinDistributionCharts/CharacterBreakdownPanel';
import type { PieSlice } from '../MultiRacePage/components/WinDistributionCharts/types';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { rate, useStrategyColors, type FindTeams } from './components';
import StyleTrioSynergy from './StyleTrioSynergy';
import type { Contexts, Summary } from './types';
import '../MultiRacePage/components/WinDistributionCharts/CharacterAnalysis.css';

export default function Character({ data, selectedKey, onPair, onTeams }: { data: Summary; selectedKey: string | null; onPair: (key: string) => void; onTeams: FindTeams }) {
    const strategyColors = useStrategyColors();
    const [minPop, setMinPop] = useState(.03);
    const selected = data.pairs.find(p => p.key === selectedKey) ?? [...data.pairs].sort((a, b) => b.pop - a.pop)[0];
    const contextFile = selected.key.replace(':', '-');
    const context = useSimData<Contexts>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/characters/${contextFile}`),
        data.snapshotId,
        `${DATA_ROOT}/${data.snapshotId}/characters/${contextFile}.json`,
    );
    const bubblePoints = useMemo((): BubblePlotPoint[] => {
        return data.pairs
            .map(p => ({
                key: `${p.chara}_${p.card}_${p.style}`,
                label: p.name,
                charaId: p.chara,
                cardId: p.card,
                strategyId: p.style,
                popPct: p.pop * 100,
                stylePopPct: p.stylePop * 100,
                winRate: rate(p, 'individual'),
                count: p.runnerExposures,
                players: p.owners,
                teamWinRate: rate(p, 'team'),
            }));
    }, [data]);
    const breakdownRows = useMemo(() => [...data.pairs].sort((a, b) => b.pop - a.pop), [data.pairs]);
    const rawWinsSlices = useMemo<PieSlice[]>(() => breakdownRows.map(pair => ({
        value: pair.individualWins,
        percentage: pair.winShare * 100,
        label: pair.name,
        fullLabel: pair.name,
        color: strategyColors[pair.style],
        charaId: `${pair.chara}_${pair.card}_${pair.style}`,
        strategyId: pair.style,
        cardId: pair.card,
    })), [breakdownRows, strategyColors]);
    const rawPopSlices = useMemo<PieSlice[]>(() => breakdownRows.map(pair => ({
        value: pair.runnerExposures,
        percentage: pair.pop * 100,
        label: pair.name,
        fullLabel: pair.name,
        color: strategyColors[pair.style],
        charaId: `${pair.chara}_${pair.card}_${pair.style}`,
        strategyId: pair.style,
        cardId: pair.card,
    })), [breakdownRows, strategyColors]);
    return <div className="sim-sections">
        <div className="sim-character-top">
            <CharacterBreakdownPanel
                title="Uma Breakdown"
                rawWinsSlices={rawWinsSlices}
                rawPopSlices={rawPopSlices}
                strategyColors={strategyColors}
                includeZeroWinEntries
                useBayesianWinRate={false}
                populationLabel="Players"
                shareLabel="Players"
                playerCounts={Object.fromEntries(data.pairs.map(pair => [`${pair.chara}_${pair.card}_${pair.style}`, pair.owners]))}
                onSelectCharacter={key => {
                    const [, card, style] = key.split('_').map(Number);
                    const pair = data.pairs.find(candidate => candidate.card === card && candidate.style === style);
                    if (pair) onPair(pair.key);
                }}
            />
            <BubblePlotPanel points={bubblePoints} strategyColors={strategyColors} minPopPct={(minPop * 100) as 0 | 1 | 3} onMinPopPctChange={value => setMinPop(value / 100)} populationLabel="simulated corpus share" stylePopulationLabel="Style share"
                onSelectPoint={point => onTeams([{ card: point.cardId, chara: point.charaId, style: point.strategyId }, {}, {}])} />
        </div>
        <StyleTrioSynergy pairs={data.pairs} selected={selected} rows={context.data?.rows}
            error={context.error} retry={context.retry} onPair={onPair} onTeams={onTeams} />
    </div>;
}
