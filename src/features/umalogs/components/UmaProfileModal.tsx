import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";

import { getRankIcon } from "../../../components/RaceDataPresenter/components/CharaList/rankUtils";
import AssetLoader from "../../../data/AssetLoader";
import { getSkillIconUrl } from "../../../data/skillIcons";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import { formatTime } from "../../../data/UMDatabaseUtils";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../../../pages/MultiRacePage/components/WinDistributionCharts/constants";
import type { HorseEntry, SkillStats } from "../../../pages/MultiRacePage/types";
import { useRaceTeam } from "../api/useRaceTeam";
import "./HorseProfile.css";

const GRADE_LETTERS: Record<number, string> = { 1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S" };
const STYLE_ICON_NAMES: Record<number, string> = { 1: "front", 2: "pace", 3: "late", 4: "end" };
const MOOD_ICON_NAMES: Record<number, string> = { 1: "awful", 2: "bad", 3: "normal", 4: "good", 5: "great" };

type UmaProfileModalProps = {
    horse: HorseEntry;
    label: string;
    show: boolean;
    skillStats: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    onHide: () => void;
    onViewReplays?: (horse: HorseEntry) => void;
};

const UmaProfileModal: React.FC<UmaProfileModalProps> = ({
    horse,
    label,
    show,
    skillStats,
    strategyColors,
    onHide,
    onViewReplays,
}) => {
    const [profileHorse, setProfileHorse] = useState(horse);

    useEffect(() => {
        if (show) setProfileHorse(horse);
    }, [horse, show]);

    const { horses: fetchedTeamHorses, loading: isLoadingTeamHorses } = useRaceTeam({
        raceId: profileHorse.raceId,
        teamId: profileHorse.teamId,
        enabled: show,
    });

    const teammates = useMemo(() => {
        if (!fetchedTeamHorses || profileHorse.teamId <= 0 || !profileHorse.raceId) return [];
        return fetchedTeamHorses
            .filter((candidate) => candidate.raceId === profileHorse.raceId
                && candidate.teamId === profileHorse.teamId
                && candidate.frameOrder !== profileHorse.frameOrder)
            .sort((left, right) => left.frameOrder - right.frameOrder)
            .slice(0, 2);
    }, [fetchedTeamHorses, profileHorse]);

    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const strategyColor = activeStrategyColors[profileHorse.strategy] ?? "#718096";
    const strategyName = STRATEGY_NAMES[profileHorse.strategy] ?? `Strategy ${profileHorse.strategy}`;
    const aptitudeStrategy = profileHorse.rawStrategy ?? (profileHorse.strategy === 6 ? undefined : profileHorse.strategy);
    const aptitudeStrategyName = aptitudeStrategy !== undefined
        ? STRATEGY_NAMES[aptitudeStrategy] ?? `Strategy ${aptitudeStrategy}`
        : "Style";
    const rankInfo = getRankIcon(profileHorse.rankScore);
    const portraitUrl = AssetLoader.getCharaThumb(profileHorse.cardId);
    const iconUrl = AssetLoader.getCharaIcon(profileHorse.charaId);
    const styleIcon = AssetLoader.getStatIcon(STYLE_ICON_NAMES[profileHorse.strategy] ?? "front");
    const moodIcon = AssetLoader.getStatIcon(MOOD_ICON_NAMES[profileHorse.motivation] ?? "normal");
    const activatedIds = Array.from(profileHorse.activatedSkillIds);
    const learnedOnlyIds = Array.from(profileHorse.learnedSkillIds).filter((id) => !profileHorse.activatedSkillIds.has(id));
    const baseStats: [string, string, number][] = [
        ["speed", "Speed", profileHorse.speed],
        ["stamina", "Stamina", profileHorse.stamina],
        ["power", "Power", profileHorse.pow],
        ["guts", "Guts", profileHorse.guts],
        ["wit", "Wit", profileHorse.wiz],
    ];

    const handleImgError = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const element = event.currentTarget;
        if (element.src !== iconUrl) element.src = iconUrl;
        else element.style.display = "none";
    };

    const renderSkillChip = (id: number, activated: boolean) => {
        const name = skillStats.get(id)?.skillName ?? UMDatabaseWrapper.skillName(id);
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
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                )}
                <span className="fup-skill-chip-name">{name}</span>
            </div>
        );
    };

    const renderTeammateButton = (teammate: HorseEntry) => {
        const teammateRank = getRankIcon(teammate.rankScore);
        const teammateStyleColor = activeStrategyColors[teammate.strategy] ?? "#718096";
        const teammateFallbackIcon = AssetLoader.getCharaIcon(teammate.charaId);
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
                        onError={(event) => {
                            if (event.currentTarget.src !== teammateFallbackIcon) event.currentTarget.src = teammateFallbackIcon;
                            else event.currentTarget.style.display = "none";
                        }}
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

    const handleViewReplays = () => {
        onViewReplays?.(profileHorse);
        onHide();
    };

    return (
        <Modal show={show} onHide={onHide} size="lg" centered>
            <Modal.Header closeButton>
                <Modal.Title className="fup-modal-title">{label} - Full Profile</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <div className="fup-identity">
                    <div className="fup-identity-left">
                        <div className="fup-portrait" style={{ border: `3px solid ${strategyColor}` }}>
                            <img src={portraitUrl} alt={profileHorse.charaName} onError={handleImgError} />
                        </div>
                        <div className="fup-portrait-caption">{profileHorse.charaName}</div>
                    </div>

                    <div className="fup-identity-info">
                        <div className="fup-time">{formatTime(profileHorse.finishTime)}</div>
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
                            {isLoadingTeamHorses && teammates.length === 0 ? (
                                <div className="fup-teammates-loading">Loading team mates...</div>
                            ) : (
                                <div className="fup-teammates">{teammates.map(renderTeammateButton)}</div>
                            )}
                        </div>
                    )}
                    {profileHorse.supportCardIds.length > 0 && (
                        <div className="fup-deck-panel">
                            <div className="fup-side-panel-title">Deck</div>
                            <div className="fup-deck">
                                {profileHorse.supportCardIds.map((id, index) => (
                                    <div key={index} className="fup-deck-card">
                                        <img
                                            src={AssetLoader.getSupportCardIcon(id)}
                                            alt=""
                                            className="fup-deck-card-img"
                                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                                        />
                                        <div className="fup-deck-card-lb">LB{profileHorse.supportCardLimitBreaks[index] ?? 0}</div>
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
                    </div>
                    <div className="fup-divider" />
                    <div className="fup-style-mood">
                        <img src={styleIcon} alt={strategyName} title={strategyName} className="fup-style-icon" />
                        <img src={moodIcon} alt={MOOD_ICON_NAMES[profileHorse.motivation]} title={MOOD_ICON_NAMES[profileHorse.motivation]} className="fup-style-icon" />
                    </div>
                    {(profileHorse.aptGround !== undefined || profileHorse.aptDistance !== undefined || profileHorse.aptStyle !== undefined) && (
                        <>
                            <div className="fup-divider" />
                            <div className="fup-aptitudes">
                                {profileHorse.aptGround !== undefined && (
                                    <div className="fup-apt-item">
                                        <span className="fup-apt-cat">Ground</span>
                                        <img
                                            src={AssetLoader.getGradeIcon(GRADE_LETTERS[profileHorse.aptGround]) ?? ""}
                                            alt={GRADE_LETTERS[profileHorse.aptGround] ?? "-"}
                                            className="fup-apt-icon"
                                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                                        />
                                    </div>
                                )}
                                {profileHorse.aptDistance !== undefined && (
                                    <div className="fup-apt-item">
                                        <span className="fup-apt-cat">Distance</span>
                                        <img
                                            src={AssetLoader.getGradeIcon(GRADE_LETTERS[profileHorse.aptDistance]) ?? ""}
                                            alt={GRADE_LETTERS[profileHorse.aptDistance] ?? "-"}
                                            className="fup-apt-icon"
                                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                                        />
                                    </div>
                                )}
                                {profileHorse.aptStyle !== undefined && (
                                    <div className="fup-apt-item">
                                        <span className="fup-apt-cat">{aptitudeStrategyName}</span>
                                        <img
                                            src={AssetLoader.getGradeIcon(GRADE_LETTERS[profileHorse.aptStyle]) ?? ""}
                                            alt={GRADE_LETTERS[profileHorse.aptStyle] ?? "-"}
                                            className="fup-apt-icon"
                                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {activatedIds.length > 0 && (
                    <div className="fup-skills-section">
                        <div className="fup-skills-heading fup-skills-heading--activated">Activated ({activatedIds.length})</div>
                        <div className="fup-skills-list">{activatedIds.map((id) => renderSkillChip(id, true))}</div>
                    </div>
                )}

                {learnedOnlyIds.length > 0 && (
                    <div className="fup-skills-section">
                        <div className="fup-skills-heading fup-skills-heading--learned">Learned — Not Activated ({learnedOnlyIds.length})</div>
                        <div className="fup-skills-list">{learnedOnlyIds.map((id) => renderSkillChip(id, false))}</div>
                    </div>
                )}
            </Modal.Body>
        </Modal>
    );
};

export default UmaProfileModal;
