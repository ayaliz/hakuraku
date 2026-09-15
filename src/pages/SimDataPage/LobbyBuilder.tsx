import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Spinner } from 'react-bootstrap';
import RaceWinRateResults from '../../components/RaceWinRateResults';
import {
    isActiveRaceWinRateBatch,
    type RaceWinRateBatch,
    type RaceWinRateRunner,
} from '../../data/RaceWinRateSimulation';
import { simDataApiUrl, useSimData } from './data';
import { number, Panel, percent, Portrait, StyleLabel } from './components';
import LobbyRunnerEditor from './LobbyRunnerEditor';
import {
    createLobbyRunnerEdit,
    isLobbyRunnerEditChanged,
    stageLobbyRace,
    toLobbyRunnerOverride,
    type LobbyDraft,
    type LobbyEditorCatalog,
    type LobbyMood,
    type LobbyRunnerEdit,
    type SimDataLobbyRace,
} from './lobby';
import type { Performer, Summary } from './types';

type Props = {
    data: Summary;
    teams: Performer[];
    onBrowse: () => void;
    onRemove: (teamId: string) => void;
    onClear: () => void;
    draft: LobbyDraft;
    onDraftChange: Dispatch<SetStateAction<LobbyDraft>>;
};

const moodOptions: [LobbyMood, string][] = [
    ['random', 'Random per Uma'],
    ['random-no-awful', 'Random (no Awful)'],
    ['1', 'Awful'],
    ['2', 'Bad'],
    ['3', 'Normal'],
    ['4', 'Good'],
    ['5', 'Great'],
];

const liveTeamId = /^[a-f0-9]{64}$/;

export default function LobbyBuilder({ data, teams, onBrowse, onRemove, onClear, draft, onDraftChange }: Props) {
    const { mood, seed, gates, runnerEdits } = draft;
    const [status, setStatus] = useState<'idle' | 'running'>('idle');
    const [error, setError] = useState('');
    const [batch, setBatch] = useState<RaceWinRateBatch | undefined>(undefined);
    const [batchSubmitting, setBatchSubmitting] = useState(false);
    const [batchError, setBatchError] = useState('');
    const activeBatchRef = useRef<{
        jobId: string;
        accessToken: string;
        heartbeat: string;
        cancel: string;
    } | null>(null);
    const batchPollControllerRef = useRef<AbortController | null>(null);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const editorCatalog = useSimData<LobbyEditorCatalog>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/editor-catalog`),
        data.snapshotId,
    );
    const runners = useMemo(() => teams.flatMap((team, teamIndex) => team.members.map((runner, memberIndex) => ({
        key: `${team.id}:${memberIndex}`,
        team,
        teamIndex,
        memberIndex,
        runner,
        card: data.cards[runner.card],
    }))), [teams, data.cards]);
    const assignedGates = new Set(runners.map(({ key }) => gates[key]).filter((value): value is number => value !== undefined && value !== null));
    const invalidTeam = teams.some(team => !liveTeamId.test(team.id));
    const parsedSeed = seed.trim() === '' ? undefined : Number(seed);
    const invalidSeed = parsedSeed !== undefined && (!Number.isInteger(parsedSeed) || parsedSeed < -2147483648 || parsedSeed > 2147483647);
    const ready = teams.length === 3 && !invalidTeam && !invalidSeed && status !== 'running';
    const batchActive = isActiveRaceWinRateBatch(batch);
    const batchReady = ready && !batchSubmitting && !batchActive;
    const assignedCount = runners.filter(({ key }) => gates[key] !== undefined && gates[key] !== null).length;
    const modifiedCount = runners.filter(({ key, runner }) => runnerEdits[key] && isLobbyRunnerEditChanged(runner, runnerEdits[key])).length;
    const editingRunner = editingKey ? runners.find(runner => runner.key === editingKey) : undefined;

    const abandonBatch = () => {
        const active = activeBatchRef.current;
        activeBatchRef.current = null;
        batchPollControllerRef.current?.abort();
        batchPollControllerRef.current = null;
        if (!active) return;
        const body = JSON.stringify({ accessToken: active.accessToken });
        const url = simDataApiUrl(active.cancel);
        if (typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
        } else {
            void fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body,
                keepalive: true,
            });
        }
    };

    const dismissBatchResults = () => {
        abandonBatch();
        setBatch(undefined);
        setBatchSubmitting(false);
        setBatchError('');
    };

    useEffect(() => {
        const handlePageHide = () => abandonBatch();
        window.addEventListener('pagehide', handlePageHide);
        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            abandonBatch();
        };
    }, []);

    const lobbyRequest = () => {
        const runnerOverrides = runners.map(({ key }) => runnerEdits[key] ? toLobbyRunnerOverride(runnerEdits[key]) : null);
        return {
            teamIds: teams.map(team => team.id),
            mood,
            gates: runners.map(({ key }) => gates[key] ?? null),
            ...(runnerOverrides.some(Boolean) ? { runnerOverrides } : {}),
            ...(parsedSeed === undefined ? {} : { seed: parsedSeed }),
        };
    };

    const readBatchResponse = async (response: Response): Promise<RaceWinRateBatch> => {
        const payload = await response.json().catch(() => ({})) as Partial<RaceWinRateBatch> & { error?: string };
        if (!response.ok) throw new Error(payload.error || `Batch simulation failed (HTTP ${response.status}).`);
        if (typeof payload.jobId !== 'string' || typeof payload.status !== 'string'
            || !payload.links || typeof payload.links.heartbeat !== 'string'
            || typeof payload.links.cancel !== 'string') {
            throw new Error('The simulator returned an incomplete batch response.');
        }
        return payload as RaceWinRateBatch;
    };

    const pollBatch = async (active: NonNullable<typeof activeBatchRef.current>) => {
        let consecutiveErrors = 0;
        while (activeBatchRef.current?.jobId === active.jobId) {
            await new Promise(resolve => window.setTimeout(resolve, 750));
            if (activeBatchRef.current?.jobId !== active.jobId) return;
            const controller = new AbortController();
            batchPollControllerRef.current = controller;
            try {
                const response = await fetch(simDataApiUrl(active.heartbeat), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken: active.accessToken }),
                    signal: controller.signal,
                });
                const next = await readBatchResponse(response);
                consecutiveErrors = 0;
                setBatch(next);
                if (!isActiveRaceWinRateBatch(next)) {
                    activeBatchRef.current = null;
                    batchPollControllerRef.current = null;
                    if (next.status === 'failed') setBatchError(next.error || 'Batch simulation failed.');
                    return;
                }
            } catch (reason) {
                if (controller.signal.aborted || activeBatchRef.current?.jobId !== active.jobId) return;
                consecutiveErrors += 1;
                if (consecutiveErrors < 4) continue;
                abandonBatch();
                setBatchError(reason instanceof Error ? reason.message : 'Lost contact with the batch queue.');
                return;
            }
        }
    };

    const chooseGate = (key: string, value: string) => {
        onDraftChange(previous => ({ ...previous, gates: { ...previous.gates, [key]: value ? Number(value) : null } }));
    };

    const saveRunnerEdit = (key: string, runner: Performer['members'][number], edit: LobbyRunnerEdit) => {
        onDraftChange(previous => {
            const next = { ...previous.runnerEdits };
            if (isLobbyRunnerEditChanged(runner, edit)) next[key] = edit;
            else delete next[key];
            return { ...previous, runnerEdits: next };
        });
        setEditingKey(null);
    };

    const runRace = async () => {
        if (!ready) return;
        const raceTab = window.open('', '_blank');
        if (!raceTab) {
            setError('The race tab was blocked. Allow pop-ups for this site and try again.');
            return;
        }
        raceTab.document.title = 'Simulating race…';
        raceTab.document.body.textContent = 'Simulating race…';
        setStatus('running');
        setError('');
        try {
            const response = await fetch(simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/simulations`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lobbyRequest()),
            });
            const payload = await response.json().catch(() => ({})) as SimDataLobbyRace & { error?: string };
            if (!response.ok) throw new Error(payload.error || `Simulation failed (HTTP ${response.status}).`);
            payload.sourceRunnerMetadata = runners.map(({ key, runner }) => ({
                deck: runner.deck ?? [],
                parents: runner.parents ?? [],
                ...(runnerEdits[key] ? { modifiedInLobby: true } : {}),
            }));
            if (raceTab.closed) throw new Error('The race tab was closed before the simulation finished.');
            const token = stageLobbyRace(payload);
            raceTab.location.replace(`/racedata?sim=${encodeURIComponent(token)}`);
            setStatus('idle');
        } catch (reason) {
            raceTab.close();
            setError(reason instanceof Error ? reason.message : 'The lobby race could not be simulated.');
            setStatus('idle');
        }
    };

    const runBatch = async () => {
        if (!batchReady) return;
        setBatchSubmitting(true);
        setBatchError('');
        setBatch(undefined);
        try {
            const idempotencyKey = typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `simdata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const response = await fetch(simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/simulation-batches`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({ ...lobbyRequest(), raceCount: 100 }),
            });
            const next = await readBatchResponse(response);
            if (!next.accessToken) throw new Error('The simulator did not return a batch access token.');
            setBatch(next);
            if (isActiveRaceWinRateBatch(next)) {
                const active = {
                    jobId: next.jobId,
                    accessToken: next.accessToken,
                    heartbeat: next.links.heartbeat,
                    cancel: next.links.cancel,
                };
                activeBatchRef.current = active;
                void pollBatch(active);
            }
        } catch (reason) {
            setBatchError(reason instanceof Error ? reason.message : 'Batch simulation is temporarily unavailable.');
        } finally {
            setBatchSubmitting(false);
        }
    };

    const cancelBatch = async () => {
        const active = activeBatchRef.current;
        if (!active || batchSubmitting) return;
        setBatchSubmitting(true);
        setBatchError('');
        try {
            const response = await fetch(simDataApiUrl(active.cancel), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: active.accessToken }),
            });
            const next = await readBatchResponse(response);
            setBatch(next);
            if (!isActiveRaceWinRateBatch(next)) activeBatchRef.current = null;
        } catch (reason) {
            setBatchError(reason instanceof Error ? reason.message : 'Could not cancel the batch.');
        } finally {
            setBatchSubmitting(false);
        }
    };

    return <div className="sim-sections sim-lobby">
        <Panel title={`Teams · ${teams.length}/3`} controls={
            <div className="sim-lobby-panel-actions">
                <label>Mood
                    <select value={mood} onChange={event => onDraftChange(previous => ({ ...previous, mood: event.target.value as LobbyMood }))}>{moodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </label>
                <label>Seed
                    <input type="number" value={seed} onChange={event => onDraftChange(previous => ({ ...previous, seed: event.target.value }))} placeholder="Random" min={-2147483648} max={2147483647} />
                </label>
                <button type="button" className="sim-button" onClick={onBrowse}>Browse teams</button>
                {modifiedCount > 0 && <button type="button" className="sim-link" onClick={() => onDraftChange(previous => ({ ...previous, runnerEdits: {} }))}>Reset edits</button>}
                {teams.length > 0 && <button type="button" className="sim-link" onClick={onClear}>Clear</button>}
            </div>
        }>
            <div className="sim-lobby-team-grid">
                {[0, 1, 2].map(slot => {
                    const team = teams[slot];
                    return team ? <article className="sim-lobby-team" key={team.id}>
                        <header><span>Team {slot + 1}</span><button type="button" className="sim-link" onClick={() => onRemove(team.id)}>Remove</button></header>
                        <div className="sim-lobby-team-rate"><strong>{percent(team.wins / team.n)}</strong><span>{number(team.wins)} wins in {number(team.n)} races</span></div>
                        <ul>{team.members.map((runner, memberIndex) => {
                            const key = `${team.id}:${memberIndex}`;
                            const edit = runnerEdits[key];
                            const cardId = edit?.cardId ?? runner.card;
                            const card = data.cards[cardId] ?? data.cards[runner.card];
                            const runningStyle = edit?.runningStyle ?? runner.racingStyle;
                            const displayStyle = runner.style === 6 ? 6 : runningStyle;
                            const editable = Boolean(createLobbyRunnerEdit(runner) && editorCatalog.data);
                            return <li key={`${runner.id}-${memberIndex}`}><button type="button" className="sim-lobby-runner-edit" disabled={!editable} onClick={() => setEditingKey(key)} title={editable ? `Edit ${card.name}` : editorCatalog.error ? 'Build editor data is unavailable' : 'Loading build editor'}>
                                <Portrait card={cardId} name={card.name} /><span><strong>{card.name}</strong><StyleLabel style={displayStyle} racingStyle={runningStyle} short /></span>
                                {edit && <span className="sim-lobby-modified">Modified</span>}<span className="sim-lobby-edit-cue">Edit</span>
                            </button></li>;
                        })}</ul>
                    </article> : <button type="button" className="sim-lobby-empty-slot" key={slot} onClick={onBrowse}><span>Team {slot + 1}</span><strong>+ Select a team</strong></button>;
                })}
            </div>
            {invalidTeam && <p className="sim-query-error" role="alert">One of these teams came from the offline archive and cannot be simulated. Remove it and select the live result instead.</p>}
            {editorCatalog.error && <p className="sim-query-error" role="alert">Build editing is unavailable: {editorCatalog.error} <button type="button" className="sim-link" onClick={editorCatalog.retry}>Retry</button></p>}
        </Panel>

        <Panel title={`Gate assignments · ${assignedCount}/9 fixed`}>
            {runners.length ? <div className="sim-lobby-gates">{teams.map((team, teamIndex) => (
                <div className="sim-lobby-gate-team" key={team.id}>
                    {runners.filter(runner => runner.teamIndex === teamIndex).map(({ key, runner, card: originalCard }) => {
                        const selected = gates[key] ?? null;
                        const edit = runnerEdits[key];
                        const cardId = edit?.cardId ?? runner.card;
                        const card = data.cards[cardId] ?? originalCard;
                        const runningStyle = edit?.runningStyle ?? runner.racingStyle;
                        const displayStyle = runner.style === 6 ? 6 : runningStyle;
                        return <label key={key}>
                            <span className="sim-lobby-gate-runner"><span className="sim-lobby-team-number">{teamIndex + 1}</span><Portrait card={cardId} name={card.name} /><span><strong>{card.name}</strong><StyleLabel style={displayStyle} racingStyle={runningStyle} short />{edit && <small>Modified build</small>}</span></span>
                            <select value={selected ?? ''} onChange={event => chooseGate(key, event.target.value)} aria-label={`${card.name} gate`}>
                                <option value="">Random Gate</option>
                                {Array.from({ length: 9 }, (_, index) => index + 1).map(gate => <option key={gate} value={gate} disabled={gate !== selected && assignedGates.has(gate)}>Gate {gate}</option>)}
                            </select>
                        </label>;
                    })}
                </div>
            ))}</div> : <p className="sim-empty">Select teams from Archetype Analysis to configure their gates.</p>}
        </Panel>

        <div className="sim-lobby-run">
            <div><strong>{teams.length === 3 ? 'Lobby ready' : `${3 - teams.length} more team${teams.length === 2 ? '' : 's'} needed`}</strong>{modifiedCount > 0 && <span>{modifiedCount} runner{modifiedCount === 1 ? '' : 's'} modified.</span>}</div>
            <div className="sim-lobby-run-actions">
                <button type="button" className="sim-button sim-lobby-run-button" disabled={!ready} onClick={runRace}>{status === 'running' ? <><Spinner animation="border" size="sm" /> Simulating…</> : 'Run race'}</button>
                <button type="button" className="sim-button sim-lobby-batch-button" disabled={!batchReady} onClick={runBatch}>
                    {batchSubmitting && !batchActive
                        ? <><Spinner animation="border" size="sm" /> Starting…</>
                        : batchActive ? `Running ${batch?.completedRaces ?? 0}/100…` : batch?.status === 'completed' ? 'Run another 100' : 'Run 100 races'}
                </button>
                {batchActive && <button type="button" className="sim-button sim-lobby-cancel-button" disabled={batchSubmitting || batch?.status === 'cancel_requested'} onClick={cancelBatch}>
                    {batch?.status === 'cancel_requested' ? 'Cancelling…' : 'Cancel batch'}
                </button>}
            </div>
        </div>
        {invalidSeed && <p className="sim-query-error" role="alert">Seed must be a whole 32-bit number.</p>}
        {error && <p className="sim-query-error" role="alert">{error}</p>}
        {batchError && <p className="sim-query-error" role="alert">Win-rate estimate failed: {batchError}</p>}
        {batch && batch.status !== 'failed' && <RaceWinRateResults
            batch={batch}
            active={batchActive}
            onClose={dismissBatchResults}
            getRunnerLabel={(runner: RaceWinRateRunner) => {
                const card = data.cards[runner.cardId]
                    ?? data.cards[teams[runner.teamIndex]?.members[runner.memberIndex]?.card];
                return card?.name ?? `Gate ${runner.gateNumber}`;
            }}
        />}
        {editingRunner && editorCatalog.data && (() => {
            const initial = runnerEdits[editingRunner.key] ?? createLobbyRunnerEdit(editingRunner.runner);
            return initial ? <LobbyRunnerEditor key={editingRunner.key} data={data} initial={initial} catalog={editorCatalog.data}
                onSave={edit => saveRunnerEdit(editingRunner.key, editingRunner.runner, edit)} onClose={() => setEditingKey(null)} /> : null;
        })()}
    </div>;
}
