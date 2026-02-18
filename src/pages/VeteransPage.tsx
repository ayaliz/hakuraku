import React from "react";
import './VeteransPage/VeteransPage.css';
import { Alert, Button, Container, Form, InputGroup } from "react-bootstrap";
import { Veteran, BaseFilter, BluesFilter, AptitudeFilter, UniquesFilter, RacesFilter, SkillsFilter } from "./VeteransPage/types";
import { SelectorType } from "./VeteransPage/InlineFilterSelector";
import VeteransSorter, { SortOption, SortDirection } from "./VeteransPage/VeteransSorter";

import VeteranCard from "./VeteransPage/VeteranCard";
import FilterToolbar from "./VeteransPage/FilterToolbar";
import ActiveFiltersList from "./VeteransPage/ActiveFiltersList";
import OptimizerPanel from "./VeteransPage/OptimizerPanel";
import AffinitySelector from "./VeteransPage/AffinitySelector";
import { applyFiltersAndSort, getAvailableStats } from "./VeteransPage/VeteransLogic";
import { getKvKeyFromUrl, buildShareBody, uploadVeteransToWorker, fetchVeteransFromWorker } from "./VeteransPage/UrlSharing";

type VeteransPageState = {
    veterans: Veteran[];
    error: string;
    successMessage: string;
    sharing: boolean;
    shareCache: Record<string, string>;

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
    sortDirection: SortDirection;

    nameSearch: string;
    affinityCharaId: number | null;

};

const FILTER_CONFIG = {
    blues: { categoryId: 1, stateKey: 'bluesFilters' as const, label: 'Blues', color: 'rgb(55, 183, 244)', selectorType: 'blues' as SelectorType },
    aptitude: { categoryId: 2, stateKey: 'aptitudeFilters' as const, label: 'Aptitude', color: 'rgb(255, 118, 178)', selectorType: 'aptitude' as SelectorType },
    uniques: { categoryId: 3, stateKey: 'uniquesFilters' as const, label: 'Uniques', color: 'rgb(120, 208, 96)', selectorType: 'uniques' as SelectorType },
    races: { categoryId: 4, stateKey: 'racesFilters' as const, label: 'Races/Scenarios', color: 'rgb(200, 162, 200)', selectorType: 'races' as SelectorType },
    skills: { categoryId: 5, stateKey: 'skillsFilters' as const, label: 'Skills', color: 'rgb(211, 84, 0)', selectorType: 'skills' as SelectorType }
};

export default class VeteransPage extends React.Component<{}, VeteransPageState> {
    private fileInputRef: React.RefObject<HTMLInputElement | null>;

    constructor(props: {}) {
        super(props);
        this.state = {
            veterans: [], error: '', successMessage: '', sharing: false, shareCache: {},
            bluesFilters: [], aptitudeFilters: [], uniquesFilters: [], racesFilters: [], skillsFilters: [],
            showBluesSelector: false, showAptitudeSelector: false, showUniquesSelector: false, showRacesSelector: false, showSkillsSelector: false,
            activeSort: 'none', sortDirection: 'desc',
            nameSearch: '', affinityCharaId: null,
        };
        this.fileInputRef = React.createRef();
    }

    componentDidMount() {
        const kvKey = getKvKeyFromUrl();
        if (kvKey) {
            fetchVeteransFromWorker(kvKey)
                .then(veterans => this.setState({ veterans }))
                .catch(err => this.setState({ error: `Failed to load shared roster: ${err.message}` }));
        }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("VeteransPage crashed:", error, errorInfo);
        this.setState({ error: `Display Error: ${error.message}.` });
    }

    handleUploadClick = () => this.fileInputRef.current?.click();

    handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!/\.json$/i.test(file.name)) return this.setState({ error: 'Please choose a .json file.' });

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result ?? ''));
                if (!Array.isArray(parsed)) throw new Error("Not an array");
                this.setState({ veterans: parsed, error: '' });
            } catch (err) {
                this.setState({ error: `Failed to parse JSON: ${err}` });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    handleExportUrl = async () => {
        const { veterans, shareCache } = this.state;
        if (!veterans.length) return;
        const body = buildShareBody(veterans);
        const hash = body.length + ':' + [...body].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0).toString(36);
        const cachedUrl = shareCache[hash];
        if (cachedUrl) {
            await navigator.clipboard.writeText(cachedUrl);
            this.setState({ successMessage: 'Share link copied to clipboard!' });
            setTimeout(() => this.setState({ successMessage: '' }), 3000);
            return;
        }
        this.setState({ sharing: true });
        try {
            const url = await uploadVeteransToWorker(body);
            await navigator.clipboard.writeText(url);
            this.setState(p => ({ sharing: false, successMessage: 'Share link copied to clipboard!', shareCache: { ...p.shareCache, [hash]: url } }));
            setTimeout(() => this.setState({ successMessage: '' }), 3000);
        } catch (err: any) {
            this.setState({ sharing: false, error: `Export failed: ${err.message}` });
        }
    };

    handleAddFilter = (stateKey: string, filter: BaseFilter) => {
        this.setState(prevState => {
            // @ts-ignore - Dynamic key access
            const current = prevState[stateKey] as BaseFilter[];
            if (current.some(f => f.stat === filter.stat && f.type === filter.type && f.stars === filter.stars)) return null;
            return { [stateKey]: [...current, filter] } as any;
        });
    };

    handleRemoveFilter = (stateKey: string, filterId: string) => {
        this.setState(prevState => ({
            // @ts-ignore
            [stateKey]: (prevState[stateKey] as BaseFilter[]).filter(f => f.id !== filterId)
        } as any));
    };

    handleClearAllFilters = () => {
        this.setState({
            bluesFilters: [], aptitudeFilters: [], uniquesFilters: [], racesFilters: [], skillsFilters: [],
            activeSort: 'none', sortDirection: 'desc',
        });
    };

    toggleSelector = (key: string | null) => {
        this.setState({
            showBluesSelector: key === 'blues',
            showAptitudeSelector: key === 'aptitude',
            showUniquesSelector: key === 'uniques',
            showRacesSelector: key === 'races',
            showSkillsSelector: key === 'skills',
        });
    };

    render() {
        const { veterans, activeSort, sortDirection, error, successMessage, sharing, nameSearch, affinityCharaId } = this.state;

        let displayVeterans: Veteran[] = [];
        let renderError = null;

        if (veterans.length > 0) {
            try {
                const filters = {
                    blues: this.state.bluesFilters,
                    aptitude: this.state.aptitudeFilters,
                    uniques: this.state.uniquesFilters,
                    races: this.state.racesFilters,
                    skills: this.state.skillsFilters
                };
                displayVeterans = applyFiltersAndSort(
                    veterans, filters, FILTER_CONFIG, activeSort, sortDirection,
                    nameSearch, affinityCharaId
                );
            } catch (e: any) {
                console.error("Filter/Sort Logic Crashed", e);
                renderError = "Error processing veteran data. Please clear filters or reload.";
            }
        }

        const visibilityState = {
            blues: this.state.showBluesSelector,
            aptitude: this.state.showAptitudeSelector,
            uniques: this.state.showUniquesSelector,
            races: this.state.showRacesSelector,
            skills: this.state.showSkillsSelector
        };

        return (
            <Container className="vet-page-container">

                <div className="mb-3">
                    <div className="toolbar-row">
                        <div className="toolbar-filters">
                            <FilterToolbar
                                config={FILTER_CONFIG}
                                visibilityState={visibilityState}
                                onToggle={this.toggleSelector}
                                onAddFilter={this.handleAddFilter}
                                getAvailableStats={(catId) => getAvailableStats(veterans, catId)}
                            />
                            <InputGroup className="vet-search-input">
                                <Form.Control
                                    placeholder="Search by name..."
                                    value={nameSearch}
                                    onChange={e => this.setState({ nameSearch: e.target.value })}
                                />
                                {nameSearch && (
                                    <Button variant="outline-secondary" onClick={() => this.setState({ nameSearch: '' })}>✕</Button>
                                )}
                            </InputGroup>
                        </div>
                        <div className="toolbar-row-actions">
                            <Button variant="secondary" size="sm" onClick={this.handleExportUrl} disabled={!veterans.length || sharing}>
                                {sharing ? 'Sharing...' : 'Share'}
                            </Button>
                        </div>
                    </div>

                    <input ref={this.fileInputRef} type="file" accept=".json" onChange={this.handleFileChange} style={{ display: 'none' }} />
                </div>

                <ActiveFiltersList
                    filters={{
                        bluesFilters: this.state.bluesFilters,
                        aptitudeFilters: this.state.aptitudeFilters,
                        uniquesFilters: this.state.uniquesFilters,
                        racesFilters: this.state.racesFilters,
                        skillsFilters: this.state.skillsFilters
                    }}
                    config={FILTER_CONFIG}
                    onRemove={this.handleRemoveFilter}
                    onClearAll={this.handleClearAllFilters}
                />

                {successMessage && (
                    <Alert variant="success" dismissible onClose={() => this.setState({ successMessage: '' })}>
                        {successMessage}
                    </Alert>
                )}

                {(error || renderError) && (
                    <Alert variant="danger" dismissible onClose={() => this.setState({ error: '' })}>
                        {error || renderError}
                    </Alert>
                )}

                {!veterans.length && !error && !renderError && (
                    <div className="upload-zone" onClick={this.handleUploadClick}>
                        <div className="upload-icon">📂</div>
                        <div className="upload-label">No veterans loaded</div>
                        <div className="upload-sublabel">Upload a JSON file or share link to get started</div>
                    </div>
                )}

                {veterans.length > 0 && !renderError && (
                    <div>
                        <div className="vet-count-sort-row">
                            <span className="vet-count-label">
                                Showing {displayVeterans.length} of {veterans.length} veterans
                            </span>
                            <VeteransSorter
                                activeSort={activeSort} sortDirection={sortDirection}
                                onSortChange={(s) => this.setState({ activeSort: s })}
                                onDirectionToggle={() => this.setState(p => ({ sortDirection: p.sortDirection === 'desc' ? 'asc' : 'desc' }))}
                                affinityCharaId={affinityCharaId}
                            />
                        </div>

                        <OptimizerPanel veterans={veterans} />
                        <AffinitySelector
                            selectedCharaId={affinityCharaId}
                            onSelect={(id) => this.setState({ affinityCharaId: id })}
                        />

                        <div className="vet-grid">
                            {displayVeterans.map((veteran, index) => (
                                <VeteranCard key={`${veteran.card_id}-${index}`} veteran={veteran} config={FILTER_CONFIG} affinityCharaId={affinityCharaId} />
                            ))}
                        </div>
                    </div>
                )}


            </Container>
        );
    }
}
