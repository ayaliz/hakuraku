import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";

import PaginationControls from "../../components/PaginationControls";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { STYLE_BREAKDOWN_STRATEGY_ORDER, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import {
    SUPPORT_CARD_LB_ANY,
    defaultStatValueForProperty,
    type CharacterRequirement,
    type FilterProperty,
    type RequirementTruthMode,
    type SkillFilterMode,
    type SkillVariant,
    type SupportCardVariant,
} from "./explorerShared";
import {
    normalizeReplayTeamFilter,
    buildReplayExactBuildMemberFilter,
    type ReplayBootstrapPayload,
    type ReplayCharacterVariant,
    type ReplayExactBuildFilter,
    type ReplayRaceFilter,
    type ReplayRaceFilterField,
    type ReplaySearchRequest,
    type ReplaySearchResponse,
    type ReplaySortDir,
    type ReplaySortKey,
    type ReplayScopedTeamFilter,
    type ReplayTeamFilter,
    type ReplayTeamFilterScope,
    type ReplayTeamMemberFilter,
} from "./replaysShared";
import { buildReplaySearchRequest, validateUmaLogsQuerySpec, type UmaLogsQuerySpec } from "./umaLogsQueryShared";
import { ReplayCharaSelect, ReplaySkillSelect, ReplaySupportCardSelect } from "./ReplaySelects";
import { ReplayResultLineup } from "./ReplayResultDisplay";

type ReplaysTabProps = {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    strategyColors: Record<number, string>;
};

type TeamDraft = ReplayTeamMemberFilter[];

type ScopedTeamDraft = {
    id: string;
    scope: ReplayTeamFilterScope;
    members: TeamDraft;
};

type ReplayFilterProperty = Exclude<FilterProperty, "deckRaceBonus">;

const PROPERTY_LABELS: Record<ReplayFilterProperty, string> = {
    none: "—",
    speed: "Speed",
    stamina: "Stamina",
    pow: "Power",
    guts: "Guts",
    wiz: "Wit",
    aptGround: "Aptitude (Ground)",
    aptDistance: "Aptitude (Distance)",
    aptStyle: "Aptitude (Style)",
    totalSkillPoints: "Skill pts",
    rankScore: "Score",
    careerWinCount: "Career wins",
    isDebuffer: "Is Debuffer",
    skill: "Skill",
    supportCard: "Support card",
};
const PROPERTY_OPTIONS = Object.keys(PROPERTY_LABELS) as ReplayFilterProperty[];
const RACE_FILTER_FIELDS: Array<{ value: ReplayRaceFilterField; label: string }> = [
    { value: "room_runaway_count", label: "Room Runaways" },
    { value: "room_front_count", label: "Room Front Runners" },
    { value: "room_pace_count", label: "Room Pace Chasers" },
    { value: "room_late_count", label: "Room Late Surgers" },
    { value: "room_end_count", label: "Room End Closers" },
    { value: "room_debuffer_count", label: "Room Debuffers" },
];

const SUPPORT_CARD_LB_OPTIONS = [
    { value: SUPPORT_CARD_LB_ANY, label: "Any" },
    { value: 0, label: "0LB" },
    { value: 1, label: "1LB" },
    { value: 2, label: "2LB" },
    { value: 3, label: "3LB" },
    { value: 4, label: "MLB" },
] as const;

const STRATEGY_PILL_ORDER = STYLE_BREAKDOWN_STRATEGY_ORDER;
const REPLAY_RESULTS_PAGE_SIZE = 20;

function createDefaultRequirement(skillVariants: SkillVariant[], supportCardVariants: SupportCardVariant[]): CharacterRequirement {
    return {
        id: `${Date.now()}-${Math.random()}`,
        truthMode: "require",
        property: "none",
        statOp: ">",
        statValue: defaultStatValueForProperty("none"),
        skillId: skillVariants[0]?.skillId ?? null,
        skillMode: "learned",
        supportCardId: supportCardVariants[0]?.supportCardId ?? null,
        supportCardPresent: true,
        supportCardLb: SUPPORT_CARD_LB_ANY,
    };
}

function createEmptyMemberDraft(): ReplayTeamMemberFilter {
    return { characterMatchMode: "is", cardId: null, strategy: null, requirements: [] };
}

function createTeamFilterDraft(scope: ReplayTeamFilterScope = "any", member?: ReplayTeamMemberFilter): ScopedTeamDraft {
    return {
        id: `${Date.now()}-${Math.random()}`,
        scope,
        members: [member ?? createEmptyMemberDraft()],
    };
}

function parsePositiveIntParam(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeReplayExactBuildFilter(parsed: Partial<ReplayExactBuildFilter>): ReplayExactBuildFilter | null {
    const cardId = Number(parsed.cardId);
    const strategy = Number(parsed.strategy);
    if (!Number.isFinite(cardId) || cardId <= 0) return null;
    const legacyDebufferStrategy = Number.isFinite(strategy) && strategy === 6;
    const normalizedStrategy = Number.isFinite(strategy) && strategy >= 1 && strategy <= 5
        ? Math.floor(strategy)
        : null;
    return {
        cardId: Math.floor(cardId),
        strategy: normalizedStrategy,
        isDebuffer: parsed.isDebuffer === true || legacyDebufferStrategy,
        speed: Number(parsed.speed) || 0,
        stamina: Number(parsed.stamina) || 0,
        pow: Number(parsed.pow) || 0,
        guts: Number(parsed.guts) || 0,
        wiz: Number(parsed.wiz) || 0,
        rankScore: Number(parsed.rankScore) || 0,
        careerWinCount: Number(parsed.careerWinCount) || 0,
        supportCardIds: Array.isArray(parsed.supportCardIds) ? parsed.supportCardIds.map(Number).filter(Number.isFinite) : [],
        supportCardLimitBreaks: Array.isArray(parsed.supportCardLimitBreaks) ? parsed.supportCardLimitBreaks.map(Number).filter(Number.isFinite) : [],
        learnedSkillIds: Array.isArray(parsed.learnedSkillIds) ? parsed.learnedSkillIds.map(Number).filter(Number.isFinite) : [],
    };
}

function decodeReplayExactBuildParam(value: string | null): ReplayExactBuildFilter | null {
    if (!value) return null;
    try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
        return normalizeReplayExactBuildFilter(JSON.parse(atob(padded)) as Partial<ReplayExactBuildFilter>);
    } catch {
        return null;
    }
}

function readReplayExactBuildFilter(key: string | null): ReplayExactBuildFilter | null {
    if (!key) return null;
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return normalizeReplayExactBuildFilter(JSON.parse(raw) as Partial<ReplayExactBuildFilter>);
    } catch {
        return null;
    }
}

function readReplayUqlFilter(key: string | null): string | null {
    if (!key) return null;
    const value = sessionStorage.getItem(key)?.trim() ?? "";
    return value.length > 0 && value.length <= 2000 ? value : null;
}

function decodeReplayUqlParam(value: string | null): string | null {
    if (!value) return null;
    try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
        const binary = atob(padded);
        const decoded = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))).trim();
        return decoded.length > 0 && decoded.length <= 2000 ? decoded : null;
    } catch {
        return null;
    }
}

function normalizeReplayEntryQuerySpec(input: unknown): UmaLogsQuerySpec | null {
    const result = validateUmaLogsQuerySpec(input, "entries");
    return result.ok ? result.spec : null;
}

function readReplayEntryQuerySpec(key: string | null): UmaLogsQuerySpec | null {
    if (!key) return null;
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? normalizeReplayEntryQuerySpec(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

function decodeReplayEntryQuerySpecParam(value: string | null): UmaLogsQuerySpec | null {
    if (!value) return null;
    try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
        const binary = atob(padded);
        const decoded = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
        return normalizeReplayEntryQuerySpec(JSON.parse(decoded));
    } catch {
        return null;
    }
}

function buildReplaySearchUrl(cmId: string, courseId: number, apiBase: string) {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/replays/query`;
}

function buildReplayBootstrapUrl(cmId: string, courseId: number, apiBase: string) {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/replays/bootstrap`;
}

function toRaceRouteId(raceUid: string): string {
    const lastSegment = raceUid.split("/").pop() ?? raceUid;
    return lastSegment.endsWith(".json") ? lastSegment.slice(0, -5) : lastSegment;
}

function variantLabel(variant: ReplayCharacterVariant): string {
    const charaName = UMDatabaseWrapper.charas[variant.charaId]?.name ?? `Chara ${variant.charaId}`;
    const cardName = UMDatabaseWrapper.cards[variant.cardId]?.name ?? charaName;
    return `${charaName}${cardName !== charaName ? ` [${cardName}]` : ""}`;
}

function formatFinishTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00.00";
    const minutes = Math.floor(seconds / 60);
    const secs = seconds - minutes * 60;
    return `${minutes}:${secs.toFixed(2).padStart(5, "0")}`;
}

function normalizeTeamDraft(teamDraft: TeamDraft): ReplayTeamFilter | null {
    return normalizeReplayTeamFilter({ members: teamDraft });
}

export default function ReplaysTab({ cmId, courseId, apiBase = "", strategyColors }: ReplaysTabProps) {
    const navigate = useNavigate();
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

    const sortedVariants = useMemo(
        () => [...(bootstrap?.characterVariants ?? [])].sort((a, b) => b.count - a.count || variantLabel(a).localeCompare(variantLabel(b))),
        [bootstrap],
    );
    const skillVariants = bootstrap?.skillVariants ?? [];
    const supportCardVariants = bootstrap?.supportCardVariants ?? [];
    const requestedReplayCardId = parsePositiveIntParam(searchParams.get("replayCardId"));
    const requestedReplayBuildKey = searchParams.get("replayBuildKey");
    const requestedReplayBuildParam = searchParams.get("replayBuild");
    const requestedReplayUqlKey = searchParams.get("replayUqlKey");
    const requestedReplayUqlParam = searchParams.get("replayUql");
    const requestedReplayEntryQuerySpecKey = searchParams.get("replayEntryQuerySpecKey");
    const requestedReplayEntryQuerySpecParam = searchParams.get("replayEntryQuerySpec");
    const requestedReplayBuild = useMemo(
        () => decodeReplayExactBuildParam(requestedReplayBuildParam) ?? readReplayExactBuildFilter(requestedReplayBuildKey),
        [requestedReplayBuildKey, requestedReplayBuildParam],
    );
    const requestedReplayUql = useMemo(
        () => decodeReplayUqlParam(requestedReplayUqlParam) ?? readReplayUqlFilter(requestedReplayUqlKey),
        [requestedReplayUqlKey, requestedReplayUqlParam],
    );
    const requestedReplayEntryQuerySpec = useMemo(
        () => decodeReplayEntryQuerySpecParam(requestedReplayEntryQuerySpecParam) ?? readReplayEntryQuerySpec(requestedReplayEntryQuerySpecKey),
        [requestedReplayEntryQuerySpecKey, requestedReplayEntryQuerySpecParam],
    );
    const shouldAutoRunReplayFilter = searchParams.get("replayAutoRun") === "1";
    const isExactBuildShortcut = requestedReplayBuild !== null && shouldAutoRunReplayFilter;

    useEffect(() => {
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
        setCurrentPage(1);
        setLastSubmittedRequest(null);
        setSortKey("date");
        setSortDir("desc");
    }, [cmId, courseId, requestedReplayBuild, requestedReplayCardId, requestedReplayEntryQuerySpec, requestedReplayUql]);

    useEffect(() => {
        if (!cmId || !courseId) return;
        const controller = new AbortController();
        setBootstrapLoading(true);
        setBootstrapError(null);
        fetch(buildReplayBootstrapUrl(cmId, courseId, apiBase), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return response.json() as Promise<ReplayBootstrapPayload>;
            })
            .then((json) => {
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
            })
            .catch((error: Error) => {
                if (error.name === "AbortError") return;
                setBootstrapError(error.message);
                setBootstrapLoading(false);
            });
        return () => controller.abort();
    }, [apiBase, cmId, courseId]);

    const executeQuery = (
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

        fetch(buildReplaySearchUrl(cmId, courseId, apiBase), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return response.json() as Promise<ReplaySearchResponse>;
            })
            .then((json) => {
                setResults(json);
                setCurrentPage(page);
                requestAnimationFrame(() => {
                    resultsContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
                });
                setQueryLoading(false);
            })
            .catch((error: Error) => {
                setQueryError(error.message);
                setQueryLoading(false);
            });
    };

    const runQuery = () => {
        if (!cmId || !courseId) return;

        const teamFilters = teamFilterDrafts
            .map((draft): ReplayScopedTeamFilter | null => {
                const normalized = normalizeTeamDraft(draft.members);
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

    const addTeamFilter = () => {
        setTeamFilterDrafts((previous) => [...previous, createTeamFilterDraft()]);
    };

    const addRaceFilter = () => {
        setRaceFilters((previous) => [...previous, {
            id: `${Date.now()}-${Math.random()}`,
            field: "room_front_count",
            operator: "=",
            value: 0,
        }]);
    };

    const updateRaceFilter = (id: string, patch: Partial<ReplayRaceFilter>) => {
        setRaceFilters((previous) => previous.map((filter) => filter.id === id ? { ...filter, ...patch } : filter));
    };

    const removeRaceFilter = (id: string) => {
        setRaceFilters((previous) => previous.filter((filter) => filter.id !== id));
    };

    const removeTeamFilter = (teamId: string) => {
        setTeamFilterDrafts((previous) => previous.filter((team) => team.id !== teamId));
    };

    const updateTeamFilterScope = (teamId: string, scope: ReplayTeamFilterScope) => {
        setTeamFilterDrafts((previous) => previous.map((team) => (
            team.id === teamId ? { ...team, scope } : team
        )));
    };

    const updateTeamMember = (teamId: string, index: number, patch: Partial<ReplayTeamMemberFilter>) => {
        setTeamFilterDrafts((previous) => previous.map((team) => {
            if (team.id !== teamId) return team;
            return {
                ...team,
                members: team.members.map((member, memberIndex) => (
                    memberIndex === index ? { ...member, ...patch } : member
                )),
            };
        }));
    };

    const addTeamMember = (teamId: string) => {
        setTeamFilterDrafts((previous) => previous.map((team) => {
            if (team.id !== teamId || team.members.length >= 3) return team;
            return { ...team, members: [...team.members, createEmptyMemberDraft()] };
        }));
    };

    const removeTeamMember = (teamId: string, index: number) => {
        setTeamFilterDrafts((previous) => previous.map((team) => {
            if (team.id !== teamId || team.members.length <= 1) return team;
            return { ...team, members: team.members.filter((_, memberIndex) => memberIndex !== index) };
        }));
    };

    const addTeamMemberRequirement = (teamId: string, index: number) => {
        setTeamFilterDrafts((previous) => previous.map((team) => {
            if (team.id !== teamId) return team;
            return {
                ...team,
                members: team.members.map((member, memberIndex) => (
                    memberIndex === index
                        ? { ...member, requirements: [...member.requirements, createDefaultRequirement(skillVariants, supportCardVariants)] }
                        : member
                )),
            };
        }));
    };

    const updateTeamMemberRequirement = (
        teamId: string,
        index: number,
        requirementId: string,
        patch: Partial<CharacterRequirement>,
    ) => {
        setTeamFilterDrafts((previous) => previous.map((team) => {
            if (team.id !== teamId) return team;
            return {
                ...team,
                members: team.members.map((member, memberIndex) => {
                    if (memberIndex !== index) return member;
                    return {
                        ...member,
                        requirements: member.requirements.map((requirement) => {
                            if (requirement.id !== requirementId) return requirement;
                            const next = { ...requirement, ...patch };
                            if (patch.property !== undefined) {
                                next.statValue = defaultStatValueForProperty(patch.property);
                                if (patch.property === "skill" && next.skillId === null)
                                    next.skillId = skillVariants[0]?.skillId ?? null;
                                if (patch.property === "supportCard" && next.supportCardId === null) {
                                    next.supportCardId = supportCardVariants[0]?.supportCardId ?? null;
                                    next.supportCardLb = SUPPORT_CARD_LB_ANY;
                                }
                            }
                            return next;
                        }),
                    };
                }),
            };
        }));
    };

    const removeTeamMemberRequirement = (teamId: string, index: number, requirementId: string) => {
        setTeamFilterDrafts((previous) => previous.map((team) => {
            if (team.id !== teamId) return team;
            return {
                ...team,
                members: team.members.map((member, memberIndex) => (
                    memberIndex === index
                        ? { ...member, requirements: member.requirements.filter((requirement) => requirement.id !== requirementId) }
                        : member
                )),
            };
        }));
    };

    const renderRequirementRow = (
        requirement: CharacterRequirement,
        onUpdate: (patch: Partial<CharacterRequirement>) => void,
        onRemove: () => void,
    ) => (
        <div key={requirement.id} className="exp-condition-row exp-condition-row--feature">
            <select
                className="exp-select"
                value={requirement.truthMode}
                onChange={(event) => onUpdate({ truthMode: event.target.value as RequirementTruthMode })}
            >
                <option value="require">requires</option>
                <option value="requireNot">requires not</option>
            </select>
            <select
                className="exp-select"
                value={requirement.property}
                onChange={(event) => onUpdate({ property: event.target.value as FilterProperty })}
            >
                {PROPERTY_OPTIONS.map((property) => (
                    <option key={property} value={property}>{PROPERTY_LABELS[property]}</option>
                ))}
            </select>

            {requirement.property !== "none" && requirement.property !== "skill" && requirement.property !== "supportCard" && requirement.property !== "isDebuffer" && (
                <>
                    <div className="exp-toggle">
                        <button type="button" className={`exp-toggle-btn${requirement.statOp === ">" ? " active" : ""}`} onClick={() => onUpdate({ statOp: ">" })}>{">"}</button>
                        <button type="button" className={`exp-toggle-btn${requirement.statOp === "=" ? " active" : ""}`} onClick={() => onUpdate({ statOp: "=" })}>=</button>
                        <button type="button" className={`exp-toggle-btn${requirement.statOp === "<" ? " active" : ""}`} onClick={() => onUpdate({ statOp: "<" })}>&lt;</button>
                    </div>
                    <input
                        type="number"
                        className="exp-stat-input"
                        value={requirement.statValue}
                        min={0}
                        onChange={(event) => onUpdate({ statValue: Number(event.target.value) || 0 })}
                    />
                </>
            )}

            {requirement.property === "skill" && (
                <>
                    <select
                        className="exp-select exp-select--wide"
                        value={requirement.skillMode}
                        onChange={(event) => onUpdate({ skillMode: event.target.value as SkillFilterMode })}
                    >
                        <option value="learned">learned</option>
                        <option value="activated">activated</option>
                    </select>
                    <ReplaySkillSelect variants={skillVariants} value={requirement.skillId} onChange={(skillId) => onUpdate({ skillId })} />
                </>
            )}

            {requirement.property === "supportCard" && (
                <>
                    <div className="exp-toggle">
                        <button type="button" className={`exp-toggle-btn${requirement.supportCardPresent ? " active" : ""}`} onClick={() => onUpdate({ supportCardPresent: true })}>used</button>
                        <button type="button" className={`exp-toggle-btn${!requirement.supportCardPresent ? " active" : ""}`} onClick={() => onUpdate({ supportCardPresent: false })}>not used</button>
                    </div>
                    <ReplaySupportCardSelect variants={supportCardVariants} value={requirement.supportCardId} onChange={(supportCardId) => onUpdate({ supportCardId })} />
                    <select
                        className="exp-select"
                        value={requirement.supportCardLb}
                        onChange={(event) => onUpdate({ supportCardLb: Number(event.target.value) })}
                    >
                        {SUPPORT_CARD_LB_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </>
            )}

            <button type="button" className="exp-remove-btn" onClick={onRemove}>×</button>
        </div>
    );

    const renderTeamMember = (team: ScopedTeamDraft, member: ReplayTeamMemberFilter, index: number) => (
        <div className="rpl-team-member" key={`${team.id}-${index}`}>
            <div className="exp-feature-header">
                <span className="exp-feature-label">Character {index + 1}</span>
                <div className="exp-toggle">
                    <button type="button" className={`exp-toggle-btn${member.characterMatchMode === "is" ? " active" : ""}`} onClick={() => updateTeamMember(team.id, index, { characterMatchMode: "is" })}>is</button>
                    <button type="button" className={`exp-toggle-btn${member.characterMatchMode === "isNot" ? " active" : ""}`} onClick={() => updateTeamMember(team.id, index, { characterMatchMode: "isNot" })}>is not</button>
                </div>
                <ReplayCharaSelect variants={sortedVariants} value={member.cardId} onChange={(cardId) => updateTeamMember(team.id, index, { cardId })} />
                <span className="exp-as-label">as</span>
                <select
                    className="exp-select"
                    value={member.strategy ?? ""}
                    onChange={(event) => updateTeamMember(team.id, index, { strategy: event.target.value === "" ? null : Number(event.target.value) })}
                >
                    <option value="">any style</option>
                    {STRATEGY_PILL_ORDER.map((strategy) => (
                        <option key={strategy} value={strategy}>{STRATEGY_NAMES[strategy]}</option>
                    ))}
                </select>
                {team.members.length > 1 && (
                    <button type="button" className="exp-remove-btn" onClick={() => removeTeamMember(team.id, index)}>x</button>
                )}
            </div>
            {member.requirements.length > 0 && (
                <div className="exp-feature-reqs">
                    {member.requirements.map((requirement) => renderRequirementRow(
                        requirement,
                        (patch) => updateTeamMemberRequirement(team.id, index, requirement.id, patch),
                        () => removeTeamMemberRequirement(team.id, index, requirement.id),
                    ))}
                </div>
            )}
            <button type="button" className="exp-add-btn" onClick={() => addTeamMemberRequirement(team.id, index)}>
                + Add requirement
            </button>
        </div>
    );

    const renderTeamFilter = (team: ScopedTeamDraft, index: number) => (
        <div className="uma-replays-filter-card rpl-team-filter-card" key={team.id}>
            <div className="rpl-team-filter-head">
                <h5>Team {index + 1}</h5>
                <button type="button" className="rpl-team-remove-btn" onClick={() => removeTeamFilter(team.id)}>Remove</button>
            </div>
            <div className="rpl-team-scope-toggle" role="group" aria-label={`Team ${index + 1} scope`}>
                {([
                    { value: "any", label: "Any team" },
                    { value: "winner", label: "Winning team" },
                    { value: "loser", label: "Losing team" },
                ] as const).map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`rpl-team-scope-btn${team.scope === option.value ? " active" : ""}`}
                        onClick={() => updateTeamFilterScope(team.id, option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <div className="rpl-team-members">
                {team.members.map((member, memberIndex) => renderTeamMember(team, member, memberIndex))}
            </div>
            {team.members.length < 3 && (
                <button type="button" className="exp-add-btn rpl-add-character-btn" onClick={() => addTeamMember(team.id)}>
                    + Add character
                </button>
            )}
        </div>
    );

    const toggleSortDir = () => setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));

    const openReplayRoute = (raceUid: string, inNewTab = false) => {
        const route = `/racedata/${encodeURIComponent(toRaceRouteId(raceUid))}`;
        if (inNewTab) {
            window.open(route, "_blank", "noopener,noreferrer");
            return;
        }
        navigate(route);
    };

    return (
        <div className="uma-replays-tab">
            <div className="uma-replays-filters">
                <div className="rpl-race-filter-section">
                    <div className="rpl-race-filter-header">
                        <strong>Race conditions</strong>
                        <button type="button" className="exp-add-btn" onClick={addRaceFilter}>+ Add condition</button>
                    </div>
                    {raceFilters.length === 0 ? (
                        <div className="rpl-empty-team-filters">No race-wide conditions.</div>
                    ) : (
                        <div className="rpl-race-filter-list">
                            {raceFilters.map((filter) => (
                                <div key={filter.id} className="rpl-race-filter-row">
                                    <select
                                        className="exp-select"
                                        value={filter.field}
                                        onChange={(event) => updateRaceFilter(filter.id, { field: event.target.value as ReplayRaceFilterField })}
                                    >
                                        {RACE_FILTER_FIELDS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="exp-select rpl-race-filter-operator"
                                        value={filter.operator}
                                        onChange={(event) => updateRaceFilter(filter.id, { operator: event.target.value as ReplayRaceFilter["operator"] })}
                                    >
                                        <option value="=">=</option>
                                        <option value="<=">&lt;=</option>
                                        <option value=">=">&gt;=</option>
                                    </select>
                                    <input
                                        className="exp-stat-input rpl-race-filter-value"
                                        type="number"
                                        min={0}
                                        value={filter.value}
                                        onChange={(event) => updateRaceFilter(filter.id, { value: Math.max(0, Number(event.target.value) || 0) })}
                                    />
                                    <button type="button" className="exp-remove-btn" onClick={() => removeRaceFilter(filter.id)}>x</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rpl-team-filter-toolbar" hidden={isExactBuildShortcut}>
                    <button type="button" className="rpl-add-team-btn" onClick={addTeamFilter}>
                        + Add team
                    </button>
                </div>

                {teamFilterDrafts.length === 0 && !isExactBuildShortcut && (
                    <div className="rpl-empty-team-filters">
                        {requestedReplayUql || requestedReplayEntryQuerySpec ? "Query filter active. Add a team to narrow it further." : "Add a team to start filtering replays by lineup."}
                    </div>
                )}

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

                {teamFilterDrafts.length > 0 && (
                    <div className="uma-replays-filter-grid rpl-grid-teams">
                        {teamFilterDrafts.map((team, index) => renderTeamFilter(team, index))}
                    </div>
                )}

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

            <div className="uma-replays-layout">
                <div ref={resultsContainerRef} className="uma-replays-results">
                    <div className="uma-replays-results-header">
                        <div className="uma-replays-results-header-top">
                            <strong>Results</strong>
                            {results && results.total > REPLAY_RESULTS_PAGE_SIZE && (
                                <PaginationControls
                                    currentPage={currentPage}
                                    totalItems={results.total}
                                    pageSize={REPLAY_RESULTS_PAGE_SIZE}
                                    disabled={queryLoading}
                                    showSummary={false}
                                    className="pagination-controls--header pagination-controls--compact"
                                    onPageChange={changePage}
                                />
                            )}
                        </div>
                        <div className="uma-replays-results-header-meta">
                            <div className="uma-replays-sort-controls">
                                <label className="uma-replays-sort-label">
                                    Sort by
                                    <select
                                        className="uma-replays-sort-select"
                                        value={sortKey}
                                        onChange={(event) => setSortKey(event.target.value as ReplaySortKey)}
                                    >
                                        <option value="finishTime">Finish time</option>
                                        <option value="date">Date</option>
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    className="uma-replays-sort-dir-btn"
                                    onClick={toggleSortDir}
                                    title={sortDir === "desc" ? "Descending" : "Ascending"}
                                >
                                    {sortDir === "desc" ? "Desc" : "Asc"}
                                </button>
                            </div>
                            <span>{results ? `${results.total.toLocaleString()} match(es)` : "No query run yet"}</span>
                        </div>
                    </div>
                    <div className="uma-replays-results-body">
                        {!results && !queryLoading && (
                            <div className="uma-replays-placeholder">
                                Set your replay filters, then click <strong>Run Replay Query</strong>.
                            </div>
                        )}
                        {results && results.races.length === 0 && (
                            <div className="uma-replays-placeholder">No races matched the current replay filter.</div>
                        )}
                        {results?.races.map((row) => (
                            <div
                                key={row.raceUid}
                                className="uma-replays-result-row"
                                role="button"
                                tabIndex={0}
                                onClick={(event) => openReplayRoute(row.raceUid, event.ctrlKey || event.metaKey)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        openReplayRoute(row.raceUid, false);
                                    }
                                }}
                            >
                                <div className="uma-replays-result-head">
                                    <div className="uma-replays-result-subtitle">
                                        Room R{row.roomRunawayCount}/F{row.roomFrontCount}/P{row.roomPaceCount}/L{row.roomLateCount}/E{row.roomEndCount}
                                    </div>
                                    <div className="uma-replays-result-meta">
                                        <span className="uma-replays-result-time">{formatFinishTime(row.finishTime)}</span>
                                        <button
                                            type="button"
                                            className="uma-replays-open-tab-btn"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                openReplayRoute(row.raceUid, true);
                                            }}
                                            title="Open replay in new tab"
                                        >
                                            Open
                                        </button>
                                    </div>
                                </div>
                                <ReplayResultLineup
                                    winnerTeam={row.winnerTeam}
                                    enemyTeams={row.enemyTeams}
                                    winnerCardId={row.winnerCardId}
                                    winnerStrategy={row.winnerStrategy}
                                    strategyColors={strategyColors}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
