import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-bootstrap';
import AssetLoader from '../../data/AssetLoader';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import type { BuildAptitudeField, BuildDetailFilter, BuildNumberField, LobbyEditorCatalog } from './types';

const numberFields: { field: BuildNumberField; label: string; icon: string }[] = [
    { field: 'speed', label: 'Speed', icon: 'speed' }, { field: 'stamina', label: 'Stamina', icon: 'stamina' },
    { field: 'power', label: 'Power', icon: 'power' }, { field: 'guts', label: 'Guts', icon: 'guts' },
    { field: 'wit', label: 'Wit', icon: 'wit' },
];
const aptitudeFields: { field: BuildAptitudeField; label: string }[] = [
    { field: 'surface', label: 'Surface aptitude' },
    { field: 'distance', label: 'Distance aptitude' },
    { field: 'style', label: 'Style aptitude' },
];
const grades = [8, 7, 6, 5, 4, 3, 2, 1];
const gradeLabel = (value: number) => 'GFEDCBAS'[value - 1] ?? '?';
type AptitudeMode = Extract<BuildDetailFilter, { kind: 'aptitude' }>['mode'];
const defaultAptitudeModes = (): Record<BuildAptitudeField, AptitudeMode> => ({ surface: 'atLeast', distance: 'atLeast', style: 'atLeast' });

type EntityOption = { id: number; name: string; icon?: string };

function EntityPicker({ label, options, onPick }: { label: string; options: EntityOption[]; onPick: (id: number) => void }) {
    const [query, setQuery] = useState('');
    const normalized = query.trim().toLowerCase();
    const matches = useMemo(() => options.filter(option => !normalized || `${option.name} ${option.id}`.toLowerCase().includes(normalized)).slice(0, 12), [normalized, options]);
    return <div className="sim-detail-entity-picker">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label.toLowerCase()}`} />
        {query && <div className="sim-detail-entity-results">{matches.map(option => <button type="button" key={option.id} onClick={() => { onPick(option.id); setQuery(''); }}>
            {option.icon && <img src={option.icon} alt="" loading="lazy" />}<span>{option.name}</span><small>{option.id}</small>
        </button>)}{!matches.length && <span>No matches</span>}</div>}
    </div>;
}

function entityName(filter: Extract<BuildDetailFilter, { kind: 'skill' | 'support' }>) {
    return filter.kind === 'skill'
        ? UMDatabaseWrapper.skillNameWithEnglishFallback(filter.id)
        : UMDatabaseWrapper.supportCards[filter.id]?.name ?? `Support card ${filter.id}`;
}

export default function PerformerFilterDetails({ show, slot, value, catalog, onClose, onSave }: {
    show: boolean; slot: number; value: BuildDetailFilter[]; catalog?: LobbyEditorCatalog;
    onClose: () => void; onSave: (value: BuildDetailFilter[]) => void;
}) {
    const [draft, setDraft] = useState<BuildDetailFilter[]>(value);
    const [aptitudeModes, setAptitudeModes] = useState<Record<BuildAptitudeField, AptitudeMode>>(defaultAptitudeModes);
    useEffect(() => {
        if (!show) return;
        setDraft(value);
        const modes = defaultAptitudeModes();
        for (const filter of value) if (filter.kind === 'aptitude') modes[filter.field] = filter.mode;
        setAptitudeModes(modes);
    }, [show, value]);
    const skillOptions = useMemo(() => (catalog?.skills ?? Object.keys(UMDatabaseWrapper.skills).map(Number))
        .filter(id => id < 100000 || id >= 200000)
        .map(id => ({
        id, name: UMDatabaseWrapper.skillNameWithEnglishFallback(id),
        icon: AssetLoader.getSkillIcon(UMDatabaseWrapper.skills[id >= 900000 && id < 1000000 ? id - 800000 : id]?.iconId ?? 0),
    })).sort((a, b) => a.name.localeCompare(b.name)), [catalog]);
    const supportOptions = useMemo(() => (catalog?.supportCards ?? Object.keys(UMDatabaseWrapper.supportCards).map(Number)).map(id => ({
        id, name: UMDatabaseWrapper.supportCards[id]?.name ?? `Support card ${id}`, icon: AssetLoader.getSupportCardIcon(id),
    })).sort((a, b) => a.name.localeCompare(b.name)), [catalog]);
    const numberFilter = (field: BuildNumberField) => draft.find((filter): filter is Extract<BuildDetailFilter, { kind: 'number' }> => filter.kind === 'number' && filter.field === field);
    const aptitudeFilter = (field: BuildAptitudeField) => draft.find((filter): filter is Extract<BuildDetailFilter, { kind: 'aptitude' }> => filter.kind === 'aptitude' && filter.field === field);
    const replace = (predicate: (filter: BuildDetailFilter) => boolean, next?: BuildDetailFilter) => setDraft(current => [...current.filter(filter => !predicate(filter)), ...(next ? [next] : [])]);
    const setNumber = (field: BuildNumberField, key: 'min' | 'max', raw: string) => {
        const current = numberFilter(field); const parsed = raw === '' ? undefined : Math.max(0, Math.trunc(Number(raw)));
        const next = { kind: 'number' as const, field, min: current?.min, max: current?.max, [key]: Number.isFinite(parsed) ? parsed : undefined };
        replace(filter => filter.kind === 'number' && filter.field === field, next.min === undefined && next.max === undefined ? undefined : next);
    };
    const addEntity = (kind: 'skill' | 'support', id: number) => {
        if (draft.some(filter => filter.kind === kind && filter.id === id)) return;
        setDraft(current => [...current, { kind, id }]);
    };
    const entities = draft.filter((filter): filter is Extract<BuildDetailFilter, { kind: 'skill' | 'support' }> => filter.kind === 'skill' || filter.kind === 'support');
    return <Modal show={show} onHide={onClose} size="lg" centered className="sim-team-modal sim-filter-details-modal" aria-labelledby="sim-filter-details-title">
        <Modal.Header closeButton closeVariant="white"><Modal.Title id="sim-filter-details-title">Team slot {slot} details</Modal.Title></Modal.Header>
        <Modal.Body>
            <section className="sim-detail-section"><h3>Stats</h3><div className="sim-detail-stat-grid">{numberFields.map(({ field, label, icon }) => {
                const filter = numberFilter(field);
                return <label key={field}><span><img src={AssetLoader.getStatIcon(icon)} alt="" />{label}</span><input type="number" min="0" placeholder="Min" aria-label={`${label} minimum`} value={filter?.min ?? ''} onChange={event => setNumber(field, 'min', event.target.value)} /><input type="number" min="0" placeholder="Max" aria-label={`${label} maximum`} value={filter?.max ?? ''} onChange={event => setNumber(field, 'max', event.target.value)} /></label>;
            })}</div></section>
            <section className="sim-detail-section"><h3>Aptitudes</h3><div className="sim-detail-aptitude-grid">{aptitudeFields.map(({ field, label }) => {
                const filter = aptitudeFilter(field);
                return <div key={field}><span>{label}</span><select aria-label={`${label} comparison`} value={aptitudeModes[field]} onChange={event => {
                    const mode = event.target.value as AptitudeMode;
                    setAptitudeModes(current => ({ ...current, [field]: mode }));
                    if (filter) replace(item => item.kind === 'aptitude' && item.field === field, { ...filter, mode });
                }}>
                    <option value="atLeast">At least</option><option value="exact">Exactly</option><option value="not">Not</option><option value="atMost">At most</option>
                </select><select aria-label={`${label} grade`} value={filter?.grade ?? ''} onChange={event => replace(item => item.kind === 'aptitude' && item.field === field, event.target.value ? { kind: 'aptitude', field, mode: aptitudeModes[field], grade: Number(event.target.value) } : undefined)}>
                    <option value="">Any</option>{grades.map(grade => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
                </select></div>;
            })}</div></section>
            <section className="sim-detail-section"><h3>Skills and support cards</h3><div className="sim-detail-picker-grid"><div><strong>Learned skill</strong><EntityPicker label="Skill" options={skillOptions} onPick={id => addEntity('skill', id)} /></div><div><strong>Support card</strong><EntityPicker label="Support card" options={supportOptions} onPick={id => addEntity('support', id)} /></div></div>
                {entities.length > 0 && <div className="sim-detail-entity-list">{entities.map(filter => <div key={`${filter.kind}-${filter.id}`}>
                    <img src={filter.kind === 'skill' ? AssetLoader.getSkillIcon(UMDatabaseWrapper.skills[filter.id >= 900000 && filter.id < 1000000 ? filter.id - 800000 : filter.id]?.iconId ?? 0) : AssetLoader.getSupportCardIcon(filter.id)} alt="" />
                    <span>{entityName(filter)}</span>
                    <select value={filter.exclude ? 'not' : 'has'} onChange={event => replace(item => item.kind === filter.kind && item.id === filter.id, { ...filter, exclude: event.target.value === 'not' })}><option value="has">Has</option><option value="not">Doesn’t have</option></select>
                    {filter.kind === 'support' && <select value={filter.lb ?? ''} onChange={event => replace(item => item.kind === 'support' && item.id === filter.id, { ...filter, lb: event.target.value === '' ? undefined : Number(event.target.value) })}><option value="">Any LB</option><option value="0">0LB</option><option value="1">1LB</option><option value="2">2LB</option><option value="3">3LB</option><option value="4">MLB</option></select>}
                    <button type="button" aria-label={`Remove ${entityName(filter)}`} onClick={() => replace(item => item.kind === filter.kind && item.id === filter.id)}>×</button>
                </div>)}</div>}
            </section>
        </Modal.Body>
        <Modal.Footer><button type="button" className="sim-filter-details-clear" disabled={!draft.length} onClick={() => { setDraft([]); setAptitudeModes(defaultAptitudeModes()); }}>Clear details</button><button type="button" className="sim-filter-details-cancel" onClick={onClose}>Cancel</button><button type="button" className="sim-filter-details-save" onClick={() => { onSave(draft); onClose(); }}>Apply filters</button></Modal.Footer>
    </Modal>;
}
