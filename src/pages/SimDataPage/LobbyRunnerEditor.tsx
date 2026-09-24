import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dropdown, Modal } from 'react-bootstrap';
import AssetLoader from '../../data/AssetLoader';
import { getSkillIconUrl } from '../../data/skillIcons';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import { STRATEGY_NAMES } from '../MultiRacePage/components/WinDistributionCharts/constants';
import { Portrait } from './components';
import {
    changeLobbyRunnerIdentity,
    isBaseUniqueSkillId,
    lobbySkillFamilyId,
    LOBBY_APTITUDES,
    LOBBY_MAX_EDITABLE_SKILLS,
    LOBBY_RUNNING_STYLES,
    LOBBY_STAT_MAX,
    LOBBY_STAT_MIN,
    replaceLobbySkillFamily,
    type LobbyEditorCatalog,
    type LobbyRunnerEdit,
} from './lobby';
import type { Card, Summary } from './types';

type Props = {
    data: Summary;
    initial: LobbyRunnerEdit;
    catalog: LobbyEditorCatalog;
    createMode?: boolean;
    onSave: (value: LobbyRunnerEdit) => void;
    onClose: () => void;
};

const stats = [
    ['speed', 'Speed'],
    ['stamina', 'Stamina'],
    ['power', 'Power'],
    ['guts', 'Guts'],
    ['wit', 'Wit'],
] as const;

const aptitudeFields = [
    ['Surface', 1],
    ['Distance', 0],
    ['Strategy', 2],
] as const;

function cardCharacterName(cardId: number, card?: Card): string {
    return card?.name ?? UMDatabaseWrapper.charas[Math.floor(cardId / 100)]?.name ?? `Uma ${Math.floor(cardId / 100)}`;
}

function cardLabel(cardId: number, card?: Card): string {
    const character = cardCharacterName(cardId, card);
    const outfit = card?.outfit || UMDatabaseWrapper.cards[cardId]?.name;
    return outfit ? `${character} · ${outfit}` : `${character} · ${cardId}`;
}

function skillName(skillId: number): string {
    return UMDatabaseWrapper.skillNameWithEnglishFallback(skillId);
}

function SkillIcon({ skillId }: { skillId: number }) {
    const url = getSkillIconUrl(skillId);
    return url ? <img src={url} alt="" loading="lazy" /> : <span className="sim-lobby-skill-placeholder" aria-hidden="true">◇</span>;
}

export default function LobbyRunnerEditor({ data, initial, catalog, createMode = false, onSave, onClose }: Props) {
    const [edit, setEdit] = useState<LobbyRunnerEdit>(() => structuredClone(initial));
    const [umaOpen, setUmaOpen] = useState(false);
    const [umaSearch, setUmaSearch] = useState('');
    const [skillSearch, setSkillSearch] = useState('');
    const umaToggleRef = useRef<HTMLButtonElement>(null);
    const umaSearchRef = useRef<HTMLInputElement>(null);
    const umaMenuRef = useRef<HTMLDivElement>(null);
    const skillSearchRef = useRef<HTMLInputElement>(null);
    const skillResultsRef = useRef<HTMLDivElement>(null);
    const selectedIds = useMemo(() => new Set(edit.skills.map(([skillId]) => skillId)), [edit.skills]);
    const selectedFamilies = useMemo(() => new Set(edit.skills.map(([skillId]) => lobbySkillFamilyId(skillId))), [edit.skills]);
    const cards = useMemo(() => [...new Set([...catalog.cards, edit.cardId])]
        .filter(cardId => data.cards[cardId])
        .sort((a, b) => cardLabel(a, data.cards[a]).localeCompare(cardLabel(b, data.cards[b]))),
    [catalog.cards, data.cards, edit.cardId]);
    const filteredCards = useMemo(() => {
        const query = umaSearch.trim().toLocaleLowerCase();
        if (!query) return cards;
        return cards.filter(cardId => `${cardLabel(cardId, data.cards[cardId])} ${cardId}`.toLocaleLowerCase().includes(query));
    }, [cards, data.cards, umaSearch]);
    const availableSkills = useMemo(() => {
        const query = skillSearch.trim().toLocaleLowerCase();
        if (!query) return [];
        return catalog.skills.filter(skillId => !isBaseUniqueSkillId(skillId))
            .filter(skillId => !selectedIds.has(skillId))
            .filter(skillId => edit.skills.length < LOBBY_MAX_EDITABLE_SKILLS || selectedFamilies.has(lobbySkillFamilyId(skillId)))
            .map(skillId => ({ skillId, name: skillName(skillId) }))
            .filter(skill => skill.name.toLocaleLowerCase().includes(query) || String(skill.skillId).includes(query))
            .sort((a, b) => a.name.localeCompare(b.name) || a.skillId - b.skillId)
            .slice(0, 30);
    }, [catalog.skills, edit.skills.length, selectedFamilies, selectedIds, skillSearch]);
    const uniqueId = edit.uniqueSkillId;
    const selectedCard = data.cards[edit.cardId];
    const validStats = edit.stats.every(value => Number.isInteger(value) && value >= LOBBY_STAT_MIN && value <= LOBBY_STAT_MAX);

    const toggleUmaMenu = (show: boolean) => {
        setUmaOpen(show);
        if (show) requestAnimationFrame(() => umaSearchRef.current?.focus());
        else setUmaSearch('');
    };
    const handleUmaSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            umaMenuRef.current?.querySelector<HTMLButtonElement>('.dropdown-item')?.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setUmaOpen(false);
            setUmaSearch('');
            requestAnimationFrame(() => umaToggleRef.current?.focus());
        }
    };

    const setStat = (index: number, value: string) => {
        const next = [...edit.stats] as LobbyRunnerEdit['stats'];
        next[index] = Number(value);
        setEdit(previous => ({ ...previous, stats: next }));
    };
    const setAptitude = (index: number, value: LobbyRunnerEdit['aptitudes'][number]) => {
        const next = [...edit.aptitudes] as LobbyRunnerEdit['aptitudes'];
        next[index] = value;
        setEdit(previous => ({ ...previous, aptitudes: next }));
    };
    const addSkill = (skillId: number) => {
        if (selectedIds.has(skillId)) return;
        setEdit(previous => {
            const skills = replaceLobbySkillFamily(previous.skills, skillId);
            return skills.length <= LOBBY_MAX_EDITABLE_SKILLS ? { ...previous, skills } : previous;
        });
        setSkillSearch('');
        requestAnimationFrame(() => skillSearchRef.current?.focus());
    };
    const removeSkill = (skillId: number) => setEdit(previous => ({
        ...previous,
        skills: previous.skills.filter(([candidate]) => candidate !== skillId),
    }));
    const focusSkillResult = (index: number) => {
        const buttons = skillResultsRef.current?.querySelectorAll<HTMLButtonElement>('button');
        buttons?.[Math.max(0, Math.min(index, buttons.length - 1))]?.focus();
    };
    const handleSkillSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'ArrowDown' || availableSkills.length === 0) return;
        event.preventDefault();
        focusSkillResult(0);
    };
    const handleSkillResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusSkillResult(index + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (index === 0) skillSearchRef.current?.focus();
            else focusSkillResult(index - 1);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            skillSearchRef.current?.focus();
        }
    };

    return <Modal show onHide={onClose} size="xl" centered scrollable className="sim-runner-editor" aria-labelledby="sim-runner-editor-title">
        <Modal.Header closeButton closeVariant="white">
            <div className="sim-runner-editor-heading">
                <Portrait card={edit.cardId} name={selectedCard?.name ?? 'Selected Uma'} />
                <Modal.Title id="sim-runner-editor-title">{createMode ? 'Add custom Uma' : 'Edit race build'}</Modal.Title>
            </div>
        </Modal.Header>
        <Modal.Body>
            <div className="sim-runner-editor-layout">
                <section className="sim-runner-editor-section">
                    <label className="sim-runner-editor-field">Uma
                        <Dropdown className="sim-lobby-uma-select" show={umaOpen} onToggle={toggleUmaMenu}>
                            <Dropdown.Toggle ref={umaToggleRef} id="sim-lobby-uma-select" title={cardLabel(edit.cardId, selectedCard)}>
                                <Portrait card={edit.cardId} name="" />
                                <span>{cardCharacterName(edit.cardId, selectedCard)}</span>
                            </Dropdown.Toggle>
                            <Dropdown.Menu ref={umaMenuRef} aria-label="Uma">
                                <div className="sim-lobby-uma-search">
                                    <input
                                        ref={umaSearchRef}
                                        type="search"
                                        value={umaSearch}
                                        aria-label="Search Umas"
                                        placeholder="Search uma"
                                        onChange={event => setUmaSearch(event.target.value)}
                                        onKeyDown={handleUmaSearchKeyDown}
                                    />
                                </div>
                                {filteredCards.map(cardId => {
                                    const card = data.cards[cardId];
                                    const label = cardLabel(cardId, card);
                                    return <Dropdown.Item
                                        key={cardId}
                                        active={cardId === edit.cardId}
                                        aria-label={label}
                                        title={label}
                                        onClick={() => setEdit(previous => changeLobbyRunnerIdentity(previous, cardId))}
                                    >
                                        <Portrait card={cardId} name="" />
                                        <span>{cardCharacterName(cardId, card)}</span>
                                    </Dropdown.Item>;
                                })}
                                {filteredCards.length === 0 && <span className="sim-lobby-uma-empty" role="status">No matching Uma.</span>}
                            </Dropdown.Menu>
                        </Dropdown>
                    </label>
                    <div className="sim-lobby-unique-skill">
                        <SkillIcon skillId={uniqueId} />
                        <div><span>Unique skill</span><strong>{skillName(uniqueId)}</strong><small>ID {uniqueId}</small></div>
                        <label>Level<select value={edit.uniqueSkillLevel} onChange={event => setEdit(previous => ({ ...previous, uniqueSkillLevel: Number(event.target.value) }))}>
                            {Array.from({ length: 6 }, (_, index) => index + 1).map(level => <option key={level} value={level}>Lv. {level}</option>)}
                        </select></label>
                    </div>
                </section>

                <section className="sim-runner-editor-section">
                    <div className="sim-lobby-stat-editor">{stats.map(([icon, label], index) => <label key={icon}>
                        <span><img src={AssetLoader.getStatIcon(icon)} alt="" />{label}</span>
                        <input type="number" min={LOBBY_STAT_MIN} max={LOBBY_STAT_MAX} step={1} value={Number.isNaN(edit.stats[index]) ? '' : edit.stats[index]} onChange={event => setStat(index, event.target.value)} />
                    </label>)}</div>
                    {!validStats && <p className="sim-query-error" role="alert">Every stat must be a whole number from {LOBBY_STAT_MIN} to {LOBBY_STAT_MAX}.</p>}
                    <div className="sim-lobby-race-settings">
                        <div className="sim-lobby-aptitude-editor">{aptitudeFields.map(([label, aptitudeIndex]) => {
                            const currentRank = edit.aptitudes[aptitudeIndex];
                            return <div key={label} className="sim-lobby-aptitude-field">
                                <span>{label}</span>
                                <Dropdown className="sim-lobby-aptitude-select">
                                    <Dropdown.Toggle id={`sim-lobby-aptitude-${label.toLowerCase()}`} aria-label={`${label} aptitude: ${currentRank}`}>
                                        <img src={AssetLoader.getGradeIcon(currentRank)!} alt="" />
                                    </Dropdown.Toggle>
                                    <Dropdown.Menu aria-label={`${label} aptitude`}>
                                        {LOBBY_APTITUDES.map(rank => <Dropdown.Item
                                            key={rank}
                                            active={rank === currentRank}
                                            aria-label={`${label} aptitude ${rank}`}
                                            onClick={() => setAptitude(aptitudeIndex, rank)}
                                        >
                                            <img src={AssetLoader.getGradeIcon(rank)!} alt="" />
                                        </Dropdown.Item>)}
                                    </Dropdown.Menu>
                                </Dropdown>
                            </div>;
                        })}</div>
                        <label className="sim-lobby-running-style">Running style
                            <select value={edit.runningStyle} onChange={event => setEdit(previous => ({
                                ...previous,
                                runningStyle: Number(event.target.value) as LobbyRunnerEdit['runningStyle'],
                            }))}>
                                {LOBBY_RUNNING_STYLES.map(style => <option key={style} value={style}>{STRATEGY_NAMES[style]}</option>)}
                            </select>
                        </label>
                    </div>
                </section>

                <section className="sim-runner-editor-section sim-runner-editor-skills">
                    <header><h3>Learned skills · {edit.skills.length}/{LOBBY_MAX_EDITABLE_SKILLS}</h3></header>
                    <div className="sim-lobby-skill-search">
                        <label htmlFor="sim-lobby-skill-search">Add a skill</label>
                        <input ref={skillSearchRef} id="sim-lobby-skill-search" type="search" value={skillSearch} onChange={event => setSkillSearch(event.target.value)} onKeyDown={handleSkillSearchKeyDown} aria-controls="sim-lobby-skill-results" aria-expanded={Boolean(skillSearch.trim())} placeholder="Search by skill name or ID" />
                        {skillSearch.trim() && <div ref={skillResultsRef} id="sim-lobby-skill-results" className="sim-lobby-skill-results">{availableSkills.length ? availableSkills.map((skill, index) => <button key={skill.skillId} type="button" onKeyDown={event => handleSkillResultKeyDown(event, index)} onClick={() => addSkill(skill.skillId)}>
                            <SkillIcon skillId={skill.skillId} /><span><strong>{skill.name}</strong><small>{skill.skillId}</small></span><b aria-hidden="true">+</b>
                        </button>) : <span>No other matching skill in this dataset.</span>}</div>}
                    </div>
                    <div className="sim-lobby-selected-skills">{edit.skills.map(([skillId]) => <div key={skillId}>
                        <SkillIcon skillId={skillId} /><span><strong>{skillName(skillId)}</strong><small>ID {skillId}</small></span>
                        <button type="button" className="sim-link" onClick={() => removeSkill(skillId)} aria-label={`Remove ${skillName(skillId)}`}>Remove</button>
                    </div>)}</div>
                </section>
            </div>
        </Modal.Body>
        <Modal.Footer>
            <button type="button" className="sim-link" onClick={() => setEdit(structuredClone(initial))}>Reset this editor</button>
            <div><button type="button" className="sim-button sim-button-secondary" onClick={onClose}>Cancel</button><button type="button" className="sim-button" disabled={!validStats} onClick={() => onSave(edit)}>{createMode ? 'Add Uma' : 'Save changes'}</button></div>
        </Modal.Footer>
    </Modal>;
}
