import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

import PaginationControls from "../../components/PaginationControls";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
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
    normalizeReplayCharacterFilter,
    normalizeReplayTeamFilter,
    type ReplayBootstrapPayload,
    type ReplayCharacterVariant,
    type ReplayCountFilter,
    type ReplaySearchRequest,
    type ReplaySearchResponse,
    type ReplayTeamFilter,
    type ReplayTeamMemberFilter,
} from "./replaysShared";
import { ReplayCharaSelect, ReplaySkillSelect, ReplaySupportCardSelect } from "./ReplaySelects";
import { ReplayResultLineup } from "./ReplayResultDisplay";

type ReplayFilterOp = "" | "=" | ">" | ">=" | "<" | "<=";
type RoomFilterOp = "" | "=" | ">" | "<";
type ReplaySortKey = "finishTime" | "date";
type ReplaySortDir = "asc" | "desc";

type ReplayCountDraft = {
    op: RoomFilterOp;
    value: number;
};

type ReplaysTabProps = {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    strategyColors: Record<number, string>;
};

type TeamDraft = ReplayTeamMemberFilter[];
type TeamSectionKey = "composition" | "enemy1" | "enemy2";

const PROPERTY_LABELS: Record<FilterProperty, string> = {
    none: "—",
    speed: "Speed",
    stamina: "Stamina",
    pow: "Power",
    guts: "Guts",
    wiz: "Wit",
    totalSkillPoints: "Skill pts",
    rankScore: "Score",
    careerWinCount: "Career wins",
    deckRaceBonus: "Deck race bonus",
    skill: "Skill",
    supportCard: "Support card",
};

const SUPPORT_CARD_LB_OPTIONS = [
    { value: SUPPORT_CARD_LB_ANY, label: "Any" },
    { value: 0, label: "0LB" },
    { value: 1, label: "1LB" },
    { value: 2, label: "2LB" },
    { value: 3, label: "3LB" },
    { value: 4, label: "MLB" },
] as const;

const STRATEGY_PILL_ORDER = [5, 1, 2, 3, 4] as const;
const REPLAY_RESULTS_PAGE_SIZE = 20;

const OP_BUTTONS: Array<{ value: ReplayFilterOp; label: string; title: string }> = [
    { value: "", label: "—", title: "Ignore" },
    { value: "=", label: "=", title: "Exactly" },
    { value: ">=", label: "≥", title: "At least" },
    { value: ">", label: ">", title: "More than" },
    { value: "<=", label: "≤", title: "At most" },
    { value: "<", label: "<", title: "Fewer than" },
];

const ROOM_OP_BUTTONS: Array<{ value: Exclude<RoomFilterOp, "">; label: string; title: string }> = OP_BUTTONS
    .filter((op): op is { value: Exclude<RoomFilterOp, "">; label: string; title: string } =>
        op.value === ">" || op.value === "=" || op.value === "<");

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

function createEmptyTeamDraft(size = 3): TeamDraft {
    return Array.from({ length: size }, () => createEmptyMemberDraft());
}

function normalizeCountFilter(draft: ReplayCountDraft): ReplayCountFilter | null {
    if (!draft.op) return null;
    return { op: draft.op, value: Math.max(0, Math.floor(draft.value)) };
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

function normalizeWinningTeamDraft(
    winnerDraft: ReplayTeamMemberFilter,
    teammateDraft: TeamDraft,
): ReplayTeamFilter | null {
    return normalizeReplayTeamFilter({ members: [winnerDraft, ...teammateDraft] });
}

function RoomCountRow({
    label,
    color,
    draft,
    setter,
}: {
    label: string;
    color: string;
    draft: ReplayCountDraft;
    setter: React.Dispatch<React.SetStateAction<ReplayCountDraft>>;
}) {
    return (
        <div className="rpl-room-row">
            <span className="rpl-room-label">
                <span className="rpl-room-dot" style={{ background: color }} />
                {label}
            </span>
            <div className="rpl-op-btns">
                {ROOM_OP_BUTTONS.map((op) => (
                    <button
                        key={op.value}
                        type="button"
                        title={op.title}
                        className={`rpl-op-btn${draft.op === op.value ? " active" : ""}`}
                        onClick={() => setter((prev) => ({
                            ...prev,
                            op: prev.op === op.value ? "" : op.value,
                        }))}
                    >
                        {op.label}
                    </button>
                ))}
            </div>
            <input
                type="number"
                className="rpl-room-value"
                min={0}
                max={9}
                value={draft.value}
                disabled={!draft.op}
                onChange={(e) => setter((prev) => ({ ...prev, value: Number(e.target.value) || 0 }))}
            />
        </div>
    );
}

export default function ReplaysTab({ cmId, courseId, apiBase = "", strategyColors }: ReplaysTabProps) {
    const navigate = useNavigate();
    const resultsContainerRef = useRef<HTMLDivElement | null>(null);
    const [bootstrap, setBootstrap] = useState<ReplayBootstrapPayload | null>(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);

    const [winnerDraft, setWinnerDraft] = useState<ReplayTeamMemberFilter>(createEmptyMemberDraft);
    const [roomRunaway, setRoomRunaway] = useState<ReplayCountDraft>({ op: "", value: 0 });
    const [roomFront, setRoomFront] = useState<ReplayCountDraft>({ op: "", value: 0 });
    const [roomPace, setRoomPace] = useState<ReplayCountDraft>({ op: "", value: 0 });
    const [roomLate, setRoomLate] = useState<ReplayCountDraft>({ op: "", value: 0 });
    const [roomEnd, setRoomEnd] = useState<ReplayCountDraft>({ op: "", value: 0 });
    const [winnerTeamDraft, setWinnerTeamDraft] = useState<TeamDraft>(() => createEmptyTeamDraft(2));
    const [enemyTeamDraft, setEnemyTeamDraft] = useState<TeamDraft>(createEmptyTeamDraft);
    const [enemyTeamDraft2, setEnemyTeamDraft2] = useState<TeamDraft>(createEmptyTeamDraft);
    const [openTeamSections, setOpenTeamSections] = useState<Record<TeamSectionKey, boolean>>({
        composition: false,
        enemy1: false,
        enemy2: false,
    });

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

    const toggleTeamSection = (key: TeamSectionKey) => {
        setOpenTeamSections((prev) => {
            const nextOpen = !prev[key];
            return { composition: nextOpen, enemy1: nextOpen, enemy2: nextOpen };
        });
    };

    useEffect(() => {
        setBootstrap(null);
        setBootstrapLoading(false);
        setBootstrapError(null);
        setWinnerDraft(createEmptyMemberDraft());
        setRoomRunaway({ op: "", value: 0 });
        setRoomFront({ op: "", value: 0 });
        setRoomPace({ op: "", value: 0 });
        setRoomLate({ op: "", value: 0 });
        setRoomEnd({ op: "", value: 0 });
        setWinnerTeamDraft(createEmptyTeamDraft(2));
        setEnemyTeamDraft(createEmptyTeamDraft());
        setEnemyTeamDraft2(createEmptyTeamDraft());
        setOpenTeamSections({ composition: false, enemy1: false, enemy2: false });
        setResults(null);
        setCurrentPage(1);
        setLastSubmittedRequest(null);
        setSortKey("date");
        setSortDir("desc");
    }, [cmId, courseId]);

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

    const updateWinnerDraft = (patch: Partial<ReplayTeamMemberFilter>) => {
        setWinnerDraft((previous) => ({ ...previous, ...patch }));
    };

    const addWinnerRequirement = () => {
        setWinnerDraft((previous) => ({
            ...previous,
            requirements: [...previous.requirements, createDefaultRequirement(skillVariants, supportCardVariants)],
        }));
    };

    const updateWinnerRequirement = (requirementId: string, patch: Partial<CharacterRequirement>) => {
        setWinnerDraft((previous) => ({
            ...previous,
            requirements: previous.requirements.map((requirement) => {
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
        }));
    };

    const removeWinnerRequirement = (requirementId: string) => {
        setWinnerDraft((previous) => ({
            ...previous,
            requirements: previous.requirements.filter((requirement) => requirement.id !== requirementId),
        }));
    };

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

        const requestBase: Omit<ReplaySearchRequest, "limit" | "offset"> = {
            winner: normalizeReplayCharacterFilter(winnerDraft),
            roomRunaway: normalizeCountFilter(roomRunaway),
            roomFront: normalizeCountFilter(roomFront),
            roomPace: normalizeCountFilter(roomPace),
            roomLate: normalizeCountFilter(roomLate),
            roomEnd: normalizeCountFilter(roomEnd),
            winnerTeam: normalizeWinningTeamDraft(winnerDraft, winnerTeamDraft),
            enemyTeam: normalizeTeamDraft(enemyTeamDraft),
            enemyTeam2: normalizeTeamDraft(enemyTeamDraft2),
            sortKey,
            sortDir,
        };

        setLastSubmittedRequest(requestBase);
        executeQuery(requestBase, 1, true);
    };

    const changePage = (page: number) => {
        if (!lastSubmittedRequest || queryLoading || page === currentPage || page < 1) return;
        executeQuery(lastSubmittedRequest, page, false);
    };

    const updateTeamMember = (
        setter: React.Dispatch<React.SetStateAction<TeamDraft>>,
        index: number,
        patch: Partial<ReplayTeamMemberFilter>,
    ) => {
        setter((previous) =>
            previous.map((member, memberIndex) => (
                memberIndex === index ? { ...member, ...patch } : member
            )),
        );
    };

    const addTeamMemberRequirement = (
        setter: React.Dispatch<React.SetStateAction<TeamDraft>>,
        index: number,
    ) => {
        setter((previous) => previous.map((member, memberIndex) => (
            memberIndex === index
                ? { ...member, requirements: [...member.requirements, createDefaultRequirement(skillVariants, supportCardVariants)] }
                : member
        )));
    };

    const updateTeamMemberRequirement = (
        setter: React.Dispatch<React.SetStateAction<TeamDraft>>,
        index: number,
        requirementId: string,
        patch: Partial<CharacterRequirement>,
    ) => {
        setter((previous) => previous.map((member, memberIndex) => {
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
        }));
    };

    const removeTeamMemberRequirement = (
        setter: React.Dispatch<React.SetStateAction<TeamDraft>>,
        index: number,
        requirementId: string,
    ) => {
        setter((previous) => previous.map((member, memberIndex) => (
            memberIndex === index
                ? { ...member, requirements: member.requirements.filter((requirement) => requirement.id !== requirementId) }
                : member
        )));
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
                {(Object.keys(PROPERTY_LABELS) as FilterProperty[]).map((property) => (
                    <option key={property} value={property}>{PROPERTY_LABELS[property]}</option>
                ))}
            </select>

            {requirement.property !== "none" && requirement.property !== "skill" && requirement.property !== "supportCard" && (
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
                <div className="uma-replays-filter-grid rpl-grid-top">
                    <div className="uma-replays-filter-card rpl-room-composition-card">
                        <h5>Winner</h5>
                        <div className="rpl-winner-fields rpl-filter-member">
                            <div className="exp-feature-header">
                                <span className="exp-feature-label">Character</span>
                                <div className="exp-toggle">
                                    <button type="button" className={`exp-toggle-btn${winnerDraft.characterMatchMode === "is" ? " active" : ""}`} onClick={() => updateWinnerDraft({ characterMatchMode: "is" })}>is</button>
                                    <button type="button" className={`exp-toggle-btn${winnerDraft.characterMatchMode === "isNot" ? " active" : ""}`} onClick={() => updateWinnerDraft({ characterMatchMode: "isNot" })}>is not</button>
                                </div>
                                <ReplayCharaSelect variants={sortedVariants} value={winnerDraft.cardId} onChange={(cardId) => updateWinnerDraft({ cardId })} />
                                <span className="exp-as-label">as</span>
                                <select
                                    className="exp-select"
                                    value={winnerDraft.strategy ?? ""}
                                    onChange={(event) => updateWinnerDraft({ strategy: event.target.value === "" ? null : Number(event.target.value) })}
                                >
                                    <option value="">any strategy</option>
                                    {STRATEGY_PILL_ORDER.map((strategy) => (
                                        <option key={strategy} value={strategy}>{STRATEGY_NAMES[strategy]}</option>
                                    ))}
                                </select>
                            </div>
                            {winnerDraft.requirements.length > 0 && (
                                <div className="exp-feature-reqs">
                                    {winnerDraft.requirements.map((requirement) => renderRequirementRow(
                                        requirement,
                                        (patch) => updateWinnerRequirement(requirement.id, patch),
                                        () => removeWinnerRequirement(requirement.id),
                                    ))}
                                </div>
                            )}
                            <button type="button" className="exp-add-btn" onClick={addWinnerRequirement}>
                                + Add requirement
                            </button>
                        </div>
                    </div>

                    <div className="uma-replays-filter-card">
                        <h5>Exact Winning Team</h5>
                        {winnerTeamDraft.map((member, index) => (
                            <div className="rpl-team-member" key={`winner-${index}`}>
                                <div className="exp-feature-header">
                                    <span className="exp-feature-label">Slot {index + 2}</span>
                                    <div className="exp-toggle">
                                        <button
                                            type="button"
                                            className={`exp-toggle-btn${member.characterMatchMode === "is" ? " active" : ""}`}
                                            onClick={() => updateTeamMember(setWinnerTeamDraft, index, { characterMatchMode: "is" })}
                                        >
                                            is
                                        </button>
                                        <button
                                            type="button"
                                            className={`exp-toggle-btn${member.characterMatchMode === "isNot" ? " active" : ""}`}
                                            onClick={() => updateTeamMember(setWinnerTeamDraft, index, { characterMatchMode: "isNot" })}
                                        >
                                            is not
                                        </button>
                                    </div>
                                    <ReplayCharaSelect
                                        variants={sortedVariants}
                                        value={member.cardId}
                                        onChange={(cardId) => updateTeamMember(setWinnerTeamDraft, index, { cardId })}
                                    />
                                    <span className="exp-as-label">as</span>
                                    <select
                                        className="exp-select"
                                        value={member.strategy ?? ""}
                                        onChange={(event) => updateTeamMember(setWinnerTeamDraft, index, { strategy: event.target.value === "" ? null : Number(event.target.value) })}
                                    >
                                        <option value="">any strategy</option>
                                        {STRATEGY_PILL_ORDER.map((strategy) => (
                                            <option key={strategy} value={strategy}>{STRATEGY_NAMES[strategy]}</option>
                                        ))}
                                    </select>
                                </div>
                                {member.requirements.length > 0 && (
                                    <div className="exp-feature-reqs">
                                        {member.requirements.map((requirement) => renderRequirementRow(
                                            requirement,
                                            (patch) => updateTeamMemberRequirement(setWinnerTeamDraft, index, requirement.id, patch),
                                            () => removeTeamMemberRequirement(setWinnerTeamDraft, index, requirement.id),
                                        ))}
                                    </div>
                                )}
                                <button type="button" className="exp-add-btn" onClick={() => addTeamMemberRequirement(setWinnerTeamDraft, index)}>
                                    + Add requirement
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="uma-replays-filter-grid rpl-grid-teams">
                    <div className="uma-replays-filter-card">
                        <button
                            type="button"
                            className={`rpl-team-section-toggle${openTeamSections.composition ? " active" : ""}`}
                            onClick={() => toggleTeamSection("composition")}
                            aria-expanded={openTeamSections.composition}
                        >
                            <h5>Room Composition</h5>
                            <span className="rpl-team-section-arrow">{openTeamSections.composition ? "−" : "+"}</span>
                        </button>
                        {openTeamSections.composition && (
                            <>
                                <RoomCountRow label="Runaway" color={STRATEGY_COLORS[5]} draft={roomRunaway} setter={setRoomRunaway} />
                                <RoomCountRow label="Front" color={STRATEGY_COLORS[1]} draft={roomFront} setter={setRoomFront} />
                                <RoomCountRow label="Pace" color={STRATEGY_COLORS[2]} draft={roomPace} setter={setRoomPace} />
                                <RoomCountRow label="Late" color={STRATEGY_COLORS[3]} draft={roomLate} setter={setRoomLate} />
                                <RoomCountRow label="End" color={STRATEGY_COLORS[4]} draft={roomEnd} setter={setRoomEnd} />
                            </>
                        )}
                    </div>
                    {([
                        { title: "Exact Enemy Team 1", draft: enemyTeamDraft, setter: setEnemyTeamDraft, prefix: "enemy1" as const },
                        { title: "Exact Enemy Team 2", draft: enemyTeamDraft2, setter: setEnemyTeamDraft2, prefix: "enemy2" as const },
                    ] as const).map(({ title, draft, setter, prefix }) => (
                        <div className="uma-replays-filter-card" key={prefix}>
                            <button
                                type="button"
                                className={`rpl-team-section-toggle${openTeamSections[prefix] ? " active" : ""}`}
                                onClick={() => toggleTeamSection(prefix)}
                                aria-expanded={openTeamSections[prefix]}
                            >
                                <h5>{title}</h5>
                                <span className="rpl-team-section-arrow">{openTeamSections[prefix] ? "−" : "+"}</span>
                            </button>
                            {openTeamSections[prefix] && draft.map((member, index) => (
                                <div className="rpl-team-member" key={`${prefix}-${index}`}>
                                    <div className="exp-feature-header">
                                        <span className="exp-feature-label">Slot {index + 1}</span>
                                        <div className="exp-toggle">
                                            <button
                                                type="button"
                                                className={`exp-toggle-btn${member.characterMatchMode === "is" ? " active" : ""}`}
                                                onClick={() => updateTeamMember(setter, index, { characterMatchMode: "is" })}
                                            >
                                                is
                                            </button>
                                            <button
                                                type="button"
                                                className={`exp-toggle-btn${member.characterMatchMode === "isNot" ? " active" : ""}`}
                                                onClick={() => updateTeamMember(setter, index, { characterMatchMode: "isNot" })}
                                            >
                                                is not
                                            </button>
                                        </div>
                                        <ReplayCharaSelect
                                            variants={sortedVariants}
                                            value={member.cardId}
                                            onChange={(cardId) => updateTeamMember(setter, index, { cardId })}
                                        />
                                        <span className="exp-as-label">as</span>
                                        <select
                                            className="exp-select"
                                            value={member.strategy ?? ""}
                                            onChange={(event) => updateTeamMember(setter, index, { strategy: event.target.value === "" ? null : Number(event.target.value) })}
                                        >
                                            <option value="">any strategy</option>
                                            {STRATEGY_PILL_ORDER.map((strategy) => (
                                                <option key={strategy} value={strategy}>{STRATEGY_NAMES[strategy]}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {member.requirements.length > 0 && (
                                        <div className="exp-feature-reqs">
                                            {member.requirements.map((requirement) => renderRequirementRow(
                                                requirement,
                                                (patch) => updateTeamMemberRequirement(setter, index, requirement.id, patch),
                                                () => removeTeamMemberRequirement(setter, index, requirement.id),
                                            ))}
                                        </div>
                                    )}
                                    <button type="button" className="exp-add-btn" onClick={() => addTeamMemberRequirement(setter, index)}>
                                        + Add requirement
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

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
                                onClick={() => openReplayRoute(row.raceUid, false)}
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
