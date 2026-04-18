import React, { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import "./VeteransPage.css";
import "../UmaLogsPage/UmaLogsPage.css";
import { Veteran } from "./types";
import {
    aggregateFactors,
    calculateAffinity,
    calculatePairAffinity,
    calculateRaceBonus,
    calculateSparkChance,
    getFactorCategory,
} from "../../data/VeteransHelper";
import { getCardName, formatCardName, getCharaImageUrl, getFactorColor } from "./VeteransUIHelper";
import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";
import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";

function resolveIconSkillId(id: number): number {
    const s = String(id);
    return s.startsWith("9") ? parseInt("1" + s.slice(1), 10) : id;
}

const GRADE_LETTERS: Record<number, string> = { 1: "G", 2: "F", 3: "E", 4: "D", 5: "C", 6: "B", 7: "A", 8: "S" };
const STYLE_ICON_NAME: Record<number, string> = { 1: "front", 2: "pace", 3: "late", 4: "end", 5: "front" };
interface VeteranCardProps {
    veteran: Veteran;
    config: any;
    affinityCharaId?: number | null;
    legacyParent1?: Veteran | null;
    legacyParent2?: Veteran | null;
    onSelectForSlot?: (veteran: Veteran, slot: "p1" | "p2") => void;
    treeAffinities?: Record<"self" | "gp1" | "gp2", number>;
}

const VeteranCard: React.FC<VeteranCardProps> = ({
    veteran,
    config,
    affinityCharaId,
    legacyParent1,
    legacyParent2,
    onSelectForSlot,
    treeAffinities,
}) => {
    const [showRaces, setShowRaces] = useState(false);
    const [showProfile, setShowProfile] = useState(false);

    const parent1 = veteran.succession_chara_array.find(p => p.position_id === 10);
    const parent2 = veteran.succession_chara_array.find(p => p.position_id === 20);
    const aggregated = aggregateFactors(veteran);
    const rankInfo = getRankIcon(veteran.rank_score);
    const strategyColor = STRATEGY_COLORS[veteran.running_style] ?? "#718096";
    const strategyName = STRATEGY_NAMES[veteran.running_style] ?? `Strategy ${veteran.running_style}`;
    const portraitUrl = getCharaImageUrl(veteran.card_id);
    const fallbackIconUrl = AssetLoader.getCharaIcon(Math.floor(veteran.card_id / 100));
    const styleIcon = AssetLoader.getStatIcon(STYLE_ICON_NAME[veteran.running_style] ?? "front");
    const createdAtLabel = veteran.create_time ? new Date(veteran.create_time).toLocaleString() : "Unknown";
    const powerValue = veteran.pow ?? veteran.power ?? 0;

    const skillIconMap = useMemo<Map<number, number>>(() => {
        const map = new Map<number, number>();
        for (const [id, skill] of Object.entries(UMDatabaseWrapper.skills)) {
            if (skill.iconId) map.set(+id, skill.iconId);
        }
        return map;
    }, []);

    const supportCards = useMemo(
        () => [...(veteran.support_card_list ?? [])].sort((a, b) => a.position - b.position),
        [veteran.support_card_list],
    );

    const skillIds = useMemo(
        () => Array.from(new Set((veteran.skill_array ?? []).map((skill) => skill.skill_id))),
        [veteran.skill_array],
    );

    const totalSkillPoints = useMemo(() => {
        let total = 0;
        for (const skillId of skillIds) {
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
    }, [skillIds]);

    const aptitudeItems = useMemo(() => {
        return [
            { label: "Turf", grade: veteran.proper_ground_turf },
            { label: "Dirt", grade: veteran.proper_ground_dirt },
            { label: "Sprint", grade: veteran.proper_distance_short },
            { label: "Mile", grade: veteran.proper_distance_mile },
            { label: "Medium", grade: veteran.proper_distance_middle },
            { label: "Long", grade: veteran.proper_distance_long },
            { label: "Front", grade: veteran.proper_running_style_nige },
            { label: "Pace", grade: veteran.proper_running_style_senko },
            { label: "Late", grade: veteran.proper_running_style_sashi },
            { label: "End", grade: veteran.proper_running_style_oikomi },
        ];
    }, [veteran]);

    const renderStars = (level: number, isGolden: boolean) => {
        return <span style={{ color: isGolden ? "#FFD700" : "inherit" }}>{"★".repeat(level)}</span>;
    };

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const el = e.currentTarget;
        if (el.src !== fallbackIconUrl) el.src = fallbackIconUrl;
        else el.style.display = "none";
    };

    const renderSkillChip = (id: number) => {
        const name = UMDatabaseWrapper.skillNameWithEnglishFallback(id);
        const iconId = skillIconMap.get(resolveIconSkillId(id));
        const iconUrl = iconId ? AssetLoader.getSkillIcon(iconId) : null;
        return (
            <div
                key={id}
                title={`[${id}] ${name}`}
                className="fup-skill-chip fup-skill-chip--learned"
            >
                {iconUrl && (
                    <img
                        src={iconUrl}
                        alt=""
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                )}
                <span className="fup-skill-chip-name">{name}</span>
            </div>
        );
    };

    return (
        <>
            <div
                className="vet-card vet-card--clickable"
                role="button"
                tabIndex={0}
                onClick={() => setShowProfile(true)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setShowProfile(true);
                    }
                }}
            >
                <div className="vet-portrait-col">
                    <div className="vet-portrait-rank">
                        <img src={rankInfo.icon} alt={rankInfo.name} className="vet-rank-icon" />
                        {veteran.rank_score.toLocaleString()}
                    </div>
                    {treeAffinities && (
                        <div className="vet-portrait-self-aff">
                            {treeAffinities.self} Affinity
                        </div>
                    )}
                    <img
                        className="vet-portrait-img"
                        src={portraitUrl}
                        alt={getCardName(veteran.card_id)}
                        onError={handleImgError}
                    />
                    <div className="vet-parents-row">
                        {[parent1, parent2].map((parent, i) =>
                            parent ? (
                                <div key={i} className="vet-parent-item">
                                    <img
                                        className="vet-parent-img"
                                        src={getCharaImageUrl(parent.card_id)}
                                        alt={getCardName(parent.card_id)}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                    {treeAffinities && (
                                        <span className="vet-parent-gp-aff">
                                            {i === 0 ? treeAffinities.gp1 : treeAffinities.gp2} Aff
                                        </span>
                                    )}
                                </div>
                            ) : null
                        )}
                    </div>
                </div>

                <div className="vet-content-col">
                    <div className="vet-header">
                        <span className="vet-name">
                            {formatCardName(getCardName(veteran.card_id))}
                        </span>
                        <div className="vet-meta-badges">
                            {onSelectForSlot && (() => {
                                const hasMain = affinityCharaId != null;
                                const baseAff = hasMain ? calculateAffinity(veteran, affinityCharaId!) : 0;
                                const rawAff1 = baseAff + (hasMain && legacyParent2 ? calculatePairAffinity(veteran, legacyParent2) : 0);
                                const rawAff2 = baseAff + (hasMain && legacyParent1 ? calculatePairAffinity(legacyParent1, veteran) : 0);
                                const pairAff12 = hasMain && legacyParent1 && legacyParent2 ? calculatePairAffinity(legacyParent1, legacyParent2) : 0;
                                const currentP1 = hasMain && legacyParent1
                                    ? calculateAffinity(legacyParent1, affinityCharaId!) + pairAff12
                                    : null;
                                const currentP2 = hasMain && legacyParent2
                                    ? calculateAffinity(legacyParent2, affinityCharaId!) + pairAff12
                                    : null;
                                const delta1 = currentP1 !== null ? rawAff1 - currentP1 : rawAff1;
                                const delta2 = currentP2 !== null ? rawAff2 - currentP2 : rawAff2;
                                const fmt = (n: number) => n >= 0 ? `+${n}` : `${n}`;
                                return (
                                    <>
                                        <button
                                            className="vet-slot-select-btn"
                                            disabled={!hasMain}
                                            onClick={e => { e.stopPropagation(); onSelectForSlot(veteran, "p1"); }}
                                        >
                                            Set as Legacy 1{hasMain ? ` (${fmt(delta1)} Affinity)` : ""}
                                        </button>
                                        <button
                                            className="vet-slot-select-btn"
                                            disabled={!hasMain}
                                            onClick={e => { e.stopPropagation(); onSelectForSlot(veteran, "p2"); }}
                                        >
                                            Set as Legacy 2{hasMain ? ` (${fmt(delta2)} Affinity)` : ""}
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                    {aggregated.length === 0 ? (
                        <span className="vet-no-factors">No factors</span>
                    ) : (
                        <div className="factor-groups">
                            {[1, 2, 3, 4, 5].map(catId => {
                                const group = aggregated.filter(f => getFactorCategory(f.factorId) === catId);
                                if (group.length === 0) return null;
                                return (
                                    <div className="factor-group" key={catId}>
                                        <div className="factor-pills">
                                            {group.map((factor, idx) => (
                                                <span key={idx} className={`factor-pill${factor.isGold ? " gold" : ""}`}>
                                                    <span style={{ color: getFactorColor(factor.factorId, config) }}>
                                                        {factor.name}
                                                    </span>
                                                    <span className="pill-stars">
                                                        {renderStars(factor.level, factor.isGold)}
                                                    </span>
                                                    {treeAffinities && (() => {
                                                        const chance = calculateSparkChance(
                                                            factor.category,
                                                            factor.factorId,
                                                            factor.level,
                                                            treeAffinities[factor.sourceSlot],
                                                        );
                                                        return chance !== null ? (
                                                            <span className="vet-factor-chance">({chance.toFixed(2)}%)</span>
                                                        ) : null;
                                                    })()}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {veteran.win_saddle_id_array && veteran.win_saddle_id_array.length > 0 && (() => {
                        const { entries, total } = calculateRaceBonus(veteran);
                        return (
                            <div className="race-wins-section">
                                <button
                                    className="race-toggle-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRaces(s => !s);
                                    }}
                                >
                                    {showRaces ? "Hide" : "Show"} Race Wins ({entries.length})
                                    {total > 0 && <span className="race-affinity-accent">&nbsp;+{total} Affinity with GPs</span>}
                                </button>
                                {showRaces && (
                                    <div className="race-names-list">
                                        {entries.map((entry, i) => (
                                            <span key={i} className="race-name-item">{entry.name}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            <Modal show={showProfile} onHide={() => setShowProfile(false)} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title className="fup-modal-title">Veteran - Full Profile</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="fup-identity">
                        <div className="fup-identity-left">
                            <div className="fup-portrait" style={{ border: `3px solid ${strategyColor}` }}>
                                <img src={portraitUrl} alt={getCardName(veteran.card_id)} onError={handleImgError} />
                            </div>
                            <div className="fup-portrait-caption">{formatCardName(getCardName(veteran.card_id))}</div>
                        </div>

                        <div className="fup-identity-info">
                            <div className="fup-rank-row">
                                <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--md" />
                                <span className="fup-rank-score">{veteran.rank_score.toLocaleString()}</span>
                            </div>
                            <div className="fup-training-wins">Career mode wins: {veteran.wins.toLocaleString()}</div>
                            <div className="vet-fup-meta">
                                Scenario {veteran.scenario_id} - Created {createdAtLabel}
                            </div>
                        </div>

                        {supportCards.length > 0 && (
                            <div className="fup-deck-panel">
                                <div className="fup-side-panel-title">Deck</div>
                                <div className="fup-deck">
                                    {supportCards.map((card) => (
                                        <div key={card.position} className="fup-deck-card">
                                            <img
                                                src={AssetLoader.getSupportCardIcon(card.support_card_id)}
                                                alt=""
                                                className="fup-deck-card-img"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                            <div className="fup-deck-card-lb">LB{card.limit_break_count ?? 0}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="fup-stat-row">
                        <div className="fup-stats">
                            <span className="fup-stat-item">
                                <img src={AssetLoader.getStatIcon("speed")} alt="Speed" width={20} height={20} />
                                <span className="fup-stat-value">{veteran.speed}</span>
                            </span>
                            <span className="fup-stat-item">
                                <img src={AssetLoader.getStatIcon("stamina")} alt="Stamina" width={20} height={20} />
                                <span className="fup-stat-value">{veteran.stamina}</span>
                            </span>
                            <span className="fup-stat-item">
                                <img src={AssetLoader.getStatIcon("power")} alt="Power" width={20} height={20} />
                                <span className="fup-stat-value">{powerValue}</span>
                            </span>
                            <span className="fup-stat-item">
                                <img src={AssetLoader.getStatIcon("guts")} alt="Guts" width={20} height={20} />
                                <span className="fup-stat-value">{veteran.guts}</span>
                            </span>
                            <span className="fup-stat-item">
                                <img src={AssetLoader.getStatIcon("wit")} alt="Wit" width={20} height={20} />
                                <span className="fup-stat-value">{veteran.wiz}</span>
                            </span>
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
                    </div>

                    <div className="fup-skills-section">
                        <div className="fup-skills-heading fup-skills-heading--learned">Aptitudes</div>
                        <div className="vet-fup-apt-grid">
                            {aptitudeItems.map((item) => {
                                const grade = item.grade ?? 0;
                                const gradeLetter = GRADE_LETTERS[grade];
                                const iconUrl = gradeLetter ? AssetLoader.getGradeIcon(gradeLetter) : null;
                                return (
                                    <div key={item.label} className="vet-fup-apt-card">
                                        <span className="vet-fup-apt-label">{item.label}</span>
                                        {iconUrl ? (
                                            <img
                                                src={iconUrl}
                                                alt={gradeLetter}
                                                className="vet-fup-apt-icon"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ) : (
                                            <span className="vet-fup-apt-fallback">-</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {skillIds.length > 0 && (
                        <div className="fup-skills-section">
                            <div className="fup-skills-heading fup-skills-heading--learned">
                                Skills ({skillIds.length})
                            </div>
                            <div className="fup-skills-list">
                                {skillIds.map(renderSkillChip)}
                            </div>
                        </div>
                    )}
                </Modal.Body>
            </Modal>
        </>
    );
};

export default VeteranCard;
