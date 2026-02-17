import React from "react";
import { Alert, Button, Container, Form, InputGroup, Modal } from "react-bootstrap";
import { Veteran, BaseFilter, BluesFilter, AptitudeFilter, UniquesFilter, RacesFilter, SkillsFilter } from "./VeteransPage/types";
import { SelectorType } from "./VeteransPage/InlineFilterSelector";
import VeteransSorter, { SortOption, SortDirection } from "./VeteransPage/VeteransSorter";

import VeteranCard from "./VeteransPage/VeteranCard";
import FilterToolbar from "./VeteransPage/FilterToolbar";
import ActiveFiltersList from "./VeteransPage/ActiveFiltersList";
import OptimizerPanel from "./VeteransPage/OptimizerPanel";
import { applyFiltersAndSort, getAvailableStats } from "./VeteransPage/VeteransLogic";
import { getVeteransFromUrl, copyRosterToClipboard, decodeVeterans } from "./VeteransPage/UrlSharing";

type VeteransPageState = {
    veterans: Veteran[];
    error: string;
    successMessage: string;

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

    showImportModal: boolean;
    importText: string;
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
            veterans: [], error: '', successMessage: '',
            bluesFilters: [], aptitudeFilters: [], uniquesFilters: [], racesFilters: [], skillsFilters: [],
            showBluesSelector: false, showAptitudeSelector: false, showUniquesSelector: false, showRacesSelector: false, showSkillsSelector: false,
            activeSort: 'none', sortDirection: 'desc',
            nameSearch: '',
            showImportModal: false, importText: '',
        };
        this.fileInputRef = React.createRef();
    }

    componentDidMount() {
        try {
            const fromUrl = getVeteransFromUrl();
            if (fromUrl && fromUrl.length > 0) {
                this.setState({ veterans: fromUrl });
            }
        } catch {
            // ignore URL parse errors on mount
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
        const { veterans } = this.state;
        if (!veterans.length) return;
        try {
            await copyRosterToClipboard(veterans);
            this.setState({ successMessage: 'Roster URL copied to clipboard!' });
            setTimeout(() => this.setState({ successMessage: '' }), 3000);
        } catch {
            this.setState({ error: 'Failed to copy to clipboard.' });
        }
    };

    handleImportFromUrl = () => {
        const { importText } = this.state;
        try {
            // Accept either a full URL or just the encoded payload
            const match = importText.match(/[#&]v=([^&\s]*)/);
            const encoded = match ? match[1] : importText.trim();
            const veterans = decodeVeterans(encoded);
            if (!Array.isArray(veterans) || veterans.length === 0) throw new Error("Empty or invalid roster");
            this.setState({ veterans, error: '', showImportModal: false, importText: '' });
        } catch (err) {
            this.setState({ error: `Import failed: ${err}` });
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
        const { veterans, activeSort, sortDirection, error, successMessage, nameSearch } = this.state;

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
                    nameSearch
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
            <Container style={{ paddingTop: 20 }}>
                <div className="mb-3" style={{ position: 'relative' }}>
                    <div className="d-flex flex-wrap gap-2 mb-2 align-items-center">
                        <Button variant="primary" onClick={this.handleUploadClick}>
                            Upload JSON
                        </Button>
                        <Button variant="outline-secondary" onClick={this.handleExportUrl} disabled={!veterans.length}>
                            Export URL
                        </Button>
                        <Button variant="outline-secondary" onClick={() => this.setState({ showImportModal: true, importText: '' })}>
                            Import from URL
                        </Button>
                    </div>

                    <div className="mb-2">
                        <InputGroup style={{ maxWidth: 320 }}>
                            <Form.Control
                                placeholder="Search by character name..."
                                value={nameSearch}
                                onChange={e => this.setState({ nameSearch: e.target.value })}
                            />
                            {nameSearch && (
                                <Button variant="outline-secondary" onClick={() => this.setState({ nameSearch: '' })}>✕</Button>
                            )}
                        </InputGroup>
                    </div>

                    <FilterToolbar
                        config={FILTER_CONFIG}
                        visibilityState={visibilityState}
                        onToggle={this.toggleSelector}
                        onAddFilter={this.handleAddFilter}
                        getAvailableStats={(catId) => getAvailableStats(veterans, catId)}
                    />

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
                    <Alert variant="info">No veterans loaded. Upload a JSON file or import from URL to get started.</Alert>
                )}

                {veterans.length > 0 && !renderError && (
                    <div>
                        <div className="d-flex justify-content-between align-items-end mb-3">
                            <div className="text-muted">Showing {displayVeterans.length} of {veterans.length} veterans</div>
                            <VeteransSorter
                                activeSort={activeSort} sortDirection={sortDirection}
                                onSortChange={(s) => this.setState({ activeSort: s })}
                                onDirectionToggle={() => this.setState(p => ({ sortDirection: p.sortDirection === 'desc' ? 'asc' : 'desc' }))}
                            />
                        </div>

                        <OptimizerPanel veterans={veterans} />

                        {displayVeterans.map((veteran, index) => (
                            <VeteranCard key={`${veteran.card_id}-${index}`} veteran={veteran} config={FILTER_CONFIG} />
                        ))}
                    </div>
                )}

                {/* Import from URL modal */}
                <Modal
                    show={this.state.showImportModal}
                    onHide={() => this.setState({ showImportModal: false })}
                    contentClassName="bg-dark text-light"
                    animation={false}
                >
                    <Modal.Header closeButton className="bg-dark text-light border-secondary">
                        <Modal.Title>Import Roster from URL</Modal.Title>
                    </Modal.Header>
                    <Modal.Body className="bg-dark">
                        <Form.Label>Paste a roster URL or encoded payload:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            className="bg-dark text-light"
                            value={this.state.importText}
                            onChange={e => this.setState({ importText: e.target.value })}
                            placeholder="https://...#v=... or raw encoded string"
                        />
                    </Modal.Body>
                    <Modal.Footer className="bg-dark border-secondary">
                        <Button variant="secondary" onClick={() => this.setState({ showImportModal: false })}>Cancel</Button>
                        <Button variant="primary" onClick={this.handleImportFromUrl} disabled={!this.state.importText.trim()}>Import</Button>
                    </Modal.Footer>
                </Modal>
            </Container>
        );
    }
}
