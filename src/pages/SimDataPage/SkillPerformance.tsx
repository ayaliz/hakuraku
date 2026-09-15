import { useEffect, useMemo, useState } from 'react';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import { STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { Loading, number, Panel, percent } from './components';
import SkillDecisionPilot from './SkillDecisionPilot';
import { effectClass, signed, skillIcon } from './skillEffectPresentation';
import type { SkillEffectBreakdown, SkillEffectCell, SkillEffectEstimate, SkillEffectMetric, SkillEffects, Snapshot, Style } from './types';

type MetricKey = 'individualWinDelta' | 'teamWinDelta' | 'finishTimeGainSeconds';
const METRICS: Record<MetricKey, string> = {
    individualWinDelta: 'Individual win change', teamWinDelta: 'Team win change',
    finishTimeGainSeconds: 'Finish-time gain',
};

type CharacterMode = 'only' | 'excluding';
function breakdown(cell: SkillEffectCell, style: 'all' | Style): SkillEffectBreakdown | undefined {
    return style === 'all' ? cell : cell.byStyle[style];
}
function estimates(cell: SkillEffectCell, style: 'all' | Style, charaId: number | null, characterMode: CharacterMode) {
    const group = breakdown(cell, style);
    if (!group || charaId === null) return group;
    return group.byCharacter?.[charaId]?.[characterMode];
}
function estimate(cell: SkillEffectCell, style: 'all' | Style, charaId: number | null, characterMode: CharacterMode): SkillEffectEstimate | null {
    const group = estimates(cell, style, charaId, characterMode);
    return group ? group.confirmation ?? group.exploratory : null;
}
function value(metric: MetricKey, result: SkillEffectMetric) {
    return metric === 'finishTimeGainSeconds' ? `${signed(result.mean, 3)}s` : `${signed(result.mean * 100, 2)} pp`;
}
function range(metric: MetricKey, result: SkillEffectMetric) {
    const values = metric === 'finishTimeGainSeconds' ? result.ci95 : result.ci95.map(item => item * 100);
    const suffix = metric === 'finishTimeGainSeconds' ? 's' : ' pp';
    return `${signed(values[0], metric === 'finishTimeGainSeconds' ? 3 : 2)} to ${signed(values[1], metric === 'finishTimeGainSeconds' ? 3 : 2)}${suffix}`;
}
function Effect({ metric, result }: { metric: MetricKey; result: SkillEffectMetric }) {
    return <span className={`sim-skill-effect ${effectClass(result)}`} title={`95% interval: ${range(metric, result)}`}>{value(metric, result)}</span>;
}
function ActivationHeatmap({ estimate }: { estimate: SkillEffectEstimate }) {
    const timing = estimate.activationTiming;
    if (!timing || !timing.eventCounts.some(Boolean)) return null;
    const maximum = Math.max(...timing.eventCounts, 1);
    const phaseStarts = new Set([
        Math.round(timing.eventCounts.length / 6),
        Math.round(timing.eventCounts.length * 2 / 3),
        Math.round(timing.eventCounts.length * 5 / 6),
    ]);
    return <div className="sim-skill-activation-map">
        <div className="sim-skill-activation-heading"><strong>Simulator activation positions</strong><span>{number(timing.activatedPairs)} activated pairs</span></div>
        <div className="sim-skill-activation-bins" style={{ gridTemplateColumns: `repeat(${timing.eventCounts.length}, minmax(3px, 1fr))` }}>
            {timing.eventCounts.map((count, index) => {
                const start = index * timing.binSizeMeters;
                const end = Math.min(timing.courseDistanceMeters, start + timing.binSizeMeters);
                const outcomePairs = timing.firstActivationPairs[index] ?? 0;
                const outcomeTime = timing.firstActivationTimeGainSeconds[index];
                const outcomeWin = timing.firstActivationWinDelta[index];
                const detail = [`${start}–${end}m`, `${number(count)} activation${count === 1 ? '' : 's'}`];
                if (outcomePairs) {
                    detail.push(`${number(outcomePairs)} first activations`);
                    if (outcomeTime !== null) detail.push(`descriptive time gain ${signed(outcomeTime, 3)}s`);
                    if (outcomeWin !== null) detail.push(`descriptive win change ${signed(outcomeWin * 100, 2)} pp`);
                }
                return <span key={index} className={phaseStarts.has(index) ? 'sim-skill-activation-phase' : undefined}
                    style={{ backgroundColor: `rgba(157, 140, 255, ${count ? 0.18 + 0.82 * Math.sqrt(count / maximum) : 0.06})` }} title={detail.join(' · ')} />;
            })}
        </div>
        <div className="sim-skill-activation-axis" style={{ gridTemplateColumns: `repeat(${timing.eventCounts.length}, minmax(3px, 1fr))` }}>
            <span style={{ gridColumn: 1 }}>0m</span>
            <span style={{ gridColumn: Math.round(timing.eventCounts.length / 6) + 1 }}>Middle</span>
            <span style={{ gridColumn: Math.round(timing.eventCounts.length * 2 / 3) + 1 }}>Late</span>
            <span style={{ gridColumn: Math.round(timing.eventCounts.length * 5 / 6) + 1 }}>Spurt</span>
            <span className="sim-skill-activation-axis-end" style={{ gridColumn: timing.eventCounts.length }}>{timing.courseDistanceMeters}m</span>
        </div>
        <small>Density includes actual simulator activations. Per-bin outcome figures on hover are descriptive, not separately randomized timing effects.</small>
    </div>;
}

export default function SkillPerformance({ snapshot }: { snapshot: Snapshot }) {
    const result = useSimData<SkillEffects>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(snapshot.snapshotId)}/skill-effects?study=cm19-skill-effect-3m-v1`),
        snapshot.snapshotId,
        `${DATA_ROOT}/${snapshot.snapshotId}/skill-effects.json.gz?study=cm19-skill-effect-3m-v1`,
    );
    const [search, setSearch] = useState('');
    const [estimand, setEstimand] = useState<'remove' | 'add'>('remove');
    const [evidence, setEvidence] = useState<'all' | 'confirmed'>('confirmed');
    const [style, setStyle] = useState<'all' | Style>('all');
    const [character, setCharacter] = useState<number | null>(null);
    const [characterMode, setCharacterMode] = useState<CharacterMode>('only');
    const [metric, setMetric] = useState<MetricKey>('individualWinDelta');
    const [expanded, setExpanded] = useState<string | null>(null);
    const rows = useMemo(() => {
        if (!result.data) return [];
        const needle = search.trim().toLocaleLowerCase();
        return result.data.cells.filter(cell => estimate(cell, style, character, characterMode)
            && (!needle || cell.skillName.toLocaleLowerCase().includes(needle) || String(cell.skillId).includes(needle))
            && cell.estimand === estimand
            && (evidence === 'all' || Boolean(estimates(cell, style, character, characterMode)?.confirmation)))
            .sort((a, b) => Number(Boolean(estimates(b, style, character, characterMode)?.confirmation)) - Number(Boolean(estimates(a, style, character, characterMode)?.confirmation))
                || estimate(b, style, character, characterMode)!.metrics[metric].mean - estimate(a, style, character, characterMode)!.metrics[metric].mean
                || a.skillName.localeCompare(b.skillName));
    }, [result.data, search, estimand, evidence, metric, style, character, characterMode]);
    const characters = useMemo(() => result.data
        ? Array.from(new Set(result.data.cells.flatMap(cell => Object.keys(breakdown(cell, style)?.byCharacter ?? {}).map(Number))))
            .sort((a, b) => (UMDatabaseWrapper.charas[a]?.name ?? String(a)).localeCompare(UMDatabaseWrapper.charas[b]?.name ?? String(b)))
        : [], [result.data, style]);
    useEffect(() => {
        if (character !== null && !characters.includes(character)) setCharacter(null);
    }, [character, characters]);
    if (!result.data) return <Loading error={result.error} retry={result.retry} />;
    const data = result.data;
    return <div className="sim-sections sim-skill-performance">
        <SkillDecisionPilot />
        <details className="sim-skill-legacy">
            <summary>Existing-build sensitivity diagnostics</summary>
        <div className="sim-skill-study-summary">
            <div><strong>{number(data.simulatorExecutions)}</strong><span>simulations</span></div>
            <div><strong>{number(data.candidateSkills)}</strong><span>skills screened</span></div>
            <div><strong>{number(data.confirmedCells)}</strong><span>held-out estimates</span></div>
        </div>
        <div className="sim-skill-study-note">
            <strong>Existing-build sensitivity—not an intrinsic skill ranking.</strong> “Break if removed” asks how much a build that already learned and planned around a skill deteriorates when it is removed. “Gain if added” asks what happens when the skill is appended to a compatible existing build without rebuilding its package. Positive values mean the skill helped in that specific comparison. <strong>Confirmed</strong> rows use held-out owners and seeds; exploratory rows are screening leads.
            <br /><strong>Population.</strong> {data.method.population}.
        </div>
        <Panel title="Existing-build sensitivity" controls={<div className="sim-controls sim-skill-controls">
            <label>Search <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Skill name or ID" /></label>
            <label>Question <select value={estimand} onChange={event => setEstimand(event.target.value as typeof estimand)}>
                <option value="remove">Break if removed</option><option value="add">Gain if added</option>
            </select></label>
            <label>Style <select value={style} onChange={event => setStyle(event.target.value === 'all' ? 'all' : Number(event.target.value) as Style)}>
                <option value="all">All styles</option>{([5, 1, 2, 3, 4] as Style[]).map(value => <option key={value} value={value}>{STRATEGY_NAMES[value]}</option>)}
            </select></label>
            <label>Uma <select value={character ?? 'all'} onChange={event => setCharacter(event.target.value === 'all' ? null : Number(event.target.value))}>
                <option value="all">All Umas</option>{characters.map(charaId => <option key={charaId} value={charaId}>{UMDatabaseWrapper.charas[charaId]?.name ?? `Uma ${charaId}`}</option>)}
            </select></label>
            {character !== null && <label>Uma cohort <select value={characterMode} onChange={event => setCharacterMode(event.target.value as CharacterMode)}>
                <option value="only">Only this Uma</option><option value="excluding">All except this Uma</option>
            </select></label>}
            <label>Evidence <select value={evidence} onChange={event => setEvidence(event.target.value as typeof evidence)}>
                <option value="all">All</option><option value="confirmed">Confirmed only</option>
            </select></label>
            <label>Sort <select value={metric} onChange={event => setMetric(event.target.value as MetricKey)}>{Object.entries(METRICS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>}>
            <div className="sim-table-scroll"><table className="sim-table sim-skill-effect-table"><thead><tr>
                <th>Skill</th><th>Evidence</th><th>Activation</th><th>Individual win</th><th>Team win</th><th>Time gain</th><th>Pairs</th>
            </tr></thead><tbody>{rows.map(cell => {
                const current = estimate(cell, style, character, characterMode)!; const group = estimates(cell, style, character, characterMode)!; const confirmed = Boolean(group.confirmation);
                const key = `${cell.skillId}-${cell.estimand}`; const icon = skillIcon(cell.skillId);
                return <tr key={key} className={expanded === key ? 'sim-selected-row' : ''}>
                    <td><button type="button" className="sim-skill-row-button" onClick={() => setExpanded(value => value === key ? null : key)} aria-expanded={expanded === key}>
                        {icon && <img src={icon} alt="" loading="lazy" />}<span><strong>{cell.skillName}</strong><small>{cell.skillId}</small></span><i aria-hidden="true">{expanded === key ? '▾' : '▸'}</i>
                    </button>{expanded === key && <div className="sim-skill-row-detail">
                        <span><strong>95% intervals:</strong> individual {range('individualWinDelta', current.metrics.individualWinDelta)}; team {range('teamWinDelta', current.metrics.teamWinDelta)}; time {range('finishTimeGainSeconds', current.metrics.finishTimeGainSeconds)}.</span>
                        <span>{cell.condition || 'No extra activation condition recorded.'}</span>
                        <span>{number(current.owners)} owners · {number(current.builds)} builds · {current.support.characters} Umas · styles {current.support.styles.join(', ')} · {percent(current.unchangedRaceRate)} identical race outcomes</span>
                        {cell.dependencyRestricted && <span>Removal-only because this skill depends on activation-count or another skill.</span>}
                        <ActivationHeatmap estimate={estimate(cell, style, null, characterMode) ?? current} />
                        {character !== null && <small>Activation timing is aggregated for the selected running style across all Umas; Uma filters apply to the outcome estimates above.</small>}
                    </div>}</td>
                    <td><span className={`sim-skill-status sim-skill-status-${confirmed ? 'confirmed' : 'exploratory'}`}>{confirmed ? 'Confirmed' : 'Exploratory'}</span></td>
                    <td title={`${number(cell.observedActivations)} observed activations across ${number(cell.observedActivationOwners)} owners`}>{percent(current.activationRate)}</td>
                    <td><Effect metric="individualWinDelta" result={current.metrics.individualWinDelta} /></td>
                    <td><Effect metric="teamWinDelta" result={current.metrics.teamWinDelta} /></td>
                    <td><Effect metric="finishTimeGainSeconds" result={current.metrics.finishTimeGainSeconds} /></td>
                    <td>{number(current.pairs)}</td>
                </tr>;
            })}</tbody></table></div>
            {!rows.length && <p className="sim-empty">No skill estimates match these filters.</p>}
        </Panel>
        </details>
    </div>;
}
