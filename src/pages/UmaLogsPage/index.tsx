import React, { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { Spinner, Alert } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import type { HorseEntry } from "../MultiRacePage/types";
import StrategyAnalysis from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import { COLORBLIND_STRATEGY_COLORS, STRATEGY_COLORS, STRATEGY_DISPLAY_ORDER, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import CharacterAnalysis from "../MultiRacePage/components/WinDistributionCharts/CharacterAnalysis";
import SkillAnalysis from "../MultiRacePage/components/SkillAnalysis";
import { getSkillIconUrl } from "../../data/skillIcons";
import type { TrackGroup, TrackGroupContentProps } from "./umaLogsTypes";
import { deserializeStats } from "./deserialize";
import type { ReplayExactBuildFilter } from "./replaysShared";
import { isDebufferHorse, originalStrategyForHorse } from "../MultiRacePage/styleClassifier";
import type { UmaLogsQuerySpec } from "./umaLogsQueryShared";
import CardUsageModal from "./CardUsageModal";
import SkillsByStrategyModal from "./SkillsByStrategyModal";
import StyleDecksModal from "./StyleDecksModal";
import OverviewTab from "./OverviewTab";
import { useUmaLogsGroupResources } from "./hooks/useUmaLogsGroupResources";
import { useUmaLogsDataset } from "./hooks/useUmaLogsDataset";
import "../MultiRacePage/MultiRacePage.css";
import "./UmaLogsPage.css";
import { UMA_LOGS_API_BASE } from "../../features/umalogs/api/config";
import IntroductionTab from "../../features/umalogs/components/IntroductionTab";
import UmaLogsSectionNav from "../../features/umalogs/components/UmaLogsSectionNav";
import {
    clearReplayNavigationParams,
    setReplayEntryQueryNavigation,
    setReplayExactBuildNavigation,
} from "../../features/umalogs/model/replayNavigation";
import {
    isUmaLogsSection,
    UMA_LOGS_PANEL_DATA_SECTIONS,
    type UmaLogsSection,
} from "../../features/umalogs/model/sections";
import StrategyPaletteControls, { useStrategyPalette } from "../../components/StrategyPaletteControls";

const ExplorerTab = lazy(() => import("./ExplorerTab"));
const QueriesTab = lazy(() => import("./QueriesTab"));
const ReplaysTab = lazy(() => import("./ReplaysTab"));

const TrackGroupContent: React.FC<TrackGroupContentProps> = ({ group, cmId, cmLabel, section, onSectionChange, onViewReplaysForHorse, onFindReplaysForQuery, initialQuery, scoreWinnersOnly, setScoreWinnersOnly, totalRaces, strategyColors }) => {
    const [cardUsageOpen, setCardUsageOpen] = useState(false);
    const [styleDecksOpen, setStyleDecksOpen] = useState(false);
    const [skillsOpen, setSkillsOpen] = useState(false);
    const [skillsStrategyTab, setSkillsStrategyTab] = useState<number>(1);
    const [skillsSort, setSkillsSort] = useState<"pop" | "winRate">("pop");
    const [skillsMinPopPct, setSkillsMinPopPct] = useState<0 | 0.5 | 1 | 2>(0.5);
    const [styleDeckSort, setStyleDeckSort] = useState<"pop" | "winRate">("pop");
    const [styleDeckMinPopPct, setStyleDeckMinPopPct] = useState<0 | 0.5 | 1 | 2>(0.5);
    const sectionNeedsPanelData = UMA_LOGS_PANEL_DATA_SECTIONS.includes(section);
    const sectionNeedsSkillOverview = section === 'skill';
    const availableDeckStyleIds = useMemo(
        () => group.stats.strategyStats
            .map((row) => row.strategy)
            .filter((style, index, values) => Number.isFinite(style) && values.indexOf(style) === index)
            .sort((a, b) => a - b),
        [group.stats.strategyStats],
    );
    const [selectedDeckStyle, setSelectedDeckStyle] = useState<number>(availableDeckStyleIds[0] ?? 1);
    const effectiveStyleDeckMinPopPct = styleDeckSort === "pop" ? 0 : styleDeckMinPopPct;
    const deckRequestKey = `${selectedDeckStyle}:${styleDeckSort}:${effectiveStyleDeckMinPopPct}`;
    const deckRequest = useMemo(() => styleDecksOpen ? {
        key: deckRequestKey,
        style: selectedDeckStyle,
        sort: styleDeckSort,
        minPopPct: effectiveStyleDeckMinPopPct,
    } : null, [deckRequestKey, effectiveStyleDeckMinPopPct, selectedDeckStyle, styleDeckSort, styleDecksOpen]);
    const {
        panelData,
        panelDataLoading,
        panelDataError,
        deckData,
        deckDataLoading,
        deckDataError,
        skillOverview,
        skillOverviewLoading,
        skillOverviewError,
        skillDetailCache,
        skillDetailLoadingIds,
        loadSkillDetail,
    } = useUmaLogsGroupResources({
        cmId,
        courseId: group.courseId,
        fetchPanel: sectionNeedsPanelData,
        fetchSkillOverview: sectionNeedsSkillOverview,
        deckRequest,
    });
    const panelDataUnavailable = sectionNeedsPanelData && !panelData;
    const skillDataUnavailable = sectionNeedsSkillOverview && !skillOverview;
    const deckDataUnavailable = styleDecksOpen && !deckData;

    const styleReps = panelData?.styleReps ?? {};

    const skillsByStrategy = panelData?.skillsByStrategy ?? {};

    const rawUnifiedCharacterWinsAll = panelData?.rawUnifiedCharacterWinsAll ?? [];
    const rawUnifiedCharacterWinsOpp = panelData?.rawUnifiedCharacterWinsOpp ?? [];
    const rawUnifiedCharacterPop = panelData?.rawUnifiedCharacterPop ?? [];
    useEffect(() => {
        if (!availableDeckStyleIds.includes(selectedDeckStyle)) {
            setSelectedDeckStyle(availableDeckStyleIds[0] ?? 1);
        }
    }, [availableDeckStyleIds, selectedDeckStyle]);
    const styleDeckRowsByStyle = deckData?.styleDeckRowsByStyle ?? {};
    const selectedStyleDeckRows = styleDeckRowsByStyle[selectedDeckStyle] ?? [];
    const filteredStyleDeckRows = useMemo(
        () => selectedStyleDeckRows.filter(r => r.popPct >= effectiveStyleDeckMinPopPct),
        [selectedStyleDeckRows, effectiveStyleDeckMinPopPct]
    );
    const selectedStyleDeckList = useMemo(() => {
        if (styleDeckSort === "pop") return [...filteredStyleDeckRows].sort((a, b) => b.appearances - a.appearances);
        return [...filteredStyleDeckRows].sort((a, b) => b.adjWinRate - a.adjWinRate);
    }, [filteredStyleDeckRows, styleDeckSort]);
    const selectedStyleDeckMaxPct = useMemo(
        () => Math.max(...selectedStyleDeckList.slice(0, 20).flatMap(r => [r.popPct, r.adjWinRate * 100]), 1),
        [selectedStyleDeckList]
    );

    return (
        <>
            <UmaLogsSectionNav section={section} onSectionChange={onSectionChange} />

            {section === 'introduction' && (
                <IntroductionTab totalRaces={totalRaces} cmLabel={cmLabel} />
            )}

            {panelDataError && panelDataUnavailable && (
                <Alert variant="warning" className="mt-3">
                    <strong>Panel data not available.</strong>
                    <br />
                    <small className="text-muted">{panelDataError}</small>
                </Alert>
            )}

            {panelDataLoading && panelDataUnavailable && (
                <div className="p-4 text-center">
                    <Spinner animation="border" /> Loading panel data...
                </div>
            )}

            {skillOverviewError && skillDataUnavailable && (
                <Alert variant="warning" className="mt-3">
                    <strong>Skill data not available.</strong>
                    <br />
                    <small className="text-muted">{skillOverviewError}</small>
                </Alert>
            )}

            {skillOverviewLoading && skillDataUnavailable && (
                <div className="p-4 text-center">
                    <Spinner animation="border" /> Loading skill data...
                </div>
            )}

            {section === "overview" && panelData && (
                <OverviewTab
                    group={group}
                    panelData={panelData}
                    scoreWinnersOnly={scoreWinnersOnly}
                    setScoreWinnersOnly={setScoreWinnersOnly}
                    strategyColors={strategyColors}
                    onViewReplaysForHorse={onViewReplaysForHorse}
                    onOpenStyleDecks={() => setStyleDecksOpen(true)}
                    onOpenCardUsage={() => setCardUsageOpen(true)}
                    onOpenSkills={() => setSkillsOpen(true)}
                />
            )}
            <CardUsageModal
                open={cardUsageOpen}
                onClose={() => setCardUsageOpen(false)}
                rows={panelData?.supportCardRows}
            />
            <SkillsByStrategyModal
                open={skillsOpen}
                onClose={() => setSkillsOpen(false)}
                skillsByStrategy={skillsByStrategy}
                skillsStrategyTab={skillsStrategyTab}
                setSkillsStrategyTab={setSkillsStrategyTab}
                skillsSort={skillsSort}
                setSkillsSort={setSkillsSort}
                skillsMinPopPct={skillsMinPopPct}
                setSkillsMinPopPct={setSkillsMinPopPct}
                getSkillIconUrl={getSkillIconUrl}
            />
            <StyleDecksModal
                open={styleDecksOpen}
                onClose={() => setStyleDecksOpen(false)}
                deckDataLoading={deckDataLoading}
                deckDataUnavailable={deckDataUnavailable}
                deckDataError={deckDataError}
                availableDeckStyleIds={availableDeckStyleIds}
                selectedDeckStyle={selectedDeckStyle}
                setSelectedDeckStyle={setSelectedDeckStyle}
                styleDeckSort={styleDeckSort}
                setStyleDeckSort={setStyleDeckSort}
                styleDeckMinPopPct={styleDeckMinPopPct}
                setStyleDeckMinPopPct={setStyleDeckMinPopPct}
                selectedStyleDeckList={selectedStyleDeckList}
                selectedStyleDeckMaxPct={selectedStyleDeckMaxPct}
            />

            {!panelDataUnavailable && section === 'strategy' && (
                <div className="win-distribution-section">
                    <StrategyAnalysis
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        apiMode
                        strategyStats={group.stats.strategyStats}
                        totalRaces={group.stats.totalRaces}
                        roomCompositions={group.stats.roomCompositions}
                        styleCompositionRows={panelData?.styleCompositionRows ?? []}
                        styleReps={styleReps}
                        characterTeamRates={panelData?.characterTeamRates ?? []}
                        skillStats={group.stats.skillStats}
                        strategyColors={strategyColors}
                        onViewReplays={onViewReplaysForHorse}
                    />
                </div>
            )}

            {!panelDataUnavailable && section === 'character' && (
                <div className="win-distribution-section">
                    <CharacterAnalysis
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        apiMode
                        rawWinsAll={rawUnifiedCharacterWinsAll}
                        rawWinsOpp={rawUnifiedCharacterWinsOpp}
                        rawPop={rawUnifiedCharacterPop}
                        spectatorMode
                        characterStats={group.stats.characterStats}
                        skillStats={group.stats.skillStats}
                        characterTeamRates={panelData?.characterTeamRates ?? []}
                        strategyColors={strategyColors}
                    />
                </div>
            )}

            {!skillDataUnavailable && section === 'skill' && (
                <SkillAnalysis
                    skillStats={skillOverview ?? group.stats.skillStats}
                    skillActivations={group.stats.skillActivations}
                    avgRaceDistance={group.stats.avgRaceDistance}
                    characterStats={group.stats.characterStats}
                    strategyStats={group.stats.strategyStats}
                    ownCharas={[]}
                    precomputedBuckets={skillOverview ? undefined : group.stats.skillActivationBuckets}
                    lazySkillDetails={skillOverview ? skillDetailCache : undefined}
                    onLoadLazySkillDetail={skillOverview ? loadSkillDetail : undefined}
                    lazySkillDetailLoadingIds={skillOverview ? skillDetailLoadingIds : undefined}
                    showStrategyProcRates
                    enableActivationSortCycle
                />
            )}

            <Suspense fallback={<div className="p-4 text-center"><Spinner animation="border" /> Loading section...</div>}>
                {section === 'queries' && (
                    <QueriesTab
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        onFindReplays={onFindReplaysForQuery}
                        initialQuery={initialQuery}
                    />
                )}

                {section === 'explorer' && (
                    <ExplorerTab
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        apiMode
                        skillStats={group.stats.skillStats}
                        strategyColors={strategyColors}
                        onViewReplays={onViewReplaysForHorse}
                    />
                )}

                {section === 'replays' && (
                    <ReplaysTab
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        strategyColors={strategyColors}
                    />
                )}
            </Suspense>

        </>
    );
};

const UmaLogsPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { manifest, selectedCmId, selectCm, data, loading, error } = useUmaLogsDataset();
    const [scoreWinnersOnly, setScoreWinnersOnly] = useState(false);
    const { colorblindMode, setColorblindMode, strategyColors } = useStrategyPalette(
        STRATEGY_COLORS,
        COLORBLIND_STRATEGY_COLORS,
    );
    const [queryDraft, setQueryDraft] = useState<string | undefined>(undefined);
    const tabParam = searchParams.get("tab");
    const section: UmaLogsSection = isUmaLogsSection(tabParam) ? tabParam : "introduction";

    const handleSectionChange = (nextSection: UmaLogsSection) => {
        if (nextSection === section) return;
        const nextParams = new URLSearchParams(searchParams);
        if (nextSection !== "replays") {
            clearReplayNavigationParams(nextParams);
        }
        if (nextSection === "introduction") {
            nextParams.delete("tab");
        } else {
            nextParams.set("tab", nextSection);
        }
        setSearchParams(nextParams, { replace: false });
    };

    const handleViewReplaysForHorse = (horse: HorseEntry) => {
        const build: ReplayExactBuildFilter = {
            cardId: horse.cardId,
            strategy: originalStrategyForHorse(horse),
            isDebuffer: isDebufferHorse(horse),
            speed: horse.speed,
            stamina: horse.stamina,
            pow: horse.pow,
            guts: horse.guts,
            wiz: horse.wiz,
            rankScore: horse.rankScore,
            careerWinCount: horse.careerWinCount,
            supportCardIds: horse.supportCardIds ?? [],
            supportCardLimitBreaks: horse.supportCardLimitBreaks ?? [],
            learnedSkillIds: Array.from(horse.learnedSkillIds ?? []),
        };
        const nextParams = new URLSearchParams(searchParams);
        setReplayExactBuildNavigation(nextParams, build, sessionStorage);
        setSearchParams(nextParams, { replace: false });
    };

    const handleFindReplaysForQuery = (querySpec: UmaLogsQuerySpec) => {
        const nextParams = new URLSearchParams(searchParams);
        setReplayEntryQueryNavigation(nextParams, querySpec, sessionStorage);
        setSearchParams(nextParams, { replace: false });
    };

    const handleEditAsQuery = (query: string) => {
        setQueryDraft(query);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("tab", "queries");
        setSearchParams(nextParams, { replace: false });
    };

    const trackGroups: TrackGroup[] = useMemo(() => {
        if (!data) return [];
        return data.groups.map((g) => ({
            courseId: g.courseId,
            trackLabel: g.trackLabel,
            raceCount: g.raceCount,
            stats: deserializeStats(g.stats),
        }));
    }, [data]);

    const totalRaces = useMemo(() => data?.groups.reduce((s, g) => s + g.raceCount, 0) ?? 0, [data]);
    const generatedDate = data ? new Date(data.generatedAt).toLocaleDateString() : '';
    const cmLabel = manifest?.datasets.find((d) => d.cmId === selectedCmId)?.cmLabel
        ?? data?.cmLabel
        ?? (selectedCmId?.toUpperCase() ?? '');
    if (loading) {
        return (
            <div className="p-4 text-center">
                <Spinner animation="border" /> Loading statistics...
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="warning" className="mt-4">
                <strong>Statistics not available.</strong> Run{' '}
                <code>yarn precompute</code> to generate them.
                <br />
                <small className="text-muted">{error}</small>
            </Alert>
        );
    }

    return (
        <div className="multirace-container">
            <div className="uma-page-header-row">
                <div className="mb-3 uma-page-header">
                    <strong>Room Match Statistics</strong>
                    {' | '}
                    {cmLabel}
                    {' | '}
                    {totalRaces} races
                    {' | '}
                    Updated {generatedDate}
                </div>
                <div className="uma-cm-selector">
                    <label className="uma-cm-label">
                        Dataset:
                        <select
                            className="uma-cm-select"
                            value={selectedCmId ?? ''}
                            onChange={(e) => selectCm(e.target.value)}
                        >
                            {manifest?.datasets.map((d) => (
                                <option key={d.cmId} value={d.cmId}>
                                    {d.trackSummary ? `${d.cmLabel} - ${d.trackSummary}` : d.cmLabel}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <StrategyPaletteControls
                    colorblindMode={colorblindMode}
                    onToggle={() => setColorblindMode((value) => !value)}
                    strategyColors={strategyColors}
                    strategyOrder={STRATEGY_DISPLAY_ORDER}
                    strategyNames={STRATEGY_NAMES}
                />
            </div>

            {trackGroups.map((group) => (
                <TrackGroupContent
                    key={`${selectedCmId ?? "unknown"}:${group.courseId}`}
                    group={group}
                    cmId={selectedCmId}
                    cmLabel={cmLabel}
                    section={section}
                    onSectionChange={handleSectionChange}
                    onViewReplaysForHorse={handleViewReplaysForHorse}
                    onFindReplaysForQuery={handleFindReplaysForQuery}
                    onEditAsQuery={handleEditAsQuery}
                    initialQuery={queryDraft}
                    scoreWinnersOnly={scoreWinnersOnly}
                    setScoreWinnersOnly={setScoreWinnersOnly}
                    totalRaces={totalRaces}
                    strategyColors={strategyColors}
                />
            ))}
        </div>
    );
};

export default UmaLogsPage;
