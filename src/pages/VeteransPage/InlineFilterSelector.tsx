import React, { useEffect, useRef, useState } from 'react';
import { FilterType, BaseFilter } from './types';

export type SelectorType = 'blues' | 'aptitude' | 'uniques' | 'races' | 'skills';

type DragTarget = 'stat' | 'star';
type DragMode = 'add' | 'remove';

type InlineFilterSelectorProps = {
    show: boolean;
    onAddFilter: (filter: BaseFilter) => void;
    onClose: () => void;
    availableStats: string[];
    title: string;
    color: string;
    selectorType: SelectorType;
};

const STAR_SYMBOL = '\u2605';

export default function InlineFilterSelector({ show, onAddFilter, onClose, availableStats, color, selectorType }: InlineFilterSelectorProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const dragStateRef = useRef<{ target: DragTarget; mode: DragMode; visited: Set<string> } | null>(null);
    const [type, setType] = useState<FilterType | null>(null);
    const [stat, setStat] = useState<string | null>(null);
    const [stars, setStars] = useState<number | null>(null);
    const [selectedStats, setSelectedStats] = useState<string[]>([]);
    const [selectedStars, setSelectedStars] = useState<number[]>([]);
    const [searchText, setSearchText] = useState('');

    const isSearchable = ['uniques', 'races', 'skills'].includes(selectorType);
    const isBlueOrAptitude = selectorType === 'blues' || selectorType === 'aptitude';
    const requiresTotal = isBlueOrAptitude && selectedStars.some(value => value > 3);
    const effectiveType = requiresTotal ? 'Total' : type;

    useEffect(() => {
        if (show) {
            dragStateRef.current = null;
            setType(null);
            setStat(null);
            setStars(null);
            setSelectedStats([]);
            setSelectedStars([]);
            setSearchText('');
            if (isSearchable) {
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        }
    }, [show, isSearchable]);

    useEffect(() => {
        const stopDragging = () => {
            dragStateRef.current = null;
        };

        window.addEventListener('pointerup', stopDragging);
        window.addEventListener('pointercancel', stopDragging);

        return () => {
            window.removeEventListener('pointerup', stopDragging);
            window.removeEventListener('pointercancel', stopDragging);
        };
    }, []);

    if (!show) return null;

    const canAddFilter = isBlueOrAptitude
        ? !!(effectiveType && selectedStats.length > 0 && selectedStars.length > 0)
        : !!(type && stat && stars);

    const normalizedStats = isBlueOrAptitude ? selectedStats : (stat ? [stat] : []);
    const normalizedStars = isBlueOrAptitude ? [...selectedStars].sort((a, b) => a - b) : (stars ? [stars] : []);

    const handleAddFilter = () => {
        if (!canAddFilter) return;

        if (isBlueOrAptitude) {
            onAddFilter({
                id: `${Date.now()}-${Math.random()}`,
                type: effectiveType!,
                stat: normalizedStats[0],
                stars: normalizedStars[0],
                stats: normalizedStats,
                starOptions: normalizedStars,
            });
            onClose();
            return;
        }

        if (type && stat && stars) {
            onAddFilter({ id: `${Date.now()}-${Math.random()}`, type, stat, stars });
            onClose();
        }
    };

    const setLegacyType = () => {
        setType('Legacy');
        if (stars && stars > 3) setStars(null);
        setSelectedStars(prev => prev.filter(value => value <= 3));
    };

    const toggleSelectedStat = (value: string) => {
        setSelectedStats(prev => (
            prev.includes(value)
                ? prev.filter(item => item !== value)
                : [...prev, value].sort((a, b) => availableStats.indexOf(a) - availableStats.indexOf(b))
        ));
    };

    const setSelectedStatState = (value: string, mode: DragMode) => {
        setSelectedStats(prev => {
            const alreadySelected = prev.includes(value);
            if (mode === 'add') {
                if (alreadySelected) return prev;
                return [...prev, value].sort((a, b) => availableStats.indexOf(a) - availableStats.indexOf(b));
            }
            if (!alreadySelected) return prev;
            return prev.filter(item => item !== value);
        });
    };

    const toggleSelectedStar = (value: number) => {
        if (value > 3) {
            setType('Total');
        }
        setSelectedStars(prev => {
            const next = prev.includes(value)
                ? prev.filter(item => item !== value)
                : [...prev, value];
            return next.sort((a, b) => a - b);
        });
    };

    const setSelectedStarState = (value: number, mode: DragMode) => {
        if (mode === 'add' && value > 3) {
            setType('Total');
        }

        setSelectedStars(prev => {
            const alreadySelected = prev.includes(value);
            if (mode === 'add') {
                if (alreadySelected) return prev;
                return [...prev, value].sort((a, b) => a - b);
            }
            if (!alreadySelected) return prev;
            return prev.filter(item => item !== value);
        });
    };

    const applyDragSelection = (target: DragTarget, value: string | number, mode: DragMode) => {
        if (target === 'stat') {
            setSelectedStatState(String(value), mode);
            return;
        }
        setSelectedStarState(Number(value), mode);
    };

    const beginDragSelection = (
        event: React.PointerEvent<HTMLButtonElement>,
        target: DragTarget,
        value: string | number,
        isSelected: boolean,
    ) => {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();

        const key = `${target}:${String(value)}`;
        const mode: DragMode = isSelected ? 'remove' : 'add';
        dragStateRef.current = { target, mode, visited: new Set([key]) };
        applyDragSelection(target, value, mode);
    };

    const continueDragSelection = (target: DragTarget, value: string | number) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.target !== target) {
            return;
        }

        const key = `${target}:${String(value)}`;
        if (dragState.visited.has(key)) {
            return;
        }

        dragState.visited.add(key);
        applyDragSelection(target, value, dragState.mode);
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
        isApply: boolean = false,
        dragConfig?: {
            target: DragTarget;
            value: string | number;
        }
    ) => {
        const style = getButtonStyle(isSelected, isDisabled, isApply);
        return (
            <div style={{ gridColumn: `span ${span}` }}>
                <button
                    onClick={isDisabled || dragConfig ? undefined : onClick}
                    disabled={isDisabled}
                    style={{ ...style, userSelect: dragConfig ? 'none' : undefined }}
                    onPointerDown={isDisabled || !dragConfig ? undefined : (event) => beginDragSelection(event, dragConfig.target, dragConfig.value, isSelected)}
                    onPointerEnter={isDisabled || !dragConfig ? undefined : () => continueDragSelection(dragConfig.target, dragConfig.value)}
                    onMouseEnter={(e) => { if (!isDisabled && !isSelected && !isApply) e.currentTarget.style.backgroundColor = '#555'; }}
                    onMouseLeave={(e) => { if (!isDisabled && !isSelected && !isApply) e.currentTarget.style.backgroundColor = '#444'; }}
                >
                    {label}
                </button>
            </div>
        );
    };

    const renderEqualRow = (items: { label: string; selected: boolean; onClick: () => void; disabled?: boolean; isApply?: boolean }[]) => (
        <div className="ifs-span-5-row">
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
            { label: `${start}${STAR_SYMBOL}`, selected: stars === start, onClick: () => setStars(start), disabled: shouldDisable(start) },
            { label: `${start + 1}${STAR_SYMBOL}`, selected: stars === start + 1, onClick: () => setStars(start + 1), disabled: shouldDisable(start + 1) },
            { label: `${start + 2}${STAR_SYMBOL}`, selected: stars === start + 2, onClick: () => setStars(start + 2), disabled: shouldDisable(start + 2) },
        ]);
    };

    const renderEqualControls = (canAdd: boolean) => renderEqualRow([
        { label: 'Legacy', selected: type === 'Legacy', onClick: setLegacyType },
        { label: 'Total', selected: type === 'Total', onClick: () => setType('Total') },
        { label: 'Apply', selected: false, onClick: handleAddFilter, disabled: !canAdd, isApply: true },
    ]);

    const renderSearchBar = () => (
        <div className="ifs-span-5">
            <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="ifs-search-input"
            />
        </div>
    );

    const filteredStats = isSearchable
        ? availableStats.filter(s => s.toLowerCase().includes(searchText.toLowerCase()))
        : [];

    const renderStatList = () => {
        if (filteredStats.length === 0) {
            return <div className="ifs-no-matches">No matches found</div>;
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
                    return renderGridButton(
                        labelMap[statKey] || statKey,
                        1,
                        selectedStats.includes(statKey),
                        () => toggleSelectedStat(statKey),
                        isDisabled,
                        false,
                        { target: 'stat', value: statKey }
                    );
                })}
                {row.length < 5 && <div style={{ gridColumn: `span ${5 - row.length}` }} />}
            </React.Fragment>
        ));
    };

    const renderBlueOrAptitudeStarButton = (value: number) => {
        return renderGridButton(
            `${value}${STAR_SYMBOL}`,
            1,
            selectedStars.includes(value),
            () => toggleSelectedStar(value),
            false,
            false,
            { target: 'star', value }
        );
    };

    return (
        <div className="ifs-dropdown">
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

            {isBlueOrAptitude && (
                <>
                    {renderStatMatrix()}

                    {renderBlueOrAptitudeStarButton(7)}
                    {renderBlueOrAptitudeStarButton(8)}
                    {renderBlueOrAptitudeStarButton(9)}
                    {renderGridButton('Legacy', 2, effectiveType === 'Legacy', setLegacyType)}

                    {renderBlueOrAptitudeStarButton(4)}
                    {renderBlueOrAptitudeStarButton(5)}
                    {renderBlueOrAptitudeStarButton(6)}
                    {renderGridButton('Total', 2, effectiveType === 'Total', () => setType('Total'))}

                    {renderBlueOrAptitudeStarButton(1)}
                    {renderBlueOrAptitudeStarButton(2)}
                    {renderBlueOrAptitudeStarButton(3)}
                    {renderGridButton('Apply', 2, false, handleAddFilter, !canAddFilter, true)}
                </>
            )}
        </div>
    );
}
