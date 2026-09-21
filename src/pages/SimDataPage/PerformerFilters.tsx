import { useEffect, useMemo, useRef, useState } from 'react';
import { getCharaIcon } from '../MultiRacePage/components/WinDistributionCharts/utils';
import { useStrategyColors } from './components';
import type { Card, Pair, Requirement, TeamMatcher } from './types';
import {
    buildPerformerFilterOptions,
    legacyFilterOption,
    matcherKey,
    matchersFromRequirement,
    requirementFromMatchers,
    type FilterOption,
} from './performerFilterModel';
import PerformerFilterDetails from './PerformerFilterDetails';
import type { BuildDetailFilter, LobbyEditorCatalog } from './types';

function OptionPortrait({ option, color, compact = false }: { option?: FilterOption; color: string; compact?: boolean }) {
    const icon = option?.cardId ? getCharaIcon(`${option.charaId}_${option.cardId}`) : null;
    return <span className={`sim-filter-option-portrait${compact ? ' is-compact' : ''}`} style={{ borderColor: color }}>
        {icon ? <img src={icon} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} /> : <span>Any</span>}
    </span>;
}

function CompactFilterRow({ label, context, tone, values, options, cards, emptyText, details = [], onEditDetails, onChange }: {
    label: string;
    context: string;
    tone: 'allow' | 'hide';
    values: TeamMatcher[];
    options: FilterOption[];
    cards: Record<number, Card>;
    emptyText: string;
    details?: BuildDetailFilter[];
    onEditDetails?: () => void;
    onChange: (values: TeamMatcher[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const colors = useStrategyColors();
    const byKey = useMemo(() => new Map(options.map(option => [option.key, option])), [options]);
    const selectedKeys = useMemo(() => new Set(values.map(value => matcherKey(value))), [values]);
    const normalizedSearch = search.trim().toLowerCase();
    const matches = options.filter(option => !normalizedSearch || option.search.includes(normalizedSearch));
    const visible = matches.slice(0, 160);

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
        const close = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    useEffect(() => { if (!open) setSearch(''); }, [open]);

    const toggle = (option: FilterOption) => {
        if (selectedKeys.has(option.key)) onChange(values.filter(value => matcherKey(value) !== option.key));
        else onChange([...values, option.matcher]);
    };

    return <div className={`sim-compact-filter-row is-${tone}${open ? ' is-open' : ''}${onEditDetails ? ' has-details-control' : ''}`} ref={ref} onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false);
    }}>
        {onEditDetails && <button type="button" className={`sim-filter-details-trigger${details.length ? ' is-active' : ''}`} onClick={onEditDetails}>Filter options{details.length ? <span>{details.length}</span> : null}</button>}
        <button type="button" className="sim-compact-filter-trigger" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
            <span className="sim-compact-filter-kind"><span aria-hidden="true">{tone === 'allow' ? '+' : '−'}</span><strong>{label}</strong><small>{context}</small></span>
            <span className={`sim-compact-filter-summary${values.length ? '' : ' is-empty'}`}>
                {values.length ? <>
                    {values.slice(0, 2).map((value, index) => {
                        const option = byKey.get(matcherKey(value) ?? '') ?? legacyFilterOption(value, cards);
                        const color = colors[value.style ?? 0] ?? '#718096';
                        return <span className="sim-filter-summary-token" key={`${matcherKey(value) ?? 'custom'}-${index}`} title={option ? `${option.name} · ${option.detail}` : 'Custom filter'}>
                            <OptionPortrait option={option} color={color} compact />
                            <span>{option ? `${option.name} · ${option.detail}` : 'Custom filter'}</span>
                        </span>;
                    })}
                    {values.length > 2 && <span className="sim-filter-more-count">+{values.length - 2}</span>}
                </> : emptyText}
            </span>
            <span className="sim-compact-filter-arrow" aria-hidden="true">⌄</span>
        </button>
        {open && <div className="sim-compact-filter-popover">
            <div className="sim-filter-picker-head">
                <input ref={inputRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Uma, outfit, or style…" aria-label={`Search ${label.toLowerCase()} options`} />
                {values.length > 0 && <button type="button" onClick={() => onChange([])}>Clear</button>}
            </div>
            <div className="sim-filter-picker-list" role="listbox" aria-multiselectable="true">
                {visible.map(option => {
                    const selected = selectedKeys.has(option.key);
                    const color = colors[option.style] ?? '#718096';
                    return <button type="button" role="option" aria-selected={selected} className={selected ? 'is-selected' : ''} key={option.key} onClick={() => toggle(option)}>
                        <OptionPortrait option={option} color={color} />
                        <span className="sim-filter-picker-option-text"><strong>{option.name}</strong><small style={{ color }}>{option.detail}</small></span>
                        <span className="sim-filter-picker-check" aria-hidden="true">{selected ? '✓' : '+'}</span>
                    </button>;
                })}
                {!matches.length && <span className="sim-filter-picker-empty">No matching filter options</span>}
                {matches.length > visible.length && <span className="sim-filter-picker-limit">Keep typing to narrow {matches.length.toLocaleString()} options</span>}
            </div>
        </div>}
    </div>;
}

export default function PerformerFilters({ slots, cards, pairs, catalog, onSlotsChange }: {
    slots: Requirement[];
    cards: Record<number, Card>;
    pairs: Pair[];
    catalog?: LobbyEditorCatalog;
    onSlotsChange: (slots: Requirement[]) => void;
}) {
    const [detailSlot, setDetailSlot] = useState<number | null>(null);
    const options = useMemo(() => buildPerformerFilterOptions(pairs), [pairs]);

    const included = slots.filter(slot => !slot.exclude).slice(0, 3);
    while (included.length < 3) included.push({});
    const allowed = included.map(slot => ({ values: matchersFromRequirement(slot), details: slot.details ?? [] }));
    const hidden = slots.filter(slot => slot.exclude).flatMap(matchersFromRequirement);
    const emit = (nextAllowed: { values: TeamMatcher[]; details: BuildDetailFilter[] }[], nextHidden: TeamMatcher[]) => onSlotsChange([
        ...nextAllowed.map(slot => requirementFromMatchers(slot.values, false, slot.details)),
        ...(nextHidden.length ? [requirementFromMatchers(nextHidden, true)] : []),
    ]);

    return <div className="sim-compact-filter-board">
        {allowed.map((slot, index) => <CompactFilterRow
            key={index}
            label="Allow"
            context={`Team slot ${index + 1}`}
            tone="allow"
            values={slot.values}
            details={slot.details}
            onEditDetails={() => setDetailSlot(index)}
            options={options}
            cards={cards}
            emptyText="Any member"
            onChange={next => emit(allowed.map((current, slotIndex) => slotIndex === index ? { ...current, values: next } : current), hidden)}
        />)}
        <CompactFilterRow
            label="Hide"
            context="Entire team"
            tone="hide"
            values={hidden}
            options={options}
            cards={cards}
            emptyText="Nothing hidden"
            onChange={next => emit(allowed, next)}
        />
        {detailSlot !== null && <PerformerFilterDetails show slot={detailSlot + 1} value={allowed[detailSlot].details} catalog={catalog} onClose={() => setDetailSlot(null)} onSave={details => emit(allowed.map((slot, index) => index === detailSlot ? { ...slot, details } : slot), hidden)} />}
    </div>;
}
