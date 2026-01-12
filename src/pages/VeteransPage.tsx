import React from "react";
import { Alert, Badge, Button, Card, Container } from "react-bootstrap";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import { Veteran, BluesFilter, AptitudeFilter, UniquesFilter, RacesFilter, SkillsFilter } from "./VeteransPage/types";
import InlineFilterSelector, { SelectorType } from "./VeteransPage/InlineFilterSelector";
import { aggregateFactors, getFactorCategory } from "../data/VeteransHelper"; 
import VeteransSorter, { SortOption } from "./VeteransPage/VeteransSorter";

interface BaseFilter {
    id: string;
    stat: string;
    type: string;
    stars: number;
}

type VeteransPageState = {
    veterans: Veteran[];
    error: string;
    bluesFilters: BluesFilter[];
    aptitudeFilters: AptitudeFilter[];
    uniquesFilters: UniquesFilter[];
    racesFilters: RacesFilter[]; 
    skillsFilters: SkillsFilter[]; 
    showBluesSelector: boolean;
    showAptitudeSelector: boolean;
    showUniquesSelector: boolean;
    showRacesSelector: boolean; 
    showSkillsSelector: boolean;
    activeSort: SortOption;
};

const FILTER_CONFIG = {
    blues: { categoryId: 1, stateKey: 'bluesFilters' as const, label: 'Blues', color: 'rgb(55, 183, 244)', selectorType: 'blues' as SelectorType },
    aptitude: { categoryId: 2, stateKey: 'aptitudeFilters' as const, label: 'Aptitude', color: 'rgb(255, 118, 178)', selectorType: 'aptitude' as SelectorType },
    uniques: { categoryId: 3, stateKey: 'uniquesFilters' as const, label: 'Uniques', color: 'rgb(120, 208, 96)', selectorType: 'uniques' as SelectorType },
    races: { categoryId: 4, stateKey: 'racesFilters' as const, label: 'Races/Scenarios', color: 'rgb(200, 162, 200)', selectorType: 'races' as SelectorType },
    skills: { categoryId: 5, stateKey: 'skillsFilters' as const, label: 'Skills', color: 'rgb(211, 84, 0)', selectorType: 'skills' as SelectorType }
};

export default class VeteransPage extends React.Component<{}, VeteransPageState> {
    private fileInputRef: React.RefObject<HTMLInputElement>;

    constructor(props: {}) {
        super(props);

        this.state = {
            veterans: [],
            error: '',
            bluesFilters: [],
            aptitudeFilters: [],
            uniquesFilters: [],
            racesFilters: [],
            skillsFilters: [],
            showBluesSelector: false,
            showAptitudeSelector: false,
            showUniquesSelector: false,
            showRacesSelector: false,
            showSkillsSelector: false,
            activeSort: 'none',
        };

        this.fileInputRef = React.createRef();
    }

    handleUploadClick = () => {
        this.fileInputRef.current?.click();
    };

    handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!/\.json$/i.test(file.name)) {
            this.setState({ error: 'Please choose a .json file.' });
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result ?? '');
            try {
                const parsed = JSON.parse(text);
                if (!Array.isArray(parsed)) {
                    this.setState({ error: 'Invalid file format: expected an array of veterans.' });
                    return;
                }
                this.setState({ veterans: parsed, error: '' });
            } catch (err) {
                this.setState({ error: `Failed to parse JSON: ${err}` });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    getCharaImageUrl = (cardId: number): string => {
        const cardIdStr = String(cardId);
        const first4Digits = cardIdStr.substring(0, 4);
        return `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${first4Digits}_${cardId}.png`;
    };

    getCardName = (cardId: number): string => {
        const textData = UMDatabaseWrapper.getTextData(4, cardId);
        if (textData?.text && textData.category === 4) {
            return textData.text;
        }
        return `Card ${cardId}`;
    };

    formatCardName = (cardName: string): string => {
        const match = cardName.match(/^\[.*?\]\s*(.*)$/);
        return match ? match[1] : cardName;
    };

    renderStars = (level: number, isGolden: boolean = false): JSX.Element => {
        const stars = '★'.repeat(level);
        return (
            <span style={{ color: isGolden ? '#FFD700' : 'inherit' }}>
                {stars}
            </span>
        );
    };

    getFactorColor = (factorId: number): string => {
        const category = getFactorCategory(factorId);
        switch (category) {
            case 1: return FILTER_CONFIG.blues.color;
            case 2: return FILTER_CONFIG.aptitude.color;
            case 3: return FILTER_CONFIG.uniques.color;
            case 4: return FILTER_CONFIG.races.color;
            case 5: return 'white'; 
            default: return 'inherit';
        }
    };

    handleAddFilter = <T extends BaseFilter>(stateKey: keyof VeteransPageState, filter: T) => {
        this.setState(prevState => {
            const currentFilters = prevState[stateKey] as T[];
            const exists = currentFilters.some(f => 
                f.stat === filter.stat && 
                f.type === filter.type && 
                f.stars === filter.stars
            );
            if (exists) return null; 
            return {
                ...prevState,
                [stateKey]: [...currentFilters, filter],
            };
        });
    };

    handleRemoveFilter = (stateKey: keyof VeteransPageState, filterId: string) => {
        this.setState(prevState => ({
            ...prevState,
            [stateKey]: (prevState[stateKey] as BaseFilter[]).filter(f => f.id !== filterId),
        }));
    };

    handleClearAllFilters = () => {
        this.setState({
            bluesFilters: [],
            aptitudeFilters: [],
            uniquesFilters: [],
            racesFilters: [],
            skillsFilters: [],
            activeSort: 'none',
        });
    };

    getAvailableStats = (categoryId: number): string[] => {
        const statToMinFactorId = new Map<string, number>();

        this.state.veterans.forEach(veteran => {
            const aggregated = aggregateFactors(veteran);
            aggregated
                .filter(f => getFactorCategory(f.factorId) === categoryId)
                .forEach(f => {
                    const currentMin = statToMinFactorId.get(f.name);
                    if (currentMin === undefined || f.factorId < currentMin) {
                        statToMinFactorId.set(f.name, f.factorId);
                    }
                });
        });

        const stats = Array.from(statToMinFactorId.keys());
        if (categoryId === 1 || categoryId === 2) {
            return stats.sort((a, b) => {
                const idA = statToMinFactorId.get(a)!;
                const idB = statToMinFactorId.get(b)!;
                return idA - idB;
            });
        } else {
            return stats.sort();
        }
    };

    matchesFilter = (veteran: Veteran, filter: BaseFilter, categoryId: number): boolean => {
        const aggregated = aggregateFactors(veteran);
        const relevantFactors = aggregated.filter(f => getFactorCategory(f.factorId) === categoryId);
        const matchingFactors = relevantFactors.filter(f => f.name === filter.stat);

        if (filter.type === 'Legacy') {
            const goldStars = matchingFactors.filter(f => f.isGold).reduce((sum, f) => sum + f.level, 0);
            return goldStars >= filter.stars;
        } else {
            const totalStars = matchingFactors.reduce((sum, f) => sum + f.level, 0);
            return totalStars >= filter.stars;
        }
    };

    calculateSortScore = (veteran: Veteran, sortMode: SortOption): number => {
        const aggregated = aggregateFactors(veteran);
        
        const sumStars = (condition: (f: typeof aggregated[0]) => boolean) => {
            return aggregated.filter(condition).reduce((acc, curr) => acc + curr.level, 0);
        };

        switch (sortMode) {
            case 'blues':
                return sumStars(f => f.category === 1);
            case 'total_common':
                return sumStars(f => f.category === 4 || f.category === 5);
            case 'total_skills':
                return sumStars(f => f.category === 5);
            case 'legacy_common':
                 return sumStars(f => (f.category === 4 || f.category === 5) && f.isGold);
            case 'legacy_skills':
                return sumStars(f => f.category === 5 && f.isGold);
            case 'none':
            default:
                return 0;
        }
    };

    getFilteredVeterans = (): Veteran[] => {
        const { bluesFilters, aptitudeFilters, uniquesFilters, racesFilters, skillsFilters, veterans, activeSort } = this.state;

        let result = veterans;

        if (bluesFilters.length > 0 || aptitudeFilters.length > 0 || uniquesFilters.length > 0 || racesFilters.length > 0 || skillsFilters.length > 0) {
            result = veterans.filter(veteran =>
                bluesFilters.every(filter => this.matchesFilter(veteran, filter, FILTER_CONFIG.blues.categoryId)) &&
                aptitudeFilters.every(filter => this.matchesFilter(veteran, filter, FILTER_CONFIG.aptitude.categoryId)) &&
                uniquesFilters.every(filter => this.matchesFilter(veteran, filter, FILTER_CONFIG.uniques.categoryId)) &&
                racesFilters.every(filter => this.matchesFilter(veteran, filter, FILTER_CONFIG.races.categoryId)) &&
                skillsFilters.every(filter => this.matchesFilter(veteran, filter, FILTER_CONFIG.skills.categoryId))
            );
        }

        if (activeSort !== 'none') {
            result.sort((a, b) => {
                const scoreA = this.calculateSortScore(a, activeSort);
                const scoreB = this.calculateSortScore(b, activeSort);
                
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }
                return b.card_id - a.card_id;
            });
        }

        return result;
    };

    closeAllSelectors = (except: string | null = null) => {
        this.setState({
            showBluesSelector: except === 'blues',
            showAptitudeSelector: except === 'aptitude',
            showUniquesSelector: except === 'uniques',
            showRacesSelector: except === 'races',
            showSkillsSelector: except === 'skills',
        });
    }

    render() {
        const hasActiveFilters = 
            this.state.bluesFilters.length > 0 || 
            this.state.aptitudeFilters.length > 0 || 
            this.state.uniquesFilters.length > 0 ||
            this.state.racesFilters.length > 0 ||
            this.state.skillsFilters.length > 0;
        
        const displayVeterans = this.getFilteredVeterans();

        return (
            <Container>
                <h1 className="mt-4 mb-4">Veterans</h1>

                <div className="mb-5" style={{ position: 'relative' }}>
                    <Button variant="primary" onClick={this.handleUploadClick} style={{ marginRight: '1rem' }}>
                        Upload Veterans JSON File
                    </Button>
                    
                    <span style={{ position: 'relative', display: 'inline-block', marginRight: '1rem' }}>
                        <Button
                            onClick={() => this.closeAllSelectors(this.state.showBluesSelector ? null : 'blues')}
                            style={{ backgroundColor: FILTER_CONFIG.blues.color, borderColor: FILTER_CONFIG.blues.color }}
                        >
                            Blues
                        </Button>
                        <InlineFilterSelector
                            show={this.state.showBluesSelector}
                            onAddFilter={(f) => this.handleAddFilter('bluesFilters', f)}
                            onClose={() => this.setState({ showBluesSelector: false })}
                            availableStats={this.getAvailableStats(FILTER_CONFIG.blues.categoryId)}
                            title="Stat"
                            color={FILTER_CONFIG.blues.color}
                            selectorType={FILTER_CONFIG.blues.selectorType}
                        />
                    </span>

                    <span style={{ position: 'relative', display: 'inline-block', marginRight: '1rem' }}>
                        <Button
                            onClick={() => this.closeAllSelectors(this.state.showAptitudeSelector ? null : 'aptitude')}
                            style={{ backgroundColor: FILTER_CONFIG.aptitude.color, borderColor: FILTER_CONFIG.aptitude.color }}
                        >
                            Aptitudes
                        </Button>
                        <InlineFilterSelector
                            show={this.state.showAptitudeSelector}
                            onAddFilter={(f) => this.handleAddFilter('aptitudeFilters', f)}
                            onClose={() => this.setState({ showAptitudeSelector: false })}
                            availableStats={this.getAvailableStats(FILTER_CONFIG.aptitude.categoryId)}
                            title="Aptitude"
                            color={FILTER_CONFIG.aptitude.color}
                            selectorType={FILTER_CONFIG.aptitude.selectorType}
                        />
                    </span>

                    <span style={{ position: 'relative', display: 'inline-block', marginRight: '1rem' }}>
                        <Button
                            onClick={() => this.closeAllSelectors(this.state.showUniquesSelector ? null : 'uniques')}
                            style={{ backgroundColor: FILTER_CONFIG.uniques.color, borderColor: FILTER_CONFIG.uniques.color }}
                        >
                            Uniques
                        </Button>
                        <InlineFilterSelector
                            show={this.state.showUniquesSelector}
                            onAddFilter={(f) => this.handleAddFilter('uniquesFilters', f)}
                            onClose={() => this.setState({ showUniquesSelector: false })}
                            availableStats={this.getAvailableStats(FILTER_CONFIG.uniques.categoryId)}
                            title="Unique"
                            color={FILTER_CONFIG.uniques.color}
                            selectorType={FILTER_CONFIG.uniques.selectorType}
                        />
                    </span>

                    <span style={{ position: 'relative', display: 'inline-block', marginRight: '1rem' }}>
                        <Button
                            onClick={() => this.closeAllSelectors(this.state.showRacesSelector ? null : 'races')}
                            style={{ backgroundColor: FILTER_CONFIG.races.color, borderColor: FILTER_CONFIG.races.color }}
                        >
                            Races/Scenarios
                        </Button>
                        <InlineFilterSelector
                            show={this.state.showRacesSelector}
                            onAddFilter={(f) => this.handleAddFilter('racesFilters', f)}
                            onClose={() => this.setState({ showRacesSelector: false })}
                            availableStats={this.getAvailableStats(FILTER_CONFIG.races.categoryId)}
                            title="Races"
                            color={FILTER_CONFIG.races.color}
                            selectorType={FILTER_CONFIG.races.selectorType}
                        />
                    </span>

                    <span style={{ position: 'relative', display: 'inline-block', marginRight: '1rem' }}>
                        <Button
                            onClick={() => this.closeAllSelectors(this.state.showSkillsSelector ? null : 'skills')}
                            style={{ backgroundColor: FILTER_CONFIG.skills.color, borderColor: FILTER_CONFIG.skills.color }}
                        >
                            Skills
                        </Button>
                        <InlineFilterSelector
                            show={this.state.showSkillsSelector}
                            onAddFilter={(f) => this.handleAddFilter('skillsFilters', f)}
                            onClose={() => this.setState({ showSkillsSelector: false })}
                            availableStats={this.getAvailableStats(FILTER_CONFIG.skills.categoryId)}
                            title="Skills"
                            color={FILTER_CONFIG.skills.color}
                            selectorType={FILTER_CONFIG.skills.selectorType}
                        />
                    </span>
                    
                    <input
                        ref={this.fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={this.handleFileChange}
                        style={{ display: 'none' }}
                    />
                </div>

                {hasActiveFilters && (
                    <div className="mb-4">
                        <div className="d-flex align-items-center mb-2">
                            <strong className="me-2" style={{ marginRight: '0.5rem' }}>Active Filters:</strong>
                            <Button 
                                variant="outline-danger" 
                                size="sm" 
                                style={{ padding: '0px 8px', fontSize: '0.8rem' }}
                                onClick={this.handleClearAllFilters}
                            >
                                Clear
                            </Button>
                        </div>
                        <div className="mt-2">
                            {Object.values(FILTER_CONFIG).map((config) => {
                                const filters = this.state[config.stateKey] as BaseFilter[];
                                return filters.map(filter => {
                                    const isLegacy = filter.type === 'Legacy';
                                    return (
                                        <Badge
                                            key={filter.id}
                                            variant="info"
                                            className="mb-2"
                                            style={{ 
                                                fontSize: '0.9rem', 
                                                cursor: 'pointer', 
                                                backgroundColor: config.color, 
                                                marginRight: '1rem',
                                                color: '#fff' 
                                            }}
                                            onClick={() => this.handleRemoveFilter(config.stateKey, filter.id)}
                                        >
                                            {filter.stat} <span style={{ color: isLegacy ? '#FFD700' : 'inherit' }}>{filter.stars}★</span> ✕
                                        </Badge>
                                    );
                                });
                            })}
                        </div>
                    </div>
                )}

                {this.state.error && (
                    <Alert variant="danger" dismissible onClose={() => this.setState({ error: '' })}>
                        {this.state.error}
                    </Alert>
                )}

                {this.state.veterans.length === 0 && !this.state.error && (
                    <Alert variant="info">
                        No veterans loaded. Upload a JSON file to get started.
                    </Alert>
                )}

                {this.state.veterans.length > 0 && (
                    <div>
                        <div className="d-flex justify-content-between align-items-end mb-3">
                             <div className="text-muted">
                                Showing {displayVeterans.length} of {this.state.veterans.length} veterans
                             </div>
                             <VeteransSorter 
                                activeSort={this.state.activeSort} 
                                onSortChange={(sort) => this.setState({ activeSort: sort })}
                             />
                        </div>

                        {displayVeterans.map((veteran, index) => {
                            const parent1 = veteran.succession_chara_array.find(p => p.position_id === 10);
                            const parent2 = veteran.succession_chara_array.find(p => p.position_id === 20);
                            const aggregated = aggregateFactors(veteran);

                            return (
                                <Card key={index} className="mb-3">
                                    <Card.Body>
                                        <div className="d-flex align-items-start">
                                            <div style={{ marginRight: '2rem' }}>
                                                <div className="mb-2">
                                                    <h5 className="mb-1">{this.formatCardName(this.getCardName(veteran.card_id))}</h5>
                                                    <div className="text-muted">Rating: {veteran.rank_score}</div>
                                                </div>

                                                <div className="d-flex">
                                                    <div className="me-2">
                                                        <img
                                                            src={this.getCharaImageUrl(veteran.card_id)}
                                                            alt={this.getCardName(veteran.card_id)}
                                                            width="128"
                                                            height="128"
                                                            style={{ objectFit: 'contain' }}
                                                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3Crect width="128" height="128" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
                                                            }}
                                                        />
                                                    </div>

                                                    <div className="d-flex flex-column">
                                                        {[parent1, parent2].map((parent, pIdx) => parent && (
                                                            <img
                                                                key={pIdx}
                                                                src={this.getCharaImageUrl(parent.card_id)}
                                                                alt={this.getCardName(parent.card_id)}
                                                                width="64"
                                                                height="64"
                                                                style={{ objectFit: 'contain', marginBottom: pIdx === 0 ? '0' : undefined }}
                                                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-grow-1">
                                                <div className="mb-3">
                                                    {aggregated.length === 0 ? (
                                                        <small className="text-muted">No factors</small>
                                                    ) : (
                                                        [1, 2, 3, 4, 5].map(catId => {
                                                            const group = aggregated.filter(f => getFactorCategory(f.factorId) === catId);
                                                            if (group.length === 0) return null;
                                                            
                                                            return (
                                                                <div key={catId} className="mb-1">
                                                                    {group.map((factor, idx) => (
                                                                        <Badge
                                                                            key={idx}
                                                                            variant="secondary"
                                                                            className="mb-1"
                                                                            style={{ fontSize: '0.9rem', backgroundColor: '#4a4a4a', marginRight: '0.5rem' }}
                                                                        >
                                                                            <span style={{ color: this.getFactorColor(factor.factorId) }}>
                                                                                {factor.name}
                                                                            </span>{' '}
                                                                            {this.renderStars(factor.level, factor.isGold)}
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Card.Body>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </Container>
        );
    }
}