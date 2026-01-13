import React from 'react';
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

type InlineFilterSelectorState = {
    type: FilterType | null;
    stat: string | null;
    stars: number | null;
    searchText: string;
};

export default class InlineFilterSelector extends React.Component<InlineFilterSelectorProps, InlineFilterSelectorState> {
    private inputRef: React.RefObject<HTMLInputElement>;

    constructor(props: InlineFilterSelectorProps) {
        super(props);
        this.state = {
            type: null,
            stat: null,
            stars: null,
            searchText: '',
        };
        this.inputRef = React.createRef();
    }

    componentDidUpdate(prevProps: InlineFilterSelectorProps) {
        if (!prevProps.show && this.props.show) {
            this.setState({
                type: null,
                stat: null,
                stars: null,
                searchText: '',
            }, () => {
                if (this.isSearchable()) {
                    setTimeout(() => this.inputRef.current?.focus(), 50);
                }
            });
        }
    }

    isSearchable = () => ['uniques', 'races', 'skills'].includes(this.props.selectorType);

    handleAddFilter = () => {
        if (this.state.type && this.state.stat && this.state.stars) {
            this.props.onAddFilter({
                id: `${Date.now()}-${Math.random()}`,
                type: this.state.type,
                stat: this.state.stat,
                stars: this.state.stars,
            });
            this.props.onClose();
        }
    };

    setLegacyType = () => {
        this.setState(prevState => ({
            type: 'Legacy',
            stars: (prevState.stars && prevState.stars > 3) ? null : prevState.stars
        }));
    };

    getButtonStyle = (isSelected: boolean, isDisabled: boolean, isApply: boolean): React.CSSProperties => {
        const { color } = this.props;
        
        return {
            width: '100%',
            height: '100%',
            display: 'block',
            boxSizing: 'border-box',
            padding: '8px 4px',
            border: '1px solid #555',
            backgroundColor: isSelected
                ? color
                : (isApply ? '#28a745' : (isDisabled ? '#333' : '#444')),
            color: isDisabled ? '#666' : '#fff',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            textAlign: 'center',
            transition: 'background-color 0.15s ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        };
    };

    renderGridButton = (
        label: React.ReactNode, 
        span: number, 
        isSelected: boolean, 
        onClick: () => void, 
        isDisabled: boolean = false, 
        isApply: boolean = false
    ) => {
        const style = this.getButtonStyle(isSelected, isDisabled, isApply);
        return (
            <div style={{ gridColumn: `span ${span}` }}>
                <button
                    onClick={isDisabled ? undefined : onClick}
                    disabled={isDisabled}
                    style={style}
                    onMouseEnter={(e) => {
                        if (!isDisabled && !isSelected && !isApply) e.currentTarget.style.backgroundColor = '#555';
                    }}
                    onMouseLeave={(e) => {
                        if (!isDisabled && !isSelected && !isApply) e.currentTarget.style.backgroundColor = '#444';
                    }}
                >
                    {label}
                </button>
            </div>
        );
    };

    renderEqualRow = (items: { label: string; selected: boolean; onClick: () => void; disabled?: boolean; isApply?: boolean }[]) => {
        return (
            <div style={{ gridColumn: 'span 5', display: 'flex', width: '100%' }}>
                {items.map((item, index) => {
                    const style = this.getButtonStyle(item.selected, !!item.disabled, !!item.isApply);
                    return (
                        <button
                            key={index}
                            onClick={item.disabled ? undefined : item.onClick}
                            disabled={item.disabled}
                            style={{ ...style, flex: 1 }}
                            onMouseEnter={(e) => {
                                if (!item.disabled && !item.selected && !item.isApply) e.currentTarget.style.backgroundColor = '#555';
                            }}
                            onMouseLeave={(e) => {
                                if (!item.disabled && !item.selected && !item.isApply) e.currentTarget.style.backgroundColor = '#444';
                            }}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
        );
    };

    renderEqualStarRow = (start: number) => {
        const isLegacy = this.state.type === 'Legacy';
        const shouldDisable = (val: number) => isLegacy && val > 3;

        const items = [
            { label: `${start}★`, selected: this.state.stars === start, onClick: () => this.setState({ stars: start }), disabled: shouldDisable(start) },
            { label: `${start + 1}★`, selected: this.state.stars === start + 1, onClick: () => this.setState({ stars: start + 1 }), disabled: shouldDisable(start + 1) },
            { label: `${start + 2}★`, selected: this.state.stars === start + 2, onClick: () => this.setState({ stars: start + 2 }), disabled: shouldDisable(start + 2) }
        ];

        return this.renderEqualRow(items);
    };

    renderEqualControls = (canAdd: boolean) => {
        const items = [
            { 
                label: 'Legacy', 
                selected: this.state.type === 'Legacy', 
                onClick: this.setLegacyType
            },
            { 
                label: 'Total', 
                selected: this.state.type === 'Total', 
                onClick: () => this.setState({ type: 'Total' }) 
            },
            { 
                label: 'Apply', 
                selected: false, 
                onClick: this.handleAddFilter, 
                disabled: !canAdd, 
                isApply: true 
            }
        ];
        return this.renderEqualRow(items);
    };

    renderSearchBar = () => (
        <div style={{ gridColumn: 'span 5' }}>
            <input
                ref={this.inputRef}
                type="text"
                placeholder="Search..."
                value={this.state.searchText}
                onChange={(e) => this.setState({ searchText: e.target.value })}
                style={{
                    width: '100%', height: '100%', boxSizing: 'border-box', padding: '8px',
                    border: '1px solid #555', backgroundColor: '#444', color: '#fff', fontSize: '0.9rem', outline: 'none',
                }}
            />
        </div>
    );

    renderStatList = (filteredStats: string[]) => {
        if (filteredStats.length === 0) {
            return <div style={{ gridColumn: 'span 5', padding: '10px', color: '#999', textAlign: 'center' }}>No matches found</div>;
        }
        return filteredStats.map(statKey => (
            <React.Fragment key={statKey}>
                {this.renderGridButton(statKey, 5, this.state.stat === statKey, () => this.setState({ stat: statKey }))}
            </React.Fragment>
        ));
    };

    renderStatMatrix = () => {
        let statRows: string[][] = [];
        const { selectorType, availableStats } = this.props;

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

        const labelMap: Record<string, string> = { 'Front Runner': 'Front', 'Pace Chaser': 'Pace', 'Late Surger': 'Late', 'End Closer': 'End'};

        return statRows.map((row, rIdx) => (
            <React.Fragment key={rIdx}>
                {row.map(statKey => {
                    const isDisabled = selectorType === 'aptitude' && !availableStats.includes(statKey);
                    return this.renderGridButton(
                        labelMap[statKey] || statKey, 
                        1, 
                        this.state.stat === statKey, 
                        () => this.setState({ stat: statKey }), 
                        isDisabled
                    );
                })}
                {row.length < 5 && <div style={{ gridColumn: `span ${5 - row.length}` }} />}
            </React.Fragment>
        ));
    };

    render() {
        if (!this.props.show) return null;

        const { selectorType, availableStats } = this.props;
        const { type, stat, stars, searchText } = this.state;
        const canAddFilter = !!(type && stat && stars);
        
        const filteredStats = this.isSearchable() 
            ? availableStats.filter(s => s.toLowerCase().includes(searchText.toLowerCase())) 
            : [];

        return (
            <div style={{
                position: 'absolute', backgroundColor: '#2b2b2b', border: '1px solid #444',
                marginTop: '0.5rem', zIndex: 1000, boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                width: '400px', maxHeight: '400px', overflowY: 'auto',
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0'
            }}>
                {selectorType === 'uniques' && (
                    <>
                        {this.renderEqualStarRow(1)}
                        {this.renderEqualControls(canAddFilter)}
                        {this.renderSearchBar()}
                        {this.renderStatList(filteredStats)}
                    </>
                )}

                {(selectorType === 'races' || selectorType === 'skills') && (
                    <>
                        {this.renderEqualStarRow(7)}
                        {this.renderEqualStarRow(4)}
                        {this.renderEqualStarRow(1)}
                        {this.renderEqualControls(canAddFilter)}
                        {this.renderSearchBar()}
                        {this.renderStatList(filteredStats)}
                    </>
                )}

                {(selectorType === 'blues' || selectorType === 'aptitude') && (
                    <>
                        {this.renderStatMatrix()}
                        
                        {this.renderGridButton('7★', 1, stars === 7, () => this.setState({ stars: 7 }), type === 'Legacy')}
                        {this.renderGridButton('8★', 1, stars === 8, () => this.setState({ stars: 8 }), type === 'Legacy')}
                        {this.renderGridButton('9★', 1, stars === 9, () => this.setState({ stars: 9 }), type === 'Legacy')}
                        {this.renderGridButton('Legacy', 2, type === 'Legacy', this.setLegacyType)}
                        
                        {this.renderGridButton('4★', 1, stars === 4, () => this.setState({ stars: 4 }), type === 'Legacy')}
                        {this.renderGridButton('5★', 1, stars === 5, () => this.setState({ stars: 5 }), type === 'Legacy')}
                        {this.renderGridButton('6★', 1, stars === 6, () => this.setState({ stars: 6 }), type === 'Legacy')}
                        {this.renderGridButton('Total', 2, type === 'Total', () => this.setState({ type: 'Total' }))}
                        
                        {this.renderGridButton('1★', 1, stars === 1, () => this.setState({ stars: 1 }))}
                        {this.renderGridButton('2★', 1, stars === 2, () => this.setState({ stars: 2 }))}
                        {this.renderGridButton('3★', 1, stars === 3, () => this.setState({ stars: 3 }))}
                        {this.renderGridButton('Apply', 2, false, this.handleAddFilter, !canAddFilter, true)}
                    </>
                )}
            </div>
        );
    }
}