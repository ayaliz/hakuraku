import { useMemo, useState } from 'react';
import { BubblePlotPanel, type BubblePlotPoint } from '../MultiRacePage/components/WinDistributionCharts/BubblePlotPanel';
import { CharacterBreakdownPanel } from '../MultiRacePage/components/WinDistributionCharts/CharacterBreakdownPanel';
import { STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import type { PieSlice } from '../MultiRacePage/components/WinDistributionCharts/types';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { compositionQuery, normalize } from './query';
import { CompositionTable, Loading, number, PairButton, Panel, percent, Portrait, rate, RateValue, StyleLabel, useStrategyColors, type FindTeams } from './components';
import type { Contexts, Summary } from './types';
import '../MultiRacePage/components/WinDistributionCharts/CharacterAnalysis.css';

export default function Character({ data, selectedKey, onPair, onTeams }: { data: Summary; selectedKey: string | null; onPair: (key: string) => void; onTeams: FindTeams }) {
    const strategyColors = useStrategyColors();
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<'individual' | 'team' | 'pop'>('pop');
    const [minPop, setMinPop] = useState(.03);
    const [limit, setLimit] = useState(20);
    const selected = data.pairs.find(p => p.key === selectedKey) ?? [...data.pairs].sort((a, b) => b.pop - a.pop)[0];
    const contextFile = selected.key.replace(':', '-');
    const context = useSimData<Contexts>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/characters/${contextFile}`),
        data.snapshotId,
        `${DATA_ROOT}/${data.snapshotId}/characters/${contextFile}.json`,
    );
    const rows = useMemo(() => {
        const text = normalize(search);
        return data.pairs.filter(p => p.stylePop >= minPop && (!text || normalize(`${p.name} ${p.outfit} ${p.card} ${STRATEGY_NAMES[p.style]}`).includes(text)))
            .sort((a, b) => (sort === 'pop' ? b.pop - a.pop : rate(b, sort) - rate(a, sort)) || b.owners - a.owners);
    }, [data, search, sort, minPop]);
    const bubblePoints = useMemo((): BubblePlotPoint[] => {
        const text = normalize(search);
        return data.pairs
            .filter(p => !text || normalize(`${p.name} ${p.outfit} ${p.card} ${STRATEGY_NAMES[p.style]}`).includes(text))
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
                teamWinRate: rate(p, 'team'),
            }));
    }, [data, search]);
    const controls = <div className="sim-controls">
        <label className="sim-search-label"><span className="visually-hidden">Search Umas</span><input type="search" placeholder="Search Umas" value={search} onChange={e => { setSearch(e.target.value); setLimit(20); }} /></label>
        <label>Style share <select value={minPop} onChange={e => { setMinPop(Number(e.target.value)); setLimit(20); }}><option value={.03}>≥3%</option><option value={.01}>≥1%</option><option value={0}>All</option></select></label>
    </div>;
    const breakdownRows = useMemo(() => [...rows].sort((a, b) => b.pop - a.pop), [rows]);
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
        <div className="sim-character-filters">{controls}</div>
        <div className="sim-character-top">
            <CharacterBreakdownPanel
                title="Uma Breakdown"
                rawWinsSlices={rawWinsSlices}
                rawPopSlices={rawPopSlices}
                strategyColors={strategyColors}
                includeZeroWinEntries
                useBayesianWinRate={false}
                populationLabel="Corpus Share"
                shareLabel="Share%"
                onSelectCharacter={key => {
                    const [, card, style] = key.split('_').map(Number);
                    const pair = data.pairs.find(candidate => candidate.card === card && candidate.style === style);
                    if (pair) onPair(pair.key);
                }}
            />
            <BubblePlotPanel points={bubblePoints} strategyColors={strategyColors} minPopPct={(minPop * 100) as 0 | 1 | 3} onMinPopPctChange={value => { setMinPop(value / 100); setLimit(20); }} populationLabel="simulated corpus share" stylePopulationLabel="Style share" />
        </div>
        <Panel title="Uma Performance" controls={<label className="sim-controls">Sort <select value={sort} onChange={e => { setSort(e.target.value as typeof sort); setLimit(20); }}><option value="pop">Corpus share</option><option value="individual">Individual win%</option><option value="team">Team win%</option></select></label>}>
            <div className="sim-table-scroll"><table className="sim-table"><thead><tr><th>Uma / Style</th><th><abbr title="Share of runner appearances in the owner-balanced simulated corpus.">Corpus share</abbr></th><th><abbr title="Wins by this runner, divided by runner appearances.">Individual win%</abbr></th><th><abbr title="Wins by any teammate, divided by appearances of teams containing this pair. Each team is counted once.">Team win%</abbr></th><th>Owners</th><th>Examples</th></tr></thead><tbody>
                {rows.slice(0, limit).map(p => <tr key={p.key} className={selected.key === p.key ? 'sim-selected-row' : ''}><td><PairButton pair={p} onClick={() => onPair(p.key)} /></td><td>{percent(p.pop)}</td><td><RateValue value={rate(p, 'individual')} ci={p.individualCI} wins={p.individualWins} n={p.runnerExposures} /></td><td><RateValue value={rate(p, 'team')} ci={p.teamCI} wins={p.teamWins} n={p.teamExposures} /></td><td>{number(p.owners)}</td><td><button className="sim-link" type="button" onClick={() => onTeams([{ card: p.card, chara: p.chara, style: p.style }, {}, {}])}>View teams</button></td></tr>)}
            </tbody></table></div>
            {!rows.length && <p className="sim-empty">No Umas meet the filters.</p>}
            {rows.length > limit && <button className="sim-button sim-more" type="button" onClick={() => setLimit(value => value + 30)}>Show more ({number(rows.length - limit)})</button>}
        </Panel>
        <Panel title="Style Trio Synergy" controls={<span className="sim-selected-pair"><Portrait card={selected.card} name={selected.name} />{selected.name}<StyleLabel style={selected.style} short /></span>}>
            {context.data ? <CompositionTable rows={context.data.rows} minOwners={5} onSelect={key => onTeams(compositionQuery(key, selected))} /> : <Loading error={context.error} retry={context.retry} />}
        </Panel>
    </div>;
}
