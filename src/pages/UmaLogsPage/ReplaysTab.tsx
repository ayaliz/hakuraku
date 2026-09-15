import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";

import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import {
    normalizeReplayTeamFilter,
    buildReplayExactBuildMemberFilter,
    type ReplayBootstrapPayload,
    type ReplayCharacterVariant,
    type ReplaySearchRequest,
    type ReplaySearchResponse,
    type ReplaySortDir,
    type ReplaySortKey,
    type ReplayScopedTeamFilter,
} from "./replaysShared";
import { buildReplaySearchRequest } from "./umaLogsQueryShared";
import RaceFilterRows from "../../features/umalogs/components/filters/RaceFilterRows";
import {
    createRaceFilter,
    removeRaceFilter as removeRaceFilterFromList,
    updateRaceFilter as updateRaceFilterInList,
    type ReplayRaceFilter,
} from "../../features/umalogs/model/raceFilters";
import { useLatestRequest } from "../../features/umalogs/api/latestRequest";
import {
    decodeReplayEntryQuerySpecParam,
    decodeReplayExactBuildParam,
    decodeReplayUqlParam,
    parseReplayCardId,
    readReplayEntryQuerySpec,
    readReplayExactBuildFilter,
    readReplayUqlFilter,
} from "../../features/umalogs/model/replayNavigation";
import ReplayResultsPanel, { REPLAY_RESULTS_PAGE_SIZE } from "./ReplayResultsPanel";
import ReplayTeamFilterEditor, {
    createEmptyMemberDraft,
    createTeamFilterDraft,
    type ScopedTeamDraft,
} from "./ReplayTeamFilterEditor";
import "./UmaLogsControls.css";
import "./ReplayTab.css";

type ReplaysTabProps = {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    strategyColors: Record<number, string>;
};


function buildReplaySearchUrl(cmId: string, courseId: number, apiBase: string) {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/replays/query`;
}

function buildReplayBootstrapUrl(cmId: string, courseId: number, apiBase: string) {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/replays/bootstrap`;
}

function variantLabel(variant: ReplayCharacterVariant): string {
    const charaName = UMDatabaseWrapper.charas[variant.charaId]?.name ?? `Chara ${variant.charaId}`;
    const cardName = UMDatabaseWrapper.cards[variant.cardId]?.name ?? charaName;
    return `${charaName}${cardName !== charaName ? ` [${cardName}]` : ""}`;
}

export default function ReplaysTab({ cmId, courseId, apiBase = "", strategyColors }: ReplaysTabProps) {
    const [searchParams] = useSearchParams();
    const resultsContainerRef = useRef<HTMLDivElement | null>(null);
    const autoRunKeyRef = useRef<string | null>(null);
    const [bootstrap, setBootstrap] = useState<ReplayBootstrapPayload | null>(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);

    const [teamFilterDrafts, setTeamFilterDrafts] = useState<ScopedTeamDraft[]>([]);
    const [raceFilters, setRaceFilters] = useState<ReplayRaceFilter[]>([]);

    const [queryLoading, setQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [results, setResults] = useState<ReplaySearchResponse | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastSubmittedRequest, setLastSubmittedRequest] = useState<Omit<ReplaySearchRequest, "limit" | "offset"> | null>(null);
    const [sortKey, setSortKey] = useState<ReplaySortKey>("date");
    const [sortDir, setSortDir] = useState<ReplaySortDir>("desc");
    const { runLatest: runLatestQuery, cancelLatest: cancelLatestQuery } = useLatestRequest();
    const { runLatest: runLatestBootstrap, cancelLatest: cancelLatestBootstrap } = useLatestRequest();

    const sortedVariants = useMemo(
        () => [...(bootstrap?.characterVariants ?? [])].sort((a, b) => b.count - a.count || variantLabel(a).localeCompare(variantLabel(b))),
        [bootstrap],
    );
    const skillVariants = bootstrap?.skillVariants ?? [];
    const supportCardVariants = bootstrap?.supportCardVariants ?? [];
    const requestedReplayCardId = parseReplayCardId(searchParams.get("replayCardId"));
    const requestedReplayBuildKey = searchParams.get("replayBuildKey");
    const requestedReplayBuildParam = searchParams.get("replayBuild");
    const requestedReplayUqlKey = searchParams.get("replayUqlKey");
    const requestedReplayUqlParam = searchParams.get("replayUql");
    const requestedReplayEntryQuerySpecKey = searchParams.get("replayEntryQuerySpecKey");
    const requestedReplayEntryQuerySpecParam = searchParams.get("replayEntryQuerySpec");
    const requestedReplayBuild = useMemo(
        () => decodeReplayExactBuildParam(requestedReplayBuildParam) ?? readReplayExactBuildFilter(requestedReplayBuildKey, sessionStorage),
        [requestedReplayBuildKey, requestedReplayBuildParam],
    );
    const requestedReplayUql = useMemo(
        () => decodeReplayUqlParam(requestedReplayUqlParam) ?? readReplayUqlFilter(requestedReplayUqlKey, sessionStorage),
        [requestedReplayUqlKey, requestedReplayUqlParam],
    );
    const requestedReplayEntryQuerySpec = useMemo(
        () => decodeReplayEntryQuerySpecParam(requestedReplayEntryQuerySpecParam) ?? readReplayEntryQuerySpec(requestedReplayEntryQuerySpecKey, sessionStorage),
        [requestedReplayEntryQuerySpecKey, requestedReplayEntryQuerySpecParam],
    );
    const shouldAutoRunReplayFilter = searchParams.get("replayAutoRun") === "1";
    const isExactBuildShortcut = requestedReplayBuild !== null && shouldAutoRunReplayFilter;

    useEffect(() => {
        cancelLatestBootstrap();
        cancelLatestQuery();
        setBootstrap(null);
        setBootstrapLoading(false);
        setBootstrapError(null);
        const requestedMember = requestedReplayBuild
            ? buildReplayExactBuildMemberFilter(requestedReplayBuild)
            : requestedReplayCardId ? {
                ...createEmptyMemberDraft(),
                cardId: requestedReplayCardId,
            } : null;
        setTeamFilterDrafts(requestedMember ? [createTeamFilterDraft("any", requestedMember)] : []);
        setRaceFilters([]);
        setResults(null);
        setQueryLoading(false);
        setQueryError(null);
        setCurrentPage(1);
        setLastSubmittedRequest(null);
        setSortKey("date");
        setSortDir("desc");
    }, [cancelLatestBootstrap, cancelLatestQuery, cmId, courseId, requestedReplayBuild, requestedReplayCardId, requestedReplayEntryQuerySpec, requestedReplayUql]);

    useEffect(() => {
        if (!cmId || !courseId) return;
        setBootstrapLoading(true);
        setBootstrapError(null);
        void runLatestBootstrap(async (signal) => {
            const response = await fetch(buildReplayBootstrapUrl(cmId, courseId, apiBase), { signal });
            if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
            return await response.json() as ReplayBootstrapPayload;
        }).then((outcome) => {
            if (outcome.status === "cancelled") return;
            if (outcome.status === "error") {
                setBootstrapError(outcome.error.message);
                setBootstrapLoading(false);
                return;
            }
            const json = outcome.value;
            setBootstrap({
                ...json,
                skillVariants: json.skillVariants.map((variant) => ({
                    ...variant,
                    skillName: UMDatabaseWrapper.skillNameWithEnglishFallback(variant.skillId),
                })),
                supportCardVariants: json.supportCardVariants.map((variant) => ({
                    ...variant,
                    name: UMDatabaseWrapper.supportCards[variant.supportCardId]?.name ?? variant.name,
                })),
            });
            setBootstrapLoading(false);
        });
        return cancelLatestBootstrap;
    }, [apiBase, cancelLatestBootstrap, cmId, courseId, runLatestBootstrap]);

    const executeQuery = useCallback((
        requestBase: Omit<ReplaySearchRequest, "limit" | "offset">,
        page: number,
        resetResults: boolean,
    ) => {
        if (!cmId || !courseId) return;

        const requestBody: ReplaySearchRequest = {
            ...requestBase,
            limit: REPLAY_RESULTS_PAGE_SIZE,
            offset: (page - 1) * REPLAY_RESULTS_PAGE_SIZE,
        };

        setQueryLoading(true);
        setQueryError(null);
        if (resetResults) setResults(null);

        void runLatestQuery(async (signal) => {
            const response = await fetch(buildReplaySearchUrl(cmId, courseId, apiBase), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(requestBody),
                signal,
            });
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return await response.json() as ReplaySearchResponse;
            }).then((outcome) => {
                if (outcome.status === "cancelled") return;
                if (outcome.status === "error") {
                    setQueryError(outcome.error.message);
                    setQueryLoading(false);
                    return;
                }
                const json = outcome.value;
                setResults(json);
                setCurrentPage(page);
                requestAnimationFrame(() => {
                    resultsContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
                });
                setQueryLoading(false);
            });
    }, [apiBase, cmId, courseId, runLatestQuery]);

    const runQuery = () => {
        if (!cmId || !courseId) return;

        const teamFilters = teamFilterDrafts
            .map((draft): ReplayScopedTeamFilter | null => {
                const normalized = normalizeReplayTeamFilter({ members: draft.members });
                return normalized ? { ...normalized, scope: draft.scope } : null;
            })
            .filter((team): team is ReplayScopedTeamFilter => team !== null);

        const requestBase = buildReplaySearchRequest(
            teamFilters,
            sortKey,
            sortDir,
            raceFilters,
            requestedReplayUql,
            requestedReplayEntryQuerySpec,
        );

        setLastSubmittedRequest(requestBase);
        executeQuery(requestBase, 1, true);
    };

    useEffect(() => {
        if (!cmId || !courseId || (!requestedReplayCardId && !requestedReplayBuild && !requestedReplayUql && !requestedReplayEntryQuerySpec) || !shouldAutoRunReplayFilter) return;
        const key = `${cmId}:${courseId}:${requestedReplayEntryQuerySpecParam ?? requestedReplayEntryQuerySpecKey ?? requestedReplayUqlParam ?? requestedReplayUqlKey ?? requestedReplayBuildKey ?? requestedReplayBuildParam ?? requestedReplayCardId}`;
        if (autoRunKeyRef.current === key) return;

        const requestedMember = requestedReplayUql || requestedReplayEntryQuerySpec
            ? null
            : requestedReplayBuild
                ? buildReplayExactBuildMemberFilter(requestedReplayBuild)
                : {
                    ...createEmptyMemberDraft(),
                    cardId: requestedReplayCardId,
                };
        const teamFilters: ReplayScopedTeamFilter[] = requestedMember
            ? [{ scope: "any", members: [requestedMember] }]
            : [];

        const requestBase = buildReplaySearchRequest(
            teamFilters,
            sortKey,
            sortDir,
            [],
            requestedReplayUql,
            requestedReplayEntryQuerySpec,
        );

        autoRunKeyRef.current = key;
        setLastSubmittedRequest(requestBase);
        executeQuery(requestBase, 1, true);
    }, [cmId, courseId, executeQuery, requestedReplayBuild, requestedReplayBuildKey, requestedReplayBuildParam, requestedReplayCardId, requestedReplayEntryQuerySpec, requestedReplayEntryQuerySpecKey, requestedReplayEntryQuerySpecParam, requestedReplayUql, requestedReplayUqlKey, requestedReplayUqlParam, shouldAutoRunReplayFilter, sortDir, sortKey]);

    const changePage = (page: number) => {
        if (!lastSubmittedRequest || queryLoading || page === currentPage || page < 1) return;
        executeQuery(lastSubmittedRequest, page, false);
    };

    const addRaceFilter = () => {
        setRaceFilters((previous) => [
            ...previous,
            createRaceFilter(`${Date.now()}-${Math.random()}`),
        ]);
    };

    const updateRaceFilter = (id: string, patch: Partial<ReplayRaceFilter>) => {
        setRaceFilters((previous) => updateRaceFilterInList(previous, id, patch));
    };

    const removeRaceFilter = (id: string) => {
        setRaceFilters((previous) => removeRaceFilterFromList(previous, id));
    };

    const toggleSortDir = () => setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));


    return (
        <div className="uma-replays-tab">
            <div className="uma-replays-filters">
                <div className="rpl-race-filter-section">
                    <div className="rpl-race-filter-header">
                        <strong>Race conditions</strong>
                        <button type="button" className="exp-add-btn" onClick={addRaceFilter}>+ Add condition</button>
                    </div>
                    <RaceFilterRows filters={raceFilters} onUpdate={updateRaceFilter} onRemove={removeRaceFilter} />
                </div>

                <ReplayTeamFilterEditor
                    drafts={teamFilterDrafts}
                    setDrafts={setTeamFilterDrafts}
                    characterVariants={sortedVariants}
                    skillVariants={skillVariants}
                    supportCardVariants={supportCardVariants}
                    allowAddTeam={!isExactBuildShortcut}
                    emptyMessage={requestedReplayUql || requestedReplayEntryQuerySpec
                        ? "Query filter active. Add a team to narrow it further."
                        : "Add a team to start filtering replays by lineup."}
                    notices={(
                        <>
                            {requestedReplayUql && (
                                <div className="rpl-exact-build-note">
                                    Written query filter active: <code>{requestedReplayUql}</code>
                                </div>
                            )}
                            {requestedReplayEntryQuerySpec && (
                                <div className="rpl-exact-build-note">
                                    Query filter active.
                                </div>
                            )}
                            {teamFilterDrafts.some((team) => team.members.some((member) => member.requirements.length > 0)) && isExactBuildShortcut && (
                                <div className="rpl-exact-build-note">
                                    Exact build filter active: stats, rank, career wins, deck, and learned skills.
                                </div>
                            )}
                        </>
                    )}
                />

                <div className="uma-replays-actions">
                    <Button onClick={runQuery} disabled={!cmId || !courseId || bootstrapLoading || queryLoading}>
                        {queryLoading ? "Running..." : "Run Replay Query"}
                    </Button>
                    {bootstrap && <span className="text-muted">{bootstrap.totalRaces.toLocaleString()} indexed replays available</span>}
                </div>
            </div>

            {bootstrapLoading && <div className="p-4 text-center"><Spinner animation="border" /> Loading replay filters...</div>}
            {bootstrapError && <Alert variant="warning">{bootstrapError}</Alert>}
            {queryError && <Alert variant="warning">{queryError}</Alert>}

            <ReplayResultsPanel
                results={results}
                currentPage={currentPage}
                queryLoading={queryLoading}
                sortKey={sortKey}
                sortDir={sortDir}
                strategyColors={strategyColors}
                containerRef={resultsContainerRef}
                onPageChange={changePage}
                onSortKeyChange={setSortKey}
                onSortDirectionToggle={toggleSortDir}
            />
        </div>
    );
}
