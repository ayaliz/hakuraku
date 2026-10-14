import { useEffect, useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import AssetLoader from '../../data/AssetLoader';
import RunnerCardContent from './RunnerCardContent';
import { courseAptitudeLabels } from './components';
import { parseLobbyImport, type LobbyImport } from './lobbyImport';
import type { Build, Summary } from './types';

export default function LobbyImportDialog({ data, onAdd, onClose, availableSlots, hasEmptyTeam }: {
    data: Summary; onAdd: (runners: Build[], wholeTeam: boolean) => void; onClose: () => void;
    availableSlots: number; hasEmptyTeam: boolean;
}) {
    const [loaded, setLoaded] = useState<LobbyImport | null>(null);
    const [added, setAdded] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const uploadRevision = useRef(0);
    useEffect(() => () => { uploadRevision.current++; }, []);
    const cardFor = (runner: Build) => data.cards[runner.card] ?? {
        chara: runner.chara, name: UMDatabaseWrapper.charas[runner.chara]?.name ?? `Uma ${runner.card}`,
        outfit: UMDatabaseWrapper.cards[runner.card]?.name ?? '',
    };
    const aptitudeLabels = courseAptitudeLabels(data.meta);
    const aptitudeIcon = (grade: string) => {
        const icon = AssetLoader.getGradeIcon(grade);
        return icon ? <img src={icon} alt={grade} /> : <strong>{grade}</strong>;
    };
    const aptitudeSummary = (runner: Build) => <div className="sim-import-aptitudes">
        <span title="Distance aptitude">{aptitudeLabels.distance === 'Short' ? 'Sprint' : aptitudeLabels.distance} {aptitudeIcon(runner.aptitudes[0])}</span>
        <span title="Surface aptitude">{aptitudeLabels.surface} {aptitudeIcon(runner.aptitudes[1])}</span>
        <span title="Running style aptitude">Style {aptitudeIcon(runner.aptitudes[2])}</span>
        <span>{runner.skills.length} skills</span>
    </div>;
    const add = (runners: Build[], wholeTeam = false) => {
        try {
            onAdd(runners, wholeTeam);
            setAdded(previous => new Set([...previous, ...runners.map(runner => runner.id)]));
            setError('');
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add Umas.'); }
    };
    const runnerCard = (runner: Build) => <div key={runner.id} className="sim-performer-member sim-import-runner">
        <div className="sim-import-card-content"><RunnerCardContent runner={runner} card={cardFor(runner)} />{aptitudeSummary(runner)}</div>
        <button type="button" className={`sim-performer-add-builder${added.has(runner.id) ? ' is-added' : ''}`}
            aria-label={`${added.has(runner.id) ? 'Added' : 'Add'} ${cardFor(runner).name} to builder (${runner.trainedIds[0]})`}
            disabled={added.has(runner.id) || availableSlots === 0} onClick={() => add([runner])}>
            {added.has(runner.id) ? 'Added to builder' : availableSlots === 0 ? 'Builder full' : '+ Add to builder'}
        </button>
    </div>;
    const groupedIds = new Set(loaded?.teams.flatMap(team => team.runners.map(runner => runner.id)));
    const ungrouped = loaded?.runners.filter(runner => !groupedIds.has(runner.id)) ?? [];
    return <Modal show onHide={onClose} size="xl" scrollable className="sim-lobby-import">
        <Modal.Header closeButton><Modal.Title>Uma import</Modal.Title></Modal.Header>
        <Modal.Body>
            <p>Upload a veteran JSON or race JSON to add umas</p>
            <input type="file" accept=".json,application/json" aria-label="Veteran or race JSON" onChange={async event => {
                const file = event.target.files?.[0];
                if (!file) return;
                const revision = ++uploadRevision.current;
                setBusy(true); setError(''); setLoaded(null); setAdded(new Set());
                try {
                    if (file.size > 50 * 1024 * 1024) throw new Error('Please choose a JSON file smaller than 50 MB.');
                    const result = parseLobbyImport(JSON.parse(await file.text()), data.meta);
                    if (revision !== uploadRevision.current) return;
                    setLoaded(result);
                    if (result.autoAdd) {
                        onAdd(result.runners, false);
                        onClose();
                    }
                } catch (cause) { if (revision === uploadRevision.current) setError(cause instanceof Error ? cause.message : 'Could not read JSON.'); }
                finally { if (revision === uploadRevision.current) setBusy(false); }
            }} />
            {busy && <p role="status">Reading file…</p>}
            {error && <p role="alert" className="sim-error">{error}</p>}
            {loaded && <>
                {loaded.teams.length > 0 && <section className="sim-import-teams">{loaded.teams.map(team => <article key={team.id} className="sim-import-team">
                    <header><strong>{team.label}</strong><button type="button" className="sim-button"
                        disabled={!hasEmptyTeam || team.runners.some(runner => added.has(runner.id))}
                        onClick={() => add(team.runners, true)}>Add team</button></header>
                    <div className="sim-performer-team">{team.runners.map(runnerCard)}</div>
                </article>)}</section>}
                {ungrouped.length > 0 && <div className="sim-import-runners">{ungrouped.map(runnerCard)}</div>}
            </>}
        </Modal.Body>
        <Modal.Footer><span className="sim-import-capacity" role="status">{availableSlots} empty Uma slots</span><button type="button" className="sim-button sim-button-secondary" onClick={onClose}>Close</button></Modal.Footer>
    </Modal>;
}
