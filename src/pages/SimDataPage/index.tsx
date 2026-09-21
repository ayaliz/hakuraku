import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Nav, Tab } from 'react-bootstrap';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { Loading, number, StrategyPaletteProvider } from './components';
import { queryText } from './query';
import Strategy from './Strategy';
import { createLobbyRunnerEdit, customLobbyRunnerKey, rearrangeLobbyRunners, type LobbyDraft, type LobbyRunnerPosition } from './lobby';
import type { Performer, Requirement, Runner, Snapshot, Summary } from './types';
import { COLORBLIND_STRATEGY_COLORS, STRATEGY_COLORS, STRATEGY_DISPLAY_ORDER, STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import StrategyPaletteControls, { useStrategyPalette } from '../../components/StrategyPaletteControls';
import { normalizeRaceConditionMetadata } from '../../data/RaceConditions';
import { decodeTeamLinkTarget } from './teamLinks';
import { newestSimDataSnapshots } from './snapshotOrder';
import '../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis.css';
import './SimDataPage.css';

const Character = lazy(() => import('./Character'));
const Performers = lazy(() => import('./Performers'));
const LobbyBuilder = lazy(() => import('./LobbyBuilder'));
const CapturedSkillPreview = lazy(() => import('./CapturedSkillPreview'));
const standardTabs = { introduction: 'Introduction', strategy: 'Strategy Analysis', character: 'Uma Analysis', archetypes: 'Archetype Analysis', lobby: 'Lobby Builder' };
function Results({ snapshot }: { snapshot: Snapshot }) {
    const tabs = snapshot.skillAnalysis
        ? { introduction: 'Introduction', strategy: 'Strategy Analysis', character: 'Uma Analysis', skills: 'Skill Analysis', archetypes: 'Archetype Analysis', lobby: 'Lobby Builder' }
        : standardTabs;
    const [params, setParams] = useSearchParams();
    const [lobbyTeams, setLobbyTeams] = useState<(Performer | null)[]>([null, null, null]);
    const [lobbyDraft, setLobbyDraft] = useState<LobbyDraft>({ mood: '5', seed: '', gates: {}, runnerEdits: {}, customRunners: {}, customRunnerSourceIds: {}, customRunnerStyles: {}, customRunnerScores: {}, customTeamOrigins: {} });
    const [view, setView] = useState({
        pair: null as string | null,
        query: '',
        distinct: false,
        sort: 'lower' as 'rate' | 'lower',
    });
    const result = useSimData<Summary>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(snapshot.snapshotId)}/summary`),
        snapshot.snapshotId,
        `${DATA_ROOT}/${snapshot.snapshotId}/summary.json`,
    );
    const requestedTab = params.get('tab') ?? 'introduction';
    const tab = requestedTab === 'performers' ? 'archetypes' : requestedTab;
    const sharedTeam = decodeTeamLinkTarget(params.get('team'), params.get('member'));
    const active = Object.prototype.hasOwnProperty.call(tabs, tab) ? tab : 'introduction';
    useEffect(() => {
        if (requestedTab !== 'performers') return;
        setParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('tab', 'archetypes');
            return next;
        }, { replace: true });
    }, [requestedTab, setParams]);
    const selectTab = (key: string | null) => {
        const next = key && Object.prototype.hasOwnProperty.call(tabs, key) ? key : 'introduction';
        if (next === active) return;
        setParams(next === 'introduction' ? {} : { tab: next });
    };
    const change = (values: Record<string, string | null>) => {
        setView(previous => ({
            ...previous,
            ...(Object.prototype.hasOwnProperty.call(values, 'q') ? { query: values.q ?? '' } : {}),
            ...(Object.prototype.hasOwnProperty.call(values, 'players') ? { distinct: values.players === 'unique' } : {}),
            ...(Object.prototype.hasOwnProperty.call(values, 'rank') ? { sort: values.rank === 'lower' ? 'lower' as const : 'rate' as const } : {}),
        }));
        if (Object.prototype.hasOwnProperty.call(values, 'team') || Object.prototype.hasOwnProperty.call(values, 'member')) {
            setParams(previous => {
                const next = new URLSearchParams(previous);
                if (Object.prototype.hasOwnProperty.call(values, 'team')) {
                    if (values.team) {
                        next.set('team', values.team);
                        next.set('tab', 'archetypes');
                    } else {
                        next.delete('team');
                        next.delete('member');
                    }
                }
                if (Object.prototype.hasOwnProperty.call(values, 'member')) {
                    if (values.member) next.set('member', values.member);
                    else next.delete('member');
                }
                return next;
            });
        }
    };
    if (!result.data) return <Loading error={result.error} retry={result.retry} />;
    const data = normalizeRaceConditionMetadata(result.data);
    const onPair = (key: string) => {
        setView(previous => ({ ...previous, pair: key }));
        selectTab('character');
    };
    const onTeams = (slots: Requirement[]) => {
        setView(previous => ({ ...previous, query: queryText(slots, data.cards) }));
        selectTab('archetypes');
    };
    const removeLobbyTeam = (slot: number) => {
        const teamId = lobbyTeams[slot]?.id;
        setLobbyTeams(previous => previous.map((team, index) => index === slot ? null : team));
        setLobbyDraft(previous => ({
            ...previous,
            gates: Object.fromEntries(Object.entries(previous.gates).filter(([key]) => !key.startsWith(`${teamId}:`) && !key.startsWith(`custom:${slot}:`))),
            runnerEdits: Object.fromEntries(Object.entries(previous.runnerEdits).filter(([key]) => !key.startsWith(`${teamId}:`))),
            customRunners: Object.fromEntries(Object.entries(previous.customRunners).filter(([key]) => !key.startsWith(`custom:${slot}:`))),
            customRunnerSourceIds: Object.fromEntries(Object.entries(previous.customRunnerSourceIds).filter(([key]) => !key.startsWith(`custom:${slot}:`))),
            customRunnerStyles: Object.fromEntries(Object.entries(previous.customRunnerStyles).filter(([key]) => !key.startsWith(`custom:${slot}:`))),
            customRunnerScores: Object.fromEntries(Object.entries(previous.customRunnerScores ?? {}).filter(([key]) => !key.startsWith(`custom:${slot}:`))),
            customTeamOrigins: Object.fromEntries(Object.entries(previous.customTeamOrigins).filter(([key]) => key !== String(slot))),
        }));
    };
    const clearLobby = () => {
        setLobbyTeams([null, null, null]);
        setLobbyDraft(previous => ({ ...previous, gates: {}, runnerEdits: {}, customRunners: {}, customRunnerSourceIds: {}, customRunnerStyles: {}, customRunnerScores: {}, customTeamOrigins: {} }));
    };
    const toggleLobbyTeam = (team: Performer) => {
        const existing = lobbyTeams.findIndex(selected => selected?.id === team.id);
        if (existing >= 0) removeLobbyTeam(existing);
        else {
            const openSlot = lobbyTeams.findIndex((selected, slot) => !selected
                && !Object.keys(lobbyDraft.customRunners).some(key => key.startsWith(`custom:${slot}:`)));
            if (openSlot >= 0) {
                setLobbyTeams(previous => previous.map((selected, slot) => slot === openSlot ? team : selected));
                setLobbyDraft(previous => {
                    const customTeamOrigins = { ...previous.customTeamOrigins };
                    delete customTeamOrigins[openSlot];
                    return { ...previous, customTeamOrigins };
                });
            }
        }
    };
    const selectedLobbyTeams = lobbyTeams.filter((team): team is Performer => team !== null);
    const addLobbyRunner = (runner: Runner) => {
        const edit = createLobbyRunnerEdit(runner);
        if (!edit) return;
        for (let slot = 0; slot < 3; slot++) {
            if (lobbyTeams[slot]) continue;
            for (let member = 0; member < 3; member++) {
                const key = customLobbyRunnerKey(slot, member);
                if (lobbyDraft.customRunners[key]) continue;
                setLobbyDraft(previous => ({
                    ...previous,
                    customRunners: { ...previous.customRunners, [key]: edit },
                    customRunnerSourceIds: { ...previous.customRunnerSourceIds, [key]: runner.id },
                    customRunnerStyles: { ...previous.customRunnerStyles, [key]: runner.style },
                    customRunnerScores: { ...(previous.customRunnerScores ?? {}), [key]: runner.score },
                }));
                return;
            }
        }
    };
    const rearrangeLobby = (from: LobbyRunnerPosition, to: LobbyRunnerPosition | null) => {
        const next = rearrangeLobbyRunners(lobbyTeams, lobbyDraft, from, to);
        if (!next) return;
        setLobbyTeams(next.teams);
        setLobbyDraft(next.draft);
    };
    const lobbyRunnerCount = selectedLobbyTeams.length * 3 + Object.keys(lobbyDraft.customRunners).length;
    const lobbyFull = lobbyTeams.every((team, slot) => Boolean(team)
        || [0, 1, 2].some(member => lobbyDraft.customRunners[`custom:${slot}:${member}`]));
    const lobbyRunnerFull = lobbyTeams.every((team, slot) => Boolean(team)
        || [0, 1, 2].every(member => lobbyDraft.customRunners[customLobbyRunnerKey(slot, member)]));
    const lobbyRunnerIds = new Set([
        ...selectedLobbyTeams.flatMap(team => team.members.map(runner => runner.id)),
        ...Object.values(lobbyDraft.customRunnerSourceIds),
    ]);
    return <>
        <Tab.Container id="simdata-tabs" activeKey={active} onSelect={selectTab} mountOnEnter unmountOnExit>
            <Nav variant="tabs" className="sim-section-nav" aria-label="Simulation analysis">{Object.entries(tabs).map(([key, label]) => <Nav.Item key={key}><Nav.Link className="sim-section-link" eventKey={key}>{key === 'lobby' && lobbyRunnerCount ? `${label} (${lobbyRunnerCount}/9)` : label}</Nav.Link></Nav.Item>)}</Nav>
            <Tab.Content><Tab.Pane eventKey="introduction"><div className="sim-intro-tab">
                <p><strong>UmaLogs</strong> uses captured CM teams to build a simulated CM race dataset with equally weighted player appearances. Every day at 8 am UTC, a job automatically starts building today's dataset of 10 million races featuring teams captured so far (the job may take 1–3 hours to run). The new dataset replaces the previous day's once the run finishes and its results have been verified.</p>
                <p>Since the per-player simulation budget is equal, we use a team dropout policy to focus that budget on the strongest ideas from players trying lots of teams.</p>
                <p>Read <Link to="/notes/new-age-umamusume-data">“A new age for Umamusume data”</Link> for further information. The simulator used to build the data has reproduced the server's results without floating-point discrepancies in all approximately 500,000 validation races we've collected since the 1.5 anniversary balance patch.</p>
            </div></Tab.Pane>
                <Tab.Pane eventKey="strategy"><Strategy data={data} onTeams={onTeams} /></Tab.Pane>
                <Tab.Pane eventKey="character"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><Character data={data} selectedKey={view.pair} onPair={onPair} onTeams={onTeams} /></Suspense></Tab.Pane>
                {snapshot.skillAnalysis && <Tab.Pane eventKey="skills"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><CapturedSkillPreview snapshot={snapshot} /></Suspense></Tab.Pane>}
                <Tab.Pane eventKey="archetypes"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><Performers data={data} query={view.query} distinct={view.distinct} sort={view.sort} teamId={sharedTeam?.teamId ?? null} lobbyTeamIds={new Set(selectedLobbyTeams.map(team => team.id))} lobbyFull={lobbyFull} lobbyRunnerIds={lobbyRunnerIds} lobbyRunnerFull={lobbyRunnerFull} onToggleLobby={toggleLobbyTeam} onAddLobbyRunner={addLobbyRunner} onOpenLobby={() => selectTab('lobby')} onChange={change} /></Suspense></Tab.Pane>
                <Tab.Pane eventKey="lobby"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><LobbyBuilder data={data} teams={lobbyTeams} draft={lobbyDraft} onDraftChange={setLobbyDraft} onBrowse={() => selectTab('archetypes')} onRemove={removeLobbyTeam} onRemoveRunner={position => rearrangeLobby(position, null)} onMoveRunner={rearrangeLobby} onClear={clearLobby} /></Suspense></Tab.Pane>
            </Tab.Content>
        </Tab.Container>
    </>;
}

export default function SimDataPage() {
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
    const { colorblindMode, setColorblindMode, strategyColors } = useStrategyPalette(STRATEGY_COLORS, COLORBLIND_STRATEGY_COLORS);
    const manifest = useSimData<{ schemaVersion: number; snapshots: Snapshot[] }>(
        simDataApiUrl('/api/simdata/manifest'), undefined, `${DATA_ROOT}/manifest.json`,
    );
    const snapshots = manifest.data?.schemaVersion === 1
        ? newestSimDataSnapshots(manifest.data.snapshots.map(normalizeRaceConditionMetadata))
        : [];
    const snapshot = snapshots.find(s => s.snapshotId === selectedSnapshotId) ?? snapshots[0];
    const collectionLabel = snapshot?.meta.capturedThrough
        ? `Teams seen by ${new Date(`${snapshot.meta.capturedThrough}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}`
        : `Teams seen ${snapshot?.meta.window ?? ''}`;
    return <main className="sim-page"><header className="sim-page-header-row">
        <div className="sim-page-summary">{snapshot ? <><strong>{snapshot.cmId === 'cm16-post' ? 'CM16' : snapshot.cmId.toUpperCase()}</strong>{' | '}{collectionLabel}{' | '}{number(snapshot.meta.evaluatedTeams)} teams</> : <strong>UmaLogs</strong>}</div>
        {snapshot && <div className="sim-dataset-selector"><label className="sim-dataset-label">Dataset:
            <select className="sim-dataset-select" value={snapshot.snapshotId} onChange={e => setSelectedSnapshotId(e.target.value)}>{snapshots.map(s => <option key={s.snapshotId} value={s.snapshotId}>{s.label.replace(/\s*[·|—-]?\s*10 million races\b/gi, '').trim()} - {s.meta.course.replace(/^CM\d+(?:-[^·]+)?\s*·\s*/i, '')}</option>)}</select>
        </label></div>}
        <StrategyPaletteControls colorblindMode={colorblindMode} onToggle={() => setColorblindMode(value => !value)} strategyColors={strategyColors} strategyOrder={STRATEGY_DISPLAY_ORDER} strategyNames={STRATEGY_NAMES} />
    </header>
        <StrategyPaletteProvider colors={strategyColors}>
            {!manifest.data ? <Loading error={manifest.error} retry={manifest.retry} /> : !snapshot ? <div className="sim-empty" role="alert">No simulation results have been published yet.</div> : <Results key={snapshot.snapshotId} snapshot={snapshot} />}
        </StrategyPaletteProvider>
    </main>;
}
