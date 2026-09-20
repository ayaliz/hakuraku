import { createContext, useContext, type ReactNode } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import AssetLoader from '../../data/AssetLoader';
import { STRATEGY_COLORS, STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import { SHORT_STYLE } from './query';
import type { Card, Interval, Pair, TeamRate, Requirement, Runner, SnapshotMeta } from './types';

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export const number = (value: number) => value.toLocaleString('en-US');
export const interval = (value: Interval) => value.map(percent).join('–');
export const rate = (row: Pick<Pair, 'individual' | 'team'>, metric: 'individual' | 'team') => row[metric];

export type StrategyColors = Record<number, string>;
const StrategyColorsContext = createContext<StrategyColors>(STRATEGY_COLORS);

export function StrategyPaletteProvider({ colors, children }: { colors: StrategyColors; children: ReactNode }) {
    return <StrategyColorsContext.Provider value={colors}>{children}</StrategyColorsContext.Provider>;
}

export function useStrategyColors() {
    return useContext(StrategyColorsContext);
}

export function styleName(style: number, short = false, racingStyle?: number): string {
    const name = (short ? SHORT_STYLE : STRATEGY_NAMES)[style] ?? String(style);
    const runningStyle = racingStyle === undefined ? undefined : STRATEGY_NAMES[racingStyle];
    return style === 6 && runningStyle ? `${name} (${runningStyle})` : name;
}

export function courseAptitudeLabels(meta: Pick<SnapshotMeta, 'course' | 'courseSurface' | 'courseDistance'>) {
    const surface = meta.courseSurface
        ?? (/\bDirt\b/i.test(meta.course) ? 'Dirt' : /\bTurf\b/i.test(meta.course) ? 'Turf' : 'Surface');
    const meters = Number(meta.course.match(/([\d,]+)\s*m\b/i)?.[1].replaceAll(',', ''));
    const distance = meta.courseDistance ?? (!Number.isFinite(meters) ? 'Distance'
        : meters <= 1400 ? 'Sprint' : meters <= 1800 ? 'Mile' : meters <= 2400 ? 'Medium' : 'Long');
    return { surface, distance };
}

export function Loading({ error, retry }: { error?: string; retry: () => void }) {
    return error ? <Alert variant="danger" className="sim-load-error">{error} <button type="button" className="sim-button" onClick={retry}>Retry</button></Alert>
        : <div className="sim-loading" role="status"><Spinner animation="border" size="sm" /> Loading results…</div>;
}
export function Panel({ title, controls, children, className = '' }: { title: string; controls?: ReactNode; children: ReactNode; className?: string }) {
    return <section className={`sim-panel ${className}`}><div className="sim-panel-heading"><h2>{title}</h2>{controls}</div>{children}</section>;
}
export function StyleLabel({ style, short = false, racingStyle }: { style: number; short?: boolean; racingStyle?: number }) {
    const strategyColors = useStrategyColors();
    return <span className="sim-style"><i aria-hidden="true" style={{ background: strategyColors[style] }} />{styleName(style, short, racingStyle)}</span>;
}
export function Portrait({ card, name, large = false }: { card: number; name: string; large?: boolean }) {
    return <img className={`sim-portrait${large ? ' sim-portrait-large' : ''}`} src={AssetLoader.getCharaThumb(card)}
        alt={name} title={name} loading="lazy"
        onError={event => { const fallback = AssetLoader.getCharaIcon(Math.floor(card / 100)); if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback; }} />;
}
export function PairButton({ pair, onClick }: { pair: Pair; onClick: () => void }) {
    return <button type="button" className="sim-pair-button" onClick={onClick} title={`${pair.name} · ${STRATEGY_NAMES[pair.style]}`}>
        <Portrait card={pair.card} name={pair.name} /><span>{pair.name}</span><StyleLabel style={pair.style} short />
    </button>;
}
export function RateValue({ value, ci, wins, n }: { value: number; ci?: Interval; wins?: number; n?: number }) {
    return <span className="sim-rate" title={[wins !== undefined && n !== undefined ? `${number(wins)} wins / ${number(n)} appearances` : '', ci ? `Raw rate 95% simulation interval: ${interval(ci)}` : ''].filter(Boolean).join('\n')}>{percent(value)}</span>;
}
export function Composition({ name, keyValue, onClick }: { name: string; keyValue: string; onClick?: () => void }) {
    const strategyColors = useStrategyColors();
    const content = <><span className="sim-dots" aria-hidden="true">{keyValue.split('-').map((s, i) => <i key={i} style={{ background: strategyColors[Number(s)] }} />)}</span>{keyValue.split('-').map(s => SHORT_STYLE[Number(s)]).join(' / ') || name}</>;
    return onClick ? <button className="sim-composition" type="button" onClick={onClick}>{content}</button> : <span className="sim-composition">{content}</span>;
}
export function CompositionTable({ rows, onSelect, minOwners = 30 }: { rows: TeamRate[]; onSelect: (key: string) => void; minOwners?: number }) {
    const sorted = rows.filter(r => r.owners >= minOwners).sort((a, b) => (b.team - a.team));
    return sorted.length ? <div className="sim-table-scroll"><table className="sim-table"><thead><tr><th>Composition</th><th>Team win%</th><th>95% interval</th><th><abbr title="Distinct players with at least one simulated team matching this composition. Each player is counted once.">Players</abbr></th><th>Examples</th></tr></thead><tbody>
        {sorted.map(row => <tr key={row.key}><td><Composition keyValue={row.key} name={row.name} onClick={() => onSelect(row.key)} /></td>
            <td><span className={row.team > 1 / 3 ? 'sim-above' : ''}><RateValue value={row.team} ci={row.teamCI} wins={row.teamWins} n={row.teamExposures} /></span></td>
            <td>{interval(row.teamCI)}</td><td>{number(row.owners)}</td><td><button className="sim-link" type="button" onClick={() => onSelect(row.key)}>View teams</button></td></tr>)}
    </tbody></table></div> : <p className="sim-empty">No compositions meet this owner filter.</p>;
}
export function RunnerPortraits({ members, cards }: { members: Runner[]; cards: Record<number, Card> }) {
    const strategyColors = useStrategyColors();
    return <span className="sim-team-portraits">{members.map((runner, i) => <span key={`${runner.id}-${i}`} className="sim-runner-token" style={{ borderColor: strategyColors[runner.style] }}>
        <Portrait card={runner.card} name={cards[runner.card].name} /><span>{styleName(runner.style, true, runner.racingStyle)}</span>
    </span>)}</span>;
}
export type FindTeams = (slots: Requirement[]) => void;
