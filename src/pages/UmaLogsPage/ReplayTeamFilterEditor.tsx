import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
    STYLE_BREAKDOWN_STRATEGY_ORDER,
    STRATEGY_NAMES,
} from "../MultiRacePage/components/WinDistributionCharts/constants";
import RequirementEditor from "../../features/umalogs/components/filters/RequirementEditor";
import { CharacterSelect } from "../../features/umalogs/components/selectors/UmaLogsEntitySelects";
import {
    createCharacterRequirement,
    defaultStatValueForProperty,
} from "../../features/umalogs/model/filterOptions";
import {
    SUPPORT_CARD_LB_ANY,
    type CharacterRequirement,
    type SkillVariant,
    type SupportCardVariant,
} from "../../features/umalogs/model/filterTypes";
import type {
    ReplayCharacterVariant,
    ReplayTeamFilterScope,
    ReplayTeamMemberFilter,
} from "./replaysShared";

export type ScopedTeamDraft = {
    id: string;
    scope: ReplayTeamFilterScope;
    members: ReplayTeamMemberFilter[];
};

function createId(): string {
    return `${Date.now()}-${Math.random()}`;
}

function createDefaultRequirement(
    skillVariants: SkillVariant[],
    supportCardVariants: SupportCardVariant[],
): CharacterRequirement {
    return createCharacterRequirement(createId(), skillVariants, supportCardVariants);
}

export function createEmptyMemberDraft(): ReplayTeamMemberFilter {
    return { characterMatchMode: "is", cardId: null, strategy: null, requirements: [] };
}

export function createTeamFilterDraft(
    scope: ReplayTeamFilterScope = "any",
    member?: ReplayTeamMemberFilter,
): ScopedTeamDraft {
    return {
        id: createId(),
        scope,
        members: [member ?? createEmptyMemberDraft()],
    };
}

type ReplayTeamFilterEditorProps = {
    drafts: ScopedTeamDraft[];
    setDrafts: Dispatch<SetStateAction<ScopedTeamDraft[]>>;
    characterVariants: ReplayCharacterVariant[];
    skillVariants: SkillVariant[];
    supportCardVariants: SupportCardVariant[];
    allowAddTeam: boolean;
    emptyMessage: string;
    notices?: ReactNode;
};

export default function ReplayTeamFilterEditor({
    drafts,
    setDrafts,
    characterVariants,
    skillVariants,
    supportCardVariants,
    allowAddTeam,
    emptyMessage,
    notices,
}: ReplayTeamFilterEditorProps) {
    const removeTeam = (teamId: string) => {
        setDrafts((previous) => previous.filter((team) => team.id !== teamId));
    };
    const updateScope = (teamId: string, scope: ReplayTeamFilterScope) => {
        setDrafts((previous) => previous.map((team) => team.id === teamId ? { ...team, scope } : team));
    };
    const updateMember = (teamId: string, index: number, patch: Partial<ReplayTeamMemberFilter>) => {
        setDrafts((previous) => previous.map((team) => team.id !== teamId ? team : {
            ...team,
            members: team.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member),
        }));
    };
    const addMember = (teamId: string) => {
        setDrafts((previous) => previous.map((team) => (
            team.id !== teamId || team.members.length >= 3
                ? team
                : { ...team, members: [...team.members, createEmptyMemberDraft()] }
        )));
    };
    const removeMember = (teamId: string, index: number) => {
        setDrafts((previous) => previous.map((team) => (
            team.id !== teamId || team.members.length <= 1
                ? team
                : { ...team, members: team.members.filter((_, memberIndex) => memberIndex !== index) }
        )));
    };
    const addRequirement = (teamId: string, index: number) => {
        setDrafts((previous) => previous.map((team) => team.id !== teamId ? team : {
            ...team,
            members: team.members.map((member, memberIndex) => memberIndex !== index ? member : {
                ...member,
                requirements: [
                    ...member.requirements,
                    createDefaultRequirement(skillVariants, supportCardVariants),
                ],
            }),
        }));
    };
    const updateRequirement = (
        teamId: string,
        index: number,
        requirementId: string,
        patch: Partial<CharacterRequirement>,
    ) => {
        setDrafts((previous) => previous.map((team) => team.id !== teamId ? team : {
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
                            if (patch.property === "skill" && next.skillId === null) {
                                next.skillId = skillVariants[0]?.skillId ?? null;
                            }
                            if (patch.property === "supportCard" && next.supportCardId === null) {
                                next.supportCardId = supportCardVariants[0]?.supportCardId ?? null;
                                next.supportCardLb = SUPPORT_CARD_LB_ANY;
                            }
                        }
                        return next;
                    }),
                };
            }),
        }));
    };
    const removeRequirement = (teamId: string, index: number, requirementId: string) => {
        setDrafts((previous) => previous.map((team) => team.id !== teamId ? team : {
            ...team,
            members: team.members.map((member, memberIndex) => memberIndex !== index ? member : {
                ...member,
                requirements: member.requirements.filter((requirement) => requirement.id !== requirementId),
            }),
        }));
    };

    const renderMember = (team: ScopedTeamDraft, member: ReplayTeamMemberFilter, index: number) => (
        <div className="rpl-team-member" key={`${team.id}-${index}`}>
            <div className="exp-feature-header">
                <span className="exp-feature-label">Uma {index + 1}</span>
                <div className="exp-toggle">
                    <button type="button" className={`exp-toggle-btn${member.characterMatchMode === "is" ? " active" : ""}`} onClick={() => updateMember(team.id, index, { characterMatchMode: "is" })}>is</button>
                    <button type="button" className={`exp-toggle-btn${member.characterMatchMode === "isNot" ? " active" : ""}`} onClick={() => updateMember(team.id, index, { characterMatchMode: "isNot" })}>is not</button>
                </div>
                <CharacterSelect variants={characterVariants} value={member.cardId} allowEmpty onChange={(cardId) => updateMember(team.id, index, { cardId })} />
                <span className="exp-as-label">as</span>
                <select
                    className="exp-select"
                    value={member.strategy ?? ""}
                    onChange={(event) => updateMember(team.id, index, { strategy: event.target.value === "" ? null : Number(event.target.value) })}
                >
                    <option value="">any style</option>
                    {STYLE_BREAKDOWN_STRATEGY_ORDER.map((strategy) => (
                        <option key={strategy} value={strategy}>{STRATEGY_NAMES[strategy]}</option>
                    ))}
                </select>
                {team.members.length > 1 && (
                    <button type="button" className="exp-remove-btn" onClick={() => removeMember(team.id, index)}>x</button>
                )}
            </div>
            {member.requirements.length > 0 && (
                <div className="exp-feature-reqs">
                    {member.requirements.map((requirement) => (
                        <RequirementEditor
                            key={requirement.id}
                            requirement={requirement}
                            skillVariants={skillVariants}
                            supportCardVariants={supportCardVariants}
                            onUpdate={(patch) => updateRequirement(team.id, index, requirement.id, patch)}
                            onRemove={() => removeRequirement(team.id, index, requirement.id)}
                        />
                    ))}
                </div>
            )}
            <button type="button" className="exp-add-btn" onClick={() => addRequirement(team.id, index)}>
                + Add requirement
            </button>
        </div>
    );

    return (
        <>
            {allowAddTeam && (
                <div className="rpl-team-filter-toolbar">
                    <button type="button" className="rpl-add-team-btn" onClick={() => setDrafts((previous) => [...previous, createTeamFilterDraft()])}>
                        + Add team
                    </button>
                </div>
            )}
            {drafts.length === 0 && allowAddTeam && (
                <div className="rpl-empty-team-filters">{emptyMessage}</div>
            )}
            {notices}
            {drafts.length > 0 && (
                <div className="uma-replays-filter-grid rpl-grid-teams">
                    {drafts.map((team, teamIndex) => (
                        <div className="uma-replays-filter-card rpl-team-filter-card" key={team.id}>
                            <div className="rpl-team-filter-head">
                                <h5>Team {teamIndex + 1}</h5>
                                <button type="button" className="rpl-team-remove-btn" onClick={() => removeTeam(team.id)}>Remove</button>
                            </div>
                            <div className="rpl-team-scope-toggle" role="group" aria-label={`Team ${teamIndex + 1} scope`}>
                                {([
                                    { value: "any", label: "Any team" },
                                    { value: "winner", label: "Winning team" },
                                    { value: "loser", label: "Losing team" },
                                ] as const).map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`rpl-team-scope-btn${team.scope === option.value ? " active" : ""}`}
                                        onClick={() => updateScope(team.id, option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <div className="rpl-team-members">
                                {team.members.map((member, memberIndex) => renderMember(team, member, memberIndex))}
                            </div>
                            {team.members.length < 3 && (
                                <button type="button" className="exp-add-btn rpl-add-character-btn" onClick={() => addMember(team.id)}>
                                    + Add Uma
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
