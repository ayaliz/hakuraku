import React, { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { formatTime } from "../../data/UMDatabaseUtils";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";
import "./UmaLogsPage.css";

function resolveIconSkillId(id: number): number {
    const s = String(id);
    return s.startsWith("9") ? parseInt("1" + s.slice(1), 10) : id;
}

// Grade letters: 1=G through 8=S (mirrors charaProperLabels in UMDatabaseUtils)
const GRADE_LETTERS: Record<number, string> = { 1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S" };

const APT_GROUND_LABEL = "Ground";
const APT_DISTANCE_LABEL = "Distance";

interface UmaFeatCardProps {
    horse: HorseEntry;
    label: string;
    displayValue: string;
    displayValueColor?: string;
    showRankIcon?: boolean;
    skillStats: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    allHorses?: HorseEntry[];
}

const UmaFeatCard: React.FC<UmaFeatCardProps> = ({ horse, label, displayValue, displayValueColor, showRankIcon, skillStats, strategyColors, allHorses }) => {
    const [showModal, setShowModal] = useState(false);
    const [profileHorse, setProfileHorse] = useState(horse);

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
    const cardName = UMDatabaseWrapper.cards[profileHorse.cardId]?.name ?? null;
    const rankInfo = getRankIcon(profileHorse.rankScore);

    const portraitUrl = AssetLoader.getCharaThumb(profileHorse.cardId);
    const iconUrl = AssetLoader.getCharaIcon(profileHorse.charaId);

    const styleIconName: Record<number, string> = { 1: "front", 2: "pace", 3: "late", 4: "end" };
    const moodIconName: Record<number, string> = { 1: "awful", 2: "bad", 3: "normal", 4: "good", 5: "great" };
    const styleIcon = AssetLoader.getStatIcon(styleIconName[profileHorse.strategy] ?? "front");
    const moodIcon = AssetLoader.getStatIcon(moodIconName[profileHorse.motivation] ?? "normal");

    const getSkillName = (id: number) =>
        skillStats.get(id)?.skillName ?? UMDatabaseWrapper.skillName(id);

    const getSkillIconUrl = (id: number) => {
        const iconId = skillIconMap.get(resolveIconSkillId(id));
        return iconId ? AssetLoader.getSkillIcon(iconId) : null;
    };

    const activatedIds = Array.from(profileHorse.activatedSkillIds);
    const learnedOnlyIds = Array.from(profileHorse.learnedSkillIds).filter(
        (id) => !profileHorse.activatedSkillIds.has(id)
    );

    const teammates = useMemo(() => {
        if (!allHorses || profileHorse.teamId <= 0 || !profileHorse.raceId) return [];
        return allHorses
            .filter(h =>
                h.raceId === profileHorse.raceId &&
                h.teamId === profileHorse.teamId &&
                h.frameOrder !== profileHorse.frameOrder
            )
            .sort((a, b) => a.frameOrder - b.frameOrder)
            .slice(0, 2);
    }, [allHorses, profileHorse]);

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
        ["speed",   "Speed",   profileHorse.speed],
        ["stamina", "Stamina", profileHorse.stamina],
        ["power",   "Power",   profileHorse.pow],
        ["guts",    "Guts",    profileHorse.guts],
        ["wit",     "Wit",     profileHorse.wiz],
    ];

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const el = e.currentTarget;
        if (el.src !== iconUrl) el.src = iconUrl;
        else el.style.display = "none";
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
                onClick={() => { setProfileHorse(horse); setShowModal(true); }}
                className="fastest-card"
            >
                <div className="fastest-card-label">{label}</div>

                <div className="fastest-card-portrait" style={{ border: `2px solid ${strategyColor}` }}>
                    <img src={portraitUrl} alt={horse.charaName} onError={handleImgError} />
                </div>

                <div className="fastest-card-name">{horse.charaName}</div>
                <div className="fastest-card-value-row">
                    {showRankIcon && (
                        <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--sm" />
                    )}
                    <div className="fastest-card-time" style={displayValueColor ? { color: displayValueColor } : undefined}>
                        {displayValue}
                    </div>
                </div>
                <div className="fastest-card-hint">Click for profile →</div>
            </div>

            <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title className="fup-modal-title">{label} - Full Profile</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <div className="fup-identity">
                        <div className="fup-portrait" style={{ border: `3px solid ${strategyColor}` }}>
                            <img src={portraitUrl} alt={profileHorse.charaName} onError={handleImgError} />
                        </div>

                        <div className="fup-identity-info">
                            <div className="fup-name">{profileHorse.charaName}</div>
                            {cardName && <div className="fup-card-name">{cardName}</div>}
                            <div className="fup-time">{formatTime(profileHorse.finishTime)}</div>
                            <div className="fup-rank-row">
                                <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--md" />
                                <span className="fup-rank-score">{profileHorse.rankScore.toLocaleString()}</span>
                            </div>
                            <div className="fup-training-wins">Career mode wins: {profileHorse.careerWinCount.toLocaleString()}</div>
                        </div>
                        {teammates.length > 0 && (
                            <div className="fup-teammates-panel">
                                <div className="fup-teammates-title">Team mates</div>
                                <div className="fup-teammates">
                                    {teammates.map(renderTeammateButton)}
                                </div>
                            </div>
                        )}
                        {profileHorse.supportCardIds.length > 0 && (
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
                            <img src={moodIcon} alt={moodIconName[profileHorse.motivation]} title={moodIconName[profileHorse.motivation]} className="fup-style-icon" />
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

                    {activatedIds.length > 0 && (
                        <div className="fup-skills-section">
                            <div className="fup-skills-heading fup-skills-heading--activated">
                                Activated ({activatedIds.length})
                            </div>
                            <div className="fup-skills-list">
                                {activatedIds.map((id) => renderSkillChip(id, true))}
                            </div>
                        </div>
                    )}

                    {learnedOnlyIds.length > 0 && (
                        <div className="fup-skills-section">
                            <div className="fup-skills-heading fup-skills-heading--learned">
                                Learned — Not Activated ({learnedOnlyIds.length})
                            </div>
                            <div className="fup-skills-list">
                                {learnedOnlyIds.map((id) => renderSkillChip(id, false))}
                            </div>
                        </div>
                    )}
                </Modal.Body>
            </Modal>
        </>
    );
};

export default UmaFeatCard;
