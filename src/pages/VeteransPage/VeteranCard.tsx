import React, { useState } from "react";
import './VeteransPage.css';
import { Veteran } from "./types";
import { aggregateFactors, getFactorCategory, calculateRaceBonus, calculateAffinity, calculatePairAffinity } from "../../data/VeteransHelper";
import { getCardName, formatCardName, getCharaImageUrl, getFactorColor } from "./VeteransUIHelper";
import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";

interface VeteranCardProps {
    veteran: Veteran;
    config: any;
    affinityCharaId?: number | null;
    legacyParent1?: Veteran | null;
    legacyParent2?: Veteran | null;
    onSelectForSlot?: (veteran: Veteran, slot: 'p1' | 'p2') => void;
}


const VeteranCard: React.FC<VeteranCardProps> = ({ veteran, config, affinityCharaId, legacyParent1, legacyParent2, onSelectForSlot }) => {
    const [showRaces, setShowRaces] = useState(false);

    const parent1 = veteran.succession_chara_array.find(p => p.position_id === 10);
    const parent2 = veteran.succession_chara_array.find(p => p.position_id === 20);
    const aggregated = aggregateFactors(veteran);
    const rankInfo = getRankIcon(veteran.rank_score);

    const renderStars = (level: number, isGolden: boolean) => {
        return <span style={{ color: isGolden ? '#FFD700' : 'inherit' }}>{'★'.repeat(level)}</span>;
    };

    return (
        <div className="vet-card">
            <div className="vet-portrait-col">
                <div className="vet-portrait-rank">
                    <img src={rankInfo.icon} alt={rankInfo.name} className="vet-rank-icon" />
                    {veteran.rank_score.toLocaleString()}
                </div>
                <img
                    className="vet-portrait-img"
                    src={getCharaImageUrl(veteran.card_id)}
                    alt={getCardName(veteran.card_id)}
                    onError={(e) => {
                        (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
                    }}
                />
                <div className="vet-parents-row">
                    {[parent1, parent2].map((parent, i) =>
                        parent ? (
                            <img
                                key={i}
                                className="vet-parent-img"
                                src={getCharaImageUrl(parent.card_id)}
                                alt={getCardName(parent.card_id)}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
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
                                        onClick={e => { e.stopPropagation(); onSelectForSlot(veteran, 'p1'); }}
                                    >
                                        Set as Legacy 1{hasMain ? ` (${fmt(delta1)} Affinity)` : ''}
                                    </button>
                                    <button
                                        className="vet-slot-select-btn"
                                        disabled={!hasMain}
                                        onClick={e => { e.stopPropagation(); onSelectForSlot(veteran, 'p2'); }}
                                    >
                                        Set as Legacy 2{hasMain ? ` (${fmt(delta2)} Affinity)` : ''}
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
                                            <span key={idx} className={`factor-pill${factor.isGold ? ' gold' : ''}`}>
                                                <span style={{ color: getFactorColor(factor.factorId, config) }}>
                                                    {factor.name}
                                                </span>
                                                <span className="pill-stars">
                                                    {renderStars(factor.level, factor.isGold)}
                                                </span>
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
                            <button className="race-toggle-btn" onClick={() => setShowRaces(s => !s)}>
                                {showRaces ? '▾' : '▸'} Race Wins ({entries.length})
                                {total > 0 && <span className="race-affinity-accent">&nbsp;+{total} Affinity with GPs</span>}
                            </button>
                            {showRaces && (
                                <div className="race-names-list">
                                    {entries.map((e, i) => (
                                        <span key={i} className="race-name-item">{e.name}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default VeteranCard;
