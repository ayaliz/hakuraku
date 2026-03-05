import React, { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import GameDataLoader from "../../data/GameDataLoader";
import { formatTime } from "../../data/UMDatabaseUtils";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";
import "./UmaLogsPage.css";

function resolveIconSkillId(id: number): number {
    const s = String(id);
    return s.startsWith("9") ? parseInt("1" + s.slice(1), 10) : id;
}

// Grade letter map — 1=G … 8=S (mirrors charaProperLabels in UMDatabaseUtils)
const GRADE_LETTERS: Record<number, string> = { 1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S" };

// Aptitude display labels — keep in sync with APTITUDE_* constants in precompute-umalogs.mts
const APT_GROUND_LABEL = "Dirt";
const APT_DISTANCE_LABEL = "Mile";

interface UmaFeatCardProps {
    horse: HorseEntry;
    label: string;
    displayValue: string;
    displayValueColor?: string;
    showRankIcon?: boolean;
    skillStats: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
}

const UmaFeatCard: React.FC<UmaFeatCardProps> = ({ horse, label, displayValue, displayValueColor, showRankIcon, skillStats, strategyColors }) => {
    const [showModal, setShowModal] = useState(false);

    const skillIconMap = useMemo<Map<number, number>>(() => {
        const map = new Map<number, number>();
        try {
            for (const s of GameDataLoader.skills) {
                if (s.id && s.iconid) map.set(s.id as number, s.iconid as number);
            }
        } catch { /* GameDataLoader not ready — icons omitted */ }
        return map;
    }, []);

    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const strategyColor = activeStrategyColors[horse.strategy] ?? "#718096";
    const strategyName = STRATEGY_NAMES[horse.strategy] ?? `Strategy ${horse.strategy}`;
    const cardName = UMDatabaseWrapper.cards[horse.cardId]?.name ?? null;
    const rankInfo = getRankIcon(horse.rankScore);

    const portraitUrl = AssetLoader.getCharaThumb(horse.cardId);
    const iconUrl = AssetLoader.getCharaIcon(horse.charaId);

    const styleIconName: Record<number, string> = { 1: "front", 2: "pace", 3: "late", 4: "end" };
    const moodIconName: Record<number, string> = { 1: "awful", 2: "bad", 3: "normal", 4: "good", 5: "great" };
    const styleIcon = AssetLoader.getStatIcon(styleIconName[horse.strategy] ?? "front");
    const moodIcon = AssetLoader.getStatIcon(moodIconName[horse.motivation] ?? "normal");

    const getSkillName = (id: number) =>
        skillStats.get(id)?.skillName ?? UMDatabaseWrapper.skillName(id);

    const getSkillIconUrl = (id: number) => {
        const iconId = skillIconMap.get(resolveIconSkillId(id));
        return iconId ? AssetLoader.getSkillIcon(iconId) : null;
    };

    const activatedIds = Array.from(horse.activatedSkillIds);
    const learnedOnlyIds = Array.from(horse.learnedSkillIds).filter(
        (id) => !horse.activatedSkillIds.has(id)
    );

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
        ["speed",   "Speed",   horse.speed],
        ["stamina", "Stamina", horse.stamina],
        ["power",   "Power",   horse.pow],
        ["guts",    "Guts",    horse.guts],
        ["wit",     "Wit",     horse.wiz],
    ];

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const el = e.currentTarget;
        if (el.src !== iconUrl) el.src = iconUrl;
        else el.style.display = "none";
    };

    return (
        <>
            <div
                role="button"
                onClick={() => setShowModal(true)}
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
                    <Modal.Title className="fup-modal-title">{label} — Full Profile</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <div className="fup-identity">
                        <div className="fup-portrait" style={{ border: `3px solid ${strategyColor}` }}>
                            <img src={portraitUrl} alt={horse.charaName} onError={handleImgError} />
                        </div>

                        <div className="fup-identity-info">
                            <div className="fup-name">{horse.charaName}</div>
                            {cardName && <div className="fup-card-name">{cardName}</div>}
                            <div className="fup-time">{formatTime(horse.finishTime)}</div>
                            <div className="fup-rank-row">
                                <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--md" />
                                <span className="fup-rank-score">{horse.rankScore.toLocaleString()}</span>
                            </div>
                        </div>
                        {horse.supportCardIds.length > 0 && (
                            <div className="fup-deck">
                                {horse.supportCardIds.map((id, i) => (
                                    <div key={i} className="fup-deck-card">
                                        <img
                                            src={AssetLoader.getSupportCardIcon(id)}
                                            alt=""
                                            className="fup-deck-card-img"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                        <div className="fup-deck-card-lb">LB{horse.supportCardLimitBreaks[i] ?? 0}</div>
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
                            <img src={moodIcon} alt={moodIconName[horse.motivation]} title={moodIconName[horse.motivation]} className="fup-style-icon" />
                        </div>
                        {(horse.aptGround !== undefined || horse.aptDistance !== undefined || horse.aptStyle !== undefined) && (
                            <>
                                <div className="fup-divider" />
                                <div className="fup-aptitudes">
                                    {horse.aptGround !== undefined && (
                                        <div className="fup-apt-item">
                                            <span className="fup-apt-cat">{APT_GROUND_LABEL}</span>
                                            <img
                                                src={AssetLoader.getGradeIcon(GRADE_LETTERS[horse.aptGround]) ?? ""}
                                                alt={GRADE_LETTERS[horse.aptGround] ?? "?"}
                                                className="fup-apt-icon"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        </div>
                                    )}
                                    {horse.aptDistance !== undefined && (
                                        <div className="fup-apt-item">
                                            <span className="fup-apt-cat">{APT_DISTANCE_LABEL}</span>
                                            <img
                                                src={AssetLoader.getGradeIcon(GRADE_LETTERS[horse.aptDistance]) ?? ""}
                                                alt={GRADE_LETTERS[horse.aptDistance] ?? "?"}
                                                className="fup-apt-icon"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        </div>
                                    )}
                                    {horse.aptStyle !== undefined && (
                                        <div className="fup-apt-item">
                                            <span className="fup-apt-cat">{strategyName}</span>
                                            <img
                                                src={AssetLoader.getGradeIcon(GRADE_LETTERS[horse.aptStyle]) ?? ""}
                                                alt={GRADE_LETTERS[horse.aptStyle] ?? "?"}
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
