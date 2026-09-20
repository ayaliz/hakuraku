import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Nav, Tab } from 'react-bootstrap';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { Loading, number, StrategyPaletteProvider } from './components';
import { queryText } from './query';
import Strategy from './Strategy';
import type { LobbyDraft } from './lobby';
import type { Performer, Requirement, Snapshot, Summary } from './types';
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
    const [lobbyTeams, setLobbyTeams] = useState<Performer[]>([]);
    const [lobbyDraft, setLobbyDraft] = useState<LobbyDraft>({ mood: '5', seed: '', gates: {}, runnerEdits: {} });
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
    const removeLobbyTeam = (teamId: string) => {
        setLobbyTeams(previous => previous.filter(team => team.id !== teamId));
        setLobbyDraft(previous => ({
            ...previous,
            gates: Object.fromEntries(Object.entries(previous.gates).filter(([key]) => !key.startsWith(`${teamId}:`))),
            runnerEdits: Object.fromEntries(Object.entries(previous.runnerEdits).filter(([key]) => !key.startsWith(`${teamId}:`))),
        }));
    };
    const clearLobby = () => {
        setLobbyTeams([]);
        setLobbyDraft(previous => ({ ...previous, gates: {}, runnerEdits: {} }));
    };
    const toggleLobbyTeam = (team: Performer) => {
        if (lobbyTeams.some(selected => selected.id === team.id)) removeLobbyTeam(team.id);
        else if (lobbyTeams.length < 3) setLobbyTeams(previous => [...previous, team]);
    };
    return <>
        <Tab.Container id="simdata-tabs" activeKey={active} onSelect={selectTab} mountOnEnter unmountOnExit>
            <Nav variant="tabs" className="sim-section-nav" aria-label="Simulation analysis">{Object.entries(tabs).map(([key, label]) => <Nav.Item key={key}><Nav.Link className="sim-section-link" eventKey={key}>{key === 'lobby' && lobbyTeams.length ? `${label} (${lobbyTeams.length}/3)` : label}</Nav.Link></Nav.Item>)}</Nav>
            <Tab.Content><Tab.Pane eventKey="introduction"><div className="sim-intro-tab">
                <p><strong>SimData</strong> uses captured CM teams to build a simulated CM race dataset with equally weighted player appearances. Every day at 8 am UTC, a job automatically starts building today's dataset of 10 million races featuring teams captured so far (the job may take 1–3 hours to run). The new dataset replaces the previous day's once the run finishes and its results have been verified.</p>
                <p>Since the per-player simulation budget is equal, we use a team dropout policy to focus that budget on the strongest ideas from players trying lots of teams.</p>
                <p>This data will replace the UmaLogs page. Additional analysis features are in the works.</p>
                <p>Read <Link to="/notes/new-age-umamusume-data">“A new age for Umamusume data”</Link> for further information. The simulator used to build the data has reproduced the server's results without floating-point discrepancies in all approximately 500,000 validation races we've collected since the 1.5 anniversary balance patch.</p>
            </div></Tab.Pane>
                <Tab.Pane eventKey="strategy"><Strategy data={data} onTeams={onTeams} /></Tab.Pane>
                <Tab.Pane eventKey="character"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><Character data={data} selectedKey={view.pair} onPair={onPair} onTeams={onTeams} /></Suspense></Tab.Pane>
                {snapshot.skillAnalysis && <Tab.Pane eventKey="skills"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><CapturedSkillPreview snapshot={snapshot} /></Suspense></Tab.Pane>}
                <Tab.Pane eventKey="archetypes"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><Performers data={data} query={view.query} distinct={view.distinct} sort={view.sort} teamId={sharedTeam?.teamId ?? null} lobbyTeamIds={new Set(lobbyTeams.map(team => team.id))} onToggleLobby={toggleLobbyTeam} onOpenLobby={() => selectTab('lobby')} onChange={change} /></Suspense></Tab.Pane>
                <Tab.Pane eventKey="lobby"><Suspense fallback={<Loading retry={() => window.location.reload()} />}><LobbyBuilder data={data} teams={lobbyTeams} draft={lobbyDraft} onDraftChange={setLobbyDraft} onBrowse={() => selectTab('archetypes')} onRemove={removeLobbyTeam} onClear={clearLobby} /></Suspense></Tab.Pane>
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
        <div className="sim-page-summary">{snapshot ? <><strong>{snapshot.cmId.toUpperCase()}</strong>{' | '}{collectionLabel}{' | '}{number(snapshot.meta.evaluatedTeams)} teams</> : <strong>SimData</strong>}</div>
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
