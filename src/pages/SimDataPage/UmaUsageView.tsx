import { useMemo } from 'react';
import { STRATEGY_DISPLAY_ORDER, STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import { getCharaIcon } from '../MultiRacePage/components/WinDistributionCharts/utils';
import { simDataApiUrl, useSimData } from './data';
import { Loading, type FindTeams } from './components';
import { groupUmaUsage, type UmaUsage } from './umaUsage';
import type { Summary } from './types';

function segmentTextColor(color: string): string {
    const rgb = color.startsWith('#')
        ? (color.length === 4 ? color.slice(1).split('').map(value => parseInt(value + value, 16))
            : [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)))
        : color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!rgb || rgb.length !== 3) return '#fff';
    const luminance = rgb.map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return luminance > .179 ? '#111827' : '#fff';
}

export function UmaUsageRows({ usage, data, strategyColors, onTeams, limit }: {
    usage: UmaUsage; data: Pick<Summary, 'cards'>; strategyColors: Record<number, string>; onTeams: FindTeams; limit?: number;
}) {
    const rows = useMemo(() => groupUmaUsage(usage), [usage]);
    const maxUsagePct = Math.max(...rows.map(row => row.usagePct), 1);
    return <div className="ca-uma-usage">
        <div className="ca-usage-legend">{STRATEGY_DISPLAY_ORDER.filter(style => usage.pairs.some(pair => pair.style === style)).map(style =>
            <span key={style}><i style={{ background: strategyColors[style] }} />{STRATEGY_NAMES[style]}</span>)}</div>
        {rows.length === 0 ? <span className="sa-no-data">No usage data</span> : rows.slice(0, limit).map(row => {
            const card = data.cards[row.card];
            const name = card ? `${card.name} (${card.outfit})` : `Uma ${row.card}`;
            const icon = getCharaIcon(`${row.chara}_${row.card}`);
            const mainStyle = [...row.styles].sort((a, b) => b.players - a.players)[0]?.style ?? 0;
            return <div key={row.card} className="sa-sb-row ca-usage-row">
                <div className="ca-char-label">
                    <div className="ca-portrait-wrap">
                        <div className="ca-portrait-ring" style={{ background: strategyColors[mainStyle] ?? '#718096' }} />
                        {icon && <img src={icon} className="ca-portrait-img" alt="" loading="lazy" />}
                    </div>
                    <button type="button" className="ca-char-name ca-usage-name" onClick={() => onTeams([{ card: row.card, chara: row.chara }, {}, {}])} title={`View teams using ${name}`}>{card?.name ?? name}</button>
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label">Style</div>
                    <div className="sa-sb-track sa-sb-track--win ca-usage-track" aria-label={`${name} style breakdown`}>
                    {STRATEGY_DISPLAY_ORDER.map(style => row.styles.find(pair => pair.style === style)).filter(pair => pair && pair.players > 0).map(pair => {
                        const pct = pair!.players / row.players * 100;
                        const color = strategyColors[pair!.style] ?? '#718096';
                        const label = `${STRATEGY_NAMES[pair!.style]}: ${pct.toFixed(1)}% (${pair!.players.toLocaleString('en-US')} players)`;
                        return <button type="button" key={pair!.style} className="ca-usage-segment"
                            style={{ width: `${pct}%`, background: color, color: segmentTextColor(color) }}
                            title={label} aria-label={label}
                            onClick={() => onTeams([{ card: row.card, chara: row.chara, style: pair!.style }, {}, {}])}>
                            {pct >= 5 && <span>{pct.toFixed(1)}%</span>}
                        </button>;
                    })}
                    </div>
                    <div className="sa-sb-value ca-bar-value-wide" aria-hidden="true" />
                </div>
                <div className="sa-sb-bar-row">
                    <div className="sa-sb-bar-label" title="Share of players whose best team uses this Uma outfit, with all styles combined.">Usage</div>
                    <div className="sa-sb-track sa-sb-track--pick">
                        <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${row.usagePct / maxUsagePct * 100}%` }} />
                    </div>
                    <div className="sa-sb-value sa-sb-value--pick ca-bar-value-wide" title={`${row.players.toLocaleString('en-US')} of ${usage.totalPlayers.toLocaleString('en-US')} players`}>
                        {row.usagePct.toFixed(1)}% <span className="ca-abs-count">({row.players.toLocaleString('en-US')})</span>
                    </div>
                </div>
            </div>;
        })}
    </div>;
}

export default function UmaUsageView({ data, strategyColors, onTeams }: {
    data: Summary; strategyColors: Record<number, string>; onTeams: FindTeams;
}) {
    const result = useSimData<UmaUsage>(simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/uma-usage`), data.snapshotId);
    return result.data ? <UmaUsageRows usage={result.data} data={data} strategyColors={strategyColors} onTeams={onTeams} />
        : <Loading error={result.error} retry={result.retry} />;
}
