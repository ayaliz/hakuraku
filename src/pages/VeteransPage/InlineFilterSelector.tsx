import React, { useEffect, useRef, useState } from 'react';
import { FilterType, BaseFilter } from './types';

export type SelectorType = 'blues' | 'aptitude' | 'uniques' | 'races' | 'skills';

type InlineFilterSelectorProps = {
    show: boolean;
    onAddFilter: (filter: BaseFilter) => void;
    onClose: () => void;
    availableStats: string[];
    title: string;
    color: string;
    selectorType: SelectorType;
};

export default function InlineFilterSelector({ show, onAddFilter, onClose, availableStats, color, selectorType }: InlineFilterSelectorProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [type, setType] = useState<FilterType | null>(null);
    const [stat, setStat] = useState<string | null>(null);
    const [stars, setStars] = useState<number | null>(null);
    const [searchText, setSearchText] = useState('');

    const isSearchable = ['uniques', 'races', 'skills'].includes(selectorType);

    useEffect(() => {
        if (show) {
            setType(null);
            setStat(null);
            setStars(null);
            setSearchText('');
            if (isSearchable) {
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        }
    }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!show) return null;

    const canAddFilter = !!(type && stat && stars);

    const handleAddFilter = () => {
        if (type && stat && stars) {
            onAddFilter({ id: `${Date.now()}-${Math.random()}`, type, stat, stars });
            onClose();
        }
    };

    const setLegacyType = () => {
        setType('Legacy');
        if (stars && stars > 3) setStars(null);
    };

    const getButtonStyle = (isSelected: boolean, isDisabled: boolean, isApply: boolean): React.CSSProperties => ({
        width: '100%',
        height: '100%',
        display: 'block',
        boxSizing: 'border-box',
        padding: '8px 4px',
        border: '1px solid #555',
        backgroundColor: isSelected ? color : (isApply ? '#28a745' : (isDisabled ? '#333' : '#444')),
        color: isDisabled ? '#666' : '#fff',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: '0.9rem',
        textAlign: 'center',
        transition: 'background-color 0.15s ease',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    });

    const renderGridButton = (
        label: React.ReactNode,
        span: number,
        isSelected: boolean,
        onClick: () => void,
        isDisabled: boolean = false,
        isApply: boolean = false
    ) => {
        const style = getButtonStyle(isSelected, isDisabled, isApply);
        return (
            <div style={{ gridColumn: `span ${span}` }}>
                <button
                    onClick={isDisabled ? undefined : onClick}
                    disabled={isDisabled}
                    style={style}
                    onMouseEnter={(e) => { if (!isDisabled && !isSelected && !isApply) e.currentTarget.style.backgroundColor = '#555'; }}
                    onMouseLeave={(e) => { if (!isDisabled && !isSelected && !isApply) e.currentTarget.style.backgroundColor = '#444'; }}
                >
                    {label}
                </button>
            </div>
        );
    };

    const renderEqualRow = (items: { label: string; selected: boolean; onClick: () => void; disabled?: boolean; isApply?: boolean }[]) => (
        <div style={{ gridColumn: 'span 5', display: 'flex', width: '100%' }}>
            {items.map((item, index) => {
                const style = getButtonStyle(item.selected, !!item.disabled, !!item.isApply);
                return (
                    <button
                        key={index}
                        onClick={item.disabled ? undefined : item.onClick}
                        disabled={item.disabled}
                        style={{ ...style, flex: 1 }}
                        onMouseEnter={(e) => { if (!item.disabled && !item.selected && !item.isApply) e.currentTarget.style.backgroundColor = '#555'; }}
                        onMouseLeave={(e) => { if (!item.disabled && !item.selected && !item.isApply) e.currentTarget.style.backgroundColor = '#444'; }}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );

    const renderEqualStarRow = (start: number) => {
        const isLegacy = type === 'Legacy';
        const shouldDisable = (val: number) => isLegacy && val > 3;
        return renderEqualRow([
            { label: `${start}★`, selected: stars === start, onClick: () => setStars(start), disabled: shouldDisable(start) },
            { label: `${start + 1}★`, selected: stars === start + 1, onClick: () => setStars(start + 1), disabled: shouldDisable(start + 1) },
            { label: `${start + 2}★`, selected: stars === start + 2, onClick: () => setStars(start + 2), disabled: shouldDisable(start + 2) },
        ]);
    };

    const renderEqualControls = (canAdd: boolean) => renderEqualRow([
        { label: 'Legacy', selected: type === 'Legacy', onClick: setLegacyType },
        { label: 'Total', selected: type === 'Total', onClick: () => setType('Total') },
        { label: 'Apply', selected: false, onClick: handleAddFilter, disabled: !canAdd, isApply: true },
    ]);

    const renderSearchBar = () => (
        <div style={{ gridColumn: 'span 5' }}>
            <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                    width: '100%', height: '100%', boxSizing: 'border-box', padding: '8px',
                    border: '1px solid #555', backgroundColor: '#444', color: '#fff', fontSize: '0.9rem', outline: 'none',
                }}
            />
        </div>
    );

    const filteredStats = isSearchable
        ? availableStats.filter(s => s.toLowerCase().includes(searchText.toLowerCase()))
        : [];

    const renderStatList = () => {
        if (filteredStats.length === 0) {
            return <div style={{ gridColumn: 'span 5', padding: '10px', color: '#999', textAlign: 'center' }}>No matches found</div>;
        }
        return filteredStats.map(statKey => (
            <React.Fragment key={statKey}>
                {renderGridButton(statKey, 5, stat === statKey, () => setStat(statKey))}
            </React.Fragment>
        ));
    };

    const renderStatMatrix = () => {
        let statRows: string[][] = [];
        if (selectorType === 'aptitude') {
            statRows = [
                ['Sprint', 'Mile', 'Medium', 'Long', 'Turf'],
                ['Front Runner', 'Pace Chaser', 'Late Surger', 'End Closer', 'Dirt']
            ];
        } else {
            for (let i = 0; i < availableStats.length; i += 5) {
                statRows.push(availableStats.slice(i, i + 5));
            }
        }
        const labelMap: Record<string, string> = { 'Front Runner': 'Front', 'Pace Chaser': 'Pace', 'Late Surger': 'Late', 'End Closer': 'End' };
        return statRows.map((row, rIdx) => (
            <React.Fragment key={rIdx}>
                {row.map(statKey => {
                    const isDisabled = selectorType === 'aptitude' && !availableStats.includes(statKey);
                    return renderGridButton(labelMap[statKey] || statKey, 1, stat === statKey, () => setStat(statKey), isDisabled);
                })}
                {row.length < 5 && <div style={{ gridColumn: `span ${5 - row.length}` }} />}
            </React.Fragment>
        ));
    };

    return (
        <div style={{
            position: 'absolute', backgroundColor: '#2b2b2b', border: '1px solid #444',
            marginTop: '0.5rem', zIndex: 1000, boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            width: '400px', maxHeight: '400px', overflowY: 'auto',
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0'
        }}>
            {selectorType === 'uniques' && (
                <>
                    {renderEqualStarRow(1)}
                    {renderEqualControls(canAddFilter)}
                    {renderSearchBar()}
                    {renderStatList()}
                </>
            )}

            {(selectorType === 'races' || selectorType === 'skills') && (
                <>
                    {renderEqualStarRow(7)}
                    {renderEqualStarRow(4)}
                    {renderEqualStarRow(1)}
                    {renderEqualControls(canAddFilter)}
                    {renderSearchBar()}
                    {renderStatList()}
                </>
            )}

            {(selectorType === 'blues' || selectorType === 'aptitude') && (
                <>
                    {renderStatMatrix()}

                    {renderGridButton('7★', 1, stars === 7, () => setStars(7), type === 'Legacy')}
                    {renderGridButton('8★', 1, stars === 8, () => setStars(8), type === 'Legacy')}
                    {renderGridButton('9★', 1, stars === 9, () => setStars(9), type === 'Legacy')}
                    {renderGridButton('Legacy', 2, type === 'Legacy', setLegacyType)}

                    {renderGridButton('4★', 1, stars === 4, () => setStars(4), type === 'Legacy')}
                    {renderGridButton('5★', 1, stars === 5, () => setStars(5), type === 'Legacy')}
                    {renderGridButton('6★', 1, stars === 6, () => setStars(6), type === 'Legacy')}
                    {renderGridButton('Total', 2, type === 'Total', () => setType('Total'))}

                    {renderGridButton('1★', 1, stars === 1, () => setStars(1))}
                    {renderGridButton('2★', 1, stars === 2, () => setStars(2))}
                    {renderGridButton('3★', 1, stars === 3, () => setStars(3))}
                    {renderGridButton('Apply', 2, false, handleAddFilter, !canAddFilter, true)}
                </>
            )}
        </div>
    );
}
