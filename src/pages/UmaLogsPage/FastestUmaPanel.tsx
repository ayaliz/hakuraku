import React, { useState } from "react";

import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";
import AssetLoader from "../../data/AssetLoader";
import UmaProfileModal from "../../features/umalogs/components/UmaProfileModal";
import { STRATEGY_COLORS } from "../MultiRacePage/components/WinDistributionCharts/constants";
import type { HorseEntry, SkillStats } from "../MultiRacePage/types";
import "../../features/umalogs/components/HorseProfile.css";

interface UmaFeatCardProps {
    horse: HorseEntry;
    label: string;
    displayValue: string;
    displayValueColor?: string;
    showRankIcon?: boolean;
    skillStats: Map<number, SkillStats>;
    strategyColors?: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
}

const UmaFeatCard: React.FC<UmaFeatCardProps> = ({
    horse,
    label,
    displayValue,
    displayValueColor,
    showRankIcon,
    skillStats,
    strategyColors,
    onViewReplays,
}) => {
    const [showModal, setShowModal] = useState(false);
    const activeStrategyColors = strategyColors ?? STRATEGY_COLORS;
    const strategyColor = activeStrategyColors[horse.strategy] ?? "#718096";
    const rankInfo = getRankIcon(horse.rankScore);
    const portraitUrl = AssetLoader.getCharaThumb(horse.cardId);
    const iconUrl = AssetLoader.getCharaIcon(horse.charaId);

    const handleImgError = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const element = event.currentTarget;
        if (element.src !== iconUrl) element.src = iconUrl;
        else element.style.display = "none";
    };

    return (
        <>
            <div role="button" onClick={() => setShowModal(true)} className="fastest-card">
                <div className="fastest-card-label">{label}</div>
                <div className="fastest-card-portrait" style={{ border: `2px solid ${strategyColor}` }}>
                    <img src={portraitUrl} alt={horse.charaName} onError={handleImgError} />
                </div>
                <div className="fastest-card-name">{horse.charaName}</div>
                <div className="fastest-card-value-row">
                    {showRankIcon && <img src={rankInfo.icon} alt={rankInfo.name} className="fup-rank-icon--sm" />}
                    <div className="fastest-card-time" style={displayValueColor ? { color: displayValueColor } : undefined}>
                        {displayValue}
                    </div>
                </div>
                <div className="fastest-card-hint">Click for profile →</div>
            </div>

            <UmaProfileModal
                horse={horse}
                label={label}
                show={showModal}
                skillStats={skillStats}
                strategyColors={strategyColors}
                onHide={() => setShowModal(false)}
                onViewReplays={onViewReplays}
            />
        </>
    );
};

export default UmaFeatCard;
