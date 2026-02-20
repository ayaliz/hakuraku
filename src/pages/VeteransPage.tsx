import { useEffect, useRef, useState } from "react";
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
import { getKvKeyFromUrl, buildShareBody, uploadVeteransToWorker, fetchVeteransFromWorker, fetchLoanedChara } from "./VeteransPage/UrlSharing";

const FILTER_CONFIG = {
    blues: { categoryId: 1, stateKey: 'bluesFilters' as const, label: 'Blues', color: 'rgb(55, 183, 244)', selectorType: 'blues' as SelectorType },
    aptitude: { categoryId: 2, stateKey: 'aptitudeFilters' as const, label: 'Aptitude', color: 'rgb(255, 118, 178)', selectorType: 'aptitude' as SelectorType },
    uniques: { categoryId: 3, stateKey: 'uniquesFilters' as const, label: 'Uniques', color: 'rgb(120, 208, 96)', selectorType: 'uniques' as SelectorType },
    races: { categoryId: 4, stateKey: 'racesFilters' as const, label: 'Races/Scenarios', color: 'rgb(200, 162, 200)', selectorType: 'races' as SelectorType },
    skills: { categoryId: 5, stateKey: 'skillsFilters' as const, label: 'Skills', color: 'rgb(211, 84, 0)', selectorType: 'skills' as SelectorType }
};

export default function VeteransPage() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [veterans, setVeterans] = useState<Veteran[]>([]);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [sharing, setSharing] = useState(false);
    const [shareCache, setShareCache] = useState<Record<string, string>>({});

    const [trainerId, setTrainerId] = useState('');
    const [loanLookupResult, setLoanLookupResult] = useState<string | null>(null);
    const [loanLookupError, setLoanLookupError] = useState<string | null>(null);
    const [loanLookupLoading, setLoanLookupLoading] = useState(false);

    const handleLoanLookup = async () => {
        if (!trainerId.trim()) return;
        setLoanLookupResult(null);
        setLoanLookupError(null);
        setLoanLookupLoading(true);
        try {
            const data = await fetchLoanedChara(trainerId.trim());
            setLoanLookupResult(JSON.stringify(data, null, 2));
        } catch (err: any) {
            setLoanLookupError(String(err));
        } finally {
            setLoanLookupLoading(false);
        }
    };

    const [bluesFilters, setBluesFilters] = useState<BluesFilter[]>([]);
    const [aptitudeFilters, setAptitudeFilters] = useState<AptitudeFilter[]>([]);
    const [uniquesFilters, setUniquesFilters] = useState<UniquesFilter[]>([]);
    const [racesFilters, setRacesFilters] = useState<RacesFilter[]>([]);
    const [skillsFilters, setSkillsFilters] = useState<SkillsFilter[]>([]);

    const [showBluesSelector, setShowBluesSelector] = useState(false);
    const [showAptitudeSelector, setShowAptitudeSelector] = useState(false);
    const [showUniquesSelector, setShowUniquesSelector] = useState(false);
    const [showRacesSelector, setShowRacesSelector] = useState(false);
    const [showSkillsSelector, setShowSkillsSelector] = useState(false);

    const [activeSort, setActiveSort] = useState<SortOption>('none');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [nameSearch, setNameSearch] = useState('');
    const [affinityCharaId, setAffinityCharaId] = useState<number | null>(null);

    useEffect(() => {
        const kvKey = getKvKeyFromUrl();
        if (kvKey) {
            fetchVeteransFromWorker(kvKey)
                .then(v => setVeterans(v))
                .catch(err => setError(`Failed to load shared roster: ${err.message}`));
        }
    }, []);

    const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!/\.json$/i.test(file.name)) { setError('Please choose a .json file.'); return; }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result ?? ''));
                if (!Array.isArray(parsed)) throw new Error("Not an array");
                setVeterans(parsed);
                setError('');
            } catch (err) {
                setError(`Failed to parse JSON: ${err}`);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleExportUrl = async () => {
        if (!veterans.length) return;
        const body = buildShareBody(veterans);
        const hash = body.length + ':' + [...body].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0).toString(36);
        const cachedUrl = shareCache[hash];
        if (cachedUrl) {
            await navigator.clipboard.writeText(cachedUrl);
            setSuccessMessage('Share link copied to clipboard!');
            setTimeout(() => setSuccessMessage(''), 3000);
            return;
        }
        setSharing(true);
        try {
            const url = await uploadVeteransToWorker(body);
            await navigator.clipboard.writeText(url);
            setSharing(false);
            setSuccessMessage('Share link copied to clipboard!');
            setShareCache(prev => ({ ...prev, [hash]: url }));
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err: any) {
            setSharing(false);
            setError(`Export failed: ${err.message}`);
        }
    };

    const handleAddFilter = (stateKey: string, filter: BaseFilter) => {
        const setters: Record<string, React.Dispatch<React.SetStateAction<BaseFilter[]>>> = {
            bluesFilters: setBluesFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            aptitudeFilters: setAptitudeFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            uniquesFilters: setUniquesFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            racesFilters: setRacesFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            skillsFilters: setSkillsFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
        };
        setters[stateKey]?.(prev => {
            if (prev.some(f => f.stat === filter.stat && f.type === filter.type && f.stars === filter.stars)) return prev;
            return [...prev, filter];
        });
    };

    const handleRemoveFilter = (stateKey: string, filterId: string) => {
        const setters: Record<string, React.Dispatch<React.SetStateAction<BaseFilter[]>>> = {
            bluesFilters: setBluesFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            aptitudeFilters: setAptitudeFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            uniquesFilters: setUniquesFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            racesFilters: setRacesFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
            skillsFilters: setSkillsFilters as React.Dispatch<React.SetStateAction<BaseFilter[]>>,
        };
        setters[stateKey]?.(prev => prev.filter(f => f.id !== filterId));
    };

    const handleClearAllFilters = () => {
        setBluesFilters([]);
        setAptitudeFilters([]);
        setUniquesFilters([]);
        setRacesFilters([]);
        setSkillsFilters([]);
        setActiveSort('none');
        setSortDirection('desc');
    };

    const toggleSelector = (key: string | null) => {
        setShowBluesSelector(key === 'blues');
        setShowAptitudeSelector(key === 'aptitude');
        setShowUniquesSelector(key === 'uniques');
        setShowRacesSelector(key === 'races');
        setShowSkillsSelector(key === 'skills');
    };

    let displayVeterans: Veteran[] = [];
    let renderError: string | null = null;

    if (veterans.length > 0) {
        try {
            const filters = {
                blues: bluesFilters,
                aptitude: aptitudeFilters,
                uniques: uniquesFilters,
                races: racesFilters,
                skills: skillsFilters
            };
            displayVeterans = applyFiltersAndSort(
                veterans, filters, FILTER_CONFIG, activeSort, sortDirection, nameSearch, affinityCharaId
            );
        } catch (e: any) {
            console.error("Filter/Sort Logic Crashed", e);
            renderError = "Error processing veteran data. Please clear filters or reload.";
        }
    }

    const visibilityState = {
        blues: showBluesSelector,
        aptitude: showAptitudeSelector,
        uniques: showUniquesSelector,
        races: showRacesSelector,
        skills: showSkillsSelector
    };

    return (
        <Container className="vet-page-container">

            <div className="mb-3">
                <div className="toolbar-row">
                    <div className="toolbar-filters">
                        <FilterToolbar
                            config={FILTER_CONFIG}
                            visibilityState={visibilityState}
                            onToggle={toggleSelector}
                            onAddFilter={handleAddFilter}
                            getAvailableStats={(catId) => getAvailableStats(veterans, catId)}
                        />
                        <InputGroup className="vet-search-input">
                            <Form.Control
                                placeholder="Search by name..."
                                value={nameSearch}
                                onChange={e => setNameSearch(e.target.value)}
                            />
                            {nameSearch && (
                                <Button variant="outline-secondary" onClick={() => setNameSearch('')}>✕</Button>
                            )}
                        </InputGroup>
                    </div>
                    <div className="toolbar-row-actions">
                        <Button variant="secondary" size="sm" onClick={handleExportUrl} disabled={!veterans.length || sharing}>
                            {sharing ? 'Sharing...' : 'Share'}
                        </Button>
                    </div>
                </div>

                <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            <ActiveFiltersList
                filters={{
                    bluesFilters,
                    aptitudeFilters,
                    uniquesFilters,
                    racesFilters,
                    skillsFilters
                }}
                config={FILTER_CONFIG}
                onRemove={handleRemoveFilter}
                onClearAll={handleClearAllFilters}
            />

            {successMessage && (
                <Alert variant="success" dismissible onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            )}

            {(error || renderError) && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>
                    {error || renderError}
                </Alert>
            )}

            <div className="mb-3">
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Loaned Character Lookup (test)</div>
                <InputGroup style={{ maxWidth: 400 }}>
                    <Form.Control
                        placeholder="Trainer ID..."
                        value={trainerId}
                        onChange={e => setTrainerId(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLoanLookup()}
                    />
                    <Button variant="outline-primary" onClick={handleLoanLookup} disabled={loanLookupLoading}>
                        {loanLookupLoading ? 'Loading...' : 'Lookup'}
                    </Button>
                </InputGroup>
                {loanLookupError && (
                    <Alert variant="danger" className="mt-2">{loanLookupError}</Alert>
                )}
                {loanLookupResult !== null && (
                    <pre style={{ marginTop: 8, fontSize: 12, maxHeight: 200, overflow: 'auto', background: 'var(--haku-bg-2)', padding: 8, borderRadius: 4 }}>
                        {(() => { try { return JSON.stringify(JSON.parse(loanLookupResult), null, 2); } catch { return loanLookupResult; } })()}
                    </pre>
                )}
            </div>

            {!veterans.length && !error && !renderError && (
                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
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
                            onSortChange={setActiveSort}
                            onDirectionToggle={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
                            affinityCharaId={affinityCharaId}
                        />
                    </div>

                    <OptimizerPanel veterans={veterans} />
                    <AffinitySelector
                        selectedCharaId={affinityCharaId}
                        onSelect={setAffinityCharaId}
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
