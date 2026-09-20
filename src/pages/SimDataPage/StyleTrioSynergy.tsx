import SynergyEntitySelect from '../MultiRacePage/components/WinDistributionCharts/SynergyEntitySelect';
import InfoTooltip from '../MultiRacePage/components/WinDistributionCharts/InfoTooltip';
import { STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import { compositionQuery } from './query';
import { Loading, number, percent, useStrategyColors, type FindTeams } from './components';
import type { Pair, TeamRate } from './types';

export default function StyleTrioSynergy({ pairs, selected, rows, error, retry, onPair, onTeams }: {
    pairs: Pair[]; selected: Pair; rows?: TeamRate[]; error?: string; retry: () => void;
    onPair: (key: string) => void; onTeams: FindTeams;
}) {
    const strategyColors = useStrategyColors();
    const supported = (rows ?? []).filter(row => row.owners >= 5).sort((a, b) => b.team - a.team);
    const groups = [
        { label: 'OVERPERFORMERS', positive: true, rows: supported.filter(row => row.team > 1 / 3).slice(0, 10) },
        { label: 'UNDERPERFORMERS', positive: false, rows: supported.filter(row => row.team < 1 / 3).slice(-10).reverse() },
    ];
    return <div className="syn-section">
        <div className="syn-section-header">Style Trio Synergy
            <InfoTooltip id="sim-style-trio-synergy-info" tip="Team compositions for a specific Uma, compared with the 33.3% team win-rate baseline. Counts are distinct players, not simulation appearances. Compositions require at least five players." />
        </div>
        <div className="syn-entity-row"><span className="syn-entity-label">Uma:</span>
            <SynergyEntitySelect entities={[...pairs].sort((a, b) => b.owners - a.owners).map(pair => ({
                key: pair.key, cardId: pair.card, strategy: pair.style, charaId: pair.chara,
                cardName: pair.outfit, charaName: pair.name, totalCoApps: pair.owners,
            }))} value={selected.key} onChange={key => { if (key) onPair(key); }} strategyColors={strategyColors} />
        </div>
        {!rows ? <Loading error={error} retry={retry} /> : !groups.some(group => group.rows.length) ?
            <div className="syn-no-data">No supported composition data for this entry.</div> :
            <div className="syn-tables-row">{groups.filter(group => group.rows.length).map(group =>
                <div className="syn-table-col" key={group.label}>
                    <div className={`syn-table-col-label syn-table-col-label--${group.positive ? 'best' : 'worst'}`}>
                        {group.label}<span className="syn-comp-meta"><span className="sa-meta-adj">Team win%</span><span className="sa-meta-raw">Players</span></span>
                    </div>
                    {group.rows.map(row => <button type="button" key={row.key} className="syn-comp-item syn-comp-item--clickable"
                        onClick={() => onTeams(compositionQuery(row.key, selected))} title="View matching teams">
                        <div className="syn-comp-dots">{row.key.split('-').map((style, index) =>
                            <span key={index} className="syn-comp-dot" style={{ background: strategyColors[Number(style)] }} />)}</div>
                        <div className="syn-comp-name">{row.key.split('-').map(style => STRATEGY_NAMES[Number(style)]?.split(' ')[0] ?? style).join(' / ')}</div>
                        <div className="syn-comp-stats"><span className="sa-adj-pct syn-comp-stat" style={{ color: group.positive ? '#68d391' : '#fc8181' }}>{percent(row.team)}</span>
                            <span className="sa-raw-pct syn-comp-stat" title="Distinct players with at least one matching simulated team">{number(row.owners)}</span></div>
                    </button>)}
                </div>)}</div>}
    </div>;
}
