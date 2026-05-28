import React, { useEffect, useMemo, useState } from "react";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./constants";
import type { HorseEntry, SkillStats } from "../../types";
import AssetLoader from "../../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { getRankIcon } from "../../../../components/RaceDataPresenter/components/CharaList/rankUtils";
import TeamSampleSelect, { type TeamSampleSelectOption } from "./TeamSampleSelect";
import { type SerializedHorseEntry, deserializeHorseEntries, buildRaceTeamUrl } from "./shared";

function resolveIconSkillId(id: number): number {
    const s = String(id);
    return s.startsWith("9") ? parseInt("1" + s.slice(1), 10) : id;
}

const GRADE_LETTERS: Record<number, string> = { 1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S" };
const APT_GROUND_LABEL = "Ground";
const APT_DISTANCE_LABEL = "Distance";

type RaceTeamResponse = {
    raceUid: string;
    teamId: number;
    horses: SerializedHorseEntry[];
};

function makeHorseIdentityKey(horse: Pick<HorseEntry, "charaId" | "cardId" | "strategy">): string {
    return `${horse.charaId}_${horse.cardId}_${horse.strategy}`;
}

function isSameHorseOccurrence(
    left: Pick<HorseEntry, "raceId" | "teamId" | "frameOrder">,
    right: Pick<HorseEntry, "raceId" | "teamId" | "frameOrder">,
): boolean {
    return left.raceId === right.raceId
        && left.teamId === right.teamId
        && left.frameOrder === right.frameOrder;
}

function findMatchingHorse(horses: HorseEntry[] | undefined, target: HorseEntry): HorseEntry | null {
    if (!horses?.length) return null;
    return horses.find((candidate) => isSameHorseOccurrence(candidate, target))
        ?? horses.find((candidate) => makeHorseIdentityKey(candidate) === makeHorseIdentityKey(target))
        ?? null;
}

function buildTeammateComboKey(horses: HorseEntry[] | undefined, focusHorse: HorseEntry): string | null {
    if (!horses?.length) return null;
    const focus = findMatchingHorse(horses, focusHorse) ?? focusHorse;
    return horses
        .filter((candidate) => !isSameHorseOccurrence(candidate, focus) && makeHorseIdentityKey(candidate) !== makeHorseIdentityKey(focus))
        .map((candidate) => makeHorseIdentityKey(candidate))
        .sort()
        .join("__");
}

export interface TeamMemberCardProps {
    horse: HorseEntry;
    skillStats: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    teamHorses?: HorseEntry[];
    teamOptions?: Array<TeamSampleSelectOption & { teamHorses: HorseEntry[] }>;
    onViewReplays?: (horse: HorseEntry) => void;
}

export const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ horse, skillStats, strategyColors, teamHorses, teamOptions, onViewReplays }) => {
    const [open, setOpen] = useState(false);
    const [profileHorse, setProfileHorse] = useState(horse);
    const [selectedTeamOptionValue, setSelectedTeamOptionValue] = useState<string>("");
    const [fetchedTeamHorses, setFetchedTeamHorses] = useState<HorseEntry[] | null>(null);
    const [isLoadingTeamHorses, setIsLoadingTeamHorses] = useState(false);

    const skillIconMap = useMemo<Map<number, number>>(() => {
        const map = new Map<number, number>();
        for (const [id, s] of Object.entries(UMDatabaseWrapper.skills)) {
            if (s.iconId) map.set(+id, s.iconId);
        }
        return map;
    }, []);

    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const strategyColor = activeStrategyColors[profileHorse.strategy] ?? "#718096";
    const strategyName = STRATEGY_NAMES[profileHorse.strategy] ?? `Strategy ${profileHorse.strategy}`;
    const rankInfo = getRankIcon(profileHorse.rankScore);

    const portraitUrl = AssetLoader.getCharaThumb(profileHorse.cardId);
    const iconUrlFallback = AssetLoader.getCharaIcon(profileHorse.charaId);

    const styleIconName: Record<number, string> = { 1: "front", 2: "pace", 3: "late", 4: "end" };
    const styleIcon = AssetLoader.getStatIcon(styleIconName[profileHorse.strategy] ?? "front");

    const totalSkillPoints = useMemo(() => {
        let total = 0;
        for (const skillId of profileHorse.learnedSkillIds) {
            const base = UMDatabaseWrapper.skillNeedPoints[skillId] ?? 0;
            let upgrade = 0;
            if (UMDatabaseWrapper.skills[skillId]?.rarity === 2) {
                const lastDigit = skillId % 10;
                const flippedId = lastDigit === 1 ? skillId + 1 : skillId - 1;
                upgrade = UMDatabaseWrapper.skillNeedPoints[flippedId] ?? 0;
            } else if (UMDatabaseWrapper.skills[skillId]?.rarity === 1 && skillId % 10 === 1) {
                const pairedId = skillId + 1;
                if (UMDatabaseWrapper.skills[pairedId]?.rarity === 1) {
                    upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
                }
            }
            total += base + upgrade;
        }
        return total;
    }, [profileHorse.learnedSkillIds]);

    const getSkillName = (id: number) =>
        skillStats.get(id)?.skillName ?? UMDatabaseWrapper.skillNameWithEnglishFallback(id);

    const getSkillIconUrl = (id: number) => {
        const iconId = skillIconMap.get(resolveIconSkillId(id));
        return iconId ? AssetLoader.getSkillIcon(iconId) : null;
    };

    // For profile view we only care about the raw skill list, not whether a skill happened to
    // activate in a specific match. Merge learned + activated IDs into a single set.
    const allSkillIds = Array.from(
        new Set<number>([
            ...Array.from(profileHorse.learnedSkillIds),
            ...Array.from(profileHorse.activatedSkillIds),
        ])
    );

    const selectedTeamOption = useMemo(
        () => teamOptions?.find((option) => option.value === selectedTeamOptionValue),
        [selectedTeamOptionValue, teamOptions],
    );

    const currentTeamOption = useMemo(() => {
        if (!teamOptions?.length || !teamHorses?.length) return null;
        const currentComboKey = buildTeammateComboKey(teamHorses, horse);
        if (!currentComboKey) return null;
        return teamOptions.find((option) => buildTeammateComboKey(option.teamHorses, horse) === currentComboKey) ?? null;
    }, [horse, teamHorses, teamOptions]);

    const currentTeamHorses = useMemo(
        () => currentTeamOption?.teamHorses?.length ? currentTeamOption.teamHorses : (teamHorses ?? []),
        [currentTeamOption, teamHorses],
    );

    const currentTeamHorse = useMemo(
        () => findMatchingHorse(currentTeamHorses, horse) ?? horse,
        [currentTeamHorses, horse],
    );

    useEffect(() => {
        setProfileHorse(currentTeamHorse);
        setSelectedTeamOptionValue("");
    }, [currentTeamHorse, teamOptions]);

    const handleTeamOptionChange = (value: string) => {
        setSelectedTeamOptionValue(value);
        if (!value) {
            setProfileHorse(currentTeamHorse);
            return;
        }

        const nextOption = teamOptions?.find((option) => option.value === value);
        if (!nextOption?.teamHorses?.length) return;

        const matchingHorse = findMatchingHorse(nextOption.teamHorses, profileHorse)
            ?? findMatchingHorse(nextOption.teamHorses, currentTeamHorse)
            ?? nextOption.teamHorses[0];

        if (matchingHorse) {
            setProfileHorse(matchingHorse);
        }
    };

    const localTeamHorses = useMemo(
        () => selectedTeamOption?.teamHorses?.length
            ? selectedTeamOption.teamHorses
            : currentTeamHorses,
        [currentTeamHorses, selectedTeamOption],
    );

    const localTeammates = useMemo(() => {
        if (!localTeamHorses.length || profileHorse.teamId <= 0 || !profileHorse.raceId) return [];
        return localTeamHorses
            .filter((h) =>
                h.raceId === profileHorse.raceId &&
                h.teamId === profileHorse.teamId &&
                h.frameOrder !== profileHorse.frameOrder
            )
            .sort((a, b) => a.frameOrder - b.frameOrder)
            .slice(0, 2);
    }, [localTeamHorses, profileHorse]);

    useEffect(() => {
        if (!open) return;
        if (localTeammates.length > 0) {
            setFetchedTeamHorses(null);
            setIsLoadingTeamHorses(false);
            return;
        }
        if (profileHorse.teamId <= 0 || !profileHorse.raceId) {
            setFetchedTeamHorses([]);
            setIsLoadingTeamHorses(false);
            return;
        }

        const controller = new AbortController();
        setIsLoadingTeamHorses(true);
        fetch(buildRaceTeamUrl(profileHorse.raceId, profileHorse.teamId), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load teammates: HTTP ${response.status}`);
                }
                const payload = await response.json() as RaceTeamResponse;
                setFetchedTeamHorses(deserializeHorseEntries(payload.horses));
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                setFetchedTeamHorses([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoadingTeamHorses(false);
                }
            });

        return () => controller.abort();
    }, [
        open,
        profileHorse.raceId,
        profileHorse.teamId,
        localTeammates.length,
    ]);

    const teammates = useMemo(() => {
        if (localTeammates.length > 0) return localTeammates;
        const sourceHorses = fetchedTeamHorses;
        if (!sourceHorses || profileHorse.teamId <= 0 || !profileHorse.raceId) return [];
        const exactSourceHorses = sourceHorses.filter((h) => h.raceId === profileHorse.raceId && h.teamId === profileHorse.teamId);
        if (exactSourceHorses.length > 0) {
            return exactSourceHorses
                .filter((h) => h.frameOrder !== profileHorse.frameOrder)
                .sort((a, b) => a.frameOrder - b.frameOrder)
                .slice(0, 2);
        }
        return [];
    }, [fetchedTeamHorses, localTeammates, profileHorse]);

    const renderSkillChip = (id: number, activated: boolean) => {
        const name = getSkillName(id);
        const icon = getSkillIconUrl(id);
        return (
            <div
                key={id}
                title={`[${id}] ${name}`}
                className={`fup-skill-chip ${activated ? "fup-skill-chip--activated" : "fup-skill-chip--learned"}`}
            >
                {icon && (
                    <img
                        src={icon}
                        alt=""
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                )}
                <span className="fup-skill-chip-name">{name}</span>
            </div>
        );
    };

    const baseStats: [string, string, number][] = [
        ["speed", "Speed", profileHorse.speed],
        ["stamina", "Stamina", profileHorse.stamina],
        ["power", "Power", profileHorse.pow],
        ["guts", "Guts", profileHorse.guts],
        ["wit", "Wit", profileHorse.wiz],
    ];

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const el = e.currentTarget;
        if (el.src !== iconUrlFallback) el.src = iconUrlFallback;
        else el.style.display = "none";
    };

    const handleViewReplays = () => {
        onViewReplays?.(profileHorse);
        setOpen(false);
    };

    const renderTeammateButton = (teammate: HorseEntry) => {
        const teammateRank = getRankIcon(teammate.rankScore);
        const teammateStyleColor = activeStrategyColors[teammate.strategy] ?? "#718096";
        return (
            <button
                key={`${teammate.raceId}_${teammate.frameOrder}`}
                type="button"
                className="fup-teammate-btn"
                style={{ borderColor: teammateStyleColor, background: `${teammateStyleColor}22` }}
                onClick={() => setProfileHorse(teammate)}
            >
                <span className="fup-teammate-portrait" style={{ borderColor: teammateStyleColor }}>
                    <img
                        src={AssetLoader.getCharaThumb(teammate.cardId)}
                        alt={teammate.charaName}
                        onError={handleImgError}
                    />
                </span>
                <span className="fup-teammate-main">
                    <span className="fup-teammate-name">{teammate.charaName}</span>
                    <span className="fup-teammate-style">{STRATEGY_NAMES[teammate.strategy] ?? `Strategy ${teammate.strategy}`}</span>
                </span>
                <span className="fup-teammate-rank">
                    <img src={teammateRank.icon} alt={teammateRank.name} className="fup-rank-icon--sm" />
                    <span>{teammate.rankScore.toLocaleString()}</span>
                </span>
            </button>
        );
    };

    return (
        <>
            <div
                role="button"
                onClick={() => { setProfileHorse(horse); setOpen(true); }}
                className="fastest-card stcp-member-card"
            >
                <div className="fastest-card-label">{horse.charaName}</div>
                <div className="fastest-card-portrait" style={{ border: `2px solid ${activeStrategyColors[horse.strategy] ?? "#718096"}` }}>
                    <img src={AssetLoader.getCharaThumb(horse.cardId)} alt={horse.charaName} onError={handleImgError} />
                </div>
                <div className="fastest-card-value-row">
                    <img src={getRankIcon(horse.rankScore).icon} alt={getRankIcon(horse.rankScore).name} className="fup-rank-icon--sm" />
                    <div className="fastest-card-time">
                        {horse.rankScore.toLocaleString()}
                    </div>
                </div>
                <div className="fastest-card-hint">Click for full profile</div>
            </div>

            {open && (
                <div className="stcp-overlay" onClick={() => setOpen(false)}>
                    <div className="stcp-modal" onClick={e => e.stopPropagation()}>
                        <div className="stcp-modal-header">
                            <div className="fup-modal-title">Team Member - Full Profile</div>
                            <button className="stcp-modal-close" onClick={() => setOpen(false)}>&times;</button>
                        </div>
                        <div className="stcp-modal-body">
                            <div className="fup-identity">
                                <div className="fup-identity-left">
                                    <div className="fup-portrait" style={{ border: `3px solid ${strategyColor}` }}>
                                        <img src={portraitUrl} alt={profileHorse.charaName} onError={handleImgError} />
                                    </div>
                                    <div className="fup-portrait-caption">{profileHorse.charaName}</div>
                                </div>
                                <div className="fup-identity-info">
                                    <div className="fup-rank-row">
                                        <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--md" />
                                        <span className="fup-rank-score">{profileHorse.rankScore.toLocaleString()}</span>
                                    </div>
                                    <div className="fup-training-wins">Career mode wins: {profileHorse.careerWinCount.toLocaleString()}</div>
                                    {onViewReplays && (
                                        <button type="button" className="fup-replays-btn" onClick={handleViewReplays}>
                                            Replays
                                        </button>
                                    )}
                                </div>
                                {(teammates.length > 0 || isLoadingTeamHorses) && (
                                    <div className="fup-teammates-panel">
                                        <div className="fup-teammates-title">Team mates</div>
                                        {teamOptions && teamOptions.length > 1 && (
                                            <div className="tcp-rep-team-select">
                                                <TeamSampleSelect
                                                    value={selectedTeamOptionValue}
                                                    options={teamOptions}
                                                    onChange={handleTeamOptionChange}
                                                    strategyColors={activeStrategyColors}
                                                    placeholderLabel="Current team"
                                                />
                                            </div>
                                        )}
                                        {isLoadingTeamHorses && teammates.length === 0 ? (
                                            <div className="fup-teammates-loading">Loading team mates...</div>
                                        ) : (
                                            <div className="fup-teammates">
                                                {teammates.map(renderTeammateButton)}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {profileHorse.supportCardIds.length > 0 && (
                                    <div className="fup-deck-panel">
                                        <div className="fup-side-panel-title">Deck</div>
                                        <div className="fup-deck">
                                            {profileHorse.supportCardIds.map((id, i) => (
                                                <div key={i} className="fup-deck-card">
                                                    <img
                                                        src={AssetLoader.getSupportCardIcon(id)}
                                                        alt=""
                                                        className="fup-deck-card-img"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                    <div className="fup-deck-card-lb">LB{profileHorse.supportCardLimitBreaks[i] ?? 0}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="fup-stat-row">
                                <div className="fup-stats">
                                    {baseStats.map(([key, statLabel, value]) => (
                                        <span key={key} className="fup-stat-item">
                                            <img src={AssetLoader.getStatIcon(key)} alt={statLabel} width={20} height={20} />
                                            <span className="fup-stat-value">{value}</span>
                                        </span>
                                    ))}
                                    {totalSkillPoints > 0 && (
                                        <span className="fup-stat-item" title="Undiscounted SP value of learned skills">
                                            <img src={AssetLoader.getStatIcon("hint")} alt="Skill Points" width={20} height={20} />
                                            <span className="fup-stat-value">{totalSkillPoints}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="fup-divider" />
                                <div className="fup-style-mood">
                                    <img src={styleIcon} alt={strategyName} title={strategyName} className="fup-style-icon" />
                                </div>
                                {(profileHorse.aptGround !== undefined || profileHorse.aptDistance !== undefined || profileHorse.aptStyle !== undefined) && (
                                    <>
                                        <div className="fup-divider" />
                                        <div className="fup-aptitudes">
                                            {profileHorse.aptGround !== undefined && (
                                                <div className="fup-apt-item">
                                                    <span className="fup-apt-cat">{APT_GROUND_LABEL}</span>
                                                    <img
                                                        src={AssetLoader.getGradeIcon(GRADE_LETTERS[profileHorse.aptGround]) ?? ""}
                                                        alt={GRADE_LETTERS[profileHorse.aptGround] ?? "-"}
                                                        className="fup-apt-icon"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                </div>
                                            )}
                                            {profileHorse.aptDistance !== undefined && (
                                                <div className="fup-apt-item">
                                                    <span className="fup-apt-cat">{APT_DISTANCE_LABEL}</span>
                                                    <img
                                                        src={AssetLoader.getGradeIcon(GRADE_LETTERS[profileHorse.aptDistance]) ?? ""}
                                                        alt={GRADE_LETTERS[profileHorse.aptDistance] ?? "-"}
                                                        className="fup-apt-icon"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                </div>
                                            )}
                                            {profileHorse.aptStyle !== undefined && (
                                                <div className="fup-apt-item">
                                                    <span className="fup-apt-cat">{strategyName}</span>
                                                    <img
                                                        src={AssetLoader.getGradeIcon(GRADE_LETTERS[profileHorse.aptStyle]) ?? ""}
                                                        alt={GRADE_LETTERS[profileHorse.aptStyle] ?? "-"}
                                                        className="fup-apt-icon"
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {allSkillIds.length > 0 && (
                                <div className="fup-skills-section">
                                    <div className="fup-skills-heading fup-skills-heading--learned">
                                        Skills ({allSkillIds.length})
                                    </div>
                                    <div className="fup-skills-list">
                                        {allSkillIds.map((id) => renderSkillChip(id, false))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
