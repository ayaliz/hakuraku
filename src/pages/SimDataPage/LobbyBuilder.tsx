import { useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { Spinner } from 'react-bootstrap';
import RaceWinRateResults from '../../components/RaceWinRateResults';
import { computeSkillPoints } from '../../data/skillPoints';
import {
    isActiveRaceWinRateBatch,
    type RaceWinRateBatch,
    type RaceWinRateRace,
    type RaceWinRateRunner,
} from '../../data/RaceWinRateSimulation';
import { simDataApiUrl, useSimData } from './data';
import { number, Panel, percent, Portrait, StyleLabel } from './components';
import LobbyRunnerEditor from './LobbyRunnerEditor';
import {
    createBlankLobbyRunnerEdit,
    createLobbyRunnerEdit,
    customLobbyRunnerKey,
    isLobbyRunnerEditChanged,
    lobbySimulationTeamIds,
    stageLobbyRace,
    toLobbyRunnerOverride,
    type LobbyDraft,
    type LobbyEditorCatalog,
    type LobbyMood,
    type LobbyRunnerEdit,
    type LobbyRunnerPosition,
    type SimDataLobbyRace,
} from './lobby';
import type { Performer, Summary } from './types';

type Props = {
    data: Summary;
    teams: (Performer | null)[];
    onBrowse: () => void;
    onRemove: (slot: number) => void;
    onRemoveRunner: (position: LobbyRunnerPosition) => void;
    onMoveRunner: (from: LobbyRunnerPosition, to: LobbyRunnerPosition) => void;
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

type LobbySimulationRequest = {
    teamIds: (string | null)[];
    mood: LobbyMood;
    gates: (number | null)[];
    runnerOverrides?: (ReturnType<typeof toLobbyRunnerOverride> | null)[];
    seed?: number;
};

type BatchReplayContext = {
    request: LobbySimulationRequest;
    sourceRunnerMetadata: NonNullable<SimDataLobbyRace['sourceRunnerMetadata']>;
};

export default function LobbyBuilder({ data, teams, onBrowse, onRemove, onRemoveRunner, onMoveRunner, onClear, draft, onDraftChange }: Props) {
    const { mood, seed, gates, runnerEdits, customRunners, customRunnerSourceIds, customRunnerStyles, customRunnerScores = {} } = draft;
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
    const batchReplayContextRef = useRef<BatchReplayContext | null>(null);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [dragging, setDragging] = useState<LobbyRunnerPosition | null>(null);
    const [dragTarget, setDragTarget] = useState<LobbyRunnerPosition | null>(null);
    const editorCatalog = useSimData<LobbyEditorCatalog>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/editor-catalog`),
        data.snapshotId,
    );
    const runnerSlots = useMemo(() => teams.flatMap((team, teamIndex) => [0, 1, 2].map(memberIndex => {
        const customKey = customLobbyRunnerKey(teamIndex, memberIndex);
        const runner = team?.members[memberIndex];
        return {
            key: runner ? `${team.id}:${memberIndex}` : customKey,
            team,
            teamIndex,
            memberIndex,
            runner,
            custom: runner ? undefined : customRunners[customKey],
        };
    })), [teams, customRunners]);
    const runners = runnerSlots.filter(slot => slot.runner || slot.custom);
    const assignedGates = new Set(runners.map(({ key }) => gates[key]).filter((value): value is number => value !== undefined && value !== null));
    const invalidTeam = teams.some(team => team !== null && !liveTeamId.test(team.id));
    const parsedSeed = seed.trim() === '' ? undefined : Number(seed);
    const invalidSeed = parsedSeed !== undefined && (!Number.isInteger(parsedSeed) || parsedSeed < -2147483648 || parsedSeed > 2147483647);
    const ready = runners.length === 9 && !invalidTeam && !invalidSeed && status !== 'running';
    const batchActive = isActiveRaceWinRateBatch(batch);
    const batchReady = ready && !batchSubmitting && !batchActive;
    const filledCount = runners.length;
    const occupiedTeamCount = teams.filter(Boolean).length + teams.filter((team, teamIndex) => !team
        && [0, 1, 2].some(memberIndex => customRunners[customLobbyRunnerKey(teamIndex, memberIndex)])).length;
    const assignedCount = runners.filter(({ key }) => gates[key] !== undefined && gates[key] !== null).length;
    const capturedEditCount = runners.filter(({ key, runner }) => runner && runnerEdits[key] && isLobbyRunnerEditChanged(runner, runnerEdits[key])).length;
    const modifiedCount = capturedEditCount + Object.keys(customRunners).length;
    const editingRunner = editingKey ? runnerSlots.find(runner => runner.key === editingKey) : undefined;
    const displayedBatch = batch ? {
        ...batch,
        results: {
            ...batch.results,
            runners: batch.results.runners.map(runner => {
                const source = runnerSlots.find(candidate => candidate.teamIndex === runner.teamIndex
                    && candidate.memberIndex === runner.memberIndex);
                const edit = source?.custom ?? (source ? runnerEdits[source.key] : undefined);
                const cardId = edit?.cardId ?? source?.runner?.card;
                return cardId ? {
                    ...runner,
                    cardId,
                    charaId: Math.floor(cardId / 100),
                    ...(edit ? { rawStamina: edit.stats[1], runningStyle: edit.runningStyle - 1 } : {}),
                } : runner;
            }),
        },
    } : undefined;

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
        batchReplayContextRef.current = null;
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

    const lobbyRequest = (): LobbySimulationRequest => {
        const runnerOverrides = runnerSlots.map(({ key, custom }) => {
            const edit = custom ?? runnerEdits[key];
            return edit ? toLobbyRunnerOverride(edit) : null;
        });
        return {
            teamIds: lobbySimulationTeamIds(teams, draft),
            mood,
            gates: runnerSlots.map(({ key }) => gates[key] ?? null),
            ...(runnerOverrides.some(Boolean) ? { runnerOverrides } : {}),
            ...(parsedSeed === undefined ? {} : { seed: parsedSeed }),
        };
    };

    const sourceRunnerMetadata = (): NonNullable<SimDataLobbyRace['sourceRunnerMetadata']> => runnerSlots.map(({ key, runner, custom }) => ({
        deck: runner?.deck ?? [],
        parents: runner?.parents ?? [],
        ...((runnerEdits[key] || custom && !customRunnerSourceIds[key]) ? { modifiedInLobby: true } : {}),
    }));

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

    const saveRunnerEdit = (key: string, runner: Performer['members'][number] | undefined, edit: LobbyRunnerEdit) => {
        onDraftChange(previous => {
            if (!runner) return {
                ...previous,
                customRunners: { ...previous.customRunners, [key]: edit },
            };
            const next = { ...previous.runnerEdits };
            if (isLobbyRunnerEditChanged(runner, edit)) next[key] = edit;
            else delete next[key];
            return { ...previous, runnerEdits: next };
        });
        setEditingKey(null);
    };

    const samePosition = (left: LobbyRunnerPosition | null, right: LobbyRunnerPosition) => Boolean(left
        && left.teamIndex === right.teamIndex && left.memberIndex === right.memberIndex);
    const dropHandlers = (position: LobbyRunnerPosition) => ({
        onDragOver: (event: DragEvent<HTMLLIElement>) => {
            if (!dragging || samePosition(dragging, position)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragTarget(position);
        },
        onDragLeave: () => { if (samePosition(dragTarget, position)) setDragTarget(null); },
        onDrop: (event: DragEvent<HTMLLIElement>) => {
            event.preventDefault();
            if (dragging && !samePosition(dragging, position)) onMoveRunner(dragging, position);
            setDragging(null);
            setDragTarget(null);
        },
    });
    const dragHandlers = (position: LobbyRunnerPosition, enabled: boolean) => ({
        draggable: enabled,
        onDragStart: (event: DragEvent<HTMLLIElement>) => {
            if (!enabled) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', `${position.teamIndex}:${position.memberIndex}`);
            setDragging(position);
        },
        onDragEnd: () => { setDragging(null); setDragTarget(null); },
    });


    const openSimulatedRace = async (
        request: LobbySimulationRequest,
        metadata: NonNullable<SimDataLobbyRace['sourceRunnerMetadata']>,
        updatePrimaryStatus = false,
    ) => {
        const raceTab = window.open('', '_blank');
        if (!raceTab) {
            setError('The race tab was blocked. Allow pop-ups for this site and try again.');
            return;
        }
        raceTab.document.title = 'Simulating race…';
        raceTab.document.body.textContent = 'Simulating race…';
        if (updatePrimaryStatus) setStatus('running');
        setError('');
        try {
            const response = await fetch(simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/simulations`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });
            const payload = await response.json().catch(() => ({})) as SimDataLobbyRace & { error?: string };
            if (!response.ok) throw new Error(payload.error || `Simulation failed (HTTP ${response.status}).`);
            payload.sourceRunnerMetadata = metadata;
            if (raceTab.closed) throw new Error('The race tab was closed before the simulation finished.');
            const token = stageLobbyRace(payload);
            raceTab.location.replace(`/racedata?sim=${encodeURIComponent(token)}`);
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : 'The lobby race could not be simulated.';
            if (!raceTab.closed) {
                raceTab.document.title = 'Race simulation failed';
                raceTab.document.body.textContent = `Race simulation failed: ${message}`;
            }
            setError(message);
        } finally {
            if (updatePrimaryStatus) setStatus('idle');
        }
    };

    const runRace = () => {
        if (!ready) return;
        void openSimulatedRace(lobbyRequest(), sourceRunnerMetadata(), true);
    };

    const viewBatchRace = (race: RaceWinRateRace) => {
        if (!Number.isInteger(race.seed)) return;
        const context = batchReplayContextRef.current;
        if (!context) {
            setError('The lobby configuration for this batch is no longer available.');
            return;
        }
        void openSimulatedRace(
            { ...context.request, seed: race.seed },
            context.sourceRunnerMetadata,
        );
    };

    const runBatch = async () => {
        if (!batchReady) return;
        setBatchSubmitting(true);
        setBatchError('');
        setBatch(undefined);
        try {
            const request = lobbyRequest();
            batchReplayContextRef.current = {
                request,
                sourceRunnerMetadata: sourceRunnerMetadata(),
            };
            const idempotencyKey = typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `simdata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const response = await fetch(simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/simulation-batches`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({ ...request, raceCount: 100 }),
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
            batchReplayContextRef.current = null;
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
        <Panel title={`Lobby · ${filledCount}/9 Umas`} controls={
            <div className="sim-lobby-panel-actions">
                <label>Mood
                    <select value={mood} onChange={event => onDraftChange(previous => ({ ...previous, mood: event.target.value as LobbyMood }))}>{moodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </label>
                <label>Seed
                    <input type="number" value={seed} onChange={event => onDraftChange(previous => ({ ...previous, seed: event.target.value }))} placeholder="Random" min={-2147483648} max={2147483647} />
                </label>
                <button type="button" className="sim-button" onClick={onBrowse}>Browse teams</button>
                {capturedEditCount > 0 && <button type="button" className="sim-link" onClick={() => onDraftChange(previous => ({ ...previous, runnerEdits: {} }))}>Reset edits</button>}
                {filledCount > 0 && <button type="button" className="sim-link" onClick={onClear}>Clear</button>}
            </div>
        }>
            <p className="sim-lobby-arrange-hint">Drag an Uma onto another slot to move or swap it. Changing an imported team converts it to a custom team.</p>
            <div className="sim-lobby-team-grid">
                {[0, 1, 2].map(slot => {
                    const team = teams[slot];
                    const customMembers = [0, 1, 2].map(memberIndex => ({
                        memberIndex,
                        key: customLobbyRunnerKey(slot, memberIndex),
                        edit: customRunners[customLobbyRunnerKey(slot, memberIndex)],
                    }));
                    const hasCustomMembers = customMembers.some(({ edit }) => Boolean(edit));
                    return team ? <article className="sim-lobby-team" key={team.id}>
                        <header><span>Team {slot + 1}</span><button type="button" className="sim-link" onClick={() => onRemove(slot)}>Remove</button></header>
                        <div className="sim-lobby-team-rate"><strong>{percent(team.wins / team.n)}</strong><span>{number(team.wins)} wins in {number(team.n)} races</span></div>
                        <ul>{team.members.map((runner, memberIndex) => {
                            const key = `${team.id}:${memberIndex}`;
                            const edit = runnerEdits[key];
                            const cardId = edit?.cardId ?? runner.card;
                            const card = data.cards[cardId] ?? data.cards[runner.card];
                            const runningStyle = edit?.runningStyle ?? runner.racingStyle;
                            const displayStyle = runner.style === 6 ? 6 : runningStyle;
                            const movable = Boolean(createLobbyRunnerEdit(runner));
                            const editable = Boolean(movable && editorCatalog.data);
                            const position = { teamIndex: slot, memberIndex };
                            return <li key={`${runner.id}-${memberIndex}`} className={`sim-lobby-runner-slot${samePosition(dragging, position) ? ' is-dragging' : ''}${samePosition(dragTarget, position) ? ' is-drop-target' : ''}`} {...dragHandlers(position, movable)} {...dropHandlers(position)}><button type="button" className="sim-lobby-runner-edit" disabled={!editable} onClick={() => setEditingKey(key)} title={editable ? `Edit ${card.name}` : editorCatalog.error ? 'Build editor data is unavailable' : 'Loading build editor'}>
                                <span className="sim-lobby-drag-handle" aria-hidden="true">⋮⋮</span><Portrait card={cardId} name={card.name} /><span className="sim-lobby-runner-identity"><strong>{card.name}</strong><StyleLabel style={displayStyle} racingStyle={runningStyle} short /></span>
                                {edit && <span className="sim-lobby-modified">Modified</span>}<span className="sim-lobby-edit-cue">Edit</span>
                            </button><button type="button" className="sim-link sim-lobby-remove-uma" disabled={!movable} onClick={() => onRemoveRunner(position)} aria-label={`Remove ${card.name}`}>Remove</button></li>;
                        })}</ul>
                    </article> : <article className="sim-lobby-team sim-lobby-custom-team" key={slot}>
                        <header><span>Team {slot + 1}</span>{hasCustomMembers
                            ? <button type="button" className="sim-link" onClick={() => onRemove(slot)}>Remove</button>
                            : <button type="button" className="sim-link" onClick={onBrowse}>Select team</button>}
                        </header>
                        <div className={`sim-lobby-team-rate${hasCustomMembers ? ' sim-lobby-custom-team-label' : ' sim-lobby-team-rate-spacer'}`} aria-hidden={!hasCustomMembers}><strong>{hasCustomMembers ? 'Custom team' : '\u00a0'}</strong></div>
                        <ul>{customMembers.map(({ memberIndex, key, edit }) => {
                            const position = { teamIndex: slot, memberIndex };
                            const dropClass = samePosition(dragTarget, position) ? ' is-drop-target' : '';
                            if (!edit) return <li key={key} className={`sim-lobby-runner-slot sim-lobby-empty-runner-slot${dropClass}`} {...dropHandlers(position)}><button type="button" className="sim-lobby-add-uma" disabled={!editorCatalog.data} title={editorCatalog.data ? 'Add a custom Uma' : 'Loading editor…'} onClick={() => setEditingKey(key)}>
                                <span aria-hidden="true">+</span><strong>Add Uma</strong>
                            </button></li>;
                            const card = data.cards[edit.cardId];
                            return <li key={key} className={`sim-lobby-runner-slot sim-lobby-custom-runner${samePosition(dragging, position) ? ' is-dragging' : ''}${dropClass}`} {...dragHandlers(position, true)} {...dropHandlers(position)}><button type="button" className="sim-lobby-runner-edit" onClick={() => setEditingKey(key)}>
                                <span className="sim-lobby-drag-handle" aria-hidden="true">⋮⋮</span><Portrait card={edit.cardId} name={card?.name ?? 'Custom Uma'} /><span className="sim-lobby-runner-identity"><strong>{card?.name ?? `Uma ${edit.cardId}`}</strong><StyleLabel style={customRunnerStyles[key] ?? edit.runningStyle} racingStyle={edit.runningStyle} short /></span>
                                <span className="sim-lobby-modified">{customRunnerSourceIds[key] ? 'Imported' : 'Custom'}</span><span className="sim-lobby-edit-cue">Edit</span>
                            </button><button type="button" className="sim-link sim-lobby-remove-uma" onClick={() => onRemoveRunner(position)} aria-label={`Remove custom Uma ${memberIndex + 1}`}>Remove</button></li>;
                        })}</ul>
                    </article>;
                })}
            </div>
            {invalidTeam && <p className="sim-query-error" role="alert">One of these teams came from the offline archive and cannot be simulated. Remove it and select the live result instead.</p>}
            {editorCatalog.error && <p className="sim-query-error" role="alert">Build editing is unavailable: {editorCatalog.error} <button type="button" className="sim-link" onClick={editorCatalog.retry}>Retry</button></p>}
        </Panel>

        <Panel title={`Gate assignments · ${assignedCount}/9 fixed`}>
            {runners.length ? <div className="sim-lobby-gates">{[0, 1, 2].map(teamIndex => (
                <div className="sim-lobby-gate-team" key={teamIndex}>
                    {runners.filter(runner => runner.teamIndex === teamIndex).map(({ key, runner, custom }) => {
                        const selected = gates[key] ?? null;
                        const edit = custom ?? runnerEdits[key];
                        const cardId = edit?.cardId ?? runner!.card;
                        const card = data.cards[cardId] ?? data.cards[runner!.card];
                        const runningStyle = edit?.runningStyle ?? runner!.racingStyle;
                        const analyticalStyle = runner?.style ?? customRunnerStyles[key];
                        const displayStyle = analyticalStyle === 6 ? 6 : runningStyle;
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
            <div><strong>{filledCount === 9 ? 'Lobby ready' : `${9 - filledCount} more Uma${filledCount === 8 ? '' : 's'} needed`}</strong>{modifiedCount > 0 && <span>{modifiedCount} runner{modifiedCount === 1 ? '' : 's'} custom or modified across {occupiedTeamCount} team{occupiedTeamCount === 1 ? '' : 's'}.</span>}</div>
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
        {displayedBatch && displayedBatch.status !== 'failed' && <RaceWinRateResults
            batch={displayedBatch}
            active={batchActive}
            onClose={dismissBatchResults}
            onViewRace={viewBatchRace}
            getRunnerLabel={(runner: RaceWinRateRunner) => {
                const card = data.cards[runner.cardId]
                    ?? data.cards[teams[runner.teamIndex]?.members[runner.memberIndex]?.card ?? 0];
                return card?.name ?? `Gate ${runner.gateNumber}`;
            }}
            getRunnerBuild={(runner: RaceWinRateRunner) => {
                const source = runners.find(candidate => candidate.teamIndex === runner.teamIndex
                    && candidate.memberIndex === runner.memberIndex);
                if (!source) return undefined;
                const edit = source.custom ?? runnerEdits[source.key];
                if (!edit && (!source.runner?.stats || !source.runner.skills)) return undefined;
                const stats = edit?.stats ?? source.runner!.stats!;
                const skillIds = edit
                    ? [...edit.skills.map(([skillId]) => skillId), edit.uniqueSkillId]
                    : source.runner!.skills!.map(([skillId]) => skillId);
                return {
                    rankScore: source.runner?.score ?? customRunnerScores[source.key] ?? 0,
                    stats,
                    skillPoints: computeSkillPoints(new Set(skillIds)),
                    skillIds,
                    rawStamina: stats[1],
                    motivation: /^\d$/.test(mood) ? Number(mood) : undefined,
                    runningStyle: (edit?.runningStyle ?? source.runner!.racingStyle) - 1,
                };
            }}
        />}
        {editingRunner && editorCatalog.data && (() => {
            const firstCard = editorCatalog.data.cards.find(cardId => data.cards[cardId]);
            const initial = editingRunner.custom
                ?? runnerEdits[editingRunner.key]
                ?? (editingRunner.runner ? createLobbyRunnerEdit(editingRunner.runner) : firstCard ? createBlankLobbyRunnerEdit(firstCard) : null);
            return initial ? <LobbyRunnerEditor key={editingRunner.key} data={data} initial={initial} catalog={editorCatalog.data}
                createMode={!editingRunner.runner && !editingRunner.custom}
                onSave={edit => saveRunnerEdit(editingRunner.key, editingRunner.runner, edit)} onClose={() => setEditingKey(null)} /> : null;
        })()}
    </div>;
}
